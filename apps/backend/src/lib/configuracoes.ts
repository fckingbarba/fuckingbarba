/**
 * AS CONFIGURAÇÕES DA LOJA — o contrato.
 *
 * Isto é o que hoje está espalhado em constante de código: piso do frete
 * grátis, CNPJ, WhatsApp, prazo de postagem. Sai do código e vai pro
 * `metadata` da loja no Medusa, por um motivo simples: mudar um número não
 * pode exigir deploy, e — no caso do frete — quem COBRA e quem ANUNCIA
 * precisam ler a mesma fonte.
 *
 * ┌─ POR QUE O FRETE NÃO É UM NÚMERO ──────────────────────────────────────┐
 * │ A primeira versão disto era `FRETE_GRATIS_A_PARTIR_DE = 149.9`. Um     │
 * │ número não sabe dizer "não tem promoção nenhuma" a não ser virando     │
 * │ zero ou infinito, e as duas gambiarras se espalham por toda tela que   │
 * │ faz conta com ele. Também não sabe dizer "frete fixo de R$ 9,90 na     │
 * │ opção mais barata", que é outra política que a loja pode querer.       │
 * │                                                                         │
 * │ Então é uma UNIÃO DE MODOS. O `modo: "nenhuma"` é um caso de verdade,  │
 * │ que o compilador obriga cada tela a tratar — em vez de um zero que     │
 * │ passa despercebido e faz a loja anunciar "frete grátis a partir de     │
 * │ R$ 0,00".                                                               │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ POR QUE O ALVO NÃO É UMA TRANSPORTADORA ──────────────────────────────┐
 * │ Hoje a regra de frete grátis está pendurada na opção "Correios PAC".   │
 * │ Com o Frenet, as opções passam a ser cotação ao vivo — Loggi, Jadlog,  │
 * │ Azul, PAC — variando por CEP e peso. Não existe mais "a opção PAC" pra │
 * │ pendurar regra, e pendurar num nome faria o benefício cair na opção    │
 * │ que a pessoa não escolheu no dia em que outra sair mais barata.        │
 * │                                                                         │
 * │ Por isso o alvo é "mais-barata" ou "todas": posição na cotação, não    │
 * │ nome de transportadora.                                                 │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * ESTE ARQUIVO TEM UM GÊMEO: `apps/loja/src/lib/configuracoes.ts`. São dois
 * pacotes separados, então o tipo é escrito duas vezes — é um contrato de
 * rede, como qualquer API. O que impede os dois de divergirem em silêncio
 * não é um comentário: é o `conferir-configuracoes.mjs` da loja, que pede a
 * rota de verdade e confere o formato que chegou.
 */

/**
 * Em qual opção da cotação o benefício cai.
 *
 * `mais-barata` — a de menor preço naquele CEP, seja ela quem for. É o que
 *   faz sentido pra "frete grátis": você dá o que custa menos, e a pessoa
 *   ganha justamente a opção que provavelmente escolheria.
 * `todas` — o benefício vale em qualquer modalidade, inclusive expressa.
 *   Mais generoso e bem mais caro; existe porque é uma decisão de negócio,
 *   não porque é recomendável.
 */
export type AlvoDoFrete = "mais-barata" | "todas"

export type PoliticaDeFrete =
  /** Sem promoção nenhuma: a loja não fala de frete grátis em lugar nenhum. */
  | { modo: "nenhuma" }
  /** Zera o frete a partir de `piso` reais de produtos. */
  | { modo: "gratis"; piso: number; alvo: AlvoDoFrete; tetoDeCusto: number | null }
  /** Cobra `preco` fixo, em vez do preço da transportadora. */
  | { modo: "fixo"; piso: number; preco: number; alvo: AlvoDoFrete; tetoDeCusto: number | null }

export type Empresa = {
  razaoSocial: string | null
  cnpj: string | null
  endereco: string | null
}

export type Atendimento = {
  /** Só dígitos, com DDI: "5511999999999". É o que o link wa.me quer. */
  whatsapp: string | null
  email: string | null
  /** Uma linha por frase, como o rodapé exibe. */
  horario: string[] | null
  /** "1 a 2 dias úteis" — o tempo ENTRE o pagamento e a postagem. */
  prazoDePostagem: string | null
}

/**
 * A COTAÇÃO AO VIVO — o que fazer quando ela não responde.
 *
 * Com frete cotado na hora, a loja passa a depender de uma API de terceiro
 * pra conseguir fechar pedido: o Medusa não completa carrinho sem método de
 * envio, e sem cotação não há método. Ou seja, uma queda da Frenet fecha a
 * loja.
 *
 * ┌─ POR QUE O SOCORRO É UM NÚMERO SEU, E NÃO UM CHUTE MEU ────────────────┐
 * │ A alternativa "óbvia" é o código cair num valor razoável — R$ 24,90,   │
 * │ digamos. Mas frete que o cliente vê é oferta, e no art. 30 do CDC ela  │
 * │ vincula: se sair barato demais, quem paga a diferença é a loja, em     │
 * │ todo pedido, enquanto a queda durar. Esse é um risco que o dono        │
 * │ dimensiona, não o programador.                                         │
 * │                                                                         │
 * │ Por isso `null` é o padrão e significa "não venda sem cotar". É o mais │
 * │ conservador: a loja para em vez de cobrar um número que ninguém        │
 * │ escolheu. Quem quiser continuar vendendo durante a queda escreve o     │
 * │ valor no admin, e aí o número é dele.                                  │
 * └─────────────────────────────────────────────────────────────────────────┘
 */
