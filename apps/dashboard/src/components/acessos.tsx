"use client"

import { useState, useTransition } from "react"
import { useAvisar } from "@/components/avisos"
import { salvarAcessos } from "@/lib/acoes/equipe"
import {
  NOME_DA_LINHA,
  NOME_DO_PAPEL,
  PAPEIS_AJUSTAVEIS,
  type Area,
  type Matriz,
  type PapelAjustavel,
} from "@/lib/equipe"

/** O que cada papel ajustável abre: a coluna dele, na ordem das linhas. */
type Colunas = Record<PapelAjustavel, Area[]>

const colunasDa = (m: Matriz, areas: Area[]): Colunas => ({
  operacao: areas.filter((a) => m[a]?.includes("operacao")),
  marketing: areas.filter((a) => m[a]?.includes("marketing")),
})

const iguais = (a: Area[], b: Area[]) => a.length === b.length && a.every((x, i) => x === b[i])

/** Quantas caixinhas estão diferentes entre duas tabelas. */
function diferencas(a: Colunas, b: Colunas, areas: Area[]): number {
  let n = 0
  for (const papel of PAPEIS_AJUSTAVEIS)
    for (const area of areas) if (a[papel].includes(area) !== b[papel].includes(area)) n++
  return n
}

/**
 * O QUE CADA PAPEL ABRE — a tabela da equipe, com caixinha. O dono marca o
 * que a operação e o marketing abrem, e salva; a coluna do dono (tudo) e as
 * linhas fixas (o Início, a Equipe) são texto. Marcar o que mora dentro de
 * uma área marca ela junto; desmarcar a área desmarca o que mora dentro.
 *
 * A tela só propõe: quem confere de novo, e grava, é o Medusa
 * (`POST /dashboard/acessos`), e as linhas e as regras vêm dele
 * (`GET /dashboard/equipe`) — área nova do backend aparece aqui sozinha.
 * Salvo, a página se refaz, e a tabela recomeça do que ficou gravado (a
 * `key` dela, na página, é a própria tabela).
 */
export function TabelaDeAcessos({
  acesso,
  padrao,
  fixas,
  dentroDe,
}: {
  /** A de agora — o que está gravado. */
  acesso: Matriz
  /** A de quando a loja nasceu, pro "Voltar ao padrão" e pro destaque. */
  padrao: Matriz
  fixas: Area[]
  dentroDe: Partial<Record<Area, Area>>
}) {
  const avisar = useAvisar()
  const areas = Object.keys(acesso) as Area[]
  const salvo = colunasDa(acesso, areas)
  const doPadrao = colunasDa(padrao, areas)
  const [marcado, setMarcado] = useState<Colunas>(salvo)
  const [erro, setErro] = useState("")
  const [salvando, comecar] = useTransition()

  const pendentes = diferencas(marcado, salvo, areas)
  const noPadrao = PAPEIS_AJUSTAVEIS.every((p) => iguais(marcado[p], doPadrao[p]))

  function alternar(papel: PapelAjustavel, area: Area) {
    setErro("")
    setMarcado((atual) => {
      const coluna = new Set(atual[papel])
      if (coluna.has(area)) {
        coluna.delete(area)
        // O que mora dentro dela sai junto — e o que morava dentro disso.
        for (let mexeu = true; mexeu;) {
          mexeu = false
          for (const [dentro, fora] of Object.entries(dentroDe) as [Area, Area][])
            if (coluna.has(dentro) && !coluna.has(fora)) {
              coluna.delete(dentro)
              mexeu = true
            }
        }
      } else {
        // Liga a de fora junto: o botão só existe dentro da tela dela.
        for (let a: Area | undefined = area; a; a = dentroDe[a]) coluna.add(a)
      }
      return { ...atual, [papel]: areas.filter((a) => coluna.has(a)) }
    })
  }

  function salvar() {
    if (salvando || !pendentes) return
    setErro("")
    comecar(async () => {
      const r = await salvarAcessos(marcado)
      if (r.ok) avisar({ ok: true, texto: r.aviso })
      else setErro(r.erro)
    })
  }

  return (
    <>
      <div className="tabela-rola">
        <table className="matriz matriz--acessos">
          <thead>
            <tr>
              <th scope="col">Área</th>
              <th scope="col">{NOME_DO_PAPEL.dono}</th>
              {PAPEIS_AJUSTAVEIS.map((p) => (
                <th key={p} scope="col">
                  {NOME_DO_PAPEL[p]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {areas.map((area) => {
              const nome = NOME_DA_LINHA[area] ?? area
              const fixa = fixas.includes(area)
              return (
                <tr key={area} data-area={area} data-dentro={dentroDe[area] ? "" : undefined}>
                  <th scope="row">{nome}</th>
                  <td className="sim" data-papel="dono">
                    abre
                  </td>
                  {PAPEIS_AJUSTAVEIS.map((p) => {
                    if (fixa) {
                      const abre = padrao[area]?.includes(p) ?? false
                      return (
                        <td key={p} className={abre ? "sim" : "nao"} data-papel={p}>
                          {abre ? "abre" : "—"}
                        </td>
                      )
                    }
                    const abre = marcado[p].includes(area)
                    const mudado = abre !== doPadrao[p].includes(area)
                    return (
                      <td key={p} data-papel={p} data-mudado={mudado ? "" : undefined}>
                        <label className="matriz__caixa">
                          <input
                            type="checkbox"
                            checked={abre}
                            disabled={salvando}
                            onChange={() => alternar(p, area)}
                            aria-label={`${NOME_DO_PAPEL[p]} abre “${nome}”`}
                          />
                        </label>
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="acessos__pe">
        <p className="acessos__legenda">
          <span className="acessos__amostra" aria-hidden="true" />
          Em amarelo: diferente do padrão da loja.
        </p>
        <div className="acessos__acoes">
          {pendentes ? (
            <span className="acessos__pendentes" role="status">
              {pendentes === 1 ? "1 mudança sem salvar" : `${pendentes} mudanças sem salvar`}
            </span>
          ) : null}
          {pendentes ? (
            <button
              type="button"
              className="btn btn--fantasma"
              disabled={salvando}
              onClick={() => {
                setErro("")
                setMarcado(salvo)
              }}
            >
              Desfazer
            </button>
          ) : null}
          <button
            type="button"
            className="btn btn--contorno btn--menor"
            disabled={salvando || noPadrao}
            onClick={() => {
              setErro("")
              setMarcado(doPadrao)
            }}
          >
            Voltar ao padrão
          </button>
          <button
            type="button"
            className="btn btn--menor"
            disabled={salvando || !pendentes}
            aria-busy={salvando || undefined}
            onClick={salvar}
          >
            {salvando ? <span className="giro" aria-hidden="true" /> : null}
            Salvar acessos
          </button>
        </div>
        {erro ? (
          <p className="pessoa__erro" role="alert">
            {erro}
          </p>
        ) : null}
        <ul className="acessos__notas">
          <li>
            O que mora dentro de uma área só abre com ela: marcar “Pedidos: tentar o estorno de
            novo” marca os Pedidos junto, e desmarcar os Pedidos desmarca o estorno.
          </li>
          <li>
            Dado pessoal segue o papel, não a tabela: o CPF inteiro, só o dono vê; e o Marketing
            segue sem o telefone dos clientes nos Carrinhos e em Clientes. Liberar os Pedidos pro
            Marketing mostra o pedido como a Operação vê.
          </li>
        </ul>
      </div>
    </>
  )
}
