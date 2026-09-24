import type { ImagemDoFundo, MedidaDoFundo, VideoDaPdp } from "@/lib/produtos"

/**
 * O FORMULÁRIO DE UMA SEÇÃO — os campos, e a ida e a volta entre o que o
 * Medusa guarda e o que a tela edita. O mesmo pra página do produto
 * (`lib/produtos.ts`) e pra home (`lib/home.ts`): cada seção diz os campos
 * dela, e a gaveta (`components/formulario.tsx`) desenha.
 */

export type Campo =
  | { tipo: "texto"; c: string; rot: string; ajuda?: string; meia?: boolean; exemplo?: string }
  | { tipo: "area"; c: string; rot: string; ajuda?: string; linhas?: number }
  /** Lista de textos, uma linha cada (`string[]`). `max`: quantas cabem. */
  | {
      tipo: "lista"
      c: string
      rot: string
      item: string
      ajuda?: string
      grande?: boolean
      max?: number
    }
  /** A resposta das dúvidas: parágrafos (`string[]`) numa caixa só, separados por linha em branco. */
  | { tipo: "paragrafos"; c: string; rot: string; ajuda?: string }
  /**
   * Lista de itens com vários campos (as etapas, as perguntas…). `max`:
   * quantos cabem; `minimo`: quantos inteiros a seção pede (1, se não
   * disser; 0, o grupo pode ficar vazio).
   */
  | {
      tipo: "grupo"
      c: string
      rot: string
      item: string
      rotItem: string
      campos: Campo[]
      max?: number
      minimo?: number
    }
  /** Uma foto que sobe pelo painel (a de um caso de antes e depois): o endereço dela. */
  | { tipo: "foto"; c: string; rot: string; meia?: boolean }
  /** Um vídeo que sobe direto pro Medusa (o do modo de uso): `VideoDaPdp`, ou nada. */
  | { tipo: "video"; c: string; rot: string; ajuda?: string }
  /**
   * Um produto do catálogo, pelo endereço (handle). `comEste`: oferece o
   * próprio produto; `vazio`: o nome da opção sem produto, quando ela vale
   * (a foto que pode não existir).
   */
  | {
      tipo: "produto"
      c: string
      rot: string
      ajuda?: string
      comEste?: boolean
      meia?: boolean
      vazio?: string
    }
  /** Caixinha; `unico`: num grupo, marcar uma desmarca as outras (o marco da linha do tempo). */
  | { tipo: "marcar"; c: string; rot: string; unico?: boolean }
  /**
   * Uma imagem em duas versões, a do computador e a do celular (a arte de um
   * slide do banner, a foto da última chamada). Grava os endereços em `c` e
   * em `c` + "Celular"; `medida` é o quadro de cada lado, como a loja mostra.
   */
  | {
      tipo: "imagens"
      c: string
      rot: string
      medida: MedidaDoFundo
      ajuda?: string
      rodape?: string
    }
  /** Uma escolha entre poucas, `[valor, rótulo]` (de quanto em quanto tempo o banner passa). */
  | {
      tipo: "opcoes"
      c: string
      rot: string
      opcoes: readonly (readonly [string, string])[]
      ajuda?: string
      meia?: boolean
    }
  | { tipo: "nota"; texto: string; atencao?: boolean }

/** Uma linha em branco separa os parágrafos. */
export const paragrafos = (texto: string): string[] =>
  texto
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)

/**
 * O que falta, com os nomes da tela: o backend devolve as chaves dos campos
 * ("titulo", "passos.1.texto"), e aqui elas viram "Título" e "Etapa 2:
 * Texto".
 */
export function oQueFalta(campos: Campo[], chave: string): string {
  const [c, indice, sub] = chave.split(".")
  const campo = campos.find((x) => "c" in x && x.c === c)
  if (!campo || !("rot" in campo)) return chave
  if (campo.tipo === "grupo") {
    if (indice === undefined) return `${campo.rot} (pelo menos ${campo.minimo ?? 1})`
    const subcampo = campo.campos.find((x) => "c" in x && x.c === sub)
    if (sub === "autorizou") return `${campo.item} ${Number(indice) + 1}: a autorização por escrito`
    const rotulo = subcampo && "rot" in subcampo ? subcampo.rot : sub
    return `${campo.item} ${Number(indice) + 1}: ${rotulo}`
  }
  return campo.rot.replace(/ \(opcional\)$/, "")
}

/* ── os valores ──────────────────────────────────────────────────────── */

/**
 * Os valores como o formulário usa. Igual ao gravado, com duas diferenças:
 * a resposta das dúvidas é um texto só (parágrafos separados por linha em
 * branco), e todo item de grupo leva uma chave `__id` — é por ela que a
 * tela acompanha o item quando ele sobe ou desce. Nada que começa com `__`
 * vai pro backend.
 */
export type Valores = Record<string, unknown>

let proximo = 0
export const novoId = () => `i${++proximo}`

