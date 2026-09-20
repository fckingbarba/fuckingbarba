"use client"

import Image from "next/image"
import { useEffect, useRef, useState, useTransition } from "react"
import {
  Caminhao,
  Cartao,
  EscudoCerto,
  Raio,
  Relogio,
  Sacola,
  Triangulo,
} from "@/components/icones"
import { EVENTO_SACOLA } from "@/components/sacola/contexto"
import { adicionar } from "@/lib/acoes/carrinho"
import type { CarrinhoVisivel } from "@/lib/carrinho-visivel"
import { emReais } from "@/lib/formato"
import type { DegrauDeQuantidade } from "@/lib/medusa"
import { useFrete } from "@/components/configuracoes/contexto"
import { frasesDoFrete } from "@/lib/configuracoes"
import { PARCELA_MINIMA, PARCELAS_SEM_JUROS } from "@/lib/site"

/**
 * A COLUNA DE COMPRA
 *
 * Preço, degrau de quantidade, quantidade, botão e garantias — e a barra fixa
 * que aparece quando o botão sai de vista. Tudo num componente só porque
 * tudo lê o MESMO estado: qual degrau está escolhido. Separar a barra fixa
 * num componente irmão exigiria contexto ou estado subindo pro servidor pra
 * manter os dois preços iguais, e preço diferente em dois lugares da mesma
 * tela é o bug que mais custa confiança.
 *
 * O QUE ESTE COMPONENTE NÃO FAZ: conta. Ele escolhe uma VARIANTE e manda o
 * id pro servidor. O preço que aparece aqui veio do Medusa (via
 * `escadaDeQuantidade`), e o preço que vai ser cobrado é o que o Medusa
 * calcular no carrinho — os dois saem da mesma fonte. É por isso que os kits
 * existem como produto: sem eles, esta tela mostraria R$ 149,90 e o carrinho
 * cobraria R$ 159,80.
 */

const MAX = 10

