import type { AvisoDaReposicao, FichaDoSite, TratamentoDoSite } from "./ficha"

/**
 * A FORMA DA FICHA DO SITE (`lib/ficha.ts`) — o que veio do Medusa, ou da aba
 * do navegador, conferido parte por parte antes de virar tela: o link do
 * "Refazer" só pro `/voltar/repor-…`, as páginas só com endereço de produto,
 * os números dentro do razoável. O que não tiver a forma certa vira nada.
 *
 * Longe do `lib/ficha.ts` de propósito: só o servidor e quem pergunta
 * (`components/ficha/ler-ficha.ts`, baixado só com a conta aberta) usam.
 */

const VOLTAR = /^\/voltar\/repor-(order|nso)_[0-9A-Z]{26}\.[0-9a-z]{1,10}\.[A-Za-z0-9_-]{22}$/
const PEDIDO = /^(order|nso)_[0-9A-Z]{26}$/
const CHAVE = /^[a-z]{2,12}\.\d{4}-\d{2}-\d{2}$/
const texto = (x: unknown, max: number) =>
  typeof x === "string" && x.trim() && x.length <= max ? x : null

/** O aviso que veio do Medusa (ou da aba), se tiver a forma certa; senão, nenhum. */
export function avisoValido(x: unknown): AvisoDaReposicao | null {
  if (!x || typeof x !== "object") return null
  const a = x as Record<string, unknown>
  const p = (a.produto ?? {}) as Record<string, unknown>
  const titulo = texto(a.titulo, 120)
  const explicacao = texto(a.texto, 300)
  const nome = texto(p.nome, 200)
  const handle = texto(p.handle, 200)
  const foto = texto(p.imagem, 2000)
  const imagem = foto && /^https?:\/\//.test(foto) ? foto : null
  if (!titulo || !explicacao || !nome || !handle) return null
  if (typeof a.dias !== "number" || !Number.isInteger(a.dias) || Math.abs(a.dias) > 60) return null
  if (typeof a.pedido !== "string" || !PEDIDO.test(a.pedido)) return null
  if (typeof a.voltar !== "string" || !VOLTAR.test(a.voltar)) return null
  if (typeof a.chave !== "string" || !CHAVE.test(a.chave)) return null
  return {
    titulo,
    texto: explicacao,
    dias: a.dias,
    pedido: a.pedido,
    produto: { nome, handle, imagem },
    voltar: a.voltar,
    chave: a.chave,
  }
}

const HANDLE = /^[a-z0-9][a-z0-9-]{0,199}$/
const inteiro = (x: unknown, min: number, max: number): x is number =>
  typeof x === "number" && Number.isInteger(x) && x >= min && x <= max
const lista = (x: unknown) =>
  Array.isArray(x)
    ? x.filter((i): i is Record<string, unknown> => !!i && typeof i === "object")
    : []

function tratamentoValido(x: unknown): TratamentoDoSite | null {
  if (!x || typeof x !== "object") return null
  const t = x as Record<string, unknown>
  if (!inteiro(t.dia, 1, 2000) || !inteiro(t.alvo, 1, 2000)) return null
  if (typeof t.handle !== "string" || !HANDLE.test(t.handle)) return null
  const m = (t.marco ?? null) as Record<string, unknown> | null
  const quando = m && texto(m.quando, 60)
  const titulo = m && texto(m.titulo, 120)
  const explicacao = m && texto(m.texto, 400)
  return {
    dia: t.dia,
    alvo: t.alvo,
    marco: quando && titulo && explicacao ? { quando, titulo, texto: explicacao } : null,
    handle: t.handle,
    linhaDoTempo: t.linhaDoTempo === true,
  }
}

/** A ficha que veio do Medusa (ou da aba), com cada parte conferida; sem forma, nenhuma. */
export function fichaValida(x: unknown): FichaDoSite | null {
  if (!x || typeof x !== "object") return null
  const f = x as Record<string, unknown>
  return {
    reposicao: avisoValido(f.reposicao),
    tratamento: tratamentoValido(f.tratamento),
    compras: lista(f.compras)
      .flatMap((c) =>
        typeof c.handle === "string" && HANDLE.test(c.handle) && inteiro(c.dias, 0, 9999)
          ? [{ handle: c.handle, dias: c.dias }]
          : []
      )
      .slice(0, 60),
    combina: lista(f.combina)
      .flatMap((c) => {
        const porque = texto(c.porque, 120)
        return typeof c.handle === "string" && HANDLE.test(c.handle) && porque
          ? [{ handle: c.handle, porque }]
          : []
      })
      .slice(0, 4),
  }
}
