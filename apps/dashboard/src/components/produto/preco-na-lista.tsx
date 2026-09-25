"use client"

import { useState, useTransition, type FormEvent } from "react"
import { useAvisar } from "@/components/avisos"
import { mudarPromocao } from "@/lib/acoes/produtos"
import { emTextoDeReais, lerReais, reais, type LinhaDoProduto } from "@/lib/produtos"

/**
 * O PREÇO NA LISTA DE PRODUTOS, com a promoção: o do Bling (o "de") e, se
 * houver, o "por" com o desconto. Pra quem edita (dono e marketing), o
 * botão abre o campo ali mesmo — digita o "por", vê o desconto enquanto
 * digita, e salva. Quem confere o valor é o Medusa; o desconto aqui é só
 * pra pessoa ver o que está fazendo.
 */
export function PrecoNaLista({ p, podeEditar }: { p: LinhaDoProduto; podeEditar: boolean }) {
  const avisar = useAvisar()
  const [editando, setEditando] = useState(false)
  const [valor, setValor] = useState("")
  const [erro, setErro] = useState<string | null>(null)
  const [indo, comecar] = useTransition()

  if (!p.preco) return <span className="suave">—</span>
  const de = p.preco
  const temPromocao = Boolean(p.promocao || p.promocaoSemEfeito)

  function abrir() {
    setValor(p.promocao && !p.promocao.deOutraLista ? emTextoDeReais(p.promocao.por) : "")
    setErro(null)
    setEditando(true)
  }

  function gravar(por: string | null) {
    comecar(async () => {
      const r = await mudarPromocao(p.id, por)
      if (!r.ok) {
        setErro(r.texto)
        return
      }
      setEditando(false)
      setErro(null)
      avisar(r)
    })
  }

  if (editando) {
    const digitado = lerReais(valor)
    const desconto = digitado && digitado < de ? Math.round((1 - digitado / de) * 100) : null
    return (
      <form
        className="promo-form"
        data-promocao-form={p.id}
        aria-busy={indo || undefined}
        onSubmit={(ev: FormEvent) => {
          ev.preventDefault()
          gravar(valor.trim() || null)
        }}
      >
        <span className="promo-form__de">
          De <s>{reais(de)}</s> <span className="suave">(Bling)</span>
        </span>
        <span className="promo-form__linha">
          <label className="promo-form__campo">
            <span>Por R$</span>
            <input
              inputMode="decimal"
              autoComplete="off"
              // O campo abre pra ser usado: é o que a pessoa acabou de pedir.
              autoFocus
              value={valor}
              placeholder={emTextoDeReais(de * 0.9)}
              aria-label={`Preço da promoção de ${p.nome}`}
              aria-invalid={erro ? true : undefined}
              onChange={(ev) => {
                setValor(ev.target.value)
                setErro(null)
              }}
              onKeyDown={(ev) => {
                if (ev.key === "Escape") setEditando(false)
              }}
            />
          </label>
          <span className="promo-form__desconto" aria-live="polite">
            {desconto !== null
              ? `−${desconto}%`
              : digitado !== null && digitado >= de
                ? "não é desconto"
                : ""}
          </span>
        </span>
        {erro ? (
          <span className="promo-form__erro" role="alert">
            {erro}
          </span>
        ) : null}
        <span className="promo-form__botoes">
          <button type="submit" className="btn btn--menor" disabled={indo}>
            {indo ? "Salvando…" : "Salvar"}
          </button>
          <button type="button" className="link" disabled={indo} onClick={() => setEditando(false)}>
            Cancelar
          </button>
          {temPromocao ? (
            <button
              type="button"
              className="link promo-form__tirar"
              disabled={indo}
              data-promocao-tirar={p.id}
              onClick={() => gravar(null)}
            >
              Tirar promoção
            </button>
          ) : null}
        </span>
      </form>
    )
  }

  return (
    <span className="preco-lista" data-preco={p.id}>
      {p.promocao ? (
        <span className="preco-lista__valores">
          <s className="suave">{reais(de)}</s> <b>{reais(p.promocao.por)}</b>{" "}
          <span className="selo selo--promo">−{p.promocao.desconto}%</span>
        </span>
      ) : (
        <span className="preco-lista__valores">{reais(de)}</span>
      )}
      {p.promocao?.deOutraLista ? (
        <span className="tabela__sub">de uma lista de preço do admin</span>
      ) : null}
      {p.promocaoSemEfeito ? (
        <span className="tabela__sub preco-lista__aviso" data-promocao-sem-efeito>
          A promoção de {reais(p.promocaoSemEfeito)} não vale: o Bling já está mais barato
        </span>
      ) : null}
      {podeEditar ? (
        <button type="button" className="link pequeno" data-promocao-abrir={p.id} onClick={abrir}>
          {temPromocao ? "Mudar promoção" : "Pôr em promoção"}
        </button>
      ) : null}
    </span>
  )
}
