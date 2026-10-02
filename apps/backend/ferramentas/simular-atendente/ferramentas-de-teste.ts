import { emReais } from "../../src/lib/emails/moldura"
import { faixasComPromocao, totalDaFaixa } from "../../src/lib/precos-por-quantidade"
import { detalheDoProduto, type ProdutoDoAtendente } from "../../src/lib/whatsapp/catalogo"
import { linkDoCheckout, type ResultadoDaFerramenta } from "../../src/lib/whatsapp/ferramentas"
import { pedidoEmTexto, type PedidoNoWhatsapp } from "../../src/lib/whatsapp/pedidos"

/**
 * AS FERRAMENTAS NA SIMULAÇÃO — sem banco. A `ver_produto` é a de verdade
 * (`detalheDoProduto`, com o catálogo lido do site). As de pedido devolvem o
 * mesmo texto das de verdade (`pedidoEmTexto` e as frases de
 * `lib/whatsapp/ferramentas.ts`) pro cliente de teste. A sacola e o frete
 * fazem a mesma conta da loja (as faixas de quantidade e o frete grátis a
 * partir de R$ 139,90), com o frete de exemplo por região.
 *
 * Mudou uma frase numa ferramenta de verdade: mude aqui também, senão a
 * simulação mede outra coisa.
 */

export const CLIENTE = {
  nome: "Lucas Andrade",
  telefone: "5500900001111",
  email: "lucas.andrade.simulacao@teste.fuckingbarba.dev",
  enviado: 3322,
  pix: 3323,
  rastreio: "QB482915736BR",
}

/** As falas dos cenários com os {enviado}, {pix}, {email} e {rastreio} do cliente de teste. */
export const preencher = (s: string) =>
  s
    .replaceAll("{enviado}", String(CLIENTE.enviado))
    .replaceAll("{pix}", String(CLIENTE.pix))
    .replaceAll("{email}", CLIENTE.email)
    .replaceAll("{rastreio}", CLIENTE.rastreio)

const PISO_DO_FRETE_GRATIS = 139.9
const ULID = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
const id = (prefixo: string) =>
  `${prefixo}_01K${Array.from({ length: 23 }, () => ULID[Math.floor(Math.random() * 32)]).join("")}`

/** Os dois pedidos do cliente de teste, como `lerPedidosDoWhatsapp` devolveria. */
export function pedidosDoCliente(agora: Date): PedidoNoWhatsapp[] {
  const hora = (h: number) => new Date(agora.getTime() - h * 3_600_000)
  return [
    {
      id: "order_01K6SIMULACAOPIX0000000000",
      numero: CLIENTE.pix,
      email: CLIENTE.email,
      feitoEm: hora(1),
      itens: [
        { nome: "Shampoo para Barba 120ml", quantidade: 1 },
        { nome: "Óleo para Barba 30ml", quantidade: 1 },
      ],
      total: 128.5,
      situacao: "pix",
      foiPago: false,
      pix: {
        codigo:
          "00020101021226840014br.gov.bcb.pix2562pix.exemplo.invalid/simulacao5204000053039865406128.505802BR6304ABCD",
        vence: hora(-23),
      },
      envios: [],
    },
    {
      id: "order_01K6SIMULACAOENVIADO00000",
      numero: CLIENTE.enviado,
      email: CLIENTE.email,
      feitoEm: hora(3),
      itens: [{ nome: "Fator de Crescimento para Barba 30ml", quantidade: 1 }],
      total: 103.6,
      situacao: "enviado",
      foiPago: true,
      pix: null,
      envios: [
        {
          codigo: CLIENTE.rastreio,
          url: `https://rastreamento.correios.com.br/app/index.php?objeto=${CLIENTE.rastreio}`,
          transportadora: "Correios",
          situacao: "postado",
          alerta: null,
          ultimo: { descricao: "Postado", local: null, quando: hora(2) },
        },
      ],
    },
  ]
}

/** O resumo do cliente de teste, como `resumoDoCliente` escreveria. */
export const RESUMO_DO_CLIENTE = [
  "- Primeiro nome nas compras: Lucas",
  "- 2 pedido(s) na loja nova com este telefone (a situação: ver_meus_pedidos).",
  "- Já comprou: Fator de Crescimento para Barba 30ml (a última hoje)",
  "- Está no dia 0 do tratamento com o Fator (a meta é o dia 90); o próximo marco: Semanas 1 e 2, Textura.",
].join("\n")

type Contexto = {
  produtos: ProdutoDoAtendente[]
  cliente: boolean
  loja: string
  agora: Date
  depois: string[]
}

