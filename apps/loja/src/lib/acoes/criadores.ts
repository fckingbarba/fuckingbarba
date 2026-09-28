"use server"

import { cabecalhosDeQuemPede, medusa } from "@/lib/conta"
import {
  BARBAS,
  ERRO_DO_CAMPO,
  EXPERIENCIAS,
  LIMITES,
  SEGUIDORES,
  whatsappNaTela,
  type CampoDaInscricao,
  type EstadoDaInscricao,
  type Modelo,
  type ValoresDaInscricao,
} from "@/lib/criadores-visivel"

/**
 * A INSCRIÇÃO DA PÁGINA DOS CRIADORES (`/criadores`) — manda pro Medusa
 * (`POST /store/criadores`), que guarda pro painel decidir.
 *
 * TODA AÇÃO É UM POST PÚBLICO: o que a tela confere, confere de novo aqui —
 * e o Medusa confere tudo outra vez (`lerInscricao`). O IP de quem pede vai
 * assinado (`cabecalhosDeQuemPede`), pra o limite contar por pessoa e não
 * pela Vercel inteira.
 */

const GENERICO = "Não consegui mandar agora. Tenta de novo em instantes."
const LIMITE = "Muitas inscrições daqui agora. Tenta de novo mais tarde."

const texto = (fd: FormData, campo: string) => String(fd.get(campo) ?? "")
const marcado = (fd: FormData, campo: string) => fd.get(campo) === "on"

function lerFormulario(fd: FormData): ValoresDaInscricao {
  return {
    nome: texto(fd, "nome"),
    whatsapp: texto(fd, "whatsapp"),
    email: texto(fd, "email"),
    cidade: texto(fd, "cidade"),
    instagram: texto(fd, "instagram"),
    tiktok: texto(fd, "tiktok"),
    seguidores: texto(fd, "seguidores"),
    barba: texto(fd, "barba"),
    experiencia: texto(fd, "experiencia"),
    video: texto(fd, "video"),
    parceria: marcado(fd, "parceria"),
    modelo: texto(fd, "modelo"),
    aceite: marcado(fd, "aceite"),
  }
}

const umDe = (lista: readonly { id: string }[], v: string) => lista.some((o) => o.id === v)
const ehModelo = (v: string): v is Modelo => v === "fixo" || v === "comissao" || v === "conversar"

/** O WhatsApp em dígitos, sem o 55 — a mesma régua do Medusa (`limparWhatsapp`). */
function digitosDoWhatsapp(v: string): string | null {
  let d = v.replace(/\D/g, "")
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2)
  if (d.length === 11) return /^[1-9]{2}9\d{8}$/.test(d) ? d : null
  if (d.length === 10) return /^[1-9]{2}[2-9]\d{7}$/.test(d) ? d : null
  return null
}

/** O perfil sem o @ e sem o link; vazio é `""`, errado é `null`. */
function perfil(v: string, max: number): string | null {
  const p = v
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^(www\.|m\.)?(instagram\.com|tiktok\.com)\//i, "")
    .replace(/^@/, "")
    .replace(/[/?#].*$/, "")
    .toLowerCase()
  if (!p) return ""
  return p.length <= max && /^[a-z0-9._]+$/.test(p) && !/(instagram|tiktok)\.com/.test(p) ? p : null
}

/** O link do vídeo: vazio vale; senão `http(s)`, com domínio, sem espaço (`limparVideo` do Medusa). */
function videoCerto(v: string): boolean {
  const bruto = v.trim()
  if (!bruto) return true
  if (/\s/.test(bruto)) return false
  const comProtocolo = /^[a-z][a-z0-9+.-]*:/i.test(bruto) ? bruto : `https://${bruto}`
  if (comProtocolo.length > LIMITES.video) return false
  try {
    const url = new URL(comProtocolo)
    return (
      (url.protocol === "https:" || url.protocol === "http:") &&
      url.hostname.includes(".") &&
      !url.username &&
      !url.password
    )
  } catch {
    return false
  }
}

/** O primeiro campo que o Medusa recusaria — a mesma régua dele, sem a ida. */
function campoErrado(v: ValoresDaInscricao): CampoDaInscricao | null {
  const nome = v.nome.replace(/\s+/g, " ").trim()
  if (
    nome.length < LIMITES.nome.min ||
    nome.length > LIMITES.nome.max ||
    nome.split(" ").filter((p) => /\p{L}/u.test(p)).length < 2
  )
    return "nome"
  if (!digitosDoWhatsapp(v.whatsapp)) return "whatsapp"
  const email = v.email.trim()
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return "email"
  const cidade = v.cidade.replace(/\s+/g, " ").trim()
  if (cidade.length < LIMITES.cidade.min || cidade.length > LIMITES.cidade.max) return "cidade"
  const instagram = perfil(v.instagram, LIMITES.instagram)
  const tiktok = perfil(v.tiktok, LIMITES.tiktok)
  if (instagram === null || tiktok === null || (!instagram && !tiktok)) return "redes"
  if (v.seguidores && !umDe(SEGUIDORES, v.seguidores)) return "seguidores"
  if (!umDe(BARBAS, v.barba)) return "barba"
  if (v.experiencia && !umDe(EXPERIENCIAS, v.experiencia)) return "experiencia"
  if (!videoCerto(v.video)) return "video"
  if (!ehModelo(v.modelo)) return "modelo"
  if (!v.aceite) return "aceite"
  return null
}

export async function inscreverCriador(
  anterior: EstadoDaInscricao,
  fd: FormData
): Promise<EstadoDaInscricao> {
  const valores = lerFormulario(fd)
  const rodada = (anterior.tipo === "erro" ? anterior.rodada : 0) + 1
  const erro = (t: string, campo?: CampoDaInscricao): EstadoDaInscricao => ({
    tipo: "erro",
    texto: t,
    ...(campo ? { campo } : {}),
    valores,
    rodada,
  })

  const campo = campoErrado(valores)
  if (campo) return erro(ERRO_DO_CAMPO[campo], campo)

  const r = await medusa("/store/criadores", {
    corpo: {
      ...valores,
      nome: valores.nome.trim(),
      email: valores.email.trim(),
      cidade: valores.cidade.trim(),
      aceite: true,
    },
    extras: await cabecalhosDeQuemPede(),
  })
  if (r.status === 200 && ehModelo(valores.modelo)) {
    return {
      tipo: "enviada",
      nome: valores.nome.trim().split(/\s+/)[0] ?? "",
      whatsapp: whatsappNaTela(digitosDoWhatsapp(valores.whatsapp) ?? valores.whatsapp),
      modelo: valores.modelo,
    }
  }
  if (r.status === 400 && typeof r.corpo.campo === "string" && r.corpo.campo in ERRO_DO_CAMPO) {
    const c = r.corpo.campo as CampoDaInscricao
    return erro(ERRO_DO_CAMPO[c], c)
  }
  if (r.status === 429) return erro(LIMITE)
  return erro(GENERICO)
}
