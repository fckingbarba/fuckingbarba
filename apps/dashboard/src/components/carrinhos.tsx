import type { Route } from "next"
import Link from "next/link"
import { BotaoDoWhatsapp } from "@/components/carrinhos-whatsapp"
import { Fotos, Sigla } from "@/components/visual"
import { ETAPAS, type Etapa, type LinhaDoCarrinho, type TelaDosCarrinhos } from "@/lib/carrinhos"
import { reais } from "@/lib/pedidos"

/**
 * AS PEÇAS DA LISTA DE CARRINHOS — os passos do checkout (em qual a pessoa
 * parou), o botão do WhatsApp e a lista (tabela no computador, cartões no
 * celular). Tudo vem pronto do backend; aqui é só desenho. Desde a 0155, a
 * sigla da pessoa, as fotos da sacola e o passo que não passou em vermelho;
 * a frase do passo fica pro leitor de tela e o "title".
 */

/**
 * Sacola › Contato › Entrega › Pagamento, com o passo em que a pessoa parou
 * marcado (vermelho quando o pagamento foi tentado e não passou).
 */
export function EtapasDoCarrinho({
  etapa,
  texto,
  falhou = false,
}: {
  etapa: Etapa
  texto: string
  falhou?: boolean
}) {
  const ate = ETAPAS.findIndex((e) => e.id === etapa)
  return (
    <span className="etapas-carrinho" data-etapa={etapa} title={texto}>
      <span className="etapas-carrinho__passos" aria-hidden="true">
        {ETAPAS.map((e, i) => (
          <i
            key={e.id}
            data-feito={i < ate ? "" : undefined}
            data-parou={i === ate ? "" : undefined}
            data-erro={i === ate && falhou ? "" : undefined}
          />
        ))}
      </span>
      <span className="etapas-carrinho__nome" data-erro={falhou ? "" : undefined}>
        {ETAPAS[ate]?.nome}
      </span>
      <span className="sr-only">{texto}</span>
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
  const nome = l.quem.nome ?? l.quem.email ?? "Sem nome"
  return (
    <span className="pessoa">
      <Sigla nome={nome} />
      <span>
        {nome}
        {/* O e-mail e o telefone em linhas separadas: o e-mail comprido corta em "…", o telefone não. */}
        {l.quem.nome && l.quem.email ? <span className="tabela__sub">{l.quem.email}</span> : null}
        {l.quem.telefone ? (
          <span className="tabela__sub" data-telefone>
            {l.quem.telefone}
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
      </span>
    </span>
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
                  <span className="com-foto">
                    <Fotos fotos={l.fotos} produtos={l.produtos} rotulo={l.itens} />
                    <span className="tabela__sub num">{l.unidades} un.</span>
                  </span>
                </td>
                <td>
                  <EtapasDoCarrinho etapa={l.etapa} texto={l.etapaTexto} falhou={l.falhou} />
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
            <span className="cartao__linha">
              <Fotos fotos={l.fotos} produtos={l.produtos} rotulo={l.itens} />
              <EtapasDoCarrinho etapa={l.etapa} texto={l.etapaTexto} falhou={l.falhou} />
            </span>
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
