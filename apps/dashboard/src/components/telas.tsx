import type { Route } from "next"
import Link from "next/link"
import type { ReactNode } from "react"
import { Icone } from "@/components/icones"
import { DONOS_DA_AREA, type Area } from "@/lib/equipe"

/**
 * AS PEÇAS DE TODA TELA — a cabeça (título, frase, ações), o "sem acesso",
 * o "em breve" e a loja fora do ar. Os desenhos são os do protótipo.
 */

export function Cabeca({
  titulo,
  sub,
  acoes,
  voltar,
}: {
  titulo: string
  sub?: ReactNode
  acoes?: ReactNode
  voltar?: { href: Route; texto: string }
}) {
  return (
    <>
      {voltar ? (
        <Link className="voltar" href={voltar.href}>
          <Icone nome="esquerda" />
          {voltar.texto}
        </Link>
      ) : null}
      <div className="cabeca">
        <div>
          <h1>{titulo}</h1>
          {sub ? <p className="cabeca__sub">{sub}</p> : null}
        </div>
        {acoes ? <div className="cabeca__acoes">{acoes}</div> : null}
      </div>
    </>
  )
}

/**
 * Pra quem abriu na mão o endereço de uma área que o papel não abre. É só
 * a tela: os dados dela nem saem do Medusa (ele responde 403 a esse papel).
 */
export function SemAcesso({ area }: { area: Area }) {
  const quem = DONOS_DA_AREA[area] ?? "Esta área é de outro papel."
  return (
    <div className="sem-acesso" data-tela>
      <div className="bloco">
        <span className="fila__ico">
          <Icone nome="cadeado" />
        </span>
        <h1>Essa área não é do seu papel</h1>
        <p>
          {quem} Se você precisa, peça pro dono mudar o seu acesso, em Configurações → Equipe e
          acessos.
        </p>
        <Link className="btn btn--menor" href="/" style={{ marginTop: 8 }}>
          Voltar pro início
        </Link>
      </div>
    </div>
  )
}

/** O que cada área vai fazer, e em que fase chega — a ordem do ESTADO.md, 4.5. */
const O_QUE_VEM: Partial<Record<Area, { titulo: string; fase: number; itens: string[] }>> = {
  pedidos: {
    titulo: "Pedidos",
    fase: 2,
    itens: [
      "A lista, com o que falta despachar no alto e o que precisa de você.",
      "O pedido inteiro: pagamento, nota no Bling, envio e rastreio, no caminho de seis passos.",
      "Despachar, conferir a nota e reenviar o e-mail do pedido.",
    ],
  },
  produtos: {
    titulo: "Produtos",
    fase: 3,
    itens: [
      "Fotos e vídeos da página, na ordem que a página mostra.",
      "Os textos e as seções — com imagem de fundo pro computador e pro celular.",
      "A caixa de compra: “Quantas unidades” ou “Leve junto”, uma ou outra.",
    ],
  },
  home: {
    titulo: "Layout da home",
    fase: 4,
    itens: [
      "As seções da home: ligar, desligar, pôr em ordem e mudar os textos.",
      "O banner com vários slides, cada um com a imagem do computador e a do celular.",
      "Rascunho e “Publicar”: nada muda na loja antes de você mandar.",
    ],
  },
  carrinhos: {
    titulo: "Carrinhos abandonados",
    fase: 5,
    itens: [
      "Quem deixou a sacola, com o quê e quanto.",
      "Os 5 e-mails que chamam a pessoa de volta — com os textos editáveis.",
      "O que voltou em venda.",
    ],
  },
  cupons: {
    titulo: "Cupons e descontos",
    fase: 6,
    itens: ["Criar, pausar e acompanhar os cupons.", "O desconto por quantidade de cada produto."],
  },
  clientes: {
    titulo: "Clientes",
    fase: 6,
    itens: ["Quem comprou, quanto e quando.", "A newsletter, pra baixar a lista."],
  },
  observabilidade: {
    titulo: "Observabilidade",
    fase: 7,
    itens: [
      "Os erros da loja num lugar só, com o estado de cada um: aberto ou resolvido.",
      "As rotinas (pagamento, nota, estoque, envio): quando rodaram e se deram certo.",
    ],
  },
}

export function EmBreve({ area }: { area: Area }) {
  const vem = O_QUE_VEM[area]
  if (!vem) return null
  return (
    <div data-tela>
      <Cabeca titulo={vem.titulo} />
      <section className="bloco em-breve">
        <p className="em-breve__fase">Chega na fase {vem.fase}</p>
        <h2 className="bloco__titulo">O que vai ter aqui</h2>
        <ul>
          {vem.itens.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      </section>
    </div>
  )
}

/** O Medusa não respondeu: não é motivo pra tirar ninguém do painel. */
export function ForaDoAr() {
  return (
    <div className="fora" data-tela>
      <div className="bloco">
        <span className="fila__ico">
          <Icone nome="alerta" />
        </span>
        <h1>Não consegui falar com a loja</h1>
        <p>O servidor da loja não respondeu agora. Tenta de novo em instantes.</p>
        {/* Link cheio, e não o `Link`: recarrega de verdade, e a casca pergunta de novo. */}
        <a className="btn btn--menor" href="">
          Tentar de novo
        </a>
      </div>
    </div>
  )
}
