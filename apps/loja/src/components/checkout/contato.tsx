"use client"

import { useActionState, useState } from "react"
import { salvarContato } from "@/lib/acoes/checkout"
import { ESTADO_INICIAL, type CheckoutVisivel } from "@/lib/checkout-visivel"
import { mascararDocumento } from "@/lib/documento"
import { Campo } from "./campo"
import { Casca, Recado, useFechaQuandoSalva, type PropsDaEtapa } from "./etapas"

/**
 * ETAPA 1 — e-mail, nome, telefone e documento.
 *
 * O e-mail vem primeiro porque é o único campo cujo valor a loja precisa
 * mesmo que a compra não termine: é por onde a gente avisa que o carrinho
 * ficou pra trás. Pedir depois seria pedir tarde.
 *
 * CPF OU CNPJ NO MESMO CAMPO. Obrigar a escolher o tipo antes de digitar é um
 * clique a mais pra todo mundo por causa da minoria que compra como empresa —
 * e o tamanho do número já diz qual é. A máscara se reorganiza sozinha no 12º
 * caractere.
 */
export function Contato({
  checkout,
  aoSalvar,
  ...casca
}: PropsDaEtapa & { checkout: CheckoutVisivel }) {
  const [estado, acao, enviando] = useActionState(salvarContato, ESTADO_INICIAL)
  useFechaQuandoSalva(estado, aoSalvar)

  // O documento é controlado só por causa da máscara; o resto é `defaultValue`
  // e vive no próprio DOM, que é onde o navegador já guarda melhor.
  const [documento, setDocumento] = useState(mascararDocumento(checkout.documento))

  const e = estado.erros
  // O que voltou da ação vem antes do que está gravado: é o que a pessoa
  // acabou de digitar, e o React já deu reset no formulário.
  const v = (campo: string, gravado: string) => estado.valores?.[campo] ?? gravado

  return (
    <Casca
      {...casca}
      aoSalvar={aoSalvar}
      resumo={
        checkout.email ? (
          <>
            {checkout.entrega.nome} {checkout.entrega.sobrenome} · {checkout.email}
          </>
        ) : null
      }
    >
      <form action={acao} className="etapa__form" noValidate>
        <Campo
          rotulo="E-mail"
          nome="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          defaultValue={v("email", checkout.email)}
          erro={e.email}
          dica="É pra onde vai a confirmação e o código de rastreio."
          required
        />

        <div className="campo-par">
          <Campo
            rotulo="Nome"
            nome="nome"
            autoComplete="given-name"
            defaultValue={v("nome", checkout.entrega.nome)}
            erro={e.nome}
            required
          />
          <Campo
            rotulo="Sobrenome"
            nome="sobrenome"
            autoComplete="family-name"
            defaultValue={v("sobrenome", checkout.entrega.sobrenome)}
            erro={e.sobrenome}
            required
          />
        </div>

        <div className="campo-par">
          <Campo
            rotulo="Celular"
            nome="telefone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="(11) 90000-0000"
            defaultValue={v("telefone", checkout.entrega.telefone)}
            erro={e.telefone}
            required
          />
          <Campo
            rotulo="CPF ou CNPJ"
            nome="documento"
            inputMode="text"
            value={documento}
            onChange={(ev) => setDocumento(mascararDocumento(ev.target.value))}
            erro={e.documento}
            dica="A nota fiscal sai com ele."
            required
          />
        </div>

        <Recado estado={estado} />

        <button type="submit" className="btn btn--bloco" disabled={enviando}>
          {enviando ? "Salvando…" : "Continuar"}
        </button>
      </form>
    </Casca>
  )
}
