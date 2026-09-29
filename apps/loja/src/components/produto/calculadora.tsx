"use client"

import Image from "next/image"
import { useEffect, useId, useRef, useState, useSyncExternalStore, useTransition } from "react"
import { Caminhao, Raio } from "@/components/icones"
import { useFrete } from "@/components/configuracoes/contexto"
import { cotarFrete, type Cotacao, type OpcaoCotada } from "@/lib/acoes/frete"
import { mascararCep } from "@/lib/cep-formato"
import { cepGuardado, guardarCep } from "@/lib/cep-guardado"
import { fraseDoQueFalta, frasesDoFrete, pisoVale } from "@/lib/configuracoes"
import { emReais } from "@/lib/formato"
import type { ProdutoQueCombina } from "@/lib/pdp"

/**
 * QUANDO CHEGA NA SUA CASA — o CEP, o preço e o prazo.
 *
 * Entrou no lugar da barrinha de "faltam R$ 85,00 pro frete grátis". A
 * barrinha respondia uma pergunta que ninguém faz na página do produto; esta
 * responde a que todo cliente brasileiro faz antes de comprar — e mostra o
 * que falta pro frete grátis do mesmo jeito, agora ao lado de um número que
 * dá pra conferir.
 *
 * ┌─ POR QUE ISTO SUBSTITUI A BARRINHA, E NÃO CONVIVE COM ELA ─────────────┐
 * │ As duas ocupam o mesmo lugar na decisão: ficam entre o preço e o botão │
 * │ e falam de frete. Empilhadas, a coluna de compra ganha dois blocos     │
 * │ sobre o mesmo assunto e o botão desce meia tela no celular.            │
 * │                                                                        │
 * │ Na SACOLA a conta é outra e as duas convivem: lá a barrinha é o        │
 * │ empurrão ("faltam R$ 50, olha o que completa") e o bloco "Frete e      │
 * │ prazo" é a resposta.                                                   │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ TEM BOTÃO, E O BOTÃO NÃO É A ÚNICA COISA QUE COTA ────────────────────┐
 * │ O botão existe porque calcular frete é um pedido explícito: sem ele a  │
 * │ cotação aconteceria sozinha no meio da digitação, e a pessoa não teria │
 * │ como repetir quando o resultado parecesse errado.                      │
 * │                                                                        │
 * │ Mas DEPOIS da primeira cotação, trocar o kit de 1 pra 3 frascos recota │
 * │ sozinho — o peso mudou, e o preço que ficou na tela é de outro pedido. │
 * │ Frete errado exibido é oferta errada, e no art. 30 do CDC oferta       │
 * │ vincula. O botão então vira "recalcular", pra tentar de novo à mão.    │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O CEP FICA GUARDADO NO NAVEGADOR ─────────────────────────────────────┐
 * │ Quem já digitou uma vez não digita de novo: a próxima PDP, a sacola e  │
 * │ a visita de amanhã abrem com o CEP preenchido. É o mesmo que o         │
 * │ checkout vai pedir, então guardar adianta trabalho em vez de repetir.  │
 * │ Quem lê e escreve é `lib/cep-guardado.ts`, o mesmo da sacola.          │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * ESTA É A CALCULADORA DA PÁGINA DE PRODUTO, e só dela. A sacola tem a sua
 * (`components/sacola/entrega.tsx`), no desenho do protótipo: lá a pergunta
 * é outra — não "quanto custa", mas "como você quer receber" —, e a escolha
 * vira o frete do carrinho.
 */

export type ItemPraCotar = { varianteId: string; quantidade: number }

/**
 * "Correios PAC", "Loggi Express" — e nunca "Loggi Loggi Express".
 *
 * A Frenet manda transportadora e serviço em campos separados, e às vezes o
 * serviço já traz a transportadora dentro ("Loggi Express"). Juntar os dois
 * sem olhar produz a repetição, que é pequena e faz a loja parecer montada
 * por robô.
 */
function quemEntrega(o: OpcaoCotada): string | null {
  if (!o.transportadora) return null
  const servico = (o.servico ?? "").trim()
  if (!servico) return o.transportadora
  const jaTem = servico.toLowerCase().includes(o.transportadora.toLowerCase())
  return jaTem ? servico : `${o.transportadora} ${servico}`
}

/**
 * O PRODUTO QUE COMPLETA O FRETE GRÁTIS (0208): os candidatos em ordem, o
 * que já vai junto, e como marcar/desmarcar — é o mesmo `juntos` do "leve
 * junto" da caixa de compra, então o que entra aqui vai no Comprar.
 */
