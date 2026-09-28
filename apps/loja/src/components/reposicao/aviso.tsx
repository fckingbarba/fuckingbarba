"use client"

import Image from "next/image"
import { useId } from "react"
import { esquecerFicha } from "@/components/ficha/ler-ficha"
import "@/estilos/reposicao.css"
import type { AvisoDaReposicao } from "@/lib/ficha"

/**
 * O CARTÃO DO AVISO DA REPOSIÇÃO NA HOME (entrega 0188) — quem abre é
 * `./na-home.tsx`, que só baixa este arquivo (e o CSS dele) quando há o que
 * avisar. Num canto, sem cobrir a página: a foto, "Pelas nossas contas", o
 * que acaba e o "Refazer o pedido" (o mesmo dos e-mails). O X fecha até a
 * próxima reposição.
 */

const X = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M5 5l14 14M19 5L5 19"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="square"
      fill="none"
    />
  </svg>
)

export function AvisoDaReposicaoNaHome({
  aviso,
  aoFechar,
}: {
  aviso: AvisoDaReposicao
  aoFechar: () => void
}) {
  const titulo = useId()
  return (
    <aside className="rp-aviso" aria-labelledby={titulo} data-aviso-reposicao={aviso.chave}>
      {aviso.produto.imagem ? (
        <span className="rp-foto">
          <Image src={aviso.produto.imagem} alt="" width={56} height={56} sizes="56px" />
        </span>
      ) : null}
      <div className="rp-corpo">
        <p className="rp-antes">Pelas nossas contas</p>
        <p className="rp-titulo" id={titulo}>
          {aviso.titulo}
        </p>
        {/*
          <a>, e não <Link>: o /voltar monta a sacola, e o Link o pediria antes do clique.
          Depois dele (e talvez de uma compra), a próxima página pergunta a ficha de novo.
        */}
        <a className="rp-botao" href={aviso.voltar} onClick={esquecerFicha}>
          Refazer o pedido
        </a>
      </div>
      <button type="button" className="rp-fechar" aria-label="Fechar o lembrete" onClick={aoFechar}>
        {X}
      </button>
    </aside>
  )
}
