"use client"

import type { Route } from "next"
import Image from "next/image"
import Link from "next/link"
import { useCallback, useEffect, useId, useRef, useState, useTransition } from "react"
import { EscudoCerto, Fechar, Raio, Relogio, Triangulo, WhatsApp } from "@/components/icones"
import { EVENTO_SACOLA, useSacola } from "@/components/sacola/contexto"
import { refazerPedido } from "@/lib/acoes/pedido"
import type { DeNovo } from "@/lib/conta-visivel"
import { emReais } from "@/lib/formato"
import {
  estadoNaTela,
  minutosDoPix,
  prazoDoBalao,
  type DadosDoBalao,
  type EstadoDoBalao,
} from "@/lib/pedido-recente"
import { rastrear } from "@/lib/rastrear"
import { SEM_CONEXAO, semQueda } from "@/lib/rede"
import "@/estilos/balao-do-pedido.css"

/**
 * O BALÃO DO PEDIDO (0203) — ver `lib/pedido-recente.ts` pras regras.
 *
 * Fechado, é uma faixa no canto de baixo: o número, em que pé está, e um
 * botão. Aberto, é o resumo — os passos, o Pix pra copiar, os itens, o
 * pedido completo e o WhatsApp. Sobe de baixo no celular; no computador,
 * abre em cima do balão.
 *
 * PERGUNTA DE 20 EM 20 SEGUNDOS enquanto o pagamento não entrou (a tela de
 * obrigado pergunta de 4 em 4: lá a pessoa está olhando pro Pix; aqui ela
 * está vendo a loja). Pago ou cancelado, para. E some sozinho no prazo.
 */

const INTERVALO = 20_000

type Texto = { titulo: string; sub: string; botao: string }

function textos(estado: EstadoDoBalao, minutos: number | null): Texto {
  switch (estado) {
    case "pix":
      return {
        titulo: "Falta pagar o Pix",
        sub:
          minutos === null
            ? "Pague pelo app do banco"
            : `Vale por mais ${minutos} ${minutos === 1 ? "minuto" : "minutos"}`,
        botao: "Pagar",
      }
    case "analise":
      return { titulo: "Pagamento em análise", sub: "Leva poucos minutos", botao: "Ver" }
    case "pago":
      return { titulo: "Pedido confirmado", sub: "Já estamos separando", botao: "Ver" }
    case "venceu":
      return { titulo: "O Pix venceu", sub: "O pedido foi cancelado", botao: "Refazer" }
    default:
      return { titulo: "Pedido recebido", sub: "A gente te chama pra combinar", botao: "Ver" }
  }
}

const FRASE: Record<EstadoDoBalao, string> = {
  pix: "Assim que o banco confirmar, isto muda sozinho pra “Pedido confirmado”.",
  analise:
    "O cartão foi autorizado e passa por uma conferência de segurança. Costuma levar poucos minutos, e isto muda sozinho.",
  pago: "Pagamento aprovado. O código de rastreio chega por e-mail assim que o pedido for postado.",
  venceu: "O Pix não foi pago a tempo e o pedido foi cancelado. Nada foi cobrado.",
  combinar: "A gente confere o pedido e chama você pra acertar o pagamento.",
}

const PASSOS = ["Pedido feito", "Pagamento", "Separação", "Envio"] as const

/** Em que passo está: os de antes estão feitos, este é o atual. */
const PASSO_ATUAL: Record<EstadoDoBalao, number> = {
  pix: 1,
  analise: 1,
  combinar: 1,
  pago: 2,
  venceu: -1,
}

const hora = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
}