export type Cotacao = {
  /** Em reais. `null` = sem cotação, sem entrega — a loja não vende. */
  precoDeEmergencia: number | null
  /**
   * O prazo que a loja promete quando cobra o preço de emergência.
   *
   * Texto livre — "7 dias úteis" —, e não um número de dias, porque é uma
   * FRASE que vai na tela do cliente e que a loja vai ter que cumprir. Um
   * número obrigaria a tela a montar a frase, e frase montada por código é
   * onde aparece "1 dias úteis".
   *
   * Existe separado do preço porque são duas promessas diferentes e elas
   * falham diferente: cobrar R$ 20 e entregar em 15 dias é um problema de
   * prazo, não de preço. Com a cotação de pé, o prazo vem da
   * transportadora; aqui é o que vale quando não veio de ninguém.
   */
  prazoDeEmergencia: string | null
}

export type Configuracoes = {
  frete: PoliticaDeFrete
  empresa: Empresa
  atendimento: Atendimento
  cotacao: Cotacao
}

/**
 * O RECORTE PÚBLICO. A rota `/store/configuracoes` devolve ISTO, não o
 * objeto inteiro.
 *
 * Os campos são listados um a um de propósito. Com `delete c.cotacao` ou um
 * `Omit` espalhado, o próximo campo interno que alguém acrescentar nasce
 * público — e o jeito de descobrir seria achá-lo num `curl` da loja. Aqui o
 * padrão é o contrário: campo novo é invisível até alguém escrever o nome
 * dele nesta função.
 */
export type ConfiguracoesPublicas = Pick<Configuracoes, "frete" | "empresa" | "atendimento">

export function soOPublico(c: Configuracoes): ConfiguracoesPublicas {
  return { frete: c.frete, empresa: c.empresa, atendimento: c.atendimento }
}

/**
 * O QUE VALE QUANDO NÃO HÁ CONFIGURAÇÃO.
 *
 * Frete: NENHUMA promoção. Nunca o valor "de antes".
 *
 * A tentação é cair de volta em `{ modo: "gratis", piso: 149.9 }` pra tela
 * não mudar. Mas o padrão é o que vale quando a loja NÃO CONSEGUIU LER a
 * política — e anunciar frete grátis sem saber se ele existe é oferta que
 * pode não ser cumprida, que no art. 30 do CDC vincula do mesmo jeito.
 * Deixar de anunciar uma promoção que existe custa uma venda; anunciar uma
 * que não existe custa a reclamação e a razão.
 *
 * Empresa e atendimento: tudo `null`. As páginas legais já sabem desenhar a
 * tarja de "dado pendente" quando o valor não existe — que é melhor do que
 * exibir um CNPJ de exemplo com cara de verdadeiro.
 */
export const PADRAO: Configuracoes = {
  frete: { modo: "nenhuma" },
  empresa: { razaoSocial: null, cnpj: null, endereco: null },
  atendimento: { whatsapp: null, email: null, horario: null, prazoDePostagem: null },
  cotacao: { precoDeEmergencia: null, prazoDeEmergencia: null },
}

/** Chave única dentro do `metadata` da loja, pra não brigar com mais nada. */
export const CHAVE_NO_METADATA = "fb_configuracoes"

/* ── leitura defensiva ───────────────────────────────────────────────────
 *
 * O `metadata` é JSON livre: qualquer um com acesso ao admin pode gravar
 * lá o que quiser, e uma versão antiga do objeto sobrevive a um deploy que
 * mudou o formato. Então NADA aqui confia no que leu — cada campo é
 * validado, e o que não passar vira o padrão.
 */

const ehTexto = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0

/** Dinheiro: número finito, não negativo, com no máximo dois decimais. */
function dinheiro(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(",", ".")) : NaN
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n * 100) / 100
}

function lerAlvo(v: unknown): AlvoDoFrete {
  return v === "todas" ? "todas" : "mais-barata"
}

