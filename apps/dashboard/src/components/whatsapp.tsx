import type { Route } from "next"
import Link from "next/link"
import { Fragment } from "react"
import { Icone } from "@/components/icones"
import { Paginas } from "@/components/paginas"
import { Cabeca } from "@/components/telas"
import { Faixa, Sigla } from "@/components/visual"
import { Devolver, Responder } from "@/components/whatsapp-acoes"
import {
  enderecoDoWhatsapp,
  FILTROS,
  SITUACAO_DA_MENSAGEM,
  type ConversaNaTela,
  type MensagemNaTela,
  type TelaDoWhatsapp,
} from "@/lib/whatsapp"

/**
 * O WHATSAPP NA TELA (0234) — o topo (o título, as abas, o que falta no
 * Railway), os números, a lista das conversas, a conversa aberta e quem
 * escreve. As ações (responder, devolver) moram em `whatsapp-acoes.tsx`.
 */

export function TopoDoWhatsapp({
  aba,
  ligado,
  falta,
}: {
  aba: "conversas" | "ajustes"
  ligado: boolean
  falta: string[]
}) {
  return (
    <>
      <Cabeca
        titulo="WhatsApp"
        sub="O atendente responde em 15 s a 1 min. O que precisa de alguém da equipe aparece aqui."
        acoes={
          <span className="wa-ligado" data-desligado={ligado ? undefined : true} data-atendente>
            {ligado ? "Atendente ligado" : "Atendente desligado"}
          </span>
        }
      />
      <nav className="abas" aria-label="Abas do WhatsApp">
        <Link href="/whatsapp" aria-current={aba === "conversas" ? "page" : undefined}>
          Conversas
        </Link>
        <Link href="/whatsapp/ajustes" aria-current={aba === "ajustes" ? "page" : undefined}>
          Ajustes e teste
        </Link>
      </nav>
      {falta.length ? (
        <Faixa
          nivel="atencao"
          titulo="O atendente ainda não responde"
          etiquetas={[`falta no Railway: ${falta.join(", ")}`]}
          data-falta={falta.join(",")}
        />
      ) : null}
    </>
  )
}

export function NumerosDoWhatsapp({ n }: { n: TelaDoWhatsapp["numeros"] }) {
  return (
    <div className="numeros" data-numeros-whatsapp>
      <div className="numero numero--destaque" data-esperando={n.esperando}>
        <p className="numero__rot">Esperando a equipe</p>
        <p className="numero__valor num">{n.esperando}</p>
        <p className="numero__sub">
          {n.esperandoHa ? `a mais antiga ${n.esperandoHa}` : "ninguém esperando"}
        </p>
      </div>
      <div className="numero">
        <p className="numero__rot">Conversas hoje</p>
        <p className="numero__valor num">{n.conversasHoje}</p>
        <p className="numero__sub">
          {n.respostasHoje} {n.respostasHoje === 1 ? "resposta" : "respostas"} do atendente
        </p>
      </div>
      <div className="numero">
        <p className="numero__rot">Vendas pelo WhatsApp · 7 dias</p>
        <p className="numero__valor num">{n.vendas.total}</p>
        <p className="numero__sub">
          {n.vendas.pedidos} {n.vendas.pedidos === 1 ? "pedido" : "pedidos"} de quem conversou antes
        </p>
      </div>
      <div className="numero">
        <p className="numero__rot">Custo da IA · hoje</p>
        <p className="numero__valor num">{n.custoHoje}</p>
        <p className="numero__sub" data-custo-partes>
          {n.respostasHoje
            ? `${n.custoGravando} gravando o catálogo (${n.gravacoes}×) · ${n.custoRespondendo} nas respostas`
            : "estimado"}
        </p>
      </div>
    </div>
  )
}

