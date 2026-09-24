import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { FormCodigo } from "@/components/entrar/formularios"
import { MolduraDeEntrar } from "@/components/entrar/moldura"
import { lerEntrando, segundosParaReenviar } from "@/lib/entrando"
import { SEGUNDOS_ENTRE_ENVIOS } from "@/lib/entrar-visivel"

/**
 * /entrar/codigo — os seis dígitos.
 *
 * O e-mail aparece INTEIRO, com "trocar" do lado: o erro mais comum é o
 * e-mail digitado errado, e é lendo ele inteiro que a pessoa percebe. E a
 * frase é "se for da equipe": o painel não conta quem é da equipe pra quem
 * digitar um e-mail qualquer (o Medusa responde igual pros dois).
 *
 * Sem o cookie de quem está entrando (abriu o endereço direto, ou passaram
 * os 15 minutos), volta pro e-mail.
 */
export const metadata: Metadata = { title: "Confere seu e-mail" }

export default async function Pagina() {
  const entrando = await lerEntrando()
  if (!entrando) redirect("/entrar")

  return (
    <MolduraDeEntrar>
      <h1>Confere seu e-mail</h1>
      <FormCodigo
        email={entrando.email}
        faltam={segundosParaReenviar(entrando, SEGUNDOS_ENTRE_ENVIOS)}
      />
    </MolduraDeEntrar>
  )
}
