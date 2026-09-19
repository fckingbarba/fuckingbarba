/**
 * O texto da seção "Alta Performance" — três cards por produto.
 *
 * Isto é CONTEÚDO EDITORIAL, não dado de loja. Nome, foto e preço saem do
 * Medusa (é lá que eles mudam); o que está aqui é o que alguém escreveu sobre
 * o produto: o que ele é, como se usa, o que esperar.
 *
 * Por que não fica no Medusa junto com o resto: no admin isso seria um campo
 * de metadata em JSON cru, editado sem revisão e sem histórico. Aqui o texto
 * passa por commit, dá pra ver o que mudou e dá pra voltar atrás. Quando
 * existir alguém escrevendo conteúdo com frequência, vira CMS — e o formato
 * abaixo já é o mesmo que um CMS devolveria.
 *
 * A chave é o handle do produto. Produto sem texto aqui simplesmente não
 * entra na seção; texto sem produto no catálogo também não. Os dois lados
 * precisam existir pra o slide aparecer.
 *
 * ATENÇÃO ao que se escreve em "resultado": "90 dias", "12 h" e afins são
 * afirmações sobre o produto, e no Brasil afirmação de cosmético tem regra
 * (RDC da Anvisa). Fale de uso e de acabamento, não de eficácia clínica.
 */

export type Beneficios = {
  /** Nome curto pro rótulo do palco; o nome completo vem do catálogo. */
  nomeCurto: string
  produto: { titulo: string; texto: string }
  uso: { titulo: string; texto: string; passos: [string, string, string] }
  resultado: { numero: string; unidade: string; legenda: string; texto: string }
}

export const ALTA_PERFORMANCE: Record<string, Beneficios> = {
  "kit-completo-para-barba": {
    nomeCurto: "Kit Completo FuckingBarba",
    produto: {
      titulo: "A rotina inteira numa caixa só",
      texto:
        "Shampoo, óleo e balm juntos — você não precisa montar combinação nem descobrir sozinho a ordem certa.",
    },
    uso: {
      titulo: "3 passos · 2 minutos",
      texto:
        "No banho, shampoo. Barba ainda úmida, óleo. Pra fechar, balm modelando no sentido do fio.",
      passos: ["Lavar", "Nutrir", "Finalizar"],
    },
    resultado: {
      numero: "3",
      unidade: "em 1",
      legenda: "Rotina completa numa caixa",
      texto:
        "Barba macia, alinhada e com cheiro que dura — sem pesar e sem deixar aspecto oleoso.",
    },
  },

  "fator-de-crescimento-para-barba": {
    nomeCurto: "Fator de Crescimento FuckingBarba",
    produto: {
      titulo: "Uso diário, ativos concentrados",
      texto:
        "Loção leve que seca rápido, formulada pra quem busca uma barba de aspecto mais cheio e preenchido.",
    },
    uso: {
      titulo: "2x ao dia · 30 segundos",
      texto:
        "Manhã e noite, na pele limpa e seca. Espalhe nas falhas e massageie até secar. Não precisa enxaguar.",
      passos: ["Limpar", "Aplicar", "Massagear"],
    },
    resultado: {
      numero: "90",
      unidade: "dias",
      legenda: "Ciclo de uso recomendado",
      texto:
        "Constância é o que conta: o ciclo do fio é lento, e por isso o frasco é pensado pra acompanhar 90 dias de rotina.",
    },
  },

  "spray-modelador-matte-100ml-fucking-barba": {
    nomeCurto: "Spray Matte Modelador para Cabelo",
    produto: {
      titulo: "Textura sem o brilho de pomada",
      texto:
        "Fixação média com acabamento seco. Dá corpo e movimento sem deixar aquele aspecto engomado.",
    },
    uso: {
      titulo: "Cabelo seco · 20 cm",
      texto:
        "Borrife a 20 cm de distância, mecha por mecha, e modele com a mão. Quer mais firmeza? Uma segunda camada.",
      passos: ["Borrifar", "Modelar", "Ajustar"],
    },
    resultado: {
      numero: "12",
      unidade: "h",
      legenda: "Fixação que atravessa o dia",
      texto:
        "Efeito matte de verdade: segura o penteado, não craquela e sai no banho com água e shampoo.",
    },
  },
}

/** A ordem em que os produtos aparecem no palco. */
export const ORDEM_ALTA_PERFORMANCE = [
  "kit-completo-para-barba",
  "fator-de-crescimento-para-barba",
  "spray-modelador-matte-100ml-fucking-barba",
] as const
