"use server"

import { redirect } from "next/navigation"
import { esquecerLinkDaAvaliacao, lerLinkDaAvaliacao } from "@/lib/avaliar"
import {
  ERRO_DO_CAMPO,
  ERRO_DO_CAMPO_DIRETO,
  LIMITES,
  type CampoDaAvaliacao,
  type CampoDireto,
  type EstadoDaAvaliacao,
  type EstadoDireto,
  type ValoresDiretos,
} from "@/lib/avaliar-visivel"
import { cabecalhosDeQuemPede, medusa } from "@/lib/conta"

/**
 * AS AÇÕES DA PÁGINA DA AVALIAÇÃO (`/avaliar`).
 *
 * TODA AÇÃO É UM POST PÚBLICO: o que a tela confere, confere de novo aqui —
 * e o Medusa confere tudo outra vez (o link ou o número e o e-mail, o
 * pedido, o produto). O link vem do COOKIE, nunca do formulário: a página
 * nem tem o link pra mandar.
 */

const GENERICO = "Não consegui mandar agora. Tenta de novo em instantes."
const LINK_VENCIDO =
  "Não encontrei o pedido desse link. Preencha com o número do pedido e o e-mail da compra."
const NAO_ACHOU =
  "Não encontrei um pedido com esse número e esse e-mail. Confira os dois — estão no e-mail da compra."
const NAO_ACEITA = "Esse pedido não aceita avaliação: ele foi cancelado ou ainda não foi pago."
const JA_AVALIOU = "Esse produto já foi avaliado neste pedido — uma nota por produto."
const FORA_DO_PEDIDO = "Esse produto não veio nesse pedido. Escolha um que veio nele."
const LIMITE = "Muitas tentativas daqui agora. Tenta de novo mais tarde."

const texto = (fd: FormData, campo: string) => String(fd.get(campo) ?? "")
const ehEmail = (v: string) => v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)

function lerFormulario(fd: FormData) {
  return {
    produto: texto(fd, "produto"),
    nota: texto(fd, "nota"),
    nome: texto(fd, "nome"),
    texto: texto(fd, "texto"),
  }
}

function nomeErrado(v: string): boolean {
  const nome = v.replace(/\s+/g, " ").trim()
  return nome.length < LIMITES.nome.min || nome.length > LIMITES.nome.max || !/\p{L}/u.test(nome)
}

/** O primeiro campo que o Medusa recusaria — a mesma régua dele, sem a ida. */
function campoErrado(v: ReturnType<typeof lerFormulario>): CampoDaAvaliacao | null {
  if (!/^prod_[0-9A-Z]{26}$/.test(v.produto)) return "produto"
  if (!/^[1-5]$/.test(v.nota)) return "nota"
  if (nomeErrado(v.nome)) return "nome"
  const t = v.texto.trim()
  if (t.length < LIMITES.texto.min || t.length > LIMITES.texto.max) return "texto"
  return null
}

export async function enviarAvaliacao(
  anterior: EstadoDaAvaliacao,
  fd: FormData
): Promise<EstadoDaAvaliacao> {
  const valores = lerFormulario(fd)
  const rodada = (anterior.tipo === "erro" ? anterior.rodada : 0) + 1
  const erro = (t: string, campo?: CampoDaAvaliacao): EstadoDaAvaliacao => ({
    tipo: "erro",
    texto: t,
    ...(campo ? { campo } : {}),
    valores,
    rodada,
  })

  const campo = campoErrado(valores)
  if (campo) return erro(ERRO_DO_CAMPO[campo], campo)
  const link = await lerLinkDaAvaliacao()
  if (!link) return erro(LINK_VENCIDO)

  const r = await medusa("/store/avaliacoes", {
    corpo: {
      p: link,
      produto: valores.produto,
      nota: Number(valores.nota),
      nome: valores.nome,
      texto: valores.texto,
    },
    extras: await cabecalhosDeQuemPede(),
  })
  const faltam = Array.isArray(r.corpo.faltam)
    ? r.corpo.faltam.filter((x): x is string => typeof x === "string")
    : []
  if (r.status === 200) {
    return {
      tipo: "enviada",
      nome: valores.nome.trim().split(/\s+/)[0] ?? "",
      produto: String(fd.get("produto_nome") ?? ""),
      faltam,
    }
  }
  if (r.status === 400 && typeof r.corpo.campo === "string" && r.corpo.campo in ERRO_DO_CAMPO) {
    const c = r.corpo.campo as CampoDaAvaliacao
    return erro(ERRO_DO_CAMPO[c], c)
  }
  if (r.status === 404) return erro(LINK_VENCIDO)
  if (r.status === 409 && r.corpo.message === "ja_avaliou") return erro(JA_AVALIOU, "produto")
  if (r.status === 409) return erro(NAO_ACEITA)
  if (r.status === 429) return erro(LIMITE)
  return erro(GENERICO)
}