function itensDe(
  produtos: ProdutoDoAtendente[],
  itens: unknown
): { ok: true; itens: { p: ProdutoDoAtendente; q: number }[] } | { ok: false; motivo: string } {
  const lista = (Array.isArray(itens) ? itens : []) as { produto?: unknown; quantidade?: unknown }[]
  const pedidos = lista.flatMap((i) => {
    const handle = typeof i?.produto === "string" ? i.produto.trim().toLowerCase() : ""
    const q = Math.trunc(Number(i?.quantidade))
    return handle && q > 0 ? [{ handle, q: Math.min(q, 10) }] : []
  })
  if (!pedidos.length || pedidos.length > 10)
    return { ok: false, motivo: "Diga quais produtos e quantas unidades." }
  const porHandle = new Map(produtos.map((p) => [p.handle, p]))
  const desconhecidos = pedidos.filter((p) => !porHandle.has(p.handle))
  if (desconhecidos.length)
    return {
      ok: false,
      motivo: `Não existe produto com o código ${desconhecidos.map((d) => `"${d.handle}"`).join(", ")}: use o código da lista de produtos.`,
    }
  const quantos = new Map<string, number>()
  for (const p of pedidos) quantos.set(p.handle, (quantos.get(p.handle) ?? 0) + p.q)
  return { ok: true, itens: [...quantos].map(([h, q]) => ({ p: porHandle.get(h)!, q })) }
}

/** O preço de uma unidade levando `q`, pela faixa da lista "Desconto por quantidade". */
function unitario(preco: number, q: number): number {
  const f = [...faixasComPromocao()]
    .reverse()
    .find((x) => q >= x.unidades && (x.ate === null || q <= x.ate))
  if (!f) return preco
  const total = totalDaFaixa(preco, f.unidades, f.desconto)
  return total === null ? preco : total / 100 / f.unidades
}

/** O frete de exemplo pelo 1º dígito do CEP: [econômico, transportadora, prazo, expresso, …]. */
const FRETES: Record<string, [number, string, string, number, string, string]> = {
  "0": [16.9, "Loggi", "2 a 3", 24.9, "Correios", "1 a 2"],
  "1": [18.4, "Loggi", "3 a 4", 27.9, "Correios", "2"],
  "2": [21.9, "Jadlog", "4 a 6", 33.5, "Correios", "2 a 3"],
  "3": [22.6, "Jadlog", "4 a 6", 34.1, "Correios", "2 a 3"],
  "4": [29.8, "Correios", "7 a 9", 49.9, "Correios", "3 a 4"],
  "5": [32.4, "Correios", "8 a 10", 56.7, "Correios", "3 a 5"],
  "6": [36.9, "Correios", "9 a 12", 64.2, "Correios", "4 a 6"],
  "7": [27.5, "Jadlog", "6 a 8", 45.8, "Correios", "2 a 4"],
  "8": [17.9, "Jadlog", "2 a 4", 26.4, "Correios", "1 a 2"],
  "9": [21.3, "Jadlog", "4 a 5", 31.9, "Correios", "2 a 3"],
}

