"use client"

import { useId, useState } from "react"
import { comissaoPorVenda, mesesPraPassarDoFixo, OFERTA, reais } from "@/lib/criadores-visivel"

/** Mais que isso, a régua fica em pedacinhos e a conta vira "mais de 3 anos". */
const MESES_NA_REGUA = 36

/**
 * QUANTO DÁ A COMISSÃO — a régua das vendas por mês, a comissão de cada mês e EM QUE MÊS ela passa
 * do fixo. A comissão não tem prazo (paga enquanto o vídeo vender), então a comparação com o fixo
 * não é "em N meses": é quantos meses de comissão cabem no fixo. A barra é o fixo inteiro, e cada
 * bloco é um mês de comissão, na mesma escala. Os números saem da `OFERTA`.
 *
 * NÃO É PROMESSA, e a tela diz: a conta usa o pedido médio da loja.
 */
export function Calculadora() {
  const id = useId()
  const [vendas, setVendas] = useState(30)
  const porMes = vendas * comissaoPorVenda()
  const meses = mesesPraPassarDoFixo(vendas)
  const blocos = meses ? Math.min(meses, MESES_NA_REGUA) : 0
  const largura = (porMes / OFERTA.fixo) * 100
  const veredito =
    meses === null
      ? `Sem venda, a comissão não paga nada. O fixo paga ${reais(OFERTA.fixo)} do mesmo jeito.`
      : meses === 1
        ? `Com ${vendas} vendas por mês, a comissão passa do fixo já no 1º mês — e continua pagando enquanto o vídeo vender.`
        : meses > MESES_NA_REGUA
          ? `Com ${vendas === 1 ? "1 venda" : `${vendas} vendas`} por mês, a comissão levaria mais de 3 anos pra passar do fixo: aí o fixo compensa.`
          : `Com ${vendas} vendas por mês, a comissão passa do fixo no ${meses}º mês — e continua pagando enquanto o vídeo vender.`

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
          Simulação com o pedido médio da loja, {reais(OFERTA.pedidoMedio)}. Não é promessa: o valor
          depende de quanto os anúncios com os seus vídeos venderem.
        </p>
      </div>
      <div aria-live="polite">
        <p className="criadores__calc-mes">
          <strong className="num" data-por-mes>
            {reais(porMes)}
          </strong>{" "}
          por mês de comissão, enquanto o vídeo vender
        </p>
        <div className="criadores__fixo">
          <div className="criadores__fixo-rotulos">
            <span>Os meses de comissão</span>
            <span className="num">Fixo: {reais(OFERTA.fixo)}</span>
          </div>
          <div className="criadores__blocos" aria-hidden="true">
            {Array.from({ length: blocos }, (_, i) => (
              <span
                key={i}
                className="criadores__bloco"
                style={{ width: `${largura}%` }}
                data-passou={i + 1 === meses || undefined}
              >
                {largura >= 7 ? i + 1 : ""}
              </span>
            ))}
          </div>
          <p className="criadores__fixo-legenda">
            A barra é o fixo inteiro; cada bloco, um mês de comissão.
          </p>
        </div>
        <p className="criadores__veredito" data-veredito data-meses={meses ?? ""}>
          {veredito}
        </p>
      </div>
    </div>
  )
}
