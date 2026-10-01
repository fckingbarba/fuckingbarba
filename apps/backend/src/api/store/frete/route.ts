import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { cotarFrete } from "../../../lib/cotar-frete"
import { criarLimite } from "../../../lib/limite"
import { quemPede } from "../../../lib/quem-pede"
import { soDigitos } from "../../../modules/frenet/client"

/**
 * POST /store/frete — quanto custa mandar ISTO pra ESTE CEP.
 *
 * ┌─ POR QUE UMA ROTA NOSSA, SE O MEDUSA JÁ TEM UMA ───────────────────────┐
 * │ A do Medusa (`/store/shipping-options/:id/calculate`) exige `cart_id`. │
 * │ Serve pro checkout, onde o carrinho existe — e não serve pra           │
 * │ calculadora de CEP da PÁGINA DE PRODUTO, onde ele não existe: quem     │
 * │ está olhando o produto ainda não pôs nada na sacola.                   │
 * │                                                                        │
 * │ A saída "óbvia" seria criar um carrinho por trás a cada CEP digitado.  │
 * │ Isso enche o banco de carrinhos fantasmas, envenena qualquer relatório │
 * │ de abandono e transforma "olhei o frete" em "quase comprou".           │
 * │                                                                        │
 * │ Então esta rota cota SEM carrinho: recebe variantes e quantidades,     │
 * │ soma o valor pelo preço de verdade (o da região NA QUANTIDADE pedida,  │
 * │ e não o que o navegador mandar) e devolve as duas faixas.              │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ E DEVOLVE O QUE O CHECKOUT NÃO CONSEGUE DEVOLVER ─────────────────────┐
 * │ TRANSPORTADORA E PRAZO. A rota do Medusa responde um número e mais     │
 * │ nada — o contrato do provedor é `{ calculated_amount }` —, então o     │
 * │ "Correios PAC · 8 dias úteis" que a Frenet manda se perdia no caminho. │
 * │ Aqui não há esse funil, e o cliente vê quem entrega e em quantos dias. │
 * │                                                                        │
 * │ E o PREÇO CHEIO de quem ganhou frete grátis: o Medusa devolve o preço  │
 * │ que vale agora, zero, e esquece o resto. A sacola risca o cheio ao     │
 * │ lado do "Grátis", e esse número só existe aqui.                        │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * O PREÇO DAQUI E O DO CHECKOUT SÃO O MESMO NÚMERO porque saem das mesmas
 * duas funções: `escolherFaixas` escolhe a mais barata e a mais rápida, e
 * `aplicarPolitica` aplica o frete grátis. Reimplementar qualquer uma das
 * duas aqui seria a vitrine prometendo um valor e o carrinho cobrando outro.
 *
 * E A PERGUNTA À FRENET É SEMPRE A DE UM CARRINHO. Com `cart_id` (a sacola),
 * a do carrinho de verdade; sem ele (a PDP), a do carrinho que estes itens
 * formariam — a mesma variante numa linha só, o preço na quantidade da
 * linha. Nos dois casos o valor declarado e os itens saem das mesmas funções
 * do provider (`somaDosProdutos` e `itensPraCotar`): a lista da gaveta e o
 * frete pendurado são UMA cotação só, e o frete grátis daqui é decidido
 * sobre o que o carrinho cobra. O porquê está lá embaixo, onde as linhas
 * são montadas.
 */

type ItemPedido = { variante_id?: unknown; quantidade?: unknown }

/*
  O TAMANHO DE UMA PERGUNTA E QUANTAS POR VEZ (auditoria de 27/09).

  Cada quantidade diferente vira uma consulta ao banco, todas juntas, e cada
  pergunta sem carrinho vira uma viagem à Frenet. Sem teto, uma pergunta só
  ocupava as conexões do banco da loja inteira. Então: até 30 produtos
  diferentes (a sacola de verdade tem os 15 do catálogo, no máximo) e 100
  linhas; e um limite por quem pergunta, na memória, como os outros
  (`lib/limite.ts`): 200 em 10 minutos pra quem vem pela loja (o IP da pessoa,
  assinado — `lib/quem-pede.ts`), 300 pra quem vem sem a assinatura (se a
  assinatura faltar por configuração, é a Vercel inteira nesse balde) e
  5.000 pra loja toda, que é o teto do estrago na Frenet.
*/
const MAX_LINHAS = 100
const MAX_VARIANTES = 30
const DEZ_MINUTOS = 10 * 60 * 1000
const POR_VISITANTE = { limite: 200, ms: DEZ_MINUTOS }
const POR_IP_SEM_ASSINATURA = { limite: 300, ms: DEZ_MINUTOS }
const DA_LOJA = { limite: 5000, ms: DEZ_MINUTOS }
const limite = criarLimite()

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)
  const corpo = (req.body ?? {}) as {
    cep?: unknown
    itens?: unknown
    region_id?: unknown
    cart_id?: unknown
  }

  const cep = soDigitos(String(corpo.cep ?? ""))
  if (cep.length !== 8) {
    res.status(400).json({ erro: "cep_invalido", mensagem: "O CEP tem oito dígitos." })
    return
  }

  if (Array.isArray(corpo.itens) && corpo.itens.length > MAX_LINHAS) {
    res.status(400).json({ erro: "itens_demais", mensagem: "Itens demais pra calcular." })
    return
  }
  const pedidos: { id: string; quantidade: number }[] = (
    Array.isArray(corpo.itens) ? (corpo.itens as ItemPedido[]) : []
  ).flatMap((i) => {
    const id = typeof i?.variante_id === "string" ? i.variante_id : ""
    const q = Math.trunc(Number(i?.quantidade ?? 1))
    return id && Number.isFinite(q) && q > 0 ? [{ id, quantidade: Math.min(q, 99) }] : []
  })

  if (!pedidos.length) {
    res.status(400).json({ erro: "sem_itens", mensagem: "Nada pra calcular." })
    return
  }
  if (new Set(pedidos.map((p) => p.id)).size > MAX_VARIANTES) {
    res.status(400).json({ erro: "itens_demais", mensagem: "Itens demais pra calcular." })
    return
  }

  const quem = quemPede(req)
  const porQuem = quem.assinado ? POR_VISITANTE : POR_IP_SEM_ASSINATURA
  if (!limite.cabe(quem.chave, porQuem) || !limite.cabe("loja", DA_LOJA)) {
    res
      .status(429)
      .json({ erro: "limite", mensagem: "Muitas cotações seguidas. Tenta daqui a pouco." })
    return
  }
  limite.contar(quem.chave, porQuem)
  limite.contar("loja", DA_LOJA)

  /* Só a sacola manda — a PDP não tem carrinho. Aqui se confere o formato. */
  const carrinho =
    typeof corpo.cart_id === "string" && /^cart_[A-Za-z0-9]+$/.test(corpo.cart_id)
      ? corpo.cart_id
      : null

  try {
    const r = await cotarFrete(req.scope, {
      cep,
      pedidos,
      regiaoId: corpo.region_id,
      carrinho,
    })
    if (r.ok) res.json({ frete: r.frete })
    else res.status(r.status).json(r.corpo)
  } catch (e) {
    logger.error(`[frete] ${e instanceof Error ? e.message : e}`)
    res.status(500).json({ erro: "falhou" })
  }
}
