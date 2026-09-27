"use client"

import { useState, useTransition } from "react"
import { useAvisar } from "@/components/avisos"
import { Icone, type NomeDoIcone } from "@/components/icones"
import { salvarAjustesDoCrm } from "@/lib/acoes/crm"
import type {
  AjustesDoCrm,
  FormularioDosAjustes,
  RegraDoCrm,
  TelaDosAjustes,
  TipoDeProduto,
} from "@/lib/crm"

/**
 * OS AJUSTES DO CRM NA TELA — quanto dura cada tipo de produto e as regras
 * das etiquetas. O desenho é o da tabela dos acessos: o que é diferente do
 * padrão fica em amarelo, e embaixo vêm as mudanças sem salvar, o
 * "Desfazer", o "Voltar ao padrão" e o "Salvar". Quem confere e grava é o
 * Medusa (`POST /dashboard/crm/ajustes`); o erro volta embaixo do campo.
 */

type Linha = { regra: RegraDoCrm; titulo: string; antes?: string; depois: string }

/** As regras, em frase: o nome em cima, o número no começo da frase. */
const GRUPOS: { nome: string; icone: NomeDoIcone; linhas: Linha[] }[] = [
  {
    nome: "Etapa",
    icone: "clientes",
    linhas: [
      {
        regra: "toleranciaDaReposicao",
        titulo: "Em risco",
        depois: "dias depois do dia de comprar de novo",
      },
      {
        regra: "semPrevisao",
        titulo: "Em risco, sem saber quanto o produto dura",
        depois: "dias sem pedido",
      },
      {
        regra: "sunset",
        titulo: "Sunset",
        depois: "dias em risco, sem clicar nem visitar a loja",
      },
    ],
  },
  {
    nome: "Engajamento",
    icone: "raio",
    linhas: [
      {
        regra: "quente",
        titulo: "Quente",
        antes: "até",
        depois: "dias do último clique, visita, compra ou newsletter",
      },
      { regra: "morno", titulo: "Morno", antes: "até", depois: "dias (depois disso, frio)" },
    ],
  },
  {
    nome: "Sensível a cupom",
    icone: "cupons",
    linhas: [
      {
        regra: "comprasDoCupom",
        titulo: "É “Sim” quando",
        antes: "as últimas",
        depois: "compras foram todas com cupom",
      },
    ],
  },
]

const TIPOS: TipoDeProduto[] = ["fator", "oleo", "shampoo", "balm", "spray", "pasta"]
const REGRAS: RegraDoCrm[] = GRUPOS.flatMap((g) => g.linhas.map((l) => l.regra))

const emTexto = (a: AjustesDoCrm): FormularioDosAjustes => ({
  dias: Object.fromEntries(TIPOS.map((t) => [t, String(a.dias[t])])) as Record<
    TipoDeProduto,
    string
  >,
  regras: Object.fromEntries(REGRAS.map((r) => [r, String(a.regras[r])])) as Record<
    RegraDoCrm,
    string
  >,
})

const igual = (texto: string, numero: number) => texto.trim() === String(numero)

/** Com menos recompras que isso, o número da Nuvemshop ainda é chute: não entra no botão. */
const RECOMPRAS_PRA_VALER = 10

/** Quantos campos estão diferentes do que está gravado. */
function pendentesEntre(f: FormularioDosAjustes, a: AjustesDoCrm): number {
  let n = 0
  for (const t of TIPOS) if (!igual(f.dias[t], a.dias[t])) n++
  for (const r of REGRAS) if (!igual(f.regras[r], a.regras[r])) n++
  return n
}

/** "3 Fator" → os dias do kit de 3, se o campo do Fator tem um número. */
function exemploDoFator(texto: string): string | null {
  const n = Number(texto.trim())
  if (!Number.isInteger(n) || n < 1) return null
  return `Quem levou o Kit 3 Fator: acaba ${3 * n} dias depois da entrega.`
}