export function paraOFormulario(campos: Campo[], gravado: Valores | null): Valores {
  const v: Valores = {}
  for (const campo of campos) {
    if (!("c" in campo)) continue
    const bruto = gravado?.[campo.c]
    if (campo.tipo === "lista")
      v[campo.c] = Array.isArray(bruto) ? bruto.map((x) => (typeof x === "string" ? x : "")) : [""]
    else if (campo.tipo === "paragrafos")
      v[campo.c] = Array.isArray(bruto)
        ? bruto.join("\n\n")
        : typeof bruto === "string"
          ? bruto
          : ""
    else if (campo.tipo === "grupo")
      v[campo.c] = (Array.isArray(bruto) ? bruto : []).map((item) => ({
        ...paraOFormulario(campo.campos, item && typeof item === "object" ? (item as Valores) : {}),
        __id: novoId(),
      }))
    else if (campo.tipo === "marcar") v[campo.c] = bruto === true
    else if (campo.tipo === "video")
      v[campo.c] = bruto && typeof bruto === "object" ? (bruto as VideoDaPdp) : null
    else if (campo.tipo === "imagens") {
      const celular = gravado?.[`${campo.c}Celular`]
      v[campo.c] = {
        computador: typeof bruto === "string" && bruto ? { url: bruto } : null,
        celular: typeof celular === "string" && celular ? { url: celular } : null,
      } satisfies ImagensDoCampo
    } else if (campo.tipo === "opcoes")
      v[campo.c] = typeof bruto === "number" || typeof bruto === "string" ? String(bruto) : ""
    else v[campo.c] = typeof bruto === "string" ? bruto : ""
  }
  return v
}

/** O valor de um campo de imagens no formulário: cada lado com a medida, quando se sabe. */
export type ImagensDoCampo = { computador: ImagemDoFundo | null; celular: ImagemDoFundo | null }

/** O que vai pro backend: sem as chaves da tela, e a resposta de volta em parágrafos. */
export function paraGravar(campos: Campo[], formulario: Valores): Valores {
  const v: Valores = {}
  for (const campo of campos) {
    if (!("c" in campo)) continue
    const valor = formulario[campo.c]
    if (campo.tipo === "paragrafos") v[campo.c] = paragrafos(typeof valor === "string" ? valor : "")
    else if (campo.tipo === "grupo")
      v[campo.c] = (Array.isArray(valor) ? valor : []).map((item) =>
        paraGravar(campo.campos, item as Valores)
      )
    else if (campo.tipo === "marcar") {
      if (valor === true) v[campo.c] = true
    } else if (campo.tipo === "video") {
      if (valor) v[campo.c] = valor
    } else if (campo.tipo === "imagens") {
      // Sem a do computador não há imagem: a do celular é extra dela.
      const { computador, celular } = (valor ?? {}) as Partial<ImagensDoCampo>
      if (computador) {
        v[campo.c] = computador.url
        if (celular) v[`${campo.c}Celular`] = celular.url
      }
    } else v[campo.c] = valor
  }
  return v
}

/** Um item novo de grupo, vazio. */
export const itemVazio = (campos: Campo[]): Valores => ({
  ...paraOFormulario(campos, null),
  __id: novoId(),
})

/* ── andar lá dentro ──────────────────────────────────────────────────── */

export type Caminho = (string | number)[]

export const chaveDe = (caminho: Caminho) => caminho.join(".")

export function ler(raiz: unknown, caminho: Caminho): unknown {
  return caminho.reduce<unknown>(
    (v, k) => (v && typeof v === "object" ? (v as Record<string, unknown>)[k] : undefined),
    raiz
  )
}

/** Troca um valor lá dentro, sem mexer no objeto de antes (o React compara por referência). */
export function gravar<T>(raiz: T, caminho: Caminho, valor: unknown): T {
  if (!caminho.length) return valor as T
  const [k, ...resto] = caminho
  if (Array.isArray(raiz)) {
    const copia = [...raiz]
    copia[k as number] = gravar(copia[k as number], resto, valor)
    return copia as T
  }
  const o = (raiz ?? {}) as Record<string, unknown>
  return { ...o, [k]: gravar(o[k as string], resto, valor) } as T
}

/**
 * Os valores do formulário, pra abrir a gaveta. Grupo vazio já abre com um
 * item (é por onde se começa) — a não ser que ele possa ficar vazio; com
 * mais de dois, só o primeiro fica aberto — cabe na tela do celular.
 */
export function abrirFormulario(campos: Campo[], gravado: Valores | null): Valores {
  const v = paraOFormulario(campos, gravado)
  for (const c of campos) {
    if (c.tipo !== "grupo") continue
    const itens = v[c.c] as Valores[]
    v[c.c] = itens.length
      ? itens.map((item, i) => ({ ...item, __aberto: itens.length <= 2 || i === 0 }))
      : c.minimo === 0
        ? []
        : [{ ...itemVazio(c.campos), __aberto: true }]
  }
  return v
}

/** O item de grupo que tem campo faltando abre, pra ele aparecer marcado. */
export function abrirOsQueFaltam(campos: Campo[], v: Valores, falta: string[]): Valores {
  let novo = v
  for (const c of campos) {
    if (c.tipo !== "grupo") continue
    const itens = (novo[c.c] as Valores[]) ?? []
    novo = gravar(
      novo,
      [c.c],
      itens.map((item, i) =>
        falta.some((f) => f.startsWith(`${c.c}.${i}.`)) ? { ...item, __aberto: true } : item
      )
    )
  }
  return novo
}
