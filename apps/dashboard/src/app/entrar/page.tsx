import type { Metadata } from "next"
import { FormEmail } from "@/components/entrar/formularios"
import { MolduraDeEntrar } from "@/components/entrar/moldura"
import { Icone } from "@/components/icones"
import { lerEntrando } from "@/lib/entrando"

/**
 * /entrar — o e-mail. Sem senha: a gente manda um código.
 *
 * `?saiu=` é o recado de quem acabou de sair: `1` (apertou "Sair"),
 * `expirou` (o token venceu) ou `fora` (o dono tirou a pessoa da equipe, ou
 * o convite venceu). Vem do `/sair` e da ação `sair`.
 */
export const metadata: Metadata = { title: "Entrar" }

const RECADOS: Record<string, { texto: string; nivel?: "atencao" }> = {
  "1": { texto: "Você saiu do painel." },
  expirou: { texto: "Sua sessão venceu. Entra de novo com o código.", nivel: "atencao" },
  fora: {
    texto: "Seu acesso ao painel foi encerrado. Se foi engano, fale com o dono da loja.",
    nivel: "atencao",
  },
}

export default async function Pagina({
  searchParams,
}: {
  searchParams: Promise<{ saiu?: string }>
}) {
  const { saiu } = await searchParams
  const recado = saiu ? RECADOS[saiu] : undefined
  const entrando = await lerEntrando()

  return (
    <MolduraDeEntrar>
      {recado ? (
        <p className="entrar__recado" data-nivel={recado.nivel} role="status">
          <Icone nome={recado.nivel ? "alerta" : "check"} />
          <span>{recado.texto}</span>
        </p>
      ) : null}
      <h1>Entrar no painel</h1>
      <p className="entrar__txt">
        Use o e-mail em que o dono te convidou. A gente manda um código de 6 dígitos — sem senha.
      </p>
      <FormEmail email={entrando?.email ?? ""} />
      <p className="entrar__nota">
        Não recebeu acesso? Quem convida é o dono, em Configurações → Equipe e acessos.
      </p>
    </MolduraDeEntrar>
  )
}
