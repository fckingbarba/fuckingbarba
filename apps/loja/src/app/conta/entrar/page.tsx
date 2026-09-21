import type { Metadata } from "next"
import { Suspense } from "react"
import { FormEntrar } from "@/components/conta/entrar"
import { Conta } from "@/components/icones"
import { lerEntrando } from "@/lib/conta"
import { destinoSeguro } from "@/lib/sessao"

/**
 * /conta/entrar — o e-mail.
 *
 * Um campo e um botão. Não existe "criar conta": o primeiro código
 * confirmado cria. Não existe "esqueci a senha": não existe senha.
 *
 * `?para=` é pra onde voltar depois (o proxy manda pra cá quem abriu uma
 * página da conta sem estar logado); `?saiu=1` e `?motivo=expirou` são os
 * recados de quem acabou de sair.
 *
 * A NOTA DE BAIXO VAI MUDAR. O protótipo diz "comprou na loja antiga? seus
 * pedidos de lá já estão aqui" — e vai dizer, quando a importação da
 * Nuvemshop existir (fase 2). Até lá, a frase promete só o que é verdade.
 */
export const metadata: Metadata = {
  title: "Entrar",
}

export default function Pagina({ searchParams }: PageProps<"/conta/entrar">) {
  return (
    <section className="entrar" aria-labelledby="t-entrar">
      <div className="bloco">
        <span className="entrar__ico" aria-hidden="true">
          <Conta />
        </span>
        <h1 id="t-entrar">Minha conta</h1>
        <p className="entrar__txt">
          Entre com seu e-mail. A gente manda um código de acesso — sem senha.
        </p>
        <Suspense fallback={<FormEntrar email="" para="/conta" />}>
          <Formulario searchParams={searchParams} />
        </Suspense>
        <p className="entrar__nota">
          Já comprou aqui? <b>Use o mesmo e-mail da compra</b> — a conta junta os pedidos dele.
        </p>
      </div>
    </section>
  )
}

/**
 * Dentro do `<Suspense>` porque lê a URL e o cookie. Quem voltou pelo
 * "trocar e-mail" encontra o que tinha digitado — o erro mais comum dessa
 * tela é uma letra trocada, e redigitar tudo é o dobro da chance de errar.
 */
async function Formulario({
  searchParams,
}: {
  searchParams: PageProps<"/conta/entrar">["searchParams"]
}) {
  const busca = await searchParams
  const entrando = await lerEntrando()
  const recado =
    busca.saiu === "1"
      ? "Você saiu da conta."
      : busca.motivo === "expirou"
        ? "Sua sessão acabou. Entra de novo pra continuar."
        : ""

  return (
    <>
      {recado ? (
        <p className="entrar__recado" role="status">
          {recado}
        </p>
      ) : null}
      <FormEntrar email={entrando?.email ?? ""} para={destinoSeguro(busca.para)} />
    </>
  )
}
