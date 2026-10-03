"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Suspense, useEffect, useRef, useState } from "react"
import { Barba, Caixa, Casa, Pente, Sacola } from "@/components/icones"
import { nomeDaSacola } from "@/components/sacola/botao"
import { useSacola } from "@/components/sacola/contexto"
import { EM_BREVE, site, type HandleCategoria } from "@/lib/site"
import { usePeDaTela } from "@/lib/use-pe-da-tela"

const ICONE_DA_CATEGORIA: Record<HandleCategoria, typeof Barba> = {
  barba: Barba,
  cabelo: Pente,
  kits: Caixa,
}

/** A aba do endereço: a home, uma categoria (com a ordem, `/barba/ordem/…`) ou nenhuma. */
function abaDo(caminho: string | null): "inicio" | HandleCategoria | null {
  if (caminho === null) return null
  if (caminho === "/") return "inicio"
  return (
    site.categorias.find((c) => caminho === `/${c.handle}` || caminho.startsWith(`/${c.handle}/`))
      ?.handle ?? null
  )
}

/**
 * A BARRA DE BAIXO DO CELULAR (entrega 0253) — no lugar do menu hambúrguer.
 *
 * Início, as três categorias e a sacola, a um toque e onde o dedão alcança.
 * O dono escolheu a opção A do canvas "Barra de baixo no celular" (03/10): o
 * cliente chega pensando "quero algo pra barba", não "quero ver produtos", e
 * com três categorias cabe tudo na barra. A busca e a conta ficam no topo.
 *
 * Só no celular (até 720 px, onde a faixa de categorias do cabeçalho some), e
 * fixa em toda página — na PDP a barra de comprar fica em cima dela (0254). O desenho
 * está em `src/estilos/barra-de-baixo.css`; no checkout e no obrigado ela não
 * existe.
 *
 * A ABA ACESA vem do endereço, que chega por um pedaço à parte (`Endereco`,
 * abaixo) e só depois de o React assumir: o HTML sai com a barra apagada, e a
 * aba acende na hidratação. É de propósito. O `usePathname` só vive dentro de
 * um `<Suspense>` (fora dele o Next 16 derruba as páginas dinâmicas — ver o
 * vigia do pedido), e com a barra INTEIRA dentro dele a página não fica
 * pronta no build: o HTML levava a barra duas vezes, a de espera e a de
 * verdade (+0,7 KB comprimido na home, que mora na beira do degrau do LCP —
 * ver o AGENTS).
 */
export function BarraDeBaixo() {
  const [caminho, setCaminho] = useState<string | null>(null)
  const aba = abaDo(caminho)
  // No pé da tela: a faixa de cookies, o balão do pedido e os avisos sobem pra
  // cima dela. No computador ela não aparece, e a medida é zero.
  const barra = useRef<HTMLElement>(null)
  usePeDaTela(barra, true)

  return (
    <>
      {/* O vão no fim da página, da altura do que está preso no pé (ela, ou ela e
          a barra de comprar da PDP): sem ele, o fim do rodapé ficaria pra sempre
          embaixo delas. */}
      <div className="barra-baixo__vao" aria-hidden="true" />
      <Suspense fallback={null}>
        <Endereco aoMudar={setCaminho} />
      </Suspense>
      <nav ref={barra} className="barra-baixo" aria-label="Navegação da loja">
        <Link
          className="barra-baixo__aba"
          href="/"
          aria-current={aba === "inicio" ? "page" : undefined}
        >
          <Casa />
          Início
        </Link>
        {site.categorias.map((c) => {
          const Icone = ICONE_DA_CATEGORIA[c.handle]
          return (
            <Link
              key={c.handle}
              className="barra-baixo__aba"
              href={`/${c.handle}`}
              aria-current={aba === c.handle ? "page" : undefined}
            >
              <Icone />
              {c.nome}
            </Link>
          )
        })}
        <SacolaDaBarra />
      </nav>
    </>
  )
}

/** Só o endereço, sem desenho: é a única parte da barra que espera. */
function Endereco({ aoMudar }: { aoMudar: (caminho: string) => void }) {
  const caminho = usePathname()
  useEffect(() => aoMudar(caminho), [caminho, aoMudar])
  return null
}

/**
 * A sacola da barra: abre a gaveta, como a do cabeçalho do computador
 * (`sacola/botao.tsx`), com o mesmo nome pra quem lê a tela. O número só
 * aparece com item: um "0" amarelo no pé de toda página seria ruído.
 */
function SacolaDaBarra() {
  const sacola = useSacola()

  // Sem provedor (página fora do layout, teste), vira link, como no cabeçalho.
  if (!sacola) {
    return (
      <Link className="barra-baixo__aba" href={EM_BREVE}>
        <Sacola />
        Sacola
      </Link>
    )
  }

  const { carrinho, leitura, abrir, aberta } = sacola
  // Antes da primeira resposta do servidor o número seria o zero de partida.
  const sabe = leitura === "feita"

  return (
    <button
      type="button"
      className="barra-baixo__aba"
      onClick={abrir}
      aria-haspopup="dialog"
      aria-expanded={aberta}
      aria-controls="carrinho-gaveta"
      aria-label={nomeDaSacola(sabe, carrinho.unidades)}
    >
      <span className="barra-baixo__icone">
        <Sacola />
        {/* `aria-hidden`: o `aria-label` do botão já diz o número por extenso. */}
        {sabe && carrinho.unidades > 0 ? (
          <span className="barra-baixo__contador" aria-hidden="true">
            {carrinho.unidades}
          </span>
        ) : null}
      </span>
      Sacola
    </button>
  )
}
