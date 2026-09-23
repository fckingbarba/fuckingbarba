"use server"

import { refresh } from "next/cache"
import { redirect } from "next/navigation"
import type { EstadoDaEtapa } from "@/lib/checkout-visivel"
import { lerCliente, lerSessao, medusa } from "@/lib/conta"
import { naoSalvou } from "@/lib/conta-visivel"
import { conferirDocumento } from "@/lib/documento"
import { conferirTelefone } from "@/lib/telefone"

/**
 * MEUS DADOS — nome, celular, CPF ou CNPJ, e o que a pessoa quer receber.
 *
 * Os campos e as frases são os do passo 1 do checkout, que é pra onde estes
 * dados vão (ver `preencherDaConta`). Tudo junto, como lá: sem os quatro, o
 * checkout abriria pela metade do mesmo jeito.
 *
 * O E-MAIL NÃO SE EDITA AQUI: é a chave da conta, e trocar pede código no
 * endereço novo (senão um erro de digitação tranca a pessoa pra fora) — ver
 * `troca-de-email.ts`, ao lado.
 *
 * ┌─ ONDE CADA COISA MORA NO MEDUSA ───────────────────────────────────────┐
 * │ Nome, sobrenome e celular: `first_name`, `last_name` e `phone` do      │
 * │ cliente — o celular como o checkout grava, `+55` e os dígitos.         │
 * │                                                                        │
 * │ Documento e ofertas: no `metadata` do cliente, que o Medusa MESCLA no  │
 * │ primeiro nível (gravar as ofertas não apaga o documento, e             │
 * │ vice-versa).                                                           │
 * └────────────────────────────────────────────────────────────────────────┘
 */

const GENERICO = "Não consegui falar com a loja agora. Tenta de novo em instantes."

const texto = (fd: FormData, campo: string, teto = 80) =>
  String(fd.get(campo) ?? "")
    .trim()
    .slice(0, teto)

export async function salvarDados(anterior: EstadoDaEtapa, fd: FormData): Promise<EstadoDaEtapa> {
  const nome = texto(fd, "nome", 60)
  const sobrenome = texto(fd, "sobrenome")
  const telefone = conferirTelefone(texto(fd, "telefone", 30))
  const doc = conferirDocumento(texto(fd, "documento", 30))

  const erros: Record<string, string> = {}
  if (!nome) erros.nome = "Falta o nome."
  if (!sobrenome) erros.sobrenome = "Falta o sobrenome."
  if (!telefone) erros.telefone = "Telefone com DDD, 10 ou 11 dígitos."
  if (!doc.ok) erros.documento = doc.erro
  if (!telefone || !doc.ok || Object.keys(erros).length) return naoSalvou(anterior, erros, "", fd)

  const token = await lerSessao()
  if (!token) redirect("/conta/entrar?para=%2Fconta%2Fdados")
  const leitura = await lerCliente()
  if (leitura.estado === "expirou" || leitura.estado === "sem-sessao") {
    redirect("/conta/sair?motivo=expirou")
  }
  if (leitura.estado !== "ok") return naoSalvou(anterior, {}, GENERICO, fd)

  /*
    O CONSENTIMENTO GUARDA A DATA DO "SIM" — e só do primeiro: salvar os
    dados de novo com a caixa ainda marcada não finge um consentimento
    novo. Desmarcou, vira `null`; marcar outra vez é um "sim" novo, com a
    data de agora.
  */
  const agora = new Date().toISOString()
  const antes = leitura.cliente.ofertas
  const ofertas = {
    email: fd.get("ofertas-email") === "on" ? (antes.email ?? agora) : null,
    whatsapp: fd.get("ofertas-whatsapp") === "on" ? (antes.whatsapp ?? agora) : null,
  }

  const r = await medusa("/store/customers/me", {
    corpo: {
      first_name: nome,
      last_name: sobrenome,
      phone: telefone,
      metadata: { documento: doc.documento, ofertas },
    },
    token,
  })
  if (r.status === 401) redirect("/conta/sair?motivo=expirou")
  if (r.status !== 200) {
    console.warn(`[conta] salvar dados: ${r.status} ${String(r.corpo.message ?? "")}`)
    return naoSalvou(anterior, {}, GENERICO, fd)
  }

  refresh()
  return { ok: true, erros: {}, mensagem: "", rodada: anterior.rodada + 1 }
}
