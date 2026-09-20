/**
 * O TEXTO DAS SEÇÕES DA PDP, por produto.
 *
 * Tudo que a página de produto AFIRMA e que não vem do catálogo mora aqui:
 * o que o produto faz, quando o resultado aparece, o modo de uso, as
 * perguntas frequentes. Preço, foto, estoque e nome continuam saindo do
 * Medusa — o front exibe, não inventa.
 *
 * É POR HANDLE, e não um texto só pra loja inteira, porque cada produto tem
 * argumento próprio: o calendário de 90 dias é do Fator, e num óleo ele
 * seria mentira. Produto sem conteúdo aqui simplesmente não monta essas
 * seções — a dobra continua de pé e a página não fica com bloco vazio nem
 * com texto de outro produto.
 *
 * QUANDO O PAINEL EXISTIR, este arquivo vira a consulta que ele alimenta:
 * a assinatura de `conteudoDaPdp(handle)` é a mesma, muda só de onde os
 * dados saem. É por isso que ele devolve DADO PURO — sem JSX, sem
 * componente, sem HTML solto.
 *
 * REALCE DENTRO DO TEXTO: escreva *assim*. O `<Realce>` transforma em
 * <strong>. Não aceito HTML nesses campos de propósito — o dia em que isto
 * vier de um painel, HTML no campo de texto vira porta de XSS, e ninguém
 * lembra de sanitizar um campo que "sempre foi da equipe".
 */

export type PassoDoTempo = {
  quando: string
  titulo: string
  texto: string
  /** O marco que a página quer que a pessoa persiga. Um só. */
  alvo?: boolean
}

export type ItemDaRotina = {
  /** handle no catálogo — foto, nome e preço saem de lá */
  handle: string
  /** "Passo 1 · limpa" */
  passo: string
  /** por que este produto está na rotina */
  para: string
}

export type Pergunta = { pergunta: string; resposta: string[] }

export type ConteudoDaPdp = {
  promessa?: {
    chapeu: string
    titulo: string
    itens: string[]
    rodape?: string
  }
  tempo?: {
    titulo: string
    passos: PassoDoTempo[]
    aviso?: string
  }
  faixa?: {
    chapeu: string
    titulo: string
    texto: string
    chamada: string
    /** handle do produto cuja foto vira o fundo da faixa */
    fotoDe: string
  }
  rotina?: {
    titulo: string
    /** o produto DESTA página entra sozinho; não repita ele aqui */
    itens: ItemDaRotina[]
  }
  funciona?: {
    comoTitulo: string
    comoFotoDe: string
    comoTexto: string[]
    usoTitulo: string
    usoFotoDe: string
    usoPassos: string[]
    dica?: string
  }
  versus?: {
    titulo: string
    nomeDeles: string
    descricaoDeles: string
    nosso: string[]
    deles: string[]
  }
  quem?: {
    titulo: string
    sim: string[]
    nao: string[]
  }
  duvidas?: {
    titulo: string
    perguntas: Pergunta[]
  }
}

