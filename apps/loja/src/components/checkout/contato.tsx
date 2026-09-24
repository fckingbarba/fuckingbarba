"use client"

import { useActionState, useState } from "react"
import { Raio } from "@/components/icones"
import { salvarContato } from "@/lib/acoes/checkout"
import {
  ESTADO_INICIAL,
  estadoSemResposta,
  type CheckoutVisivel,
  type EstadoDaEtapa,
} from "@/lib/checkout-visivel"
import { mascararDocumento } from "@/lib/documento"
import { SEM_CONEXAO, semQueda } from "@/lib/rede"
import { mascararTelefone } from "@/lib/telefone"
import { Campo } from "./campo"
import {
  Giro,
  Painel,
  Recado,
  useAvisaOcupado,
  useFechaQuandoSalva,
  useFocaNoErro,
  type PropsDaEtapa,
} from "./etapas"

/** Sem internet, a ação nem volta: o recado fica no passo, e nada do que foi digitado se perde. */
const salvar = (anterior: EstadoDaEtapa, fd: FormData) =>
  semQueda(
    () => salvarContato(anterior, fd),
    () => estadoSemResposta(anterior, fd, SEM_CONEXAO)
  )

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
  const [estado, acao, enviando] = useActionState(salvar, ESTADO_INICIAL)
  useFechaQuandoSalva(estado, aoSalvar)
  useAvisaOcupado(casca, enviando ? "Salvando…" : null)
  const formulario = useFocaNoErro(estado)

  // Documento e celular são controlados só por causa da máscara; o resto é
  // `defaultValue` e vive no próprio DOM, que é onde o navegador já guarda
  // melhor. O celular gravado vem como +5511…; a máscara tira o país.
  const [documento, setDocumento] = useState(mascararDocumento(checkout.documento))
  const [telefone, setTelefone] = useState(mascararTelefone(checkout.entrega.telefone))

  const e = estado.erros
  // O que voltou da ação vem antes do que está gravado: é o que a pessoa
  // acabou de digitar, e o React já deu reset no formulário.
  const v = (campo: string, gravado: string) => estado.valores?.[campo] ?? gravado

  return (
    <Painel etapa="contato" aberta={casca.aberta}>
      <form
        id="form-contato"
        ref={formulario}
        action={acao}
        // Um envio por vez: o Enter num campo e o toque na barra do celular
        // não passam pelo botão travado.
        onSubmit={(ev) => enviando && ev.preventDefault()}
        noValidate
      >
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
            placeholder="Primeiro nome"
            defaultValue={v("nome", checkout.entrega.nome)}
            erro={e.nome}
            required
          />
          {/*
            "Restante do nome", e não "Sobrenome" de novo: o campo ao lado
            pede o PRIMEIRO nome, e quem se chama "Ana Paula de Oliveira
            Santos" precisa saber onde põe o resto. Este nome vai inteiro pra
            etiqueta dos Correios e pra nota fiscal — sobrenome cortado no
            meio é entrega que o entregador não confere.
          */}
          <Campo
            rotulo="Sobrenome"
            nome="sobrenome"
            largura="campo--3"
            autoComplete="family-name"
            placeholder="Restante do nome"
            defaultValue={v("sobrenome", checkout.entrega.sobrenome)}
            erro={e.sobrenome}
            required
          />
          {/*
            Sem `maxLength`: o navegador cortaria o que é colado ANTES da
            máscara ver — "+55 11 98765-4321" chegaria sem os últimos
            dígitos. Quem limita a 11 dígitos é a própria máscara.
          */}
          <Campo
            rotulo="Celular"
            nota="(WhatsApp)"
            nome="telefone"
            largura="campo--3"
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            placeholder="(11) 99999-9999"
            value={telefone}
            onChange={(ev) => setTelefone(mascararTelefone(ev.target.value))}
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
          <button
            type="submit"
            className="btn"
            disabled={enviando}
            aria-busy={enviando || undefined}
          >
            {enviando ? <Giro /> : null}
            {enviando ? "Salvando…" : "Continuar"}
            {enviando ? null : <Raio className="btn__bolt" />}
          </button>
        </div>
      </form>
    </Painel>
  )
}
