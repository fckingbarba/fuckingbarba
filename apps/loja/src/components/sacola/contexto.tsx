"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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

type Sacola = {
  carrinho: CarrinhoVisivel
  aberta: boolean
  /** true enquanto uma ação está em voo — a gaveta usa pra travar os botões */
  ocupada: boolean
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
  const [carrinho, setCarrinho] = useState<CarrinhoVisivel>(CARRINHO_VAZIO)
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
      .then((c) => vivo && setCarrinho(c))
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
      setCarrinho(novo)
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

  const aplicar = useCallback(
    (promessa: Promise<{ ok: boolean; carrinho: CarrinhoVisivel; erro?: string }>) => {
      comecar(async () => {
        const r = await promessa
        setCarrinho(r.carrinho)
        setErro(r.ok ? null : (r.erro ?? null))
      })
    },
    []
  )

  const valor = useMemo<Sacola>(
    () => ({
      carrinho,
      aberta,
      ocupada,
      erro,
      abrir: () => setAberta(true),
      fechar: () => setAberta(false),
      mudar: (linhaId, quantidade) => aplicar(mudarQuantidade(linhaId, quantidade)),
      tirar: (linhaId) => aplicar(remover(linhaId)),
    }),
    [carrinho, aberta, ocupada, erro, aplicar]
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
