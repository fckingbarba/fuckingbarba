"use client"

import { useState, useTransition } from "react"
import { useAvisar } from "@/components/avisos"
import { Icone } from "@/components/icones"
import { FotoDoProduto } from "@/components/produtos"
import { salvarCaixa } from "@/lib/acoes/produtos"
import {
  LIMITE_DA_NOTA,
  PISO_DO_FRETE_GRATIS,
  reais,
  type Caixa,
  type DetalheDoProduto,
  type NoCatalogo,
} from "@/lib/produtos"

const MODOS = [
  {
    id: "unidades",
    nome: "Quantas unidades",
    tipo: "order bump",
    texto: "1, 2 ou 3 unidades, com o desconto por quantidade.",
  },
  {
    id: "junto",
    nome: "Leve junto",
    tipo: "cross-sell",
    texto: "Até 2 produtos, que a pessoa marca e leva no mesmo clique.",
  },
] as const

/**
 * A CAIXA DE COMPRA — o que aparece logo abaixo do preço, na página deste
 * produto: os cartões "Quantas unidades" OU o "Leve junto", no mesmo lugar.
 * Mexer é rascunho; vale depois do "Salvar". A prévia imita a página, com a
 * conta da loja (os totais vêm do backend, a mesma `totalDaFaixa`).
 */