export function FormularioDosAjustes({ tela }: { tela: TelaDosAjustes }) {
  const avisar = useAvisar()
  const inicial = emTexto(tela.ajustes)
  const [f, setF] = useState<FormularioDosAjustes>(inicial)
  const [erros, setErros] = useState<Record<string, string>>({})
  const [salvando, comecar] = useTransition()

  const pendentes = pendentesEntre(f, tela.ajustes)
  const noPadrao = pendentesEntre(f, tela.padrao) === 0

  const mudarDias = (t: TipoDeProduto, v: string) =>
    setF((a) => ({ ...a, dias: { ...a.dias, [t]: v } }))
  const mudarRegra = (r: RegraDoCrm, v: string) =>
    setF((a) => ({ ...a, regras: { ...a.regras, [r]: v } }))

  function salvar() {
    if (salvando || !pendentes) return
    comecar(async () => {
      const r = await salvarAjustesDoCrm(f)
      setErros(r.erros ?? {})
      avisar({ ok: r.ok, texto: r.texto })
    })
  }

  /** O campo do número: amarelo quando é diferente do padrão. */
  const numero = (c: {
    valor: string
    padrao: number
    chave: string
    rotulo: string
    mudar: (v: string) => void
    dias?: TipoDeProduto
    regra?: RegraDoCrm
  }) => (
    <span className="ajuste__numero" data-mudado={igual(c.valor, c.padrao) ? undefined : ""}>
      <input
        type="text"
        inputMode="numeric"
        value={c.valor}
        disabled={salvando}
        aria-label={c.rotulo}
        aria-invalid={erros[c.chave] ? true : undefined}
        data-dias={c.dias}
        data-regra={c.regra}
        onChange={(e) => c.mudar(e.target.value.replace(/[^\d]/g, "").slice(0, 3))}
      />
    </span>
  )

  const erroDe = (chave: string) =>
    erros[chave] ? (
      <p className="campo__erro ajuste__erro" role="alert" data-erro={chave}>
        {erros[chave]}
      </p>
    ) : null

  const exemplo = exemploDoFator(f.dias.fator)
  const daNuvemshop = tela.nuvemshop
  /** Os tipos com recompra suficiente na loja antiga, e o número dela. */
  const doHistorico = TIPOS.flatMap((t) => {
    const r = daNuvemshop?.[t]
    return r && r.recompras >= RECOMPRAS_PRA_VALER ? [[t, r.dias] as const] : []
  })
  const jaUsaOHistorico = doHistorico.every(([t, dias]) => igual(f.dias[t], dias))

  return (
    <>
      <section className="bloco" aria-labelledby="ajustes-dias" data-ajustes-dias>
        <div className="bloco__cabeca">
          <div>
            <h2 className="bloco__titulo" id="ajustes-dias">
              Quanto dura cada produto
            </h2>
            <p className="bloco__sub">
              Em dias, por unidade, a contar da entrega. A próxima compra de cada pessoa é a entrega
              do último pedido mais o que dura o primeiro produto a acabar.
            </p>
          </div>
        </div>
        <ul className="ajustes-tipos">
          {tela.tipos.map(({ tipo, nome, produtos }) => (
            <li key={tipo} className="ajuste-tipo" data-tipo={tipo}>
              <span className="fila__ico">
                <Icone nome="produtos" />
              </span>
              <div className="ajuste-tipo__nome">
                <p className="ajuste-tipo__titulo">{nome}</p>
                <p className="ajuste-tipo__produtos" data-produtos-do-tipo={tipo}>
                  {produtos.length ? produtos.join(" · ") : "Nenhum produto da loja agora."}
                </p>
                {daNuvemshop ? (
                  <p className="ajuste-tipo__historico" data-historico-do-tipo={tipo}>
                    {daNuvemshop[tipo]
                      ? `Na Nuvemshop: ${daNuvemshop[tipo].dias} dias até comprar de novo (${daNuvemshop[tipo].recompras} ${daNuvemshop[tipo].recompras === 1 ? "recompra" : "recompras"})`
                      : "Na Nuvemshop: ninguém comprou de novo ainda"}
                  </p>
                ) : null}
                {erroDe(`dias.${tipo}`)}
              </div>
              <label className="ajuste-tipo__campo">
                {numero({
                  valor: f.dias[tipo],
                  padrao: tela.padrao.dias[tipo],
                  chave: `dias.${tipo}`,
                  rotulo: `${nome}: dias por unidade`,
                  mudar: (v) => mudarDias(tipo, v),
                  dias: tipo,
                })}
                <span className="ajuste__unidade">dias</span>
              </label>
            </li>
          ))}
        </ul>
        {doHistorico.length ? (
          <div className="ajustes-historico">
            <p className="pequeno suave">
              A mediana dos dias entre uma compra e a seguinte do mesmo produto, por unidade, nos
              pedidos da loja antiga. Só entram no botão os produtos com {RECOMPRAS_PRA_VALER}{" "}
              recompras ou mais.
            </p>
            <button
              type="button"
              className="btn btn--contorno btn--menor"
              disabled={salvando || jaUsaOHistorico}
              data-usar-historico
              onClick={() => {
                setErros({})
                setF((a) => ({
                  ...a,
                  dias: {
                    ...a.dias,
                    ...Object.fromEntries(doHistorico.map(([t, d]) => [t, String(d)])),
                  },
                }))
              }}
            >
              Usar os números da Nuvemshop
            </button>
          </div>
        ) : null}
        {exemplo ? (
          <p className="ajuste-exemplo" data-exemplo-do-fator>
            <Icone nome="clientes" />
            <span>{exemplo}</span>
          </p>
        ) : null}
        {tela.foraDaConta.length ? (
          <p className="pequeno suave ajustes-fora" data-fora-da-conta>
            <b>Fora da conta da próxima compra:</b> {tela.foraDaConta.join(" · ")}. Pelo nome, não
            dá pra saber o que vem neles. Se algum deles devia contar, peça pra incluir.
          </p>
        ) : null}
      </section>

      <section className="bloco" aria-labelledby="ajustes-regras" data-ajustes-regras>
        <div className="bloco__cabeca">
          <div>
            <h2 className="bloco__titulo" id="ajustes-regras">
              As regras das etiquetas
            </h2>
            <p className="bloco__sub">
              Quando cada pessoa muda de etapa, de engajamento, e quando ela é sensível a cupom.
            </p>
          </div>
        </div>
        <div className="ajustes-grupos">
          {GRUPOS.map((g) => (
            <div key={g.nome} className="ajuste-grupo">
              <p className="ajuste-grupo__nome">
                <Icone nome={g.icone} />
                {g.nome}
              </p>
              {g.linhas.map((l) => (
                <div key={l.regra} className="ajuste-regra" data-regra-linha={l.regra}>
                  <p className="ajuste-regra__titulo">{l.titulo}</p>
                  <label className="ajuste-regra__frase">
                    {l.antes ? <span>{l.antes}</span> : null}
                    {numero({
                      valor: f.regras[l.regra],
                      padrao: tela.padrao.regras[l.regra],
                      chave: `regras.${l.regra}`,
                      rotulo: `${l.titulo}: ${l.antes ?? ""} … ${l.depois}`,
                      mudar: (v) => mudarRegra(l.regra, v),
                      regra: l.regra,
                    })}
                    <span>{l.depois}</span>
                  </label>
                  {erroDe(`regras.${l.regra}`)}
                </div>
              ))}
            </div>
          ))}
        </div>

        <div className="acessos__pe ajustes__pe">
          <p className="acessos__legenda">
            <span className="acessos__amostra" aria-hidden="true" />
            Em amarelo: diferente do padrão da loja.
          </p>
          <div className="acessos__acoes">
            {pendentes ? (
              <span className="acessos__pendentes" role="status" data-pendentes={pendentes}>
                {pendentes === 1 ? "1 mudança sem salvar" : `${pendentes} mudanças sem salvar`}
              </span>
            ) : null}
            {pendentes ? (
              <button
                type="button"
                className="btn btn--fantasma"
                disabled={salvando}
                data-desfazer
                onClick={() => {
                  setErros({})
                  setF(inicial)
                }}
              >
                Desfazer
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn--contorno btn--menor"
              disabled={salvando || noPadrao}
              data-voltar-ao-padrao
              onClick={() => {
                setErros({})
                setF(emTexto(tela.padrao))
              }}
            >
              Voltar ao padrão
            </button>
            <button
              type="button"
              className="btn btn--menor"
              disabled={salvando || !pendentes}
              aria-busy={salvando || undefined}
              data-salvar-ajustes
              onClick={salvar}
            >
              {salvando ? <span className="giro" aria-hidden="true" /> : null}
              Salvar ajustes
            </button>
          </div>
          <ul className="acessos__notas">
            <li>
              Valem na próxima ficha de cliente que abrir (Clientes → a pessoa). Os e-mails
              automáticos, quando chegarem, vão usar os mesmos números.
            </li>
            <li>
              Os números do padrão são os do plano do CRM. O histórico da Nuvemshop vai mostrar
              quanto cada produto dura de verdade.
            </li>
          </ul>
        </div>
      </section>
    </>
  )
}
