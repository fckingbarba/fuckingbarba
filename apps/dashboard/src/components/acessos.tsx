"use client"

import { useState, useTransition, type FormEvent } from "react"
import { useAvisar } from "@/components/avisos"
import { Gaveta } from "@/components/gaveta"
import { Icone } from "@/components/icones"
import { Ajuda } from "@/components/visual"
import { apagarPapel, criarPapel, renomearPapel, salvarAcessos } from "@/lib/acoes/equipe"
import {
  ehPersonalizado,
  NOME_DA_LINHA,
  NOME_DO_PAPEL,
  nomeDoPapel,
  PAPEIS_AJUSTAVEIS,
  type Area,
  type Matriz,
  type PapelAjustavel,
  type PapelCriado,
  type PapelDaTabela,
} from "@/lib/equipe"

/** O que cada papel com caixinha abre: a coluna dele, na ordem das linhas. */
type Colunas = Record<PapelDaTabela, Area[]>

const colunasDa = (m: Matriz, areas: Area[], papeis: PapelDaTabela[]): Colunas =>
  Object.fromEntries(papeis.map((p) => [p, areas.filter((a) => m[a]?.includes(p))])) as Colunas

const iguais = (a: Area[], b: Area[]) => a.length === b.length && a.every((x, i) => x === b[i])

/** Quantas caixinhas estão diferentes entre duas tabelas. */
function diferencas(a: Colunas, b: Colunas, areas: Area[], papeis: PapelDaTabela[]): number {
  let n = 0
  for (const papel of papeis)
    for (const area of areas) if (a[papel].includes(area) !== b[papel].includes(area)) n++
  return n
}

const mudancas = (n: number) => (n === 1 ? "1 mudança" : `${n} mudanças`)

/**
 * O QUE CADA PAPEL ABRE — a tabela da equipe, com caixinha. O dono marca o
 * que a operação, o marketing e os papéis que ele criou abrem, e salva; a
 * coluna do dono (tudo) e as linhas fixas (o Início, a Equipe) são texto,
 * e o telefone dos clientes também, na operação e no marketing (segue o
 * papel) — no papel criado, é caixinha. Marcar o que mora dentro de uma área
 * marca ela junto; desmarcar a área desmarca o que mora dentro.
 *
 * "Criar papel" abre a gaveta do papel novo (o nome, e se ele começa igual à
 * operação ou ao marketing); o nome de cada papel criado, no alto da coluna
 * dele, abre a de renomear e apagar.
 *
 * A tela só propõe: quem confere de novo, e grava, é o Medusa
 * (`POST /dashboard/acessos` e `/dashboard/papeis`), e as linhas, as colunas
 * e as regras vêm dele (`GET /dashboard/equipe`) — área nova do backend
 * aparece aqui sozinha. Salvo, a página se refaz, e a tabela recomeça do
 * que ficou gravado (a `key` dela, na página, é a própria tabela).
 */
