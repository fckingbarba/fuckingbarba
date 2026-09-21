"use client"

import Image from "next/image"
import Link from "next/link"
import {
  startTransition,
  useActionState,
  useOptimistic,
  useState,
  useTransition,
  type FormEvent,
  type ReactNode,
} from "react"
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
  PROVEDOR_PAGARME,
  type CheckoutVisivel,
  type Oferta,
  type ProvedorDePagamento,
} from "@/lib/checkout-visivel"
import { emReais } from "@/lib/formato"
import { nomeNoCartao, tokenizar } from "@/lib/pagarme"
import { CHECKOUT_ABERTO, PARCELA_MINIMA, PARCELAS_SEM_JUROS } from "@/lib/site"
import { Campo } from "./campo"
import { Painel, Recado, type PropsDaEtapa } from "./etapas"

/**
 * PASSO 3 — pagamento, e o pedido.
 *
 * ┌─ QUEM COBRA ───────────────────────────────────────────────────────────┐
 * │ Quem cobra é o provedor que o Medusa devolve pra região:               │
 * │                                                                        │
 * │ • `pp_pagarme_pagarme` — Pix e cartão em até 3x, de verdade. É o que   │
 * │   o `npm run backend:pagamento` liga, e é quando ele aparece que esta  │
 * │   tela passa a cobrar;                                                 │
 * │ • `pp_system_default` — o provisório, que APROVA SEM COBRAR. Com o     │
 * │   checkout aberto (`CHECKOUT_ABERTO`), ele nem chega aqui: a lista de  │
 * │   provedores o tira, e sem o Pagar.me a tela diz que não há forma de   │
 * │   pagamento. Fechado, Pix e cartão aparecem como vitrine, e a tela diz │
 * │   com todas as letras que o pedido não é cobrado agora.                │
 * │                                                                        │
 * │ O NÚMERO DO CARTÃO NÃO SAI DO NAVEGADOR, a não ser direto pro          │
 * │ Pagar.me: os campos não têm `name` (não entram no FormData da ação),   │
 * │ e o envio é interceptado pra trocar o cartão por um token antes de a   │
 * │ ação rodar. O que chega no servidor da loja é o token — `lib/pagarme`. │
 * └────────────────────────────────────────────────────────────────────────┘
 */

const ICONES = { escudo: Escudo, cadeado: Cadeado, caminhao: Caminhao, relogio: Relogio }

type Props = PropsDaEtapa & {
  checkout: CheckoutVisivel
  provedores: ProvedorDePagamento[]
  bump: Oferta | null
}

export type CartaoNaTela = { numero: string; nome: string; validade: string; cvv: string }

const CARTAO_VAZIO: CartaoNaTela = { numero: "", nome: "", validade: "", cvv: "" }

/** O primeiro problema do cartão digitado, numa frase — ou vazio. */
function problemaNoCartao(c: CartaoNaTela): string {
  if (!luhn(c.numero)) return "Confere o número do cartão."
  if (nomeNoCartao(c.nome).length < 2) return "Falta o nome como está impresso no cartão."
  if (!validadeOk(c.validade)) return "Confere a validade: MM/AA, e ainda não vencida."
  if (!cvvOk(c.cvv, bandeiraDe(c.numero))) return "Confere o CVV, o código do verso."
  return ""
}

/**
 * As parcelas que dá pra oferecer pra este total: até 3, e nenhuma abaixo
 * da parcela mínima. É a mesma regra que o backend confere
 * (`modules/pagarme/pedido.ts`) — oferecer aqui o que lá é recusado seria
 * descobrir no último clique.
 */
function parcelasPossiveis(total: number): number[] {
  return Array.from({ length: PARCELAS_SEM_JUROS }, (_, i) => i + 1).filter(
    (n) => n === 1 || total / n >= PARCELA_MINIMA
  )
}

