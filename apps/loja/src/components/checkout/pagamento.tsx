"use client"

import Image from "next/image"
import Link from "next/link"
import { useActionState, useOptimistic, useState, useTransition } from "react"
import { Cadeado, Caminhao, Escudo, Raio, Relogio } from "@/components/icones"
import { BANDEIRAS, FORMAS, GARANTIAS, type FormaDePagamento } from "@/conteudo/checkout"
import { alternarBump, finalizar } from "@/lib/acoes/checkout"
import {
  bandeiraDe,
  cvvOk,
  luhn,
  mascararCartao,
  mascararValidade,
  validadeOk,
  NOMES_DAS_BANDEIRAS,
} from "@/lib/cartao"
import {
  ESTADO_INICIAL,
  type CheckoutVisivel,
  type Oferta,
  type ProvedorDePagamento,
} from "@/lib/checkout-visivel"
import { emReais } from "@/lib/formato"
import { CHECKOUT_ABERTO, PARCELAS_SEM_JUROS } from "@/lib/site"
import { Campo } from "./campo"
import { Painel, Recado, type PropsDaEtapa } from "./etapas"

/**
 * PASSO 3 — pagamento, e o pedido.
 *
 * ┌─ O QUE COBRA E O QUE SÓ APARECE ───────────────────────────────────────┐
 * │ Quem COBRA é o provedor que o Medusa devolve. Hoje só existe o        │
 * │ `pp_system_default`, que APROVA SEM COBRAR — serve pra deixar o fluxo │
 * │ de pé, não pra vender.                                                │
 * │                                                                        │
 * │ Pix, cartão e boleto estão desenhados e funcionando (máscara, Luhn,   │
 * │ bandeira, parcelas), e aparecem SÓ ENQUANTO `CHECKOUT_ABERTO` for     │
 * │ `false` — ou seja, enquanto a loja não está mandando cliente pra cá.  │
 * │ No dia em que a chave virar sem o Pagar.me, eles somem sozinhos e     │
 * │ fica o meio que cobra: a tela não tem como ir ao ar pedindo CVV sem   │
 * │ cobrar nada.                                                          │
 * │                                                                        │
 * │ E o número do cartão NÃO SAI DO NAVEGADOR: os campos não têm `name`,  │
 * │ então não entram no FormData da ação. É assim que vai ser com o       │
 * │ Pagar.me também — quem tokeniza é o navegador.                        │
 * └────────────────────────────────────────────────────────────────────────┘
 */

const ICONES = { escudo: Escudo, cadeado: Cadeado, caminhao: Caminhao, relogio: Relogio }

type Props = PropsDaEtapa & {
  checkout: CheckoutVisivel
  provedores: ProvedorDePagamento[]
  bump: Oferta | null
}

// `aoSalvar` é desestruturado e não usado de propósito: este passo não fecha
// quando dá certo — a ação redireciona pra tela de obrigado e esta página
// deixa de existir. Tirar da prop quebraria a assinatura comum das etapas.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function Pagamento({ checkout, provedores, bump, aoSalvar, ...casca }: Props) {
  const [estado, acao, enviando] = useActionState(finalizar, ESTADO_INICIAL)
  const [forma, setForma] = useState<FormaDePagamento["id"]>("pix")

  const provedor = provedores[0]
  const simbolico = provedores.some((p) => p.simbolico)
  const pronto = Boolean(checkout.email && checkout.entrega.cep && checkout.freteEscolhido)

  return (
    <Painel
      etapa="pagamento"
      aberta={casca.aberta}
      dica="Último passo. Escolhe como pagar e pronto."
    >
      <ul className="confia" aria-label="Por que comprar com a gente">
        {GARANTIAS.map((g) => {
          const Icone = ICONES[g.icone]
          return (
            <li key={g.texto}>
              <Icone aria-hidden="true" />
              <span>{g.texto}</span>
            </li>
          )
        })}
      </ul>

      {provedores.length === 0 ? (
        <p className="erros-envio" role="alert">
          Nenhuma forma de pagamento disponível agora. Chama a gente no WhatsApp que a gente fecha o
          pedido por lá.
        </p>
      ) : (
        <form id="form-pagamento" action={acao} noValidate>
          {/* O provedor que o Medusa vai usar de fato. Escondido porque, com
              um provedor só, pedir pra pessoa escolher entre uma opção é
              cerimônia — e porque o que ela escolhe acima é a FORMA, que só
              vira provedor diferente quando o Pagar.me entrar. */}
          <input type="hidden" name="provedor" value={provedor?.id ?? ""} />

          <Formas forma={forma} aoTrocar={setForma} total={checkout.total} />

          {bump ? <Bump bump={bump} marcado={checkout.bumpMarcado} /> : null}

          {simbolico ? (
            <p className="pagamento__aviso">
              <b>Este pedido não é cobrado agora.</b> Ele entra na fila e a gente chama você pra
              acertar o pagamento antes de despachar.
            </p>
          ) : null}

          {estado.erros.provedor ? (
            <p className="campo__erro" role="alert">
              {estado.erros.provedor}
            </p>
          ) : null}
          <Recado estado={estado} />

          <div className="acoes">
            <button
              type="button"
              className="btn btn--fantasma"
              onClick={() => casca.aoAbrir("entrega")}
            >
              ← Voltar
            </button>
            <button type="submit" className="btn" disabled={enviando || !pronto}>
              {enviando ? "Fechando o pedido…" : `Fazer o pedido · ${emReais(checkout.total)}`}
              <Raio className="btn__bolt" />
            </button>
          </div>

          <p className="pagamento__nota" style={{ marginTop: 12 }}>
            <Cadeado aria-hidden="true" /> Ao fazer o pedido você aceita as{" "}
            <Link href="/trocas">regras de troca e devolução</Link>, incluindo os 7 dias de
            arrependimento que a lei garante.
          </p>
        </form>
      )}
    </Painel>
  )
}