export function BalaoDoPedido({
  pedidoId,
  whatsapp,
  aoSumir,
}: {
  pedidoId: string
  whatsapp: string | null
  aoSumir: () => void
}) {
  const [dados, setDados] = useState<DadosDoBalao | null>(null)
  const [agora, setAgora] = useState(() => Date.now())
  const [aberto, setAberto] = useState(false)
  const [copiado, setCopiado] = useState<"sim" | "falhou" | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [refazendo, comecar] = useTransition()
  const sacola = useSacola()
  const titulo = useId()
  const fecharFolha = useRef<HTMLButtonElement>(null)
  const abrirBalao = useRef<HTMLButtonElement>(null)
  const sumirRef = useRef(aoSumir)
  useEffect(() => {
    sumirRef.current = aoSumir
  }, [aoSumir])

  /* A leitura, e a pergunta de tempos em tempos enquanto o pagamento não entra. */
  useEffect(() => {
    let vivo = true
    let relogio: ReturnType<typeof setTimeout> | undefined
    const ler = async () => {
      try {
        const r = await fetch("/api/pedido-recente", { cache: "no-store" })
        const j = (await r.json()) as { mostrar?: boolean; pedido?: DadosDoBalao }
        if (!vivo) return
        if (!j.mostrar || !j.pedido || j.pedido.id !== pedidoId) {
          sumirRef.current()
          return
        }
        setDados(j.pedido)
        setAgora(Date.now())
        if (j.pedido.estado === "aguardando" || j.pedido.estado === "analise") {
          relogio = setTimeout(ler, INTERVALO)
        }
      } catch {
        // A rede caiu: tenta de novo na próxima volta, sem mexer na tela.
        if (vivo) relogio = setTimeout(ler, INTERVALO)
      }
    }
    void ler()
    return () => {
      vivo = false
      if (relogio) clearTimeout(relogio)
    }
  }, [pedidoId])

  /* O relógio da tela: os minutos do Pix, a faixa, e o prazo do balão. */
  useEffect(() => {
    const relogio = setInterval(() => setAgora(Date.now()), 15_000)
    return () => clearInterval(relogio)
  }, [])

  useEffect(() => {
    if (dados && agora > prazoDoBalao(dados)) sumirRef.current()
  }, [dados, agora])

  /* A folha aberta: o foco vai pro fechar, o Esc fecha, e o foco volta pro balão. */
  useEffect(() => {
    if (!aberto) return
    const volta = abrirBalao.current
    fecharFolha.current?.focus()
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAberto(false)
    }
    addEventListener("keydown", aoTeclar)
    return () => {
      removeEventListener("keydown", aoTeclar)
      volta?.focus()
    }
  }, [aberto])

  const copiar = useCallback(async () => {
    if (!dados?.pix) return
    try {
      await navigator.clipboard.writeText(dados.pix.copiaECola)
      setCopiado("sim")
      rastrear("pix_copiado", { value: dados.total })
    } catch {
      setCopiado("falhou")
    }
    setTimeout(() => setCopiado(null), 2500)
  }, [dados])

  const refazer = useCallback(() => {
    setAviso(null)
    comecar(async () => {
      const r = await semQueda(
        () => refazerPedido(pedidoId),
        (): DeNovo => ({ ok: false, texto: SEM_CONEXAO, carrinho: null })
      )
      if (r.carrinho) window.dispatchEvent(new CustomEvent(EVENTO_SACOLA, { detail: r.carrinho }))
      if (!r.ok) {
        setAberto(true)
        setAviso(r.texto)
        return
      }
      // Os produtos voltaram: a sacola abre com eles, e o balão do pedido
      // cancelado já disse o que tinha pra dizer.
      sacola?.abrir()
      sumirRef.current()
    })
  }, [pedidoId, sacola])

  if (!dados) return null

  const estado = estadoNaTela(dados, agora)
  const minutos = estado === "pix" ? minutosDoPix(dados.pix?.expiraEm, agora) : null
  const t = textos(estado, minutos)
  const atual = PASSO_ATUAL[estado]
  const faixa = minutos === null ? null : Math.max(0, Math.min(100, (minutos / 30) * 100))

  return (
    <div className="bp" data-estado={estado} data-aberto={aberto ? "" : undefined}>
      {/* A mudança de estado é dita a quem usa leitor de tela, sem roubar o foco. */}
      <p className="sr-only" role="status" aria-live="polite">
        Pedido {dados.numero}: {t.titulo}
      </p>

      {aberto ? (
        <>
          <button
            type="button"
            className="bp-veu"
            aria-label="Fechar"
            tabIndex={-1}
            onClick={() => setAberto(false)}
          />
          <section className="bp-folha" role="dialog" aria-modal="true" aria-labelledby={titulo}>
            <span className="bp-alca" aria-hidden="true" />
            <div className="bp-folha__topo">
              <div>
                <p className="bp-folha__quando">
                  Pedido #{dados.numero}
                  {hora(dados.quando) ? ` · feito às ${hora(dados.quando)}` : ""}
                </p>
                <h2 className="bp-folha__titulo" id={titulo}>
                  {t.titulo}
                </h2>
                <p className="bp-folha__frase">{FRASE[estado]}</p>
              </div>
              <button
                ref={fecharFolha}
                type="button"
                className="bp-x"
                aria-label="Fechar"
                onClick={() => setAberto(false)}
              >
                <Fechar />
              </button>
            </div>

            {estado !== "venceu" ? (
              <ol className="bp-passos" aria-label="Andamento">
                {PASSOS.map((nome, i) => (
                  <li
                    key={nome}
                    data-feito={i < atual ? "" : undefined}
                    data-atual={i === atual ? "" : undefined}
                    aria-current={i === atual ? "step" : undefined}
                  >
                    {nome}
                  </li>
                ))}
              </ol>
            ) : null}

            {estado === "pix" && dados.pix ? (
              <div className="bp-pix">
                <p className="bp-pix__total">
                  <span>Total no Pix</span>
                  <b>{emReais(dados.total)}</b>
                </p>
                <button type="button" className="bp-pix__copiar" onClick={copiar}>
                  {copiado === "sim" ? "Copiado!" : "Copiar código Pix"}
                </button>
                <p className="bp-pix__vale" aria-live="polite">
                  {copiado === "falhou"
                    ? "Não consegui copiar sozinho — abre o pedido completo e copia o código de lá."
                    : `${t.sub}. Cola no app do seu banco.`}
                </p>
              </div>
            ) : null}

            {estado === "venceu" ? (
              <button
                type="button"
                className="bp-refazer"
                onClick={refazer}
                disabled={refazendo}
                aria-busy={refazendo}
              >
                {refazendo ? "Pondo na sacola…" : "Refazer o pedido"}
              </button>
            ) : null}
            {aviso ? (
              <p className="bp-aviso" role="alert">
                {aviso}
              </p>
            ) : null}

            <ul className="bp-itens" aria-label="Itens">
              {dados.itens.map((item, i) => (
                <li key={`${item.nome}-${i}`}>
                  <span className="bp-itens__foto">
                    {item.imagem ? (
                      <Image src={item.imagem} alt="" width={44} height={44} sizes="44px" />
                    ) : null}
                  </span>
                  <span className="bp-itens__nome">
                    {item.quantidade > 1 ? `${item.quantidade}× ` : ""}
                    {item.nome}
                    {item.variante ? ` · ${item.variante}` : ""}
                  </span>
                  <span className="bp-itens__preco">{emReais(item.total)}</span>
                </li>
              ))}
            </ul>

            <div className="bp-acoes">
              <Link
                className="btn bp-acoes__ver"
                href={`/checkout/obrigado/${dados.id}` as Route}
                onClick={() => setAberto(false)}
              >
                Ver pedido completo
                <Raio className="btn__bolt" />
              </Link>
              {whatsapp ? (
                <a
                  className="bp-acoes__zap"
                  href={whatsapp}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Falar no WhatsApp"
                >
                  <WhatsApp />
                </a>
              ) : null}
            </div>
          </section>
        </>
      ) : null}

      <div className="bp-balao">
        <button
          ref={abrirBalao}
          type="button"
          className="bp-balao__abrir"
          onClick={() => setAberto(true)}
          aria-label={`Acompanhar o pedido ${dados.numero}: ${t.titulo}`}
          aria-expanded={aberto}
        >
          <span className="bp-balao__icone" aria-hidden="true">
            {estado === "pago" ? (
              <EscudoCerto />
            ) : estado === "venceu" ? (
              <Triangulo />
            ) : (
              <Relogio />
            )}
          </span>
          <span className="bp-balao__textos">
            <span className="bp-balao__numero">Pedido #{dados.numero}</span>
            <span className="bp-balao__titulo">{t.titulo}</span>
            <span className="bp-balao__sub">{t.sub}</span>
          </span>
        </button>
        <button
          type="button"
          className="bp-balao__botao"
          onClick={estado === "venceu" ? refazer : () => setAberto(true)}
          disabled={refazendo}
        >
          {refazendo ? "…" : t.botao}
        </button>
        <button
          type="button"
          className="bp-balao__x"
          aria-label="Esconder o acompanhamento do pedido"
          onClick={() => sumirRef.current()}
        >
          <Fechar />
        </button>
        {faixa !== null ? (
          <span className="bp-balao__faixa" aria-hidden="true" style={{ width: `${faixa}%` }} />
        ) : null}
      </div>
    </div>
  )
}
