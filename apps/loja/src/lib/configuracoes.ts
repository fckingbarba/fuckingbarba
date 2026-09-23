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

/**
 * O vídeo da seção "O cuidado que impõe presença", na home, quando o admin
 * subiu um. As medidas são pra reservar o espaço antes de ele carregar
 * (contrato: `VideoDaMarca`, em `apps/backend/src/lib/configuracoes.ts`).
 */
export type VideoDaMarca = { url: string; largura: number; altura: number }

export type Configuracoes = {
  frete: PoliticaDeFrete
  empresa: { razaoSocial: string | null; cnpj: string | null; endereco: string | null }
  atendimento: {
    whatsapp: string | null
    email: string | null
    horario: string[] | null
    prazoDePostagem: string | null
  }
  home: { video: VideoDaMarca | null }
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
  home: { video: null },
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

/**
 * "Faltam R$ 30,00 pro frete grátis" · "…pro frete de R$ 9,90".
 *
 * `null` quando não há nada a perseguir: sem política, ou já alcançado. Cada
 * tela escreve a própria frase de CONQUISTA — é onde vale mudar o tom ("é
 * por nossa conta", "nesta combinação") —, mas o número e o nome do
 * benefício saem daqui, porque são o que não pode variar entre telas.
 *
 * "Faltam" no plural: o valor é em reais, e o singular só está certo pra
 * exatamente um real.
 */
export function fraseDoQueFalta(p: PoliticaDeFrete, falta: number): string | null {
  if (p.modo === "nenhuma" || falta <= 0) return null
  const alvo = p.modo === "gratis" ? "o frete grátis" : `o frete de ${emReais(p.preco)}`
  return `${falta === 1 ? "Falta" : "Faltam"} ${emReais(falta)} pr${alvo}`
}

/**
 * O piso é uma meta que dá pra alcançar — ou todo mundo já tem o benefício?
 *
 * Com piso zero ("frete grátis para todo o Brasil") a tarja apareceria em
 * cima de cada kit e de cada item que combina, e uma tarja que aparece em
 * tudo não distingue nada: vira ruído de cor no meio da decisão. Quem
 * anuncia esse caso é o selo das garantias, uma vez só.
 */
export function pisoVale(p: PoliticaDeFrete): boolean {
  return p.modo !== "nenhuma" && p.piso > 0
}

/**
 * Este valor alcança o piso? É o que decide toda tarja de frete da loja.
 *
 * ALCANÇA, não passa: a regra do Medusa é `>=`, e o kit de 2 frascos custa
 * exatamente o piso. Trocar por `>` tiraria a tarja justamente do produto
 * que a loja mais quer vender.
 */
export function alcancaOPiso(p: PoliticaDeFrete, subtotal: number): boolean {
  return p.modo !== "nenhuma" && subtotal >= p.piso
}

/** O produto sozinho alcança? É o que decide a tarja no card da vitrine. */
export function produtoSozinhoQualifica(p: PoliticaDeFrete, preco: number): boolean {
  return alcancaOPiso(p, preco)
}

/**
 * ESTE ITEM É O QUE FECHA A CONTA?
 *
 * Responde a pergunta do cross-sell: somando este item ao que já está
 * escolhido, o pedido passa a ter frete grátis — e sem ele, não tinha.
 *
 * As DUAS condições importam, e a segunda é a que mantém a tarja honesta.
 * Sem `escolhido < piso`, todo item ganharia a tarja assim que o pedido já
 * estivesse acima do piso por outro motivo: a pessoa marcaria o óleo
 * "pra ganhar o frete" que ela já tinha ganho no kit de 3. É verdade de
 * rótulo e mentira de significado, que é o tipo que só se descobre depois.
 */
export function fechaOPiso(p: PoliticaDeFrete, escolhido: number, item: number): boolean {
  if (p.modo === "nenhuma") return false
  return escolhido < p.piso && escolhido + item >= p.piso
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
