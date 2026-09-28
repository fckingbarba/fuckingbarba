import { NextResponse } from "next/server"
import { COOKIE_CONTA_ABERTA, OPCOES_DA_CONTA_ABERTA } from "@/lib/reposicao"
import { lerReposicaoDaConta } from "@/lib/reposicao-da-conta"

/**
 * /api/reposicao — o aviso da reposição pra home (`lib/reposicao.ts`). Quem
 * pergunta é o componente da home, e só quando o navegador tem o `fb_conta`:
 * daqui ele sabe o que o navegador não lê — o cookie da sessão é só do
 * servidor. Sem sessão (ou com a que o Medusa recusou), apaga o `fb_conta`,
 * e o navegador para de perguntar.
 */
export async function GET() {
  const leitura = await lerReposicaoDaConta()
  const resposta = NextResponse.json(
    { reposicao: leitura.estado === "ok" ? leitura.aviso : null },
    { headers: { "cache-control": "no-store" } }
  )
  if (leitura.estado === "sem-sessao")
    resposta.cookies.set(COOKIE_CONTA_ABERTA, "", { ...OPCOES_DA_CONTA_ABERTA, maxAge: 0 })
  return resposta
}
