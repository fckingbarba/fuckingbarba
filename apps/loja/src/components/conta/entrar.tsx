"use client"

import { useActionState } from "react"
import { Campo } from "@/components/checkout/campo"
import { Raio } from "@/components/icones"
import { pedirCodigo } from "@/lib/acoes/conta"
import { ENTRAR_INICIAL } from "@/lib/conta-visivel"

/**
 * O FORMULÁRIO DO E-MAIL — um campo e um botão.
 *
 * O campo é o `Campo` do checkout, com a mesma cara e o mesmo jeito de dar
 * erro: a conta preenche os mesmos dados que a compra pede, e campo com cara
 * diferente nos dois lugares faz a pessoa achar que são duas lojas.
 *
 * `para` vai escondido porque é só pra onde voltar depois — a ação confere
 * que é um caminho da conta antes de usar (`destinoSeguro`).
 */
export function FormEntrar({ email, para }: { email: string; para: string }) {
  const [estado, acao, enviando] = useActionState(pedirCodigo, ENTRAR_INICIAL)

  return (
    <form
      action={acao}
      // Um envio por vez: o Enter no campo não passa pelo botão travado.
      onSubmit={(ev) => enviando && ev.preventDefault()}
      noValidate
    >
      <input type="hidden" name="para" value={para} />
      <Campo
        rotulo="E-mail"
        nome="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        placeholder="voce@email.com"
        // `key` com a rodada: depois de um erro o React limpa o formulário, e
        // o campo volta com o que a pessoa tinha digitado.
        key={estado.rodada}
        defaultValue={estado.email || email}
        erro={estado.erro}
        required
      />
      <button type="submit" className="btn btn--bloco" disabled={enviando} aria-busy={enviando}>
        {enviando ? (
          <>
            <span className="giro" aria-hidden="true" /> Enviando…
          </>
        ) : (
          <>
            Receber código <Raio className="btn__bolt" />
          </>
        )}
      </button>
    </form>
  )
}
