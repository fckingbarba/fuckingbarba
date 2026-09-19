import { clienteLoja, json } from "../_shared/supabase.ts"

/**
 * vitals — recebe LCP, INP, CLS (e TTFB/FCP) reais do navegador e grava em
 * loja.web_vitals. Milhares de chamadas pequenas por dia: não faz sentido
 * passar pelo Medusa.
 *
 * O front (fase 3) manda por `navigator.sendBeacon` a partir de `web-vitals`:
 *   { metrica: "LCP", valor: 1834, avaliacao: "good", pagina: "/produtos/oleo-para-barba",
 *     navegacao: "navigate", dispositivo: "mobile", conexao: "4g", id_navegacao: "v4-…" }
 *
 * Sem autenticação por desenho (é um beacon público), então: só POST, só da
 * origem da loja (SITE_ORIGENS), payload pequeno e validado campo a campo.
 *
 * Variáveis: SITE_ORIGENS — origens permitidas separadas por vírgula,
 *   ex.: https://www.SEUDOMINIO.com.br,https://fuckingbarba.vercel.app
 */

const METRICAS = new Set(["LCP", "INP", "CLS", "TTFB", "FCP"])
const AVALIACOES = new Set(["good", "needs-improvement", "poor"])
const DISPOSITIVOS = new Set(["mobile", "desktop", "tablet"])

function origensPermitidas(): Set<string> {
  return new Set(
    (Deno.env.get("SITE_ORIGENS") ?? "http://localhost:3000")
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean)
  )
}

function cors(origem: string | null): HeadersInit {
  const permitida = origem && origensPermitidas().has(origem) ? origem : ""
  return {
    "access-control-allow-origin": permitida,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    vary: "origin",
  }
}

function texto(v: unknown, max = 200): string | null {
  return typeof v === "string" && v.length > 0 && v.length <= max ? v : null
}

Deno.serve(async (req) => {
  const origem = req.headers.get("origin")
  const cabecalhos = cors(origem)

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cabecalhos })
  if (req.method !== "POST") return json({ erro: "método não permitido" }, 405, cabecalhos)
  if (!origem || !origensPermitidas().has(origem))
    return json({ erro: "origem não permitida" }, 403, cabecalhos)

  const bruto = await req.text()
  if (bruto.length > 2_000) return json({ erro: "payload grande demais" }, 413, cabecalhos)

  let corpo: Record<string, unknown>
  try {
    corpo = JSON.parse(bruto)
  } catch {
    return json({ erro: "JSON inválido" }, 400, cabecalhos)
  }

  const metrica = texto(corpo.metrica, 8)
  const valor = typeof corpo.valor === "number" && Number.isFinite(corpo.valor) ? corpo.valor : null
  const pagina = texto(corpo.pagina, 300)
  if (
    !metrica ||
    !METRICAS.has(metrica) ||
    valor === null ||
    valor < 0 ||
    !pagina?.startsWith("/")
  ) {
    return json({ erro: "campos inválidos" }, 400, cabecalhos)
  }

  const avaliacao = texto(corpo.avaliacao, 20)
  const dispositivo = texto(corpo.dispositivo, 10)

  const { error } = await clienteLoja()
    .from("web_vitals")
    .insert({
      metrica,
      valor,
      pagina: pagina.split("?")[0],
      avaliacao: avaliacao && AVALIACOES.has(avaliacao) ? avaliacao : null,
      dispositivo: dispositivo && DISPOSITIVOS.has(dispositivo) ? dispositivo : null,
      navegacao: texto(corpo.navegacao, 20),
      conexao: texto(corpo.conexao, 10),
      id_navegacao: texto(corpo.id_navegacao, 64),
    })

  if (error) {
    console.error("[vitals] falha ao gravar", error)
    return json({ erro: "falha ao gravar" }, 500, cabecalhos)
  }
  return new Response(null, { status: 204, headers: cabecalhos })
})
