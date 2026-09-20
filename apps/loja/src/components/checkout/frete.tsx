"use client"

import { useActionState } from "react"
import { escolherFrete } from "@/lib/acoes/checkout"
import { ESTADO_INICIAL, type CheckoutVisivel, type OpcaoDeFrete } from "@/lib/checkout-visivel"
import { emReais } from "@/lib/formato"
import { Casca, Recado, useFechaQuandoSalva, type PropsDaEtapa } from "./etapas"

/**
 * ETAPA 3 — a forma de entrega.
 *
 * A LISTA VEM DO MEDUSA, INTEIRA. Preço e prazo saem de lá já resolvidos pra
 * este carrinho — inclusive o frete grátis, que no Medusa é um segundo preço
 * da mesma opção com regra no valor dos itens. A loja não sabe que existe piso
 * nenhum: ela escreve "Grátis" quando o preço volta zero. No dia em que o piso
 * mudar, ou em que o Frenet passar a cotar por CEP, esta tela não muda.
 *
 * LISTA VAZIA NÃO É TELA VAZIA. Acontece de verdade — CEP fora de qualquer
 * zona cadastrada — e a pessoa precisa entender que o problema é o endereço,
 * não ela.
 */
export function Frete({
  checkout,
  fretes,
  aoSalvar,
  ...casca
}: PropsDaEtapa & { checkout: CheckoutVisivel; fretes: OpcaoDeFrete[] }) {
  const [estado, acao, enviando] = useActionState(escolherFrete, ESTADO_INICIAL)
  useFechaQuandoSalva(estado, aoSalvar)

  const escolhido = fretes.find((f) => f.id === checkout.freteEscolhido)

  return (
    <Casca
      {...casca}
      aoSalvar={aoSalvar}
      resumo={
        escolhido ? (
          <>
            {escolhido.nome} · {escolhido.preco === 0 ? "Grátis" : emReais(escolhido.preco)}
            {escolhido.prazo ? ` · ${escolhido.prazo}` : ""}
          </>
        ) : null
      }
    >
      {fretes.length === 0 ? (
        <p className="etapa__recado" role="alert">
          Não temos entrega pra esse CEP ainda. Confere se o endereço está certo lá em cima — se
          estiver, chama a gente no WhatsApp que a gente dá um jeito.
        </p>
      ) : (
        <form action={acao} className="etapa__form" noValidate>
          <fieldset className="fretes">
            <legend className="sr-only">Formas de entrega</legend>
            {fretes.map((f, i) => (
              <label className="frete" key={f.id}>
                <input
                  type="radio"
                  name="opcao"
                  value={f.id}
                  defaultChecked={
                    checkout.freteEscolhido ? checkout.freteEscolhido === f.id : i === 0
                  }
                />
                <span className="frete__nome">
                  {f.nome}
                  {f.prazo ? <small className="frete__prazo">{f.prazo}</small> : null}
                </span>
                <span className={`frete__preco${f.preco === 0 ? " e-gratis" : ""}`}>
                  {f.preco === 0 ? "Grátis" : emReais(f.preco)}
                </span>
              </label>
            ))}
          </fieldset>

          {estado.erros.opcao ? (
            <p className="campo__erro" role="alert">
              {estado.erros.opcao}
            </p>
          ) : null}
          <Recado estado={estado} />

          <button type="submit" className="btn btn--bloco" disabled={enviando}>
            {enviando ? "Calculando…" : "Continuar"}
          </button>
        </form>
      )}
    </Casca>
  )
}
