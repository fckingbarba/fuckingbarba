"use server"

import { cookies } from "next/headers"
import { cabecalhosDeQuemPede, medusa } from "@/lib/conta"
import { anotarNoServidor } from "@/lib/crm"
import {
  esquecerCupomPendente,
  guardarCupomPendente,
  tentarCupomPendente,
} from "@/lib/cupom-pendente"
import { COOKIE_DO_POPUP, OPCOES_DOS_COOKIES, type RespostaDoPopup } from "@/lib/primeira-compra"

/**
 * O CADASTRO DO POP-UP DA 1ª COMPRA — manda o nome e o e-mail pro Medusa
 * (`POST /store/crm/primeira-compra`), que cria o cupom e manda o e-mail na
 * hora. Com o código na mão:
 *
 *   - ele fica guardado pro checkout (`lib/cupom-pendente.ts`, o mesmo do
 *     link do cupom), e entra na sacola na hora, se ela já existe;
 *   - o pop-up não volta (`fb_popup = cadastrado`);
 *   - com o sim dos cookies, o CRM passa a saber que este navegador é este
 *     e-mail (`anotarNoServidor`, como na newsletter do rodapé).
 *
 * O IP de quem pede vai assinado (`cabecalhosDeQuemPede`): o limite conta por
 * pessoa, e não pela Vercel inteira.
 */

const ehEmail = (v: string) => v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)

export async function cadastrarNaPrimeiraCompra(dados: {
  nome: string
  email: string
  pagina: string
}): Promise<RespostaDoPopup> {
  const nome = String(dados.nome ?? "").trim()
  const email = String(dados.email ?? "").trim()
  if ((nome.match(/\p{L}/gu) ?? []).length < 2 || nome.length > 60)
    return { tipo: "erro", campo: "nome", texto: "Faltou o seu nome." }
  if (!ehEmail(email))
    return { tipo: "erro", campo: "email", texto: "Confere o e-mail: falta alguma coisa." }

  const r = await medusa("/store/crm/primeira-compra", {
    corpo: { nome, email, pagina: dados.pagina },
    extras: await cabecalhosDeQuemPede(),
  })
  const c = r.corpo as {
    tipo?: string
    codigo?: string | null
    ate?: string | null
    porcento?: number
    nome?: string | null
    message?: string
  }

  if (r.status === 400)
    return c.message === "nome_invalido"
      ? {
          tipo: "erro",
          campo: "nome",
          texto: "Esse nome não parece certo. Confere e tenta de novo.",
        }
      : {
          tipo: "erro",
          campo: "email",
          texto: "Esse e-mail não parece certo. Confere e tenta de novo.",
        }
  if (r.status === 429)
    return {
      tipo: "erro",
      campo: null,
      texto: "Muitos cadastros daqui agora. Tenta de novo mais tarde.",
    }
  if (r.status !== 200 || !c.tipo)
    return {
      tipo: "erro",
      campo: null,
      texto: "Não consegui fazer o seu cadastro agora. Tenta de novo em instantes.",
    }

  const jar = await cookies()
  jar.set(COOKIE_DO_POPUP, "cadastrado", OPCOES_DOS_COOKIES)
  await anotarNoServidor({ nome: "newsletter", email })

  // O cupom que ainda vale fica guardado pro checkout (e entra na sacola, se ela existe).
  const vale = (codigo: string | null | undefined, ate: string | null | undefined) =>
    codigo && (!ate || new Date(ate).getTime() > Date.now()) ? codigo : null
  const codigo = c.tipo === "ja-cliente" ? null : vale(c.codigo, c.ate)
  if (codigo) {
    const pendente = { codigo, frete: false, soMaisBarato: false }
    await guardarCupomPendente(pendente)
    if ((await tentarCupomPendente(pendente)) === "entrou") await esquecerCupomPendente()
  }

  const primeiro = c.nome ?? null
  if (c.tipo === "ok" && codigo)
    return { tipo: "ok", codigo, porcento: Number(c.porcento) || 10, nome: primeiro }
  if (c.tipo === "ja-cliente") return { tipo: "ja-cliente", nome: primeiro }
  return { tipo: "ja-cadastrado", codigo, nome: primeiro }
}