export function ListaDeConversas({ tela, aberta }: { tela: TelaDoWhatsapp; aberta?: string }) {
  return (
    <section className="wa__lista" aria-label="Conversas" data-lista-whatsapp>
      <div className="wa__topo-lista">
        <form className="wa__busca" action="/whatsapp" role="search">
          {tela.filtro !== "todas" ? (
            <input type="hidden" name="filtro" value={tela.filtro} />
          ) : null}
          <label className="sr-only" htmlFor="wa-busca">
            Buscar conversa
          </label>
          <input
            id="wa-busca"
            type="search"
            name="busca"
            defaultValue={tela.busca ?? ""}
            placeholder="Buscar nome ou número"
          />
          <button type="submit">Buscar</button>
        </form>
        <nav className="wa__filtros" aria-label="Filtrar conversas">
          {FILTROS.map((f) => (
            <Link
              key={f.id}
              href={enderecoDoWhatsapp({ filtro: f.id, busca: tela.busca })}
              aria-current={tela.filtro === f.id ? "page" : undefined}
              data-filtro={f.id}
            >
              {f.nome} {tela.contagem[f.id]}
            </Link>
          ))}
        </nav>
      </div>
      {tela.conversas.length ? (
        tela.conversas.map((c) => (
          <Link
            key={c.id}
            className="wa-linha"
            href={enderecoDoWhatsapp({ filtro: tela.filtro, busca: tela.busca, conversa: c.id })}
            aria-current={c.id === aberta ? "page" : undefined}
            data-conversa={c.id}
            data-esperando={c.esperando ? "" : undefined}
          >
            <Sigla nome={c.nome} />
            <span className="wa-linha__miolo">
              <span className="wa-linha__topo">
                <span className="wa-linha__nome">{c.nome}</span>
                <span className="wa-linha__hora">{c.quando}</span>
              </span>
              <span className="wa-linha__ultima" style={{ display: "block" }}>
                {c.ultima}
              </span>
              <span className="wa-linha__selos">
                {c.situacao === "equipe" ? (
                  <span className="wa-selo" data-tipo="equipe">
                    Equipe{c.motivo ? ` · ${c.motivo}` : ""}
                  </span>
                ) : (
                  <span className="wa-selo" data-tipo="atendente">
                    Atendente
                  </span>
                )}
                {c.comprou ? (
                  <span className="wa-selo" data-tipo="comprou">
                    Comprou {c.comprou}
                  </span>
                ) : null}
              </span>
            </span>
          </Link>
        ))
      ) : (
        <p className="vazio vazio--curto">
          {tela.busca
            ? "Nenhuma conversa com esse nome ou número."
            : tela.filtro === "equipe"
              ? "Nenhuma conversa com a equipe."
              : "Nenhuma conversa ainda. Elas aparecem aqui quando alguém escreve pro WhatsApp da loja."}
        </p>
      )}
      {tela.paginacao ? (
        <Paginas
          paginacao={tela.paginacao}
          endereco={(n) =>
            enderecoDoWhatsapp({ filtro: tela.filtro, busca: tela.busca, pagina: n })
          }
          rotulo="conversas"
        />
      ) : null}
    </section>
  )
}

function Mensagem({ m }: { m: MensagemNaTela }) {
  return (
    <div
      className="wa-msg"
      data-autor={m.autor}
      data-falhou={m.situacao === "falhou" ? "" : undefined}
      data-separada={m.separada ? "" : undefined}
      data-mensagem={m.id}
    >
      {m.autor !== "cliente" ? (
        <p className="wa-msg__de">
          {m.autor === "bot"
            ? m.separada
              ? "Só o código, pra copiar"
              : "Atendente"
            : `Equipe${m.quem ? ` · ${m.quem}` : ""}`}
          {m.ferramentas.map((f) => (
            <span key={f} className="wa-msg__ferramenta">
              {f}
            </span>
          ))}
        </p>
      ) : null}
      <p className="wa-msg__texto">{m.texto}</p>
      <p className="wa-msg__pe">
        {m.hora}
        {m.situacao ? ` · ${SITUACAO_DA_MENSAGEM[m.situacao] ?? m.situacao}` : ""}
      </p>
      {m.situacao === "falhou" && m.erro ? <p className="wa-msg__erro">{m.erro}</p> : null}
    </div>
  )
}

