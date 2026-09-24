"use client"

import type { Route } from "next"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useCallback, useEffect, useState, useTransition, type ReactNode } from "react"
import { Raio } from "@/components/icones"
import { EVENTO_SACOLA } from "@/components/sacola/contexto"
import { comprarDeNovo } from "@/lib/acoes/pedido"
import type { DeNovo } from "@/lib/conta-visivel"
import { SEM_CONEXAO, semQueda } from "@/lib/rede"

/**
 * AS PEÇAS DA CONTA QUE PRECISAM DO NAVEGADOR — cada uma pequena, pra que
 * o resto das telas saia pronto do servidor.
 */

/**
 * Um link do menu da conta, marcado quando é a tela da vez. `prefixo` pra
 * "Pedidos" continuar marcado dentro de um pedido.
 */
export function LinkDoMenu({
  href,
  prefixo,
  children,
}: {
  href: Route
  prefixo?: string
  children: ReactNode
}) {
  const caminho = usePathname()
  const aqui = caminho === href || (prefixo ? caminho.startsWith(prefixo) : false)
  return (
    <Link href={href} aria-current={aqui ? "page" : undefined}>
      {children}
    </Link>
  )
}

/**
 * Quanto tempo o Pix ainda vale, EM MINUTOS, como o `<Pix>` do obrigado:
 * relógio de segundos é ansiedade, e a hora do celular de ninguém bate com
 * a do banco a esse ponto. Conta só depois de montar — a do servidor
 * chegaria na tela já errada.
 */
export function MinutosDoPix({ expiraEm }: { expiraEm: string | null }) {
  const [minutos, setMinutos] = useState<number | null>(null)

  useEffect(() => {
    const fim = expiraEm ? Date.parse(expiraEm) : NaN
    if (!Number.isFinite(fim)) return
    const contar = () => setMinutos(Math.max(0, Math.ceil((fim - Date.now()) / 60_000)))
    const primeira = setTimeout(contar, 0)
    const relogio = setInterval(contar, 20_000)
    return () => {
      clearTimeout(primeira)
      clearInterval(relogio)
    }
  }, [expiraEm])

  if (minutos === null) return null
  return <>{minutos ? `${minutos} min` : "venceu"}</>
}

/**
 * O PIX QUE VENCE COM A TELA ABERTA.
 *
 * Quem decide que um Pix está vencido é o SERVIDOR (`situacaoDe`, em
 * `pedidos-da-conta.ts`): o relógio do celular pode estar adiantado, e tirar
 * o QR da frente de quem ainda ia pagar seria bem pior do que deixá-lo um
 * minuto a mais. Mas quem está olhando a contagem chegar a zero merece ver a
 * frase mudar sem recarregar a página — é o que esta peça faz, e só depois
 * de montada.
 *
 * A primeira pintura é sempre a `children`, igual à do servidor: hidratação
 * que não bate é tela piscando.
 */
export function AteVencer({
  expiraEm,
  venceu,
  children,
}: {
  expiraEm: string | null
  venceu: ReactNode
  children: ReactNode
}) {
  const [passou, setPassou] = useState(false)

  useEffect(() => {
    const fim = expiraEm ? Date.parse(expiraEm) : NaN
    if (!Number.isFinite(fim)) return
    // Sempre por um relógio, mesmo com a hora já passada: trocar o estado
    // no corpo do efeito pinta a tela duas vezes de uma vez só.
    const relogio = setTimeout(() => setPassou(true), Math.max(0, fim - Date.now()))
    return () => clearTimeout(relogio)
  }, [expiraEm])

  return <>{passou ? venceu : children}</>
}

/**
 * COMPRAR DE NOVO. A ação põe os itens na sacola; o evento abre a gaveta
 * com ela (o mesmo recado que o botão da página de produto manda), e a
 * frase fica aqui do lado — com o que não entrou, se algo não entrou.
 */
export function ComprarDeNovo({
  pedidoId,
  rotulo = "Comprar de novo",
  comoLink = false,
}: {
  pedidoId: string
  rotulo?: string
  comoLink?: boolean
}) {
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null)
  const [indo, comecar] = useTransition()

  function comprar() {
    setAviso(null)
    comecar(async () => {
      const r = await semQueda(
        () => comprarDeNovo(pedidoId),
        (): DeNovo => ({ ok: false, texto: SEM_CONEXAO, carrinho: null })
      )
      if (r.carrinho) {
        window.dispatchEvent(new CustomEvent(EVENTO_SACOLA, { detail: r.carrinho }))
      }
      setAviso({ ok: r.ok, texto: r.texto })
    })
  }

  return (
    <>
      <button
        type="button"
        className={comoLink ? "link" : "btn btn--menor"}
        onClick={comprar}
        disabled={indo}
        aria-busy={indo}
        data-comprar-de-novo={pedidoId}
      >
        {indo ? "Pondo na sacola…" : rotulo}
        {comoLink ? null : <Raio className="btn__bolt" />}
      </button>
      <p className="de-novo__aviso" role="status" data-erro={aviso && !aviso.ok ? "" : undefined}>
        {aviso?.texto ?? ""}
      </p>
    </>
  )
}

/* ── o aviso que sobe de baixo ────────────────────────────────────────────── */

type EstadoDoAviso = { texto: string; visivel: boolean; n: number }

/**
 * "Endereço salvo.", "Dados salvos." — a confirmação que aparece embaixo e
 * some sozinha em quatro segundos (o `.aviso` do protótipo). O texto fica
 * depois de sumir: a caixa desce com ele, em vez de encolher vazia no
 * caminho.
 */
export function useAviso() {
  const [aviso, setAviso] = useState<EstadoDoAviso>({ texto: "", visivel: false, n: 0 })

  useEffect(() => {
    if (!aviso.visivel) return
    const n = aviso.n
    const relogio = setTimeout(
      () => setAviso((a) => (a.n === n ? { ...a, visivel: false } : a)),
      4200
    )
    return () => clearTimeout(relogio)
  }, [aviso.n, aviso.visivel])

  const avisar = useCallback(
    (texto: string) => setAviso((a) => ({ texto, visivel: true, n: a.n + 1 })),
    []
  )
  return { aviso, avisar }
}

/**
 * A caixa do aviso existe SEMPRE, vazia e fora da tela: região viva que
 * nasce junto com o texto costuma não ser anunciada pelo leitor de tela.
 */
export function Aviso({ aviso }: { aviso: EstadoDoAviso }) {
  return (
    <p
      className="conta-aviso"
      role="status"
      aria-live="polite"
      data-fora={aviso.visivel ? undefined : ""}
      data-conta-aviso
    >
      {aviso.texto}
    </p>
  )
}

/** Copia o código de rastreio. Sem permissão, o código segue na tela, selecionável. */
export function Copiar({ texto }: { texto: string }) {
  const [estado, setEstado] = useState<"sim" | "falhou" | null>(null)

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto)
      setEstado("sim")
    } catch {
      setEstado("falhou")
    }
    setTimeout(() => setEstado(null), 2500)
  }

  return (
    <button type="button" className="link" onClick={copiar}>
      {estado === "sim" ? "Copiado!" : estado === "falhou" ? "Seleciona e copia" : "Copiar"}
    </button>
  )
}
