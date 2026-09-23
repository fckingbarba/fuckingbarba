import type { Metadata } from "next"
import { Suspense } from "react"
import { FormularioDeDados } from "@/components/conta/dados"
import { seSessaoAcabou } from "@/components/conta/pedidos"
import { lerCliente } from "@/lib/conta"

/**
 * /conta/dados — nome, celular, CPF ou CNPJ e as preferências.
 *
 * Com eles aqui, o checkout abre com o passo 1 pronto. A compra feita com a
 * conta aberta completa o que estiver vazio (nunca reescreve o que a pessoa
 * pôs aqui — `guardarDaCompra`, em `lib/conta.ts`).
 *
 * O e-mail troca aqui também, com código no endereço novo (o "Trocar" do
 * lado dele). Excluir a conta é o passo seguinte: espera o texto revisado
 * por quem cuida da parte jurídica.
 */
export const metadata: Metadata = {
  title: "Meus dados",
}

export default function Pagina() {
  return (
    <section aria-labelledby="t-dados">
      <div className="cabeca-tela">
        <h1 id="t-dados">Meus dados</h1>
      </div>
      <Suspense fallback={<p className="bloco">Buscando seus dados…</p>}>
        <Formulario />
      </Suspense>
    </section>
  )
}

async function Formulario() {
  const leitura = await lerCliente()
  seSessaoAcabou(leitura.estado)
  if (leitura.estado !== "ok") {
    return (
      <div className="bloco" role="alert">
        Não consegui buscar seus dados agora. Tenta de novo em instantes.
      </div>
    )
  }
  return <FormularioDeDados cliente={leitura.cliente} />
}
