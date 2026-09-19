import { Logo } from "@/components/marca/logo"

export default function LayoutInstitucional({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="faixa-perigo h-3 w-full" aria-hidden="true" />
      <header className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6">
        <Logo />
      </header>
      <main id="conteudo" className="mx-auto w-full max-w-3xl flex-1 px-4 pb-16 sm:px-6">
        <article>{children}</article>
      </main>
    </>
  )
}
