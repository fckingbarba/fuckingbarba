"use client"

import { useId, type InputHTMLAttributes } from "react"

/**
 * UM CAMPO — o do checkout da loja (`apps/loja/src/components/checkout/campo.tsx`),
 * sem os enfeites de lá: `.campo` > `label` + `input` + `.campo__erro`.
 *
 * O erro fica embaixo do campo, e o `aria-describedby` aponta pra ele: quem
 * usa leitor de tela ouve o porquê, e não só "inválido".
 */
type Props = {
  rotulo: string
  nome: string
  erro?: string
  /** Texto pequeno ao lado do rótulo — "(opcional)". */
  nota?: string
  largura?: string
} & Omit<InputHTMLAttributes<HTMLInputElement>, "name" | "className">

export function Campo({ rotulo, nome, erro, nota, largura = "", ...resto }: Props) {
  const id = useId()
  const idErro = `erro-${id}`
  return (
    <div className={`campo ${largura}`.trim()}>
      <label htmlFor={id}>
        {rotulo}
        {nota ? <small> {nota}</small> : null}
      </label>
      <input
        {...resto}
        id={id}
        name={nome}
        aria-invalid={erro ? true : undefined}
        aria-describedby={erro ? idErro : undefined}
      />
      <p className="campo__erro" id={idErro} role={erro ? "alert" : undefined}>
        {erro ?? ""}
      </p>
    </div>
  )
}
