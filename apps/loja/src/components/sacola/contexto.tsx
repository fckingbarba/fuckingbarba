"use client"

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useOptimistic,
  useState,
  useTransition,
  type ReactNode,
} from "react"
import { mudarQuantidade, remover, sincronizar } from "@/lib/acoes/carrinho"
import { CARRINHO_VAZIO, type CarrinhoVisivel } from "@/lib/carrinho-visivel"

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
 */
type Mudanca =
  { tipo: "quantidade"; linhaId: string; quantidade: number } | { tipo: "remover"; linhaId: string }

function prever(carrinho: CarrinhoVisivel, m: Mudanca): CarrinhoVisivel {
  const itens =
    m.tipo === "remover"
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

type Sacola = {
  carrinho: CarrinhoVisivel
  aberta: boolean
  /** true enquanto uma ação está em voo — trava os botões e esmaece o dinheiro */
  ocupada: boolean
  /** a linha em que a pessoa acabou de mexer, pra ela mostrar que está ocupada */
  mexendo: string | null
  erro: string | null
  abrir: () => void
  fechar: () => void
  mudar: (linhaId: string, quantidade: number) => void
  tirar: (linhaId: string) => void
}

const Contexto = createContext<Sacola | null>(null)

/**
 * O recado de "mudou a sacola", disparado por quem adiciona (hoje o botão da
 * PDP). É evento de DOM, e não uma função deste contexto, pra que a dobra não
 * precise importar nada daqui: ela adiciona, avisa, e quem quiser que escute.
 */
export const EVENTO_SACOLA = "sacola:mudou"

export function ProvedorDaSacola({ children }: { children: ReactNode }) {
  const [confirmado, setConfirmado] = useState<CarrinhoVisivel>(CARRINHO_VAZIO)
  const [carrinho, prevendo] = useOptimistic(confirmado, prever)
  const [mexendo, setMexendo] = useState<string | null>(null)
  const [aberta, setAberta] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [ocupada, comecar] = useTransition()

  /*
   * A primeira leitura roda depois da pintura, de propósito: o número do
   * cabeçalho aparece um instante depois do resto, e em troca a página
   * inteira continua saindo do cache. Quem chega de fora vê a loja, não um
   * spinner.
   */
  useEffect(() => {
    let vivo = true
    sincronizar()
      .then((c) => vivo && setConfirmado(c))
      .catch(() => {})
    return () => {
      vivo = false
    }
  }, [])

  // Quem adiciona (a dobra) avisa por evento; a gaveta abre junto, porque
  // adicionar sem ver a sacola deixa a pessoa sem saber se deu certo.
  useEffect(() => {
    function aoMudar(e: Event) {
      const novo = (e as CustomEvent<CarrinhoVisivel>).detail
      if (!novo) return
      setConfirmado(novo)
      setErro(null)
      setAberta(true)
    }
    window.addEventListener(EVENTO_SACOLA, aoMudar)
    return () => window.removeEventListener(EVENTO_SACOLA, aoMudar)
  }, [])

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
   * A previsão e a chamada vão na MESMA transição — é o que faz o React
   * segurar a previsão até a resposta chegar e só então trocar pelo real.
   * Fora da transição, ela seria descartada no próximo render e o número
   * voltaria sozinho antes da hora.
   */
  function aplicar(
    mudanca: Mudanca,
    chamar: () => Promise<{ ok: boolean; carrinho: CarrinhoVisivel; erro?: string }>
  ) {
    setErro(null)
    setMexendo(mudanca.linhaId)
    comecar(async () => {
      prevendo(mudanca)
      const r = await chamar()
      setConfirmado(r.carrinho)
      setErro(r.ok ? null : (r.erro ?? null))
      setMexendo(null)
    })
  }

  const valor = useMemo<Sacola>(
    () => ({
      carrinho,
      aberta,
      ocupada,
      mexendo,
      erro,
      abrir: () => setAberta(true),
      fechar: () => setAberta(false),
      mudar: (linhaId, quantidade) =>
        quantidade <= 0
          ? aplicar({ tipo: "remover", linhaId }, () => remover(linhaId))
          : aplicar({ tipo: "quantidade", linhaId, quantidade }, () =>
              mudarQuantidade(linhaId, quantidade)
            ),
      tirar: (linhaId) => aplicar({ tipo: "remover", linhaId }, () => remover(linhaId)),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [carrinho, aberta, ocupada, mexendo, erro]
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
