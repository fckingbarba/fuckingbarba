import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { Suspense } from "react"
import { FormCodigo } from "@/components/conta/codigo"
import { Envelope } from "@/components/icones"
import { lerEntrando, segundosParaReenviar } from "@/lib/conta"
import { SEGUNDOS_ENTRE_ENVIOS } from "@/lib/conta-visivel"

/**
 * /conta/entrar/codigo — os seis dígitos.
 *
 * O e-mail vem INTEIRO, com "trocar" do lado: o erro mais comum aqui é o
 * e-mail digitado errado ("gmial.com"), e é lendo ele inteiro que a pessoa
 * percebe. Mascarar esconderia justamente o erro.
 *
 * Sem o cookie de quem está entrando (abriu o endereço direto, ou passaram
 * os 15 minutos), não há pra quem conferir código: volta pro e-mail.
 */
export const metadata: Metadata = {
  title: "Confere seu e-mail",
}

export default function Pagina() {
  return (
    <section className="entrar" aria-labelledby="t-codigo">
      <div className="bloco">
        <span className="entrar__ico" aria-hidden="true">
          <Envelope />
        </span>
        <h1 id="t-codigo">Confere seu e-mail</h1>
        <Suspense fallback={<p className="entrar__txt">Mandamos um código de 6 dígitos.</p>}>
          <Miolo />
        </Suspense>
      </div>
    </section>
  )
}

async function Miolo() {
  const entrando = await lerEntrando()
  if (!entrando) redirect("/conta/entrar")

  return (
    <FormCodigo
      email={entrando.email}
      faltam={segundosParaReenviar(entrando, SEGUNDOS_ENTRE_ENVIOS)}
    />
  )
}
