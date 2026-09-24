"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { medusa, type Resposta } from "@/lib/medusa"
import {
  ehIdDeProduto,
  type Caixa,
  type Fundo,
  type IdDaSecao,
  type ItemDaGaleria,
  type Resultado,
  type UsoDaImagem,
  type Valores,
} from "@/lib/produtos"

/**
 * AS AÇÕES DO PRODUTO — a seção (texto e fundo), ligar/desligar e a ordem,
 * a caixa de compra, subtítulo e categoria, publicar, e a imagem que sobe.
 *
 * Quem decide se pode é o Medusa (`/dashboard/produtos/:id/*`): o papel
 * (dono e marketing editam; a operação vê) e se o que chegou faz sentido. A
 * mudança é gravada sobre o que está no produto AGORA, não sobre a tela —
 * duas pessoas editando seções diferentes não se atropelam.
 *
 * Feito, a página do produto se refaz (`revalidatePath`), e a loja já foi
 * avisada pelo Medusa: muda em segundos.
 */

const GENERICO = "Não consegui falar com a loja agora. Tenta de novo em instantes."
const NAO_ACHEI = "Não achei esse produto. Recarregue a página."
const SEM_PAPEL = "Editar produto é do marketing e do dono."

async function chamar(id: string, acao: string, corpo: unknown): Promise<Resposta | null> {
  if (!ehIdDeProduto(id)) return null
  const r = await medusa(`/dashboard/produtos/${id}/${acao}`, {
    token: "sessao",
    corpo,
    tempoLimite: acao === "imagens" ? 60_000 : 20_000,
  })
  if (r.status === 401)
    redirect(`/sair?motivo=${r.corpo.message === "fora_da_equipe" ? "fora" : "expirou"}`)
  return r
}

/** As respostas que toda ação trata igual. `null`: é com quem chamou. */
function comum(r: Resposta | null): { ok: false; texto: string } | null {
  if (!r || r.status === 404) return { ok: false, texto: NAO_ACHEI }
  if (r.status === 403) return { ok: false, texto: SEM_PAPEL }
  if (r.status === 0)
    return {
      ok: false,
      texto: "A loja não respondeu a tempo. Confira a página daqui a pouco — pode ter salvado.",
    }
  return null
}

const feito = (r: Resposta, texto: string): Resultado => ({
  ok: true,
  texto:
    r.corpo.lojaAvisada === false
      ? `${texto.replace(/ — .*$/, "")}. A loja demorou a confirmar: a página pode levar alguns minutos pra mudar.`
      : texto,
})

function refazer(id: string) {
  revalidatePath(`/produtos/${id}`)
  revalidatePath("/produtos")
}

export async function salvarSecao(
  id: string,
  secao: IdDaSecao,
  valores: Valores,
  fundo: Fundo | null | undefined
): Promise<Resultado> {
  const r = await chamar(id, "secao", {
    secao,
    valores,
    ...(fundo !== undefined ? { fundo } : {}),
  })
  const erro = comum(r)
  if (erro) return erro
  if (r!.status === 422 && Array.isArray(r!.corpo.faltando))
    return {
      ok: false,
      texto: "Falta preencher o que está marcado.",
      faltando: (r!.corpo.faltando as unknown[]).filter((f): f is string => typeof f === "string"),
    }
  if (r!.status === 400 && r!.corpo.message === "fundo_invalido")
    return {
      ok: false,
      texto: "A imagem de fundo não veio do armazenamento da loja. Escolha a foto de novo.",
    }
  if (r!.status === 400 && r!.corpo.message === "imagem_invalida")
    return {
      ok: false,
      texto: "Uma foto ou o vídeo não veio do armazenamento da loja. Escolha de novo.",
    }
  if (r!.status !== 200) return { ok: false, texto: GENERICO }
  refazer(id)
  return feito(r!, "Salvo — a página do produto atualiza em alguns segundos")
}

export type MudancaNaOrdem = "ligar" | "desligar" | "subir" | "descer"

