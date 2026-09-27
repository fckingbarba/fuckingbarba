import type { Route } from "next"
import Link from "next/link"
import { Icone, type NomeDoIcone } from "@/components/icones"
import {
  PERIODOS_DO_CRM,
  type EtiquetaDaFicha,
  type FichaDoCrm,
  type PeriodoDoCrm,
  type TelaDaBase,
  type TelaDoCrm,
  type TipoDoCrm,
} from "@/lib/crm"

/**
 * A PRIMEIRA TELA DO CRM — o que a loja anotou de cada pessoa: os números do
 * período, o caminho em etapas (quantas vezes cada coisa, de quantos
 * navegadores) e as últimas anotações, com o e-mail mascarado. O desenho é o
 * das peças do painel: o número, o bloco, o ícone chanfrado da fila do Início.
 *
 * Na ficha do cliente (parte 3): as cinco etiquetas da pessoa e o caminho
 * dela — o site, os e-mails e as compras juntos. As abas (parte 4): o
 * Resumo e os Ajustes (`components/ajustes-do-crm.tsx`); e a Base da
 * Nuvemshop (parte 5): os números e quem é quem na loja antiga.
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

/** As abas do CRM: o Resumo (o que a loja anotou), os Ajustes e a Base da Nuvemshop. */
export function AbasDoCrm({
  atual,
}: {
  atual: "resumo" | "fluxos" | "ajustes" | "emails" | "base"
}) {
  return (
    <nav className="abas" aria-label="CRM">
      <Link href="/crm" aria-current={atual === "resumo" ? "page" : undefined} data-aba="resumo">
        Resumo
      </Link>
      <Link
        href={"/crm/fluxos" as Route}
        aria-current={atual === "fluxos" ? "page" : undefined}
        data-aba="fluxos"
      >
        Fluxos
      </Link>
      <Link
        href={"/crm/ajustes" as Route}
        aria-current={atual === "ajustes" ? "page" : undefined}
        data-aba="ajustes"
      >
        Ajustes
      </Link>
      <Link
        href={"/crm/emails" as Route}
        aria-current={atual === "emails" ? "page" : undefined}
        data-aba="emails"
      >
        E-mails
      </Link>
      <Link
        href={"/crm/base" as Route}
        aria-current={atual === "base" ? "page" : undefined}
        data-aba="base"
      >
        Base da Nuvemshop
      </Link>
    </nav>
  )
}

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

const porcento = (parte: number, todo: number) =>
  todo ? `${Math.round((parte / todo) * 100)}%` : "—"

/**
 * OS E-MAILS DA LOJA — o que os avisos do Resend contaram dos e-mails de
 * cliente que saíram no período: quantos chegaram, foram abertos, levaram
 * clique, não chegaram e viraram spam; o mesmo por tipo; e os últimos em
 * frase. Sem os avisos ligados, a frase diz o que falta.
 */