function lerFrete(bruto: unknown): PoliticaDeFrete {
  if (!bruto || typeof bruto !== "object") return PADRAO.frete
  const o = bruto as Record<string, unknown>

  const piso = dinheiro(o.piso) ?? 0
  const alvo = lerAlvo(o.alvo)
  const tetoDeCusto = dinheiro(o.tetoDeCusto)

  if (o.modo === "gratis") return { modo: "gratis", piso, alvo, tetoDeCusto }

  if (o.modo === "fixo") {
    const preco = dinheiro(o.preco)
    // Frete fixo sem preço não é frete fixo; vira "sem promoção" em vez de
    // virar R$ 0,00, que seria frete grátis por acidente de digitação.
    if (preco === null) return PADRAO.frete
    return { modo: "fixo", piso, preco, alvo, tetoDeCusto }
  }

  return PADRAO.frete
}

function lerHorario(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null
  const linhas = v.filter(ehTexto).map((l) => l.trim())
  return linhas.length ? linhas : null
}

/** Só dígitos: o rodapé monta `wa.me/<isto>`, e pontuação quebra o link. */
function lerWhatsapp(v: unknown): string | null {
  if (!ehTexto(v)) return null
  const digitos = v.replace(/\D/g, "")
  return digitos.length >= 12 && digitos.length <= 15 ? digitos : null
}

export function lerConfiguracoes(metadata: unknown): Configuracoes {
  const raiz =
    metadata && typeof metadata === "object"
      ? (metadata as Record<string, unknown>)[CHAVE_NO_METADATA]
      : null
  if (!raiz || typeof raiz !== "object") return PADRAO

  const o = raiz as Record<string, unknown>
  const empresa = (o.empresa ?? {}) as Record<string, unknown>
  const atendimento = (o.atendimento ?? {}) as Record<string, unknown>
  const cotacao = (o.cotacao ?? {}) as Record<string, unknown>

  return {
    frete: lerFrete(o.frete),
    /*
      Zero é um valor legítimo aqui — "na queda, frete grátis pra todo mundo"
      é uma decisão possível —, então não dá pra usar `|| null`. O `dinheiro`
      já recusa negativo e texto, e devolve `null` pro que não for número.
    */
    cotacao: {
      precoDeEmergencia: dinheiro(cotacao.precoDeEmergencia),
      prazoDeEmergencia: ehTexto(cotacao.prazoDeEmergencia)
        ? cotacao.prazoDeEmergencia.trim()
        : null,
    },
    empresa: {
      razaoSocial: ehTexto(empresa.razaoSocial) ? empresa.razaoSocial.trim() : null,
      cnpj: ehTexto(empresa.cnpj) ? empresa.cnpj.trim() : null,
      endereco: ehTexto(empresa.endereco) ? empresa.endereco.trim() : null,
    },
    atendimento: {
      whatsapp: lerWhatsapp(atendimento.whatsapp),
      email: ehTexto(atendimento.email) ? atendimento.email.trim() : null,
      horario: lerHorario(atendimento.horario),
      prazoDePostagem: ehTexto(atendimento.prazoDePostagem)
        ? atendimento.prazoDePostagem.trim()
        : null,
    },
  }
}

/* ── o cálculo que o provider de entrega vai usar ────────────────────────
 *
 * Ainda não há Frenet, mas a regra mora aqui desde já — e não dentro do
 * provider — porque é ELA que a loja anuncia. O dia em que o provider
 * nascer, ele chama esta função em vez de reimplementar a política; assim
 * não existe a versão em que a tela promete uma coisa e a cotação faz outra.
 */

export type OpcaoCotada = { id: string; preco: number }

/**
 * Aplica a política a uma lista de opções já cotadas.
 *
 * `subtotal` é o valor dos PRODUTOS, sem frete — é sobre ele que o piso
 * incide, porque somar o frete pra decidir se o frete é grátis é uma conta
 * que se morde.
 *
 * O TETO existe pra transportadora dinâmica: com cotação ao vivo, "grátis na
 * mais barata" custa R$ 18 na capital e pode custar R$ 70 pro interior do
 * Acre. Com teto, acima dele a promoção não se aplica e a pessoa paga o
 * preço cheio — o que é melhor do que a loja descobrir a conta no fim do mês.
 *
 * E o fixo nunca COBRA MAIS que o preço real: se a transportadora pede R$ 8
 * e o fixo é R$ 9,90, vale R$ 8. Promoção que encarece não é promoção.
 */
export function aplicarPolitica(
  politica: PoliticaDeFrete,
  opcoes: OpcaoCotada[],
  subtotal: number
): OpcaoCotada[] {
  if (politica.modo === "nenhuma" || !opcoes.length) return opcoes
  if (subtotal < politica.piso) return opcoes

  const maisBarata = opcoes.reduce((a, b) => (b.preco < a.preco ? b : a))

  return opcoes.map((opcao) => {
    const alvo = politica.alvo === "todas" || opcao.id === maisBarata.id
    if (!alvo) return opcao
    if (politica.tetoDeCusto !== null && opcao.preco > politica.tetoDeCusto) return opcao

    return {
      ...opcao,
      preco: politica.modo === "gratis" ? 0 : Math.min(opcao.preco, politica.preco),
    }
  })
}
