import {
  FORMATO_DAS_INTEGRACOES,
  type AlvoDoFrete,
  type Atendimento,
  type Configuracoes,
  type Cotacao,
  type Empresa,
  type Integracoes,
  type PoliticaDeFrete,
} from "../configuracoes"
import { numeroBrasileiro } from "../cupons"
import { NOME_DO_PAPEL, type Papel } from "../equipe/regras"
import type { NotaEsperando, Pendencia } from "../erp/notas"
import { emFrase, hora, quando } from "./formato"

/**
 * AS CONFIGURAÇÕES NO PAINEL — o que o dono muda (os dados da empresa, o
 * frete, a hora da nota) e o que ele só confere (o pagamento, a entrega, os
 * e-mails). Código puro, com testes.
 *
 * O que muda mora onde sempre morou: `fb_configuracoes`, no metadata da loja
 * (`lib/configuracoes.ts`, a mesma peneira da rota pública e do admin), e a
 * janela da nota na conexão do ERP. Aqui é a leitura do formulário, campo a
 * campo, com a frase do que está errado — o admin do Medusa, que segue
 * como reserva, só descartava o valor ruim em silêncio.
 */

export type Leitura<T> = { ok: true; valor: T } | { ok: false; erros: Record<string, string> }

const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "")
const REAIS = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
const reais = (v: number) => REAIS.format(v).replace(/\s/g, " ")
/** 149.9 → "149,90": como o campo mostra o que está gravado. */
const campoDeReais = (v: number | null | undefined) =>
  typeof v === "number" ? v.toFixed(2).replace(".", ",") : ""

/* ── os dados da empresa ────────────────────────────────────────────────── */

export type FormularioDaEmpresa = {
  razaoSocial: string
  cnpj: string
  endereco: string
  /** "(47) 98826-1551": o painel mostra sem o 55. */
  whatsapp: string
  email: string
  /** Uma frase por linha, como o rodapé mostra. */
  horario: string
  prazoDePostagem: string
}

/** Os dois dígitos do fim do CNPJ conferem com os doze primeiros? */
export function cnpjValido(digitos: string): boolean {
  if (!/^\d{14}$/.test(digitos) || /^(\d)\1{13}$/.test(digitos)) return false
  const dv = (base: string) => {
    const pesos =
      base.length === 12
        ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    const soma = [...base].reduce((s, d, i) => s + Number(d) * pesos[i], 0)
    const resto = soma % 11
    return resto < 2 ? 0 : 11 - resto
  }
  const primeiro = dv(digitos.slice(0, 12))
  const segundo = dv(digitos.slice(0, 12) + primeiro)
  return digitos.endsWith(`${primeiro}${segundo}`)
}

/** "12345678000195" → "12.345.678/0001-95" */
export const formatarCnpj = (d: string) =>
  `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`

