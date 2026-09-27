import type { Route } from "next"
import Link from "next/link"
import { Icone, type NomeDoIcone } from "@/components/icones"
import { PERIODOS_DO_CRM, type PeriodoDoCrm, type TelaDoCrm, type TipoDoCrm } from "@/lib/crm"

/**
 * A PRIMEIRA TELA DO CRM — o que a loja anotou de cada pessoa: os números do
 * período, o caminho em etapas (quantas vezes cada coisa, de quantos
 * navegadores) e as últimas anotações, com o e-mail mascarado. O desenho é o
 * das peças do painel: o número, o bloco, o ícone chanfrado da fila do Início.
 */

const ICONE: Record<TipoDoCrm, NomeDoIcone> = {
  visita: "inicio",
  produto_visto: "olho",
  sacola_entrou: "carrinho",
  sacola_saiu: "fechar",
  checkout_comecou: "seta",
  contato_informado: "email",
  entrega_escolhida: "caminhao",
  pagamento_escolhido: "cartao",
  pix_copiado: "pix",
  newsletter: "enviar",
  conta_entrou: "clientes",
}

/** As etapas do caminho da pessoa na loja, com os tipos de cada uma. */
const ETAPAS: { nome: string; tipos: TipoDoCrm[] }[] = [
  { nome: "Chegou", tipos: ["visita"] },
  { nome: "Olhou", tipos: ["produto_visto"] },
  { nome: "Sacola", tipos: ["sacola_entrou", "sacola_saiu"] },
  {
    nome: "Checkout",
    tipos: [
      "checkout_comecou",
      "contato_informado",
      "entrega_escolhida",
      "pagamento_escolhido",
      "pix_copiado",
    ],
  },
  { nome: "Newsletter e conta", tipos: ["newsletter", "conta_entrou"] },
]

const inteiro = new Intl.NumberFormat("pt-BR")
const navegadores = (n: number) => `${inteiro.format(n)} ${n === 1 ? "navegador" : "navegadores"}`

export function PeriodosDoCrm({ atual }: { atual: PeriodoDoCrm }) {
  return (
    <nav className="filtros" aria-label="Período">
      {PERIODOS_DO_CRM.map(([p, nome]) => (
        <Link
          key={p}
          className="filtro"
          href={(p === "7d" ? "/crm" : `/crm?periodo=${p}`) as Route}
          aria-current={p === atual ? "page" : undefined}
          data-periodo={p}
        >
          {nome}
        </Link>
      ))}
    </nav>
  )
}

export function NumerosDoCrm({ numeros }: { numeros: TelaDoCrm["numeros"] }) {
  const { visitantes, identificados, pessoas, anotacoes } = numeros
  const parte = visitantes ? Math.round((identificados / visitantes) * 100) : 0
  return (
    <div className="numeros" data-numeros-crm>
      <div className="numero numero--destaque">
        <p className="numero__rot">Visitantes</p>
        <p className="numero__valor num" data-numero="visitantes">
          {inteiro.format(visitantes)}
        </p>
        <p className="numero__sub">navegadores que aceitaram os cookies</p>
      </div>
      <div className="numero">
        <p className="numero__rot">Com e-mail</p>
        <p className="numero__valor num" data-numero="identificados">
          {inteiro.format(identificados)}
        </p>
        <p className="numero__sub">{visitantes ? `${parte}% dos visitantes` : "ninguém ainda"}</p>
      </div>
      <div className="numero">
        <p className="numero__rot">Pessoas</p>
        <p className="numero__valor num" data-numero="pessoas">
          {inteiro.format(pessoas)}
        </p>
        <p className="numero__sub">e-mails diferentes</p>
      </div>
      <div className="numero">
        <p className="numero__rot">Anotações</p>
        <p className="numero__valor num" data-numero="anotacoes">
          {inteiro.format(anotacoes)}
        </p>
        <p className="numero__sub">tudo o que a loja anotou</p>
      </div>
    </div>
  )
}

export function CaminhoDoCrm({ tipos }: { tipos: TelaDoCrm["tipos"] }) {
  const porTipo = new Map(tipos.map((t) => [t.tipo, t]))
  return (
    <section className="bloco" aria-labelledby="crm-caminho">
      <div className="bloco__cabeca">
        <div>
          <h2 className="bloco__titulo" id="crm-caminho">
            O caminho na loja
          </h2>
          <p className="bloco__sub">
            Quantas vezes cada coisa aconteceu, e de quantos navegadores.
          </p>
        </div>
      </div>
      <ol className="trilha">
        {ETAPAS.map((etapa) => (
          <li key={etapa.nome} className="trilha__etapa">
            <p className="trilha__nome">{etapa.nome}</p>
            <ul className="trilha__lista">
              {etapa.tipos.map((tipo) => {
                const t = porTipo.get(tipo)
                const vezes = t?.vezes ?? 0
                return (
                  <li
                    key={tipo}
                    className="trilha__item"
                    data-tipo={tipo}
                    data-zero={vezes ? undefined : ""}
                  >
                    <span className="fila__ico">
                      <Icone nome={ICONE[tipo]} />
                    </span>
                    <div>
                      <p className="trilha__n num">{inteiro.format(vezes)}</p>
                      <p className="trilha__txt">{t?.nome ?? tipo}</p>
                      {vezes ? (
                        <p className="trilha__sub">{navegadores(t?.visitantes ?? 0)}</p>
                      ) : null}
                    </div>
                  </li>
                )
              })}
            </ul>
          </li>
        ))}
      </ol>
    </section>
  )
}

export function UltimasDoCrm({ ultimos }: { ultimos: TelaDoCrm["ultimos"] }) {
  return (
    <section className="bloco" aria-labelledby="crm-ultimas" data-ultimas-crm>
      <div className="bloco__cabeca">
        <div>
          <h2 className="bloco__titulo" id="crm-ultimas">
            As últimas anotações
          </h2>
          <p className="bloco__sub">
            O e-mail aparece mascarado; sem e-mail, a pessoa ainda não disse quem é.
          </p>
        </div>
      </div>
      {ultimos.length ? (
        <ol className="anotacoes">
          {ultimos.map((a) => (
            <li key={a.id} className="anotacao" data-tipo={a.tipo}>
              <span className="fila__ico">
                <Icone nome={ICONE[a.tipo]} />
              </span>
              <p className="anotacao__txt">
                <span className="anotacao__quem" data-anonimo={a.quem ? undefined : ""}>
                  {a.quem ?? "Anônimo"}
                </span>{" "}
                {a.oque}
              </p>
              <time>{a.quando}</time>
            </li>
          ))}
        </ol>
      ) : (
        <p className="vazio">
          <b>Nada anotado neste período</b>A loja só anota quem aceitou os cookies.
        </p>
      )}
    </section>
  )
}
