"use client"

import { useEffect, useState, type DragEvent } from "react"
import { Icone } from "@/components/icones"

/**
 * ARRASTAR E SOLTAR — a foto (ou o vídeo) arrastada do computador e solta
 * em cima do quadro sobe como se tivesse sido escolhida no "Escolher": o
 * mesmo caminho (`soltar` é o `escolher` de cada quadro), com a mesma
 * conferência de tipo e de tamanho. Solta em cima da foto que já está lá,
 * troca.
 *
 * Um arquivo por vez, como o "Escolher": com vários, sobe o primeiro e o
 * quadro avisa (`UmPorVez`).
 *
 * Só acende com ARQUIVO (texto ou link arrastado passam direto) e não acende
 * com o quadro ocupado (subindo) ou desligado: aí o arquivo solto não faz
 * nada — e não abre no lugar do painel (`SoltarSoNoQuadro`).
 */
export function useArrastar(soltar: (arquivo: File) => void, desligado = false) {
  /*
    O dragenter e o dragleave chegam de cada pedaço do quadro (o ícone, o
    texto): conta as entradas menos as saídas, e só o zero é "saiu".
  */
  const [dentro, setDentro] = useState(0)
  const [varios, setVarios] = useState(false)
  const arrastando = !desligado && dentro > 0

  const alvo = {
    onDragEnter(e: DragEvent<HTMLElement>) {
      if (desligado || !comArquivo(e)) return
      e.preventDefault()
      setDentro((n) => n + 1)
    },
    onDragOver(e: DragEvent<HTMLElement>) {
      if (desligado || !comArquivo(e)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = "copy"
    },
    onDragLeave(e: DragEvent<HTMLElement>) {
      if (comArquivo(e)) setDentro((n) => Math.max(0, n - 1))
    },
    onDrop(e: DragEvent<HTMLElement>) {
      setDentro(0)
      if (desligado || !comArquivo(e)) return
      e.preventDefault()
      const arquivos = e.dataTransfer.files
      setVarios(arquivos.length > 1)
      if (arquivos[0]) soltar(arquivos[0])
    },
    "data-arrastando": arrastando ? "" : undefined,
  }
  return { alvo, arrastando, varios }
}

/** O aviso de quando vieram vários arquivos de uma vez: subiu só o primeiro. */
export function UmPorVez({ varios }: { varios: boolean }) {
  return varios ? (
    <p className="slot__aviso" data-um-por-vez>
      <Icone nome="alerta" />
      Um arquivo por vez: subi só o primeiro.
    </p>
  ) : null
}

/**
 * Arquivo solto FORA de um quadro não abre no lugar do painel — o que o
 * navegador faz sozinho, e leva junto o que estava sem salvar na gaveta. Lá
 * fora, o cursor mostra que ali não pode. Quem aceita o arquivo (o quadro)
 * já cancelou o evento antes de ele chegar aqui.
 */
export function SoltarSoNoQuadro() {
  useEffect(() => {
    const barrar = (e: globalThis.DragEvent) => {
      if (e.defaultPrevented || !comArquivo(e)) return
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = "none"
    }
    window.addEventListener("dragover", barrar)
    window.addEventListener("drop", barrar)
    return () => {
      window.removeEventListener("dragover", barrar)
      window.removeEventListener("drop", barrar)
    }
  }, [])
  return null
}

/** Arquivo do computador — não texto nem link arrastado. */
function comArquivo(e: { dataTransfer: DataTransfer | null }) {
  return Array.from(e.dataTransfer?.types ?? []).includes("Files")
}
