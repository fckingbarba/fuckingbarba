"use client"

import type { Route } from "next"
import Link from "next/link"
import { useOptimistic, useState, useTransition } from "react"
import { useAvisar } from "@/components/avisos"
import { Icone } from "@/components/icones"
import { resolverProblema } from "@/lib/acoes/observabilidade"
import {
  COR_DA_FAIXA,
  NOME_DA_FAIXA,
  NOME_DA_SITUACAO,
  NOME_DO_NIVEL,
  type IntegracaoNaTela,
  type MedidorNaTela,
  type ProblemaNaTela,
  type RotinaNaTela,
  type VitalNaTela,
} from "@/lib/observabilidade"

/**
 * A OBSERVABILIDADE NA TELA — como no protótipo: os problemas em cartões
 * (abertos e resolvidos), as integrações com a luz de cada uma, e a tabela
 * das rotinas (cartões no celular). Tudo vem pronto do Medusa; aqui só o
 * filtro e o "marcar como resolvido", que aparece na hora e volta sozinho
 * se o Medusa recusar.
 */
export function Problemas({ problemas: gravados }: { problemas: ProblemaNaTela[] }) {
  const avisar = useAvisar()
  const [filtro, setFiltro] = useState<"abertos" | "resolvidos">("abertos")
  const [indo, comecar] = useTransition()
  const [problemas, marcar] = useOptimistic(gravados, (lista: ProblemaNaTela[], id: string) =>
    lista.map((p) =>
      p.id === id
        ? { ...p, situacao: "resolvido" as const, podeMarcar: false, resolvido: "Resolvido agora" }
        : p
    )
  )
  const abertos = problemas.filter((p) => p.situacao === "aberto")
  const resolvidos = problemas.filter((p) => p.situacao === "resolvido")
  const lista = filtro === "abertos" ? abertos : resolvidos

  function resolver(p: ProblemaNaTela) {
    comecar(async () => {
      marcar(p.id)
      avisar(await resolverProblema(p.id))
    })
  }

  return (
    <>
      <div className="filtros" role="group" aria-label="Quais problemas">
        <button
          type="button"
          className="filtro"
          aria-pressed={filtro === "abertos"}
          data-filtro-problemas="abertos"
          onClick={() => setFiltro("abertos")}
        >
          Abertos <b>{abertos.length}</b>
        </button>
        <button
          type="button"
          className="filtro"
          aria-pressed={filtro === "resolvidos"}
          data-filtro-problemas="resolvidos"
          onClick={() => setFiltro("resolvidos")}
        >
          Resolvidos <b>{resolvidos.length}</b>
        </button>
      </div>
      {lista.length ? (
        <div className="problemas" aria-busy={indo || undefined}>
          {lista.map((p) => (
            <Cartao key={p.id} p={p} resolver={() => resolver(p)} />
          ))}
        </div>
      ) : (
        <p className="vazio vazio--curto">
          {filtro === "abertos" ? "Nenhum problema aberto." : "Nada resolvido nos últimos 30 dias."}
        </p>
      )}
    </>
  )
}

function Cartao({ p, resolver }: { p: ProblemaNaTela; resolver: () => void }) {
  const resolvido = p.situacao === "resolvido"
  return (
    <article
      className="problema"
      data-nivel={p.nivel}
      data-resolvido={resolvido || undefined}
      data-problema={p.id}
    >
      <div className="problema__topo">
        <span className="problema__nivel">{resolvido ? "Resolvido" : NOME_DO_NIVEL[p.nivel]}</span>
        <span className="selo">{p.area}</span>
      </div>
      <h3 className="problema__titulo">{p.titulo}</h3>
      <p className="problema__txt">{p.texto}</p>
      {p.meta ? (
        <p className="problema__meta">
          <Icone nome="relogio" />
          {p.meta}
        </p>
      ) : null}
      <div className="problema__acoes">
        {p.acao ? (
          p.acao.externo ? (
            <a
              className="btn btn--menor btn--contorno"
              href={p.acao.href}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Icone nome="fora" />
              {p.acao.texto}
            </a>
          ) : (
            <Link className="btn btn--menor btn--contorno" href={p.acao.href as Route}>
              {p.acao.texto}
            </Link>
          )
        ) : null}
        {resolvido ? (
          <span className="pequeno suave">{p.resolvido}</span>
        ) : p.podeMarcar ? (
          <button
            type="button"
            className="btn btn--fantasma"
            data-resolver={p.id}
            onClick={resolver}
          >
            {p.nivel === "info" ? "Marcar como visto" : "Marcar como resolvido"}
          </button>
        ) : p.sozinho ? (
          <span className="pequeno suave">Sai daqui sozinho quando for resolvido.</span>
        ) : null}
      </div>
      {p.detalhe ? (
        <details className="log">
          <summary>Detalhe técnico</summary>
          <pre>{p.detalhe}</pre>
        </details>
      ) : null}
    </article>
  )
}

