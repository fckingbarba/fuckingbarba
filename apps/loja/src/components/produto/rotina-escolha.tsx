"use client"

import Image from "next/image"
import { useState, useTransition } from "react"
import { Raio } from "@/components/icones"
import { EVENTO_SACOLA } from "@/components/sacola/contexto"
import { adicionarVarios } from "@/lib/acoes/carrinho"
import { emReais } from "@/lib/formato"
import { useFrete } from "@/components/configuracoes/contexto"
import { faltaPraPromocao, frasesDoFrete, progressoDaPromocao } from "@/lib/configuracoes"

/**
 * A ESCOLHA DA ROTINA — as caixinhas, a soma e o botão.
 *
 * A soma roda no navegador, e é a única conta desta página que não vem do
 * servidor. Por quê: ela é PRÉVIA, não cobrança. Marcar uma caixinha tem que
 * atualizar o número na hora, e uma ida ao servidor por clique deixaria a
 * escolha travada. O que vale continua sendo o que o Medusa devolve quando o
 * botão é apertado — e é ele que aparece na gaveta um segundo depois.
 *
 * A barra de frete grátis usa a mesma constante do resto do site, então as
 * três telas (rotina, gaveta e garantias da dobra) prometem o mesmo piso.
 */

export type ItemEscolhivel = {
  varianteId: string
  nome: string
  foto: string | null
  preco: number
  /** o riscado, quando há promoção valendo */
  cheio: number | null
  passo: string
  para: string
  /** o produto desta página: entra marcado e não desmarca */
  fixo: boolean
}

export function RotinaEscolha({ itens }: { itens: readonly ItemEscolhivel[] }) {
  const [marcados, setMarcados] = useState<Set<string>>(
    () => new Set(itens.filter((i) => i.fixo).map((i) => i.varianteId))
  )
  const [recado, setRecado] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null)
  const [enviando, comecar] = useTransition()

  const escolhidos = itens.filter((i) => marcados.has(i.varianteId))
  const total = escolhidos.reduce((s, i) => s + i.preco, 0)
  const cheio = escolhidos.reduce((s, i) => s + (i.cheio ?? i.preco), 0)
  const politica = useFrete()
  const frases = frasesDoFrete(politica)
  const falta = faltaPraPromocao(politica, total)
  const porcento = progressoDaPromocao(politica, total)

  function alternar(id: string, fixo: boolean) {
    if (fixo) return
    setRecado(null)
    setMarcados((atual) => {
      const novo = new Set(atual)
      if (novo.has(id)) novo.delete(id)
      else novo.add(id)
      return novo
    })
  }

  function levar() {
    setRecado(null)
    comecar(async () => {
      const r = await adicionarVarios(escolhidos.map((i) => ({ varianteId: i.varianteId })))
      if (!r.ok) {
        setRecado({ tipo: "erro", texto: r.erro })
        return
      }
      setRecado({ tipo: "ok", texto: "Na sacola." })
      window.dispatchEvent(new CustomEvent(EVENTO_SACOLA, { detail: r.carrinho }))
    })
  }

  return (
    <>
      <div className="rotina__grade">
        {itens.map((item) => (
          <label
            className={item.fixo ? "rotina__item rotina__item--fixo" : "rotina__item"}
            key={item.varianteId}
          >
            <span className="rotina__passo">{item.passo}</span>

            {item.foto ? (
              <Image
                className="rotina__foto"
                src={item.foto}
                alt={item.nome}
                width={172}
                height={172}
                loading="lazy"
              />
            ) : null}

            <span className="rotina__corpo">
              <span className="rotina__marca">
                <input
                  type="checkbox"
                  checked={marcados.has(item.varianteId)}
                  disabled={item.fixo || enviando}
                  onChange={() => alternar(item.varianteId, item.fixo)}
                  aria-label={
                    item.fixo
                      ? `${item.nome} — é o produto desta página, já vai na rotina`
                      : `Levar também ${item.nome}`
                  }
                />
                <span className="rotina__nome">{item.nome}</span>
              </span>
              <span className="rotina__para">{item.para}</span>
              <span className="rotina__preco">
                {emReais(item.preco)} {item.cheio ? <s>{emReais(item.cheio)}</s> : null}
              </span>
            </span>
          </label>
        ))}
      </div>

      <div className="rotina__soma">
        <div>
          <p className="rotina__total">
            <span>
              {escolhidos.length} {escolhidos.length === 1 ? "item" : "itens"}
            </span>
            <b>{emReais(total)}</b>
            {cheio > total ? <s>{emReais(cheio)}</s> : null}
          </p>

          {/* A linha inteira some quando não há promoção de frete: ela
              existe pra empurrar a combinação pro piso, e sem piso não há
              pra onde empurrar. */}
          {frases && falta !== null && porcento !== null ? (
            <p className="rotina__frete">
              <span>
                {falta > 0 ? (
                  <>
                    Faltam <b>{emReais(falta)}</b> pr{frases.selo.toLowerCase().startsWith("frete") ? "o " : "a "}
                    {frases.selo.toLowerCase()}
                  </>
                ) : (
                  <>
                    <b>{frases.selo}</b> nesta combinação
                  </>
                )}
              </span>
              <span className="rotina__trilho" aria-hidden="true">
                <span className="rotina__barra" style={{ width: `${porcento}%` }} />
              </span>
            </p>
          ) : null}

          <p
            className={recado ? `rotina__recado rotina__recado--${recado.tipo}` : "rotina__recado"}
            role="status"
            aria-live="polite"
          >
            {recado?.texto ?? ""}
          </p>
        </div>

        <button
          type="button"
          className="btn rotina__comprar"
          onClick={levar}
          disabled={enviando || escolhidos.length === 0}
        >
          {enviando ? "Adicionando…" : "Levar a rotina"}
          <Raio className="btn__bolt" />
        </button>
      </div>
    </>
  )
}
