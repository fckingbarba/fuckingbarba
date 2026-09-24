"use client"

import Image from "next/image"
import { useEffect, useId, useRef, useState, useTransition } from "react"
import { Caminhao, Cartao, EscudoCerto, Raio, Sacola, Triangulo } from "@/components/icones"
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
 * tudo lê o MESMO estado: quantas unidades. Separar a barra fixa
 * num componente irmão exigiria contexto ou estado subindo pro servidor pra
 * manter os dois preços iguais, e preço diferente em dois lugares da mesma
 * tela é o bug que mais custa confiança.
 *
 * O QUE ESTE COMPONENTE NÃO FAZ: conta. Ele escolhe QUANTAS UNIDADES e manda
 * isso pro servidor. O preço por unidade de cada quantidade veio do Medusa
 * (via `escadaDeQuantidade`, que pergunta com a quantidade no contexto), e o
 * que vai ser cobrado é o que o Medusa calcular no carrinho pra essa mesma
 * quantidade — os dois saem da mesma conta. A única multiplicação daqui é
 * unidades x preço da unidade, que é a que o carrinho também faz.
 */

const MAX = 10

/** 76,45 x 2 dá 152.89999999999998 em ponto flutuante; dinheiro sai redondo. */
const emCentavos = (n: number) => Math.round(n * 100) / 100

