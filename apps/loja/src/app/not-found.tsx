import Link from "next/link"
import { Logo } from "@/components/marca/logo"

export default function NaoEncontrada() {
  return (
    <>
      <div className="faixa-perigo h-3 w-full" aria-hidden="true" />
      <header className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6">
        <Logo />
      </header>
      <main
        id="conteudo"
        className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-4 py-16 sm:px-6"
      >
        <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-tinta">Erro 404</p>
        <h1 className="titulo-marca mt-2 text-5xl text-tinta sm:text-7xl">
          Essa página não existe.
        </h1>
        <p className="mt-4 max-w-prose text-lg text-tinta">
          Pode ter sido um link antigo. O que você procura provavelmente está numa dessas:
        </p>
        <ul className="mt-6 flex flex-wrap gap-2">
          {(
            [
              { href: "/", nome: "Início" },
              { href: "/barba", nome: "Barba" },
              { href: "/cabelo", nome: "Cabelo" },
              { href: "/kits", nome: "Kits" },
            ] as const
          ).map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                className="chanfro-sm inline-block border-2 border-tinta bg-papel px-4 py-2 text-sm font-bold text-tinta shadow-dura-sm"
              >
                {l.nome}
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </>
  )
}
