"use client"

import { useActionState, useState } from "react"
import { Raio } from "@/components/icones"
import { salvarContato } from "@/lib/acoes/checkout"
import { ESTADO_INICIAL, type CheckoutVisivel } from "@/lib/checkout-visivel"
import { mascararDocumento } from "@/lib/documento"
import { Campo } from "./campo"
import { Painel, Recado, useFechaQuandoSalva, type PropsDaEtapa } from "./etapas"

/**
 * PASSO 1 — e-mail, nome, celular e documento.
 *
 * O e-mail vem primeiro porque é o único campo cujo valor a loja precisa
 * mesmo que a compra não termine: é por onde a gente avisa que o carrinho
 * ficou pra trás. Pedir depois seria pedir tarde.
 *
 * CPF OU CNPJ NO MESMO CAMPO. Obrigar a escolher o tipo antes de digitar é um
 * clique a mais pra todo mundo por causa da minoria que compra como empresa —
 * e o tamanho do número já diz qual é. A máscara se reorganiza sozinha no 12º
 * caractere, que é onde o CNPJ se revela.
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
    <Painel
      etapa="contato"
      aberta={casca.aberta}
      dica="A gente só precisa de um jeito de te avisar do pedido."
    >
      <form id="form-contato" action={acao} noValidate>
        <div className="campos">
          <Campo
            rotulo="E-mail"
            nome="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="voce@email.com"
            defaultValue={v("email", checkout.email)}
            erro={e.email}
            required
          />
          <Campo
            rotulo="Nome"
            nome="nome"
            largura="campo--3"
            autoComplete="given-name"
            placeholder="Como está no documento"
            defaultValue={v("nome", checkout.entrega.nome)}
            erro={e.nome}
            required
          />
          <Campo
            rotulo="Sobrenome"
            nome="sobrenome"
            largura="campo--3"
            autoComplete="family-name"
            defaultValue={v("sobrenome", checkout.entrega.sobrenome)}
            erro={e.sobrenome}
            required
          />
          <Campo
            rotulo="Celular"
            nota="(WhatsApp)"
            nome="telefone"
            largura="campo--3"
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            placeholder="(11) 99999-9999"
            defaultValue={v("telefone", checkout.entrega.telefone)}
            erro={e.telefone}
            required
          />
          <Campo
            rotulo="CPF ou CNPJ"
            nota="(pra nota fiscal)"
            nome="documento"
            largura="campo--3"
            inputMode="text"
            autoComplete="off"
            placeholder="000.000.000-00"
            value={documento}
            onChange={(ev) => setDocumento(mascararDocumento(ev.target.value))}
            erro={e.documento}
            required
          />
        </div>

        <Recado estado={estado} />

        <div className="acoes">
          <span />
          <button type="submit" className="btn" disabled={enviando}>
            {enviando ? "Salvando…" : "Continuar"}
            <Raio className="btn__bolt" />
          </button>
        </div>
      </form>
    </Painel>
  )
}
