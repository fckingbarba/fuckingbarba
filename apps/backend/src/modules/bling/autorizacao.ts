import type { Credenciais, Renovacao, ResultadoDaAutorizacao } from "../../lib/erp/contrato"
import { motivoDoErro, urlDaApi } from "./api"

/**
 * A AUTORIZAÇÃO DO BLING — OAuth 2.0, código de autorização.
 *
 * O app é PRIVADO, da própria conta (Central de Extensões → Área do
 * Integrador → Criar aplicativo): não passa pela homologação do Bling, que é
 * pra app público. No cadastro dele vão:
 *   - a URL de redirecionamento: `https://<api>/hooks/erp/bling/autorizado`
 *     (o Bling ignora `redirect_uri` na chamada — vale a do cadastro);
 *   - os escopos: produtos, estoques, contatos, pedidos de venda, notas
 *     fiscais, formas de pagamento e situações. MUDAR ESCOPO DEPOIS REVOGA
 *     todo mundo, e aí é conectar de novo.
 *   - o webhook (opcional): `https://<api>/hooks/erp/bling`, com estoque e
 *     nota fiscal.
 * O client id e o client secret vão no Railway (BLING_CLIENT_ID e
 * BLING_CLIENT_SECRET). Nunca em código, nunca colados em conversa.
 *
 * O TOKEN: vale ~6 horas (o `expires_in` que vier). O de renovação, 30 dias —
 * e cada renovação devolve um novo, que é o que se guarda. Se ninguém usar a
 * integração por 30 dias, ele vence e é preciso conectar de novo (o job de
 * estoque roda a cada 5 minutos, então isso não acontece com a loja ligada).
 *
 * `BLING_AUTORIZACAO_URL` existe pro conferidor (a tela de autorização do
 * Bling falso); em produção, não existe.
 */

export const configurado = () =>
  Boolean(process.env.BLING_CLIENT_ID && process.env.BLING_CLIENT_SECRET)

export function urlDeAutorizacao(estado: string): string {
  const url = new URL(
    process.env.BLING_AUTORIZACAO_URL || "https://www.bling.com.br/Api/v3/oauth/authorize"
  )
  url.searchParams.set("response_type", "code")
  url.searchParams.set("client_id", process.env.BLING_CLIENT_ID ?? "")
  url.searchParams.set("state", estado)
  return url.toString()
}

type Token = { ok: true; credenciais: Credenciais } | { ok: false; status: number; motivo: string }

/** O token, pelo `/oauth/token`: client id e secret SÓ no cabeçalho, como a documentação exige. */
async function pedirToken(corpo: URLSearchParams): Promise<Token> {
  const basico = Buffer.from(
    `${process.env.BLING_CLIENT_ID ?? ""}:${process.env.BLING_CLIENT_SECRET ?? ""}`
  ).toString("base64")
  let resposta: Response
  try {
    resposta = await fetch(`${urlDaApi()}/oauth/token`, {
      method: "POST",
      headers: {
        authorization: `Basic ${basico}`,
        "content-type": "application/x-www-form-urlencoded",
        accept: "1.0",
        "enable-jwt": "1",
      },
      body: corpo,
      signal: AbortSignal.timeout(15_000),
    })
  } catch (e) {
    return {
      ok: false,
      status: 0,
      motivo: `o Bling não atendeu (${e instanceof Error ? e.message : e})`,
    }
  }
  const json = (await resposta.json().catch(() => null)) as Record<string, unknown> | null
  const acesso = json?.access_token
  const renovacao = json?.refresh_token
  if (!resposta.ok || typeof acesso !== "string" || typeof renovacao !== "string") {
    return {
      ok: false,
      status: resposta.status,
      motivo: motivoDoErro(json) ?? `o Bling respondeu ${resposta.status} ao pedido de token`,
    }
  }
  const segundos = Number(json?.expires_in) > 0 ? Number(json?.expires_in) : 21_600
  return {
    ok: true,
    credenciais: {
      acesso,
      renovacao,
      expiraEm: new Date(Date.now() + segundos * 1000).toISOString(),
    },
  }
}

/** O nome da empresa, pra tela do admin. Se não vier, a conexão vale do mesmo jeito. */
async function empresaDoToken(acesso: string): Promise<string | null> {
  try {
    const r = await fetch(`${urlDaApi()}/empresas/me/dados-basicos`, {
      headers: { authorization: `Bearer ${acesso}`, accept: "application/json", "enable-jwt": "1" },
      signal: AbortSignal.timeout(10_000),
    })
    const json = (await r.json().catch(() => null)) as { data?: { nome?: unknown } } | null
    return typeof json?.data?.nome === "string" && json.data.nome.trim()
      ? json.data.nome.trim()
      : null
  } catch {
    return null
  }
}

export async function concluirAutorizacao(codigo: string): Promise<ResultadoDaAutorizacao> {
  const r = await pedirToken(
    new URLSearchParams({ grant_type: "authorization_code", code: codigo })
  )
  if (!r.ok) return { ok: false, motivo: r.motivo }
  return {
    ok: true,
    credenciais: r.credenciais,
    empresa: await empresaDoToken(r.credenciais.acesso),
  }
}

export async function renovar(credenciais: Credenciais): Promise<Renovacao> {
  const r = await pedirToken(
    new URLSearchParams({ grant_type: "refresh_token", refresh_token: credenciais.renovacao })
  )
  if (r.ok) return r
  // 400/401 é o Bling dizendo não ao token de renovação (vencido, revogado,
  // app com escopo trocado): só conectando de novo. O resto passa.
  return { ok: false, motivo: r.motivo, caiu: r.status === 400 || r.status === 401 }
}
