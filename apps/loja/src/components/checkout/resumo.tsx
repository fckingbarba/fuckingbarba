"use client"

import Image from "next/image"
import Link from "next/link"
import { useActionState, useEffect, useRef, useState, useTransition } from "react"
import { Caminhao, Cadeado, Escudo, Relogio, SetaBaixo } from "@/components/icones"
import { CONFIANCA, DEPOIMENTOS } from "@/conteudo/checkout"
import { aplicarCupom, removerCupom } from "@/lib/acoes/checkout"
import { ESTADO_INICIAL, type CheckoutVisivel } from "@/lib/checkout-visivel"
import { emReais } from "@/lib/formato"
import { PARCELAS_SEM_JUROS, PARCELA_MINIMA } from "@/lib/site"

/**
 * O PEDIDO, DO LADO.
 *
 * No desktop fica grudado à direita enquanto a pessoa preenche; no celular
 * sobe pro topo (`order: -1` no CSS) e fecha num `<details>`, porque num
 * formulário de três passos a pergunta "quanto mesmo eu vou pagar?" aparece o
 * tempo todo e a resposta não pode estar a três rolagens de distância.
 *
 * TODO NÚMERO AQUI VEIO DO MEDUSA. Nada nesta tela soma, desconta ou
 * arredonda: se ela fizesse a própria conta, um dia discordaria do que foi
 * cobrado, e quem descobre isso é o cliente com o cartão na mão.
 *
 * O FRETE tem três estados, e confundi-los é o erro clássico: ainda não
 * escolhido (`null`) mostra "a calcular"; escolhido e zero mostra "Grátis";
 * escolhido e maior que zero mostra o valor. Tratar `null` como zero
 * anunciaria frete grátis pra quem ainda nem digitou o CEP.
 */

const ICONES = { escudo: Escudo, cadeado: Cadeado, caminhao: Caminhao, relogio: Relogio }

/** Onde o resumo é a coluna do lado. Abaixo disto ele sobe pro topo (`checkout.css`). */
const COLUNA_DO_LADO = "(min-width: 901px)"

/*
 * `recalculando`: uma troca de frete, de bump ou de chip está indo e voltando
 * do Medusa. O dinheiro daqui esmaece e pulsa até a resposta (o mesmo
 * desenho da espera da sacola, em `checkout-loja.css`): o número na tela
 * ainda é o de antes, e vai mudar.
 */
export function Resumo({
  checkout,
  recalculando,
}: {
  checkout: CheckoutVisivel
  recalculando: boolean
}) {
  const { itens, subtotal, desconto, frete, total, unidades } = checkout
  const parcela = total / PARCELAS_SEM_JUROS
  const detalhes = useRef<HTMLDetailsElement>(null)

  /*
   * NO DESKTOP, SEMPRE ABERTO. Lá o resumo é a coluna do lado: fechar não
   * libera espaço nenhum pro formulário, só esconde o que a pessoa vai
   * pagar. E o Next guarda a página quando a pessoa sai (é o `<Activity>`),
   * com o `<details>` do jeito que ficou — então quem tinha fechado voltava
   * pro checkout e achava o resumo fechado. Este efeito roda de novo toda
   * vez que a página volta pra tela, e reabre; e reabre também se a janela
   * crescer até virar coluna.
   *
   * No celular ele sobe pro topo, e o toque no cabeçalho abre e fecha.
   */
  useEffect(() => {
    const lado = window.matchMedia(COLUNA_DO_LADO)
    const abrir = () => {
      if (lado.matches && detalhes.current) detalhes.current.open = true
    }
    abrir()
    lado.addEventListener("change", abrir)
    return () => lado.removeEventListener("change", abrir)
  }, [])

  return (
    <aside
      className="resumo"
      aria-labelledby="t-resumo"
      data-recalculando={recalculando ? "" : undefined}
      aria-busy={recalculando || undefined}
    >
      <details open ref={detalhes}>
        <summary
          onClick={(ev) => {
            // Coluna do lado não fecha (ver o efeito acima). O Enter e o
            // espaço no `<summary>` também chegam aqui como clique.
            if (window.matchMedia(COLUNA_DO_LADO).matches) ev.preventDefault()
          }}
        >
          <span id="t-resumo">Resumo do pedido</span>
          {/* O total e a seta NA MESMA LINHA, como no protótipo: a seta é o
              chevron que abre e fecha, e fica ao lado de quem ela resume. */}
          <span className="resumo__mini">
            <b>{emReais(total)}</b>
            <SetaBaixo aria-hidden="true" />
          </span>
        </summary>

        <div className="resumo__miolo">
          <ul className="itens">
            {itens.map((item) => (
              <li className="item" key={item.id}>
                <span className="item__foto">
                  {item.imagem ? (
                    <Image src={item.imagem} alt="" width={54} height={54} sizes="54px" />
                  ) : null}
                  <span className="item__qtd" aria-hidden="true">
                    {item.quantidade}
                  </span>
                </span>
                <span>
                  <h3 className="item__nome">
                    {item.handle ? (
                      <Link href={`/produtos/${item.handle}`}>{item.nome}</Link>
                    ) : (
                      item.nome
                    )}
                  </h3>
                  <p className="item__un">
                    {item.quantidade} × {emReais(item.precoUnitario)}
                  </p>
                </span>
                <span className="item__valor">{emReais(item.total)}</span>
              </li>
            ))}
          </ul>

          <Cupom checkout={checkout} />

          <dl className="totais">
            <div className="totais__linha">
              <dt>
                Subtotal
                <span className="sr-only">
                  {` — ${unidades} ${unidades === 1 ? "item" : "itens"}`}
                </span>
              </dt>
              <dd>{emReais(subtotal)}</dd>
            </div>

            <div className="totais__linha">
              <dt>Frete</dt>
              <dd data-gratis={frete === 0 ? "" : undefined}>
                {frete === null ? "a calcular" : frete === 0 ? "Grátis" : emReais(frete)}
              </dd>
            </div>

            <div className="totais__linha" data-desconto hidden={desconto <= 0}>
              <dt>Desconto</dt>
              <dd>−{emReais(desconto)}</dd>
            </div>

            <div className="totais__linha totais__total">
              <dt>Total</dt>
              <dd>{emReais(total)}</dd>
            </div>
          </dl>

          <p className="totais__parcela">
            {parcela >= PARCELA_MINIMA
              ? `ou ${PARCELAS_SEM_JUROS}x de ${emReais(parcela)} sem juros`
              : ""}
          </p>

          <Depoimento />

          <ul className="confianca">
            {CONFIANCA.map((g) => {
              const Icone = ICONES[g.icone]
              return (
                <li key={g.texto}>
                  <Icone aria-hidden="true" /> {g.texto}
                </li>
              )
            })}
          </ul>
        </div>
      </details>
    </aside>
  )
}

