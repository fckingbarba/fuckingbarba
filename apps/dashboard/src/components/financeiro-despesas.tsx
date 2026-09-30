"use client"

import { useState, useTransition } from "react"
import { useAvisar } from "@/components/avisos"
import { Icone } from "@/components/icones"
import {
  apagarDespesa,
  lancarDespesa,
  mudarDespesa,
  type DespesaNoFormulario,
  type ResultadoDoFinanceiro,
} from "@/lib/acoes/financeiro"
import { emCampo, reais, type DespesaNaTela, type TelaDasDespesas } from "@/lib/financeiro"

/**
 * AS DESPESAS DO FINANCEIRO — o formulário "Lançar despesa" e cada despesa
 * da lista, que abre pra mudar ou apagar. Quem confere cada campo é o Medusa;
 * o erro volta pro lado do campo. A que repete, mudada num mês depois do
 * primeiro, vale dali em diante (os meses de antes ficam como estavam).
 */

type Erro = { campo?: string; texto: string } | null

function Categoria({
  categorias,
  valor,
  aoMudar,
  erro,
}: {
  categorias: TelaDasDespesas["categorias"]
  valor: string
  aoMudar: (v: string) => void
  erro: Erro
}) {
  const linha = categorias.find((c) => c.id === valor)?.linha
  return (
    <div className="campo">
      <label>
        Categoria
        <select
          name="categoria"
          value={valor}
          onChange={(e) => aoMudar(e.target.value)}
          aria-invalid={erro?.campo === "categoria" || undefined}
        >
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
      </label>
      {linha ? (
        <p className="campo__ajuda">
          Vai pra linha <b>{linha}</b> do DRE.
        </p>
      ) : null}
      {erro?.campo === "categoria" ? <p className="campo__erro">{erro.texto}</p> : null}
    </div>
  )
}

const erroDo = (r: ResultadoDoFinanceiro): Erro =>
  r.ok ? null : { campo: r.campo, texto: r.texto }

/** "Lançar despesa": o que é, o valor, o mês, a categoria e se repete todo mês. */
export function LancarDespesa({ tela }: { tela: TelaDasDespesas }) {
  const avisar = useAvisar()
  const [indo, comecar] = useTransition()
  const vazio = (): DespesaNoFormulario => ({
    descricao: "",
    categoria: tela.categorias[0]?.id ?? "marketing",
    valor: "",
    mes: tela.mes,
    repete: false,
  })
  const [d, setD] = useState<DespesaNoFormulario>(vazio)
  const [erro, setErro] = useState<Erro>(null)
  const mudar = (campos: Partial<DespesaNoFormulario>) => setD((a) => ({ ...a, ...campos }))

  return (
    <form
      className="bloco fin-form"
      data-lancar-despesa
      aria-busy={indo || undefined}
      onSubmit={(e) => {
        e.preventDefault()
        comecar(async () => {
          const r = await lancarDespesa(d)
          setErro(erroDo(r))
          avisar(r)
          if (r.ok) setD({ ...vazio(), mes: d.mes, categoria: d.categoria })
        })
      }}
    >
      <h2 className="bloco__titulo">Lançar despesa</h2>
      <div className="campo">
        <label>
          O que é
          <input
            name="descricao"
            value={d.descricao}
            maxLength={80}
            placeholder="Ex.: fatura do Meta Ads de setembro"
            onChange={(e) => mudar({ descricao: e.target.value })}
            aria-invalid={erro?.campo === "descricao" || undefined}
          />
        </label>
        {erro?.campo === "descricao" ? <p className="campo__erro">{erro.texto}</p> : null}
      </div>
      <div className="fin-form__par">
        <div className="campo">
          <label>
            Valor (R$)
            <input
              name="valor"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0,00"
              value={d.valor}
              onChange={(e) => mudar({ valor: e.target.value })}
              aria-invalid={erro?.campo === "valor" || undefined}
            />
          </label>
          {erro?.campo === "valor" ? <p className="campo__erro">{erro.texto}</p> : null}
        </div>
        <div className="campo">
          <label>
            Mês
            <select
              name="mes"
              value={d.mes}
              onChange={(e) => mudar({ mes: e.target.value })}
              aria-invalid={erro?.campo === "mes" || undefined}
            >
              {tela.meses.map((m) => (
                <option key={m.mes} value={m.mes}>
                  {m.nome}
                </option>
              ))}
            </select>
          </label>
          {erro?.campo === "mes" ? <p className="campo__erro">{erro.texto}</p> : null}
        </div>
      </div>
      <Categoria
        categorias={tela.categorias}
        valor={d.categoria}
        aoMudar={(categoria) => mudar({ categoria })}
        erro={erro}
      />
      <label className="fin-form__marcar">
        <input
          type="checkbox"
          name="repete"
          checked={d.repete}
          onChange={(e) => mudar({ repete: e.target.checked })}
        />
        <span>
          <b>Repete todo mês</b>
          <small>
            Entra sozinha nos próximos meses até você tirar. Mudou o valor? Mude no mês: os de antes
            ficam como estavam.
          </small>
        </span>
      </label>
      <button type="submit" className="btn" disabled={indo}>
        Lançar
      </button>
    </form>
  )
}