export function EmailsDoCrm({ emails }: { emails: TelaDoCrm["emails"] }) {
  const n = emails.numeros
  const sub = !emails.ligados
    ? "Os avisos do Resend ainda não estão ligados: sem eles, o CRM não sabe se os e-mails chegam, são abertos ou levam clique."
    : emails.ultimoAviso
      ? `Os e-mails de cliente que saíram no período, pelos avisos do Resend (o último chegou ${emails.ultimoAviso}).`
      : "Ligado. Esperando o primeiro aviso do Resend."
  return (
    <section className="bloco" aria-labelledby="crm-emails" data-emails-crm>
      <div className="bloco__cabeca">
        <div>
          <h2 className="bloco__titulo" id="crm-emails">
            Os e-mails da loja
          </h2>
          <p className="bloco__sub" data-emails-situacao>
            {sub}
          </p>
        </div>
      </div>
      {emails.ligados ? (
        <>
          <div className="numeros numeros--dentro numeros--emails" data-numeros-emails>
            <div className="numero numero--destaque">
              <p className="numero__rot">Saíram</p>
              <p className="numero__valor num" data-email="enviados">
                {inteiro.format(n.enviados)}
              </p>
              <p className="numero__sub">e-mails de cliente</p>
            </div>
            <div className="numero">
              <p className="numero__rot">Chegaram</p>
              <p className="numero__valor num" data-email="entregues">
                {inteiro.format(n.entregues)}
              </p>
              <p className="numero__sub">{porcento(n.entregues, n.enviados)} dos que saíram</p>
            </div>
            <div className="numero">
              <p className="numero__rot">Abertos</p>
              <p className="numero__valor num" data-email="abertos">
                {inteiro.format(n.abertos)}
              </p>
              <p className="numero__sub">{porcento(n.abertos, n.entregues)} dos que chegaram</p>
            </div>
            <div className="numero">
              <p className="numero__rot">Com clique</p>
              <p className="numero__valor num" data-email="clicados">
                {inteiro.format(n.clicados)}
              </p>
              <p className="numero__sub">{porcento(n.clicados, n.entregues)} dos que chegaram</p>
            </div>
            <div className="numero" data-ruim={n.naoChegaram ? "" : undefined}>
              <p className="numero__rot">Não chegaram</p>
              <p className="numero__valor num" data-email="naoChegaram">
                {inteiro.format(n.naoChegaram)}
              </p>
              <p className="numero__sub">endereço errado ou bloqueado</p>
            </div>
            <div className="numero" data-ruim={n.reclamacoes ? "" : undefined}>
              <p className="numero__rot">Spam</p>
              <p className="numero__valor num" data-email="reclamacoes">
                {inteiro.format(n.reclamacoes)}
              </p>
              <p className="numero__sub">marcaram como spam</p>
            </div>
          </div>
          {emails.porTipo.length ? (
            <div className="tabela-rola emails__tabela">
              <table className="tabela" data-emails-por-tipo>
                <thead>
                  <tr>
                    <th>E-mail</th>
                    <th className="direita">Saíram</th>
                    <th className="direita">Chegaram</th>
                    <th className="direita">Abertos</th>
                    <th className="direita">Com clique</th>
                  </tr>
                </thead>
                <tbody>
                  {emails.porTipo.map((t) => (
                    <tr key={t.tipo ?? "outro"} data-tipo-de-email={t.tipo ?? "outro"}>
                      <td className="tabela__num">{t.nome}</td>
                      <td className="direita num">{inteiro.format(t.enviados)}</td>
                      <td className="direita num">{inteiro.format(t.entregues)}</td>
                      <td className="direita num">
                        {inteiro.format(t.abertos)}
                        <span className="tabela__sub">{porcento(t.abertos, t.entregues)}</span>
                      </td>
                      <td className="direita num">
                        {inteiro.format(t.clicados)}
                        <span className="tabela__sub">{porcento(t.clicados, t.entregues)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {emails.ultimos.length ? (
            <ol className="anotacoes emails__ultimos" data-ultimos-emails>
              {emails.ultimos.map((a) => (
                <li key={a.id} className="anotacao" data-nivel={a.nivel ?? undefined}>
                  <span className="fila__ico">
                    <Icone nome="email" />
                  </span>
                  <p className="anotacao__txt">
                    <span className="anotacao__quem" data-anonimo={a.quem ? undefined : ""}>
                      {a.quem ?? "Sem endereço"}
                    </span>{" "}
                    {a.oque}
                  </p>
                  <time>{a.quando}</time>
                </li>
              ))}
            </ol>
          ) : (
            <p className="vazio">
              <b>Nenhum e-mail de cliente neste período</b>Os e-mails da equipe ficam de fora.
            </p>
          )}
        </>
      ) : null}
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

const ICONE_DA_ETIQUETA: Record<EtiquetaDaFicha["chave"], NomeDoIcone> = {
  etapa: "clientes",
  engajamento: "raio",
  tratamento: "produtos",
  proxima: "relogio",
  cupom: "cupons",
}

const ehTipoDoCrm = (tipo: string): tipo is TipoDoCrm => tipo in ICONE

/** O ícone de cada passo: o da anotação do site, o do e-mail ou o do pedido. */
const iconeDoPasso = (tipo: string): NomeDoIcone =>
  tipo === "email"
    ? "email"
    : tipo === "pedido"
      ? "pedidos"
      : ehTipoDoCrm(tipo)
        ? ICONE[tipo]
        : "olho"

/** "pôs o Óleo na sacola" → "Pôs o Óleo na sacola": na ficha, a frase começa a linha. */
const comMaiuscula = (t: string) => (t ? `${t[0].toUpperCase()}${t.slice(1)}` : t)

/**
 * AS ETIQUETAS DA PESSOA, na ficha do cliente — a etapa, o engajamento, o
 * dia do tratamento, a próxima compra e se ela é sensível a cupom, cada uma
 * com o porquê; e de onde ela chegou da primeira vez.
 */
export function EtiquetasDoCrm({ crm }: { crm: FichaDoCrm }) {
  return (
    <section className="bloco" data-etiquetas-crm>
      <h2 className="rotulo">Etiquetas do CRM</h2>
      <p className="pequeno suave" style={{ margin: 0 }} data-origem-crm>
        {crm.origem
          ? `De onde chegou: ${crm.origem}.`
          : "Ainda não visitou a loja com o sim dos cookies: de onde chegou, o CRM não sabe."}
      </p>
      <div className="etiquetas">
        {crm.etiquetas.map((e) => (
          <div
            key={e.chave}
            className="etiqueta"
            data-etiqueta={e.chave}
            data-tom={e.tom ?? undefined}
          >
            <span className="fila__ico">
              <Icone nome={ICONE_DA_ETIQUETA[e.chave]} />
            </span>
            <div>
              <p className="etiqueta__rot">{e.nome}</p>
              <p className="etiqueta__valor">{e.valor}</p>
              <p className="etiqueta__porque">{e.porque}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

/** O CAMINHO DA PESSOA, na ficha: o que ela fez no site, os e-mails da loja e as compras. */
export function CaminhoDaPessoa({ caminho }: { caminho: FichaDoCrm["caminho"] }) {
  return (
    <section className="bloco" data-caminho-crm>
      <h2 className="rotulo">O caminho</h2>
      {caminho.length ? (
        <ol className="anotacoes">
          {caminho.map((a) => (
            <li
              key={`${a.tipo}-${a.id}`}
              className="anotacao"
              data-tipo={a.tipo}
              data-nivel={a.nivel ?? undefined}
            >
              <span className="fila__ico">
                <Icone nome={iconeDoPasso(a.tipo)} />
              </span>
              <p className="anotacao__txt">{comMaiuscula(a.oque)}</p>
              <time>{a.quando}</time>
            </li>
          ))}
        </ol>
      ) : (
        <p className="vazio">
          <b>Nada ainda</b>O caminho junta o site (de quem aceitou os cookies), os e-mails da loja e
          as compras.
        </p>
      )}
    </section>
  )
}

const reaisSemCentavos = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
})

/** OS NÚMEROS DA BASE — o que entrou da loja antiga. */
export function NumerosDaBase({ numeros }: { numeros: TelaDaBase["numeros"] }) {
  const n = numeros
  const parte = n.pessoas ? Math.round((n.aceitam / n.pessoas) * 100) : 0
  return (
    <div className="numeros numeros--base" data-numeros-base>
      <div className="numero numero--destaque">
        <p className="numero__rot">Pessoas</p>
        <p className="numero__valor num" data-base="pessoas">
          {inteiro.format(n.pessoas)}
        </p>
        <p className="numero__sub">clientes da loja antiga</p>
      </div>
      <div className="numero">
        <p className="numero__rot">Aceitam ofertas</p>
        <p className="numero__valor num" data-base="aceitam">
          {inteiro.format(n.aceitam)}
        </p>
        <p className="numero__sub">{n.pessoas ? `${parte}% das pessoas` : "ninguém ainda"}</p>
      </div>
      <div className="numero">
        <p className="numero__rot">Pedidos pagos</p>
        <p className="numero__valor num" data-base="pagos">
          {inteiro.format(n.pagos)}
        </p>
        <p className="numero__sub">
          {n.primeiroPedido && n.ultimoPedido
            ? `de ${n.primeiroPedido} a ${n.ultimoPedido}`
            : "nenhum pedido ainda"}
        </p>
      </div>
      <div className="numero">
        <p className="numero__rot">Vendido</p>
        <p className="numero__valor num" data-base="vendido">
          {reaisSemCentavos.format(n.vendido)}
        </p>
        <p className="numero__sub">nos pedidos pagos</p>
      </div>
      <div className="numero">
        <p className="numero__rot">Carrinhos</p>
        <p className="numero__valor num" data-base="carrinhos">
          {inteiro.format(n.carrinhos)}
        </p>
        <p className="numero__sub">abandonados</p>
      </div>
    </div>
  )
}

/** Uma barra da base: o nome, quantos, e desses quantos aceitam ofertas. */
function BarraDaBase({
  nome,
  pessoas,
  aceitam,
  maior,
  dado,
}: {
  nome: string
  pessoas: number
  aceitam: number
  maior: number
  dado: string
}) {
  return (
    <li className="base-barra" data-linha-da-base={dado}>
      <p className="base-barra__nome">{nome}</p>
      <span className="base-barra__trilho" aria-hidden="true">
        <span
          style={{ width: `${maior && pessoas ? Math.max(2, (pessoas / maior) * 100) : 0}%` }}
        />
      </span>
      <p className="base-barra__n num">{inteiro.format(pessoas)}</p>
      <p className="base-barra__sub">
        {aceitam === pessoas && pessoas
          ? "todos aceitam ofertas"
          : `${inteiro.format(aceitam)} aceitam ofertas`}
      </p>
    </li>
  )
}

/**
 * QUEM É QUEM NA BASE — as etiquetas da base inteira, com os pedidos da loja
 * antiga e os da nova: quantos em cada etapa e em cada engajamento, e desses
 * quantos aceitam receber ofertas (os que os e-mails vão poder chamar).
 */
export function QuemEQuemNaBase({
  etapas,
  engajamento,
  importadoEm,
}: {
  etapas: TelaDaBase["etapas"]
  engajamento: TelaDaBase["engajamento"]
  importadoEm: string | null
}) {
  const maior = Math.max(0, ...etapas.map((e) => e.pessoas), ...engajamento.map((e) => e.pessoas))
  return (
    <section className="bloco" aria-labelledby="base-quem" data-quem-e-quem>
      <div className="bloco__cabeca">
        <div>
          <h2 className="bloco__titulo" id="base-quem">
            Quem é quem na base
          </h2>
          <p className="bloco__sub">
            As etiquetas de cada pessoa, com os pedidos da loja antiga e os da nova, e os Ajustes do
            CRM.{importadoEm ? ` A última importação foi ${importadoEm}.` : ""}
          </p>
        </div>
      </div>
      <div className="duas base-duas">
        <div>
          <p className="rotulo">Etapa</p>
          <ul className="base-barras">
            {etapas.map((e) => (
              <BarraDaBase key={e.etapa} dado={e.etapa} maior={maior} {...e} />
            ))}
          </ul>
        </div>
        <div>
          <p className="rotulo">Engajamento</p>
          <ul className="base-barras">
            {engajamento.map((e) => (
              <BarraDaBase key={e.valor} dado={e.valor} maior={maior} {...e} />
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
