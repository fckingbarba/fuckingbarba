"use client"

import Image from "next/image"
import {
  startTransition,
  useActionState,
  useEffect,
  useOptimistic,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
  type TransitionStartFunction,
} from "react"
import { createPortal } from "react-dom"
import {
  Cadeado,
  Caminhao,
  Cartao as IconeCartao,
  Escudo,
  Pix,
  Raio,
  Relogio,
  WhatsApp,
} from "@/components/icones"
import { FORMAS, garantiasDoPagamento, type FormaDePagamento } from "@/conteudo/checkout"
import { alternarBump, finalizar } from "@/lib/acoes/checkout"
import { bandeiraDe, cvvOk, luhn, mascararCartao, mascararValidade, validadeOk } from "@/lib/cartao"
import {
  ESTADO_INICIAL,
  PROVEDOR_PAGARME,
  type CheckoutVisivel,
  type OfertaDoBump,
  type ProvedorDePagamento,
} from "@/lib/checkout-visivel"
import type { Configuracoes } from "@/lib/configuracoes"
import { emReais } from "@/lib/formato"
import { nomeNoCartao, tokenizar } from "@/lib/pagarme"
import { CHECKOUT_ABERTO, PARCELA_MINIMA, PARCELAS_SEM_JUROS } from "@/lib/site"
import { LogoDaBandeira } from "@/components/bandeira"
import { Campo } from "./campo"
import {
  Giro,
  Painel,
  Recado,
  trazerPraVista,
  useAvisaOcupado,
  useFocaNoErro,
  type PropsDaEtapa,
} from "./etapas"

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

const ICONES = {
  escudo: Escudo,
  cadeado: Cadeado,
  caminhao: Caminhao,
  relogio: Relogio,
  whatsapp: WhatsApp,
}

/** Cada forma com a cara dela. O losango genérico não dizia nada. */
const ICONE_DA_FORMA = { pix: Pix, cartao: IconeCartao }