// `aoSalvar` é desestruturado e não usado de propósito: este passo não fecha
// quando dá certo — a ação redireciona pra tela de obrigado e esta página
// deixa de existir. Tirar da prop quebraria a assinatura comum das etapas.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function Pagamento({ checkout, provedores, bump, aoSalvar, ...casca }: Props) {
  const [estado, acao, enviando] = useActionState(finalizar, ESTADO_INICIAL)
  const [forma, setForma] = useState<FormaDePagamento["id"]>("pix")
  const [cartao, setCartao] = useState<CartaoNaTela>(CARTAO_VAZIO)
  const [tocado, setTocado] = useState<Record<string, boolean>>({})
  const [parcelas, setParcelas] = useState(1)
  const [tokenizando, setTokenizando] = useState(false)
  const [erroDoCartao, setErroDoCartao] = useState("")

  const pagarme = provedores.find((p) => p.id === PROVEDOR_PAGARME)
  const provedor = pagarme ?? provedores[0]
  const cobra = Boolean(pagarme)
  const simbolico = !cobra && provedores.some((p) => p.simbolico)
  const pronto = Boolean(checkout.email && checkout.entrega.cep && checkout.freteEscolhido)
  const ocupado = enviando || tokenizando

  const opcoesDeParcelas = parcelasPossiveis(checkout.total)
  // O total pode cair (bump desmarcado) e tirar a parcela escolhida da lista.
  const parcelasValidas = Math.min(parcelas, opcoesDeParcelas.length)

  /**
   * O envio, interceptado quando é cartão de verdade.
   *
   * Tudo que é Pix — e tudo no modo provisório — segue o caminho normal do
   * `<form action>`. No cartão, o `preventDefault` segura o envio (o React
   * não roda a ação de um envio impedido), o navegador troca o cartão por um
   * token com o Pagar.me, e só então a ação é chamada, com o token no lugar
   * do cartão. A barra fixa do celular passa por aqui também: ela dispara
   * `requestSubmit()`, que é um envio como outro qualquer.
   */
  function aoEnviar(e: FormEvent<HTMLFormElement>) {
    if (!cobra || forma !== "cartao") return
    e.preventDefault()
    if (ocupado) return

    const problema = problemaNoCartao(cartao)
    if (problema) {
      setTocado({ numero: true, nome: true, validade: true, cvv: true })
      setErroDoCartao(problema)
      return
    }

    /*
      O FormData é lido AGORA, antes de qualquer mudança de estado: enquanto
      o token não volta, os campos ficam desabilitados — e campo desabilitado
      não entra no FormData. Lido depois, as parcelas sumiam do envio e todo
      pedido saía em 1x, sem erro nenhum (o conferidor pegou).
    */
    const fd = new FormData(e.currentTarget)
    setErroDoCartao("")
    setTokenizando(true)
    void tokenizar(cartao).then((r) => {
      setTokenizando(false)
      if (!r.ok) {
        setErroDoCartao(r.mensagem)
        return
      }
      // O CVV já foi usado: se o banco recusar, é ele que se digita de novo.
      setCartao((c) => ({ ...c, cvv: "" }))
      fd.set("token_cartao", r.token)
      startTransition(() => acao(fd))
    })
  }

  const textoDoBotao = ocupado
    ? tokenizando
      ? "Validando o cartão…"
      : cobra
        ? forma === "pix"
          ? "Gerando o Pix…"
          : "Processando o pagamento…"
        : "Fechando o pedido…"
    : cobra
      ? forma === "pix"
        ? `Pagar ${emReais(checkout.total)} no Pix`
        : `Pagar ${emReais(checkout.total)}`
      : `Fazer o pedido · ${emReais(checkout.total)}`

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
        <form id="form-pagamento" action={acao} onSubmit={aoEnviar} noValidate>
          {/* O provedor que o Medusa vai usar de fato. Escondido porque quem
              a pessoa escolhe é a FORMA (Pix ou cartão); o provedor é um só
              pros dois. */}
          <input type="hidden" name="provedor" value={provedor?.id ?? ""} />

          {cobra || !CHECKOUT_ABERTO ? (
            <Formas
              forma={forma}
              aoTrocar={(f) => {
                setForma(f)
                setErroDoCartao("")
              }}
              total={checkout.total}
              cobra={cobra}
              cartao={
                <Cartao
                  total={checkout.total}
                  cobra={cobra}
                  valores={cartao}
                  aoMudar={setCartao}
                  tocado={tocado}
                  aoTocar={(campo) => setTocado((t) => ({ ...t, [campo]: true }))}
                  parcelas={parcelasValidas}
                  opcoesDeParcelas={opcoesDeParcelas}
                  aoEscolherParcelas={setParcelas}
                  bloqueado={ocupado}
                />
              }
            />
          ) : null}

          {bump ? <Bump bump={bump} marcado={checkout.bumpMarcado} /> : null}

          {simbolico ? (
            <p className="pagamento__aviso">
              <b>Este pedido não é cobrado agora.</b> Ele entra na fila e a gente chama você pra
              acertar o pagamento antes de despachar.
            </p>
          ) : null}

          {estado.erros.provedor || estado.erros.forma ? (
            <p className="campo__erro" role="alert">
              {estado.erros.provedor || estado.erros.forma}
            </p>
          ) : null}
          {erroDoCartao ? (
            <p className="erros-envio" role="alert">
              {erroDoCartao}
            </p>
          ) : (
            <Recado estado={estado} />
          )}

          <div className="acoes">
            <button
              type="button"
              className="btn btn--fantasma"
              onClick={() => casca.aoAbrir("entrega")}
            >
              ← Voltar
            </button>
            <button type="submit" className="btn" disabled={ocupado || !pronto}>
              {textoDoBotao}
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