export function TabelaDeAcessos({
  acesso,
  padrao,
  fixas,
  doPapel,
  dentroDe,
  papeis,
  noMaximo,
}: {
  /** A de agora — o que está gravado. */
  acesso: Matriz
  /** A de quando a loja nasceu, pro "Voltar ao padrão" e pro destaque. */
  padrao: Matriz
  fixas: Area[]
  /** As linhas que, na operação e no marketing, seguem o papel (os contatos). */
  doPapel: Area[]
  dentroDe: Partial<Record<Area, Area>>
  /** Os papéis que o dono criou — uma coluna cada. */
  papeis: PapelCriado[]
  noMaximo: number
}) {
  const avisar = useAvisar()
  const areas = Object.keys(acesso) as Area[]
  const colunas: PapelDaTabela[] = [...PAPEIS_AJUSTAVEIS, ...papeis.map((p) => p.id)]
  const salvo = colunasDa(acesso, areas, colunas)
  const doPadrao = colunasDa(padrao, areas, colunas)
  const [marcado, setMarcado] = useState<Colunas>(salvo)
  const [erro, setErro] = useState("")
  const [salvando, comecar] = useTransition()
  const [criando, setCriando] = useState(false)
  const [mexendo, setMexendo] = useState<PapelCriado | null>(null)

  const pendentes = diferencas(marcado, salvo, areas, colunas)
  // "Voltar ao padrão" é da operação e do marketing: o papel criado não tem padrão.
  const noPadrao = PAPEIS_AJUSTAVEIS.every((p) => iguais(marcado[p], doPadrao[p]))
  const nomeDa = (p: PapelDaTabela) => nomeDoPapel(p, papeis)
  const fixa = (papel: PapelDaTabela, area: Area) =>
    fixas.includes(area) || (!ehPersonalizado(papel) && doPapel.includes(area))

  function alternar(papel: PapelDaTabela, area: Area) {
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
      const nomes = Object.fromEntries(papeis.map((p) => [p.id, p.nome]))
      const r = await salvarAcessos(marcado, nomes)
      if (r.ok) avisar({ ok: true, texto: r.aviso })
      else setErro(r.erro)
    })
  }

  const noLimite = papeis.length >= noMaximo
  return (
    <>
      <div className="bloco__cabeca">
        <div className="bloco__titulos">
          <h2 className="bloco__titulo">O que cada papel abre</h2>
          <Ajuda>
            Marque o que cada papel abre — o dono abre tudo. Precisa de um acesso sob medida
            (Atendimento, Financeiro, um freela)? Crie um papel: ele vira uma coluna aqui e uma
            opção no convite. Vale no servidor, não só na tela, a partir do próximo clique de cada
            pessoa.
          </Ajuda>
        </div>
        <button
          type="button"
          className="btn btn--contorno btn--menor"
          disabled={noLimite}
          title={noLimite ? `A loja já tem ${noMaximo} papéis criados.` : undefined}
          onClick={() => setCriando(true)}
        >
          <Icone nome="mais" />
          Criar papel
        </button>
      </div>

      <div className="tabela-rola">
        <table className="matriz matriz--acessos">
          <thead>
            <tr>
              <th scope="col">Área</th>
              <th scope="col">{NOME_DO_PAPEL.dono}</th>
              {colunas.map((p) => {
                const criado = papeis.find((c) => c.id === p)
                return (
                  <th key={p} scope="col" data-papel={p}>
                    {criado ? (
                      <button
                        type="button"
                        className="matriz__papel"
                        aria-label={`Renomear ou apagar o papel ${criado.nome}`}
                        onClick={() => setMexendo(criado)}
                      >
                        <span>{criado.nome}</span>
                        <Icone nome="lapis" />
                      </button>
                    ) : (
                      nomeDa(p)
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {areas.map((area) => {
              const nome = NOME_DA_LINHA[area] ?? area
              return (
                <tr key={area} data-area={area} data-dentro={dentroDe[area] ? "" : undefined}>
                  <th scope="row">{nome}</th>
                  <td className="sim" data-papel="dono">
                    abre
                  </td>
                  {colunas.map((p) => {
                    if (fixa(p, area)) {
                      const abre = padrao[area]?.includes(p) ?? false
                      return (
                        <td key={p} className={abre ? "sim" : "nao"} data-papel={p}>
                          {abre ? "abre" : "—"}
                        </td>
                      )
                    }
                    const abre = marcado[p].includes(area)
                    const mudado = !ehPersonalizado(p) && abre !== doPadrao[p].includes(area)
                    return (
                      <td key={p} data-papel={p} data-mudado={mudado ? "" : undefined}>
                        <label className="matriz__caixa">
                          <input
                            type="checkbox"
                            checked={abre}
                            disabled={salvando}
                            onChange={() => alternar(p, area)}
                            aria-label={`${nomeDa(p)} abre “${nome}”`}
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
          Em amarelo: diferente do padrão da loja, na Operação e no Marketing.
        </p>
        <div className="acessos__acoes">
          {pendentes ? (
            <span className="acessos__pendentes" role="status">
              {mudancas(pendentes)} sem salvar
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
              setMarcado((atual) => ({
                ...atual,
                operacao: doPadrao.operacao,
                marketing: doPadrao.marketing,
              }))
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
            Dado pessoal segue o papel: o CPF inteiro, só o dono vê; a Operação vê o telefone e o
            endereço dos clientes, e o Marketing não — nos Carrinhos e em Clientes, ele vê só quem
            aceitou ofertas. Liberar os Pedidos pro Marketing mostra o pedido como a Operação vê.
          </li>
          <li>
            No papel que você cria, quem decide é a linha “Telefone e endereço dos clientes”, em
            Clientes e nos Carrinhos: marcada, a pessoa vê como a Operação (e chama no WhatsApp);
            sem ela, como o Marketing. Nos Pedidos, quem abre vê o endereço de entrega, como sempre.
          </li>
        </ul>
      </div>

      {criando ? (
        <Gaveta titulo="Criar papel" fechar={() => setCriando(false)}>
          <FormPapelNovo
            pendentes={pendentes}
            fechar={() => setCriando(false)}
            aoCriar={(texto) => {
              setCriando(false)
              avisar({ ok: true, texto })
            }}
          />
        </Gaveta>
      ) : null}

      {mexendo ? (
        <Gaveta titulo={`Papel ${mexendo.nome}`} fechar={() => setMexendo(null)}>
          <FormDoPapel
            papel={mexendo}
            pendentes={pendentes}
            fechar={() => setMexendo(null)}
            aoMudar={(texto) => {
              setMexendo(null)
              avisar({ ok: true, texto })
            }}
          />
        </Gaveta>
      ) : null}
    </>
  )
}

const COMECOS: { valor: "" | PapelAjustavel; nome: string }[] = [
  { valor: "", nome: "Só o Início" },
  { valor: "operacao", nome: "Igual à Operação" },
  { valor: "marketing", nome: "Igual ao Marketing" },
]

/** A tabela tem mudança sem salvar: criar ou apagar papel refaz a página, e elas se perdem. */
function AvisoDePendentes({ pendentes, acao }: { pendentes: number; acao: string }) {
  if (!pendentes) return null
  return (
    <p className="campo__ajuda acessos__cuidado" role="status" style={{ marginTop: 14 }}>
      A tabela tem {mudancas(pendentes)} sem salvar: {acao} agora descarta elas. Salve antes, se
      quiser manter.
    </p>
  )
}

/**
 * O PAPEL NOVO — o nome e de onde ele começa. O Medusa confere o nome (2 a
 * 30 letras, sem repetir nem os três de sempre) e o limite de 10.
 */
function FormPapelNovo({
  pendentes,
  fechar,
  aoCriar,
}: {
  pendentes: number
  fechar: () => void
  aoCriar: (texto: string) => void
}) {
  const [nome, setNome] = useState("")
  const [igualA, setIgualA] = useState<"" | PapelAjustavel>("")
  const [erro, setErro] = useState("")
  const [criando, comecar] = useTransition()

  function enviar(ev: FormEvent) {
    ev.preventDefault()
    if (criando) return
    setErro("")
    comecar(async () => {
      const r = await criarPapel(nome, igualA)
      if (r.ok) aoCriar(r.aviso)
      else setErro(r.erro)
    })
  }

  return (
    <form onSubmit={enviar} noValidate data-papel-novo>
      <div className="campos">
        <div className="campo">
          <label htmlFor="p-nome">Nome do papel</label>
          <input
            id="p-nome"
            name="nome"
            autoComplete="off"
            maxLength={30}
            placeholder="Ex.: Atendimento"
            value={nome}
            onChange={(ev) => setNome(ev.target.value)}
            aria-invalid={erro ? true : undefined}
            aria-describedby="p-nome-ajuda"
            required
          />
          <p className="campo__ajuda" id="p-nome-ajuda">
            De 2 a 30 letras. Aparece pra pessoa no painel e no convite.
          </p>
        </div>
        <fieldset className="campo">
          <legend className="campo__rot">Começa abrindo</legend>
          <div className="segmento">
            {COMECOS.map((c) => (
              <label key={c.valor || "nada"}>
                <input
                  type="radio"
                  name="igualA"
                  value={c.valor}
                  checked={igualA === c.valor}
                  onChange={() => setIgualA(c.valor)}
                />
                <span>{c.nome}</span>
              </label>
            ))}
          </div>
          <p className="campo__ajuda">
            Depois você marca e desmarca na tabela o que ele abre, e convida pessoas com ele.
          </p>
        </fieldset>
      </div>
      <AvisoDePendentes pendentes={pendentes} acao="criar o papel" />
      {erro ? (
        <p className="pessoa__erro" role="alert" style={{ marginTop: 14 }}>
          {erro}
        </p>
      ) : null}
      <div className="form-acoes">
        <button type="button" className="btn btn--fantasma" onClick={fechar}>
          Cancelar
        </button>
        <button type="submit" className="btn btn--menor" disabled={criando} aria-busy={criando}>
          {criando ? <span className="giro" aria-hidden="true" /> : <Icone nome="mais" />}
          Criar papel
        </button>
      </div>
    </form>
  )
}

/**
 * UM PAPEL CRIADO — renomear e apagar. Apagar só sem ninguém nele (nem
 * convidado): quem tem o papel precisa de outro antes, e a tela diz isso em
 * vez de deixar o botão tentar.
 */
function FormDoPapel({
  papel,
  pendentes,
  fechar,
  aoMudar,
}: {
  papel: PapelCriado
  pendentes: number
  fechar: () => void
  aoMudar: (texto: string) => void
}) {
  const [nome, setNome] = useState(papel.nome)
  const [confirmando, setConfirmando] = useState(false)
  const [erro, setErro] = useState("")
  const [ocupado, comecar] = useTransition()

  function fazer(acao: () => ReturnType<typeof apagarPapel>) {
    setErro("")
    comecar(async () => {
      const r = await acao()
      if (r.ok) aoMudar(r.aviso)
      else setErro(r.erro)
    })
  }

  const quantas =
    papel.pessoas === 0
      ? "Ninguém tem esse papel agora."
      : papel.pessoas === 1
        ? "1 pessoa tem esse papel (contando convidados)."
        : `${papel.pessoas} pessoas têm esse papel (contando convidados).`

  return (
    <div data-papel-criado={papel.id}>
      <form
        onSubmit={(ev) => {
          ev.preventDefault()
          if (!ocupado) fazer(() => renomearPapel(papel.id, nome))
        }}
        noValidate
      >
        <div className="campos">
          <div className="campo">
            <label htmlFor="p-renomear">Nome do papel</label>
            <input
              id="p-renomear"
              name="nome"
              autoComplete="off"
              maxLength={30}
              value={nome}
              onChange={(ev) => setNome(ev.target.value)}
              aria-describedby="p-renomear-ajuda"
              required
            />
            <p className="campo__ajuda" id="p-renomear-ajuda">
              {quantas} Renomear não muda o que o papel abre.
            </p>
          </div>
        </div>
        <div className="form-acoes">
          <button type="button" className="btn btn--fantasma" onClick={fechar}>
            Fechar
          </button>
          <button
            type="submit"
            className="btn btn--menor"
            disabled={ocupado || nome.trim() === papel.nome}
            aria-busy={ocupado}
          >
            {ocupado ? <span className="giro" aria-hidden="true" /> : null}
            Salvar nome
          </button>
        </div>
      </form>

      <div className="papel__apagar">
        {papel.pessoas > 0 ? (
          <p className="campo__ajuda">
            Pra apagar este papel, mude antes o papel de quem está nele, em “Quem entra no painel”.
          </p>
        ) : confirmando ? (
          <div className="confirma" role="alertdialog" aria-label={`Apagar o papel ${papel.nome}`}>
            <p>
              <b>Apagar o papel {papel.nome}?</b>
            </p>
            <ul>
              <li>A coluna dele sai da tabela, com as caixinhas.</li>
              <li>O que foi feito com ele fica no registro.</li>
            </ul>
            <AvisoDePendentes pendentes={pendentes} acao="apagar o papel" />
            <div className="confirma__acoes">
              <button
                type="button"
                className="btn btn--perigo btn--menor"
                disabled={ocupado}
                onClick={() => fazer(() => apagarPapel(papel.id))}
              >
                {ocupado ? <span className="giro" aria-hidden="true" /> : null}
                Apagar papel
              </button>
              <button
                type="button"
                className="btn btn--fantasma"
                onClick={() => setConfirmando(false)}
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="btn btn--fantasma"
            disabled={ocupado}
            onClick={() => setConfirmando(true)}
          >
            Apagar papel
          </button>
        )}
      </div>

      {erro ? (
        <p className="pessoa__erro" role="alert" style={{ marginTop: 14 }}>
          {erro}
        </p>
      ) : null}
    </div>
  )
}
