"use client"

import { useId, type InputHTMLAttributes, type ReactNode, type Ref } from "react"

/**
 * UM CAMPO DO CHECKOUT
 *
 * Marcação do protótipo: `.campo` > `label` + `input` + `.campo__erro`, com as
 * classes de largura (`campo--3`, `campo--cep`) vindo de fora, porque quem
 * sabe quanto cada campo ocupa é o formulário, não o campo.
 *
 * O ERRO FICA EMBAIXO DO CAMPO, nunca num apanhado no topo. Lista de erros no
 * alto obriga a pessoa a segurar na cabeça qual mensagem era de qual campo
 * enquanto rola a tela. E `aria-describedby` aponta pro erro — é o detalhe
 * que quase sempre falta, e sem ele quem usa leitor de tela ouve "e-mail,
 * inválido" sem ouvir por quê.
 *
 * OS TIPOS VÊM DO `import`, não do namespace global `React`: o monorepo tem
 * duas cópias dos tipos do React (a raiz resolve a 18, a loja a 19) e o
 * namespace global pega a errada, com um erro que é uma parede de "two
 * different types with this name exist".
 */

type Props = {
  rotulo: string
  /**
   * Vazio de propósito nos campos de cartão: o atributo NÃO é renderizado, e
   * o que não tem nome não entra no `FormData` — o número nunca chega ao
   * servidor da loja. Nome vazio também não é enviado pelo navegador, mas o
   * atributo ausente é a versão que dá pra conferir num teste.
   */
  nome: string
  erro?: string
  /** Texto pequeno ao lado do rótulo — "(WhatsApp)", "(opcional)". */
  nota?: string
  /** Vai depois do input, dentro do `.campo`: selo de bandeira, spinner. */
  enfeite?: ReactNode
  /**
   * O campo está esperando uma resposta (o CEP procurando o endereço): é o
   * `aria-busy` da caixa que MOSTRA o `.campo__spinner` — sem ele, o CSS
   * do protótipo deixa o spinner escondido.
   *
   * O ENFEITE FICA SEMPRE, e o que liga e desliga é isto. Pôr e tirar o
   * enfeite trocava o input de lugar na árvore (dentro e fora da caixa), e
   * o React montava outro: no oitavo dígito do CEP o campo perdia o foco.
   */
  ocupado?: boolean
  /** Vai no pé do `.campo`, depois do erro: o "Não sei meu CEP" da conta. */
  depois?: ReactNode
  /** Classe de largura da grade: `campo--3`, `campo--cep`… */
  largura?: string
  ref?: Ref<HTMLInputElement>
} & Omit<InputHTMLAttributes<HTMLInputElement>, "name" | "className">

export function Campo({
  rotulo,
  nome,
  erro,
  nota,
  enfeite,
  ocupado,
  depois,
  largura = "",
  ref,
  ...resto
}: Props) {
  const id = useId()
  const idErro = `erro-${id}`

  return (
    <div className={`campo ${largura}`.trim()}>
      <label htmlFor={id}>
        {rotulo}
        {nota ? <small> {nota}</small> : null}
      </label>
      {enfeite ? (
        <span className="campo__com-icone" aria-busy={ocupado ? true : undefined}>
          <input
            {...resto}
            ref={ref}
            id={id}
            {...(nome ? { name: nome } : {})}
            aria-invalid={erro ? true : undefined}
            aria-describedby={idErro}
          />
          {enfeite}
        </span>
      ) : (
        <input
          {...resto}
          ref={ref}
          id={id}
          {...(nome ? { name: nome } : {})}
          aria-invalid={erro ? true : undefined}
          aria-describedby={idErro}
        />
      )}
      {/*
        A caixa do erro existe SEMPRE, mesmo vazia. Região viva que nasce
        junto com o texto costuma não ser anunciada pelo leitor de tela — e
        `.campo__erro:not(:empty)` no CSS é que decide se ela aparece.
      */}
      <span className="campo__erro" id={idErro} aria-live="polite">
        {erro ?? ""}
      </span>
      {depois}
    </div>
  )
}
