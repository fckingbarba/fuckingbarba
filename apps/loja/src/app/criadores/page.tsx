import type { Metadata } from "next"
import Image from "next/image"
import { ID_ESTRELA } from "@/components/estrelas"
import { Raio } from "@/components/icones"
import { BotaoDoModelo } from "@/components/criadores/botao-do-modelo"
import { Calculadora } from "@/components/criadores/calculadora"
import { Camera } from "@/components/criadores/camera"
import { Inscricao } from "@/components/criadores/inscricao"
import { Matriz } from "@/components/criadores/matriz"
import { mesesPraPassarDoFixo, OFERTA, reais } from "@/lib/criadores-visivel"
import { listarProdutos, porHandle } from "@/lib/medusa"
import "@/estilos/telas/criadores.css"

/**
 * /criadores — A PÁGINA ESCONDIDA DOS CRIADORES: quem quer gravar os vídeos
 * dos anúncios da loja (20 criativos, pelo fixo ou pela comissão) se
 * inscreve aqui, e o painel decide (a área "Criadores").
 *
 * ESCONDIDA: fora do menu, do sitemap e do Google (o `Disallow` do robots e
 * o `noindex` daqui). O link vai por mensagem, pra quem a loja quer chamar —
 * o painel tem o botão de copiar.
 *
 * Não é página montável (o registro de `lib/secoes/` é da home e da PDP, que
 * o painel reordena): aqui as seções são fixas, na ordem do argumento — a
 * oferta, o que chega, o que a gente pede, como anda, as regras e a
 * inscrição. Os números da proposta moram em `OFERTA`
 * (`lib/criadores-visivel.ts`); os produtos, no Medusa.
 */

/** Os produtos do kit, na ordem da vitrine: o que chega na casa de quem grava. */
const DO_KIT = [
  "fator-de-crescimento-para-barba",
  "oleo-para-barba",
  "balm-para-barba",
  "shampoo-para-barba",
]

const TITULO = `Sua barba vale ${reais(OFERTA.fixo)}. Ou mais.`
const RESUMO = `Grave ${OFERTA.criativos} vídeos curtos com FuckingBarba e escolha como ganhar: ${reais(OFERTA.fixo)} no Pix ou ${OFERTA.porcento}% de cada venda, enquanto o vídeo vender.`

export async function generateMetadata(): Promise<Metadata> {
  const kit = porHandle(await listarProdutos()).get("kit-completo-para-barba")
  return {
    title: "Criadores",
    description: RESUMO,
    robots: { index: false, follow: false },
    // A prévia do link no WhatsApp e no direct: é por lá que a página anda.
    openGraph: {
      title: TITULO,
      description: RESUMO,
      ...(kit?.thumbnail ? { images: [{ url: kit.thumbnail }] } : {}),
    },
  }
}

