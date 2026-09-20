import { emReais } from "./formato"

/**
 * AS CONFIGURAÇÕES DA LOJA, lidas do Medusa.
 *
 * O que estava em constante no código — piso do frete grátis, CNPJ,
 * WhatsApp, prazo de postagem — passa a vir de `GET /store/configuracoes`,
 * editável no admin sem deploy.
 *
 * ┌─ POR QUE ISSO IMPORTA MAIS NO FRETE QUE NO RESTO ──────────────────────┐
 * │ CNPJ errado é dado desatualizado. Piso de frete errado é OFERTA        │
 * │ ERRADA: a loja anuncia "grátis a partir de R$ 129" e o carrinho cobra  │
 * │ até R$ 149,90. No art. 30 do CDC, o que foi anunciado vincula — ou     │
 * │ seja, ou a loja honra o que a faixa do topo prometeu, ou é propaganda  │
 * │ enganosa. Antes disto, o número vivia em DOIS arquivos de dois apps    │
 * │ diferentes (a loja e o script de frete) sem nada ligando um ao outro.  │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ ESTE ARQUIVO NÃO FALA COM O MEDUSA ───────────────────────────────────┐
 * │ Só tipos e funções puras. A BUSCA mora em `lib/medusa.ts`, junto das    │
 * │ outras, e é de lá que se importa `configuracoes()`.                     │
 * │                                                                          │
 * │ Não é organização: é obrigatório. A gaveta da sacola e a barra da PDP   │
 * │ rodam no NAVEGADOR e precisam de `frasesDoFrete` — se elas importassem  │
 * │ de um arquivo que puxa `lib/medusa.ts`, o `import "server-only"` de lá  │
 * │ iria junto pro bundle do cliente e o `next build` recusa, com um erro   │
 * │ que aponta pro arquivo errado.                                          │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * GÊMEO NO BACKEND: `apps/backend/src/lib/configuracoes.ts` tem o mesmo tipo
 * e a validação. São pacotes separados, então o contrato é escrito duas
 * vezes — como qualquer API. Quem impede a divergência em silêncio é o
 * `ferramentas/conferir-configuracoes.mjs`, que pede a rota de verdade e
 * confere o que chegou.
 */

export type AlvoDoFrete = "mais-barata" | "todas"

export type PoliticaDeFrete =
  | { modo: "nenhuma" }
  | { modo: "gratis"; piso: number; alvo: AlvoDoFrete; tetoDeCusto: number | null }
  | { modo: "fixo"; piso: number; preco: number; alvo: AlvoDoFrete; tetoDeCusto: number | null }

export type Configuracoes = {
  frete: PoliticaDeFrete
  empresa: { razaoSocial: string | null; cnpj: string | null; endereco: string | null }
  atendimento: {
    whatsapp: string | null
    email: string | null
    horario: string[] | null
    prazoDePostagem: string | null
  }
}

/**
 * O QUE VALE QUANDO O MEDUSA NÃO RESPONDE: nada anunciado.
 *
 * A tentação é cair de volta no valor "de antes" pra tela não mudar. Mas
 * este é o caso em que a loja NÃO CONSEGUIU CONFIRMAR a política — e
 * anunciar frete grátis sem saber se ele existe é exatamente a oferta que
 * vincula sem poder ser cumprida. Deixar de anunciar uma promoção que existe
 * custa uma venda; anunciar uma que não existe custa a razão.
 */
export const PADRAO: Configuracoes = {
  frete: { modo: "nenhuma" },
  empresa: { razaoSocial: null, cnpj: null, endereco: null },
  atendimento: { whatsapp: null, email: null, horario: null, prazoDePostagem: null },
}

/* ── as frases ───────────────────────────────────────────────────────────
 *
 * TODA TELA PERGUNTA, NENHUMA CALCULA. Antes, catorze arquivos faziam a
 * própria conta em cima de um número e montavam a própria frase. Com três
 * modos possíveis — e um deles sendo "não fale de frete" — catorze cópias da
 * regra é catorze lugares pra esquecer de sumir.
 *
 * Por isso tudo aqui devolve `null` quando não há promoção. `null` o
 * compilador cobra; um zero passa batido e vira "frete grátis a partir de
 * R$ 0,00" numa faixa amarela no topo do site.
 */

