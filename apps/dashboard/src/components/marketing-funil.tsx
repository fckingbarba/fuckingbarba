import { Icone } from "@/components/icones"
import { Achados, SEM_VISITAS } from "@/components/marketing"
import { lerFunil, type Aparelho, type Passo, type Periodo } from "@/lib/marketing"

/**
 * O FUNIL DO MARKETING — onde as pessoas desistem: do site até o pagamento
 * (o Google Analytics, só de quem aceitou os cookies), da sacola ao
 * pagamento (os carrinhos da loja: todo mundo) e o celular contra o
 * computador. Os desenhos são os do protótipo; os dados, do
 * `GET /dashboard/marketing/funil`.
 */

const INTEIRO = new Intl.NumberFormat("pt-BR")
const porcento = (v: number, casas = 0) => `${v.toFixed(casas).replace(".", ",")}%`

/** Os passos, a barra de cada um (do tamanho do maior) e quanto passou do anterior. */
function ListaDoFunil({ passos, dados }: { passos: Passo[]; dados: string }) {
  const maior = Math.max(1, ...passos.map((p) => p.n))
  return (
    <ol className="funil" data-funil={dados}>
      {passos.map((p, i) => (
        <li className="funil__passo" key={p.nome} data-pior={p.pior ? "" : undefined}>
          <div className="funil__topo">
            <span className="funil__nome">{p.nome}</span>
            <b className="funil__n num">{INTEIRO.format(p.n)}</b>
          </div>
          <span className="trilho">
            <i
              style={{ width: `${p.n ? Math.max(1, (p.n / maior) * 100).toFixed(1) : 0}%` }}
              data-cor={p.pior ? "erro" : undefined}
            />
          </span>
          {i > 0 ? (
            <p className="funil__taxa">
              {p.taxa === null
                ? "nenhum no passo anterior"
                : `${porcento(p.taxa)} do passo anterior`}
              {p.pior && p.taxa !== null ? (
                <>
                  {" · "}
                  <b>a maior perda: {porcento(100 - p.taxa)} saem aqui</b>
                </>
              ) : null}
            </p>
          ) : null}
        </li>
      ))}
    </ol>
  )
}

function Aparelhos({ aparelhos }: { aparelhos: Aparelho[] }) {
  return (
    <div className="aparelhos">
      {aparelhos.map((a) => (
        <div className="aparelho" key={a.nome} data-aparelho={a.nome}>
          <p className="aparelho__nome">
            <Icone nome={a.nome === "Celular" ? "celular" : "tela"} />
            {a.nome}
          </p>
          <p className="aparelho__n">
            <b>{porcento(a.parte)}</b> das visitas
          </p>
          <span className="trilho">
            <i style={{ width: `${a.parte}%` }} />
          </span>
          <p className="aparelho__n">
            <b>{a.conversao === null ? "—" : porcento(a.conversao, 2)}</b> compram
          </p>
        </div>
      ))}
    </div>
  )
}

export async function TelaDoFunil({ periodo }: { periodo: Periodo }) {
  const f = await lerFunil(periodo)
  if (!f)
    return (
      <p className="sem-dados">Não consegui falar com a loja agora. Recarregue daqui a pouco.</p>
    )
  return (
    <>
      <Achados achados={f.achados} />
      <section className="bloco" data-bloco="site">
        <div className="bloco__cabeca">
          <div>
            <h2 className="bloco__titulo">Do site até o pagamento</h2>
            <p className="bloco__sub">
              Quantas visitas chegaram em cada passo — do Google Analytics, só de quem aceitou os
              cookies.
            </p>
          </div>
        </div>
        {f.estado === "ok" ? (
          <ListaDoFunil passos={f.site} dados="site" />
        ) : (
          <p className="sem-dados" data-sem-google={f.estado}>
            {SEM_VISITAS[f.estado]}.
          </p>
        )}
      </section>
      <div className="duas">
        <section className="bloco" data-bloco="checkout">
          <div className="bloco__cabeca">
            <div>
              <h2 className="bloco__titulo">Da sacola ao pagamento</h2>
              <p className="bloco__sub">
                Todo mundo, com cookie ou sem: os carrinhos da loja no período, passo a passo.
              </p>
            </div>
          </div>
          {f.checkout[0]?.n ? (
            <ListaDoFunil passos={f.checkout} dados="checkout" />
          ) : (
            <p className="sem-dados">Nenhum carrinho no período.</p>
          )}
        </section>
        <section className="bloco" data-bloco="aparelhos">
          <div className="bloco__cabeca">
            <div>
              <h2 className="bloco__titulo">Celular e computador</h2>
              <p className="bloco__sub">Onde as pessoas entram e onde compram.</p>
            </div>
          </div>
          {f.estado === "ok" && f.aparelhos ? (
            <>
              <Aparelhos aparelhos={f.aparelhos} />
              <p className="pequeno suave aparelhos__nota">
                As compras contam pelo navegador guardado na compra — de quem aceitou os cookies,
                como as visitas.
              </p>
            </>
          ) : (
            <p className="sem-dados">
              {f.estado === "ok" ? "Nenhuma visita no período." : `${SEM_VISITAS[f.estado]}.`}
            </p>
          )}
        </section>
      </div>
    </>
  )
}
