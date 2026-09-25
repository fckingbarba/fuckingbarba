"use client"

import { useRef, useState, useTransition, type KeyboardEvent } from "react"
import { useAvisar } from "@/components/avisos"
import { mudarPreco } from "@/lib/acoes/produtos"
import { emTextoDeReais, lerReais, reais, type LinhaDoProduto } from "@/lib/produtos"

/**
 * O PREÇO E O PROMOCIONAL NA LISTA DE PRODUTOS — os dois campos lado a lado,
 * como na Nuvemshop: escreve e aperta Enter (ou sai do campo), e salva. O
 * preço fica riscado quando há promoção. Promocional vazio tira a promoção.
 * Esc volta o valor de antes.
 *
 * Quem confere o valor é o Medusa (`/dashboard/produtos/:id/preco`); o
 * desconto que aparece embaixo do promocional é só pra pessoa ver o que está
 * fazendo. Pra quem não edita (a operação), os dois viram texto.
 */

type Campo = "preco" | "promocional"

/** Os dois campos na linha da tabela: uma célula pra cada. */
export function CelulasDePreco({ p, podeEditar }: { p: LinhaDoProduto; podeEditar: boolean }) {
  return (
    <>
      <td>
        <CampoDePreco p={p} campo="preco" podeEditar={podeEditar} />
      </td>
      <td>
        <CampoDePreco p={p} campo="promocional" podeEditar={podeEditar} />
      </td>
    </>
  )
}

/** Os dois lado a lado, com o nome em cima — no cartão do celular. */
export function CamposDePreco({ p, podeEditar }: { p: LinhaDoProduto; podeEditar: boolean }) {
  return (
    <div className="campos-de-preco">
      <CampoDePreco p={p} campo="preco" podeEditar={podeEditar} comRotulo />
      <CampoDePreco p={p} campo="promocional" podeEditar={podeEditar} comRotulo />
    </div>
  )
}

const ROTULO: Record<Campo, string> = { preco: "Preço", promocional: "Promocional" }

function CampoDePreco({
  p,
  campo,
  podeEditar,
  comRotulo = false,
}: {
  p: LinhaDoProduto
  campo: Campo
  podeEditar: boolean
  comRotulo?: boolean
}) {
  const avisar = useAvisar()
  const [indo, comecar] = useTransition()
  const gravado = campo === "preco" ? p.preco : (p.promocao?.por ?? p.promocaoSemEfeito)
  const inicial = gravado ? emTextoDeReais(gravado) : ""
  const [texto, setTexto] = useState(inicial)
  const [base, setBase] = useState(inicial)
  const [focado, setFocado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  // O último valor que o Medusa recusou: sair do campo com ele não pergunta de novo.
  const [recusado, setRecusado] = useState<string | null>(null)
  // O Esc sai do campo sem salvar: a saída do campo ainda enxerga o texto digitado.
  const desistiu = useRef(false)
  // O valor gravado mudou (salvou, ou a página refez): o campo acompanha — se
  // ninguém estiver digitando nele.
  if (inicial !== base && !focado) {
    setBase(inicial)
    setTexto(inicial)
    setErro(null)
  }

  const riscado = campo === "preco" && Boolean(p.promocao)
  const digitado = lerReais(texto)
  const desconto =
    campo === "promocional" && p.preco && digitado && digitado < p.preco
      ? Math.round((1 - digitado / p.preco) * 100)
      : null
  const notas = (
    <>
      {erro ? (
        <span className="campo-preco__erro" role="alert">
          {erro}
        </span>
      ) : null}
      {campo === "promocional" && desconto !== null && !erro ? (
        <span className="campo-preco__desconto">−{desconto}%</span>
      ) : null}
      {campo === "promocional" && p.promocao?.deOutraLista && texto === inicial ? (
        <span className="campo-preco__nota">de uma lista de preço do admin</span>
      ) : null}
      {campo === "promocional" && p.promocaoSemEfeito && texto === inicial ? (
        <span className="campo-preco__nota campo-preco__nota--aviso">
          não vale: o preço está menor
        </span>
      ) : null}
    </>
  )

  if (!p.preco)
    return campo === "preco" ? (
      <span className="suave">sem preço</span>
    ) : (
      <span className="suave">—</span>
    )

  if (!podeEditar)
    return (
      <span className="campo-preco" data-campo-preco={campo} data-riscado={riscado || undefined}>
        {comRotulo ? <span className="campo-preco__rotulo">{ROTULO[campo]}</span> : null}
        <span className="campo-preco__lido num">{gravado ? reais(gravado) : "—"}</span>
        {notas}
      </span>
    )

  function salvar() {
    const limpo = texto.trim()
    if (indo || limpo === recusado) return
    const mesmo = limpo === "" ? inicial === "" : lerReais(limpo) === lerReais(inicial)
    if (mesmo) {
      setTexto(inicial)
      setErro(null)
      return
    }
    comecar(async () => {
      const r = await mudarPreco(
        p.id,
        campo === "preco" ? { preco: limpo } : { promocional: limpo }
      )
      if (!r.ok) {
        setErro(r.texto)
        setRecusado(limpo)
        return
      }
      setErro(null)
      avisar(r)
    })
  }

  function tecla(ev: KeyboardEvent<HTMLInputElement>) {
    if (ev.key === "Enter") {
      ev.preventDefault()
      salvar()
    }
    if (ev.key === "Escape") {
      desistiu.current = true
      setTexto(inicial)
      setErro(null)
      setRecusado(null)
      ev.currentTarget.blur()
    }
  }

  return (
    <span
      className="campo-preco"
      data-campo-preco={campo}
      data-riscado={riscado && texto === inicial ? "" : undefined}
      data-erro={erro ? "" : undefined}
      aria-busy={indo || undefined}
    >
      {comRotulo ? <span className="campo-preco__rotulo">{ROTULO[campo]}</span> : null}
      <label className="campo-preco__caixa">
        <span className="campo-preco__rs" aria-hidden="true">
          R$
        </span>
        <input
          inputMode="decimal"
          autoComplete="off"
          value={texto}
          placeholder={campo === "promocional" ? "—" : ""}
          aria-label={`${ROTULO[campo]} de ${p.nome}`}
          aria-invalid={erro ? true : undefined}
          // Só leitura enquanto salva, e não desligado: desligar tiraria o foco no meio.
          readOnly={indo}
          onChange={(ev) => {
            setTexto(ev.target.value)
            setErro(null)
            setRecusado(null)
          }}
          onFocus={() => setFocado(true)}
          onBlur={() => {
            setFocado(false)
            if (desistiu.current) desistiu.current = false
            else salvar()
          }}
          onKeyDown={tecla}
        />
      </label>
      {notas}
    </span>
  )
}
