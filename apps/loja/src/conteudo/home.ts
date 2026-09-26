import type { ConteudoDaHome } from "@/lib/home"

/**
 * A HOME DE FÁBRICA — o texto que a loja mostrava quando a home saiu do
 * código (24/09).
 *
 * QUEM MANDA AGORA É O PAINEL ("Layout da home"): o que ele publica chega
 * pelo Medusa (`home()`, em `lib/medusa.ts`), e o texto de fábrica de
 * verdade mora no backend (`SEMENTE_DA_HOME`, em
 * `apps/backend/src/lib/home.ts`) — é ele que a loja recebe enquanto
 * ninguém publicou nada.
 *
 * ESTE ARQUIVO É A RESERVA, pra dois casos: um Medusa de antes da rota
 * `/store/home` (o push sobe o Railway e a Vercel juntos, e o build da loja
 * pode chegar antes), e uma seção que chegue quebrada — ela vira a daqui,
 * em vez de um buraco. Mudar um texto AQUI não muda o site: mude no painel.
 *
 * ┌─ AFIRMAÇÕES: CONFERIR ANTES DE IR PRO AR ─────────────────────────────┐
 * │ "Aprovado em estudo interno" e "+1.000.000 clientes satisfeitos" são  │
 * │ afirmações, não slogan. A primeira é sobre o produto, e cosmético no  │
 * │ Brasil tem regra pra isso (RDC da Anvisa): se o estudo existe, ótimo; │
 * │ se não existe, a frase sai. O ano de fundação e o "+1M clientes       │
 * │ impactados" são sobre o negócio — o tipo de coisa que um concorrente  │
 * │ aponta e que o consumidor cobra. O painel mostra o aviso em cada um.  │
 * │                                                                       │
 * │ No "resultado" do palco, "90 dias", "12 h" e afins também são         │
 * │ afirmações sobre o produto: fale de uso e de acabamento, não de       │
 * │ eficácia clínica.                                                     │
 * └───────────────────────────────────────────────────────────────────────┘
 */
export const HOME_DE_FABRICA: ConteudoDaHome = {
  /*
    A esteira amarela do topo, a de antes do painel: o aviso do frete
    (quando há promoção) e a segurança. Por que "Barba na cara ou sua grana
    de volta" e os 7 dias de arrependimento saíram dela: no
    `components/layout/anuncio.tsx`.
  */
  anuncio: { frete: true, avisos: ["Compra 100% segura"] },
  /*
    O banner é SÓ ARTE (decidido em 24/09): a imagem com o texto dentro,
    subida no painel. De fábrica não há arte — então não há banner, e a
    home começa na barra de vantagens até alguém publicar a primeira.
  */
  banner: { slides: [], tempo: 7 },
  trustbar: {
    vantagens: [
      { titulo: "Loja Segura", detalhe: "Para suas compras" },
      { titulo: "Compra Garantida", detalhe: "Satisfação garantida" },
    ],
  },
  ofertas: { titulo: "Ofertas Relâmpago" },
  colecao: { titulo: "Alta Performance: Barba e Cabelo" },
  /* O bloco escuro do meio — o único que carrega o <h1> da página. */
  hero: {
    chapeu: "Alta Performance",
    titulo: "Fórmulas de alta performance, resultado que você sente.",
    comparativo: [
      { rotulo: "Ativos", valor: "Alta concentração" },
      { rotulo: "Testado", valor: "Aprovado em estudo interno" },
    ],
    chamada: "Ver produtos",
    garantias: ["+1.000.000 clientes satisfeitos", "Loja oficial da marca", "Cosméticos premium"],
    aviso: "*Resultados podem variar conforme uso individual.",
  },
  altaPerformance: {
    produtos: [
      {
        produto: "kit-completo-para-barba",
        nomeCurto: "Kit Completo FuckingBarba",
        titulo: "A rotina inteira numa caixa só",
        texto:
          "Shampoo, óleo e balm juntos — você não precisa montar combinação nem descobrir sozinho a ordem certa.",
        usoTitulo: "3 passos · 2 minutos",
        usoTexto:
          "No banho, shampoo. Barba ainda úmida, óleo. Pra fechar, balm modelando no sentido do fio.",
        passos: ["Lavar", "Nutrir", "Finalizar"],
        numero: "3",
        unidade: "em 1",
        legenda: "Rotina completa numa caixa",
        resultado:
          "Barba macia, alinhada e com cheiro que dura — sem pesar e sem deixar aspecto oleoso.",
      },
      {
        produto: "fator-de-crescimento-para-barba",
        nomeCurto: "Fator de Crescimento FuckingBarba",
        titulo: "Uso diário, ativos concentrados",
        texto:
          "Loção leve que seca rápido, formulada pra quem busca uma barba de aspecto mais cheio e preenchido.",
        usoTitulo: "2x ao dia · 30 segundos",
        usoTexto:
          "Manhã e noite, na pele limpa e seca. Espalhe nas falhas e massageie até secar. Não precisa enxaguar.",
        passos: ["Limpar", "Aplicar", "Massagear"],
        numero: "90",
        unidade: "dias",
        legenda: "Ciclo de uso recomendado",
        resultado:
          "Constância é o que conta: o ciclo do fio é lento, e por isso o frasco é pensado pra acompanhar 90 dias de rotina.",
      },
      {
        produto: "spray-modelador-matte-100ml-fucking-barba",
        nomeCurto: "Spray Matte Modelador para Cabelo",
        titulo: "Textura sem o brilho de pomada",
        texto:
          "Fixação média com acabamento seco. Dá corpo e movimento sem deixar aquele aspecto engomado.",
        usoTitulo: "Cabelo seco · 20 cm",
        usoTexto:
          "Borrife a 20 cm de distância, mecha por mecha, e modele com a mão. Quer mais firmeza? Uma segunda camada.",
        passos: ["Borrifar", "Modelar", "Ajustar"],
        numero: "12",
        unidade: "h",
        legenda: "Fixação que atravessa o dia",
        resultado:
          "Efeito matte de verdade: segura o penteado, não craquela e sai no banho com água e shampoo.",
      },
    ],
  },
  provas: {
    tag: "Resultados reais",
    titulo: "Antes e depois de quem levou a rotina a sério",
  },
  amam: { titulo: "Nossos clientes nos amam" },
  vitrine: { titulo: "Todos os produtos" },
  sobre: {
    titulo: "O cuidado que impõe presença",
    paragrafos: [
      "A FuckingBarba nasceu da revolta com produtos genéricos e marcas que tratam o cuidado pessoal como detalhe. Aqui, cuidar de si é ritual: presença, identidade e respeito com quem você é.",
      "Fórmulas de alta performance e ingredientes de qualidade, pra quem sabe que a aparência fala antes mesmo de você abrir a boca.",
    ],
    grito: "Somos mais do que cosméticos. Somos atitude.",
    numeros: [
      { valor: "2016", rotulo: "Ano de fundação" },
      { valor: "+1M", rotulo: "Clientes impactados" },
      { valor: "BR", rotulo: "Presença nacional" },
    ],
    fotoDe: "oleo-para-barba",
  },
  fechamento: {
    chapeu: "Última chamada",
    titulo: "Cosméticos premium pra elevar sua presença — da barba ao cabelo.",
    chamada: "Ver todos os produtos",
    fotoDe: "kit-completo-para-barba",
  },
}
