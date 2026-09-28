import { NextResponse, type NextRequest } from "next/server"
import { medusa } from "@/lib/conta"
import { COOKIE_CLIENTE, COOKIE_DO_POPUP, podeMostrarPelaMarca } from "@/lib/primeira-compra"
import { COOKIE_SESSAO } from "@/lib/sessao"

/**
 * /api/primeira-compra — se o pop-up da 1ª compra aparece pra este
 * navegador, e o que ele escreve (`lib/primeira-compra.ts`).
 *
 * Quem pergunta é o vigia do pop-up, só na hora de abrir (depois dos 20
 * segundos ou da rolagem): a página não espera por isso. Daqui ele sabe o que
 * o navegador não lê — o cookie da conta é só do servidor — e o que o painel
 * decidiu: o fluxo Boas-vindas ligado, o % e os dias do cupom.
 */

const NAO = NextResponse.json({ mostrar: false }, { headers: { "cache-control": "no-store" } })

export async function GET(req: NextRequest) {
  const c = req.cookies
  if (
    c.get(COOKIE_SESSAO)?.value ||
    c.get(COOKIE_CLIENTE)?.value ||
    !podeMostrarPelaMarca(c.get(COOKIE_DO_POPUP)?.value)
  )
    return NAO
  const r = await medusa("/store/crm/primeira-compra", { metodo: "GET" })
  const config = r.corpo as { ligado?: boolean; porcento?: number; dias?: number }
  if (r.status !== 200 || config.ligado !== true) return NAO
  return NextResponse.json(
    { mostrar: true, porcento: Number(config.porcento) || 10, dias: Number(config.dias) || 3 },
    { headers: { "cache-control": "no-store" } }
  )
}
