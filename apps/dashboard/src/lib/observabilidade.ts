/**
 * A TELA DE OBSERVABILIDADE, como vem do Medusa (`GET /dashboard/observabilidade`,
 * montada em `apps/backend/src/lib/painel/observabilidade.ts`). O painel só
 * mostra: a frase, o que fazer e a cor já vêm prontos.
 */

export type Nivel = "grave" | "atencao" | "info"

export type Acao = { texto: string; href: string; externo?: boolean }

export type ProblemaNaTela = {
  id: string
  nivel: Nivel
  area: string
  titulo: string
  texto: string
  /** "3 vezes · a última hoje, 14:06" · "visto desde ontem, 18:40" */
  meta: string
  acao: Acao | null
  /** A linha técnica, pra quem for investigar. */
  detalhe: string | null
  situacao: "aberto" | "resolvido"
  /** "Resolvido por Ana, hoje, 10:12" · "Saiu sozinho hoje, 10:12" */
  resolvido: string | null
  /** Sai sozinho quando o estado muda: não tem "marcar como resolvido". */
  sozinho: boolean
  podeMarcar: boolean
}

export type IntegracaoNaTela = {
  id: string
  nome: string
  onde: string
  s: "ok" | "atencao" | "erro" | "off"
  texto: string
  sinal: string | null
}

export type RotinaNaTela = {
  nome: string
  frase: string
  cada: string
  s: "ok" | "atencao" | "erro" | "espera"
  ultima: string | null
  duracao: string | null
  texto: string | null
  proxima: string
}

/** Bom, precisa melhorar ou ruim — os limites do Google. */
export type Faixa = "bom" | "medio" | "ruim"

export type MedidorNaTela = {
  valor: string
  s: Faixa
  n: number
  /** Onde fica o ponto no trilho (0–100) e o tamanho das faixas boa e média. */
  ponto: number
  faixaBoa: number
  faixaMedia: number
}

export type VitalNaTela = {
  metrica: string
  nome: string
  ajuda: string
  celular: MedidorNaTela | null
  computador: MedidorNaTela | null
}

export type TelaDaObservabilidade = {
  geral: { nivel: Nivel; titulo: string; texto: string }
  numeros: {
    problemas: { abertos: number; graves: number; olhar: number }
    rotinas: { ok: number; total: number }
    noAr: { valor: string | null; texto: string }
    carregar: { valor: string | null; s: Faixa | null; texto: string }
  }
  problemas: ProblemaNaTela[]
  integracoes: IntegracaoNaTela[]
  rotinas: RotinaNaTela[]
  velocidade: { vitais: VitalNaTela[]; visitas: number; maisLenta: string | null }
}

export const NOME_DA_FAIXA: Record<Faixa, string> = {
  bom: "Bom",
  medio: "Precisa melhorar",
  ruim: "Ruim",
}

/** A cor do selo de cada faixa, com os `status` que o painel já tem. */
export const COR_DA_FAIXA: Record<Faixa, string> = {
  bom: "publicado",
  medio: "analise",
  ruim: "problema",
}

export const NOME_DO_NIVEL: Record<Nivel, string> = {
  grave: "Grave",
  atencao: "Pra olhar",
  info: "Pra saber",
}

export const NOME_DA_SITUACAO: Record<IntegracaoNaTela["s"] | RotinaNaTela["s"], string> = {
  ok: "Ok",
  atencao: "Atenção",
  erro: "Falhou",
  off: "Desligado",
  espera: "Esperando",
}
