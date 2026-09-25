import type { Route } from "next"
import Link from "next/link"
import { BotaoDoWhatsapp } from "@/components/carrinhos-whatsapp"
import { ETAPAS, type Etapa, type LinhaDoCarrinho, type TelaDosCarrinhos } from "@/lib/carrinhos"
import { reais } from "@/lib/pedidos"

/**
 * AS PEÇAS DA LISTA DE CARRINHOS — os passos do checkout (em qual a pessoa
 * parou), o botão do WhatsApp e a lista (tabela no computador, cartões no
 * celular). Tudo vem pronto do backend; aqui é só desenho.
 */

/** Sacola › Contato › Entrega › Pagamento, com o passo em que a pessoa parou marcado. */
export function EtapasDoCarrinho({ etapa, texto }: { etapa: Etapa; texto: string }) {
  const ate = ETAPAS.findIndex((e) => e.id === etapa)
  return (
    <span className="etapas-carrinho" data-etapa={etapa}>
      <span className="etapas-carrinho__passos" aria-hidden="true">
        {ETAPAS.map((e, i) => (
          <i
            key={e.id}
            title={e.nome}
            data-feito={i < ate ? "" : undefined}
            data-parou={i === ate ? "" : undefined}
          />
        ))}
      </span>
      <span className="etapas-carrinho__nome">{ETAPAS[ate]?.nome}</span>
      <span className="tabela__sub">{texto}</span>
    </span>
  )
}

function Botao({ l, verContato }: { l: LinhaDoCarrinho; verContato: boolean }) {
  return l.whatsapp ? (
    <BotaoDoWhatsapp id={l.id} link={l.whatsapp} />
  ) : (
    <span className="pequeno suave">
      {verContato ? "Sem telefone" : "O WhatsApp é com o dono e a operação"}
    </span>
  )
}

function Chamado({ l }: { l: LinhaDoCarrinho }) {
  return l.chamado ? (
    <span className="tabela__sub" data-chamado>
      Chamado por {l.chamado.quem}, {l.chamado.quando}
    </span>
  ) : null
}

function Quem({ l }: { l: LinhaDoCarrinho }) {
  return (
    <>
      {l.quem.nome ?? l.quem.email ?? "Sem nome"}
      {(l.quem.nome && l.quem.email) || l.quem.telefone ? (
        <span className="tabela__sub">
          {l.quem.nome ? l.quem.email : null}
          {l.quem.nome && l.quem.email && l.quem.telefone ? " · " : null}
          {l.quem.telefone ? <span data-telefone>{l.quem.telefone}</span> : null}
        </span>
      ) : null}
      <span className="tabela__sub">
        {l.situacao === "voltaram" && l.pedido ? (
          <>
            Comprou depois:{" "}
            {/* Link comum, e não o `tabela__link` (que estica por cima da linha
                inteira e cobriria o botão do WhatsApp). */}
            <Link className="link" href={`/pedidos/${l.pedido.id}` as Route}>
              #{l.pedido.numero}
            </Link>
          </>
        ) : (
          `Parou ${l.quando}`
        )}
      </span>
    </>
  )
}

export function ListaDosCarrinhos({ tela }: { tela: TelaDosCarrinhos }) {
  const { carrinhos, verContato } = tela
  if (!carrinhos.length)
    return (
      <div className="vazio">
        <b>Nenhum carrinho aqui</b>
        {tela.filtro === "parados"
          ? "Ninguém deixou a sacola parada nos últimos 30 dias."
          : "Mude o filtro."}
      </div>
    )
  return (
    <>
      <div className="tabela-rola" data-vira-cartao>
        <table className="tabela" data-carrinhos>
          <thead>
            <tr>
              <th>Quem</th>
              <th>Sacola</th>
              <th>Onde parou</th>
              <th className="direita">Valor</th>
              <th>Chamar</th>
            </tr>
          </thead>
          <tbody>
            {carrinhos.map((l) => (
              <tr key={l.id} data-carrinho={l.id}>
                <td>
                  <Quem l={l} />
                </td>
                <td>
                  {l.itens}
                  <span className="tabela__sub">
                    {l.unidades} {l.unidades === 1 ? "unidade" : "unidades"}
                  </span>
                </td>
                <td>
                  <EtapasDoCarrinho etapa={l.etapa} texto={l.etapaTexto} />
                </td>
                <td className="direita num">
                  <b>{reais(l.valor)}</b>
                </td>
                <td>
                  <Botao l={l} verContato={verContato} />
                  <Chamado l={l} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="cartoes">
        {carrinhos.map((l) => (
          <div className="cartao" key={l.id} data-carrinho={l.id}>
            <span className="cartao__linha">
              <p className="cartao__titulo">{l.quem.nome ?? l.quem.email ?? "Sem nome"}</p>
              <span className="cartao__valor">{reais(l.valor)}</span>
            </span>
            <p className="cartao__txt">{l.itens}</p>
            <EtapasDoCarrinho etapa={l.etapa} texto={l.etapaTexto} />
            <span className="cartao__linha">
              <span className="pequeno suave" data-parou-em>
                {l.situacao === "voltaram" && l.pedido
                  ? `Comprou depois: #${l.pedido.numero}`
                  : `Parou ${l.quando}`}
              </span>
              <Botao l={l} verContato={verContato} />
            </span>
            <Chamado l={l} />
          </div>
        ))}
      </div>
    </>
  )
}
