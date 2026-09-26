"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useOptimistic,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react"
import { mudarQuantidade, remover, type Resultado } from "@/lib/acoes/carrinho"
import {
  CARRINHO_VAZIO,
  type CarrinhoVisivel,
  type ItemChegando,
  type ItemDoCarrinho,
} from "@/lib/carrinho-visivel"
import { rastrearMudancaDaSacola } from "@/lib/rastrear"
import { SEM_CONEXAO, semQueda } from "@/lib/rede"

/**
 * O ESTADO DA SACOLA, UM SÓ
 *
 * O contador do cabeçalho e a gaveta mostram o mesmo número e moram em
 * galhos diferentes da árvore — o cabeçalho vem do layout, a gaveta também,
 * e quem adiciona é uma página. Sem um lugar comum, cada um faria a própria
 * leitura e os dois discordariam no primeiro clique.
 *
 * NÃO É ESTADO DE SERVIDOR DISFARÇADO. O que mora aqui é a última resposta
 * do Medusa, inteira, do jeito que ela veio. Nada é recalculado no navegador:
 * quantidade, subtotal e total saem sempre de uma ação, e é por isso que a
 * gaveta e o checkout não têm como divergir.
 *
 * POR QUE NÃO LER O CARRINHO NO LAYOUT (que seria mais simples): porque
 * `cookies()` torna dinâmico tudo que está acima dele. O layout envolve o
 * site inteiro — lê-lo ali tornaria a home e as páginas de produto dinâmicas
 * e jogaria fora o cache do catálogo pra mostrar um número que quase sempre
 * é zero. A leitura fica no cliente, depois da pintura, e a casca continua
 * estática.
 */

/**
 * O QUE MUDA NA HORA, E O QUE ESPERA O SERVIDOR
 *
 * Mexer na sacola custa uma ida ao Medusa — uns 300 ms num dia bom. Sem
 * nada na tela nesse intervalo, clicar em "+" parece não ter funcionado, e a
 * segunda reação de todo mundo é clicar de novo.
 *
 * A divisão é essa, e ela não é arbitrária:
 *
 *   QUANTIDADE muda na hora. É a própria pessoa ecoada de volta — ela sabe
 *   o que 2 vira quando aperta "+", e esperar meio segundo pra ver o 3 é
 *   latência à toa. Some a linha inteira na hora, também, quando é remoção.
 *
 *   O TOTAL DA LINHA acompanha, porque é multiplicação de dois números que
 *   já estão na tela — o unitário está escrito ali mesmo, "R$ 149,90 cada".
 *   Não acompanhar seria pior que esperar: mostraria R$ 149,90 ao lado de
 *   uma quantidade 2, um número visivelmente errado só que esmaecido.
 *
 *   O TOTAL DO CARRINHO ESPERA. Ele não é multiplicação: é onde entram
 *   promoção, piso de frete grátis e cupom. Dava pra somar as linhas e
 *   acertar quase sempre — e "quase sempre" quebra exatamente onde tem
 *   desconto, que é onde o cliente mais olha. Um número que pula duas vezes
 *   é pior que um número que demora 300 ms, e a loja inteira foi escrita em
 *   cima da regra de que quem faz conta de dinheiro é o Medusa.
 *
 *   A LINHA NOVA DE UM "ADICIONAR" também entra na hora (entrega 0104): a
 *   gaveta abre no clique, com a foto, o nome e o preço que a página já
 *   mostrava. Na produção, cada escrita na sacola leva de 0,6 a 0,9 s no
 *   Medusa (a primeira, que cria o carrinho, mais), e o "Adicionando…" do
 *   botão era tudo que a pessoa via nesse tempo. O total, de novo, espera.
 *
 * "300 ms num dia bom" era a conta do Medusa local. Medido na produção em
 * 26/09: 0,9 a 1,2 s por clique, quase tudo no Medusa.
 */
type Adicionado = ItemChegando & {
  /** Quanto desta variante a sacola na tela tinha no clique (ver `chegar`). */
  antes: number
}