export function usarFerramentaDeTeste(
  nome: string,
  input: unknown,
  ctx: Contexto
): ResultadoDaFerramenta | null {
  const entrada = (input ?? {}) as Record<string, unknown>
  const meus = ctx.cliente ? pedidosDoCliente(ctx.agora) : []
  switch (nome) {
    case "ver_produto": {
      const handle = String(entrada.produto ?? "")
        .trim()
        .toLowerCase()
      const p = ctx.produtos.find((x) => x.handle === handle)
      return p
        ? { conteudo: detalheDoProduto(p, ctx.produtos) }
        : {
            conteudo: `Não existe produto com o código "${handle}": use o código da lista de produtos.`,
            erro: true,
          }
    }
    case "ver_meus_pedidos":
      if (!meus.length)
        return {
          conteudo:
            "Nenhum pedido com o telefone deste WhatsApp. Se a pessoa comprou com outro telefone, peça o número do pedido e o e-mail da compra e use ver_pedido.",
        }
      return {
        conteudo: meus
          .map((p) =>
            [
              pedidoEmTexto(p, { dono: true }),
              ...(p.pix
                ? [
                    "Se a pessoa pedir o código ou quiser pagar: mandar_codigo_do_pix. Se não, ofereça.",
                  ]
                : []),
            ].join("\n")
          )
          .join("\n\n"),
      }
    case "ver_pedido": {
      const n = Math.trunc(Number(entrada.numero))
      const email = String(entrada.email ?? "")
        .trim()
        .toLowerCase()
      if (!n || !email)
        return { conteudo: "Preciso do número do pedido e do e-mail da compra.", erro: true }
      const p = pedidosDoCliente(ctx.agora).find((x) => x.numero === n)
      if (!p || p.email !== email)
        return {
          conteudo:
            "Não achei um pedido com esse número e esse e-mail. Confira os dois com a pessoa (o número está no e-mail da compra).",
        }
      return { conteudo: pedidoEmTexto(p, { dono: ctx.cliente }) }
    }
    case "mandar_codigo_do_pix": {
      const p = meus.find((x) => x.numero === Math.trunc(Number(entrada.numero)))
      if (!p)
        return {
          conteudo:
            "Esse pedido não é deste telefone. O código do Pix só vai pro WhatsApp do telefone da compra.",
          erro: true,
        }
      if (!p.pix) return { conteudo: "Este pedido não está esperando Pix." }
      ctx.depois.push(p.pix.codigo)
      const vence = new Intl.DateTimeFormat("pt-BR", {
        timeZone: "America/Sao_Paulo",
        hour: "2-digit",
        minute: "2-digit",
      }).format(p.pix.vence)
      return {
        conteudo: `O código vai numa mensagem separada, logo depois da sua resposta. Ele vale até ${vence}. Diga à pessoa pra copiar a próxima mensagem e colar no app do banco, em "Pix copia e cola". Não escreva o código.`,
      }
    }
    case "refazer_pedido": {
      if (!ctx.cliente)
        return {
          conteudo:
            "Este telefone não tem compra na loja nova. Refazer só funciona pro WhatsApp do telefone da compra: monte a sacola (montar_sacola).",
          erro: true,
        }
      const n = Math.trunc(Number(entrada.numero)) || 0
      const p = n ? meus.find((x) => x.numero === n) : meus.find((x) => x.foiPago)
      if (!p)
        return {
          conteudo: `O pedido #${n} não é deste telefone. Refazer só funciona pras compras do telefone deste WhatsApp.`,
          erro: true,
        }
      if (p.situacao === "pix")
        return {
          conteudo:
            "Esse pedido ainda está esperando o Pix: mande o código (mandar_codigo_do_pix).",
        }
      return {
        conteudo: `Link pra refazer o pedido #${p.numero} (${p.itens.map((i) => `${i.quantidade}x ${i.nome}`).join(", ")}), com o endereço dele; o que esgotou fica de fora; vale 7 dias: ${linkDoCheckout(ctx.loja, `repor-${id("order")}`, ctx.agora)}`,
      }
    }
    case "montar_sacola": {
      const r = itensDe(ctx.produtos, entrada.itens)
      if (!r.ok) return { conteudo: r.motivo, erro: true }
      let total = 0
      const linhas = r.itens.map(({ p, q }) => {
        const u = unitario(p.variantes[0].preco ?? 0, q)
        total += u * q
        return `- ${q}x ${p.nome} (${emReais(u)} cada)`
      })
      linhas.push(`Total dos produtos: ${emReais(total)} (o frete é escolhido no checkout)`)
      return {
        conteudo: [
          "Sacola montada:",
          ...linhas,
          `Link pra pagar (abre o checkout com a sacola pronta; vale 7 dias): ${linkDoCheckout(ctx.loja, id("cart"), ctx.agora)}`,
          ...(ctx.cliente ? ["O checkout já abre com o endereço da última compra dele."] : []),
        ].join("\n"),
      }
    }
    case "cotar_frete": {
      const cep = String(entrada.cep ?? "").replace(/\D/g, "")
      if (cep.length !== 8)
        return { conteudo: "O CEP tem 8 dígitos: peça de novo à pessoa.", erro: true }
      const r = itensDe(ctx.produtos, entrada.itens)
      if (!r.ok) return { conteudo: r.motivo, erro: true }
      const subtotal = r.itens.reduce(
        (s, { p, q }) => s + unitario(p.variantes[0].preco ?? 0, q) * q,
        0
      )
      const unidades = r.itens.reduce((s, { q }) => s + q, 0)
      const [eco, tEco, pEco, exp, tExp, pExp] = FRETES[cep[0]]
      const extra = (unidades - 1) * 1.5
      const dias = (t: string) => `${t} ${t === "1" ? "dia útil" : "dias úteis"}`
      const gratis = subtotal >= PISO_DO_FRETE_GRATIS
      return {
        conteudo: [
          `Frete pro CEP ${cep.slice(0, 5)}-${cep.slice(5)}, com ${r.itens.map(({ p, q }) => `${q}x ${p.nome}`).join(", ")}:`,
          `- Econômico: ${gratis ? `GRÁTIS (seria ${emReais(eco + extra)})` : emReais(eco + extra)}, ${tEco}, ${dias(pEco)} depois da postagem`,
          `- Expresso: ${emReais(exp + extra)}, ${tExp}, ${dias(pExp)} depois da postagem`,
          ...(gratis
            ? []
            : [`Faltam ${emReais(PISO_DO_FRETE_GRATIS - subtotal)} em produtos pro frete grátis.`]),
          "O valor final aparece no checkout, com o endereço completo.",
        ].join("\n"),
      }
    }
    default:
      return null
  }
}