const FATOR: ConteudoDaPdp = {
  promessa: {
    chapeu: "Uso diário, na pele",
    titulo: "O que muda na *sua cara*",
    itens: [
      "Estímulo ao crescimento dos fios",
      "Preenchimento das falhas",
      "Fios mais grossos e encorpados",
      "Barba mais uniforme e definida",
      "Melhora geral na qualidade dos fios",
    ],
    /*
     * Esta ressalva não é rodapé jurídico enfiado no fim: é o que separa
     * "cosmético que ajuda" de "promessa de milagre". Cosmético que promete
     * resultado garantido cai no art. 37 §1º do CDC, e a frase "não faz
     * nascer onde não existe folículo" é a que evita o reembolso de quem
     * comprou esperando outra coisa.
     */
    rodape:
      "Resultado varia de pessoa pra pessoa e depende de usar todo dia. " +
      "Não faz nascer barba onde não existe folículo.",
  },

  tempo: {
    titulo: "Quando o resultado aparece",
    passos: [
      {
        quando: "Semanas 1 e 2",
        titulo: "Textura",
        texto: "O fio fica mais forte ao toque. Ainda não cresceu nada — e é normal.",
      },
      {
        quando: "Dia 30",
        titulo: "Começa a encher",
        texto:
          "Primeiros fios novos nas áreas de falha. Aqui é onde a maioria desiste cedo demais.",
      },
      {
        quando: "Dia 90",
        titulo: "Densidade",
        texto:
          "Barba visivelmente mais cheia e uniforme. É o marco que vale a foto do antes e depois.",
        alvo: true,
      },
      {
        quando: "3 a 6 meses",
        titulo: "Resultado cheio",
        texto: "O máximo que a sua genética permite. Daí em diante é manutenção.",
      },
    ],
    /*
     * >>> CONFERIR: um frasco de 30 ml dura mesmo ~30 dias no uso de 1 a 2x
     *     ao dia? Se durar 20, este texto muda — e o argumento do kit de 3
     *     muda junto.
     */
    aviso:
      "Um frasco cobre cerca de um mês. Se o plano é chegar no dia 90, " +
      "sai mais barato levar os três de uma vez.",
  },

  faixa: {
    chapeu: "Três meses",
    titulo: "Quem começa hoje tem barba nova em *90 dias*",
    texto:
      "Não tem atalho e a gente não vai fingir que tem. Tem constância — " +
      "e um frasco em cima da pia toda manhã.",
    chamada: "Começar agora",
    fotoDe: "kit-completo-para-barba",
  },

  rotina: {
    titulo: "A rotina que faz o produto render",
    itens: [
      {
        handle: "shampoo-para-barba",
        passo: "Passo 1 · limpa",
        para: "Tira sebo e resíduo.",
      },
      {
        handle: "oleo-para-barba",
        passo: "Passo 3 · hidrata",
        para: "Fecha o ciclo. Fio novo nasce, óleo mantém macio.",
      },
    ],
  },

  funciona: {
    comoTitulo: "Como funciona",
    comoFotoDe: "oleo-para-barba",
    comoTexto: [
      "A fórmula age *na pele*, que é onde o crescimento acontece — não no fio. " +
        "Estimula a circulação local e cria o ambiente pro folículo trabalhar melhor.",
      "Não é efeito imediato e não escurece nada pra parecer mais cheio.",
    ],
    usoTitulo: "Modo de uso",
    usoFotoDe: "shampoo-para-barba",
    usoPassos: [
      "Pele da barba *limpa e seca*.",
      "Aplique direto na pele, de 1 a 2 vezes ao dia.",
      "Espalhe e *massageie* bem a região.",
      "*Não enxágue.* Deixe agir.",
    ],
    dica:
      "Aplique *depois do banho*: a pele quente absorve melhor, e vira hábito — " +
      "que é o que impede de esquecer no dia 20.",
  },

  /*
   * A COMPARAÇÃO é contra um genérico SEM MARCA, de propósito. Comparação
   * nominal com concorrente no Brasil é campo minado: o art. 4º do CONAR
   * exige que seja objetiva e comprovável ponto a ponto, e o art. 195 da Lei
   * 9.279 trata denegrir marca alheia como concorrência desleal. Contra "o
   * frasco genérico" a comparação vira posicionamento, que é o que ela
   * deveria ser desde o começo.
   *
   * >>> A LINHA DO LAUDO SAIU. Ela dizia "__% obtiveram resultado em __
   *     dias" e ficaria assim, com lacuna, na cara do cliente. Quando o
   *     dossiê existir (n, quem conduziu, quando, o que foi medido), é só
   *     voltar com o número — e aí ela vira a linha mais forte da tabela.
   */
  versus: {
    titulo: "O nosso e o genérico, lado a lado",
    nomeDeles: "Frasco genérico",
    descricaoDeles: "Sem marca, sem laudo",
    nosso: [
      "Formulado pra barba, do zero",
      "Age na pele, onde o fio nasce",
      "Prazo publicado: 90 dias, com calendário nesta página",
    ],
    deles: [
      "Fórmula de prateleira, serve pra tudo",
      "Age no fio, por cima",
      "“Resultados rápidos”, sem dizer em quanto tempo",
    ],
  },

  quem: {
    titulo: "Isto é pra você?",
    sim: [
      "Tem barba que cresce, mas com falha",
      "Quer mais volume e densidade",
      "Acha o fio fino e sem corpo",
      "Topa aplicar todo dia por três meses",
    ],
    /*
     * A coluna do "não é pra você" é a que mais vende, e é a que quase
     * ninguém tem coragem de escrever. Ela evita a compra que vira
     * reembolso e reclamação — e é o único lugar da página que manda
     * procurar um dermatologista, que é a orientação certa pra quem não tem
     * folículo.
     */
    nao: [
      "Espera resultado em uma semana",
      "Não tem folículo na região (aí nada faz nascer)",
      "Sabe que vai esquecer de aplicar",
      "Quer só perfumar ou modelar (aí é óleo ou balm)",
    ],
  },

  duvidas: {
    titulo: "Perguntas que todo mundo faz",
    perguntas: [
      {
        pergunta: "Em quanto tempo vejo resultado?",
        resposta: [
          "Textura melhora nas primeiras duas semanas. Crescimento novo começa lá pelo dia 30. " +
            "Densidade de verdade, dia 90. O resultado cheio vem entre 3 e 6 meses.",
          "Varia de pessoa pra pessoa, e depende de usar todo dia — sem constância não tem resultado.",
        ],
      },
      {
        pergunta: "Funciona pra barba que não nasce nada?",
        resposta: [
          "Não. O produto trabalha em cima do folículo que já existe: ele estimula, fortalece e " +
            "ajuda a preencher falha. Onde não tem folículo, nada faz nascer — nem isto, nem nada " +
            "que você comprar por aí.",
          "Se a sua barba não nasce em regiões inteiras desde sempre, o caminho é conversar com um " +
            "dermatologista antes de gastar com cosmético.",
        ],
      },
      {
        pergunta: "Posso usar junto com minoxidil?",
        resposta: [
          "Minoxidil é medicamento, e quem responde por combinação de medicamento é médico — não " +
            "é a gente. Não damos essa orientação.",
          "Se você já usa, leva a pergunta pro seu dermatologista.",
        ],
      },
      {
        pergunta: "Quantos dias dura um frasco?",
        resposta: ["Cerca de 30 dias, usando de 1 a 2 vezes ao dia."],
      },
      {
        pergunta: "Dá pra usar com pele sensível?",
        resposta: [
          "É um cosmético de uso diário, de absorção rápida. Se você tem pele reativa, faça o " +
            "teste de sempre: uma gota atrás da orelha, espera 24 horas.",
          "Qualquer ardência, vermelhidão ou coceira que não passa, suspende o uso e procura um " +
            "dermatologista.",
        ],
      },
      {
        pergunta: "E se não funcionar comigo?",
        resposta: [
          "Você tem 7 dias corridos a partir do recebimento pra desistir da compra, por direito " +
            "(art. 49 do Código de Defesa do Consumidor). É só pedir, sem precisar justificar.",
        ],
      },
    ],
  },
}

/** Por enquanto o único com texto escrito. Os outros cinco montam só a dobra. */
const POR_HANDLE: Record<string, ConteudoDaPdp> = {
  "fator-de-crescimento-para-barba": FATOR,
}

export function conteudoDaPdp(handle: string): ConteudoDaPdp {
  return POR_HANDLE[handle] ?? {}
}