type Mudanca =
  | { tipo: "quantidade"; linhaId: string; quantidade: number }
  | { tipo: "remover"; linhaId: string }
  | { tipo: "adicionar"; itens: Adicionado[] }

function prever(carrinho: CarrinhoVisivel, m: Mudanca): CarrinhoVisivel {
  const itens =
    m.tipo === "adicionar"
      ? chegar(carrinho.itens, m.itens)
      : m.tipo === "remover"
        ? carrinho.itens.filter((i) => i.id !== m.linhaId)
        : carrinho.itens.map((i) =>
            i.id === m.linhaId
              ? // O total DA LINHA acompanha, e isso não é chutar preço: é
                // multiplicar dois números que já estão na tela, sendo que o
                // unitário está escrito logo acima ("R$ 149,90 cada"). Deixar
                // ele parado mostraria 149,90 ao lado de uma quantidade 2 —
                // um número visivelmente errado, só que esmaecido.
                { ...i, quantidade: m.quantidade, total: i.precoUnitario * m.quantidade }
              : i
          )

  return {
    ...carrinho,
    itens,
    unidades: itens.reduce((soma, i) => soma + i.quantidade, 0),
    // O SUBTOTAL E O TOTAL DO CARRINHO ficam como estavam: são do servidor,
    // e a gaveta os mostra esmaecidos enquanto `ocupada` for true. A conta
    // deles não é multiplicação — é onde entram promoção, piso de frete
    // grátis e cupom, e é justamente onde um palpite erraria.
  }
}

/**
 * AS LINHAS QUE UM "ADICIONAR" PÕE NA TELA antes da resposta.
 *
 * A previsão NÃO PODE SOMAR DUAS VEZES, e isso não é detalhe: o React refaz
 * as previsões pendentes em cima de cada sacola que chega enquanto a
 * transição não termina — e várias transições em voo terminam juntas (o
 * React as agrupa). Uma resposta que já conta o produto receberia a previsão
 * por cima, e o 1 viraria 2 até o fim da fila.
 *
 * Por isso a previsão guarda `antes`: quanto daquela variante a sacola da
 * tela tinha no clique. A linha só cresce se ainda estiver com esse número;
 * com o servidor já contando o item, ela passa reto e vale o número dele.
 * Linha que não existe nasce com um id provisório e `chegando` — sem id de
 * verdade, os botões dela esperam (ver a gaveta).
 */
function chegar(itens: ItemDoCarrinho[], novos: Adicionado[]): ItemDoCarrinho[] {
  let lista = itens
  for (const n of novos) {
    const linha = lista.find((i) => i.varianteId === n.varianteId)
    if (!linha) {
      // Tinha no clique e sumiu (uma remoção no meio): não ressuscita.
      if (n.antes > 0) continue
      lista = [
        ...lista,
        {
          id: `chegando:${n.varianteId}`,
          varianteId: n.varianteId,
          nome: n.nome,
          variante: n.variante ?? null,
          handle: n.handle,
          imagem: n.imagem,
          quantidade: n.quantidade,
          precoUnitario: n.precoUnitario,
          total: n.total ?? n.precoUnitario * n.quantidade,
          chegando: true,
        },
      ]
    } else if (linha.quantidade === n.antes) {
      const quantidade = n.antes + n.quantidade
      lista = lista.map((i) =>
        i === linha
          ? { ...i, quantidade, total: i.precoUnitario * quantidade, chegando: true as const }
          : i
      )
    }
  }
  return lista
}

/**
 * Se a sacola na tela é a da pessoa.
 *
 *   "esperando" — a primeira leitura ainda não voltou;
 *   "feita"     — alguma resposta do servidor já chegou (e daí em diante fica
 *                 "feita": uma leitura que falha depois não apaga a sacola
 *                 que já estava na tela);
 *   "falhou"    — nenhuma resposta chegou, e a última tentativa não voltou.
 *
 * Fora do "feita", o `carrinho` é o vazio de partida, e NÃO é a sacola da
 * pessoa: o contador não mostra número e a gaveta não diz "vazia". Dizia —
 * e com o Medusa reiniciando (todo deploy), quem tinha dois produtos via a
 * sacola vazia, punha os dois de novo e ficava com quatro (24/09).
 */