export default async function Pagina() {
  const produtos = porHandle(await listarProdutos())
  const kit = DO_KIT.flatMap((h) => {
    const p = produtos.get(h)
    return p ? [p] : []
  })
  const foto = produtos.get("oleo-para-barba")?.thumbnail ?? null

  return (
    <main className="criadores" id="conteudo">
      <Heroi foto={foto} />
      <Propostas />
      <section className="criadores__secao criadores__kit criadores--faixa">
        <div className="criadores__wrap criadores__kit-grade">
          <div>
            <p className="criadores__rotulo">Nos dois modelos</p>
            <h2 className="criadores__h2">O kit chega na sua casa</h2>
            <p className="criadores__lead">
              Os produtos que vão aparecer nos vídeos. Depois de gravar, são seus.
            </p>
          </div>
          {kit.length ? (
            <ul className="criadores__produtos">
              {kit.map((p) => (
                <li key={p.id} className="criadores__produto">
                  {p.thumbnail ? (
                    <Image
                      src={p.thumbnail}
                      alt=""
                      width={320}
                      height={320}
                      sizes="(max-width: 620px) 45vw, 220px"
                    />
                  ) : (
                    <span className="criadores__produto-sem-foto" aria-hidden="true" />
                  )}
                  <p>{p.title}</p>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </section>
      <Criativos />
      <Passos />
      <Regras />
      <section
        className="criadores__secao criadores__inscricao criadores--branco criadores--faixa"
        id="inscricao"
      >
        <div className="criadores__wrap criadores__inscricao-grade">
          <div className="criadores__inscricao-intro">
            <p className="criadores__rotulo">Inscrição</p>
            <h2 className="criadores__h2">Bora gravar?</h2>
            <p className="criadores__lead">
              Preenche em 2 minutos. A gente olha seu perfil e responde em até{" "}
              {OFERTA.respostaDiasUteis} dias úteis, no WhatsApp.
            </p>
            <p className="criadores__privado">
              <Estrela />
              CPF, endereço e chave Pix só depois do sim, no contrato. Aqui é só pra gente te
              conhecer.
            </p>
          </div>
          <Inscricao />
        </div>
      </section>
      <Duvidas />
    </main>
  )
}

function Estrela() {
  return (
    <svg className="criadores__estrela" viewBox="0 0 24 24" aria-hidden="true">
      <use href={`#${ID_ESTRELA}`} />
    </svg>
  )
}

function Heroi({ foto }: { foto: string | null }) {
  return (
    <section className="criadores__heroi criadores--faixa" aria-labelledby="criadores-titulo">
      <div className="criadores__wrap criadores__heroi-grade">
        <div>
          <p className="criadores__selo">
            <Estrela />
            Programa de criadores
          </p>
          <h1 className="criadores__titulo" id="criadores-titulo">
            Sua barba vale {reais(OFERTA.fixo)}. <mark>Ou mais.</mark>
          </h1>
          <p className="criadores__lead criadores__heroi-lead">
            Grave {OFERTA.criativos} vídeos curtos usando FuckingBarba. Eles viram anúncio no
            Instagram e no TikTok, e você escolhe como ganhar:{" "}
            <strong>{reais(OFERTA.fixo)} no Pix</strong> ou{" "}
            <strong>{OFERTA.porcento}% de cada venda, enquanto o vídeo vender</strong>.
          </p>
          <div className="criadores__acoes">
            <a className="btn btn--preto" href="#inscricao">
              Quero gravar <Raio className="btn__bolt" />
            </a>
            <a className="btn btn--branco" href="#propostas">
              Ver as duas propostas
            </a>
          </div>
          <ul className="criadores__garantias">
            <li>
              <Estrela />
              Não precisa ter muitos seguidores
            </li>
            <li>
              <Estrela />
              Kit de produtos por nossa conta
            </li>
            <li>
              <Estrela />
              Resposta em até {OFERTA.respostaDiasUteis} dias úteis
            </li>
          </ul>
        </div>
        <Camera foto={foto} />
      </div>
    </section>
  )
}

function Propostas() {
  const metade = reais(OFERTA.fixo / 2)
  return (
    <section
      className="criadores__secao criadores--branco criadores--faixa"
      id="propostas"
      aria-labelledby="criadores-propostas"
    >
      <div className="criadores__wrap">
        <p className="criadores__rotulo">Duas propostas</p>
        <h2 className="criadores__h2" id="criadores-propostas">
          Escolhe como quer ganhar
        </h2>
        <p className="criadores__lead">
          Os {OFERTA.criativos} criativos são os mesmos nas duas. Muda só o jeito de receber.
        </p>
        <div className="criadores__ofertas">
          <article className="criadores__oferta" data-modelo="fixo">
            <div className="criadores__oferta-topo">
              <span className="criadores__oferta-tag">Fixo</span>
              <span className="criadores__oferta-sub">Garantido</span>
            </div>
            <p className="criadores__oferta-valor num">{reais(OFERTA.fixo)}</p>
            <p className="criadores__oferta-por">
              por {OFERTA.criativos} criativos.{" "}
              <strong>{reais(OFERTA.fixo / OFERTA.criativos)} cada.</strong>
            </p>
            <ul className="criadores__oferta-lista">
              <li>
                <Estrela />
                {metade} no Pix quando os {OFERTA.criativos / 2} primeiros forem aprovados
              </li>
              <li>
                <Estrela />
                {metade} quando os {OFERTA.criativos} estiverem aprovados
              </li>
              <li>
                <Estrela />
                Kit de produtos grátis, e ele fica com você
              </li>
              <li>
                <Estrela />
                Recebe igual, com o anúncio vendendo ou não
              </li>
            </ul>
            <BotaoDoModelo modelo="fixo">Quero o fixo</BotaoDoModelo>
          </article>
          <article className="criadores__oferta" data-modelo="comissao">
            <span className="criadores__adesivo">Pra quem confia no próprio vídeo</span>
            <div className="criadores__oferta-topo">
              <span className="criadores__oferta-tag">Comissão</span>
              <span className="criadores__oferta-sub">Sem prazo</span>
            </div>
            <p className="criadores__oferta-valor num">{OFERTA.porcento}%</p>
            <p className="criadores__oferta-por">de cada venda feita com o seu vídeo.</p>
            <ul className="criadores__oferta-lista">
              <li>
                <Estrela />
                Sem prazo: enquanto o anúncio com o seu vídeo vender, você recebe
              </li>
              <li>
                <Estrela />
                Relatório vídeo por vídeo e Pix todo mês, até o dia 10
              </li>
              <li>
                <Estrela />
                Kit de produtos grátis, e ele fica com você
              </li>
              <li>
                <Estrela />
                Vídeo que vende muito paga muito
              </li>
            </ul>
            <BotaoDoModelo modelo="comissao">Quero comissão</BotaoDoModelo>
          </article>
        </div>
        <Calculadora />
      </div>
    </section>
  )
}

const FORMATO = [
  ["Tela", "Vertical 9:16, 1080 × 1920"],
  ["Duração", `${OFERTA.segundos.min} a ${OFERTA.segundos.max} segundos`],
  ["Gancho", "Rosto e produto nos 3 primeiros segundos"],
  ["Luz", "De janela ou ring light, sem contraluz"],
  ["Voz", "Narrado de preferência, sem eco nem vento"],
  ["Música", "Nenhuma. A gente coloca no anúncio"],
  ["Entrega", `Os ${OFERTA.criativos} prontos, num link do Google Drive`],
  ["Prazo", `${OFERTA.prazoDias} dias depois que o kit chegar`],
] as const

function Criativos() {
  return (
    <section
      className="criadores__secao criadores--branco criadores--faixa"
      id="criativos"
      aria-labelledby="criadores-criativos"
    >
      <div className="criadores__wrap">
        <p className="criadores__rotulo">O que a gente precisa</p>
        <h2 className="criadores__h2" id="criadores-criativos">
          {OFERTA.criativos} criativos parece muito. Não é.
        </h2>
        <p className="criadores__lead">
          Você grava 5 vídeos e troca só o começo de cada um. 5 ideias × 4 ganchos ={" "}
          {OFERTA.criativos} criativos prontos pra anúncio.
        </p>
        <p className="criadores__destaque">
          <Estrela />
          <span>
            <strong>A gente dá preferência pra vídeo narrado:</strong> você falando do começo ao
            fim, mostrando o produto. É o tipo de vídeo que mais vende.
          </span>
        </p>
        <Matriz />
        <div className="criadores__formato">
          <h3 className="criadores__h3">O formato</h3>
          <dl className="criadores__specs">
            {FORMATO.map(([nome, valor]) => (
              <div key={nome}>
                <dt>{nome}</dt>
                <dd>{valor}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  )
}

const PASSOS = [
  { quando: "Hoje", nome: "Inscrição", texto: "Leva 2 minutos, aqui embaixo." },
  {
    quando: `Até ${OFERTA.respostaDiasUteis} dias úteis`,
    nome: "Resposta",
    texto: "A gente olha seu perfil e chama no WhatsApp.",
  },
  {
    quando: "Depois do sim",
    nome: "Contrato e kit",
    texto: "Contrato assinado pelo celular. Aí vêm endereço e Pix, e o kit sai pra sua casa.",
  },
  {
    quando: `${OFERTA.prazoDias} dias`,
    nome: "Gravação",
    texto: `Grava os ${OFERTA.criativos} e manda tudo num link do Google Drive.`,
  },
  {
    quando: "Até 5 dias úteis",
    nome: "Aprovação",
    texto: `Até ${OFERTA.ajustesPorVideo} ajustes por vídeo, sempre dizendo o motivo.`,
  },
  {
    quando: "Pix",
    nome: "Pagamento",
    texto: `Fixo: metade nos ${OFERTA.criativos / 2} primeiros, metade no fim. Comissão: relatório e Pix todo mês.`,
  },
]

function Passos() {
  return (
    <section
      className="criadores__secao criadores__passos criadores--faixa"
      id="como-funciona"
      aria-labelledby="criadores-passos"
    >
      <div className="criadores__wrap">
        <p className="criadores__rotulo">Da inscrição ao Pix</p>
        <h2 className="criadores__h2" id="criadores-passos">
          Como funciona
        </h2>
        <ol className="criadores__passos-lista">
          {PASSOS.map((p, i) => (
            <li key={p.nome} className="criadores__passo">
              <div className="criadores__passo-topo">
                <span className="criadores__passo-n">{i + 1}</span>
                <span className="criadores__passo-quando">{p.quando}</span>
              </div>
              <h3>{p.nome}</h3>
              <p>{p.texto}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

const REGRAS = [
  {
    titulo: "Na frente da câmera",
    itens: [
      "Nada de gravar sem camiseta.",
      "Roupa lisa: sem camisa de time, marca grande ou frase estampada.",
      "Rosto e barba à mostra: sem óculos escuros, sem boné cobrindo, sem filtro que mude a barba ou a pele.",
      "Nada de pose sensual, dancinha ou coreografia.",
      "Fundo arrumado, sem bebida, cigarro ou vape na cena.",
      "Só você e só produto FuckingBarba no vídeo.",
    ],
  },
  {
    titulo: "No que você fala",
    itens: [
      "Fala só do que você viu. Nada de prometer prazo ou resultado, tipo “cresce em 7 dias”.",
      "Não fala mal de outra marca pelo nome.",
    ],
  },
  {
    titulo: "No combinado",
    itens: [
      "Só pra maiores de 18 anos.",
      "Os vídeos rodam como anúncio da FuckingBarba. O uso de imagem fica escrito no contrato.",
    ],
  },
]

function Regras() {
  return (
    <section className="criadores__secao criadores--faixa" aria-labelledby="criadores-regras">
      <div className="criadores__wrap">
        <div className="criadores__regras">
          <div className="criadores__regras-corpo">
            <div>
              <h2 className="criadores__h2" id="criadores-regras">
                Regras do jogo
              </h2>
              <p className="criadores__lead">
                Quem assiste é homem de barba. O vídeo tem que parecer um amigo mostrando o que usa,
                não um ensaio de foto.
              </p>
            </div>
            <div className="criadores__regras-grupos">
              {REGRAS.map((g) => (
                <div key={g.titulo}>
                  <h3 className="criadores__regras-titulo">{g.titulo}</h3>
                  <ul className="criadores__regras-lista">
                    {g.itens.map((item) => (
                      <li key={item}>
                        <span className="criadores__alerta" aria-hidden="true">
                          !
                        </span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function Duvidas() {
  const duvidas = [
    {
      pergunta: "Preciso ter muitos seguidores?",
      resposta:
        "Não. O vídeo roda como anúncio da FuckingBarba, então quem aparece pro público é a gente. O que conta é o vídeo, não o tamanho do seu perfil.",
    },
    {
      pergunta: "Preciso postar no meu perfil?",
      resposta:
        "Não. Se você topar, dá pra rodar alguns como anúncio de parceria, saindo pelo seu perfil. Aí o seu perfil aparece pra muito mais gente.",
    },
    {
      pergunta: "Fixo ou comissão: qual compensa?",
      resposta: `O fixo é certo: ${reais(OFERTA.fixo)}, vendendo ou não. A comissão não tem prazo: são ${OFERTA.porcento}% de cada venda enquanto o vídeo vender. Com 30 vendas por mês, ela passa do fixo no ${mesesPraPassarDoFixo(30)}º mês, e depois continua pagando. Faz a conta na calculadora lá em cima.`,
    },
    {
      pergunta: "Como vocês contam as vendas da comissão?",
      resposta:
        "Cada vídeo vira um anúncio com link próprio. Todo pedido pago que chega por esse link conta pra você, pelo valor dos produtos, sem o frete. Pedido cancelado ou devolvido sai da conta. Todo mês você recebe o relatório vídeo por vídeo.",
    },
    {
      pergunta: "E se um vídeo não ficar bom?",
      resposta: `A gente pede até ${OFERTA.ajustesPorVideo} ajustes por vídeo, sempre dizendo o motivo. As ideias e os ganchos já estão aqui na página, então é raro precisar.`,
    },
    {
      pergunta: "Precisa ser narrado?",
      resposta:
        "Não é obrigatório, mas a gente dá preferência: vídeo narrado é o que mais vende. Se um ou outro sair só com legenda, tudo bem.",
    },
    {
      pergunta: "Quando vocês pedem CPF, endereço e Pix?",
      resposta:
        "Só depois do sim, no contrato. O endereço é pra mandar o kit; CPF e chave Pix, pra pagar.",
    },
    {
      pergunta: "Posso mostrar outra marca no vídeo?",
      resposta: `Nesses ${OFERTA.criativos}, só produto FuckingBarba aparece. Fora deles, você grava o que quiser.`,
    },
  ]
  return (
    <section className="criadores__secao criadores--faixa" aria-labelledby="criadores-duvidas">
      <div className="criadores__wrap criadores__duvidas-grade">
        <div>
          <p className="criadores__rotulo">Antes de se inscrever</p>
          <h2 className="criadores__h2" id="criadores-duvidas">
            Dúvidas
          </h2>
        </div>
        <div className="criadores__duvidas">
          {duvidas.map((d) => (
            <details key={d.pergunta}>
              <summary>{d.pergunta}</summary>
              <p>{d.resposta}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}
