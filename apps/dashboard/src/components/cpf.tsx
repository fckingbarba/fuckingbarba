"use client"

import { useState } from "react"

/**
 * O CPF QUE O DONO PEDE PRA VER. O número inteiro só chega aqui quando quem
 * está usando é o dono (o backend não manda pra operação); mesmo assim ele
 * abre mascarado, e só se mostra no clique — o painel fica aberto em balcão,
 * em tela compartilhada, e um CPF à vista é um CPF que vaza.
 */
export function Cpf({ mascarado, inteiro }: { mascarado: string; inteiro: string | null }) {
  const [aberto, setAberto] = useState(false)
  if (!inteiro) return <span className="oculto">{mascarado}</span>
  return (
    <span className="cpf">
      <span className="num">{aberto ? inteiro : mascarado}</span>
      <button type="button" className="link pequeno" onClick={() => setAberto(!aberto)}>
        {aberto ? "Esconder" : "Mostrar"}
      </button>
    </span>
  )
}
