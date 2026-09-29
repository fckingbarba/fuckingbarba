import Link from "next/link"
import type { Route } from "next"
import type { CampanhaNaTela, ResultadoDaCampanha, TelaDasCampanhas } from "@/lib/crm"

/**
 * AS CAMPANHAS DO CRM NA TELA (entrega 0206) — a lista e o resultado de cada
 * uma que saiu. O formulário (escrever, ver como fica, mandar pra mim,
 * agendar) é o `formulario-da-campanha.tsx`, que roda no navegador.
 */

const inteiro = new Intl.NumberFormat("pt-BR")
const reais = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
const porCento = (parte: number, todo: number) => (todo ? Math.round((parte / todo) * 100) : 0)
const HORA_DE_BRASILIA = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
})
/** "27/11, 08:00" — em Brasília. */
export const quando = (iso: string) => HORA_DE_BRASILIA.format(new Date(iso))

/** A situação em palavras, com a hora quando tem. */
export function situacaoEmTexto(c: CampanhaNaTela): string {
  if (c.situacao === "agendada" && c.agenda) return `Agendada pra ${quando(c.agenda)}`
  if (c.situacao === "enviando") return "Saindo agora"
  if (c.situacao === "enviada" && c.comecouEm) return `Saiu em ${quando(c.comecouEm)}`
  if (c.situacao === "parada") return "Parada no meio"
  return "Rascunho"
}

