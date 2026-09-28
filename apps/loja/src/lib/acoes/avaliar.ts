"use server"

import { redirect } from "next/navigation"
import { esquecerLinkDaAvaliacao, lerLinkDaAvaliacao } from "@/lib/avaliar"
import {
  ERRO_DO_CAMPO,
  LIMITES,
  type CampoDaAvaliacao,
  type EstadoDaAvaliacao,
  type EstadoDoEncontrar,
} from "@/lib/avaliar-visivel"
import { cabecalhosDeQuemPede, medusa } from "@/lib/conta"

/**
 * AS AÇÕES DA PÁGINA DA AVALIAÇÃO (`/avaliar`).
 *
 * TODA AÇÃO É UM POST PÚBLICO: o que a tela confere, confere de novo aqui —
 * e o Medusa confere tudo outra vez (o link, o pedido, o produto). O link
 * vem do COOKIE, nunca do formulário: a página nem tem o link pra mandar.
 */

const GENERICO = "Não consegui mandar agora. Tenta de novo em instantes."
const LINK_VENCIDO =
  "Não encontrei o pedido desse link. Procure pelo número do pedido e o e-mail da compra."
const NAO_ACEITA = "Esse pedido não aceita avaliação: ele foi cancelado ou ainda não foi pago."
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

/** O primeiro campo que o Medusa recusaria — a mesma régua dele, sem a ida. */
function campoErrado(v: ReturnType<typeof lerFormulario>): CampoDaAvaliacao | null {
  if (!/^prod_[0-9A-Z]{26}$/.test(v.produto)) return "produto"
  if (!/^[1-5]$/.test(v.nota)) return "nota"
  const nome = v.nome.replace(/\s+/g, " ").trim()
  if (nome.length < LIMITES.nome.min || nome.length > LIMITES.nome.max || !/\p{L}/u.test(nome))
    return "nome"
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
  if (r.status === 409 && r.corpo.message === "ja_avaliou")
    return erro("Esse produto já foi avaliado neste pedido — uma nota por produto.", "produto")
  if (r.status === 409) return erro(NAO_ACEITA)
  if (r.status === 429) return erro(LIMITE)
  return erro(GENERICO)
}

/**
 * A página sem o link: o número do pedido e o e-mail da compra. O link vai
 * PRO E-MAIL DA COMPRA e nunca volta pra cá (`POST /store/avaliacoes/encontrar`):
 * a resposta do Medusa é sempre a mesma, e a tela diz pra olhar o e-mail.
 */
export async function encontrarPedido(
  anterior: EstadoDoEncontrar,
  fd: FormData
): Promise<EstadoDoEncontrar> {
  const numero = texto(fd, "numero").trim()
  const email = texto(fd, "email").trim()
  const rodada = (anterior.tipo === "inicio" ? 0 : anterior.rodada) + 1
  const erro = (t: string, campo?: "numero" | "email"): EstadoDoEncontrar => ({
    tipo: "erro",
    texto: t,
    ...(campo ? { campo } : {}),
    numero,
    email,
    rodada,
  })

  if (!/\d/.test(numero))
    return erro("Escreva o número do pedido (está no e-mail da compra).", "numero")
  if (!ehEmail(email)) return erro("Confere o e-mail: parece que falta alguma coisa.", "email")

  const r = await medusa("/store/avaliacoes/encontrar", {
    corpo: { numero, email },
    extras: await cabecalhosDeQuemPede(),
  })
  if (r.status === 200) return { tipo: "mandado", email, rodada }
  if (r.status === 400 && r.corpo.campo === "email")
    return erro("Confere o e-mail: parece que falta alguma coisa.", "email")
  if (r.status === 400)
    return erro("Escreva o número do pedido (está no e-mail da compra).", "numero")
  if (r.status === 429) return erro(LIMITE)
  return erro("Não consegui mandar agora. Tenta de novo em instantes.")
}

/** "Não é este pedido": esquece o link e volta pra busca. */
export async function avaliarOutroPedido() {
  await esquecerLinkDaAvaliacao()
  redirect("/avaliar")
}