export function Compra({
  nome,
  foto,
  degraus,
  precoCheio,
  estoque,
}: {
  nome: string
  foto: string | null
  degraus: readonly DegrauDeQuantidade[]
  /** O riscado, quando existe promoção valendo no degrau de 1 unidade. */
  precoCheio: number | null
  /** Unidades restantes do avulso, quando o Medusa controla estoque. */
  estoque: number | null
}) {
  const frases = frasesDoFrete(useFrete())
  const [escolhido, setEscolhido] = useState(0)
  const [quantidade, setQuantidade] = useState(1)
  const [recado, setRecado] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null)
  const [enviando, comecar] = useTransition()
  const botao = useRef<HTMLButtonElement>(null)

  const degrau = degraus[escolhido] ?? degraus[0]
  if (!degrau) return null

  const total = degrau.preco * quantidade
  const parcela = total / PARCELAS_SEM_JUROS
  const parcelavel = parcela >= PARCELA_MINIMA

  /*
   * O riscado só vale pro degrau de uma unidade: é ele que está na promoção.
   * Multiplicar esse "de" pelos kits inventaria um preço cheio que o kit
   * nunca teve — exatamente a conta inflada que o degrau existe pra evitar.
   */
  const riscado = degrau.unidades === 1 && precoCheio ? precoCheio * quantidade : null

  function comprar() {
    setRecado(null)
    comecar(async () => {
      const r = await adicionar(degrau.varianteId, quantidade)
      if (!r.ok) {
        setRecado({ tipo: "erro", texto: r.erro })
        return
      }
      setRecado({ tipo: "ok", texto: "Na sacola." })
      avisarSacola(r.carrinho)
    })
  }

  return (
    <>
      <div itemProp="offers" itemScope itemType="https://schema.org/Offer">
        <meta itemProp="priceCurrency" content="BRL" />
        {/*
          O preço indexado é o do produto DESTA página — uma unidade —, e não
          o do degrau escolhido. O Google lê o HTML que sai do servidor; um
          número que muda no clique não chega nele, e um preço de kit no lugar
          do preço do produto faria o resultado de busca anunciar R$ 222,90
          por um frasco.
        */}
        <meta itemProp="price" content={(degraus[0]?.preco ?? 0).toFixed(2)} />
        <link
          itemProp="availability"
          href={
            degraus[0]?.disponivel ? "https://schema.org/InStock" : "https://schema.org/OutOfStock"
          }
        />
        <meta itemProp="itemCondition" content="https://schema.org/NewCondition" />

        {/*
          Sem isto o Search Console acusa "campo ausente" e a ficha de produto
          sai crua, sem o selo de devolução. São os 7 dias do art. 49 do CDC,
          que valem pra toda compra pela internet e não dependem de política
          nossa — por isso podem ser declarados antes de existir qualquer
          política escrita.

          `shippingDetails` fica de fora até o Frenet entrar: declarar um
          frete fixo aqui faria o Google anunciar um valor que o checkout não
          vai cobrar, e aí a reclamação chega antes do pedido.
        */}
        <div
          itemProp="hasMerchantReturnPolicy"
          itemScope
          itemType="https://schema.org/MerchantReturnPolicy"
        >
          <meta itemProp="applicableCountry" content="BR" />
          <link
            itemProp="returnPolicyCategory"
            href="https://schema.org/MerchantReturnFiniteReturnWindow"
          />
          <meta itemProp="merchantReturnDays" content="7" />
          <link itemProp="returnMethod" href="https://schema.org/ReturnByMail" />
          <link itemProp="returnFees" href="https://schema.org/FreeReturn" />
        </div>

        <p className="compra__precos">
          {riscado ? <span className="compra__de">{emReais(riscado)}</span> : null}
          <span className="compra__por">{emReais(total)}</span>
        </p>

        {parcelavel ? (
          <p className="compra__pagamento-linha">
            <b>
              {PARCELAS_SEM_JUROS}x de {emReais(parcela)}
            </b>{" "}
            sem juros · ou à vista no Pix
          </p>
        ) : (
          <p className="compra__pagamento-linha">
            <b>À vista no Pix</b> ou no cartão
          </p>
        )}
      </div>

      {degraus.length > 1 ? (
        <Degraus
          degraus={degraus}
          escolhido={escolhido}
          aoEscolher={(i) => {
            setEscolhido(i)
            setRecado(null)
          }}
        />
      ) : null}

      <div className="compra__acao">
        <div className="compra__qtd">
          <button
            type="button"
            aria-label="Diminuir quantidade"
            disabled={quantidade <= 1}
            onClick={() => setQuantidade((q) => Math.max(1, q - 1))}
          >
            −
          </button>
          <label className="sr-only" htmlFor="qtd">
            Quantidade
          </label>
          <input
            id="qtd"
            type="number"
            min={1}
            max={MAX}
            step={1}
            inputMode="numeric"
            value={quantidade}
            onChange={(e) => setQuantidade(limita(e.target.valueAsNumber))}
          />
          <button
            type="button"
            aria-label="Aumentar quantidade"
            disabled={quantidade >= MAX}
            onClick={() => setQuantidade((q) => Math.min(MAX, q + 1))}
          >
            +
          </button>
        </div>

        <button
          type="button"
          ref={botao}
          className="btn btn--preto compra__comprar"
          onClick={comprar}
          disabled={enviando || !degrau.disponivel}
        >
          {textoDoBotao(enviando, degrau.disponivel)}
          <Sacola className="btn__icone" />
        </button>
      </div>

      {/*
        `role="status"` e não `role="alert"`: o retorno chega depois de um
        clique que a pessoa deu, então interromper o leitor de tela no meio
        de outra coisa seria grosseria. `aria-live` polido espera a frase
        terminar. O bloco existe sempre, mesmo vazio — região viva que nasce
        junto com o texto costuma não ser anunciada.
      */}
      <p
        className={recado ? `compra__recado compra__recado--${recado.tipo}` : "compra__recado"}
        role="status"
        aria-live="polite"
      >
        {recado?.texto ?? ""}
      </p>

      <Escassez unidades={estoque} />

      <ul className="compra__garantias">
        {frases ? (
          <li>
            <Caminhao />
            <span>
              {frases.selo}
              <small>{frases.condicao}</small>
            </span>
          </li>
        ) : null}
        <li>
          <Cartao />
          <span>
            {PARCELAS_SEM_JUROS}x sem juros<small>Cartão, Pix ou boleto</small>
          </span>
        </li>
        <li>
          <EscudoCerto />
          <span>
            Compra segura<small>Dados criptografados</small>
          </span>
        </li>
        <li>
          <Relogio />
          <span>
            7 dias pra desistir<small>Direito de arrependimento</small>
          </span>
        </li>
      </ul>

      <BarraFixa
        nome={nome}
        foto={foto}
        preco={total}
        riscado={riscado}
        alvo={botao}
        ocupado={enviando}
        disponivel={degrau.disponivel}
        aoComprar={comprar}
      />
    </>
  )
}

