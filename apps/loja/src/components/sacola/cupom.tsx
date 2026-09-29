"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"
import { Certo, Etiqueta } from "@/components/icones"
import { useSacola } from "@/components/sacola/contexto"
import { aplicarCupomNaSacola, tirarCupomDaSacola } from "@/lib/acoes/carrinho"
import { SEM_CONEXAO } from "@/lib/rede"

/**
 * O CUPOM NA SACOLA (entrega 0207).
 *
 * No celular, o campo do checkout mora no "Resumo do pedido", que nasce
 * fechado — e os clientes diziam que não achavam onde pôr o cupom. Aqui ele
 * fica no PÉ da gaveta, que nunca sai da tela: numa sacola comprida, o
 * corpo rola e o pé fica. Fechado, é uma linha só ("Tem cupom de desconto?");
 * o toque abre o campo no mesmo lugar, com o foco nele.
 *
 * A regra é a do checkout (`lib/cupom.ts`): quem valida é o Medusa, um cupom
 * por pedido, o de frete grátis espera a entrega. O cupom aplicado fica no
 * carrinho e chega pronto no checkout.
 *
 * Entra na MESMA fila da sacola (`comCarrinho`): com um "+" no ar, o cupom
 * espera ele voltar, e o total esmaece até o Medusa responder.
 */
export function CupomDaSacola() {
  const sacola = useSacola()
  const [aberto, setAberto] = useState(false)
  const [digitado, setDigitado] = useState("")
  const [indo, setIndo] = useState(false)
  const [erro, setErro] = useState("")
  const [recado, setRecado] = useState("")
  const campo = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (aberto) campo.current?.focus()
  }, [aberto])

  if (!sacola) return null
  const { carrinho, comCarrinho } = sacola
  const cupom = carrinho.cupom

  async function aplicar(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault()
    if (indo) return
    const codigo = digitado.trim()
    if (!codigo) {
      setErro("Escreve o código.")
      campo.current?.focus()
      return
    }
    setErro("")
    setRecado("")
    setIndo(true)
    const r = await comCarrinho(() => aplicarCupomNaSacola(codigo)).catch(() => ({
      ok: false as const,
      erro: SEM_CONEXAO,
      carrinho: null,
    }))
    setIndo(false)
    if (!r.ok) {
      setErro(r.erro)
      campo.current?.focus()
      return
    }
    setDigitado("")
    setAberto(false)
    setRecado("recado" in r ? (r.recado ?? "") : "")
  }

  async function tirar(codigo: string) {
    if (indo) return
    setErro("")
    setIndo(true)
    const r = await comCarrinho(() => tirarCupomDaSacola(codigo)).catch(() => ({
      ok: false as const,
      erro: SEM_CONEXAO,
      carrinho: null,
    }))
    setIndo(false)
    if (!r.ok) setErro(r.erro)
  }

  return (
    <div className="sacolinha__cupom" data-cupom={cupom ?? undefined}>
      {cupom ? (
        <p className="sacolinha__cupom-ok">
          <span className="sacolinha__cupom-codigo">
            <Certo />
            {cupom} aplicado
          </span>
          <button
            type="button"
            className="sacolinha__cupom-tira"
            onClick={() => tirar(cupom)}
            disabled={indo}
            aria-label={`Tirar o cupom ${cupom}`}
          >
            {indo ? "Tirando…" : "Tirar"}
          </button>
        </p>
      ) : aberto ? (
        <form className="sacolinha__cupom-form" noValidate onSubmit={aplicar}>
          <label className="sacolinha__cupom-rotulo" htmlFor="sacola-cupom">
            <Etiqueta />
            Cupom de desconto
          </label>
          <span className="sacolinha__cupom-linha">
            <input
              ref={campo}
              id="sacola-cupom"
              name="cupom"
              type="text"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              enterKeyHint="done"
              placeholder="CÓDIGO"
              value={digitado}
              onChange={(e) => {
                setDigitado(e.target.value)
                setErro("")
              }}
              aria-describedby="sacola-cupom-erro"
              aria-invalid={erro ? true : undefined}
            />
            <button type="submit" className="sacolinha__cupom-aplica" aria-busy={indo || undefined}>
              {indo ? "Aplicando…" : "Aplicar"}
            </button>
          </span>
        </form>
      ) : (
        <button
          type="button"
          className="sacolinha__cupom-abre"
          onClick={() => {
            setAberto(true)
            setErro("")
            setRecado("")
          }}
          aria-expanded="false"
        >
          <span className="sacolinha__cupom-pergunta">
            <Etiqueta />
            Tem cupom de desconto?
          </span>
          <span className="sacolinha__cupom-acao">Adicionar</span>
        </button>
      )}

      {/* Sempre no HTML: região viva que nasce junto com o texto costuma não ser anunciada. */}
      <p
        className="sacolinha__cupom-msg"
        id="sacola-cupom-erro"
        role="alert"
        data-tipo="erro"
        hidden={!erro}
      >
        {erro}
      </p>
      <p className="sacolinha__cupom-msg" role="status" data-tipo="espera" hidden={!recado}>
        {recado}
      </p>
    </div>
  )
}