const FEITO_NA_ORDEM: Record<MudancaNaOrdem, string> = {
  ligar: "Seção ligada — aparece no site em alguns segundos",
  desligar: "Seção desligada — sai do site em alguns segundos",
  subir: "Ordem salva — a página atualiza em alguns segundos",
  descer: "Ordem salva — a página atualiza em alguns segundos",
}

export async function mudarSecao(
  id: string,
  secao: IdDaSecao,
  mudanca: MudancaNaOrdem
): Promise<Resultado> {
  const r = await chamar(id, "ordem", { secao, mudanca })
  const erro = comum(r)
  if (erro) return erro
  if (r!.status === 409) {
    refazer(id)
    return {
      ok: false,
      texto: "Não deu: a página mudou desde que você abriu. Ela já mostra como está agora.",
    }
  }
  if (r!.status !== 200) return { ok: false, texto: GENERICO }
  refazer(id)
  return feito(r!, FEITO_NA_ORDEM[mudanca])
}

const RECUSA_DA_CAIXA: Record<string, string> = {
  junto_vazio: "Escolha pelo menos um produto pro leve junto.",
  junto_invalido: "Um dos produtos escolhidos saiu do site. Recarregue a página e escolha de novo.",
  nota_longa: "A linha embaixo de “1 unidade” tem até 48 letras.",
}

export async function salvarCaixa(id: string, caixa: Caixa): Promise<Resultado> {
  const r = await chamar(id, "caixa", caixa)
  const erro = comum(r)
  if (erro) return erro
  if (r!.status === 400)
    return { ok: false, texto: RECUSA_DA_CAIXA[String(r!.corpo.message)] ?? GENERICO }
  if (r!.status !== 200) return { ok: false, texto: GENERICO }
  refazer(id)
  return feito(
    r!,
    caixa.modo === "junto"
      ? "Salvo — a página mostra o leve junto no lugar das unidades"
      : "Salvo — a página mostra os cartões de quantidade"
  )
}

export async function salvarTextos(
  id: string,
  textos: { subtitulo: string; categoriaId: string }
): Promise<Resultado> {
  const r = await chamar(id, "textos", textos)
  const erro = comum(r)
  if (erro) return erro
  if (r!.status === 400)
    return {
      ok: false,
      texto:
        r!.corpo.message === "subtitulo_longo"
          ? "O subtítulo tem até 120 letras."
          : "Essa categoria não existe mais. Recarregue a página.",
    }
  if (r!.status !== 200) return { ok: false, texto: GENERICO }
  refazer(id)
  return feito(r!, "Salvo — a página do produto atualiza em alguns segundos")
}

export async function publicar(id: string): Promise<Resultado> {
  const r = await chamar(id, "publicar", {})
  const erro = comum(r)
  if (erro) return erro
  if (r!.status === 409) {
    refazer(id)
    return {
      ok: false,
      texto:
        r!.corpo.message === "sem_preco"
          ? "Sem preço não dá pra publicar: o preço vem do Bling. Confira o produto lá e traga o catálogo de novo."
          : "Ele já está no site.",
    }
  }
  if (r!.status !== 200) return { ok: false, texto: GENERICO }
  refazer(id)
  return feito(r!, "No site — o produto aparece na loja em alguns segundos")
}

export type ImagemQueSubiu =
  | { ok: true; url: string; largura: number; altura: number; bytes: number }
  | { ok: false; texto: string }

/** O nome de cada uso no backend (`UsoDaImagem`, em `apps/backend/src/lib/imagens.ts`). */
const USO_NO_BACKEND: Record<UsoDaImagem, string> = {
  computador: "fundo-computador",
  celular: "fundo-celular",
  galeria: "galeria",
  poster: "poster",
  caso: "caso",
}

/**
 * Sobe uma imagem — já preparada no navegador (`imagem-no-navegador.ts`) —
 * e devolve o endereço: um lado do fundo, uma foto da galeria, a capa de um
 * vídeo, a foto de um caso. Não grava na página: isso é o "Salvar" da
 * gaveta, ou a galeria.
 */