export function ConversaAberta({ c, voltar }: { c: ConversaNaTela; voltar: Route }) {
  return (
    <section
      className="wa__conversa"
      aria-label={`Conversa com ${c.nome}`}
      data-conversa-aberta={c.id}
    >
      <div className="wa__cabeca">
        <Link className="wa__voltar" href={voltar} aria-label="Voltar pras conversas">
          <Icone nome="esquerda" />
        </Link>
        <Sigla nome={c.nome} />
        <div className="wa__cabeca-miolo">
          <p className="wa__nome">{c.nome}</p>
          <p className="wa__tel">
            {c.telefone}
            {c.quem.cliente
              ? ` · cliente, ${c.quem.pedidos} ${c.quem.pedidos === 1 ? "pedido" : "pedidos"}`
              : ""}
          </p>
        </div>
        {c.situacao === "equipe" ? (
          <Devolver conversa={c.id} />
        ) : (
          <span className="wa-selo" data-tipo="atendente">
            Atendente cuidando
          </span>
        )}
      </div>
      {c.situacao === "equipe" ? (
        <div className="wa__equipe" data-com-a-equipe>
          <Icone nome="clientes" />
          <p>
            <strong>Com a equipe</strong>
            {c.motivo ? (
              <>
                : <strong>{c.motivo}</strong>
              </>
            ) : null}
            . O atendente fica quieto até alguém devolver, e volta sozinho se a equipe não falar
            nada em 24 horas.
          </p>
        </div>
      ) : null}
      <div className="wa__mensagens" data-mensagens>
        {c.mensagens.map((m, i) => (
          <Fragment key={m.id}>
            {i === 0 || c.mensagens[i - 1].diaChave !== m.diaChave ? (
              <p className="wa__dia">{m.dia}</p>
            ) : null}
            <Mensagem m={m} />
          </Fragment>
        ))}
      </div>
      <Responder conversa={c.id} nome={c.nome} janelaAte={c.janelaAte} />
    </section>
  )
}

export function QuemEscreve({ c }: { c: ConversaNaTela }) {
  const q = c.quem
  return (
    <aside className="wa__quem" aria-label="Quem escreve" data-quem>
      <div className="bloco">
        <p className="bloco__titulo">Quem é</p>
        {q.cliente ? (
          <dl className="wa-dados">
            <div>
              <dt>Pedidos na loja</dt>
              <dd>{q.pedidos}</dd>
            </div>
            {q.tratamento ? (
              <div>
                <dt>Tratamento</dt>
                <dd>{q.tratamento}</dd>
              </div>
            ) : null}
            {q.reposicao ? (
              <div>
                <dt>Reposição</dt>
                <dd>{q.reposicao}</dd>
              </div>
            ) : null}
          </dl>
        ) : (
          <p className="wa-ajustes__sub">Ainda não comprou com este telefone.</p>
        )}
        {q.ficha ? (
          <Link className="wa__link" href={q.ficha as Route}>
            Abrir a ficha do cliente
          </Link>
        ) : null}
      </div>
      {q.ultimoPedido ? (
        <div className="bloco" data-ultimo-pedido={q.ultimoPedido.numero}>
          <p className="bloco__titulo">Último pedido</p>
          <p className="wa__nome">
            #{q.ultimoPedido.numero} · {q.ultimoPedido.situacao}
          </p>
          <p className="wa__tel">
            {q.ultimoPedido.itens}
            {q.ultimoPedido.total ? ` · ${q.ultimoPedido.total}` : ""}
          </p>
          <Link className="wa__link" href={q.ultimoPedido.href as Route}>
            Abrir o pedido
          </Link>
        </div>
      ) : null}
    </aside>
  )
}