/** Uma despesa da lista: fechada, a linha; aberta, o formulário pra mudar ou apagar. */
export function DespesaDaLista({
  despesa,
  tela,
}: {
  despesa: DespesaNaTela
  tela: TelaDasDespesas
}) {
  const avisar = useAvisar()
  const [indo, comecar] = useTransition()
  const [aberta, setAberta] = useState(false)
  const [confirmar, setConfirmar] = useState(false)
  const [erro, setErro] = useState<Erro>(null)
  const inicial = (): DespesaNoFormulario => ({
    descricao: despesa.descricao,
    categoria: despesa.categoria,
    valor: emCampo(despesa.valor),
    mes: despesa.repete ? tela.mes : despesa.desde,
    repete: despesa.repete,
  })
  const [d, setD] = useState<DespesaNoFormulario>(inicial)
  const mudar = (campos: Partial<DespesaNoFormulario>) => setD((a) => ({ ...a, ...campos }))
  // A que repete, vista depois do primeiro mês: mudar e apagar valem deste mês em diante.
  const depoisDoPrimeiro = despesa.repete && tela.mes > despesa.desde

  if (!aberta)
    return (
      <div className="fin-despesa" data-despesa={despesa.id}>
        <span className="fin-despesa__nome">{despesa.descricao}</span>
        <span className="fin-despesa__valor num">{reais(despesa.valor)}</span>
        <span>
          {despesa.repete ? <span className="fin-selo fin-selo--lancado">Todo mês</span> : null}
        </span>
        <button
          type="button"
          className="fin-icone"
          aria-label={`Mudar ${despesa.descricao}`}
          data-mudar-despesa
          onClick={() => {
            setD(inicial())
            setErro(null)
            setConfirmar(false)
            setAberta(true)
          }}
        >
          <Icone nome="lapis" />
        </button>
      </div>
    )

  return (
    <form
      className="fin-despesa fin-despesa--aberta"
      data-despesa={despesa.id}
      aria-busy={indo || undefined}
      onSubmit={(e) => {
        e.preventDefault()
        comecar(async () => {
          const r = await mudarDespesa(despesa.id, tela.mes, d)
          setErro(erroDo(r))
          avisar(r)
          if (r.ok) setAberta(false)
        })
      }}
    >
      <div className="campo">
        <label>
          O que é
          <input
            value={d.descricao}
            maxLength={80}
            onChange={(e) => mudar({ descricao: e.target.value })}
            aria-invalid={erro?.campo === "descricao" || undefined}
          />
        </label>
        {erro?.campo === "descricao" ? <p className="campo__erro">{erro.texto}</p> : null}
      </div>
      <div className="fin-form__par">
        <div className="campo">
          <label>
            Valor (R$)
            <input
              inputMode="decimal"
              autoComplete="off"
              value={d.valor}
              onChange={(e) => mudar({ valor: e.target.value })}
              aria-invalid={erro?.campo === "valor" || undefined}
            />
          </label>
          {erro?.campo === "valor" ? <p className="campo__erro">{erro.texto}</p> : null}
        </div>
        {despesa.repete ? null : (
          <div className="campo">
            <label>
              Mês
              <select value={d.mes} onChange={(e) => mudar({ mes: e.target.value })}>
                {tela.meses.map((m) => (
                  <option key={m.mes} value={m.mes}>
                    {m.nome}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
      </div>
      <Categoria
        categorias={tela.categorias}
        valor={d.categoria}
        aoMudar={(categoria) => mudar({ categoria })}
        erro={erro}
      />
      <label className="fin-form__marcar">
        <input
          type="checkbox"
          checked={d.repete}
          onChange={(e) => mudar({ repete: e.target.checked })}
        />
        <span>
          <b>Repete todo mês</b>
        </span>
      </label>
      {depoisDoPrimeiro ? (
        <p className="campo__ajuda">
          Ela entra desde {tela.meses.find((m) => m.mes === despesa.desde)?.nome ?? despesa.desde}:
          o que você mudar aqui vale de {tela.nome} em diante.
        </p>
      ) : null}
      <div className="fin-despesa__botoes">
        <button type="submit" className="btn btn--menor" disabled={indo}>
          Salvar
        </button>
        <button
          type="button"
          className="btn btn--menor btn--contorno"
          disabled={indo}
          onClick={() => setAberta(false)}
        >
          Cancelar
        </button>
        <button
          type="button"
          className="btn btn--menor btn--perigo"
          disabled={indo}
          data-apagar-despesa
          onClick={() => {
            if (!confirmar) {
              setConfirmar(true)
              return
            }
            comecar(async () => {
              const r = await apagarDespesa(despesa.id, tela.mes)
              avisar(r)
              if (r.ok) setAberta(false)
            })
          }}
        >
          {confirmar ? "Confirmar" : depoisDoPrimeiro ? "Tirar deste mês em diante" : "Apagar"}
        </button>
      </div>
    </form>
  )
}
