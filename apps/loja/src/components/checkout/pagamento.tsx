"use client"

import Link from "next/link"
import { useActionState } from "react"
import { Cadeado } from "@/components/icones"
import { finalizar } from "@/lib/acoes/checkout"
import {
  ESTADO_INICIAL,
  type CheckoutVisivel,
  type ProvedorDePagamento,
} from "@/lib/checkout-visivel"
import { emReais } from "@/lib/formato"
import { Casca, Recado, type PropsDaEtapa } from "./etapas"

/**
 * ETAPA 4 — pagamento, e o pedido.
 *
 * A LISTA DE MEIOS VEM DO MEDUSA. Hoje tem um só, o `pp_system_default`, que
 * APROVA SEM COBRAR: serve pra deixar o fluxo de pé, não pra vender. Por isso
 * o botão da sacola ainda aponta pro `/em-breve` — `CHECKOUT_ABERTO`, em
 * `lib/site.ts`, é a linha que liga isto de verdade, e ela só vira `true`
 * quando houver pagamento real.
 *
 * ENQUANTO FOR SIMBÓLICO, A TELA DIZ ISSO. Não há desenho de cartão, não há
 * cadeado prometendo criptografia de pagamento, não há "pagamento aprovado".
 * Escrever qualquer uma dessas coisas sobre um provedor que não cobra nada
 * seria mentir pro cliente na única tela em que ele está entregando confiança.
 *
 * NÃO TEM `useFechaQuandoSalva`: quando dá certo, esta etapa não fecha — a
 * ação redireciona pra tela de obrigado e esta página deixa de existir.
 */
export function Pagamento({
  checkout,
  provedores,
  aoSalvar,
  ...casca
}: PropsDaEtapa & { checkout: CheckoutVisivel; provedores: ProvedorDePagamento[] }) {
  const [estado, acao, enviando] = useActionState(finalizar, ESTADO_INICIAL)

  const pronto = Boolean(checkout.email && checkout.entrega.cep && checkout.freteEscolhido)

  return (
    <Casca {...casca} aoSalvar={aoSalvar}>
      {provedores.length === 0 ? (
        <p className="etapa__recado" role="alert">
          Nenhuma forma de pagamento disponível agora. Chama a gente no WhatsApp que a gente fecha o
          pedido por lá.
        </p>
      ) : (
        <form action={acao} className="etapa__form" noValidate>
          <fieldset className="pagamentos">
            <legend className="sr-only">Formas de pagamento</legend>
            {provedores.map((p, i) => (
              <label className="pagamento" key={p.id}>
                <input type="radio" name="provedor" value={p.id} defaultChecked={i === 0} />
                <span className="pagamento__nome">
                  {p.nome}
                  {p.descricao ? <small className="pagamento__desc">{p.descricao}</small> : null}
                </span>
              </label>
            ))}
          </fieldset>

          {provedores.some((p) => p.simbolico) ? (
            <p className="pagamento__aviso">
              <b>Este pedido não é cobrado agora.</b> Ele entra na fila e a gente chama você pra
              acertar o pagamento antes de despachar.
            </p>
          ) : null}

          {estado.erros.provedor ? (
            <p className="campo__erro" role="alert">
              {estado.erros.provedor}
            </p>
          ) : null}
          <Recado estado={estado} />

          <button
            type="submit"
            className="btn btn--bloco btn--fechar"
            disabled={enviando || !pronto}
          >
            {enviando ? "Fechando o pedido…" : `Fazer o pedido · ${emReais(checkout.total)}`}
          </button>

          {/* O texto inteiro num <span> só: o pai é flex, e sem isto cada
              pedaço em volta do link vira um item e a frase quebra em três. */}
          <p className="pagamento__rodape">
            <Cadeado aria-hidden="true" />
            <span>
              Ao fazer o pedido você aceita nossas{" "}
              <Link href="/trocas">regras de troca e devolução</Link>, incluindo os 7 dias de
              arrependimento que a lei garante.
            </span>
          </p>
        </form>
      )}
    </Casca>
  )
}
