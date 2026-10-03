"use client"

import Form from "next/form"
import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { Conta, Lupa } from "@/components/icones"
import { LogoCurta } from "@/components/marca"
import { BotaoDaSacola } from "@/components/sacola/botao"
import { navegacao, site } from "@/lib/site"

/**
 * Cabeçalho preto fixo: busca, logo, conta e sacola.
 *
 * SEM MENU HAMBÚRGUER desde a entrega 0253. No celular as categorias e a
 * sacola moram na barra de baixo (`barra-de-baixo.tsx`), a um toque; no
 * computador as categorias já estavam à vista na faixa daqui, e o menu
 * lateral só repetia o que está na tela. Por isso a sacola deste cabeçalho
 * some até 720 px (`cabecalho.css`): a da barra é a mesma.
 *
 * É componente de cliente porque duas coisas aqui só existem no navegador: a
 * busca que aparece e a sombra que surge quando a página sai do topo.
 */
export function Cabecalho() {
  const [buscaAberta, setBuscaAberta] = useState(false)
  const [rolado, setRolado] = useState(false)

  const buscaRef = useRef<HTMLInputElement>(null)
  const sentinelaRef = useRef<HTMLDivElement>(null)

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
              className="cabecalho__icone"
              onClick={() => setBuscaAberta((aberta) => !aberta)}
              aria-expanded={buscaAberta}
              aria-controls="busca"
              aria-label="Buscar produtos"
            >
              <Lupa />
            </button>
          </div>

          {/* Só a marca. O nome sai do `aria-label` pra quem lê a tela — o
              texto na barra era a muleta de quando não existia logo. */}
          <Link className="cabecalho__logo" href="/" aria-label={`${site.nome} — página inicial`}>
            <LogoCurta aria-hidden="true" />
          </Link>

          <div className="cabecalho__grupo cabecalho__grupo--dir">
            <Link className="cabecalho__icone" href="/conta" aria-label="Minha conta">
              <Conta />
            </Link>
            <span className="cabecalho__sacola">
              <BotaoDaSacola />
            </span>
          </div>
        </div>

        <div className="cabecalho__busca" id="busca" hidden={!buscaAberta}>
          {/* `next/form`: um GET pro `/busca?q=…` que funciona sem JavaScript,
              e com ele troca de página sem recarregar a loja. O painel fecha
              ao buscar — o cabeçalho continua montado entre as páginas, e sem
              isto ele ficaria aberto por cima dos resultados. */}
          <Form role="search" action="/busca" onSubmit={() => setBuscaAberta(false)}>
            <input
              ref={buscaRef}
              type="search"
              name="q"
              placeholder="O que você procura?"
              aria-label="Buscar produtos"
              enterKeyHint="search"
            />
            <button type="submit" className="btn">
              Buscar
            </button>
          </Form>
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
    </>
  )
}