/* ── cupom ────────────────────────────────────────────────────────────────── */

/**
 * QUEM VALIDA É O MEDUSA. Não existe lista de cupom neste código — cupom
 * escrito no navegador é desconto que qualquer um lê no código-fonte.
 *
 * O cupom do order bump não aparece aqui: ele é aplicado pela caixinha do
 * passo 3, e mostrar o código dele nesta lista seria publicar a oferta "só
 * dessa tela" pra quem nem marcou.
 */
function Cupom({ checkout }: { checkout: CheckoutVisivel }) {
  const [estado, acao, enviando] = useActionState(aplicarCupom, ESTADO_INICIAL)
  const [aberto, setAberto] = useState(checkout.cupons.length > 0)
  const [tirando, comecar] = useTransition()

  return (
    <div className="cupom">
      <button
        type="button"
        className="cupom__abre"
        aria-expanded={aberto}
        aria-controls="cupom-form"
        onClick={() => setAberto((a) => !a)}
      >
        Tem cupom de desconto?
      </button>

      <form
        className="cupom__form"
        id="cupom-form"
        data-aberto={aberto ? "" : undefined}
        action={acao}
      >
        <label className="sr-only" htmlFor="cupom">
          Código do cupom
        </label>
        <input id="cupom" name="cupom" type="text" autoComplete="off" placeholder="CÓDIGO" />
        <button type="submit" disabled={enviando}>
          {enviando ? "…" : "Aplicar"}
        </button>
      </form>

      {estado.erros.cupom ? (
        <p className="cupom__msg" data-tipo="erro" role="alert">
          {estado.erros.cupom}
        </p>
      ) : null}

      {checkout.cupons.map((c) => (
        <p className="cupom__msg" data-tipo="ok" key={c.codigo}>
          {c.codigo} aplicado.{" "}
          <button
            type="button"
            className="cupom__abre"
            disabled={tirando}
            onClick={() => comecar(async () => void (await removerCupom(c.codigo)))}
          >
            tirar
          </button>
        </p>
      ))}
    </div>
  )
}

/* ── depoimento ───────────────────────────────────────────────────────────── */

/**
 * Um depoimento por vez, trocando sozinho.
 *
 * SÃO RELATOS REAIS, e é por isso que são dois. O terceiro do protótipo era
 * um lembrete escrito "[Cole aqui o texto de um cliente real]" e não subiu;
 * quando houver um terceiro de verdade, ele entra em `conteudo/checkout.ts`
 * do jeito que a pessoa escreveu.
 *
 * Nada gira se houver só um — carrossel de um item é animação à toa. E nada
 * gira pra quem pediu menos movimento no sistema.
 */
function Depoimento() {
  const [i, setI] = useState(0)

  useEffect(() => {
    if (DEPOIMENTOS.length < 2) return
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return

    const t = setInterval(() => setI((n) => (n + 1) % DEPOIMENTOS.length), 7000)
    return () => clearInterval(t)
  }, [])

  const atual = DEPOIMENTOS[i]
  if (!atual) return null

  return (
    <figure className="depoimento" aria-live="off">
      <p className="depoimento__rot">
        <span>Quem já comprou</span>
      </p>
      <blockquote className="depoimento__txt">{atual.texto}</blockquote>
      <figcaption className="depoimento__quem">
        <span>{atual.quem}</span>
      </figcaption>
      {DEPOIMENTOS.length > 1 ? (
        <span className="depoimento__pontos" aria-hidden="true">
          {DEPOIMENTOS.map((d, n) => (
            <span key={d.quem} data-on={n === i ? "" : undefined} />
          ))}
        </span>
      ) : null}
    </figure>
  )
}