/** "5547988261551" → "(47) 98826-1551" (o que o campo mostra). */
export function whatsappNaTela(digitos: string | null): string {
  if (!digitos) return ""
  const local = digitos.startsWith("55") && digitos.length >= 12 ? digitos.slice(2) : digitos
  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`
  return `+${digitos}`
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * O formulário da aba "Dados da empresa". Em branco é válido (a página legal
 * mostra "dado pendente"); preenchido, precisa estar certo.
 */
export function lerEmpresa(v: unknown): Leitura<{ empresa: Empresa; atendimento: Atendimento }> {
  const o = (v ?? {}) as Record<string, unknown>
  const erros: Record<string, string> = {}

  const razaoSocial = texto(o.razaoSocial)
  if (razaoSocial.length > 120) erros.razaoSocial = "Até 120 letras."

  const cnpjDigitos = texto(o.cnpj).replace(/\D/g, "")
  if (cnpjDigitos && !cnpjValido(cnpjDigitos))
    erros.cnpj = "Esse CNPJ não confere: são 14 números, e os dois últimos são a conta dos outros."

  const endereco = texto(o.endereco)
  if (endereco.length > 200) erros.endereco = "Até 200 letras."

  let whatsapp = texto(o.whatsapp).replace(/\D/g, "")
  if (whatsapp.length === 10 || whatsapp.length === 11) whatsapp = `55${whatsapp}`
  if (whatsapp && !/^55\d{10,11}$/.test(whatsapp))
    erros.whatsapp = "O WhatsApp com DDD, como (47) 98826-1551."

  const email = texto(o.email)
  if (email && (!EMAIL.test(email) || email.length > 120))
    erros.email = "Esse e-mail não parece certo."

  const linhas = texto(o.horario)
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean)
  if (linhas.length > 4 || linhas.some((l) => l.length > 80))
    erros.horario = "Até 4 linhas, de até 80 letras cada."

  const prazoDePostagem = texto(o.prazoDePostagem)
  if (prazoDePostagem.length > 60) erros.prazoDePostagem = "Até 60 letras."

  if (Object.keys(erros).length) return { ok: false, erros }
  return {
    ok: true,
    valor: {
      empresa: {
        razaoSocial: razaoSocial || null,
        cnpj: cnpjDigitos ? formatarCnpj(cnpjDigitos) : null,
        endereco: endereco || null,
      },
      atendimento: {
        whatsapp: whatsapp || null,
        email: email || null,
        horario: linhas.length ? linhas : null,
        prazoDePostagem: prazoDePostagem || null,
      },
    },
  }
}

export function formularioDaEmpresa(c: Configuracoes): FormularioDaEmpresa {
  return {
    razaoSocial: c.empresa.razaoSocial ?? "",
    cnpj: c.empresa.cnpj ?? "",
    endereco: c.empresa.endereco ?? "",
    whatsapp: whatsappNaTela(c.atendimento.whatsapp),
    email: c.atendimento.email ?? "",
    horario: (c.atendimento.horario ?? []).join("\n"),
    prazoDePostagem: c.atendimento.prazoDePostagem ?? "",
  }
}

/** Os nomes dos campos em branco: a faixa amarela diz quais a loja mostra como "pendente". */
export function camposEmBranco(f: FormularioDaEmpresa): string[] {
  const nomes: [keyof FormularioDaEmpresa, string][] = [
    ["razaoSocial", "razão social"],
    ["cnpj", "CNPJ"],
    ["endereco", "endereço"],
    ["whatsapp", "WhatsApp"],
    ["email", "e-mail"],
    ["horario", "horário"],
    ["prazoDePostagem", "prazo de postagem"],
  ]
  return nomes.filter(([c]) => !f[c].trim()).map(([, nome]) => nome)
}

/* ── o frete ────────────────────────────────────────────────────────────── */

export type FormularioDoFrete = {
  modo: PoliticaDeFrete["modo"]
  /** "149,90" */
  piso: string
  preco: string
  alvo: AlvoDoFrete
}

export type FormularioDaEmergencia = { preco: string; prazo: string }

/**
 * A promoção de frete. O teto de custo (quanto a loja aceita pagar pela
 * opção grátis) não está na tela: fica o que já estava.
 */
export function lerFrete(v: unknown, atual: PoliticaDeFrete): Leitura<PoliticaDeFrete> {
  const o = (v ?? {}) as Record<string, unknown>
  const modo = o.modo
  if (modo !== "nenhuma" && modo !== "gratis" && modo !== "fixo")
    return { ok: false, erros: { modo: "Escolha a promoção." } }
  if (modo === "nenhuma") return { ok: true, valor: { modo: "nenhuma" } }

  const erros: Record<string, string> = {}
  const piso = numeroBrasileiro(o.piso)
  if (piso === null || piso < 0 || piso > 100_000)
    erros.piso = "O valor em produtos a partir do qual vale, como 149,90."
  const preco = numeroBrasileiro(o.preco)
  if (modo === "fixo" && (preco === null || preco <= 0 || preco > 1000))
    erros.preco = "O preço fixo do frete, como 9,90."
  if (Object.keys(erros).length) return { ok: false, erros }

  const alvo: AlvoDoFrete = o.alvo === "todas" ? "todas" : "mais-barata"
  const tetoDeCusto = atual.modo === "nenhuma" ? null : atual.tetoDeCusto
  const centavos = (n: number) => Math.round(n * 100) / 100
  return {
    ok: true,
    valor:
      modo === "gratis"
        ? { modo, piso: centavos(piso!), alvo, tetoDeCusto }
        : { modo, piso: centavos(piso!), preco: centavos(preco!), alvo, tetoDeCusto },
  }
}

/**
 * O que a loja faz se a Frenet cair. Preço em branco é a escolha de não
 * vender sem cotar; preenchido, o prazo que a loja promete vem junto.
 */
export function lerEmergencia(v: unknown): Leitura<Cotacao> {
  const o = (v ?? {}) as Record<string, unknown>
  const bruto = texto(o.preco)
  const prazo = texto(o.prazo)
  if (!bruto)
    return { ok: true, valor: { precoDeEmergencia: null, prazoDeEmergencia: prazo || null } }
  const erros: Record<string, string> = {}
  const preco = numeroBrasileiro(bruto)
  if (preco === null || preco < 0 || preco > 1000)
    erros.preco = "O preço do frete na queda, como 24,90."
  if (!prazo) erros.prazo = "O prazo que a loja promete nessa hora, como 7 dias úteis."
  else if (prazo.length > 60) erros.prazo = "Até 60 letras."
  if (Object.keys(erros).length) return { ok: false, erros }
  return {
    ok: true,
    valor: { precoDeEmergencia: Math.round(preco! * 100) / 100, prazoDeEmergencia: prazo },
  }
}

/** "Frete grátis a partir de R$ 149,90 em produtos, na opção mais barata." */
export function freteEmFrase(f: PoliticaDeFrete): string {
  if (f.modo === "nenhuma") return "Sem promoção: quem compra paga o frete da cotação."
  const onde = f.alvo === "todas" ? "em todas as opções" : "na opção mais barata"
  return f.modo === "gratis"
    ? `Frete grátis a partir de ${reais(f.piso)} em produtos, ${onde}.`
    : `Frete de ${reais(f.preco)} a partir de ${reais(f.piso)} em produtos, ${onde}.`
}

/* ── a nota fiscal ──────────────────────────────────────────────────────── */

/**
 * As janelas que a tela oferece — as mesmas da tela do ERP no admin. O ERP
 * aceita qualquer uma até 24 h; outra, gravada pela API, aparece na tela
 * como "N min", marcada.
 */
export const JANELAS = [
  { minutos: 0, nome: "Na hora" },
  { minutos: 5, nome: "5 min" },
  { minutos: 15, nome: "15 min" },
  { minutos: 30, nome: "30 min" },
  { minutos: 60, nome: "1 hora" },
  { minutos: 120, nome: "2 horas" },
  { minutos: 240, nome: "4 horas" },
] as const

export const ehJanela = (v: unknown): v is number => JANELAS.some((j) => j.minutos === v)

/* ── as integrações ─────────────────────────────────────────────────────── */

export type FormularioDasIntegracoes = Record<keyof Integracoes, string>

/**
 * Cada integração, na ordem da tela: o nome, o exemplo e o que procurar no
 * que a pessoa colar. Quem cola quase nunca cola só o código — vem o trecho
 * inteiro que a plataforma deu, com espaço, em minúscula —, então a leitura
 * tenta cada `achar` na ordem (o grupo 1 é o código) e fica com o primeiro
 * que casar. O formato final quem confere é o `FORMATO_DAS_INTEGRACOES`, o
 * mesmo da leitura que a loja usa.
 */
export const INTEGRACOES: {
  chave: keyof Integracoes
  nome: string
  exemplo: string
  /** Onde a pessoa acha o código, na plataforma. */
  onde: string
  achar: RegExp[]
  caixa: "alta" | "baixa" | "como-veio"
  erro: string
}[] = [
  {
    chave: "ga4",
    nome: "Google Analytics (GA4)",
    exemplo: "G-XXXXXXXXXX",
    onde: "Google Analytics → Administrador → Fluxos de dados → o site → ID da métrica.",
    achar: [/\b(G-[A-Z0-9]{4,20})\b/i],
    caixa: "alta",
    erro: "O código do GA4 começa com G- (G-XXXXXXXXXX).",
  },
  {
    chave: "googleAds",
    nome: "Google Ads",
    exemplo: "AW-123456789",
    onde: "Google Ads → Metas → Conversões → a conversão de compra → Configuração da tag → Instalar a tag por conta própria.",
    achar: [/\b(AW-\d{6,15})\b/i],
    caixa: "alta",
    erro: "O código do Google Ads começa com AW- e segue com números.",
  },
  {
    chave: "googleAdsCompra",
    nome: "Rótulo da conversão de compra (Google Ads)",
    exemplo: "AbC-D_efG-h12",
    onde: 'No mesmo lugar do AW-: o que vem depois da barra no "send_to". Pode colar o trecho do evento inteiro.',
    // Colado o trecho do evento ("send_to': 'AW-123/rótulo'"), vale o que vem depois da barra.
    achar: [/AW-\d{6,15}\/([A-Za-z0-9_-]{4,64})/i, /^([A-Za-z0-9_-]{4,64})$/],
    caixa: "como-veio",
    erro: "O rótulo tem só letras, números, - e _ (é o que vem depois da barra em AW-…/rótulo).",
  },
  {
    chave: "metaPixel",
    nome: "Pixel da Meta",
    exemplo: "123456789012345",
    onde: "Gerenciador de Eventos da Meta → Fontes de dados → o pixel → a identificação (só números).",
    achar: [
      /fbq\(\s*["']init["']\s*,\s*["'](\d{10,20})["']/,
      /[?&]id=(\d{10,20})\b/,
      /^(\d{10,20})$/,
    ],
    caixa: "como-veio",
    erro: "O pixel da Meta é só número, com 15 ou 16 dígitos.",
  },
  {
    chave: "clarity",
    nome: "Microsoft Clarity",
    exemplo: "abcde12345",
    onde: "clarity.microsoft.com → o projeto → Settings → Overview → Project ID.",
    achar: [
      /["']script["']\s*,\s*["']([a-z0-9]{6,20})["']/i,
      /clarity\.ms\/tag\/([a-z0-9]{6,20})\b/i,
      /^([a-z0-9]{6,20})$/i,
    ],
    caixa: "baixa",
    erro: "O código da Clarity tem letras e números, uns 10 (Settings → Setup, no site da Clarity).",
  },
  {
    chave: "tiktok",
    nome: "Pixel do TikTok",
    exemplo: "C4ABCDEFGH1234567890",
    onde: "TikTok Ads Manager → Ferramentas → Eventos → Web → o pixel → o ID do pixel.",
    // Sozinho, só com algum número: "TiktokAnalyticsObject", do próprio trecho, não é código.
    achar: [/ttq\.load\(\s*["']([A-Z0-9]{15,30})["']/i, /^(?=[A-Z0-9]*\d)([A-Z0-9]{15,30})$/i],
    caixa: "alta",
    erro: "O código do pixel do TikTok tem uns 20 caracteres, letras e números.",
  },
]

export function formularioDasIntegracoes(c: Configuracoes): FormularioDasIntegracoes {
  return Object.fromEntries(
    INTEGRACOES.map((i) => [i.chave, c.integracoes[i.chave] ?? ""])
  ) as FormularioDasIntegracoes
}

/**
 * O formulário das integrações: em branco desliga; preenchido, só no
 * formato. O rótulo da compra do Google Ads só vale com o código da conta.
 */
export function lerIntegracoes(v: unknown): Leitura<Integracoes> {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>
  const erros: Record<string, string> = {}
  const valor = {} as Integracoes
  for (const i of INTEGRACOES) {
    const bruto = texto(o[i.chave])
    valor[i.chave] = null
    if (!bruto) continue
    const achado =
      bruto.length <= 5000 ? i.achar.map((r) => r.exec(bruto)?.[1]).find(Boolean) : null
    const codigo = !achado
      ? ""
      : i.caixa === "alta"
        ? achado.toUpperCase()
        : i.caixa === "baixa"
          ? achado.toLowerCase()
          : achado
    if (!FORMATO_DAS_INTEGRACOES[i.chave].test(codigo)) erros[i.chave] = i.erro
    else valor[i.chave] = codigo
  }
  if (valor.googleAdsCompra && !valor.googleAds && !erros.googleAds)
    erros.googleAds = "Sem o código da conta (AW-…), o rótulo da compra não vale."
  return Object.keys(erros).length ? { ok: false, erros } : { ok: true, valor }
}

/* ── os e-mails ─────────────────────────────────────────────────────────── */

/**
 * OS AVISOS PRA EQUIPE E QUEM RECEBE — cada um vai pro papel que resolve
 * (`lib/equipe/avisados.ts` manda; esta lista é a tela e o teste).
 */
export const AVISOS_DA_EQUIPE = [
  {
    nome: "A nota do pedido não saiu",
    texto: "Rejeitada, denegada, ou o Bling recusou o pedido.",
    papeis: ["operacao", "dono"],
  },
  {
    nome: "Confira a nota do pedido",
    texto: "A nota saiu com dados antigos do cliente.",
    papeis: ["operacao", "dono"],
  },
  {
    nome: "Cancele a nota (ou o pedido) no Bling",
    texto: "O pedido foi cancelado depois de a nota sair.",
    papeis: ["operacao", "dono"],
  },
  {
    nome: "A conexão com o Bling caiu",
    texto: "Um por dia, enquanto estiver caída.",
    papeis: ["dono"],
  },
  {
    nome: "O estorno do pedido não saiu",
    texto: "O dinheiro não voltou pro cliente.",
    papeis: ["dono"],
  },
] as const satisfies readonly { nome: string; texto: string; papeis: readonly Papel[] }[]

/** Os e-mails que o cliente recebe, e se já saem. */
export const EMAILS_DO_CLIENTE = [
  {
    nome: "Código de acesso",
    texto: "O código vai no assunto, pra entrar na conta.",
    saindo: true,
  },
  {
    nome: "Troca de e-mail da conta",
    texto: "O código que confirma o endereço novo.",
    saindo: true,
  },
  { nome: "Pedido confirmado", texto: "Quando o pagamento entra.", saindo: true },
  {
    nome: "Pedido cancelado",
    texto:
      "Três versões: com estorno, Pix vencido e sem cobrança. E o do Pix pago depois do cancelamento, devolvido.",
    saindo: true,
  },
  {
    nome: "A caminho · saiu pra entrega · esperando retirada · entregue",
    texto: "Um pra cada aviso da Frenet.",
    saindo: true,
  },
  {
    nome: "Carrinho abandonado",
    texto: "Cinco e-mails em 5 dias, com cupom nos três últimos.",
    saindo: false,
  },
] as const

export type MembroParaAviso = { nome: string; email: string; papel: Papel; situacao: string }

/**
 * Pra quem vai um aviso: quem está ATIVO na equipe com um dos papéis. Sem
 * ninguém do papel, o dono; sem dono no painel ainda, os usuários do admin do
 * Medusa, como era antes do painel.
 */
export function destinatarios(
  papeis: readonly Papel[],
  membros: MembroParaAviso[],
  usuariosDoAdmin: string[]
): { emails: string[]; quem: string } {
  const ativos = membros.filter((m) => m.situacao === "ativo")
  const unicos = (l: string[]) => [...new Set(l.map((e) => e.trim().toLowerCase()).filter(Boolean))]
  const doPapel = ativos.filter((m) => papeis.includes(m.papel))
  if (doPapel.length)
    return {
      emails: unicos(doPapel.map((m) => m.email)),
      quem: doPapel.map((m) => `${m.nome} (${NOME_DO_PAPEL[m.papel].toLowerCase()})`).join(", "),
    }
  const donos = ativos.filter((m) => m.papel === "dono")
  if (donos.length)
    return {
      emails: unicos(donos.map((m) => m.email)),
      quem: `${donos.map((m) => m.nome).join(", ")} (dono: ninguém do papel ainda)`,
    }
  return {
    emails: unicos(usuariosDoAdmin),
    quem: "os usuários do admin do Medusa (ninguém no painel ainda)",
  }
}

/* ── a tela ─────────────────────────────────────────────────────────────── */

export type LinhaDeStatus = { titulo: string; texto: string; ligado: boolean | null }

/** `pedidoId` nulo: a linha junta vários pedidos (a mesma queda, ou o que passou do teto). */
export type PendenciaDaNota = {
  pedidoId: string | null
  numero: number
  titulo: string
  texto: string
}

export type TelaDasConfiguracoes = {
  empresa: FormularioDaEmpresa & { emBranco: string[] }
  frete: FormularioDoFrete & { emergencia: FormularioDaEmergencia; frase: string }
  pagamento: LinhaDeStatus[]
  nota: {
    erp: {
      nome: string
      configurado: boolean
      conectado: boolean
      desde: string | null
      queda: string | null
    }
    janela: number
    janelas: { minutos: number; nome: string }[]
    pendencias: PendenciaDaNota[]
  }
  entrega: LinhaDeStatus[]
  emails: {
    /** Só o endereço: "nao-responda@fuckingbarba.com.br". */
    remetente: string
    cliente: { nome: string; texto: string; saindo: boolean }[]
    equipe: { nome: string; texto: string; papeis: Papel[]; quem: string }[]
  }
  integracoes: {
    formulario: FormularioDasIntegracoes
    campos: { chave: keyof Integracoes; nome: string; exemplo: string; onde: string }[]
    /** A compra, plataforma a plataforma: por onde sai e o que falta. */
    compra: LinhaDeStatus[]
  }
}

export type DadosDasConfiguracoes = {
  configuracoes: Configuracoes
  pagamento: {
    configurado: boolean
    pixMinutos: number
    parcelas: number
    parcelaMinima: number
    estornos: { horas: number; tentativas: number }
  }
  erp: {
    nome: string
    configurado: boolean
    conectado: boolean
    conectadoEm: string | null
    queda: string | null
    janela: number
  }
  /** As notas que precisam de alguém (a observabilidade já acha) e as que esperam a janela. */
  pendencias: PendenciaDaNota[]
  entrega: { cotacao: boolean; painel: boolean }
  membros: MembroParaAviso[]
  usuariosDoAdmin: string[]
  /** O `EMAIL_REMETENTE` (`remetenteDosEmails`), com o nome ou sem. */
  remetente: string
  /** Quais chaves da compra pelo servidor estão no Railway (`lib/anuncios/`). */
  anuncios: { meta: boolean; ga4: boolean; tiktok: boolean }
}

const quandoFoi = (iso: string | null) => (iso ? new Date(iso) : null)

export function telaDasConfiguracoes(d: DadosDasConfiguracoes): TelaDasConfiguracoes {
  const c = d.configuracoes
  const empresa = formularioDaEmpresa(c)
  const f = c.frete
  const desde = quandoFoi(d.erp.conectadoEm)
  return {
    empresa: { ...empresa, emBranco: camposEmBranco(empresa) },
    frete: {
      modo: f.modo,
      piso: f.modo === "nenhuma" ? "" : campoDeReais(f.piso),
      preco: f.modo === "fixo" ? campoDeReais(f.preco) : "",
      alvo: f.modo === "nenhuma" ? "mais-barata" : f.alvo,
      emergencia: {
        preco: campoDeReais(c.cotacao.precoDeEmergencia),
        prazo: c.cotacao.prazoDeEmergencia ?? "",
      },
      frase: freteEmFrase(f),
    },
    pagamento: [
      {
        titulo: "Pagar.me",
        texto: d.pagamento.configurado
          ? "Pix e cartão. O aviso de pagamento chega pelo Pagar.me, e a loja confere sozinha de 5 em 5 minutos."
          : "Sem a chave do Pagar.me: a loja não recebe pagamento.",
        ligado: d.pagamento.configurado,
      },
      {
        titulo: "Pix",
        texto: `Vale ${d.pagamento.pixMinutos} minutos. Não pago, o pedido é cancelado sozinho e o estoque volta.`,
        ligado: null,
      },
      {
        titulo: "Cartão",
        texto:
          `Até ${d.pagamento.parcelas}x sem juros, parcela mínima de ${reais(d.pagamento.parcelaMinima)}. ` +
          "Cobrado só depois de a análise de fraude aprovar — até lá, o valor fica reservado.",
        ligado: null,
      },
      {
        titulo: "Estornos",
        texto:
          `O que o Pagar.me não devolve vira aviso no Início e e-mail pro dono, e é pedido de novo de ` +
          `${d.pagamento.estornos.horas} em ${d.pagamento.estornos.horas} horas, até ${d.pagamento.estornos.tentativas} vezes.`,
        ligado: null,
      },
    ],
    nota: {
      erp: {
        nome: d.erp.nome,
        configurado: d.erp.configurado,
        conectado: d.erp.conectado,
        desde: desde
          ? `Conectado em ${desde.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })} · estoque copiado de 5 em 5 minutos`
          : null,
        queda: d.erp.queda,
      },
      janela: d.erp.janela,
      janelas: [
        ...JANELAS.map((j) => ({ ...j })),
        ...(ehJanela(d.erp.janela) ? [] : [{ minutos: d.erp.janela, nome: `${d.erp.janela} min` }]),
      ],
      pendencias: d.pendencias,
    },
    entrega: [
      {
        titulo: "Frenet · cotação",
        texto: d.entrega.cotacao
          ? "Econômica e expressa, na sacola, no checkout e na página do produto."
          : "Sem o token da Frenet: a loja não cota o frete.",
        ligado: d.entrega.cotacao,
      },
      {
        titulo: "Pedido pago vai sozinho pro painel da Frenet",
        texto: d.entrega.painel
          ? "Como FB-número, com a nota. Quem despacha só gera a etiqueta e posta."
          : "Desligado: sem o token de parceiro da Frenet, a etiqueta é feita à mão, do começo.",
        ligado: d.entrega.painel,
      },
      {
        titulo: "Rastreio",
        texto:
          "A loja pergunta à Frenet de hora em hora e manda os e-mails: a caminho, saiu pra entrega, esperando retirada, entregue.",
        ligado: d.entrega.cotacao,
      },
    ],
    emails: {
      remetente: /<([^>]+)>/.exec(d.remetente)?.[1]?.trim() ?? d.remetente.trim(),
      cliente: EMAILS_DO_CLIENTE.map((e) => ({ ...e })),
      equipe: AVISOS_DA_EQUIPE.map((a) => ({
        nome: a.nome,
        texto: a.texto,
        papeis: [...a.papeis],
        quem: destinatarios(a.papeis, d.membros, d.usuariosDoAdmin).quem,
      })),
    },
    integracoes: {
      formulario: formularioDasIntegracoes(c),
      campos: INTEGRACOES.map(({ chave, nome, exemplo, onde }) => ({ chave, nome, exemplo, onde })),
      compra: compraEmFrase(c.integracoes, d.anuncios),
    },
  }
}

/**
 * A COMPRA, PLATAFORMA A PLATAFORMA — em frase, com o que falta. A da Meta,
 * a do GA4 e a do TikTok saem do servidor quando o pagamento entra
 * (`lib/anuncios/`): contam o Pix pago depois e quem usa bloqueador, e
 * precisam de uma chave no Railway além do código. A do Google Ads sai da
 * tela de obrigado, com o rótulo da compra.
 */
export function compraEmFrase(
  i: Integracoes,
  chaves: DadosDasConfiguracoes["anuncios"]
): LinhaDeStatus[] {
  const peloServidor = (
    titulo: string,
    codigo: string | null,
    temChave: boolean,
    variavel: string,
    semCodigo: string
  ): LinhaDeStatus =>
    !codigo
      ? { titulo, texto: semCodigo, ligado: null }
      : temChave
        ? {
            titulo,
            texto: "Sai do servidor quando o pagamento entra, só de quem aceitou os cookies.",
            ligado: true,
          }
        : {
            titulo,
            texto: `Falta a chave no Railway (${variavel}): sem ela, a compra não sai.`,
            ligado: false,
          }
  return [
    peloServidor(
      "Meta — API de Conversões",
      i.metaPixel,
      chaves.meta,
      "META_CAPI_TOKEN",
      "Sem o pixel da Meta."
    ),
    peloServidor(
      "GA4 — Measurement Protocol",
      i.ga4,
      chaves.ga4,
      "GA4_API_SECRET",
      "Sem o código do GA4."
    ),
    peloServidor(
      "TikTok — Events API",
      i.tiktok,
      chaves.tiktok,
      "TIKTOK_EVENTS_TOKEN",
      "Sem o pixel do TikTok."
    ),
    !i.googleAds
      ? {
          titulo: "Google Ads — conversão de compra",
          texto: "Sem o código do Google Ads.",
          ligado: null,
        }
      : i.googleAdsCompra
        ? {
            titulo: "Google Ads — conversão de compra",
            texto:
              "Sai da tela de obrigado quando o pagamento entra, de quem aceitou os cookies. O Pix pago com a tela fechada não conta.",
            ligado: true,
          }
        : {
            titulo: "Google Ads — conversão de compra",
            texto: "Falta o rótulo da compra: o Google Ads mede as visitas, mas não a compra.",
            ligado: false,
          },
  ]
}

/** Mais do que isso na tela vira "e mais N": a lista inteira fica na tela do ERP, no admin. */
export const MAX_PENDENCIAS = 30

/** Da mesma queda, até 3 vêm um por um; mais do que isso, uma linha só. */
const JUNTA_A_PARTIR_DE = 4

/** Primeiro o que tem prazo (a SEFAZ), depois o que precisa de alguém, e por fim o que a loja resolve. */
const ORDEM: Record<Pendencia["tipo"], number> = {
  cancelar: 0,
  rejeitada: 1,
  denegada: 1,
  "nao-sai": 1,
  desfazer: 2,
  tentando: 2,
}

/**
 * As pendências do ERP (as mesmas da tela do ERP no admin, `pendenciasDasNotas`
 * e `notasEsperando`), em frase. O que tem prazo vem primeiro, depois o que
 * precisa de alguém, o que a loja segue tentando sozinha e, por fim, o que só
 * espera a janela. Com o Bling fora do ar, as notas que não saíram pela mesma
 * razão viram uma linha só — e a tela tem teto.
 */
export function pendenciasEmFrase(
  pendencias: Pendencia[],
  esperando: NotaEsperando[],
  agora: Date
): PendenciaDaNota[] {
  const numero = (referencia: string) => Number(referencia.replace(/\D/g, "")) || 0
  const detalhe = (d: string | null) => (d ? `${emFrase(d)} ` : "")
  // A próxima tentativa, se ainda não passou (a varredura atrasada tenta na próxima volta).
  const deNovo = (iso: string | null | undefined) =>
    iso && new Date(iso).getTime() > agora.getTime() ? ` — de novo ${quando(iso, agora)}` : ""
  const frase: Record<Pendencia["tipo"], (p: Pendencia) => [string, string]> = {
    cancelar: (p) => [
      "cancelar a nota no Bling",
      `${detalhe(p.detalhe)}O pedido foi cancelado depois de a nota sair.` +
        (p.prazo ? ` A SEFAZ aceita o cancelamento até ${quando(p.prazo, agora)}.` : ""),
    ],
    desfazer: (p) => [
      "cancelado, desfazendo no Bling",
      `${detalhe(p.detalhe)}A loja segue tentando sozinha.`,
    ],
    rejeitada: (p) => [
      "nota rejeitada",
      `${detalhe(p.detalhe)}Corrija no Bling e reenvie por lá — a loja percebe sozinha.`,
    ],
    denegada: (p) => ["nota denegada", `${detalhe(p.detalhe)}A SEFAZ não autoriza essa nota.`],
    "nao-sai": (p) => [
      "a nota não sai sozinha",
      `${detalhe(p.detalhe)}Corrija o que falta e mande tentar de novo, no pedido.`,
    ],
    tentando: (p) => [
      "a nota ainda não saiu",
      `${detalhe(p.detalhe)}A loja segue tentando${deNovo(p.prazo)}.`,
    ],
  }
  const umPorUm = (p: Pendencia): PendenciaDaNota => {
    const [titulo, texto] = frase[p.tipo](p)
    return {
      pedidoId: p.pedidoId,
      numero: numero(p.referencia),
      titulo: `${p.referencia} — ${titulo}`,
      texto,
    }
  }

  // As que a loja segue tentando pela mesma razão: juntas, se forem muitas.
  const tentando = new Map<string, Pendencia[]>()
  for (const p of pendencias)
    if (p.tipo === "tentando") {
      const chave = p.detalhe ?? ""
      tentando.set(chave, [...(tentando.get(chave) ?? []), p])
    }
  const juntas = new Set([...tentando.values()].filter((g) => g.length >= JUNTA_A_PARTIR_DE).flat())
  const linhas = pendencias
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => !juntas.has(p))
    .sort((a, b) => ORDEM[a.p.tipo] - ORDEM[b.p.tipo] || a.i - b.i)
    .map(({ p }) => umPorUm(p))
  for (const grupo of tentando.values()) {
    if (grupo.length < JUNTA_A_PARTIR_DE) continue
    const proxima = grupo
      .map((p) => p.prazo)
      .filter((v): v is string => Boolean(deNovo(v)))
      .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0]
    const primeiras = grupo.slice(0, 3).map((p) => p.referencia)
    linhas.push({
      pedidoId: null,
      numero: 0,
      titulo: `${grupo.length} notas ainda não saíram`,
      texto:
        `${primeiras.join(", ")} e mais ${grupo.length - primeiras.length}. ` +
        `${detalhe(grupo[0].detalhe)}A loja segue tentando sozinha${deNovo(proxima)}.`,
    })
  }
  linhas.push(
    ...esperando.map((n) => ({
      pedidoId: n.pedidoId,
      numero: numero(n.referencia),
      titulo: `${n.referencia} — esperando a janela`,
      texto: `Sai às ${hora(n.notaEm)}. Dá pra emitir antes, no pedido.`,
    }))
  )
  if (linhas.length <= MAX_PENDENCIAS) return linhas
  const resto = linhas.length - (MAX_PENDENCIAS - 1)
  return [
    ...linhas.slice(0, MAX_PENDENCIAS - 1),
    {
      pedidoId: null,
      numero: 0,
      titulo: `E mais ${resto} pendências`,
      texto: "A lista inteira está no admin, na tela do Bling.",
    },
  ]
}
