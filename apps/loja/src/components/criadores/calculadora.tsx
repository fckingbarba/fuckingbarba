"use client"

import { useId, useState } from "react"
import { comissaoPorVenda, OFERTA, reais, vendasPraPassarDoFixo } from "@/lib/criadores-visivel"

/**
 * QUANTO DÁ A COMISSÃO — a régua das vendas por mês, e as duas barras (o fixo
 * e a comissão no prazo inteiro), na mesma escala. Os números saem da
 * `OFERTA`: mudou a proposta, a conta muda junto.
 *
 * NÃO É PROMESSA, e a tela diz: a conta usa o pedido médio da loja e supõe o
 * vídeo rodando o prazo inteiro — anúncio costuma cansar antes.
 */
export function Calculadora() {
  const id = useId()
  const [vendas, setVendas] = useState(30)
  const porMes = vendas * comissaoPorVenda()
  const total = porMes * OFERTA.meses
  const topo = Math.max(OFERTA.fixo, total)
  const veredito =
    vendas === 0
      ? `Sem venda, a comissão não paga nada. O fixo paga ${reais(OFERTA.fixo)} do mesmo jeito.`
      : total > OFERTA.fixo
        ? `Com ${vendas} vendas por mês, a comissão rende ${reais(total - OFERTA.fixo)} a mais que o fixo.`
        : total < OFERTA.fixo
          ? `Com ${vendas === 1 ? "1 venda" : `${vendas} vendas`} por mês, o fixo rende ${reais(OFERTA.fixo - total)} a mais.`
          : `Com ${vendas} vendas por mês, dá empate.`

  return (
    <div className="criadores__calc" data-calculadora>
      <div>
        <h3 className="criadores__h3">Quanto dá a comissão?</h3>
        <label className="criadores__calc-rotulo" htmlFor={`${id}-vendas`}>
          Vendas por mês com os seus vídeos
        </label>
        <div className="criadores__regua">
          <input
            id={`${id}-vendas`}
            type="range"
            min={0}
            max={120}
            step={1}
            value={vendas}
            onChange={(e) => setVendas(Number(e.target.value))}
          />
          <output htmlFor={`${id}-vendas`} className="num" data-vendas>
            {vendas}
          </output>
        </div>
        <p className="criadores__calc-nota">
          Simulação com o pedido médio da loja, {reais(OFERTA.pedidoMedio)}, e o vídeo rodando os{" "}
          {OFERTA.meses} meses. Não é promessa: o valor depende de quanto os anúncios com os seus
          vídeos venderem.
        </p>
      </div>
      <div aria-live="polite">
        <p className="criadores__calc-mes">
          <strong className="num" data-por-mes>
            {reais(porMes)}
          </strong>{" "}
          por mês de comissão
        </p>
        <div className="criadores__barras">
          <div className="criadores__barra">
            <span className="criadores__barra-nome">Fixo</span>
            <span className="criadores__barra-valor num">{reais(OFERTA.fixo)}</span>
            <span className="criadores__barra-trilho">
              <span
                className="criadores__barra-cheia"
                data-tipo="fixo"
                style={{ width: `${(OFERTA.fixo / topo) * 100}%` }}
              />
            </span>
          </div>
          <div className="criadores__barra">
            <span className="criadores__barra-nome">Comissão em {OFERTA.meses} meses</span>
            <span className="criadores__barra-valor num" data-total>
              {reais(total)}
            </span>
            <span className="criadores__barra-trilho">
              <span
                className="criadores__barra-cheia"
                data-tipo="comissao"
                style={{ width: `${(total / topo) * 100}%` }}
              />
            </span>
          </div>
        </div>
        <p className="criadores__veredito" data-veredito>
          {veredito}
        </p>
        <p className="criadores__calc-nota">
          A comissão passa do fixo a partir de {vendasPraPassarDoFixo()} vendas por mês.
        </p>
      </div>
    </div>
  )
}
