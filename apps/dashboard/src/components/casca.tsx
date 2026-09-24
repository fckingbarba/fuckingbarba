"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useRef, useState, type ReactNode } from "react"
import { Icone, Logo } from "@/components/icones"
import { sair } from "@/lib/acoes/sair"
import {
  ABAS_DO_CELULAR,
  areaDoCaminho,
  iniciais,
  itemDa,
  MENU,
  NOME_DO_PAPEL,
  TITULO_CURTO,
  type Area,
  type Membro,
} from "@/lib/equipe"

/**
 * A CASCA DO PAINEL — a do protótipo: menu lateral preto no computador; no
 * celular, a barra de cima, as abas de baixo e o "Mais" (a folha com o
 * menu inteiro).
 *
 * O menu mostra só as áreas que o Medusa disse que o papel abre (`areas`,
 * de `GET /dashboard/eu`). Esconder não é a permissão — quem barra é cada
 * rota do Medusa —, é só não oferecer a porta que não abre.
 */
export function Casca({
  membro,
  areas,
  children,
}: {
  membro: Membro
  areas: Area[]
  children: ReactNode
}) {
  const caminho = usePathname()
  const atual = areaDoCaminho(caminho)
  const [maisAberto, setMaisAberto] = useState(false)
  const pode = (area: Area) => areas.includes(area)

  return (
    <>
      <a className="pular" href="#miolo">
        Pular pro conteúdo
      </a>
      <div className="app">
        <aside className="lateral" aria-label="Menu do painel">
          <Link className="lateral__marca" href="/">
            <Logo />
            <span className="lateral__nome">
              FuckingBarba <small>Painel da loja</small>
            </span>
          </Link>
          <Nav atual={atual} pode={pode} />
          <Quem membro={membro} />
        </aside>

        <header className="topo-cel">
          <Link className="topo-cel__logo" href="/" aria-label="Início">
            <Logo />
          </Link>
          <p className="topo-cel__titulo">{TITULO_CURTO[atual]}</p>
          <button
            type="button"
            className="avatar"
            aria-label="Menu e conta"
            aria-expanded={maisAberto}
            onClick={() => setMaisAberto(true)}
          >
            {iniciais(membro.nome)}
          </button>
        </header>

        <main className="miolo" id="miolo">
          <div className="miolo__wrap">{children}</div>
        </main>

        <nav className="abas-cel" aria-label="Atalhos">
          {ABAS_DO_CELULAR[membro.papel].filter(pode).map((area) => {
            const item = itemDa(area)
            if (!item) return null
            return (
              <Link key={area} href={item.href} aria-current={atual === area ? "page" : undefined}>
                <Icone nome={item.icone} />
                {TITULO_CURTO[area]}
              </Link>
            )
          })}
          <button type="button" aria-expanded={maisAberto} onClick={() => setMaisAberto(true)}>
            <Icone nome="menu" />
            Mais
          </button>
        </nav>
      </div>

      {maisAberto ? (
        <FolhaMais membro={membro} atual={atual} pode={pode} fechar={() => setMaisAberto(false)} />
      ) : null}
    </>
  )
}

function Nav({
  atual,
  pode,
  aoIr,
}: {
  atual: Area
  pode: (area: Area) => boolean
  aoIr?: () => void
}) {
  return (
    <nav className="nav">
      {MENU.map((grupo, g) => {
        const itens = grupo.itens.filter((i) => pode(i.area))
        if (!itens.length) return null
        return (
          <div key={g}>
            {grupo.grupo ? <p className="nav__grupo">{grupo.grupo}</p> : null}
            <ul>
              {itens.map((i) => (
                <li key={i.area}>
                  <Link
                    href={i.href}
                    aria-current={atual === i.area ? "page" : undefined}
                    onClick={aoIr}
                  >
                    <Icone nome={i.icone} />
                    <span>{i.nome}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </nav>
  )
}

function Quem({ membro }: { membro: Membro }) {
  return (
    <div className="quem">
      <span className="avatar" aria-hidden="true">
        {iniciais(membro.nome)}
      </span>
      <span style={{ minWidth: 0 }}>
        <p className="quem__nome">{membro.nome}</p>
        <p className="quem__papel">{NOME_DO_PAPEL[membro.papel]}</p>
      </span>
      <form action={sair}>
        <button
          type="submit"
          className="quem__sair"
          aria-label="Sair do painel"
          title="Sair do painel"
        >
          <Icone nome="sair" />
        </button>
      </form>
    </div>
  )
}

/**
 * O "MAIS" DO CELULAR — o menu inteiro, por cima de tudo. Fecha no ✕, no
 * Esc, e sozinho quando a pessoa escolhe pra onde ir. Enquanto aberto, o
 * foco fica dentro dele (é um diálogo), e volta pra onde estava ao fechar.
 */
function FolhaMais({
  membro,
  atual,
  pode,
  fechar,
}: {
  membro: Membro
  atual: Area
  pode: (area: Area) => boolean
  fechar: () => void
}) {
  const folha = useRef<HTMLDivElement>(null)
  const botaoFechar = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const antes = document.activeElement as HTMLElement | null
    botaoFechar.current?.focus()
    document.body.style.overflow = "hidden"

    function tecla(ev: KeyboardEvent) {
      if (ev.key === "Escape") fechar()
      if (ev.key !== "Tab" || !folha.current) return
      const focaveis = folha.current.querySelectorAll<HTMLElement>(
        "a[href], button:not([disabled])"
      )
      if (!focaveis.length) return
      const primeiro = focaveis[0]
      const ultimo = focaveis[focaveis.length - 1]
      if (ev.shiftKey && document.activeElement === primeiro) {
        ev.preventDefault()
        ultimo.focus()
      } else if (!ev.shiftKey && document.activeElement === ultimo) {
        ev.preventDefault()
        primeiro.focus()
      }
    }
    document.addEventListener("keydown", tecla)
    return () => {
      document.removeEventListener("keydown", tecla)
      document.body.style.overflow = ""
      antes?.focus()
    }
  }, [fechar])

  return (
    <div className="folha" role="dialog" aria-modal="true" aria-label="Menu" ref={folha}>
      <div className="folha__topo">
        <span className="lateral__nome">
          FuckingBarba <small>Painel da loja</small>
        </span>
        <button
          type="button"
          className="folha__fechar"
          aria-label="Fechar menu"
          onClick={fechar}
          ref={botaoFechar}
        >
          <Icone nome="fechar" />
        </button>
      </div>
      <Nav atual={atual} pode={pode} aoIr={fechar} />
      <Quem membro={membro} />
    </div>
  )
}