function textoDoBotao(enviando: boolean, disponivel: boolean) {
  if (!disponivel) return "Esgotado"
  return enviando ? "Adicionando…" : "Adicionar à sacola"
}

function limita(n: number) {
  if (!Number.isFinite(n)) return 1
  return Math.min(MAX, Math.max(1, Math.trunc(n)))
}

/**
 * O DEGRAU DE QUANTIDADE
 *
 * Radio de verdade, não <div onClick>: setas do teclado andam entre as
 * opções, o leitor de tela anuncia "2 de 3", e o `<fieldset>` dá o nome do
 * grupo. Um botão estilizado de radio custa isso tudo pra ganhar nada.
 *
 * A fita de destaque é aritmética, não promessa: vai pro degrau de MENOR
 * preço por frasco, que a própria tela mostra ao lado. "Mais vendido" seria
 * afirmação sobre fato — e das que o cliente confere.
 */
function Degraus({
  degraus,
  escolhido,
  aoEscolher,
}: {
  degraus: readonly DegrauDeQuantidade[]
  escolhido: number
  aoEscolher: (i: number) => void
}) {
  const melhor = degraus.reduce(
    (a, b, i) => (b.economia > 0 && b.porUnidade < degraus[a]!.porUnidade ? i : a),
    0
  )

  return (
    <fieldset className="compra__kits">
      <legend className="compra__kits-titulo">
        <Raio />
        Quantos frascos
      </legend>

      <div className="compra__kits-lista">
        {degraus.map((d, i) => (
          <label
            key={d.varianteId}
            className="compra__kit"
            data-esgotado={d.disponivel ? undefined : ""}
          >
            {i === melhor && d.economia > 0 ? (
              <span className="compra__kit-fita compra__kit-fita--campeao">
                <Raio />
                Melhor preço
              </span>
            ) : null}

            <input
              type="radio"
              name="degrau"
              value={d.unidades}
              checked={i === escolhido}
              disabled={!d.disponivel}
              onChange={() => aoEscolher(i)}
            />

            <span>
              <span className="compra__kit-nome">
                {d.unidades} {d.unidades === 1 ? "frasco" : "frascos"}
              </span>
              {apoio(d) ? <span className="compra__kit-abaixo">{apoio(d)}</span> : null}
            </span>

            <span className="compra__kit-preco">
              {emReais(d.preco)}
              {d.unidades > 1 ? (
                <span className="compra__kit-unidade">{emReais(d.porUnidade)} cada</span>
              ) : null}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

/**
 * A linha de apoio do cartão, em ordem de preferência: o que a loja escreveu
 * no admin, senão a economia calculada, senão nada. Nunca um texto inventado
 * aqui — cada frase desta página é uma promessa que alguém vai cobrar.
 */
function apoio(d: DegrauDeQuantidade): string {
  if (d.nota) return d.nota
  if (d.economia > 0) return `Economiza ${emReais(d.economia)}`
  return ""
}

/**
 * ESCASSEZ
 *
 * Só com o número de verdade do Medusa, e só quando ele é baixo. "Últimas
 * unidades" fixo no HTML é mentira que o cliente descobre voltando no dia
 * seguinte — e depois disso ele não acredita em mais nada que a página diga.
 */
const POUCO = 5

function Escassez({ unidades }: { unidades: number | null }) {
  if (unidades === null || unidades > POUCO || unidades <= 0) return null
  return (
    <p className="compra__estoque">
      <Triangulo />
      <span>
        {unidades === 1 ? "Última unidade em estoque" : `Últimas ${unidades} unidades em estoque`}
      </span>
    </p>
  )
}

/**
 * A BARRA FIXA
 *
 * Aparece quando o botão da dobra sai de vista e some quando ele volta. Na
 * loja de hoje o cliente rola três mil pixels de descrição e o "comprar"
 * ficou lá atrás; boa parte simplesmente não sobe de novo.
 *
 * Escondida é `visibility: hidden` no CSS, não desmontada do React, e a
 * diferença importa duas vezes. Uma: `visibility: hidden` tira do Tab e do
 * leitor de tela — barra fixa invisível que continua focável é dos jeitos
 * mais comuns de quebrar navegação por teclado sem ninguém perceber, e
 * `opacity: 0` faria exatamente isso. Duas: a barra desliza pra dentro
 * (`translateY`), e transição precisa dos dois estados no mesmo elemento —
 * quem desmonta e remonta não anima, só pisca.
 */
function BarraFixa({
  nome,
  foto,
  preco,
  riscado,
  alvo,
  ocupado,
  disponivel,
  aoComprar,
}: {
  nome: string
  foto: string | null
  preco: number
  riscado: number | null
  alvo: React.RefObject<HTMLButtonElement | null>
  ocupado: boolean
  disponivel: boolean
  aoComprar: () => void
}) {
  const [mostra, setMostra] = useState(false)

  useEffect(() => {
    const el = alvo.current
    if (!el) return
    const observador = new IntersectionObserver(
      ([entrada]) => setMostra(!entrada?.isIntersecting),
      {
        // o botão precisa ter saído de vista de verdade, não estar na borda
        rootMargin: "-80px 0px 0px 0px",
      }
    )
    observador.observe(el)
    return () => observador.disconnect()
  }, [alvo])

  return (
    <div className={mostra ? "barra-compra e-visivel" : "barra-compra"}>
      {foto ? (
        <Image className="barra-compra__foto" src={foto} alt="" width={92} height={92} />
      ) : null}

      <span className="barra-compra__texto">
        <span className="barra-compra__nome">{nome}</span>
        <span className="barra-compra__preco">
          {emReais(preco)} {riscado ? <s>{emReais(riscado)}</s> : null}
        </span>
      </span>

      <button type="button" className="btn" onClick={aoComprar} disabled={ocupado || !disponivel}>
        {disponivel ? (ocupado ? "Adicionando…" : "Comprar") : "Esgotado"}
        <Sacola className="btn__icone" />
      </button>
    </div>
  )
}

/**
 * Avisa que a sacola mudou. Quem escuta é o provedor no layout — o contador
 * do cabeçalho e a gaveta se atualizam juntos, e a gaveta abre.
 *
 * É evento de DOM, e não uma chamada ao contexto, pra que a dobra não
 * dependa dele: ela adiciona, avisa, e segue funcionando numa página que não
 * tenha gaveta nenhuma.
 */
function avisarSacola(carrinho: CarrinhoVisivel) {
  window.dispatchEvent(new CustomEvent(EVENTO_SACOLA, { detail: carrinho }))
}