export type FrasesDoFrete = {
  /** "Frete grátis" · "Frete R$ 9,90" — o selo curto do card e da faixa. */
  selo: string
  /** "Frete grátis a partir de R$ 149,90" — a frase inteira. */
  completa: string
  /** "A partir de R$ 149,90" — pra quem já escreveu o selo em cima. */
  condicao: string
  /**
   * A letra miúda honesta. Quando o benefício vale só na opção mais barata,
   * "frete grátis" sozinho deixa a pessoa achar que o Sedex também é grátis
   * — e ela descobre no checkout, que é o pior lugar pra descobrir.
   */
  nota: string | null
}

export function frasesDoFrete(p: PoliticaDeFrete): FrasesDoFrete | null {
  if (p.modo === "nenhuma") return null

  const selo = p.modo === "gratis" ? "Frete grátis" : `Frete ${emReais(p.preco)}`
  const condicao = p.piso > 0 ? `A partir de ${emReais(p.piso)}` : "Para todo o Brasil"
  const completa =
    p.piso > 0
      ? `${selo} a partir de ${emReais(p.piso)}`
      : p.modo === "gratis"
        ? "Frete grátis para todo o Brasil"
        : `Frete fixo de ${emReais(p.preco)} para todo o Brasil`

  const notas: string[] = []
  if (p.alvo === "mais-barata") notas.push("vale na opção de entrega mais barata")
  if (p.tetoDeCusto !== null) notas.push(`até ${emReais(p.tetoDeCusto)} de frete`)

  return {
    selo,
    completa,
    condicao,
    nota: notas.length ? `${notas.join(", ")}.`.replace(/^./, (c) => c.toUpperCase()) : null,
  }
}

/** Quanto falta pro benefício. `null` = não há benefício nenhum a perseguir. */
export function faltaPraPromocao(p: PoliticaDeFrete, subtotal: number): number | null {
  if (p.modo === "nenhuma") return null
  return Math.max(0, p.piso - subtotal)
}

/** 0 a 100. `null` quando não há promoção — a barrinha inteira some. */
export function progressoDaPromocao(p: PoliticaDeFrete, subtotal: number): number | null {
  if (p.modo === "nenhuma") return null
  if (p.piso <= 0) return 100
  return Math.min(100, Math.round((subtotal / p.piso) * 100))
}

/** "Falta R$ 30,00 pro frete grátis" · "…pro frete de R$ 9,90". */
export function fraseDoQueFalta(p: PoliticaDeFrete, falta: number): string | null {
  if (p.modo === "nenhuma") return null
  const alvo = p.modo === "gratis" ? "o frete grátis" : `o frete de ${emReais(p.preco)}`
  return falta > 0
    ? `Falta ${emReais(falta)} pr${alvo.startsWith("o") ? "" : "a"}${alvo}`
    : `Você garantiu ${alvo}`
}

/**
 * O produto sozinho já alcança o piso? É o que decide a tarja no card.
 *
 * ALCANÇA, não passa: a regra do Medusa é `>=`, e o kit de 2 frascos custa
 * exatamente o piso. Trocar por `>` tiraria a tarja justamente do produto
 * que a loja mais quer vender.
 */
export function produtoSozinhoQualifica(p: PoliticaDeFrete, preco: number): boolean {
  return p.modo !== "nenhuma" && preco >= p.piso
}

/* ── contato ─────────────────────────────────────────────────────────────
 *
 * O número é guardado só com dígitos e DDI ("5511988887777") porque é isso
 * que o link `wa.me` aceita — pontuação ali quebra o link em silêncio, e o
 * jeito de descobrir é um cliente clicando. Quem põe a máscara é a tela.
 */

/** "5511988887777" → "(11) 98888-7777". Formato estranho volta como veio. */
export function whatsappNaTela(digitos: string | null): string | null {
  if (!digitos) return null
  const semDdi = digitos.startsWith("55") ? digitos.slice(2) : digitos
  const m = semDdi.match(/^(\d{2})(\d{4,5})(\d{4})$/)
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : digitos
}

/** O link do WhatsApp, ou `null` quando não há número configurado. */
export function linkDoWhatsapp(digitos: string | null): string | null {
  return digitos ? `https://wa.me/${digitos}` : null
}
