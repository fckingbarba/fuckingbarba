"use client"

import Image from "next/image"
import Link from "next/link"
import { type CheckoutVisivel } from "@/lib/checkout-visivel"
import { emReais } from "@/lib/formato"

/**
 * O PEDIDO, DO LADO.
 *
 * No desktop fica grudado à direita enquanto a pessoa preenche; no celular vai
 * pro fim da página, depois das etapas — e com um resumo de uma linha no topo,
 * porque num formulário de quatro etapas a pergunta "quanto mesmo eu vou
 * pagar?" aparece o tempo todo e a resposta não pode estar a três rolagens de
 * distância.
 *
 * TODO NÚMERO AQUI VEIO DO MEDUSA. Nada nesta tela soma, desconta ou
 * arredonda: se ela fizesse a própria conta, um dia discordaria do que foi
 * cobrado, e quem descobre isso é o cliente, com o cartão na mão.
 *
 * O FRETE tem três estados diferentes, e confundi-los é o erro clássico:
 * ainda não escolhido (`null`) mostra "a calcular"; escolhido e zero mostra
 * "Grátis"; escolhido e maior que zero mostra o valor. Tratar `null` como zero
 * anunciaria frete grátis pra quem ainda nem digitou o CEP.
 */
export function Resumo({ checkout }: { checkout: CheckoutVisivel }) {
  const { itens, subtotal, desconto, frete, total, unidades } = checkout

  return (
    <aside className="resumo" aria-labelledby="resumo-titulo">
      <h2 className="resumo__titulo" id="resumo-titulo">
        Seu pedido
        <span className="resumo__unidades">
          {unidades} {unidades === 1 ? "item" : "itens"}
        </span>
      </h2>

      <ul className="resumo__itens">
        {itens.map((item) => (
          <li className="resumo__item" key={item.id}>
            <span className="resumo__foto">
              {item.imagem ? (
                <Image src={item.imagem} alt="" width={56} height={56} sizes="56px" />
              ) : null}
              <span className="resumo__qtd" aria-hidden="true">
                {item.quantidade}
              </span>
            </span>
            <span className="resumo__nome">
              {item.handle ? <Link href={`/produtos/${item.handle}`}>{item.nome}</Link> : item.nome}
              {item.variante ? <small>{item.variante}</small> : null}
              <span className="sr-only">{` — ${item.quantidade} unidade${item.quantidade === 1 ? "" : "s"}`}</span>
            </span>
            <span className="resumo__valor">{emReais(item.total)}</span>
          </li>
        ))}
      </ul>

      <dl className="resumo__contas">
        <div>
          <dt>Produtos</dt>
          <dd>{emReais(subtotal)}</dd>
        </div>

        {desconto > 0 ? (
          <div className="resumo__desconto">
            <dt>Desconto</dt>
            <dd>−{emReais(desconto)}</dd>
          </div>
        ) : null}

        <div>
          <dt>Entrega</dt>
          <dd>
            {frete === null ? (
              <span className="resumo__pendente">a calcular</span>
            ) : frete === 0 ? (
              <span className="resumo__gratis">Grátis</span>
            ) : (
              emReais(frete)
            )}
          </dd>
        </div>

        <div className="resumo__total">
          <dt>Total</dt>
          <dd>{emReais(total)}</dd>
        </div>
      </dl>

      <p className="resumo__volta">
        <Link href="/">Continuar comprando</Link>
      </p>
    </aside>
  )
}