/* ── as três formas ───────────────────────────────────────────────────────── */

function Formas({
  forma,
  aoTrocar,
  total,
}: {
  forma: FormaDePagamento["id"]
  aoTrocar: (f: FormaDePagamento["id"]) => void
  total: number
}) {
  // Enquanto a loja não está aberta, as três aparecem pro desenho poder ser
  // visto e testado. Com a chave virada, some o que não cobra.
  if (CHECKOUT_ABERTO) return null

  return (
    <>
      <fieldset className="opcoes">
        <legend className="sr-only">Forma de pagamento</legend>
        {FORMAS.map((f) => (
          <label className="opcao" key={f.id}>
            {f.selo ? <span className="opcao__selo">{f.selo}</span> : null}
            <input
              type="radio"
              name="forma"
              value={f.id}
              checked={forma === f.id}
              onChange={() => aoTrocar(f.id)}
            />
            <span>
              <span className="opcao__nome">{f.nome}</span>
              <span className="opcao__desc">{f.descricao}</span>
            </span>
            <span className="opcao__valor">{emReais(total)}</span>
          </label>
        ))}
      </fieldset>

      <div className="pagamento__painel" data-ativo={forma === "pix" ? "" : undefined}>
        <p className="pagamento__nota">
          Ao confirmar, mostramos o QR code e o código copia-e-cola.{" "}
          <b>Enquanto o gateway não entra, o QR é de exemplo</b> — o pedido é registrado e a gente
          chama você pra acertar.
        </p>
      </div>

      <div className="pagamento__painel" data-ativo={forma === "cartao" ? "" : undefined}>
        <Cartao total={total} />
      </div>

      <div className="pagamento__painel" data-ativo={forma === "boleto" ? "" : undefined}>
        <p className="pagamento__nota">
          O boleto é gerado ao confirmar e pode ser pago em qualquer banco ou app.{" "}
          <b>A compensação leva até 2 dias úteis</b> — o prazo de entrega conta a partir daí.
        </p>
      </div>
    </>
  )
}

/* ── o formulário de cartão ───────────────────────────────────────────────── */

/**
 * NENHUM CAMPO AQUI TEM `name`.
 *
 * Campo sem nome não entra no `FormData`, então nada disto viaja na server
 * action nem chega ao servidor da loja. Quando o Pagar.me entrar, é o script
 * dele que lê estes campos no navegador e devolve um token — e o token, sim,
 * vai pro backend. Número de cartão que passa pelo nosso servidor é PCI-DSS
 * inteiro no colo, sem necessidade nenhuma.
 *
 * A validação daqui só pega o que dá pra pegar sem gateway: número digitado
 * errado (Luhn), validade no passado, CVV curto. Nada disso afirma que o
 * cartão existe — só evita a recusa que apareceria depois do clique.
 */