/* ── as duas formas ───────────────────────────────────────────────────────── */

function Formas({
  forma,
  aoTrocar,
  total,
  cobra,
  cartao,
}: {
  forma: FormaDePagamento["id"]
  aoTrocar: (f: FormaDePagamento["id"]) => void
  total: number
  cobra: boolean
  cartao: ReactNode
}) {
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
        {cobra ? (
          <p className="pagamento__nota">
            Ao confirmar, mostramos o QR code e o código copia-e-cola. <b>Pagou, aprovou</b> — o
            pedido entra na fila de envio na hora.
          </p>
        ) : (
          <p className="pagamento__nota">
            Ao confirmar, mostramos o QR code e o código copia-e-cola.{" "}
            <b>Enquanto o gateway não entra, o QR é de exemplo</b> — o pedido é registrado e a gente
            chama você pra acertar.
          </p>
        )}
      </div>

      <div className="pagamento__painel" data-ativo={forma === "cartao" ? "" : undefined}>
        {cartao}
      </div>
    </>
  )
}

/* ── o formulário de cartão ───────────────────────────────────────────────── */

/**
 * NENHUM CAMPO AQUI TEM `name` — nem o de parcelas precisa esconder nada, e
 * é o único que tem.
 *
 * Campo sem nome não entra no `FormData`, então nada disto viaja na server
 * action nem chega ao servidor da loja. O envio do passo lê os valores daqui
 * (pelo estado do React) e manda só pro Pagar.me, que devolve o token.
 *
 * A validação daqui só pega o que dá pra pegar sem gateway: número digitado
 * errado (Luhn), validade no passado, CVV curto. Nada disso afirma que o
 * cartão existe — só evita a recusa que apareceria depois do clique.
 */
function Cartao({
  total,
  cobra,
  valores,
  aoMudar,
  tocado,
  aoTocar,
  parcelas,
  opcoesDeParcelas,
  aoEscolherParcelas,
  bloqueado,
}: {
  total: number
  cobra: boolean
  valores: CartaoNaTela
  aoMudar: (atualizar: (c: CartaoNaTela) => CartaoNaTela) => void
  tocado: Record<string, boolean>
  aoTocar: (campo: string) => void
  parcelas: number
  opcoesDeParcelas: number[]
  aoEscolherParcelas: (n: number) => void
  bloqueado: boolean
}) {
  const { numero, nome, validade, cvv } = valores
  const bandeira = bandeiraDe(numero)
  const muda = (campo: keyof CartaoNaTela, valor: string) =>
    aoMudar((c) => ({ ...c, [campo]: valor }))

  const erroNumero = tocado.numero && numero && !luhn(numero) ? "Número do cartão inválido." : ""
  const erroNome =
    tocado.nome && nomeNoCartao(nome).length < 2 ? "Como está impresso no cartão." : ""
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
          disabled={bloqueado}
          onChange={(e) => muda("numero", mascararCartao(e.target.value))}
          onBlur={() => aoTocar("numero")}
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
          value={nome}
          disabled={bloqueado}
          onChange={(e) => muda("nome", e.target.value)}
          onBlur={() => aoTocar("nome")}
          erro={erroNome}
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
          disabled={bloqueado}
          onChange={(e) => muda("validade", mascararValidade(e.target.value))}
          onBlur={() => aoTocar("validade")}
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
          disabled={bloqueado}
          onChange={(e) => muda("cvv", e.target.value.replace(/\D+/g, ""))}
          onBlur={() => aoTocar("cvv")}
          erro={erroCvv}
        />
        <div className="campo campo--2">
          <label htmlFor="parcelas">Parcelas sem juros</label>
          {/* O único campo com nome: quantas parcelas não é dado de cartão. */}
          <select
            id="parcelas"
            name="parcelas"
            value={parcelas}
            disabled={bloqueado}
            onChange={(e) => aoEscolherParcelas(Number(e.target.value))}
          >
            {opcoesDeParcelas.map((n) => (
              <option key={n} value={n}>
                {/* "sem juros" mora no rótulo: repetido em cada opção, cortava
                    o texto no campo de um terço da largura (a foto mostrou). */}
                {n}x de {emReais(total / n)}
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

      {cobra ? (
        <p className="pagamento__nota" style={{ marginTop: 10 }}>
          <b>Estes campos não passam pelo servidor da loja.</b> O cartão vai direto pro Pagar.me,
          que devolve só um código de uso único — é ele que fecha a compra.
        </p>
      ) : (
        <p className="pagamento__nota" style={{ marginTop: 10 }}>
          <b>Estes campos não saem do seu navegador.</b> O pagamento no site entra com o gateway;
          até lá o pedido é registrado e a gente chama você pra acertar.
        </p>
      )}
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