type Props = PropsDaEtapa & {
  checkout: CheckoutVisivel
  provedores: ProvedorDePagamento[]
  bump: OfertaDoBump | null
  /** O prazo de postagem e o WhatsApp decidem o que a faixa pode prometer. */
  atendimento: Configuracoes["atendimento"]
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
export function Pagamento({ checkout, provedores, bump, atendimento, aoSalvar, ...casca }: Props) {
  const [estado, acao, enviando] = useActionState(finalizar, ESTADO_INICIAL)
  const [forma, setForma] = useState<FormaDePagamento["id"]>("pix")
  const [cartao, setCartao] = useState<CartaoNaTela>(CARTAO_VAZIO)
  const [tocado, setTocado] = useState<Record<string, boolean>>({})
  const [parcelas, setParcelas] = useState(1)
  const [tokenizando, setTokenizando] = useState(false)
  const [erroDoCartao, setErroDoCartao] = useState("")
  // O erro do cartão vem pra vista, pelo mesmo motivo do `Recado`: no
  // celular, quem tocou a barra lá embaixo não está olhando pra ele.
  const erroDoCartaoRef = useRef<HTMLParagraphElement>(null)
  useEffect(() => {
    if (erroDoCartao) trazerPraVista(erroDoCartaoRef.current)
  }, [erroDoCartao])

  const pagarme = provedores.find((p) => p.id === PROVEDOR_PAGARME)
  const provedor = pagarme ?? provedores[0]
  const cobra = Boolean(pagarme)
  const simbolico = !cobra && provedores.some((p) => p.simbolico)
  const pronto = Boolean(checkout.email && checkout.entrega.cep && checkout.freteEscolhido)
  const ocupado = enviando || tokenizando
  const { recalcular, recalculando } = casca
  // Pagando, ou com o total mudando por baixo (bump, frete): nada de pedido
  // novo. Pagar no meio de uma troca cobraria um total que ninguém viu.
  const travado = ocupado || recalculando

  /*
   * O QUE A ESPERA DIZ — no botão, na barra do celular e na cortina por
   * cima da página. `null` fora da espera.
   */
  const espera = tokenizando
    ? "Validando o cartão…"
    : enviando
      ? cobra
        ? forma === "pix"
          ? "Gerando o Pix…"
          : "Processando o pagamento…"
        : "Fechando o pedido…"
      : null
  useAvisaOcupado(casca, espera)
  const formulario = useFocaNoErro(estado)

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
   *
   * UM PEDIDO POR VEZ. O botão trava enquanto espera, mas nem todo envio
   * passa por ele: o toque na barra do celular e o Enter num campo chegam
   * direto aqui. Sem esta primeira linha, cada toque a mais enfileirava
   * outro `finalizar` atrás do primeiro.
   */
  function aoEnviar(e: FormEvent<HTMLFormElement>) {
    if (travado) {
      e.preventDefault()
      return
    }
    if (!cobra || forma !== "cartao") return
    e.preventDefault()

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

  const textoDoBotao =
    espera ??
    (cobra
      ? forma === "pix"
        ? `Pagar ${emReais(checkout.total)} no Pix`
        : `Pagar ${emReais(checkout.total)}`
      : `Fazer o pedido · ${emReais(checkout.total)}`)

  const garantias = garantiasDoPagamento(atendimento)

  return (
    <Painel etapa="pagamento" aberta={casca.aberta}>
      {/* `data-itens`: são até duas frases (ver `garantiasDoPagamento`), e a
          grade do protótipo era de três colunas fixas. Sem nenhuma, a faixa
          nem aparece. */}
      {garantias.length ? (
        <ul
          className="confia"
          aria-label="Por que comprar com a gente"
          data-itens={garantias.length}
        >
          {garantias.map((g) => {
            const Icone = ICONES[g.icone]
            return (
              <li key={g.texto}>
                <Icone aria-hidden="true" />
                <span>{g.texto}</span>
              </li>
            )
          })}
        </ul>
      ) : null}

      {provedores.length === 0 ? (
        <p className="erros-envio" role="alert">
          Nenhuma forma de pagamento disponível agora. Chama a gente no WhatsApp que a gente fecha o
          pedido por lá.
        </p>
      ) : (
        <form id="form-pagamento" ref={formulario} action={acao} onSubmit={aoEnviar} noValidate>
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

          {bump ? (
            <Bump
              bump={bump}
              marcado={checkout.bumpAplicado === bump.handle}
              recalcular={recalcular}
              travado={travado}
            />
          ) : null}

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
            <p className="erros-envio" role="alert" ref={erroDoCartaoRef}>
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
            <button
              type="submit"
              className="btn"
              disabled={travado || !pronto}
              aria-busy={ocupado || undefined}
            >
              {ocupado ? <Giro /> : null}
              {textoDoBotao}
              {ocupado ? null : <Raio className="btn__bolt" />}
            </button>
          </div>
        </form>
      )}

      {/* Fora da cortina, que é `aria-hidden`: a região viva existe sempre,
          e é a mudança do texto dentro dela que o leitor de tela anuncia. */}
      <p className="sr-only" role="status" aria-live="polite">
        {espera ?? ""}
      </p>
      {espera ? <Cortina texto={espera} /> : null}
    </Painel>
  )
}

/**
 * A CORTINA DO PAGAMENTO — por cima da página inteira, até a próxima tela.
 *
 * O botão mudando de texto era a única notícia de que o pedido estava indo,
 * e no celular nem isso: o botão de dentro do passo fica escondido lá, e
 * quem paga toca a barra de baixo. A tela parecia parada, e a pessoa tocava
 * de novo. Agora a espera é impossível de não ver, e cobre também o que
 * mudaria o total no meio do caminho — o bump, o cupom, o "editar" dos
 * passos.
 *
 * Ela fica até a tela de obrigado chegar: o `redirect` da ação acontece
 * dentro da mesma transição, então `enviando` só volta a `false` quando a
 * página nova está pronta. Se o pagamento voltar com erro, ela some e o
 * recado aparece — e vem pra vista (`Recado`).
 *
 * NUM PORTAL, direto no <body>. Ela nasce dentro do `.bloco`, que recorta os
 * cantos com `clip-path` — e `clip-path` recorta até filho `position:
 * fixed`: sem o portal, a cortina seria um retângulo do tamanho do passo.
 * Só existe depois de um clique, então `document` sempre está lá.
 */
function Cortina({ texto }: { texto: string }) {
  return createPortal(
    <div className="cortina" aria-hidden="true">
      <div className="cortina__caixa">
        <Giro />
        <p className="cortina__titulo">{texto}</p>
        <p className="cortina__sub">Não feche nem atualize a página.</p>
      </div>
    </div>,
    document.body
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
      {/*
        O RÁDIO SAI DA VISTA E O ÍCONE OCUPA O LUGAR DELE.

        O losango do `.opcao` serve pra escolher entrega, onde as duas linhas
        são a mesma coisa em velocidades diferentes. Aqui não: Pix e cartão
        são meios com cara própria, e a marca do Pix responde "é o Pix mesmo?"
        antes de qualquer palavra ser lida.

        O rádio continua no HTML — escondido do olho, não do teclado nem do
        leitor de tela (`opcao--forma` em `checkout-loja.css`): ele ainda recebe
        foco, o foco ainda desenha o contorno na linha inteira, e quem está
        escolhido é dito pela borda e pelo fundo, que já mudavam.
      */}
      <fieldset className="opcoes">
        <legend className="sr-only">Forma de pagamento</legend>
        {FORMAS.map((f) => {
          const Icone = ICONE_DA_FORMA[f.id]
          return (
            <label className="opcao opcao--forma" key={f.id}>
              {f.selo ? <span className="opcao__selo">{f.selo}</span> : null}
              <input
                type="radio"
                name="forma"
                value={f.id}
                checked={forma === f.id}
                onChange={() => aoTrocar(f.id)}
              />
              <Icone className={`opcao__icone opcao__icone--${f.id}`} aria-hidden="true" />
              <span>
                <span className="opcao__nome">{f.nome}</span>
                <span className="opcao__desc">{f.descricao}</span>
              </span>
              <span className="opcao__valor">{emReais(total)}</span>
            </label>
          )
        })}
      </fieldset>

      {/* Cobrando de verdade, o Pix não precisa de painel: a linha dele já
          diz "QR code na próxima tela". A vitrine (checkout fechado) é que
          tem o que avisar — que o QR ali é de exemplo. */}
      {cobra ? null : (
        <div className="pagamento__painel" data-ativo={forma === "pix" ? "" : undefined}>
          <p className="pagamento__nota">
            Ao confirmar, mostramos o QR code e o código copia-e-cola.{" "}
            <b>Enquanto o gateway não entra, o QR é de exemplo</b> — o pedido é registrado e a gente
            chama você pra acertar.
          </p>
        </div>
      )}

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
          /*
            O espaço do logo fica SEMPRE montado, vazio até a bandeira
            aparecer (`.campo__icone:empty` some). Era `bandeira ? … :
            undefined`, e o `Campo` troca o input de lugar na árvore quando o
            enfeite aparece — o React montava outro campo, e o primeiro dígito
            que revelava a bandeira tirava o foco de quem estava digitando.
            O `data-bandeira` é o que o conferidor de checkout procura.
          */
          enfeite={
            <span className="campo__icone" data-bandeira={bandeira || undefined}>
              {bandeira ? <LogoDaBandeira bandeira={bandeira} /> : null}
            </span>
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

      {/*
        Cobrando de verdade, o formulário não explica mais o caminho do cartão
        nem lista as bandeiras (saíram por escolha da loja, 22/09/2026): o logo
        no fim do campo já diz qual cartão foi reconhecido. O caminho continua
        o mesmo — os campos sem `name`, o token do Pagar.me —, só não é mais
        texto na tela. A nota abaixo é a da vitrine, sem cobrança, e essa
        precisa ficar: diz que o pedido não é cobrado agora.
      */}
      {cobra ? null : (
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
 * A caixinha colada no botão de pagar — a oferta do checkout.
 *
 * O PRODUTO MUDA DE CARRINHO PRA CARRINHO: quem escolhe é o motor de
 * recomendação (`lerBump`, em `lib/checkout.ts`), e a frase de baixo diz por
 * que aquele produto — só com o que dá pra provar.
 *
 * O "de/por" NÃO É TEXTO: o "por" é o preço com a promoção que existe no
 * Medusa, e marcar a caixinha aplica o código dela. Se o desconto fosse só
 * escrito aqui, o cliente pagaria o cheio — e oferta anunciada vincula.
 *
 * Marcada, ela FICA, com o mesmo produto e a mesma frase — é por ela que se
 * desmarca.
 *
 * Quando o Medusa não aceita (a promoção não existe lá, por exemplo), a ação
 * desfaz o que fez, a marca volta, e o recado diz que o pedido segue sem a
 * oferta. Antes a resposta era ignorada: a marca voltava sem explicação — o
 * "marca e desmarca" —, e o produto ficava no carrinho a preço cheio.
 */
function Bump({
  bump,
  marcado,
  recalcular,
  travado,
}: {
  bump: OfertaDoBump
  marcado: boolean
  recalcular: TransitionStartFunction
  /** Pagando, ou outra troca no caminho: a caixinha espera. */
  travado: boolean
}) {
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
  const [erro, setErro] = useState("")
  const mexendo = marcadoAgora !== marcado

  return (
    <div
      className="bump"
      data-ativo=""
      data-produto={bump.handle}
      data-mexendo={mexendo ? "" : undefined}
    >
      <span className="bump__selo">
        <Raio aria-hidden="true" /> Só nessa tela
      </span>
      <label className="bump__caixa">
        <input
          type="checkbox"
          checked={marcadoAgora}
          disabled={travado}
          onChange={(e) => {
            const marcar = e.target.checked
            setErro("")
            // O palpite e a ação na MESMA transição: fora dela o React
            // descarta o otimista antes de o servidor responder.
            recalcular(async () => {
              preverMarca(marcar)
              const r = await alternarBump(bump.varianteId, marcar)
              if (!r.ok) setErro(r.mensagem || "Não consegui mexer na oferta agora.")
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
            Adiciona <b>{bump.nome}</b> ao pedido?
          </p>
          <p className="bump__txt">{bump.texto}</p>
          <p className="bump__preco">
            <s>{emReais(bump.preco)}</s>
            <span>{emReais(bump.precoComDesconto)}</span>
          </p>
        </span>
      </label>
      {erro ? (
        <p className="bump__erro" role="alert">
          {erro}
        </p>
      ) : null}
    </div>
  )
}