/** O primeiro campo errado, na ordem da tela: o pedido, o e-mail, o nome, o produto, a nota e o texto. */
function campoErradoDireto(v: ValoresDiretos): CampoDireto | null {
  if (!/\d/.test(v.numero) || v.numero.replace(/\D/g, "").length > 9) return "numero"
  if (!ehEmail(v.email)) return "email"
  if (nomeErrado(v.nome)) return "nome"
  return campoErrado(v)
}

/**
 * A PÁGINA SEM O LINK — o número do pedido, o e-mail da compra e a avaliação,
 * num envio só (o endereço que a loja manda pelo WhatsApp). O Medusa acha o
 * pedido na loja nova ou na base da Nuvemshop e confere se o produto veio
 * nele; nada do pedido volta pra cá, só se entrou ou por que não.
 */
export async function enviarAvaliacaoDireta(
  anterior: EstadoDireto,
  fd: FormData
): Promise<EstadoDireto> {
  const valores: ValoresDiretos = {
    numero: texto(fd, "numero").trim(),
    email: texto(fd, "email").trim(),
    nome: texto(fd, "nome"),
    produto: texto(fd, "produto"),
    nota: texto(fd, "nota"),
    texto: texto(fd, "texto"),
  }
  const rodada = (anterior.tipo === "erro" ? anterior.rodada : 0) + 1
  const erro = (t: string, campo?: CampoDireto): EstadoDireto => ({
    tipo: "erro",
    texto: t,
    ...(campo ? { campo } : {}),
    valores,
    rodada,
  })

  const campo = campoErradoDireto(valores)
  if (campo) return erro(ERRO_DO_CAMPO_DIRETO[campo], campo)

  const r = await medusa("/store/avaliacoes", {
    corpo: {
      numero: valores.numero,
      email: valores.email,
      produto: valores.produto,
      nota: Number(valores.nota),
      nome: valores.nome,
      texto: valores.texto,
    },
    extras: await cabecalhosDeQuemPede(),
  })
  if (r.status === 200)
    return { tipo: "enviada", nome: valores.nome.trim().split(/\s+/)[0] ?? "", valores }
  if (
    r.status === 400 &&
    typeof r.corpo.campo === "string" &&
    r.corpo.campo in ERRO_DO_CAMPO_DIRETO
  ) {
    const c = r.corpo.campo as CampoDireto
    return erro(ERRO_DO_CAMPO_DIRETO[c], c)
  }
  if (r.status === 404) return erro(NAO_ACHOU)
  if (r.status === 409 && r.corpo.message === "ja_avaliou") return erro(JA_AVALIOU, "produto")
  if (r.status === 409 && r.corpo.message === "fora_do_pedido")
    return erro(FORA_DO_PEDIDO, "produto")
  if (r.status === 409) return erro(NAO_ACEITA)
  if (r.status === 429) return erro(LIMITE)
  return erro(GENERICO)
}

/** "Não é este pedido": esquece o link e volta pra busca. */
export async function avaliarOutroPedido() {
  await esquecerLinkDaAvaliacao()
  redirect("/avaliar")
}