export async function subirImagem(id: string, dados: FormData): Promise<ImagemQueSubiu> {
  const uso = dados.get("uso")
  const arquivo = dados.get("arquivo")
  if (typeof uso !== "string" || !(uso in USO_NO_BACKEND) || !(arquivo instanceof Blob))
    return { ok: false, texto: "Escolha a foto de novo." }
  const base64 = Buffer.from(await arquivo.arrayBuffer()).toString("base64")
  const r = await chamar(id, "imagens", {
    uso: USO_NO_BACKEND[uso as UsoDaImagem],
    arquivo: base64,
  })
  const erro = comum(r)
  if (erro) return erro
  if (r!.status === 400 && typeof r!.corpo.texto === "string")
    return { ok: false, texto: r!.corpo.texto }
  const c = r!.corpo
  if (r!.status !== 200 || typeof c.url !== "string") return { ok: false, texto: GENERICO }
  return {
    ok: true,
    url: c.url,
    largura: Number(c.largura),
    altura: Number(c.altura),
    bytes: Number(c.bytes),
  }
}

/**
 * O endereço pra o navegador mandar um vídeo DIRETO pro Medusa — com o
 * bilhete, que vale uma vez, por 15 minutos (`apps/backend/src/lib/videos.ts`).
 * O vídeo não passa por aqui: a Vercel não deixa passar pedido maior que
 * 4,5 MB.
 */
export async function pedirEnvioDeVideo(
  id: string,
  video: { tipo: string; tamanho: number }
): Promise<{ ok: true; url: string } | { ok: false; texto: string }> {
  const r = await chamar(id, "videos/envio", video)
  const erro = comum(r)
  if (erro) return erro
  if (r!.status === 400)
    return {
      ok: false,
      texto:
        r!.corpo.message === "grande"
          ? "O vídeo passa de 50 MB. Encurte ou comprima antes."
          : "Use um vídeo MP4, MOV ou WebM.",
    }
  const base = process.env.MEDUSA_BACKEND_URL
  if (r!.status !== 200 || typeof r!.corpo.caminho !== "string" || !base)
    return { ok: false, texto: GENERICO }
  return { ok: true, url: new URL(r!.corpo.caminho, base).toString() }
}

export type PedidoNaGaleria =
  | { acao: "incluir"; item: ItemDaGaleria }
  | { acao: "mover"; url: string; para: "antes" | "depois" }
  | { acao: "tirar"; url: string }

const RECUSA_DA_GALERIA: Record<string, string> = {
  repetido: "Essa já está na galeria.",
  cheia: "A galeria está cheia: até 12 fotos e 4 vídeos. Tire uma antes.",
  invalido: "Não deu: escolha o arquivo de novo.",
}

const FEITO_NA_GALERIA = (p: PedidoNaGaleria) =>
  p.acao === "incluir"
    ? p.item.tipo === "video"
      ? "Vídeo na galeria — na página, ele toca sem som, em loop"
      : "Foto na galeria — a página atualiza em alguns segundos"
    : p.acao === "tirar"
      ? "Tirado da galeria — a página atualiza em alguns segundos"
      : "Ordem salva — a página atualiza em alguns segundos"

/** UMA mudança nas fotos e vídeos da dobra (incluir, mover uma casa, tirar), na hora. */
export async function mudarGaleria(id: string, pedido: PedidoNaGaleria): Promise<Resultado> {
  const r = await chamar(id, "galeria", pedido)
  const erro = comum(r)
  if (erro) return erro
  if (r!.status === 409) {
    refazer(id)
    return {
      ok: false,
      texto: "Não deu: a galeria mudou desde que você abriu. Ela já mostra como está agora.",
    }
  }
  if (r!.status === 400)
    return { ok: false, texto: RECUSA_DA_GALERIA[String(r!.corpo.message)] ?? GENERICO }
  if (r!.status !== 200) return { ok: false, texto: GENERICO }
  refazer(id)
  return feito(r!, FEITO_NA_GALERIA(pedido))
}
