import { Achados, SEM_VISITAS } from "@/components/marketing"
import { MontarLink } from "@/components/montar-link"
import {
  lerCanais,
  type Campanha,
  type Canais,
  type LinhaDoCanal,
  type Periodo,
} from "@/lib/marketing"
import { reais } from "@/lib/pedidos"

/**
 * OS CANAIS DO MARKETING — de onde vêm as visitas e as vendas, as campanhas
 * (os links com UTM) e o montador de link. Os desenhos são os do protótipo;
 * os dados, do `GET /dashboard/marketing/canais`. As vendas sem origem (de
 * quem recusou os cookies) ficam numa linha à parte: a soma bate com o que a
 * loja vendeu.
 */

const INTEIRO = new Intl.NumberFormat("pt-BR")
const porcento = (v: number, casas = 0) => `${v.toFixed(casas).replace(".", ",")}%`

/** O que o nome do canal não diz sozinho. */
const AJUDA: Record<string, string> = {
  Direto: "digitou o endereço ou salvou nos favoritos",
  "Sem origem": "o Google não disse de onde veio",
}

/** Acima ou abaixo da média da loja: bom e ruim, só com visita que chegue pra dizer. */
function classeDaConversao(l: LinhaDoCanal, media: number | null) {
  if (l.conversao === null || media === null || l.visitas < 30) return undefined
  if (l.conversao >= media * 1.25) return "bom"
  if (l.conversao <= media * 0.75) return "ruim"
  return undefined
}