export function Compra({
  nome,
  foto,
  degraus,
  combinam,
  precoCheio,
  estoque,
  mostrarDegraus,
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
  /**
   * Os cartões "1, 2, 3 unidades". Desligados no admin, eles somem — mas o
   * DESCONTO NÃO: o Medusa cobra por quantidade em todo produto, então o
   * preço lá em cima continua seguindo os degraus quando a pessoa aumenta a
   * quantidade. Por isso os degraus chegam sempre, e isto só decide se a
   * escolha aparece.
   */
  mostrarDegraus: boolean
}) {
  const politica = useFrete()
  const frases = frasesDoFrete(politica)
  const [juntos, setJuntos] = useState<Set<string>>(new Set())
  const [unidades, setUnidades] = useState(1)
  const [recado, setRecado] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null)
  const [enviando, comecar] = useTransition()
  const botao = useRef<HTMLButtonElement>(null)

  const base = degraus[0]
  if (!base) return null

  /*
    O DEGRAU EM VIGOR é o maior que não passa da quantidade: 4 ou 5
    unidades pagam o preço do de 3, porque a faixa de 3 não tem teto — é
    assim que o Medusa cobra, e é esse cartão que fica marcado.
  */
  const emVigor = degraus.reduce((vale, d, i) => (d.unidades <= unidades ? i : vale), 0)
  const degrau = degraus[emVigor] ?? base
  const maximo = estoque === null ? MAX : Math.max(1, Math.min(MAX, estoque))
  const disponivel = estoque === null ? base.disponivel : estoque >= unidades
  // Tem pelo menos uma pra mandar — é o que "envio imediato" promete.
  const temEstoque = estoque === null ? base.disponivel : estoque >= 1

  const total = emCentavos(degrau.porUnidade * unidades)
  const parcela = total / PARCELAS_SEM_JUROS
  const parcelavel = parcela >= PARCELA_MINIMA

  /*
    ┌─ O QUE CONTA PRO FRETE GRÁTIS, AQUI, É SÓ O QUE ESTA CAIXA ESTÁ ADICIONANDO ┐
    │ Não o carrinho inteiro — e não por preguiça.                               │
    │                                                                             │
    │ A tarja fica GRUDADA numa escolha ("leve 2 unidades e o frete é por        │
    │ nossa conta"). Se ela levasse em conta o que já está na sacola, um         │
    │ degrau ganharia a tarja por um motivo que não tem nada a ver com ele — e   │
    │ a tarja passaria a mentir sobre o PORQUÊ, que é a parte que ninguém        │
    │ confere.                                                                   │
    │                                                                             │
    │ O preço disso é subestimar pra quem já tem sacola cheia: a pessoa vê       │
    │ "faltam R$ 20" quando na verdade já alcançou. Erra pra menos, e a correção │
    │ chega dois segundos depois, na gaveta, que é quem faz a conta do carrinho  │
    │ inteiro — e chega como surpresa boa, não como promessa desfeita.           │
    └─────────────────────────────────────────────────────────────────────────────┘
  */
  const marcados = combinam.filter((c) => juntos.has(c.varianteId))
  const pedido = total + marcados.reduce((s, c) => s + c.preco, 0)

  /** A tarja de um degrau: levar ESTAS unidades alcança o piso? */
  const tarjaDoDegrau = (preco: number) =>
    frases && pisoVale(politica) && alcancaOPiso(politica, preco) ? frases.selo : null

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
   * O RISCADO é o preço da MESMA unidade, vezes quantas estão na conta — o
   * que a pessoa pagaria sem a promoção e sem o desconto de quantidade. Com
   * promoção, a referência é o preço cheio; sem, o da própria unidade, que
   * só fica acima do total quando o desconto de quantidade entra (2 ou
   * mais). Riscado igual ao preço não aparece: não há do que ter
   * economizado. (Com os kits isto não valia: um kit nunca teve "de"
   * nenhum, e multiplicar o do avulso inventaria um.)
   */
  const referencia = emCentavos((precoCheio ?? base.porUnidade) * unidades)
  const riscado = referencia > total ? referencia : null
  // A diferença entre os dois números que já estão na tela — nada além deles.
  const economia = riscado ? riscado - total : 0

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
            { varianteId: base.varianteId, quantidade: unidades },
            ...marcados.map((c) => ({ varianteId: c.varianteId, quantidade: 1 })),
          ])
        : await adicionar(base.varianteId, unidades)

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
      /*
        O "leve junto" CONTINUA MARCADO depois do clique, como as unidades
        escolhidas continuam na tela. Desmarcar na hora em que a sacola abre
        (era assim até 24/09) fazia parecer que os itens não tinham ido — a
        loja viu e pediu pra manter. Um segundo clique leva de novo o que
        está marcado, do mesmo jeito que leva de novo as unidades.
      */
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
          número que muda no clique não chega nele, e o preço de 3 unidades no
          lugar do de uma faria o resultado de busca anunciar R$ 222,90 por
          uma unidade.
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

        {/*
          O PREÇO QUE SE PAGA VEM PRIMEIRO, grande; o "de" riscado e a
          economia vêm depois, como prova. O protótipo tinha a ordem inversa
          e tinha tirado a economia (o riscado já contava a mesma história);
          a loja pediu os dois assim em 22/09 — e, em 23/09, a economia como
          TEXTO ao lado do riscado, "Economiza", e não mais etiqueta. Ela só
          existe junto com o riscado: sem "de", não há do que economizar.

          O "antes" escondido é pra quem ouve a página: sem o traço e sem o
          tamanho, "R$ 54,90 R$ 79,90" não diz qual dos dois se paga.
        */}
        <p className="compra__precos">
          <span className="compra__por">{emReais(total)}</span>
          {riscado ? (
            <span className="compra__de">
              <span className="sr-only">antes </span>
              {emReais(riscado)}
            </span>
          ) : null}
          {economia >= 0.01 ? (
            <span className="compra__economia">Economiza {emReais(economia)}</span>
          ) : null}
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

        Ela cota o que está SELECIONADO: as unidades escolhidas, mais o que
        estiver marcado no "leve junto". Trocar qualquer um recota, porque o
        peso muda e preço de frete velho na tela é oferta errada.
      */}
      <CalculadoraDeFrete
        itens={[
          { varianteId: base.varianteId, quantidade: unidades },
          ...marcados.map((c) => ({ varianteId: c.varianteId, quantidade: 1 })),
        ]}
      />

      {mostrarDegraus && degraus.length > 1 ? (
        <Degraus
          degraus={degraus}
          escolhido={emVigor}
          tarja={tarjaDoDegrau}
          aoEscolher={(i) => {
            setUnidades(degraus[i]?.unidades ?? 1)
            setRecado(null)
          }}
        />
      ) : null}

      {/*
        DEPOIS dos degraus e ANTES do botão, nunca antes dos degraus: "quantas
        unidades deste" é a decisão principal, e oferecer outro produto no meio
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
            disabled={unidades <= 1}
            onClick={() => setUnidades((q) => Math.max(1, q - 1))}
          >
            −
          </button>
          {/* Só os botões mudam o número: ele não é campo (pedido da loja em
              23/09). `<output>` é o elemento de "resultado", e o leitor de
              tela lê "Quantidade: 2" a cada toque no − e no +. */}
          <output className="compra__numero" aria-live="polite" aria-atomic="true">
            <span className="sr-only">Quantidade: </span>
            {unidades}
          </output>
          <button
            type="button"
            aria-label="Aumentar quantidade"
            disabled={unidades >= maximo}
            onClick={() => setUnidades((q) => Math.min(maximo, q + 1))}
          >
            +
          </button>
        </div>

        <button
          type="button"
          ref={botao}
          className="btn btn--preto compra__comprar"
          onClick={comprar}
          disabled={enviando || !disponivel}
        >
          {textoDoBotao(enviando, disponivel)}
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

      {/*
        QUATRO GARANTIAS, dois por dois (pedido da loja em 23/09). Sem política
        de frete, ou sem estoque, sobram três — e a última ocupa a linha
        inteira (`.compra__garantias li:last-child:nth-child(odd)`).
      */}
      <ul className="compra__garantias">
        {frases ? (
          <li>
            <Caminhao />
            <span>
              {frases.selo}
              {/*
                Só a condição. A ressalva "vale na opção de entrega mais
                barata" saiu daqui a pedido da loja (23/09): qual entrega sai
                de graça a pessoa vê em números na calculadora, logo acima, e
                de novo na sacola e no checkout, onde escolhe.
              */}
              <small>{frases.condicao}</small>
            </span>
          </li>
        ) : null}
        {/* Só com estoque: "envio imediato" de um produto esgotado seria mentira. */}
        {temEstoque ? (
          <li>
            <Raio />
            <span>
              Envio imediato<small>Pronta entrega</small>
            </span>
          </li>
        ) : null}
        <li>
          <Cartao />
          <span>
            {PARCELAS_SEM_JUROS}x sem juros<small>No cartão, ou Pix</small>
          </span>
        </li>
        <li>
          <EscudoCerto />
          <span>
            Compra segura<small>Dados criptografados</small>
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
        disponivel={disponivel}
        aoComprar={comprar}
      />
    </>
  )
}