function Cartao({ total }: { total: number }) {
  const [numero, setNumero] = useState("")
  const [validade, setValidade] = useState("")
  const [cvv, setCvv] = useState("")
  const [tocado, setTocado] = useState<Record<string, boolean>>({})

  const bandeira = bandeiraDe(numero)
  const marca = (campo: string) => () => setTocado((t) => ({ ...t, [campo]: true }))

  const erroNumero = tocado.numero && numero && !luhn(numero) ? "Número do cartão inválido." : ""
  const erroValidade =
    tocado.validade && validade && !validadeOk(validade) ? "Validade MM/AA, no futuro." : ""
  const erroCvv = tocado.cvv && cvv && !cvvOk(cvv, bandeira) ? "CVV de 3 ou 4 números." : ""

  return (
    <>
      <div className="campos">
        <Campo
          rotulo="Número do cartão"
          nome=""
          inputMode="numeric"
          autoComplete="cc-number"
          placeholder="0000 0000 0000 0000"
          value={numero}
          onChange={(e) => setNumero(mascararCartao(e.target.value))}
          onBlur={marca("numero")}
          erro={erroNumero}
          enfeite={
            bandeira ? (
              <span className="campo__icone" data-ok="" aria-hidden="true">
                {NOMES_DAS_BANDEIRAS[bandeira]}
              </span>
            ) : undefined
          }
        />
        <Campo
          rotulo="Nome impresso no cartão"
          nome=""
          autoComplete="cc-name"
          placeholder="Como está no cartão"
          style={{ textTransform: "uppercase" }}
        />
        <Campo
          rotulo="Validade"
          nome=""
          largura="campo--2 campo--meio"
          inputMode="numeric"
          autoComplete="cc-exp"
          placeholder="MM/AA"
          maxLength={5}
          value={validade}
          onChange={(e) => setValidade(mascararValidade(e.target.value))}
          onBlur={marca("validade")}
          erro={erroValidade}
        />
        <Campo
          rotulo="CVV"
          nome=""
          largura="campo--2 campo--meio"
          inputMode="numeric"
          autoComplete="cc-csc"
          placeholder="123"
          maxLength={4}
          value={cvv}
          onChange={(e) => setCvv(e.target.value.replace(/\D+/g, ""))}
          onBlur={marca("cvv")}
          erro={erroCvv}
        />
        <div className="campo campo--2">
          <label htmlFor="parcelas">Parcelas</label>
          <select id="parcelas" defaultValue="1">
            {Array.from({ length: PARCELAS_SEM_JUROS }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}x de {emReais(total / n)} sem juros
              </option>
            ))}
          </select>
          <span className="campo__erro" aria-live="polite" />
        </div>
      </div>

      <div className="bandeiras" aria-label="Bandeiras aceitas">
        {BANDEIRAS.map((b) => (
          <span key={b}>{b}</span>
        ))}
      </div>

      <p className="pagamento__nota" style={{ marginTop: 10 }}>
        <b>Estes campos não saem do seu navegador.</b> O pagamento no site entra com o gateway; até
        lá o pedido é registrado e a gente chama você pra acertar.
      </p>
    </>
  )
}

/* ── order bump ───────────────────────────────────────────────────────────── */

/**
 * A caixinha colada no botão de pagar.
 *
 * O "de/por" NÃO É TEXTO: o "por" é o preço com a promoção que existe no
 * Medusa, e marcar a caixinha aplica o código dela. Se o desconto fosse só
 * escrito aqui, o cliente pagaria o cheio — e oferta anunciada vincula.
 *
 * Some sozinha quando o produto já está no pedido (quem acabou de pagar
 * inteiro não quer ver desconto naquilo).
 */
function Bump({ bump, marcado }: { bump: Oferta; marcado: boolean }) {
  const [mexendo, comecar] = useTransition()
  /**
   * A marca responde NA HORA, e o servidor confirma depois.
   *
   * Sem isto a caixinha é controlada só pelo carrinho: clicar não muda nada
   * até a ida ao Medusa voltar, e o React redesenha ela desmarcada no meio do
   * caminho. Quem clicou vê a marca piscar e some — e clica de novo.
   *
   * `useOptimistic` porque este é o caso exato dele: a pessoa sendo ecoada de
   * volta. O preço NÃO é adivinhado aqui; ele continua vindo do Medusa.
   */
  const [marcadoAgora, preverMarca] = useOptimistic(marcado)

  return (
    <div className="bump" data-ativo="">
      <span className="bump__selo">
        <Raio aria-hidden="true" /> Só nessa tela
      </span>
      <label className="bump__caixa">
        <input
          type="checkbox"
          checked={marcadoAgora}
          disabled={mexendo}
          onChange={(e) => {
            const marcar = e.target.checked
            // O palpite e a ação na MESMA transição: fora dela o React
            // descarta o otimista antes de o servidor responder.
            comecar(async () => {
              preverMarca(marcar)
              await alternarBump(bump.varianteId, marcar)
            })
          }}
        />
        <span className="bump__foto">
          {bump.imagem ? (
            <Image src={bump.imagem} alt="" width={64} height={64} sizes="64px" />
          ) : null}
        </span>
        <span>
          <p className="bump__titulo">
            Adiciona o <b>{bump.nome}</b> ao pedido?
          </p>
          <p className="bump__txt">
            Quem leva tratamento costuma levar o óleo junto — só nessa tela, com desconto.
          </p>
          <p className="bump__preco">
            <s>{emReais(bump.preco)}</s>
            <span>{emReais(bump.precoComDesconto)}</span>
          </p>
        </span>
      </label>
    </div>
  )
}
