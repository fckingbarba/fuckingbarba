"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { Conta, Fechar, Hamburguer, Lupa, Raio, Sacola } from "@/components/icones"
import { emReais } from "@/lib/formato"
import { EM_BREVE, FRETE_GRATIS_ACIMA_DE, navegacao, site } from "@/lib/site"

/**
 * Cabeçalho preto fixo + menu lateral.
 *
 * É componente de cliente porque três coisas aqui só existem no navegador: o
 * menu que abre, a busca que aparece e a sombra que surge quando a página sai
 * do topo. O desenho todo, inclusive o estado fechado, está em
 * `src/estilos/cabecalho.css` — o HTML que o servidor manda já vem com o menu
 * no lugar certo (fora da tela), então não há pulo quando a página hidrata.
 *
 * Acessibilidade do menu, que é onde isso costuma quebrar:
 * - `inert` enquanto fechado: nem o Tab nem o leitor de tela entram nele;
 * - ao abrir, o foco vai pro botão de fechar; ao fechar, volta pro hambúrguer;
 * - Tab circula preso dentro do menu, senão o foco vaza pra página atrás, que
 *   a pessoa nem está vendo;
 * - Esc fecha, e clicar no véu também.
 */
export function Cabecalho() {
  const [menuAberto, setMenuAberto] = useState(false)
  const [buscaAberta, setBuscaAberta] = useState(false)
  const [rolado, setRolado] = useState(false)

  const abrirRef = useRef<HTMLButtonElement>(null)
  const fecharRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLElement>(null)
  const buscaRef = useRef<HTMLInputElement>(null)
  const sentinelaRef = useRef<HTMLDivElement>(null)
  const montou = useRef(false)

  // A classe mora no <html> porque ela também trava a rolagem da página
  // (`.menu-aberto { overflow: hidden }`), e isso não dá pra fazer de dentro.
  useEffect(() => {
    const raiz = document.documentElement
    raiz.classList.toggle("menu-aberto", menuAberto)
    return () => raiz.classList.remove("menu-aberto")
  }, [menuAberto])

  // Foco entra e volta. O `montou` evita roubar o foco na primeira pintura:
  // sem ele, abrir a página já jogaria o cursor no hambúrguer.
  useEffect(() => {
    if (!montou.current) {
      montou.current = true
      return
    }
    if (menuAberto) fecharRef.current?.focus()
    else abrirRef.current?.focus()
  }, [menuAberto])

  useEffect(() => {
    if (!menuAberto) return
    function aoTeclar(evento: KeyboardEvent) {
      if (evento.key === "Escape") setMenuAberto(false)
    }
    document.addEventListener("keydown", aoTeclar)
    return () => document.removeEventListener("keydown", aoTeclar)
  }, [menuAberto])

  useEffect(() => {
    if (buscaAberta) buscaRef.current?.focus()
  }, [buscaAberta])

  // Sombra quando a página sai do topo. Um alvo invisível de 1px no começo do
  // documento: quando ele sai de vista, rolou. Sem ler scrollY a cada quadro.
  useEffect(() => {
    const alvo = sentinelaRef.current
    if (!alvo || typeof IntersectionObserver === "undefined") return
    const vigia = new IntersectionObserver(([entrada]) => setRolado(!entrada.isIntersecting))
    vigia.observe(alvo)
    return () => vigia.disconnect()
  }, [])

  function prendeTab(evento: React.KeyboardEvent<HTMLElement>) {
    if (evento.key !== "Tab" || !menuRef.current) return
    const focaveis = menuRef.current.querySelectorAll<HTMLElement>(
      "a[href], button:not([disabled])"
    )
    if (!focaveis.length) return
    const primeiro = focaveis[0]
    const ultimo = focaveis[focaveis.length - 1]
    if (evento.shiftKey && document.activeElement === primeiro) {
      evento.preventDefault()
      ultimo.focus()
    } else if (!evento.shiftKey && document.activeElement === ultimo) {
      evento.preventDefault()
      primeiro.focus()
    }
  }

  return (
    <>
      <div
        ref={sentinelaRef}
        aria-hidden="true"
        className="pointer-events-none absolute top-0 left-0 h-px w-px"
      />

      <header className={`cabecalho${rolado ? " e-rolado" : ""}`}>
        <div className="cabecalho__barra">
          <div className="cabecalho__grupo">
            <button
              type="button"
              ref={abrirRef}
              className="cabecalho__icone"
              onClick={() => setMenuAberto(true)}
              aria-expanded={menuAberto}
              aria-controls="menu-lateral"
              aria-label="Abrir menu"
            >
              <Hamburguer />
            </button>
            <button
              type="button"
              className="cabecalho__icone"
              onClick={() => setBuscaAberta((aberta) => !aberta)}
              aria-expanded={buscaAberta}
              aria-controls="busca"
              aria-label="Buscar produtos"
            >
              <Lupa />
            </button>
          </div>

          <Link className="cabecalho__logo" href="/" aria-label={`${site.nome} — página inicial`}>
            <Raio />
            {site.nome}
          </Link>

          <div className="cabecalho__grupo cabecalho__grupo--dir">
            <Link className="cabecalho__icone" href={EM_BREVE} aria-label="Minha conta">
              <Conta />
            </Link>
            {/* Vira o botão que abre a gaveta na fase 4, quando existir carrinho. */}
            <Link className="cabecalho__icone" href={EM_BREVE} aria-label="Carrinho com 0 itens">
              <Sacola />
              <span className="cabecalho__contador" aria-hidden="true">
                0
              </span>
            </Link>
          </div>
        </div>

        <div className="cabecalho__busca" id="busca" hidden={!buscaAberta}>
          {/* A página de resultados entra na fase 3; até lá o caminho é honesto. */}
          <form role="search" action={EM_BREVE}>
            <input
              ref={buscaRef}
              type="search"
              name="q"
              placeholder="O que você procura?"
              aria-label="Buscar produtos"
            />
            <button type="submit" className="btn">
              Buscar
            </button>
          </form>
        </div>

        <nav className="cabecalho__nav" aria-label="Categorias">
          <ul>
            {navegacao.topo.map((item) => (
              <li key={item.href}>
                <Link href={item.href}>{item.texto}</Link>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      {/* Véu: some por `visibility` no CSS, então não recebe clique fechado. */}
      <div className="menu__veu" aria-hidden="true" onClick={() => setMenuAberto(false)} />

      <aside
        ref={menuRef}
        className="menu"
        id="menu-lateral"
        aria-label="Menu principal"
        inert={!menuAberto}
        onKeyDown={prendeTab}
      >
        <div className="menu__topo">
          <p className="menu__titulo">Navegue</p>
          <button
            type="button"
            ref={fecharRef}
            className="cabecalho__icone"
            onClick={() => setMenuAberto(false)}
            aria-label="Fechar menu"
          >
            <Fechar />
          </button>
        </div>

        <nav aria-label="Categorias">
          <ul>
            {navegacao.menu.map((item) => (
              <li key={item.texto}>
                <Link href={item.href} onClick={() => setMenuAberto(false)}>
                  {item.texto}
                  <Raio />
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <p className="menu__rodape">
          <Raio />
          <span>
            Frete grátis acima de{" "}
            <span className="menu__rodape-valor">
              {emReais(FRETE_GRATIS_ACIMA_DE)}
              <span className="menu__rodape-ast">*</span>
            </span>
          </span>
        </p>
      </aside>
    </>
  )
}