function textoDoBotao(enviando: boolean, disponivel: boolean) {
  if (!disponivel) return "Esgotado"
  return enviando ? "Adicionando…" : "Adicionar à sacola"
}

/**
 * O DEGRAU DE QUANTIDADE
 *
 * Radio de verdade, não <div onClick>: setas do teclado andam entre as
 * opções, o leitor de tela anuncia "2 de 3", e o `<fieldset>` dá o nome do
 * grupo. Um botão estilizado de radio custa isso tudo pra ganhar nada.
 *
 * A fita de destaque é aritmética, não promessa: vai pro degrau de MENOR
 * preço por unidade, que a própria tela mostra ao lado. "Mais vendido" seria
 * afirmação sobre fato — e das que o cliente confere.
 */
/**
 * LEVE JUNTO — o cross-sell dentro da caixa de compra.
 *
 * Fica ao lado do preço e vai no MESMO clique do "Comprar", e não numa
 * vitrine lá embaixo. A diferença não é de lugar, é de momento: quem está
 * escolhendo quantas unidades levar já decidiu comprar, e é ali que somar um
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
  /*
    O NOME DO GRUPO É DESTA PDP, e não "degrau" pra todas. O Next guarda a
    página de produto anterior escondida no documento (o `<Activity>`), e
    rádios com o mesmo nome são UM grupo no documento inteiro: marcar um lá
    desmarcava o daqui. Quem ia de uma PDP pra outra pelo site via os
    cartões sem nenhum marcado, com o preço de 2 unidades valendo.
  */
  const grupo = useId()

  return (
    <fieldset className="compra__kits">
      <legend className="compra__kits-titulo">
        <Raio />
        Quantas unidades
      </legend>

      <div className="compra__kits-lista">
        {degraus.map((d, i) => {
          const selo = tarja(d.preco)
          /*
            A CHAVE É A QUANTIDADE, e não a variante: desde que os kits viraram
            desconto por quantidade, os três cartões são a MESMA variante (1, 2
            e 3 unidades dela). Com a variante, as três chaves eram iguais — o
            React avisava no console de toda PDP e podia trocar um cartão pelo
            outro quando a lista mudasse.
          */
          return (
            <label
              key={d.unidades}
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
                name={grupo}
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
                  {d.unidades} {d.unidades === 1 ? "unidade" : "unidades"}
                </span>
                {apoio(d) ? <span className="compra__kit-abaixo">{apoio(d)}</span> : null}
              </span>

              {/*
                O "cada" aparece em TODOS os cartões, inclusive no de uma
                unidade, onde ele repete o preço de cima.

                Parece redundância e é a régua: o de 2 diz "R$ 76,45 cada"
                e essa vantagem só significa alguma coisa contra um número —
                o da unidade avulsa. Sem ele a pessoa tem que fazer a divisão
                de cabeça pra saber se 76,45 é bom. Com ele, a coluna lê
                79,90 · 76,45 · 74,30 de cima a baixo, e a escada fica
                visível sem ninguém precisar calcular nada.
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
