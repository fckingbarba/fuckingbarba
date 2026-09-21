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
import { adicionar, adicionarVarios } from "@/lib/acoes/carrinho"
import type { CarrinhoVisivel } from "@/lib/carrinho-visivel"
import { emReais } from "@/lib/formato"
import type { DegrauDeQuantidade } from "@/lib/medusa"
import { useFrete } from "@/components/configuracoes/contexto"
import { alcancaOPiso, fechaOPiso, frasesDoFrete, pisoVale } from "@/lib/configuracoes"
import { CalculadoraDeFrete } from "@/components/produto/calculadora"
import type { ProdutoQueCombina } from "@/lib/pdp"
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
  combinam,
  precoCheio,
  estoque,
}: {
  nome: string
  foto: string | null
  degraus: readonly DegrauDeQuantidade[]
  /** Os produtos escolhidos no admin pra "leve junto". Vazio = não aparece. */
  combinam: readonly ProdutoQueCombina[]
  /** O riscado, quando existe promoção valendo no degrau de 1 unidade. */
  precoCheio: number | null
  /** Unidades restantes do avulso, quando o Medusa controla estoque. */
  estoque: number | null
}) {
  const politica = useFrete()
  const frases = frasesDoFrete(politica)
  const [escolhido, setEscolhido] = useState(0)
  const [juntos, setJuntos] = useState<Set<string>>(new Set())
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
    ┌─ O QUE CONTA PRO FRETE GRÁTIS, AQUI, É SÓ O QUE ESTA CAIXA ESTÁ ADICIONANDO ┐
    │ Não o carrinho inteiro — e não por preguiça.                               │
    │                                                                             │
    │ A tarja fica GRUDADA numa escolha ("leve o kit de 2 e o frete é por nossa  │
    │ conta"). Se ela levasse em conta o que já está na sacola, um kit ganharia  │
    │ a tarja por um motivo que não tem nada a ver com o kit — e a tarja passaria│
    │ a mentir sobre o PORQUÊ, que é a parte que ninguém confere.                │
    │                                                                             │
    │ O preço disso é subestimar pra quem já tem sacola cheia: a pessoa vê       │
    │ "faltam R$ 20" quando na verdade já alcançou. Erra pra menos, e a correção │
    │ chega dois segundos depois, na gaveta, que é quem faz a conta do carrinho  │
    │ inteiro — e chega como surpresa boa, não como promessa desfeita.           │
    └─────────────────────────────────────────────────────────────────────────────┘
  */
  const marcados = combinam.filter((c) => juntos.has(c.varianteId))
  const pedido = total + marcados.reduce((s, c) => s + c.preco, 0)

  /** A tarja de um degrau: levar ESTE kit, nesta quantidade, alcança o piso? */
  const tarjaDoDegrau = (preco: number) =>
    frases && pisoVale(politica) && alcancaOPiso(politica, preco * quantidade) ? frases.selo : null

  /**
   * A tarja de um item que combina: marcar ESTE é o que fecha a conta?
   *
   * Descontando o próprio item antes de perguntar, a tarja continua no item
   * depois de marcado — ele é quem está segurando o benefício, e vê-la sumir
   * no clique pareceria que o benefício sumiu junto.
   */
  const tarjaDoJunto = (item: ProdutoQueCombina) => {
    if (!frases || !pisoVale(politica)) return null
    const semEste = pedido - (juntos.has(item.varianteId) ? item.preco : 0)
    return fechaOPiso(politica, semEste, item.preco) ? frases.selo : null
  }

  /*
   * O riscado só vale pro degrau de uma unidade: é ele que está na promoção.
   * Multiplicar esse "de" pelos kits inventaria um preço cheio que o kit
   * nunca teve — exatamente a conta inflada que o degrau existe pra evitar.
   */
  const riscado = degrau.unidades === 1 && precoCheio ? precoCheio * quantidade : null

  function comprar() {
    setRecado(null)
    comecar(async () => {
      /*
        UMA IDA SÓ pro servidor, com tudo que foi marcado. Duas chamadas
        (o produto, depois os que combinam) dariam a chance de a primeira
        passar e a segunda falhar — e aí a sacola fica com metade do que a
        pessoa pediu, sem ela saber qual metade.
      */
      const r = marcados.length
        ? await adicionarVarios([
            { varianteId: degrau.varianteId, quantidade },
            ...marcados.map((c) => ({ varianteId: c.varianteId, quantidade: 1 })),
          ])
        : await adicionar(degrau.varianteId, quantidade)

      if (!r.ok) {
        setRecado({ tipo: "erro", texto: r.erro })
        return
      }
      setRecado({
        tipo: "ok",
        texto: marcados.length
          ? `Na sacola, com ${marcados.length === 1 ? "o item" : "os itens"} que combinam.`
          : "Na sacola.",
      })
      setJuntos(new Set())
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

      {/*
        A CALCULADORA NO LUGAR DO MEDIDOR.

        Aqui havia uma barrinha de "faltam R$ 85,00 pro frete grátis". Ela
        respondia uma pergunta que ninguém faz na página do produto: quem
        ainda não montou carrinho não está perseguindo piso, está decidindo
        se compra. A pergunta que existe é "quanto sai pra minha casa" — e
        essa a barrinha não respondia.

        Ela cota o que está SELECIONADO: o kit escolhido, na quantidade
        escolhida, mais o que estiver marcado no "leve junto". Trocar
        qualquer um recota, porque o peso muda e preço de frete velho na
        tela é oferta errada.
      */}
      <CalculadoraDeFrete
        itens={[
          { varianteId: degrau.varianteId, quantidade },
          ...marcados.map((c) => ({ varianteId: c.varianteId, quantidade: 1 })),
        ]}
      />

      {degraus.length > 1 ? (
        <Degraus
          degraus={degraus}
          escolhido={escolhido}
          tarja={tarjaDoDegrau}
          aoEscolher={(i) => {
            setEscolhido(i)
            setRecado(null)
          }}
        />
      ) : null}

      {/*
        DEPOIS dos degraus e ANTES do botão, nunca antes dos degraus: "quantos
        frascos deste" é a decisão principal, e oferecer outro produto no meio
        dela é interromper quem já estava comprando. Aqui a oferta pega a
        pessoa com a escolha feita e o botão à vista.
      */}
      {combinam.length ? (
        <LeveJunto
          itens={combinam}
          marcados={juntos}
          tarja={tarjaDoJunto}
          aoAlternar={(id) =>
            setJuntos((s) => {
              const novo = new Set(s)
              if (novo.has(id)) novo.delete(id)
              else novo.add(id)
              return novo
            })
          }
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
              {/*
                A LETRA MIÚDA MORAVA NO MEDIDOR, e o medidor saiu.

                Com `alvo: "mais-barata"`, "frete grátis" sozinho deixa a
                pessoa entender que o Sedex também sai de graça — e ela
                descobre que não no checkout, que é o pior lugar possível.
                A calculadora ali em cima mostra isso em números depois do
                CEP; este selo é o que a página afirma ANTES de qualquer
                CEP, então é aqui que a ressalva precisa estar.
              */}
              <small>
                {frases.condicao}
                {frases.nota ? ` · ${frases.nota}` : ""}
              </small>
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
/**
 * LEVE JUNTO — o cross-sell dentro da caixa de compra.
 *
 * Fica ao lado do preço e vai no MESMO clique do "Comprar", e não numa
 * vitrine lá embaixo. A diferença não é de lugar, é de momento: quem está
 * escolhendo quantos frascos levar já decidiu comprar, e é ali que somar um
 * item custa uma caixinha marcada. Uma vitrine no fim da página pede uma
 * segunda decisão, depois de a pessoa já ter rolado pra longe do botão.
 *
 * As caixas nascem DESMARCADAS. Marcada por padrão vende mais e é a prática
 * que o cliente descobre no carrinho — e aí ele não confere só aquele item,
 * confere a loja inteira.
 *
 * Preço à vista, do jeito que o Medusa devolve: quem escolhe aqui está
 * somando ao total que já está na tela, e um preço "a partir de" obrigaria
 * a refazer a conta de cabeça.
 */
function LeveJunto({
  itens,
  marcados,
  tarja,
  aoAlternar,
}: {
  itens: readonly ProdutoQueCombina[]
  marcados: Set<string>
  tarja: (item: ProdutoQueCombina) => string | null
  aoAlternar: (varianteId: string) => void
}) {
  return (
    <fieldset className="junto">
      <legend className="junto__titulo">
        <Raio />
        Leve junto
      </legend>

      <ul className="junto__lista">
        {itens.map((item) => {
          const selo = tarja(item)
          return (
            <li key={item.varianteId}>
              <label className="junto__item">
                <input
                  type="checkbox"
                  checked={marcados.has(item.varianteId)}
                  onChange={() => aoAlternar(item.varianteId)}
                />
                {item.foto ? (
                  <Image src={item.foto} alt="" width={44} height={44} sizes="44px" />
                ) : (
                  <span className="junto__sem-foto" aria-hidden="true" />
                )}
                <span className="junto__texto">
                  <span className="junto__nome">{item.nome}</span>
                  {selo ? <TarjaDeFrete texto={selo} /> : null}
                </span>
                <span className="junto__preco">{emReais(item.preco)}</span>
              </label>
            </li>
          )
        })}
      </ul>
    </fieldset>
  )
}

/**
 * A TARJA DE FRETE — a mesma ideia da tarja do card da vitrine, no tamanho
 * de quem mora dentro de um cartão de escolha.
 *
 * O texto vem SEMPRE do `frasesDoFrete`, nunca escrito aqui: com frete fixo
 * ela diz "Frete R$ 9,90", e o dia em que a loja desligar a promoção a tarja
 * some sozinha porque `frases` vira `null` lá em cima. Uma tarja com
 * "FRETE GRÁTIS" digitado no JSX é uma promessa que sobrevive ao fim da
 * promoção — e o art. 30 do CDC diz que o anunciado vincula.
 */
function TarjaDeFrete({ texto }: { texto: string }) {
  return (
    <span className="tarja-frete">
      <Raio />
      {texto}
    </span>
  )
}


function Degraus({
  degraus,
  escolhido,
  tarja,
  aoEscolher,
}: {
  degraus: readonly DegrauDeQuantidade[]
  escolhido: number
  /** O selo de frete deste degrau, ou `null` quando ele não alcança o piso. */
  tarja: (preco: number) => string | null
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
        {degraus.map((d, i) => {
          const selo = tarja(d.preco)
          return (
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

              {/*
                A classe não é enfeite: os cartões são `subgrid` e cada peça
                é colocada numa linha da grade pelo nome. Sem ela o bloco de
                texto cairia na linha da bolinha.
              */}
              <span className="compra__kit-texto">
                <span className="compra__kit-nome">
                  {d.unidades} {d.unidades === 1 ? "frasco" : "frascos"}
                </span>
                {apoio(d) ? <span className="compra__kit-abaixo">{apoio(d)}</span> : null}
              </span>

              {/*
                O "cada" aparece em TODOS os cartões, inclusive no de uma
                unidade, onde ele repete o preço de cima.

                Parece redundância e é a régua: os kits dizem "R$ 74,95
                cada" e essa vantagem só significa alguma coisa contra um
                número — o do avulso. Sem ele a pessoa tem que fazer a
                divisão de cabeça pra saber se 74,95 é bom. Com ele, a
                coluna lê 79,90 · 74,95 · 74,30 de cima a baixo, e a escada
                fica visível sem ninguém precisar calcular nada.
              */}
              <span className="compra__kit-preco">
                {emReais(d.preco)}
                <span className="compra__kit-unidade">{emReais(d.porUnidade)} cada</span>
              </span>

              {/* Embaixo do preço: é o preço que decide se a tarja aparece. */}
              {selo ? <TarjaDeFrete texto={selo} /> : null}
            </label>
          )
        })}
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
