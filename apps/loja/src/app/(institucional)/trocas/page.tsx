import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Trocas e devoluções",
  description: "Como trocar ou devolver um produto FuckingBarba.",
  alternates: { canonical: "/trocas" },
}

/** TEXTO PROVISÓRIO — regra real (prazo de 7 dias do CDC, arrependimento, defeito) antes da virada. */
export default function Trocas() {
  return (
    <>
      <h1 className="titulo-marca text-4xl text-tinta sm:text-5xl">Trocas e devoluções</h1>
      <p className="mt-6 text-lg text-tinta">
        Você tem 7 dias corridos a partir do recebimento pra desistir da compra, como manda o Código
        de Defesa do Consumidor. Produto com defeito a gente troca sem custo.
      </p>
      <p className="mt-4 inline-block border-2 border-dashed border-tinta/40 px-3 py-2 text-xs font-bold uppercase tracking-wide text-tinta">
        Passo a passo e prazos completos em redação
      </p>
    </>
  )
}