export type ParaCompletar = {
  candidatos: readonly ProdutoQueCombina[]
  escolhidos: ReadonlySet<string>
  alternar: (varianteId: string) => void
}

/** "Mais barata" e "Mais rápida" — a etiqueta de cada faixa, quando há duas. */
const ETIQUETA: Record<OpcaoCotada["faixa"], string> = {
  economica: "Mais barata",
  expressa: "Mais rápida",
}

export function CalculadoraDeFrete({
  itens,
  titulo = "Quando chega na sua casa",
  completar,
}: {
  /** O que está selecionado agora: o kit, a quantidade, o que foi marcado. */
  itens: ItemPraCotar[]
  titulo?: string
  completar?: ParaCompletar
}) {
  const politica = useFrete()
  // Id desta calculadora, e não "cep-frete" fixo: a PDP anterior fica guardada
  // no documento, e o rótulo apontaria pro campo dela (ver os degraus, em compra.tsx).
  const idDoCep = useId()

  /*
    O CEP GUARDADO ENTRA POR `useSyncExternalStore`, e não por um `useEffect`
    que chama `setCep` — que é o jeito óbvio e está errado duas vezes.

    A primeira: o servidor não tem `localStorage`, então ele renderiza vazio;
    se a primeira renderização do navegador já viesse preenchida, o HTML não
    bateria e o React reclamaria de hidratação. O terceiro argumento daqui é
    exatamente "o que valia no servidor", e o React usa ele durante a
    hidratação antes de trocar pelo de verdade.

    A segunda: `setState` dentro de efeito faz uma renderização a mais em
    toda montagem, e é o que a regra de lint cobra.
  */
  const salvo = useSyncExternalStore(
    () => () => {},
    cepGuardado,
    () => ""
  )
  /* `null` = ninguém digitou ainda, e aí vale o guardado. Depois do primeiro
     toque o digitado manda, INCLUSIVE quando é vazio — senão apagar o campo
     faria o CEP antigo reaparecer sozinho. */
  const [digitado, setDigitado] = useState<string | null>(null)
  const cep = digitado ?? mascararCep(salvo)
  const completo = cep.replace(/\D/g, "").length === 8

  const [cotacao, setCotacao] = useState<Cotacao | null>(null)
  /** Depois de cotar, o campo vira a linha "São Paulo · SP · Trocar"; "Trocar" volta o campo. */
  const [trocando, setTrocando] = useState(false)
  /** O que a pessoa pôs pelo cartão de completar — fica na caixa, com "Tirar". */
  const [posto, setPosto] = useState<string | null>(null)
  const campo = useRef<HTMLInputElement>(null)
  const [calculando, calcular] = useTransition()
  const ultimo = useRef("")

  /*
    A ASSINATURA DO QUE ESTÁ SELECIONADO, em texto.

    Ela entra nas dependências do efeito no lugar do array: `itens` é um
    array novo a cada render do componente pai, e um array nas dependências
    dispara o efeito PARA SEMPRE, numa cotação por milissegundo. A string só
    muda quando a escolha muda de verdade.
  */
  const assinatura = itens.map((i) => `${i.varianteId}:${i.quantidade}`).join(",")

  function cotar(cepLimpo: string) {
    ultimo.current = `${cepLimpo}|${assinatura}`
    calcular(async () => {
      const r = await cotarFrete(cepLimpo, itens)
      setCotacao(r)
      if (r.ok) {
        guardarCep(cepLimpo)
        setTrocando(false)
      }
    })
  }

  /*
    Recota quando a ESCOLHA muda — e só depois de já ter cotado uma vez.
    Antes disso quem manda é o botão: ninguém pediu preço de frete ainda.
  */
  useEffect(() => {
    if (!ultimo.current || !completo || !itens.length) return
    const cepLimpo = cep.replace(/\D/g, "")
    if (ultimo.current === `${cepLimpo}|${assinatura}`) return

    const id = setTimeout(() => cotar(cepLimpo), 450)
    return () => clearTimeout(id)
    // `itens`, `cep` e `cotar` ficam de fora: quem representa a escolha aqui
    // é a `assinatura`, e `cotar` é recriado a cada render. Ver a caixa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assinatura, completo])

  // "Trocar" devolve o campo com o cursor nele: é pra digitar outro CEP.
  useEffect(() => {
    if (trocando) campo.current?.focus()
  }, [trocando])

  const resultado = cotacao?.ok ? cotacao : null
  const falta = resultado?.faltaPraGratis ?? null
  const frases = frasesDoFrete(politica)
  const meta = pisoVale(politica) && politica.modo !== "nenhuma" ? politica : null
  const resumido = Boolean(resultado) && !trocando

  /*
    O QUE COMPLETA: um candidato que SOZINHO fecha o que falta (a regra dos
    chips do checkout, \`escolherParaOFrete\`: um de R$ 20 quando faltam R$ 40
    manda clicar duas vezes pra descobrir que não deu) — e, entre os que
    fecham, o MAIS BARATO: faltando R$ 30, o kit de R$ 99,90 também fecha,
    mas não é a sugestão de ninguém. No empate, a ordem que veio (o "leve
    junto" da loja primeiro, depois o motor). Nada do que já vai junto.
  */
  const jaPosto =
    completar && posto && completar.escolhidos.has(posto)
      ? (completar.candidatos.find((c) => c.varianteId === posto) ?? null)
      : null
  // Com um já posto pelo cartão, ele fica no lugar — até a recotação chegar, o "falta" ainda é o de antes.
  const sugerido =
    !jaPosto && completar && meta && falta !== null && falta > 0
      ? completar.candidatos
          .filter((c) => c.preco >= falta && !completar.escolhidos.has(c.varianteId))
          .reduce<ProdutoQueCombina | null>((m, c) => (!m || c.preco < m.preco ? c : m), null)
      : null
  const oQueGanha = meta?.modo === "fixo" ? `sai por ${emReais(meta.preco)}` : "sai grátis"

  /* Duas faixas: as etiquetas. Uma só (o empate que o servidor tira): sem etiqueta. */
  const opcoes = resultado?.opcoes ?? []
  const comEtiqueta = opcoes.length > 1

  return (
    <form
      className="cep"
      onSubmit={(e) => {
        e.preventDefault()
        if (completo && !calculando) cotar(cep.replace(/\D/g, ""))
      }}
    >
      <p className="cep__titulo">
        <Caminhao />
        {titulo}
      </p>

      {resumido && resultado ? (
        <p className="cep__onde">
          <span>
            {resultado.lugar ? (
              <b>
                {resultado.lugar.cidade} · {resultado.lugar.uf}
              </b>
            ) : null}{" "}
            <span className="cep__onde-cep">{mascararCep(resultado.cep)}</span>
          </span>
          <button type="button" className="cep__trocar" onClick={() => setTrocando(true)}>
            Trocar
          </button>
        </p>
      ) : (
        <div className="cep__linha">
          <label className="sr-only" htmlFor={idDoCep}>
            CEP de entrega
          </label>
          <input
            ref={campo}
            id={idDoCep}
            className="cep__campo"
            type="text"
            inputMode="numeric"
            autoComplete="postal-code"
            placeholder="00000-000"
            maxLength={9}
            value={cep}
            onChange={(e) => setDigitado(mascararCep(e.target.value))}
          />
          <button type="submit" className="cep__botao" disabled={!completo || calculando}>
            {calculando ? "Calculando…" : "Calcular"}
          </button>
        </div>
      )}

      {/*
        `aria-live` polido: o resultado chega depois de um clique que a pessoa
        deu, e interromper o leitor de tela no meio de outra coisa seria
        grosseria. O bloco existe sempre, mesmo vazio — região viva que nasce
        junto com o conteúdo costuma não ser anunciada.
      */}
      <div
        className="cep__resposta"
        role="status"
        aria-live="polite"
        data-calculando={calculando ? "" : undefined}
      >
        {cotacao && !cotacao.ok ? <p className="cep__erro">{cotacao.mensagem}</p> : null}

        {/* O benefício já garantido vem antes das entregas: é a resposta que a pessoa queria. */}
        {resultado && meta && frases && falta === 0 ? (
          <p className="cep__garantido">
            <Raio />
            {frases.selo} garantido
          </p>
        ) : null}

        {opcoes.length ? (
          <ul className="cep__opcoes" data-uma={comEtiqueta ? undefined : ""}>
            {opcoes.map((o) => (
              <li className="cep__opcao" key={o.faixa}>
                {comEtiqueta ? <span className="cep__etiqueta">{ETIQUETA[o.faixa]}</span> : null}
                <span className="cep__opcao-preco" data-gratis={o.preco === 0 ? "" : undefined}>
                  {o.preco === 0 ? "Grátis" : emReais(o.preco)}
                </span>
                {o.prazo ? <span className="cep__opcao-prazo">Chega em {o.prazo}</span> : null}
                {/*
                  Quem entrega fica embaixo, e só quando existe. Na emergência
                  não existe — ninguém cotou —, e escrever "Correios" ali seria
                  inventar a transportadora de um frete que a loja arbitrou.
                */}
                {quemEntrega(o) ? <span className="cep__quem">{quemEntrega(o)}</span> : null}
              </li>
            ))}
          </ul>
        ) : null}

        {/*
          O QUE FALTA PRO FRETE GRÁTIS, com a barra: ao lado do preço que a
          pessoa acabou de ver, é um número pra comparar.
        */}
        {resultado && meta && falta !== null && falta > 0 ? (
          <div className="cep__falta">
            <p className="cep__falta-frase">
              <Raio />
              <FraseComValor
                frase={fraseDoQueFalta(politica, falta) ?? ""}
                valor={emReais(falta)}
              />
            </p>
            <span className="cep__barra" aria-hidden="true">
              <span
                style={{
                  width: `${Math.max(4, Math.min(100, Math.round(((meta.piso - falta) / meta.piso) * 100)))}%`,
                }}
              />
            </span>
          </div>
        ) : null}

        {sugerido && completar ? (
          <div className="cep__completa">
            <span className="cep__completa-foto">
              {sugerido.foto ? (
                <Image src={sugerido.foto} alt="" width={40} height={40} sizes="40px" />
              ) : null}
            </span>
            <span className="cep__completa-texto">
              <span className="cep__completa-nome">
                <span className="cep__completa-produto">+ {nomeCurto(sugerido.nome)}</span>
                <span className="cep__completa-preco">{emReais(sugerido.preco)}</span>
              </span>
              <span className="cep__completa-ganho">e o frete {oQueGanha}</span>
            </span>
            <button
              type="button"
              className="cep__completa-botao"
              aria-label={`Adicionar ${sugerido.nome} ao pedido`}
              onClick={() => {
                setPosto(sugerido.varianteId)
                completar.alternar(sugerido.varianteId)
              }}
            >
              Adicionar
            </button>
          </div>
        ) : null}

        {jaPosto && completar ? (
          <div className="cep__completa" data-posto="">
            <span className="cep__completa-foto">
              {jaPosto.foto ? (
                <Image src={jaPosto.foto} alt="" width={40} height={40} sizes="40px" />
              ) : null}
            </span>
            <span className="cep__completa-texto">
              <span className="cep__completa-nome">
                <span className="cep__completa-produto">+ {nomeCurto(jaPosto.nome)}</span>
                <span className="cep__completa-preco">{emReais(jaPosto.preco)}</span>
              </span>
              <span className="cep__completa-ganho">vai junto no pedido</span>
            </span>
            <button
              type="button"
              className="cep__completa-tirar"
              aria-label={`Tirar ${jaPosto.nome} do pedido`}
              onClick={() => {
                setPosto(null)
                completar.alternar(jaPosto.varianteId)
              }}
            >
              Tirar
            </button>
          </div>
        ) : null}

        {/*
          A ressalva da emergência é obrigatória, não decorativa: nesse
          caminho o preço não veio de transportadora nenhuma, e o prazo é uma
          promessa que a loja escolheu.
        */}
        {resultado?.emergencia ? (
          <p className="cep__aviso">
            Estimativa — a transportadora não respondeu agora, e este é o valor que a loja cobra
            nessas horas.
          </p>
        ) : null}
      </div>
    </form>
  )
}

/** "Faltam R$ 40,00 pro frete grátis", com o valor destacado. */
function FraseComValor({ frase, valor }: { frase: string; valor: string }) {
  const i = frase.indexOf(valor)
  if (i < 0) return <>{frase}</>
  return (
    <>
      {frase.slice(0, i)}
      <mark>{valor}</mark>
      {frase.slice(i + valor.length)}
    </>
  )
}

/**
 * "Shampoo para Barba 120ml" → "Shampoo para Barba": o cartão tem uma linha,
 * e a medida não ajuda a decidir. O nome inteiro fica no rótulo do botão.
 */
function nomeCurto(nome: string): string {
  return nome.replace(/\s+\d+\s*(ml|g|un)\b.*$/i, "").trim() || nome
}
