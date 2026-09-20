"use client"

import { useId, type InputHTMLAttributes, type Ref, type SelectHTMLAttributes } from "react"

/**
 * UM CAMPO DE FORMULÁRIO
 *
 * Existe porque campo com rótulo, erro e `aria` certo tem seis detalhes que
 * ninguém repete seis vezes sem errar um — e o que se erra é sempre o mesmo:
 * o `aria-describedby` que não aponta pro erro, e aí quem usa leitor de tela
 * ouve "e-mail, campo inválido" sem ouvir por quê.
 *
 * O ERRO FICA EMBAIXO DO CAMPO, nunca num apanhado no topo. Lista de erros no
 * alto obriga a pessoa a segurar na cabeça qual mensagem era de qual campo
 * enquanto rola a tela.
 *
 * `aria-live="polite"` no erro: quando a resposta do servidor volta, o leitor
 * de tela anuncia sem interromper o que a pessoa estava ouvindo.
 */

/**
 * OS TIPOS VÊM DO `import`, não do namespace global `React`.
 *
 * O monorepo tem duas cópias dos tipos do React — a raiz resolve a 18, a loja
 * a 19 — e o namespace global pega a errada. O sintoma é uma parede de "two
 * different types with this name exist, but they are unrelated" em cima de
 * `ref`. Importando de "react", a resolução de módulo acha a cópia da loja,
 * que é a mesma que renderiza este JSX.
 */
type Props = {
  rotulo: string
  nome: string
  erro?: string
  /** Dica curta embaixo do rótulo, pra explicar antes de errar em vez de depois. */
  dica?: string
  className?: string
  ref?: Ref<HTMLInputElement>
} & Omit<InputHTMLAttributes<HTMLInputElement>, "name" | "className">

export function Campo({ rotulo, nome, erro, dica, className = "", ...resto }: Props) {
  const id = useId()
  const idErro = `${id}-erro`
  const idDica = `${id}-dica`

  const descrito = [dica ? idDica : null, erro ? idErro : null].filter(Boolean).join(" ")

  return (
    <div className={`campo ${erro ? "campo--erro" : ""} ${className}`.trim()}>
      <label className="campo__rotulo" htmlFor={id}>
        {rotulo}
      </label>
      {dica ? (
        <p className="campo__dica" id={idDica}>
          {dica}
        </p>
      ) : null}
      <input
        {...resto}
        id={id}
        name={nome}
        className="campo__entrada"
        aria-invalid={erro ? true : undefined}
        aria-describedby={descrito || undefined}
      />
      <p className="campo__erro" id={idErro} aria-live="polite">
        {erro ?? ""}
      </p>
    </div>
  )
}

/**
 * O mesmo, com `<select>`. Só existe pro estado — é o único campo do endereço
 * com lista fechada, e digitar "São Paulo" no lugar de "SP" é o erro mais
 * comum de endereço brasileiro em formulário livre.
 */
type PropsSelecao = {
  rotulo: string
  nome: string
  erro?: string
  opcoes: readonly string[]
  className?: string
  ref?: Ref<HTMLSelectElement>
} & Omit<SelectHTMLAttributes<HTMLSelectElement>, "name" | "className">

export function Selecao({ rotulo, nome, erro, opcoes, className = "", ...resto }: PropsSelecao) {
  const id = useId()
  const idErro = `${id}-erro`

  return (
    <div className={`campo ${erro ? "campo--erro" : ""} ${className}`.trim()}>
      <label className="campo__rotulo" htmlFor={id}>
        {rotulo}
      </label>
      <select
        {...resto}
        id={id}
        name={nome}
        className="campo__entrada"
        aria-invalid={erro ? true : undefined}
        aria-describedby={erro ? idErro : undefined}
      >
        <option value="">—</option>
        {opcoes.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      <p className="campo__erro" id={idErro} aria-live="polite">
        {erro ?? ""}
      </p>
    </div>
  )
}
