"use client"

import Image from "next/image"
import { useEffect, useId, useRef, useState, useTransition } from "react"
import {
  Caminhao,
  Cartao,
  Certo,
  Envelope,
  EscudoCerto,
  Mais,
  Raio,
  Sacola,
  Triangulo,
} from "@/components/icones"
import { PrazoDaOferta, useOfertaNaPdp, type OfertaNaPdp } from "@/components/oferta/na-pdp"
import { AviseMe } from "@/components/produto/avise-me"
import { EVENTO_SACOLA, useSacola } from "@/components/sacola/contexto"
import { adicionar, adicionarVarios, type Resultado } from "@/lib/acoes/carrinho"
import { adicionarDaOferta, adicionarVariosDaOferta } from "@/lib/acoes/oferta"
import type { CarrinhoVisivel } from "@/lib/carrinho-visivel"
import { emReais } from "@/lib/formato"
import type { DegrauDeQuantidade } from "@/lib/medusa"
import { useFrete, useParcelaMinima } from "@/components/configuracoes/contexto"
import {
  alcancaOPiso,
  faltaPraPromocao,
  fraseDoQueFalta,
  frasesDoFrete,
  pisoVale,
} from "@/lib/configuracoes"
import { SEM_CONEXAO, semQueda } from "@/lib/rede"
import { CalculadoraDeFrete } from "@/components/produto/calculadora"
import type { ProdutoQueCombina } from "@/lib/pdp"
import { gratisEm, unitarioEm, type PromocaoDoProduto } from "@/lib/promocoes"
import { nomeCurto } from "@/lib/recomendacao"
import { PARCELAS_SEM_JUROS } from "@/lib/site"
import { anotarNaLoja, rastrear } from "@/lib/rastrear"
import { depoisDeUmMinutoNaFrente } from "@/lib/um-minuto"
import { usePeDaTela } from "@/lib/use-pe-da-tela"

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
 *
 * O "LEVE X, PAGUE Y" (entrega 0133): com a promoção do painel valendo no
 * produto, o selo dela vai embaixo do preço, e o total segue a conta do
 * Medusa — a cada X unidades, Y pagas (`gratisEm`), pelo preço de uma
 * unidade NAQUELA quantidade (`unitarioEm`) —, e não mais o preço da
 * unidade vezes quantas: o produto sai das faixas de quantidade que chegam
 * no X enquanto a promoção vale (os dois descontos não somam), e o degrau
 * dela vem pronto da escada ("3 unidades", pelo preço de 2). As faixas que
 * acabam antes do X ficam (entrega 0142): num "leve 3", 2 unidades pagam a
 * faixa de 2, e o cartão dela continua.
 *
 * ESGOTADO, É OUTRA CAIXA (`CompraEsgotada`, lá embaixo): o preço, a faixa
 * "Esgotado" e o "avise-me quando chegar" no lugar do botão. Some tudo o que
 * só serve pra quem compra agora — o frete, as unidades, o leve junto, o
 * botão e as garantias. Até 26/09 a caixa continuava inteira, com um botão
 * "Esgotado" preto que parecia clicável e não fazia nada.
 *
 * A OFERTA OCULTA (entrega 0240): pra quem veio pelo link de uma oferta com
 * este produto (`useOfertaNaPdp`), a unidade custa o menor entre o "por" e
 * o preço dela naquela quantidade — o que a lista da oferta cobra —, em todo
 * lugar: o preço grande, os cartões, a barra fixa e a prévia da sacola. A
 * linha de baixo do preço compara com a loja ("Na loja: R$ 89,90 · no seu
 * link: R$ 59,90"), e o botão marca a sacola com a oferta. O "Leve X, pague
 * Y" sai da conta da tela: a unidade de graça, se o carrinho der, é
 * surpresa boa — nunca uma promessa que ele não cumpre.
 */

const MAX = 10

/** 76,45 x 2 dá 152.89999999999998 em ponto flutuante; dinheiro sai redondo. */
const emCentavos = (n: number) => Math.round(n * 100) / 100

export function Compra({
  nome,
  foto,
  degraus,
  combinam,
  completam = [],
  precoCheio,
  estoque,
  mostrarDegraus,
  promocao = null,
  unitarios,
}: {
  nome: string
  foto: string | null
  degraus: readonly DegrauDeQuantidade[]
  /** Os produtos escolhidos no admin pra "leve junto". Vazio = não aparece. */
  combinam: readonly ProdutoQueCombina[]
  /**
   * Os que podem completar o frete grátis, em ordem (0208): os do "leve
   * junto" e depois a vitrine, pelo motor. A calculadora oferece um só.
   */
  completam?: readonly ProdutoQueCombina[]
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
  /** O "Leve X, pague Y" que vale no produto agora, ou `null`. */
  promocao?: PromocaoDoProduto | null
  /** O preço de uma unidade levando 1, 2 e 3 ou mais (`escadaDeQuantidade`). */
  unitarios?: readonly number[]
}) {
  const politica = useFrete()
  const parcelaMinima = useParcelaMinima()
  const frases = frasesDoFrete(politica)
  const [juntos, setJuntos] = useState<Set<string>>(new Set())
  const [unidades, setUnidades] = useState(1)
  /** O que deu errado no clique. Dando certo, a gaveta abre e mostra — a página não repete. */
  const [recado, setRecado] = useState<string | null>(null)
  const [enviando, comecar] = useTransition()
  const botao = useRef<HTMLButtonElement>(null)
  // A caixa do avise-me, quando esgotado: é pra ela que a barra fixa leva.
  const caixaDoAviso = useRef<HTMLDivElement>(null)
  const sacola = useSacola()
  const oferta = useOfertaNaPdp()

  // A visita ao produto, uma por produto (a ViewContent da Meta e do TikTok).
  const primeiro = degraus[0]
  useEffect(() => {
    if (!primeiro) return
    rastrear("view_item", {
      currency: "BRL",
      value: primeiro.porUnidade,
      items: [
        { item_id: primeiro.varianteId, item_name: nome, price: primeiro.porUnidade, quantity: 1 },
      ],
    })
    // Uma vez por variante: o nome e o preço não mudam sem ela mudar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primeiro?.varianteId])

  // O minuto na página, com a aba na frente: só pro CRM da loja (a navegação abandonada).
  useEffect(() => {
    if (!primeiro) return
    const item = { item_id: primeiro.varianteId, item_name: nome, price: primeiro.porUnidade }
    return depoisDeUmMinutoNaFrente(() =>
      anotarNaLoja(
        "produto_lido",
        { items: [{ ...item, quantity: 1 }] },
        { umaVez: `lido:${item.item_id}` }
      )
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primeiro?.varianteId])

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

  if (!temEstoque) {
    return (
      <CompraEsgotada
        nome={nome}
        foto={foto}
        varianteId={base.varianteId}
        preco={base.preco}
        precoCheio={precoCheio}
        caixa={caixaDoAviso}
      />
    )
  }

  // O preço de uma unidade que o carrinho vai cobrar nesta quantidade — pra todo mundo.
  const unitarioDaLoja = promocao
    ? unitarioEm(unitarios, unidades, base.porUnidade)
    : degrau.porUnidade
  const totalDaLoja = promocao
    ? emCentavos(
        unitarioDaLoja * (unidades - gratisEm(unidades, promocao.comprando, promocao.pague))
      )
    : emCentavos(degrau.porUnidade * unidades)
  // E pra quem veio pelo link da oferta (o quadro lá em cima).
  const unitario = oferta ? Math.min(oferta.por, degrau.porUnidade) : unitarioDaLoja
  const total = oferta ? emCentavos(unitario * unidades) : totalDaLoja
  const parcela = total / PARCELAS_SEM_JUROS
  const parcelavel = parcela >= parcelaMinima

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
  /*
    O que vai junto é o marcado no "leve junto" OU o que a calculadora
    ofereceu pra completar o frete grátis (0208): os dois moram no mesmo
    `juntos`, e os dois vão no mesmo clique do Comprar.
  */
  const doLeveJunto = new Set(combinam.map((c) => c.varianteId))
  const marcados = [...combinam, ...completam.filter((c) => !doLeveJunto.has(c.varianteId))].filter(
    (c) => juntos.has(c.varianteId)
  )
  const pedido = total + marcados.reduce((s, c) => s + c.preco, 0)

  /** A tarja de um degrau: levar ESTAS unidades alcança o piso? */
  const tarjaDoDegrau = (preco: number) =>
    frases && pisoVale(politica) && alcancaOPiso(politica, preco) ? frases.selo : null

  const alternar = (id: string) =>
    setJuntos((s) => {
      const novo = new Set(s)
      if (novo.has(id)) novo.delete(id)
      else novo.add(id)
      return novo
    })

  /** Quantos vão no clique: as unidades deste, mais um de cada marcado. */
  const noClique = unidades + marcados.length

  /*
    O RODAPÉ DO "LEVE JUNTO" (0221): o total do clique e o frete dele —
    "Faltam R$ 25,00 pro frete grátis", ou o selo quando alcança. A conta é
    o mesmo `pedido` da barra fixa: só o que esta caixa adiciona, nunca a
    sacola (o quadro acima). Com piso zero, ou sem política, fica só o
    total: aí o frete é de todo mundo, e quem anuncia é a garantia.
  */
  const falta = pisoVale(politica) ? faltaPraPromocao(politica, pedido) : null
  const aindaFalta = falta ? fraseDoQueFalta(politica, emCentavos(falta)) : null
  const freteDoJunto =
    frases && falta !== null ? { alcancou: !aindaFalta, texto: aindaFalta ?? frases.selo } : null

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
  // Na oferta, a linha de baixo do preço compara com o que a loja cobra de quem não tem o link.
  const naLoja = oferta && totalDaLoja > total ? totalDaLoja : null

  function comprar() {
    setRecado(null)
    /*
      UMA IDA SÓ pro servidor, com tudo que foi marcado. Duas chamadas
      (o produto, depois os que combinam) dariam a chance de a primeira
      passar e a segunda falhar — e aí a sacola fica com metade do que a
      pessoa pediu, sem ela saber qual metade.
    */
    const itens = [
      { varianteId: base.varianteId, quantidade: unidades },
      ...marcados.map((c) => ({ varianteId: c.varianteId, quantidade: 1 })),
    ]
    // Com a oferta, a sacola é marcada antes (`lib/acoes/oferta.ts`): o preço sai o dela.
    const chamar = () =>
      oferta
        ? marcados.length
          ? adicionarVariosDaOferta(oferta.endereco, itens)
          : adicionarDaOferta(oferta.endereco, base.varianteId, unidades)
        : marcados.length
          ? adicionarVarios(itens)
          : adicionar(base.varianteId, unidades)
    /*
      A GAVETA ABRE NO CLIQUE (entrega 0104), com o que esta caixa já
      mostra: a foto, o nome, o preço da unidade no degrau e o total dele.
      O total da sacola esmaece até o Medusa responder — na produção, de
      um a dois segundos, que antes a pessoa passava olhando o
      "Adicionando…". Fora do provedor, o caminho de antes.

      O `adicionar` do contexto é chamado AQUI, no clique, e não dentro do
      `comecar` logo abaixo: o que muda dentro de uma transição assíncrona
      o React só mostra quando ela termina — a gaveta abriria junto com a
      resposta, como antes. A transição daqui só espera, pro "Adicionando…".
    */
    const feito = sacola
      ? sacola.adicionar(
          [
            {
              varianteId: base.varianteId,
              nome,
              handle: base.handle,
              imagem: foto,
              quantidade: unidades,
              precoUnitario: unitario,
              total,
            },
            ...marcados.map((c) => ({
              varianteId: c.varianteId,
              nome: c.nome,
              handle: c.handle,
              imagem: c.foto,
              quantidade: 1,
              precoUnitario: c.preco,
            })),
          ],
          chamar
        )
      : null
    comecar(async () => {
      const r = feito
        ? await feito
        : await semQueda(chamar, (): Resultado => ({
            ok: false,
            erro: SEM_CONEXAO,
            carrinho: null,
          }))

      if (!r.ok) {
        setRecado(r.erro)
        return
      }
      /*
        Deu certo: nada escrito aqui. A gaveta que abre já mostra o que foi
        pra sacola, e o "Na sacola, com os itens que combinam." embaixo do
        botão só ocupava espaço (pedido da loja em 24/09) — como a rotina e o
        "Comprar" da vitrine, o recado da dobra só fala quando dá errado.
      */
      /*
        O "leve junto" CONTINUA MARCADO depois do clique, como as unidades
        escolhidas continuam na tela. Desmarcar na hora em que a sacola abre
        (era assim até 24/09) fazia parecer que os itens não tinham ido — a
        loja viu e pediu pra manter. Um segundo clique leva de novo o que
        está marcado, do mesmo jeito que leva de novo as unidades.
      */
      if (!feito) avisarSacola(r.carrinho)
    })
  }

  return (
    <>
      <div itemProp="offers" itemScope itemType="https://schema.org/Offer">
        <DadosDaOferta
          preco={degraus[0]?.preco ?? 0}
          disponivel={degraus[0]?.disponivel ?? false}
        />

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
          {naLoja ? (
            <span className="compra__economia" data-na-loja>
              Na loja: {emReais(naLoja)} · no seu link: {emReais(total)}
            </span>
          ) : economia >= 0.01 ? (
            <span className="compra__economia">Economiza {emReais(economia)}</span>
          ) : null}
        </p>

        {/*
          O SELO DO "LEVE X, PAGUE Y" vem da promoção do painel, nunca escrito
          aqui: pausada ou vencida, ela sai da lista do backend e o selo some
          junto (a oferta anunciada vincula — CDC art. 30).
        */}
        {promocao && !oferta ? (
          <p className="compra__promocao" data-promocao>
            <Raio />
            {promocao.etiqueta}
          </p>
        ) : null}

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
        completar={{ candidatos: completam, escolhidos: juntos, alternar }}
      />

      {mostrarDegraus && degraus.length > 1 ? (
        <Degraus
          degraus={oferta ? degrausDaOferta(degraus, oferta, base.porUnidade) : degraus}
          semMelhor={Boolean(oferta)}
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
          aoAlternar={alternar}
          rotulo={marcados.length ? `Total dos ${noClique}` : "Total"}
          total={emCentavos(pedido)}
          frete={freteDoJunto}
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
          {textoDoBotao(enviando, disponivel, marcados.length ? noClique : null)}
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
        className={recado ? "compra__recado compra__recado--erro" : "compra__recado"}
        role="status"
        aria-live="polite"
      >
        {recado ?? ""}
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

      {/*
        A barra leva o que o "Comprar" dela leva: com itens do "leve junto"
        marcados, o preço é o do pedido todo (o riscado ganha os extras, que
        não têm desconto — a economia continua a mesma), e as fotos deles
        aparecem empilhadas atrás da principal, com o "+N" ao lado do nome.
      */}
      <BarraFixa
        nome={nome}
        foto={foto}
        juntos={marcados}
        preco={pedido}
        riscado={riscado ? riscado + (pedido - total) : null}
        alvo={botao}
        ocupado={enviando}
        disponivel={disponivel}
        aoComprar={comprar}
        oferta={oferta}
      />
    </>
  )
}

/**
 * Os cartões de quantidade pra quem veio pelo link da oferta: em cada um, a
 * unidade pelo menor entre o "por" e o preço dela naquela quantidade (o que
 * o carrinho cobra), e a economia contra levar as mesmas unidades pelo
 * preço de uma na loja. O de 1 unidade diz de onde vem o preço.
 */
function degrausDaOferta(
  degraus: readonly DegrauDeQuantidade[],
  oferta: OfertaNaPdp,
  avulsoNaLoja: number
): DegrauDeQuantidade[] {
  return degraus.map((d) => {
    const porUnidade = Math.min(oferta.por, d.porUnidade)
    const preco = emCentavos(porUnidade * d.unidades)
    return {
      ...d,
      porUnidade,
      preco,
      economia: emCentavos(Math.max(0, avulsoNaLoja * d.unidades - preco)),
      nota: d.unidades === 1 ? "Preço do seu link" : null,
    }
  })
}

/**
 * O QUE O GOOGLE LÊ DA OFERTA — preço, disponibilidade, condição e a política
 * de devolução, em microdata. Mora dentro do `itemProp="offers"` das duas
 * caixas, a de comprar e a do esgotado.
 */
function DadosDaOferta({ preco, disponivel }: { preco: number; disponivel: boolean }) {
  return (
    <>
      <meta itemProp="priceCurrency" content="BRL" />
      {/*
        O preço indexado é o do produto DESTA página — uma unidade —, e não
        o do degrau escolhido. O Google lê o HTML que sai do servidor; um
        número que muda no clique não chega nele, e o preço de 3 unidades no
        lugar do de uma faria o resultado de busca anunciar R$ 222,90 por
        uma unidade.
      */}
      <meta itemProp="price" content={preco.toFixed(2)} />
      <link
        itemProp="availability"
        href={disponivel ? "https://schema.org/InStock" : "https://schema.org/OutOfStock"}
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
    </>
  )
}

/**
 * A CAIXA DO ESGOTADO — o preço (que é informação: a pessoa quer saber
 * quanto vai custar quando voltar), a faixa "Esgotado" e o avise-me no lugar
 * do botão. O frete, as unidades, o leve junto e as garantias ficam de fora:
 * são perguntas de quem compra agora.
 *
 * A BARRA FIXA CONTINUA, com "Avise-me" no lugar do "Comprar": quem rolou
 * a página lendo as seções e decidiu que quer tem o mesmo atalho de volta —
 * só que pra caixa do aviso.
 *
 * O "de" riscado fica, e a economia não: "Economiza R$ 70" de uma coisa que
 * não dá pra comprar é promessa sem objeto.
 */
function CompraEsgotada({
  nome,
  foto,
  varianteId,
  preco,
  precoCheio,
  caixa,
}: {
  nome: string
  foto: string | null
  varianteId: string
  preco: number
  precoCheio: number | null
  caixa: React.RefObject<HTMLDivElement | null>
}) {
  const riscado = precoCheio && precoCheio > preco ? precoCheio : null
  return (
    <>
      <div itemProp="offers" itemScope itemType="https://schema.org/Offer">
        <DadosDaOferta preco={preco} disponivel={false} />
        <p className="compra__precos">
          <span className="compra__por">{emReais(preco)}</span>
          {riscado ? (
            <span className="compra__de">
              <span className="sr-only">antes </span>
              {emReais(riscado)}
            </span>
          ) : null}
        </p>
        <p className="compra__esgotado">
          <b>Esgotado</b>
          <span>Acabou o estoque deste produto.</span>
        </p>
      </div>

      <AviseMe varianteId={varianteId} nome={nome} caixa={caixa} />

      <BarraFixa
        nome={nome}
        foto={foto}
        juntos={[]}
        preco={preco}
        riscado={riscado}
        alvo={caixa}
        ocupado={false}
        disponivel={false}
        aoComprar={() => irParaOAviso(caixa)}
        aviso
      />
    </>
  )
}

/**
 * O "Avise-me" da barra fixa: rola até a caixa e põe o cursor no campo. O
 * foco vai sem rolar de novo (`preventScroll`), senão ele pula a caixa pro
 * topo da tela, por cima da rolagem suave.
 */
function irParaOAviso(caixa: React.RefObject<HTMLDivElement | null>) {
  const el = caixa.current
  if (!el) return
  el.scrollIntoView({ behavior: "smooth", block: "center" })
  el.querySelector<HTMLInputElement>('input[type="email"]')?.focus({ preventScroll: true })
}

/**
 * `quantos`: com algo marcado no "leve junto", quantos vão no clique — o
 * botão diz "Adicionar os 3" (0221), e a pessoa sabe que os marcados vão
 * junto sem descer até a gaveta pra conferir. Sem o "à sacola": ao lado da
 * quantidade ele quebrava o botão em duas linhas, no celular e no
 * computador, e o ícone da sacola do lado já diz pra onde vai.
 */
function textoDoBotao(enviando: boolean, disponivel: boolean, quantos: number | null) {
  if (!disponivel) return "Esgotado"
  if (enviando) return "Adicionando…"
  return quantos ? `Adicionar os ${quantos}` : "Adicionar à sacola"
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
 * a refazer a conta de cabeça. Por isso ele vem com o "+" na frente.
 *
 * UMA CAIXA SÓ, com o total embaixo (0221, a opção D do canvas "Leve
 * junto", escolhida pelo dono). Antes eram cartões soltos de canto chanfrado
 * — o chanfro cortava a borda e o cartão parecia quebrado — e cada item
 * ganhava a tarja "FRETE GRÁTIS", que se lia como atributo do produto e não
 * como "levando este, o frete sai grátis". Agora o frete mora no rodapé,
 * dito uma vez só, junto do total do clique.
 *
 * Continua sendo um `<input type="checkbox">` de verdade (teclado, leitor de
 * tela e o `check()` dos conferidores): ele cobre a linha inteira, invisível,
 * e o que se vê é o botão "Levar" / "Vai junto", desenhado pelo `:checked`.
 */
function LeveJunto({
  itens,
  marcados,
  aoAlternar,
  rotulo,
  total,
  frete,
}: {
  itens: readonly ProdutoQueCombina[]
  marcados: Set<string>
  aoAlternar: (varianteId: string) => void
  /** "Total" · "Total dos 3" */
  rotulo: string
  /** O que vai no clique: este produto nas unidades escolhidas, mais os marcados. */
  total: number
  /** O frete desse total, com o texto do `frasesDoFrete`; `null` = não se fala de frete. */
  frete: { alcancou: boolean; texto: string } | null
}) {
  return (
    <fieldset className="junto">
      <legend className="junto__titulo">
        <Raio />
        Leve junto
      </legend>

      <div className="junto__caixa">
        <ul className="junto__lista">
          {itens.map((item) => {
            const marcado = marcados.has(item.varianteId)
            const medida = medidaDoNome(item.nome)
            return (
              <li key={item.varianteId}>
                <label className="junto__item">
                  <input
                    type="checkbox"
                    checked={marcado}
                    onChange={() => aoAlternar(item.varianteId)}
                    aria-label={`Levar junto: ${item.nome}, mais ${emReais(item.preco)}`}
                  />
                  {item.foto ? (
                    <Image src={item.foto} alt="" width={40} height={40} sizes="40px" />
                  ) : (
                    <span className="junto__sem-foto" aria-hidden="true" />
                  )}
                  <span className="junto__texto">
                    <span className="junto__nome">{nomeCurto(item.nome)}</span>
                    <span className="junto__detalhe">
                      {medida ? `${medida} · ` : null}
                      <b className="junto__preco">+ {emReais(item.preco)}</b>
                    </span>
                  </span>
                  <span className="junto__botao" aria-hidden="true">
                    {marcado ? <Certo /> : <Mais />}
                    {marcado ? "Vai junto" : "Levar"}
                  </span>
                </label>
              </li>
            )
          })}
        </ul>

        <p
          className="junto__rodape"
          data-alcancou={frete?.alcancou ? "" : undefined}
          aria-live="polite"
        >
          {frete ? (
            <span className="junto__frete">
              {frete.alcancou ? <Raio /> : null}
              {frete.texto}
            </span>
          ) : null}
          <span className="junto__total">
            {rotulo} <b>{emReais(total)}</b>
          </span>
        </p>
      </div>
    </fieldset>
  )
}

/**
 * "Fator de Crescimento para Barba 30ml" → "30 ml": a medida vai pra linha
 * de baixo, do lado do preço, e o nome de cima fica curto (`nomeCurto`).
 */
function medidaDoNome(nome: string): string | null {
  const m = nome.match(/\b(\d+(?:[.,]\d+)?)\s?(ml|g|kg|l)\b/i)
  return m ? `${m[1]} ${m[2]!.toLowerCase()}` : null
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
  semMelhor = false,
  escolhido,
  tarja,
  aoEscolher,
}: {
  degraus: readonly DegrauDeQuantidade[]
  /** Sem a fita "Melhor preço": na oferta, a unidade custa o mesmo em todos. */
  semMelhor?: boolean
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
              {!semMelhor && i === melhor && d.economia > 0 ? (
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
  juntos,
  preco,
  riscado,
  alvo,
  ocupado,
  disponivel,
  aoComprar,
  aviso = false,
  oferta = null,
}: {
  nome: string
  foto: string | null
  /** Os itens marcados no "leve junto": vão no mesmo clique, então aparecem aqui. */
  juntos: readonly ProdutoQueCombina[]
  preco: number
  riscado: number | null
  /** O que, saindo de vista, faz a barra aparecer: o botão de comprar, ou a caixa do aviso. */
  alvo: React.RefObject<HTMLElement | null>
  ocupado: boolean
  disponivel: boolean
  aoComprar: () => void
  /** Esgotado: o botão vira "Avise-me" e leva pra caixa do aviso (`aoComprar`). */
  aviso?: boolean
  /** A oferta oculta de quem veio pelo link: o prazo dela embaixo do preço. */
  oferta?: OfertaNaPdp | null
}) {
  const [mostra, setMostra] = useState(false)
  // À vista, a barra ocupa o pé da tela: a faixa de cookies sobe pra cima dela.
  const barra = useRef<HTMLDivElement>(null)
  usePeDaTela(barra, mostra)

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
    <div ref={barra} className={mostra ? "barra-compra e-visivel" : "barra-compra"}>
      {foto || juntos.length ? (
        <span className="barra-compra__fotos" data-juntos={juntos.length || undefined}>
          {/* Os de trás primeiro: o último da lista fica mais longe da principal. */}
          {[...juntos]
            .reverse()
            .map((j, i) =>
              j.foto ? (
                <Image
                  key={j.varianteId}
                  className="barra-compra__foto barra-compra__foto--atras"
                  style={{ "--nivel": juntos.length - i } as React.CSSProperties}
                  src={j.foto}
                  alt=""
                  width={92}
                  height={92}
                />
              ) : (
                <span
                  key={j.varianteId}
                  className="barra-compra__foto barra-compra__foto--atras barra-compra__sem-foto"
                  style={{ "--nivel": juntos.length - i } as React.CSSProperties}
                  aria-hidden="true"
                />
              )
            )}
          {foto ? (
            <Image className="barra-compra__foto" src={foto} alt="" width={92} height={92} />
          ) : (
            <span className="barra-compra__foto barra-compra__sem-foto" aria-hidden="true" />
          )}
        </span>
      ) : null}

      <span className="barra-compra__texto">
        <span className="barra-compra__nome">
          <span className="barra-compra__nome-texto">{nome}</span>
          {juntos.length ? (
            <span className="barra-compra__mais">
              +{juntos.length}
              <span className="sr-only">
                {juntos.length === 1 ? " produto que combina" : " produtos que combinam"}
              </span>
            </span>
          ) : null}
        </span>
        <span className="barra-compra__preco">
          {emReais(preco)} {riscado ? <s>{emReais(riscado)}</s> : null}
        </span>
        {oferta ? <PrazoDaOferta terminaEm={oferta.terminaEm} /> : null}
      </span>

      {aviso ? (
        <button type="button" className="btn" onClick={aoComprar}>
          Avise-me
          <Envelope className="btn__icone" />
        </button>
      ) : (
        <button type="button" className="btn" onClick={aoComprar} disabled={ocupado || !disponivel}>
          {disponivel ? (ocupado ? "Adicionando…" : "Comprar") : "Esgotado"}
          <Sacola className="btn__icone" />
        </button>
      )}
    </div>
  )
}

/**
 * Avisa que a sacola mudou, quando a dobra está FORA do provedor (sem
 * gaveta pra abrir no clique). Quem escuta é o provedor no layout — o
 * contador do cabeçalho e a gaveta se atualizam juntos, e a gaveta abre.
 * Dentro dele, quem avisa é o `adicionar` do contexto, antes da resposta.
 */
function avisarSacola(carrinho: CarrinhoVisivel) {
  window.dispatchEvent(new CustomEvent(EVENTO_SACOLA, { detail: carrinho }))
}