export type LeituraDaSacola = "esperando" | "feita" | "falhou"

/** Quanto uma leitura espera antes de desistir (e a tela ficar com o que tinha). */
const PRAZO_DA_LEITURA_MS = 10_000

/**
 * A sacola de agora, pela rota de leitura (`/api/sacola`) — ou null, se o
 * Medusa não respondeu, a internet caiu, ou o prazo passou. Por que é uma
 * rota, e não uma action: lá.
 */
async function lerSacola(): Promise<CarrinhoVisivel | null> {
  try {
    const r = await fetch("/api/sacola", {
      cache: "no-store",
      signal: AbortSignal.timeout(PRAZO_DA_LEITURA_MS),
    })
    if (!r.ok) return null
    return ((await r.json()) as { carrinho: CarrinhoVisivel | null }).carrinho
  } catch {
    return null
  }
}

type Sacola = {
  carrinho: CarrinhoVisivel
  leitura: LeituraDaSacola
  aberta: boolean
  /** true enquanto uma escrita está em voo — esmaece o dinheiro (os botões seguem valendo) */
  ocupada: boolean
  /** a linha em que a pessoa acabou de mexer, pra ela mostrar que está ocupada */
  mexendo: string | null
  erro: string | null
  abrir: () => void
  fechar: () => void
  mudar: (linhaId: string, quantidade: number) => void
  tirar: (linhaId: string) => void
  /**
   * Põe na sacola: abre a gaveta NA HORA, com as linhas que a página já sabe
   * desenhar, e chama a ação (`adicionar`/`adicionarVarios`) na fila das
   * escritas. Devolve o resultado da ação, pra quem clicou dizer o erro
   * perto do botão também.
   *
   * CHAME NO CLIQUE, NUNCA DE DENTRO DE UMA TRANSIÇÃO: o que muda dentro de
   * uma transição assíncrona o React só mostra quando ela termina, e a
   * gaveta abriria junto com a resposta. Quem quer o "Adicionando…" guarda a
   * promessa e espera ela na própria transição (ver a dobra, `compra.tsx`).
   */
  adicionar: (itens: ItemChegando[], chamar: () => Promise<Resultado>) => Promise<Resultado>
  /** Relê a sacola no servidor. Ver o porquê no provedor. */
  recarregar: () => void
  /** true enquanto uma releitura pedida está no caminho (o "Tentar de novo") */
  relendo: boolean
  /**
   * Roda uma ação que escreve no carrinho por outro caminho — hoje, o frete
   * da sacola — dentro da MESMA espera das quantidades. Ver o porquê no
   * provedor.
   */
  comCarrinho: <T extends { carrinho?: CarrinhoVisivel | null }>(
    chamar: () => Promise<T>
  ) => Promise<T>
}

const Contexto = createContext<Sacola | null>(null)

/**
 * O recado de "mudou a sacola", disparado por quem escreve nela sem passar
 * pela gaveta (hoje, o "comprar de novo" da conta). É evento de DOM, e não
 * uma função deste contexto, pra que quem avisa não precise importar nada
 * daqui: ele escreve, avisa, e quem quiser que escute. Os botões de comprar
 * usam o `adicionar` do contexto, que abre a gaveta antes da resposta — e
 * caem neste evento só fora do provedor.
 */
export const EVENTO_SACOLA = "sacola:mudou"

/** A escrita que chegou na vez dela já não era a última pedida pra linha: não foi. */
const PULOU = Symbol("pulou")

