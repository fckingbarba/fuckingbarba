import "server-only"
import { cacheLife, cacheTag } from "next/cache"
import { limparCep } from "./cep-formato"

/**
 * CEP → ENDEREÇO
 *
 * Preenche rua, bairro, cidade e estado a partir do CEP, pra pessoa digitar
 * quatro campos a menos no celular. Consulta o ViaCEP, que é público e não
 * pede chave.
 *
 * DE JEITO NENHUM ISTO BLOQUEIA A COMPRA. O preenchimento automático é um
 * atalho, não um portão: se o ViaCEP cair, demorar, ou simplesmente não
 * conhecer aquele CEP (acontece — CEP novo, loteamento recente, zona rural), o
 * formulário continua aceitando o endereço digitado à mão. O dia em que a
 * loja perder venda porque um serviço de terceiro está fora do ar vai ser um
 * dia em que ninguém vai entender por quê.
 *
 * É CACHEADO POR MUITO TEMPO, e pode ser: rua não muda de bairro. Depois da
 * primeira pessoa de um CEP, as seguintes nem saem daqui — o que também tira o
 * ViaCEP do caminho crítico do checkout na maior parte das vezes.
 *
 * Roda no servidor, não no navegador, por três motivos: a resposta fica
 * cacheada pra todo mundo em vez de por aba; o checkout não depende do CORS de
 * ninguém; e o endereço que a gente grava passou pelo nosso código.
 */

export type EnderecoDoCep = {
  /** Só o nome da rua — o número quem digita é a pessoa. */
  logradouro: string
  bairro: string
  cidade: string
  /** Sigla de duas letras. */
  uf: string
}

// Limpar e mascarar moram em `cep-formato.ts`, sem import nenhum, porque o
// formulário de entrega é componente de cliente e não pode tocar neste arquivo.
export { limparCep, mascararCep } from "./cep-formato"

/**
 * Três segundos e meio. Não é um número redondo por acaso: é mais do que o
 * ViaCEP costuma levar e menos do que alguém espera parado olhando pra um
 * campo que não preenche. Passou disso, a pessoa digita — que é exatamente o
 * que ela faria se não existisse autocompletar nenhum.
 */
const PACIENCIA = 3500

type RespostaViaCep = {
  logradouro?: string
  bairro?: string
  localidade?: string
  uf?: string
  erro?: boolean | string
}

/**
 * O endereço de um CEP, ou null.
 *
 * Null quer dizer "não consegui", nunca "esse CEP não existe" — os dois casos
 * dão no mesmo pra quem está preenchendo, e distinguir só serviria pra loja
 * afirmar que um CEP é inválido quando na verdade foi o ViaCEP que não
 * respondeu.
 */
export async function buscarCep(cep: string): Promise<EnderecoDoCep | null> {
  "use cache"
  cacheTag(`cep:${cep}`)
  cacheLife("max")

  const limpo = limparCep(cep)
  if (!limpo) return null

  try {
    const resposta = await fetch(`https://viacep.com.br/ws/${limpo}/json/`, {
      signal: AbortSignal.timeout(PACIENCIA),
      headers: { accept: "application/json" },
    })
    if (!resposta.ok) return null

    const dados = (await resposta.json()) as RespostaViaCep
    // O ViaCEP responde 200 com `{ "erro": true }` pra CEP que não existe —
    // olhar só o status daria um endereço todo vazio como se fosse válido.
    if (dados.erro || !dados.uf) return null

    return {
      logradouro: dados.logradouro?.trim() ?? "",
      bairro: dados.bairro?.trim() ?? "",
      cidade: dados.localidade?.trim() ?? "",
      uf: dados.uf.trim().toUpperCase(),
    }
  } catch {
    // Timeout, DNS, ViaCEP fora do ar: o formulário segue à mão.
    return null
  }
}