function TabelaDeCanais({ c }: { c: Extract<Canais, { estado: "ok" }> }) {
  const media = c.totais.visitas ? (c.totais.pedidos / c.totais.visitas) * 100 : null
  const parte = (l: LinhaDoCanal) =>
    c.totais.visitas ? `${porcento((l.visitas / c.totais.visitas) * 100)} do total` : ""
  const conversao = (l: LinhaDoCanal) => (
    <span className={classeDaConversao(l, media)}>
      {l.conversao === null ? "—" : porcento(l.conversao, 2)}
    </span>
  )
  return (
    <>
      <div className="tabela-rola" data-vira-cartao>
        <table className="tabela">
          <thead>
            <tr>
              <th>Canal</th>
              <th className="direita">Visitas</th>
              <th className="direita">Pedidos</th>
              <th className="direita">Conversão</th>
              <th className="direita">Receita</th>
            </tr>
          </thead>
          <tbody>
            {c.canais.map((l) => (
              <tr key={l.nome} data-canal={l.nome}>
                <td>
                  <b>{l.nome}</b>
                  {AJUDA[l.nome] ? <span className="tabela__sub">{AJUDA[l.nome]}</span> : null}
                </td>
                <td className="direita num">
                  {INTEIRO.format(l.visitas)}
                  <span className="tabela__sub">{parte(l)}</span>
                </td>
                <td className="direita num">{INTEIRO.format(l.pedidos)}</td>
                <td className="direita num">{conversao(l)}</td>
                <td className="direita num">
                  <b>{reais(l.receita)}</b>
                </td>
              </tr>
            ))}
            {c.semOrigem.pedidos ? (
              <tr data-canal="sem-origem">
                <td>
                  <b>Sem origem conhecida</b>
                  <span className="tabela__sub">quem recusou os cookies: o Google não vê</span>
                </td>
                <td className="direita num suave">—</td>
                <td className="direita num">{INTEIRO.format(c.semOrigem.pedidos)}</td>
                <td className="direita num suave">—</td>
                <td className="direita num">
                  <b>{reais(c.semOrigem.receita)}</b>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <div className="cartoes">
        {c.canais.map((l) => (
          <div className="cartao" key={l.nome} data-canal={l.nome}>
            <span className="cartao__linha">
              <p className="cartao__titulo">{l.nome}</p>
              <span className="cartao__valor">{reais(l.receita)}</span>
            </span>
            <p className="cartao__txt">
              {INTEIRO.format(l.visitas)} visitas · {parte(l)}
            </p>
            <p className="cartao__txt">
              {INTEIRO.format(l.pedidos)} {l.pedidos === 1 ? "pedido" : "pedidos"} · conversão{" "}
              {conversao(l)}
            </p>
          </div>
        ))}
        {c.semOrigem.pedidos ? (
          <div className="cartao" data-canal="sem-origem">
            <span className="cartao__linha">
              <p className="cartao__titulo">Sem origem conhecida</p>
              <span className="cartao__valor">{reais(c.semOrigem.receita)}</span>
            </span>
            <p className="cartao__txt">
              {INTEIRO.format(c.semOrigem.pedidos)}{" "}
              {c.semOrigem.pedidos === 1 ? "pedido" : "pedidos"} de quem recusou os cookies
            </p>
          </div>
        ) : null}
      </div>
    </>
  )
}

function TabelaDeCampanhas({ campanhas }: { campanhas: Campanha[] }) {
  return (
    <>
      <div className="tabela-rola" data-vira-cartao>
        <table className="tabela">
          <thead>
            <tr>
              <th>Campanha</th>
              <th className="direita">Visitas</th>
              <th className="direita">Pedidos</th>
              <th className="direita">Receita</th>
            </tr>
          </thead>
          <tbody>
            {campanhas.map((c) => (
              <tr key={c.nome} data-campanha={c.nome}>
                <td>
                  <b>{c.nome}</b>
                  <span className="tabela__sub">{c.canal}</span>
                </td>
                <td className="direita num">{INTEIRO.format(c.visitas)}</td>
                <td className="direita num">{INTEIRO.format(c.pedidos)}</td>
                <td className="direita num">
                  <b>{reais(c.receita)}</b>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="cartoes">
        {campanhas.map((c) => (
          <div className="cartao" key={c.nome} data-campanha={c.nome}>
            <span className="cartao__linha">
              <p className="cartao__titulo">{c.nome}</p>
              <span className="cartao__valor">{reais(c.receita)}</span>
            </span>
            <p className="cartao__txt">
              {c.canal} · {INTEIRO.format(c.visitas)} visitas · {INTEIRO.format(c.pedidos)}{" "}
              {c.pedidos === 1 ? "pedido" : "pedidos"}
            </p>
          </div>
        ))}
      </div>
    </>
  )
}

export async function TelaDosCanais({ periodo }: { periodo: Periodo }) {
  const c = await lerCanais(periodo)
  if (!c)
    return (
      <p className="sem-dados">Não consegui falar com a loja agora. Recarregue daqui a pouco.</p>
    )
  const semGoogle =
    c.estado === "ok" ? null : (
      <p className="sem-dados" data-sem-google={c.estado}>
        {SEM_VISITAS[c.estado]}.
      </p>
    )
  return (
    <>
      {c.estado === "ok" && c.achado ? <Achados achados={[c.achado]} /> : null}
      <section className="bloco bloco--sem-pad" data-bloco="canais">
        <div className="bloco__cabeca">
          <div>
            <h2 className="bloco__titulo">De onde vêm as visitas e as vendas</h2>
            <p className="bloco__sub">
              Do Google Analytics: as visitas do endereço da loja e as compras que a loja manda pra
              ele.
            </p>
          </div>
        </div>
        {c.estado !== "ok" ? (
          semGoogle
        ) : c.canais.length || c.semOrigem.pedidos ? (
          <TabelaDeCanais c={c} />
        ) : (
          <p className="sem-dados">Nenhuma visita no período.</p>
        )}
      </section>
      <p className="pequeno suave canais__total" data-total-da-loja>
        A loja vendeu {INTEIRO.format(c.pagos.pedidos)}{" "}
        {c.pagos.pedidos === 1 ? "pedido pago" : "pedidos pagos"} ({reais(c.pagos.receita)}) no
        período.
        {c.estado === "ok"
          ? ` O Google viu a origem de ${INTEIRO.format(c.totais.pedidos)}; o resto é de quem recusou os cookies.`
          : ""}
      </p>
      <section className="bloco bloco--sem-pad" data-bloco="campanhas">
        <div className="bloco__cabeca">
          <div>
            <h2 className="bloco__titulo">Campanhas</h2>
            <p className="bloco__sub">
              Só aparece aqui o link com a marca da campanha (UTM). Monte o link aí embaixo.
            </p>
          </div>
        </div>
        {c.estado !== "ok" ? (
          semGoogle
        ) : c.campanhas.length ? (
          <TabelaDeCampanhas campanhas={c.campanhas} />
        ) : (
          <p className="sem-dados">
            Nenhuma campanha no período. Monte um link aí embaixo e use no post, no e-mail ou na
            bio.
          </p>
        )}
      </section>
      <MontarLink loja={c.loja} paginas={c.paginas} />
    </>
  )
}
