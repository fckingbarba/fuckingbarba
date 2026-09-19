import type { Metadata } from "next"
import { site } from "@/lib/site"

export const metadata: Metadata = {
  title: "Política de privacidade",
  description: `Como a ${site.nome} coleta, usa e protege seus dados.`,
  alternates: { canonical: "/privacidade" },
}

/**
 * TEXTO PROVISÓRIO — escrever a política real antes da virada (fase 6),
 * listando cada tag, o que coleta, por quanto tempo e a base legal (LGPD).
 */
export default function Privacidade() {
  return (
    <>
      <h1 className="titulo-marca text-4xl text-tinta sm:text-5xl">Política de privacidade</h1>
      <p className="mt-6 text-lg text-tinta">
        Coletamos só o que precisamos pra entregar seu pedido e pra melhorar a loja. Cookies de
        medição e de anúncio só rodam se você aceitar na faixa lá embaixo — e você pode mudar de
        ideia quando quiser.
      </p>
      <p className="mt-4 inline-block border-2 border-dashed border-tinta/40 px-3 py-2 text-xs font-bold uppercase tracking-wide text-tinta">
        Texto completo em redação — entra antes da virada
      </p>
    </>
  )
}
