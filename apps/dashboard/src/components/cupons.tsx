"use client"

import { useOptimistic, useState, useTransition, type FormEvent } from "react"
import { useAvisar } from "@/components/avisos"
import { Gaveta } from "@/components/gaveta"
import { Icone } from "@/components/icones"
import { criarCupom, mudarCupom } from "@/lib/acoes/cupons"
import {
  COR_DA_SITUACAO,
  CUPOM_VAZIO,
  NOME_DA_SITUACAO,
  previaDoCupom,
  type CupomNaLista,
  type FormularioDoCupom,
} from "@/lib/cupons"
import { reais } from "@/lib/pedidos"

/**
 * OS CUPONS NA TELA — a lista com a chave de cada um, e a gaveta do cupom
 * novo, como no protótipo. A chave vale na hora (a tela já mostra enquanto
 * vai, e volta sozinha se o Medusa recusar); o vencido e o esgotado não têm
 * chave: pra valer de novo, é outro cupom.
 */
export function ListaDeCupons({ cupons: gravados }: { cupons: CupomNaLista[] }) {
  const avisar = useAvisar()
  const [indo, comecar] = useTransition()
  const [cupons, aplicar] = useOptimistic(
    gravados,
    (lista: CupomNaLista[], { id, ligar }: { id: string; ligar: boolean }) =>
      lista.map((c) =>
        c.id === id
          ? { ...c, ligado: ligar, situacao: ligar ? ("valendo" as const) : ("pausado" as const) }
          : c
      )
  )

  function mudar(c: CupomNaLista) {
    const ligar = !c.ligado
    comecar(async () => {
      aplicar({ id: c.id, ligar })
      avisar(await mudarCupom(c.id, ligar ? "ligar" : "pausar"))
    })
  }

  if (!cupons.length)
    return (
      <p className="vazio vazio--curto">
        Nenhum cupom ainda. O primeiro nasce no &ldquo;Novo cupom&rdquo;, lá em cima.
      </p>
    )
  return (
    <div className="linhas" aria-busy={indo || undefined}>
      {cupons.map((c) => {
        const chave = c.situacao === "valendo" || c.situacao === "pausado"
        return (
          <div className="linha" key={c.id} data-cupom={c.codigo}>
            <div>
              <p className="linha__titulo">
                <span className="num">{c.codigo}</span>
              </p>
              <p className="linha__txt">
                {c.descricao} · {c.regra}
              </p>
              <p className="linha__txt">
                <b>{c.usos}</b>
                {c.pedidos
                  ? ` · ${reais(c.desconto)} de desconto · ${reais(c.vendeu)} em pedidos pagos`
                  : ""}
              </p>
            </div>
            <div className="cupom__lado">
              <span className="status" data-s={COR_DA_SITUACAO[c.situacao]}>
                {NOME_DA_SITUACAO[c.situacao]}
              </span>
              {chave ? (
                <button
                  type="button"
                  className="chave"
                  role="switch"
                  aria-checked={c.ligado}
                  aria-label={`Cupom ${c.codigo} valendo`}
                  data-chave-cupom={c.codigo}
                  onClick={() => mudar(c)}
                />
              ) : null}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** O botão do alto da tela, e a gaveta com o formulário. */
export function NovoCupom() {
  const [aberta, setAberta] = useState(false)
  return (
    <>
      <button
        type="button"
        className="btn btn--menor"
        data-novo-cupom
        onClick={() => setAberta(true)}
      >
        <Icone nome="mais" />
        Novo cupom
      </button>
      {aberta ? <GavetaDoCupom fechar={() => setAberta(false)} /> : null}
    </>
  )
}

function GavetaDoCupom({ fechar }: { fechar: () => void }) {
  const avisar = useAvisar()
  const [f, setF] = useState<FormularioDoCupom>(CUPOM_VAZIO)
  const [erros, setErros] = useState<Record<string, string>>({})
  const [erro, setErro] = useState("")
  const [criando, comecar] = useTransition()
  const mudar = <K extends keyof FormularioDoCupom>(campo: K, valor: FormularioDoCupom[K]) =>
    setF((a) => ({ ...a, [campo]: valor }))

  function criar(ev: FormEvent) {
    ev.preventDefault()
    if (criando) return
    comecar(async () => {
      const r = await criarCupom(f)
      if (r.ok) {
        avisar(r)
        fechar()
        return
      }
      setErros(r.erros ?? {})
      setErro(r.texto)
    })
  }

  const campo = (
    c: keyof FormularioDoCupom,
    rotulo: string,
    extra: { nota?: string; tipo?: string; modo?: "numeric" | "decimal"; largura?: string } = {}
  ) => (
    <div className={`campo ${extra.largura ?? ""}`.trim()}>
      <label htmlFor={`cupom-${c}`}>
        {rotulo}
        {extra.nota ? <small> {extra.nota}</small> : null}
      </label>
      <input
        id={`cupom-${c}`}
        data-campo={c}
        type={extra.tipo ?? "text"}
        inputMode={extra.modo}
        autoComplete="off"
        value={f[c] as string}
        aria-invalid={erros[c] ? true : undefined}
        aria-describedby={erros[c] ? `cupom-${c}-erro` : undefined}
        style={c === "codigo" ? { textTransform: "uppercase" } : undefined}
        onChange={(e) => mudar(c, e.target.value as never)}
      />
      <p className="campo__erro" id={`cupom-${c}-erro`} role={erros[c] ? "alert" : undefined}>
        {erros[c] ?? ""}
      </p>
    </div>
  )

  return (
    <Gaveta titulo="Novo cupom" fechar={fechar}>
      <form onSubmit={criar} noValidate data-form-cupom>
        <div className="campos">
          {campo("codigo", "Código", { nota: "— o que a pessoa digita" })}
          <fieldset className="campo">
            <legend className="campo__rot">Tipo</legend>
            <div className="segmento">
              {(
                [
                  ["porcento", "% do pedido"],
                  ["reais", "R$ fixo"],
                ] as const
              ).map(([valor, nome]) => (
                <label key={valor}>
                  <input
                    type="radio"
                    name="cupom-tipo"
                    value={valor}
                    data-tipo={valor}
                    checked={f.tipo === valor}
                    onChange={() => mudar("tipo", valor)}
                  />
                  <span>{nome}</span>
                </label>
              ))}
            </div>
            <p className="campo__erro" role={erros.tipo ? "alert" : undefined}>
              {erros.tipo ?? ""}
            </p>
          </fieldset>
          {campo("valor", f.tipo === "porcento" ? "Desconto (%)" : "Desconto (R$)", {
            modo: f.tipo === "porcento" ? "numeric" : "decimal",
            largura: "campo--3",
          })}
          {campo("minimo", "Pedido mínimo", {
            nota: "— em produtos",
            modo: "decimal",
            largura: "campo--3",
          })}
          {campo("ate", "Vale até", { tipo: "date", largura: "campo--3" })}
          {campo("limite", "Limite de usos", {
            nota: "— no total",
            modo: "numeric",
            largura: "campo--3",
          })}
          <div className="campo">
            <label className="marcar">
              <input
                type="checkbox"
                data-campo="umaVezPorCliente"
                checked={f.umaVezPorCliente}
                onChange={(e) => mudar("umaVezPorCliente", e.target.checked)}
              />
              Uma vez por cliente
            </label>
            <label className="marcar">
              <input
                type="checkbox"
                data-campo="primeiraCompra"
                checked={f.primeiraCompra}
                onChange={(e) => mudar("primeiraCompra", e.target.checked)}
              />
              Só na primeira compra
            </label>
          </div>
        </div>
        <p className="previa" data-previa-cupom>
          {previaDoCupom(f)}
        </p>
        <p className="pequeno suave" style={{ margin: "10px 0 0" }}>
          O pedido mínimo conta como o frete grátis: os produtos, sem o frete e sem outro desconto.
          &ldquo;Uma vez por cliente&rdquo; e &ldquo;primeira compra&rdquo; valem pelo e-mail da
          compra: o checkout confere quando a pessoa digita o e-mail.
        </p>
        {erro ? (
          <p className="gaveta__erro" role="alert">
            <Icone nome="alerta" />
            {erro}
          </p>
        ) : null}
        <div className="form-acoes">
          <button type="button" className="btn btn--fantasma" onClick={fechar}>
            Cancelar
          </button>
          <button
            type="submit"
            className="btn btn--menor"
            disabled={criando}
            aria-busy={criando || undefined}
          >
            {criando ? "Criando…" : "Criar cupom"}
          </button>
        </div>
      </form>
    </Gaveta>
  )
}