export function ListaDasCampanhas({ tela }: { tela: TelaDasCampanhas }) {
  if (!tela.campanhas.length)
    return (
      <section className="bloco campanhas-vazio" data-campanhas-vazio>
        <p className="bloco__titulo">Nenhuma campanha ainda</p>
        <p className="bloco__sub">
          Uma campanha é um e-mail de data: a Black Friday, o Natal, um lançamento. Você escreve,
          escolhe pra quem e quando, e a loja manda aos poucos.
        </p>
      </section>
    )
  return (
    <ul className="campanhas" data-campanhas>
      {tela.campanhas.map((c) => {
        const r = c.resultado
        const pessoas = r ? r.variantes.reduce((s, v) => s + v.pessoas, 0) : 0
        const compraram = r ? r.variantes.reduce((s, v) => s + v.compraram, 0) : 0
        const vendido = r ? r.variantes.reduce((s, v) => s + v.vendido, 0) : 0
        return (
          <li key={c.id} className="campanha" data-campanha={c.id} data-situacao={c.situacao}>
            <div className="campanha__topo">
              <span className="campanha__situacao" data-situacao-da-campanha>
                {situacaoEmTexto(c)}
              </span>
              <span className="campanha__publico">{c.nomeDoPublico}</span>
            </div>
            <p className="campanha__nome">
              <Link href={`/crm/campanhas/${c.id}` as Route}>{c.texto.nome}</Link>
            </p>
            <p className="campanha__assunto">
              “{c.texto.assunto}”
              {c.texto.assuntoB ? <span> · teste com “{c.texto.assuntoB}”</span> : null}
            </p>
            {r ? (
              <p className="campanha__numeros" data-numeros-da-campanha>
                {inteiro.format(pessoas)} receberam · {inteiro.format(compraram)} compraram (
                {porCento(compraram, pessoas)}%) · {reais.format(vendido)}
              </p>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

/** O RESULTADO: por assunto, quem recebeu, comprou em 7 dias e quanto; e o controle. */
export function ResultadoDaCampanhaNaTela({ r }: { r: ResultadoDaCampanha }) {
  const total = r.variantes.reduce((s, v) => s + v.pessoas, 0)
  const comTeste = r.variantes.length > 1
  return (
    <section className="bloco" aria-labelledby="campanha-resultado" data-resultado-da-campanha>
      <div className="bloco__cabeca">
        <div>
          <h2 className="bloco__titulo" id="campanha-resultado">
            O resultado
          </h2>
          <p className="bloco__sub">
            Quem comprou em até 7 dias depois de receber. O controle são os 5% que não receberam: a
            diferença é o que a campanha vendeu a mais.
          </p>
        </div>
      </div>
      {r.variantes.map((v) => (
        <div key={v.variante} className="campanha-variante" data-variante={v.variante}>
          {comTeste ? (
            <p className="campanha-variante__nome">
              Assunto {v.variante.toUpperCase()}: “{v.assunto}”
              {r.vendeuMais === v.variante ? (
                <span className="campanha-variante__venceu" data-vendeu-mais>
                  vendeu mais
                </span>
              ) : null}
            </p>
          ) : null}
          <div className="numeros numeros--campanha">
            <div className="numero">
              <p className="numero__rot">Receberam</p>
              <p className="numero__valor num" data-numero="pessoas">
                {inteiro.format(v.pessoas)}
              </p>
            </div>
            <div className="numero numero--destaque">
              <p className="numero__rot">Compraram</p>
              <p className="numero__valor num" data-numero="compraram">
                {inteiro.format(v.compraram)}
              </p>
              <p className="numero__sub">
                {v.pessoas ? `${porCento(v.compraram, v.pessoas)}% em até 7 dias` : "em até 7 dias"}
              </p>
            </div>
            <div className="numero">
              <p className="numero__rot">Vendido</p>
              <p className="numero__valor num" data-numero="vendido">
                {reais.format(v.vendido)}
              </p>
              <p className="numero__sub">o 1º pedido de cada um</p>
            </div>
          </div>
        </div>
      ))}
      <div className="numeros numeros--campanha">
        <div className="numero numero--controle">
          <p className="numero__rot">Sem e-mail (o controle)</p>
          <p className="numero__valor num" data-numero="controle">
            {r.controle.pessoas ? `${porCento(r.controle.compraram, r.controle.pessoas)}%` : "—"}
          </p>
          <p className="numero__sub">
            {r.controle.pessoas
              ? `${inteiro.format(r.controle.compraram)} de ${inteiro.format(r.controle.pessoas)} compraram`
              : "o controle ainda está vazio"}
          </p>
        </div>
      </div>
      {comTeste && total < 400 ? (
        <p className="pequeno suave" data-pouca-gente>
          Com pouca gente, a diferença entre os assuntos pode ser sorte: vale olhar de novo nas
          próximas campanhas.
        </p>
      ) : null}
    </section>
  )
}

/** AS REGRAS das campanhas, embaixo da lista e do formulário. */
export function RegrasDasCampanhas() {
  return (
    <section className="bloco" aria-labelledby="campanhas-regras" data-regras-das-campanhas>
      <h2 className="bloco__titulo" id="campanhas-regras">
        As regras
      </h2>
      <ul className="modelo-emails__regras">
        <li>
          Só vai pra quem aceita ofertas: quem assinou a newsletter, quem aceitou na Nuvemshop, e
          quem comprou, criou conta ou deixou o e-mail no checkout (esses já vêm com o sim, e saem
          quando quiserem).
        </li>
        <li>
          Não vai pra quem saiu da lista, pra quem marcou como spam, pro e-mail que voltou, pra
          equipe e pra quem não respondeu ao “Posso continuar te escrevendo?”.
        </li>
        <li>Sem cupom: o preço da loja faz o papel (na Black Friday, o modo Black).</li>
        <li>Sai aos poucos, uns 100 a cada 5 minutos. De madrugada (22h às 8h), espera as 8h.</li>
        <li>
          Uma campanha por vez: a segunda espera a primeira acabar. Passadas 24 horas do começo, o
          envio acaba.
        </li>
        <li>
          No máximo 3 e-mails do CRM em um dia e 6 numa semana, por pessoa: quem passou recebe mais
          tarde, se der tempo.
        </li>
        <li>5% não recebem: é o grupo de controle, pra saber o que a campanha vende a mais.</li>
        <li>
          Com outro assunto, metade recebe cada um, por sorteio. A tela mostra qual vendeu mais em 7
          dias; quem escolhe o da próxima é você.
        </li>
      </ul>
    </section>
  )
}