export function Integracoes({ integracoes }: { integracoes: IntegracaoNaTela[] }) {
  return (
    <div className="integracoes">
      {integracoes.map((i) => (
        <div className="integracao" data-s={i.s} key={i.id} data-integracao={i.id}>
          <span className="luz" data-s={i.s} aria-hidden="true" />
          <div>
            <p className="integracao__nome">
              {i.nome}
              <small>{i.onde}</small>
            </p>
            <p className="integracao__txt">{i.texto}</p>
            <p className="integracao__sinal">
              {NOME_DA_SITUACAO[i.s]}
              {i.sinal ? ` · último sinal ${i.sinal}` : ""}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}

function ComoFoi({ r }: { r: RotinaNaTela }) {
  return (
    <>
      <span className="luz" data-s={r.s} aria-hidden="true" />
      <span className="luz__txt">{NOME_DA_SITUACAO[r.s]}</span>
      {r.texto ? <span className="tabela__sub">{r.texto}</span> : null}
    </>
  )
}

export function Rotinas({ rotinas }: { rotinas: RotinaNaTela[] }) {
  return (
    <>
      <div className="tabela-rola" data-vira-cartao>
        <table className="tabela">
          <thead>
            <tr>
              <th>Rotina</th>
              <th>Última vez</th>
              <th>Como foi</th>
              <th>Próxima</th>
            </tr>
          </thead>
          <tbody>
            {rotinas.map((r) => (
              <tr key={r.nome} data-rotina={r.nome} data-s={r.s}>
                <td>
                  <b>{r.frase}</b>
                  <span className="tabela__sub">
                    {r.nome} · {r.cada}
                  </span>
                </td>
                <td className="num">
                  {r.ultima ?? <span className="suave">—</span>}
                  {r.duracao ? <span className="suave"> · {r.duracao}</span> : null}
                </td>
                <td>
                  <ComoFoi r={r} />
                </td>
                <td className="num">{r.proxima}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="cartoes">
        {rotinas.map((r) => (
          <div className="cartao" key={r.nome}>
            <span className="cartao__linha">
              <p className="cartao__titulo">{r.frase}</p>
              <span className="rotina__como">
                <span className="luz" data-s={r.s} aria-hidden="true" />
                <span className="luz__txt">{NOME_DA_SITUACAO[r.s]}</span>
              </span>
            </span>
            <p className="cartao__txt">
              {r.ultima
                ? `Última ${r.ultima}${r.duracao ? ` · ${r.duracao}` : ""}`
                : "Ainda não rodou"}
            </p>
            <p className="cartao__txt">
              Próxima {r.proxima} · {r.cada}
            </p>
            {r.texto && r.s !== "espera" ? <p className="rotina__texto">{r.texto}</p> : null}
          </div>
        ))}
      </div>
    </>
  )
}

function Medidor({ rotulo, m }: { rotulo: string; m: MedidorNaTela | null }) {
  if (!m)
    return (
      <div className="medidor" data-medidor={rotulo}>
        <div className="medidor__topo">
          <span>{rotulo}</span>
          <span className="suave">sem visitas medidas</span>
        </div>
      </div>
    )
  return (
    <div className="medidor" data-medidor={rotulo} data-s={m.s}>
      <div className="medidor__topo">
        <span>{rotulo}</span>
        <b className="num">{m.valor}</b>
        <span className="status" data-s={COR_DA_FAIXA[m.s]}>
          {NOME_DA_FAIXA[m.s]}
        </span>
      </div>
      <div className="medidor__trilho" aria-hidden="true">
        <i data-z="bom" style={{ width: `${m.faixaBoa}%` }} />
        <i data-z="medio" style={{ width: `${m.faixaMedia}%` }} />
        <i data-z="ruim" />
        <span className="medidor__ponto" style={{ left: `${m.ponto}%` }} />
      </div>
    </div>
  )
}

/** A velocidade medida nas visitas de verdade: as três medidas, no celular e no computador. */
export function Velocidade({ vitais }: { vitais: VitalNaTela[] }) {
  return (
    <div className="vitais">
      {vitais.map((v) => (
        <div className="vital" key={v.metrica} data-vital={v.metrica}>
          <p className="vital__nome">
            {v.nome} <small>{v.metrica}</small>
          </p>
          <p className="vital__ajuda">{v.ajuda}</p>
          <Medidor rotulo="Celular" m={v.celular} />
          <Medidor rotulo="Computador" m={v.computador} />
        </div>
      ))}
    </div>
  )
}