export function CaixaDeCompra({
  produto,
  catalogo,
}: {
  produto: DetalheDoProduto
  catalogo: NoCatalogo[]
}) {
  const avisar = useAvisar()
  const [salvando, comecar] = useTransition()
  const [caixa, setCaixa] = useState<Caixa>(produto.caixa)
  const mudou = JSON.stringify(comoGrava(caixa)) !== JSON.stringify(comoGrava(produto.caixa))
  const edita = produto.podeEditar
  const nome = `caixa-${produto.id}`

  const escolhido = (i: number) => caixa.junto[i] ?? ""
  const escolher = (i: number, handle: string) => {
    const junto = [escolhido(0), escolhido(1)]
    junto[i] = handle
    setCaixa({ ...caixa, junto: junto.filter(Boolean) })
  }
  const opcoes = (fora: string) => catalogo.filter((p) => p.handle !== fora)

  function salvar() {
    if (caixa.modo === "junto" && !caixa.junto.length) {
      avisar({ ok: false, texto: "Escolha pelo menos um produto pro leve junto." })
      return
    }
    comecar(async () => {
      avisar(await salvarCaixa(produto.id, caixa))
    })
  }

  return (
    <section className="bloco" data-caixa>
      <div className="bloco__cabeca">
        <div>
          <h2 className="bloco__titulo">Caixa de compra</h2>
          <p className="bloco__sub">
            O que aparece logo abaixo do preço, na página deste produto. Um ou outro, no mesmo
            lugar.
          </p>
        </div>
      </div>

      {edita ? (
        <div className="escolha" role="radiogroup" aria-label="Abaixo do preço">
          {MODOS.map((m) => (
            <label key={m.id}>
              <input
                type="radio"
                name={nome}
                value={m.id}
                checked={caixa.modo === m.id}
                onChange={() => setCaixa({ ...caixa, modo: m.id })}
              />
              <span>
                <b>{m.nome}</b>
                <em>{m.tipo}</em>
                <small>{m.texto}</small>
              </span>
            </label>
          ))}
        </div>
      ) : (
        <p className="oferta__atual">
          <span className="status" data-s="publicado">
            {caixa.modo === "junto" ? "Leve junto" : "Quantas unidades"}
          </span>
        </p>
      )}

      {edita && caixa.modo === "unidades" ? (
        <div className="campos">
          <div className="campo">
            <label htmlFor={`${nome}-nota`}>
              Linha embaixo de “1 unidade” <small>— opcional</small>
            </label>
            <input
              id={`${nome}-nota`}
              data-caixa-nota
              value={caixa.nota}
              maxLength={LIMITE_DA_NOTA}
              placeholder="Ex.: Dura cerca de 30 dias"
              onChange={(e) => setCaixa({ ...caixa, nota: e.target.value })}
            />
          </div>
        </div>
      ) : null}

      {edita && caixa.modo === "junto" ? (
        <div className="campos">
          {[0, 1].map((i) => (
            <div className="campo campo--3" key={i}>
              <label htmlFor={`${nome}-junto-${i}`}>
                Produto {i + 1} {i === 1 ? <small>— opcional</small> : null}
              </label>
              <select
                id={`${nome}-junto-${i}`}
                data-caixa-junto={i}
                value={escolhido(i)}
                disabled={i === 1 && !escolhido(0)}
                onChange={(e) => escolher(i, e.target.value)}
              >
                <option value="">Escolha</option>
                {opcoes(escolhido(i === 0 ? 1 : 0)).map((p) => (
                  <option key={p.handle} value={p.handle}>
                    {p.nome}
                    {p.preco ? ` · ${reais(p.preco)}` : ""}
                    {p.esgotado ? " · esgotado" : ""}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      ) : null}

      <div className="pdp-previa">
        <p className="previa-compra__rot">Prévia · como fica na página</p>
        {caixa.modo === "junto" ? (
          <PreviaJunto preco={produto.preco} junto={caixa.junto} catalogo={catalogo} />
        ) : (
          <PreviaUnidades produto={produto} nota={caixa.nota} />
        )}
      </div>
      <p className="pequeno suave" style={{ margin: "10px 0 0" }}>
        {caixa.modo === "junto"
          ? "Com o leve junto, os cartões de quantidade saem daqui — mas quem aumentar a quantidade no seletor continua com o desconto por quantidade."
          : "O desconto é o da loja toda: 4% levando 2, 6% levando 3."}
      </p>

      {edita ? (
        <div className="form-acoes">
          <span className={`pequeno${mudou ? "" : " suave"}`}>
            {mudou ? <b>Mudou e ainda não salvou.</b> : "Tudo salvo."}
          </span>
          <button
            type="button"
            className="btn btn--menor"
            data-salvar-caixa
            disabled={!mudou || salvando}
            aria-busy={salvando || undefined}
            onClick={salvar}
          >
            {salvando ? "Salvando…" : "Salvar"}
          </button>
        </div>
      ) : null}
    </section>
  )
}

/** A caixa do jeito que o backend grava: o leve junto só no modo dele; a linha, aparada. */
const comoGrava = (c: Caixa): Caixa => ({
  modo: c.modo,
  nota: c.nota.trim(),
  junto: c.modo === "junto" ? c.junto : [],
})

/** Os cartões de quantidade, com a tarja de frete grátis — como na página. */
function PreviaUnidades({ produto, nota }: { produto: DetalheDoProduto; nota: string }) {
  const degraus = produto.degraus
  if (!degraus.length || !produto.preco)
    return <p className="oferta__vazia">Sem preço no Bling: a página não mostra os cartões.</p>
  const preco = produto.preco
  return (
    <div className="unid-previa">
      <p className="unid-previa__titulo">
        <Icone nome="raio" />
        Quantas unidades
      </p>
      <div className="unid-previa__cartoes">
        {degraus.map(({ unidades: n, total }, i) => {
          const melhor = degraus.length > 1 && i === degraus.length - 1
          const economia = Math.round((preco * n - total) * 100) / 100
          return (
            <div
              className="unid-cartao"
              key={n}
              data-sel={melhor ? "" : undefined}
              data-topo={melhor ? "" : undefined}
            >
              {melhor ? (
                <span className="unid-cartao__topo">
                  <Icone nome="raio" />
                  Melhor preço
                </span>
              ) : null}
              <span className="unid-cartao__radio" />
              <b className="unid-cartao__qtd">
                {n} {n > 1 ? "unidades" : "unidade"}
              </b>
              <span className="unid-cartao__cada">
                {n > 1 ? `Economiza ${reais(economia)}` : nota.trim() || "\u00a0"}
              </span>
              <b className="unid-cartao__preco">{reais(total)}</b>
              <span className="unid-cartao__cada">{reais(total / n)} cada</span>
              {total >= PISO_DO_FRETE_GRATIS ? (
                <span className="unid-cartao__frete">
                  <Icone nome="raio" />
                  Frete grátis
                </span>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** O leve junto, no lugar dos cartões. Produto esgotado some da página sozinho. */
function PreviaJunto({
  preco,
  junto,
  catalogo,
}: {
  preco: number | null
  junto: string[]
  catalogo: NoCatalogo[]
}) {
  const itens = junto
    .map((h) => catalogo.find((p) => p.handle === h))
    .filter((p): p is NoCatalogo => Boolean(p))
  if (!itens.length) return <p className="oferta__vazia">Escolha pelo menos um produto.</p>
  const fecha = (p: NoCatalogo) => (preco ?? 0) + (p.preco ?? 0) >= PISO_DO_FRETE_GRATIS
  return (
    <>
      <div className="junto-previa">
        <p className="unid-previa__titulo">
          <Icone nome="raio" />
          Leve junto
        </p>
        {itens.map((p) => (
          <div
            className="junto-previa__item"
            key={p.handle}
            data-esgotado={p.esgotado ? "" : undefined}
          >
            <span className="caixinha" aria-hidden="true" />
            <FotoDoProduto foto={p.foto} />
            <span className="junto-previa__nome">
              {p.nome}
              {p.esgotado ? (
                <span className="slot__aviso">
                  <Icone nome="alerta" />
                  Esgotado: não aparece na página até voltar o estoque.
                </span>
              ) : fecha(p) ? (
                <span className="tarja-frete">
                  <Icone nome="caminhao" />
                  Frete grátis
                </span>
              ) : null}
            </span>
            <b className="num">{p.preco ? reais(p.preco) : "—"}</b>
          </div>
        ))}
      </div>
      {itens.some(fecha) ? null : (
        <p className="pequeno" style={{ margin: "8px 0 0" }}>
          Dica: um item que, somado a este, passe de {reais(PISO_DO_FRETE_GRATIS)} ganha a tarja
          “Frete grátis”.
        </p>
      )}
    </>
  )
}