export function ProvedorDaSacola({ children }: { children: ReactNode }) {
  const [confirmado, setConfirmado] = useState<CarrinhoVisivel>(CARRINHO_VAZIO)
  const [carrinho, prevendo] = useOptimistic(confirmado, prever)
  const [leitura, setLeitura] = useState<LeituraDaSacola>("esperando")
  const [mexendo, setMexendo] = useState<string | null>(null)
  const [aberta, setAberta] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [relendo, setRelendo] = useState(false)
  const [ocupada, comecar] = useTransition()

  /*
   * A VEZ DE CADA RESPOSTA. Uma leitura que sai antes de um clique e volta
   * depois dele traz a sacola de antes do clique — e, aplicada, desfaz o
   * clique na tela. Toda resposta que muda a sacola conta uma vez; a leitura
   * guarda a vez em que saiu e, se alguém mudou a sacola no meio, é jogada fora.
   */
  const vez = useRef(0)

  /**
   * A última sacola confirmada, e se ela já foi lida do servidor: o que
   * entrou e saiu (o rastreio) é a diferença pra ela — antes da primeira
   * leitura não há com o que comparar, e a sacola inteira contaria como
   * "adicionada".
   */
  const ultima = useRef<CarrinhoVisivel | null>(null)

  /** A sacola que o servidor mandou: de uma ação, ou de quem adicionou. */
  const receber = useCallback((c: CarrinhoVisivel) => {
    vez.current++
    if (ultima.current) rastrearMudancaDaSacola(ultima.current.itens, c.itens)
    ultima.current = c
    setConfirmado(c)
    setLeitura("feita")
  }, [])

  /** A resposta de uma leitura — se ninguém mudou a sacola desde que ela saiu. */
  const aplicarLeitura = useCallback((minha: number, c: CarrinhoVisivel | null) => {
    if (minha !== vez.current) return
    if (c) {
      ultima.current = c
      setConfirmado(c)
      setLeitura("feita")
    } else {
      // Sem resposta: a sacola que já estava na tela fica. Só a que nunca
      // chegou vira "falhou" — é aí que a gaveta diz que não conseguiu abrir.
      setLeitura((antes) => (antes === "feita" ? antes : "falhou"))
    }
  }, [])

  const ler = useCallback(async () => {
    const minha = ++vez.current
    aplicarLeitura(minha, await lerSacola())
  }, [aplicarLeitura])

  /*
   * A primeira leitura roda depois da pintura, de propósito: o número do
   * cabeçalho aparece um instante depois do resto, e em troca a página
   * inteira continua saindo do cache. Quem chega de fora vê a loja, não um
   * spinner.
   */
  useEffect(() => {
    const minha = ++vez.current
    void lerSacola().then((c) => aplicarLeitura(minha, c))
  }, [aplicarLeitura])

  /**
   * Relê a sacola sob encomenda. POR FORA da transição das quantidades, de
   * propósito: os botões não esperam por ela — uma leitura presa na rede não
   * pode travar o "+". Se um clique responder antes, a leitura é descartada
   * (a vez, acima).
   *
   * O provedor mora no layout raiz e NUNCA REMONTA, então a leitura de cima
   * roda uma vez por aba e mais nada. Quem terminava uma compra continuava
   * vendo "1" no cabeçalho até dar F5 — o pedido fechado, a sacola vazia, e o
   * número dizendo o contrário.
   *
   * Quem chama: a gaveta, toda vez que abre (a sacola muda por fora dela — a
   * oferta marcada no checkout, outra aba); `<RecarregaSacola />`, na tela de
   * obrigado e na saída do checkout; e o "Tentar de novo" da gaveta. A
   * alternativa era reler a cada navegação com `usePathname`, e ela tem dois
   * defeitos: uma ida ao servidor por página pra todo mundo, e — com Cache
   * Components — `usePathname` fora de `<Suspense>` é erro de build, e este
   * provedor envolve o site inteiro.
   */
  const recarregar = useCallback(() => {
    setRelendo(true)
    void ler().finally(() => setRelendo(false))
  }, [ler])

  // Quem adiciona (a dobra) avisa por evento; a gaveta abre junto, porque
  // adicionar sem ver a sacola deixa a pessoa sem saber se deu certo.
  useEffect(() => {
    function aoMudar(e: Event) {
      const novo = (e as CustomEvent<CarrinhoVisivel>).detail
      if (!novo) return
      receber(novo)
      setErro(null)
      setAberta(true)
    }
    window.addEventListener(EVENTO_SACOLA, aoMudar)
    return () => window.removeEventListener(EVENTO_SACOLA, aoMudar)
  }, [receber])

  // Esc fecha, como em qualquer diálogo. Fica no provedor e não na gaveta
  // porque o ouvinte precisa existir mesmo com a gaveta fora de foco.
  useEffect(() => {
    if (!aberta) return
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "Escape") setAberta(false)
    }
    window.addEventListener("keydown", aoTeclar)
    return () => window.removeEventListener("keydown", aoTeclar)
  }, [aberta])

  /*
   * A classe no <html> é o que o CSS do protótipo espera: ela abre o véu,
   * desliza a gaveta e trava a rolagem do fundo. Trava a rolagem no elemento
   * raiz, e não no body, porque no iOS o body continua rolando por baixo.
   */
  useEffect(() => {
    document.documentElement.classList.toggle("carrinho-aberto", aberta)
    return () => document.documentElement.classList.remove("carrinho-aberto")
  }, [aberta])

  /**
   * AS ESCRITAS ANDAM EM FILA, E OS CLIQUES NÃO ESPERAM POR ELA (entrega 0104).
   *
   * Uma escrita de cada vez no carrinho, sempre: duas ao mesmo tempo e a
   * resposta que chegar por último sobrescreve a outra na tela, com o total
   * de um carrinho que já não existe. Até a 0104 quem garantia isso eram os
   * botões, travados enquanto qualquer escrita estava em voo — e na produção
   * cada uma leva perto de um segundo: o segundo "+" seguido não pegava.
   *
   * Agora os botões ficam soltos, a tela muda no clique, e a fila garante a
   * ordem. E ela JUNTA os cliques: na vez de uma escrita de quantidade, se a
   * pessoa já pediu outro número pra mesma linha, ela nem sai (`PULOU`) — vai
   * só o último. Três "+" seguidos são duas idas ao Medusa, não três.
   */
  const fila = useRef<Promise<unknown>>(Promise.resolve())
  const naFila = useCallback(<T,>(tarefa: () => Promise<T>): Promise<T> => {
    const vez = fila.current.then(tarefa)
    fila.current = vez.catch(() => undefined)
    return vez
  }, [])

  /** A última quantidade pedida em cada linha — é ela que a fila escreve. */
  const pedida = useRef(new Map<string, number>())

  /** Quantas escritas ainda estão em voo — a barrinha da linha só sai com a última. */
  const emVoo = useRef(0)

  /**
   * A previsão e a chamada vão na MESMA transição — é o que faz o React
   * segurar a previsão até a resposta chegar e só então trocar pelo real.
   * Fora da transição, ela seria descartada no próximo render e o número
   * voltaria sozinho antes da hora.
   *
   * Sem resposta (`carrinho: null`, ou a ação que nem voltou), a previsão se
   * desfaz no fim da transição e a sacola de antes volta, com o recado. A
   * escrita que a fila pulou não mexe em nada: a mais nova responde por ela.
   */
  function aplicar(
    mudanca: Mudanca,
    linha: string | null,
    chamar: () => Promise<Resultado | typeof PULOU>
  ): Promise<Resultado | null> {
    setErro(null)
    if (linha) setMexendo(linha)
    emVoo.current++
    return new Promise((resolver) => {
      comecar(async () => {
        prevendo(mudanca)
        const r = await semQueda(chamar, (): Resultado => ({
          ok: false,
          erro: SEM_CONEXAO,
          carrinho: null,
        }))
        if (--emVoo.current === 0) setMexendo(null)
        if (r === PULOU) return resolver(null)
        if (r.carrinho) receber(r.carrinho)
        setErro(r.ok ? null : r.erro)
        resolver(r)
      })
    })
  }

  /** Muda (ou tira, com zero) uma linha: a tela no clique, a escrita na fila. */
  function mudarLinha(linhaId: string, quantidade: number) {
    pedida.current.set(linhaId, quantidade)
    const mudanca: Mudanca =
      quantidade <= 0 ? { tipo: "remover", linhaId } : { tipo: "quantidade", linhaId, quantidade }
    void aplicar(mudanca, linhaId, () =>
      naFila(async () => {
        if (pedida.current.get(linhaId) !== quantidade) return PULOU
        try {
          return quantidade <= 0
            ? await remover(linhaId)
            : await mudarQuantidade(linhaId, quantidade)
        } finally {
          if (pedida.current.get(linhaId) === quantidade) pedida.current.delete(linhaId)
        }
      })
    )
  }

  /**
   * O FRETE DA SACOLA ESPERA NA MESMA FILA DAS QUANTIDADES.
   *
   * Calcular o CEP grava endereço e entrega no carrinho, e o Medusa refaz o
   * total. Se isso corresse por fora, um "+" apertado no meio da cotação
   * seria uma segunda escrita no mesmo carrinho ao mesmo tempo — e aí a
   * resposta que chegar por último sobrescreve a outra na tela, com o total
   * de um carrinho que já não existe.
   *
   * Dentro da transição daqui, o dinheiro esmaece como em qualquer outra
   * conta do servidor, e o carrinho que volta substitui o da tela inteiro.
   * Quem chamou recebe a resposta de volta — as opções de entrega que a
   * ação cotou são dela, não da sacola.
   */
  const comCarrinho = useCallback(
    <T extends { carrinho?: CarrinhoVisivel | null }>(chamar: () => Promise<T>) =>
      new Promise<T>((resolver, recusar) => {
        comecar(async () => {
          try {
            const r = await naFila(chamar)
            if (r.carrinho) receber(r.carrinho)
            resolver(r)
          } catch (e) {
            recusar(e)
          }
        })
      }),
    [receber, naFila]
  )

  const valor = useMemo<Sacola>(
    () => ({
      carrinho,
      leitura,
      relendo,
      aberta,
      ocupada,
      mexendo,
      erro,
      // Abrir relê: a sacola muda por fora da gaveta (a oferta marcada no
      // checkout, a outra aba), e a gaveta mostrava a de antes (24/09).
      abrir: () => {
        setAberta(true)
        recarregar()
      },
      fechar: () => setAberta(false),
      mudar: mudarLinha,
      tirar: (linhaId) => mudarLinha(linhaId, 0),
      // Abre SEM reler: a leitura voltaria com a sacola de antes do clique.
      // `antes` é o que a sacola da tela tem agora — ver `chegar`.
      adicionar: async (itens, chamar) => {
        setAberta(true)
        const r = await aplicar(
          {
            tipo: "adicionar",
            itens: itens.map((i) => ({
              ...i,
              antes: carrinho.itens.find((l) => l.varianteId === i.varianteId)?.quantidade ?? 0,
            })),
          },
          null,
          () => naFila(chamar)
        )
        // Adicionar nunca é pulado; o `null` só existe pra quantidade.
        return r ?? { ok: false, erro: SEM_CONEXAO, carrinho: null }
      },
      recarregar,
      comCarrinho,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [carrinho, leitura, relendo, aberta, ocupada, mexendo, erro, recarregar, comCarrinho]
  )

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

/**
 * Devolve null fora do provedor em vez de estourar: o cabeçalho e a gaveta
 * são montados pelo layout, mas nada impede alguém renderizar um deles
 * isolado num teste ou numa página avulsa. Quem chama trata o null mostrando
 * o estado vazio, que é o certo — sacola sem provedor é sacola vazia.
 */
export function useSacola(): Sacola | null {
  return useContext(Contexto)
}
