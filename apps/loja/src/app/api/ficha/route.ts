import { NextResponse } from "next/server"
import { COOKIE_CONTA_ABERTA, OPCOES_DA_CONTA_ABERTA } from "@/lib/ficha"
import { lerFichaDaConta } from "@/lib/ficha-da-conta"

/**
 * /api/ficha — a ficha do site pro navegador (`lib/ficha.ts`): o aviso da
 * reposição da home e a etiqueta da página do produto. Quem pergunta é
 * `components/ficha/usar-ficha.ts`, e só quando o navegador tem o `fb_conta`:
 * daqui ele sabe o que o navegador não lê — o cookie da sessão é só do
 * servidor. Sem sessão (ou com a que o Medusa recusou), apaga o `fb_conta`,
 * e o navegador para de perguntar.
 */
export async function GET() {
  const leitura = await lerFichaDaConta()
  const resposta = NextResponse.json(
    { ficha: leitura.estado === "ok" ? leitura.ficha : null },
    { headers: { "cache-control": "no-store" } }
  )
  if (leitura.estado === "sem-sessao")
    resposta.cookies.set(COOKIE_CONTA_ABERTA, "", { ...OPCOES_DA_CONTA_ABERTA, maxAge: 0 })
  return resposta
}
