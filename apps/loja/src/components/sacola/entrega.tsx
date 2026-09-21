"use client"

import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react"
import { Caminhao } from "@/components/icones"
import { useSacola } from "@/components/sacola/contexto"
import {
  calcularNaSacola,
  cotarDaSacola,
  escolherNaSacola,
  type EntregaDaSacola,
} from "@/lib/acoes/frete"
import { mascararCep } from "@/lib/cep-formato"
import { cepGuardado, guardarCep } from "@/lib/cep-guardado"
import type { CarrinhoVisivel } from "@/lib/carrinho-visivel"
import { emReais } from "@/lib/formato"

/**
 * FRETE E PRAZO — o bloco da sacola, no desenho do protótipo.
 *
 * Sai de `ferramentas/porte/prototipo.html` (`.sacolinha__entrega`): o campo
 * colado no botão preto, as entregas como cartões com o losango, "Grátis"
 * com o preço cheio riscado embaixo, "Entrega para o CEP … alterar" e o
 * "Não sei meu CEP". O CSS é o do protótipo, movido do `sacola-adiado.css`
 * pro `sacola.css` na ordem em que estava.
 *
 * ┌─ NÃO É A CALCULADORA DA PDP, E A DIFERENÇA É DE PERGUNTA ──────────────┐
 * │ Na página de produto a pergunta é "quanto custa e quando chega?", e a │
 * │ resposta é uma lista pra ler. Na sacola a pergunta é "como você quer  │
 * │ receber?": as entregas viram opções de escolher, e a escolha tem      │
 * │ efeito — vira o frete do carrinho, muda o total do pé da gaveta e     │
 * │ chega marcada no checkout. Por isso o bloco é outro, e não a mesma    │
 * │ calculadora com outro título (que era o que estava aqui).             │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ A TELA NÃO SOMA FRETE COM PRODUTO ────────────────────────────────────┐
 * │ No protótipo a gaveta somava sozinha. Aqui cada escolha grava no      │
 * │ carrinho do Medusa (`acoes/frete.ts`) e o pé mostra o que ele         │
 * │ devolveu: subtotal, frete e total. É a regra da gaveta inteira — o    │
 * │ dia em que ela fizer a própria conta, vai discordar do checkout.      │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ QUANDO COTA SEM NINGUÉM CLICAR ───────────────────────────────────────┐
 * │ O primeiro "Calcular" é sempre da pessoa. Depois dele, o carrinho tem │
 * │ CEP e entrega, e aí a lista se refaz sozinha em dois momentos: quando │
 * │ a gaveta abre (a pessoa calculou ontem, ou voltou do checkout) e      │
 * │ quando a sacola muda — outro frasco muda o peso, e o preço que estava │
 * │ na tela passou a ser de outro pedido.                                 │
 * └────────────────────────────────────────────────────────────────────────┘
 */

/** O que a tela mostra, e pra qual carrinho aquilo foi cotado. */
type Lista = {
  cep: string
  emergencia: boolean
  opcoes: EntregaDaSacola[]
  /** CEP + itens do carrinho no instante da cotação. Mudou, a lista envelheceu. */
  chave: string
}

/** "Digite os 8 números do CEP." — o texto do protótipo. */
const CEP_TORTO = "Digite os 8 números do CEP."

/*
  Quando a AÇÃO nem chega a responder — a conexão caiu no meio, o servidor
  reiniciou. As ações devolvem erro por extenso e não lançam; o que lança é
  a ida até elas, e sem este texto o botão ficaria preso em "Calculando…".
*/
const FORA_DO_AR = "Não consegui falar com a loja agora. Tenta de novo em instantes."

/*
  A ASSINATURA DO CARRINHO, em texto: o CEP gravado mais variante e
  quantidade de cada linha. Ela decide se a lista na tela ainda é deste
  carrinho — e entra nas dependências do efeito no lugar dos arrays, que são
  novos a cada render e disparariam o efeito sem parar.
*/
const chaveDo = (c: CarrinhoVisivel) =>
  `${c.cep}|${c.itens.map((i) => `${i.varianteId}:${i.quantidade}`).join(",")}`

const prazoDe = (o: EntregaDaSacola) => (o.prazo ? `Chega em ${o.prazo}` : "")

export function FreteEPrazo() {
  const sacola = useSacola()

  /*
    O CEP que a pessoa já digitou numa página de produto. Entra por
    `useSyncExternalStore` pelo mesmo motivo da calculadora da PDP: o
    servidor não tem `localStorage`, e o terceiro argumento é o que vale
    durante a hidratação.
  */
  const salvo = useSyncExternalStore(
    () => () => {},
    cepGuardado,
    () => ""
  )
  /* `null` = ninguém digitou; aí vale o CEP do carrinho, ou o guardado. */
  const [digitado, setDigitado] = useState<string | null>(null)
  const [lista, setLista] = useState<Lista | null>(null)
  const [alterando, setAlterando] = useState(false)
  const [calculando, setCalculando] = useState(false)
  const [atualizando, setAtualizando] = useState(false)
  /** A entrega clicada, enquanto o Medusa não confirma. */
  const [escolhendo, setEscolhendo] = useState<string | null>(null)
  const [erro, setErro] = useState("")
  const [fala, setFala] = useState("")

  const campo = useRef<HTMLInputElement>(null)
  const primeira = useRef<HTMLInputElement>(null)
  const querFoco = useRef<"opcao" | "campo" | null>(null)
  const tentada = useRef("")

  const carrinho = sacola?.carrinho
  const chave = carrinho ? chaveDo(carrinho) : ""
  const temEntrega = Boolean(carrinho?.cep && carrinho?.freteEscolhido)
  const aberta = sacola?.aberta ?? false
  const ocupada = sacola?.ocupada ?? false
  const chaveDaLista = lista?.chave ?? null

  /*
    A LISTA SE REFAZ SOZINHA quando o carrinho tem CEP e entrega e a lista da
    tela não é deste carrinho — a gaveta abriu agora, ou um "+" mudou o peso.
    Só com a gaveta aberta: fechada, ninguém está olhando, e cotar pra
    ninguém é gastar a conta da Frenet.

    `tentada` segura a repetição: se a cotação falhar, a chave não muda, e
    sem isto o efeito tentaria de novo a cada render.

    A espera de 450 ms é pra quem aperta "+" três vezes seguidas: uma
    cotação no fim, e não três. Na primeira abertura não há o que juntar, e
    esperar só deixaria o botão dizendo "Calcular" por meio segundo antes de
    a lista aparecer.
  */
  useEffect(() => {
    if (!aberta || !temEntrega || alterando || ocupada) return
    if (chaveDaLista === chave || tentada.current === chave) return

    const id = setTimeout(
      async () => {
        tentada.current = chave
        setAtualizando(true)
        const r = await cotarDaSacola().catch(() => ({ ok: false as const, mensagem: FORA_DO_AR }))
        setAtualizando(false)
        if (r.ok) {
          setLista({ cep: r.cep, emergencia: r.emergencia, opcoes: r.opcoes, chave })
          setErro("")
        } else {
          setLista(null)
          setErro(r.mensagem)
        }
      },
      chaveDaLista ? 450 : 0
    )
    return () => clearTimeout(id)
  }, [aberta, temEntrega, alterando, ocupada, chave, chaveDaLista])

  /*
    O foco vai num efeito, e não logo depois do clique: no instante do
    clique o elemento de destino ainda não existe (as opções) ou está com
    `hidden` (o campo), e focar o que não está na tela não faz nada.
  */
  const mostrandoLista = Boolean(
    lista && temEntrega && !alterando && carrinho && lista.cep === carrinho.cep
  )
  useEffect(() => {
    if (querFoco.current === "opcao" && mostrandoLista) primeira.current?.focus()
    if (querFoco.current === "campo" && !mostrandoLista) {
      campo.current?.focus()
      campo.current?.select()
    }
    querFoco.current = null
  }, [mostrandoLista])

  if (!sacola || !carrinho) return null
  const { comCarrinho } = sacola
  const atual = carrinho

  const cep = digitado ?? mascararCep(atual.cep || salvo)

  async function calcular(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault()
    if (calculando) return

    const limpo = cep.replace(/\D+/g, "")
    if (limpo.length !== 8) {
      setErro(CEP_TORTO)
      campo.current?.focus()
      return
    }

    setErro("")
    setCalculando(true)
    const r = await comCarrinho(() => calcularNaSacola(limpo)).catch(() => ({
      ok: false as const,
      mensagem: FORA_DO_AR,
    }))
    setCalculando(false)

    if (!r.ok) {
      setErro(r.mensagem)
      return
    }

    guardarCep(limpo)
    const novo = r.carrinho ?? atual
    setLista({ cep: r.cep, emergencia: r.emergencia, opcoes: r.opcoes, chave: chaveDo(novo) })
    tentada.current = chaveDo(novo)
    setAlterando(false)
    setDigitado(null)
    querFoco.current = "opcao"

    const marcada = r.opcoes.find((o) => o.id === novo.freteEscolhido) ?? r.opcoes[0]
    if (marcada) {
      const preco = marcada.preco === 0 ? "grátis" : emReais(marcada.preco)
      setFala(`Frete calculado. ${marcada.nome}, ${prazoDe(marcada)}, ${preco}.`)
    }
  }

  async function escolher(o: EntregaDaSacola) {
    // Uma troca por vez: a segunda, com a primeira no ar, seria outra
    // escrita no mesmo carrinho ao mesmo tempo.
    if (escolhendo || o.id === atual.freteEscolhido) return

    setErro("")
    setEscolhendo(o.id)
    const r = await comCarrinho(() => escolherNaSacola(o.id)).catch(() => ({
      ok: false as const,
      mensagem: FORA_DO_AR,
    }))
    setEscolhendo(null)

    if (!r.ok) {
      setErro(r.mensagem)
      return
    }
    setFala(`${o.nome} selecionado. ${prazoDe(o)}.`)
  }

  function alterar() {
    setAlterando(true)
    setDigitado(mascararCep(lista?.cep ?? atual.cep))
    setErro("")
    querFoco.current = "campo"
  }

  const marcada = escolhendo ?? atual.freteEscolhido

  return (
    <section className="sacolinha__entrega" aria-labelledby="entrega-titulo">
      <h3 className="sacolinha__entrega-titulo" id="entrega-titulo">
        <Caminhao aria-hidden="true" />
        Frete e prazo
      </h3>

      {/*
        O formulário fica SEMPRE no HTML e some por `hidden`, como no
        protótipo — o `.sacolinha__cep[hidden]` de lá existe justamente
        porque o `display: flex` venceria o atributo.
      */}
      <form className="sacolinha__cep" noValidate hidden={mostrandoLista} onSubmit={calcular}>
        <label className="sr-only" htmlFor="carrinho-cep">
          CEP de entrega
        </label>
        <input
          ref={campo}
          id="carrinho-cep"
          name="cep"
          type="text"
          inputMode="numeric"
          autoComplete="postal-code"
          placeholder="00000-000"
          maxLength={9}
          value={cep}
          onChange={(e) => {
            setDigitado(mascararCep(e.target.value))
            setErro("")
          }}
          aria-describedby="carrinho-cep-erro"
          aria-invalid={erro ? true : undefined}
        />
        <button
          type="submit"
          className="sacolinha__cep-botao"
          aria-busy={calculando || atualizando || undefined}
          disabled={(ocupada && !calculando) || atualizando}
        >
          {calculando || atualizando ? "Calculando…" : "Calcular"}
        </button>
      </form>

      {/*
        `role="alert"` e sempre no HTML, mesmo vazio: região viva que nasce
        junto com o texto costuma não ser anunciada.
      */}
      <p className="sacolinha__cep-erro" id="carrinho-cep-erro" role="alert" hidden={!erro}>
        {erro}
      </p>

      {mostrandoLista && lista ? (
        <fieldset className="sacolinha__opcoes" aria-busy={atualizando || undefined}>
          <legend className="sr-only">Escolha como quer receber</legend>

          {lista.opcoes.map((o, i) => {
            const gratis = o.preco === 0
            const riscado = o.precoCheio !== null && o.precoCheio > o.preco
            return (
              <label className="sacolinha__opcao" key={o.id}>
                <input
                  ref={i === 0 ? primeira : undefined}
                  type="radio"
                  name="entrega"
                  value={o.id}
                  /*
                    Com uma opção só (as duas faixas caíram no mesmo serviço
                    e viraram "Entrega"), ela é a marcada — mesmo que o
                    carrinho tenha pendurado a outra faixa, que custa o mesmo.
                  */
                  checked={marcada === o.id || lista.opcoes.length === 1}
                  onChange={() => escolher(o)}
                />
                <span>
                  <span className="sacolinha__opcao-nome">{o.nome}</span>
                  <span className="sacolinha__opcao-prazo">{prazoDe(o)}</span>
                </span>
                <span className="sacolinha__opcao-preco" data-gratis={gratis ? "" : undefined}>
                  {gratis ? "Grátis" : emReais(o.preco)}
                  {riscado ? (
                    <s>
                      <span className="sr-only">em vez de </span>
                      {emReais(o.precoCheio!)}
                    </s>
                  ) : null}
                </span>
              </label>
            )
          })}

          <p className="sacolinha__cep-ok">
            Entrega para o CEP <b>{mascararCep(lista.cep)}</b>
            <button type="button" onClick={alterar}>
              alterar
            </button>
          </p>
        </fieldset>
      ) : null}

      {/*
        A ressalva da emergência não é enfeite: nesse caminho o preço não
        veio de transportadora nenhuma, e o prazo é uma promessa que a loja
        escolheu. A calculadora da PDP diz o mesmo.
      */}
      {mostrandoLista && lista?.emergencia ? (
        <p className="sacolinha__cep-aviso">
          Estimativa — a transportadora não respondeu agora, e este é o valor que a loja cobra
          nessas horas.
        </p>
      ) : null}

      <p className="sacolinha__cep-ajuda">
        {/*
          O prazo da transportadora conta da POSTAGEM, não do pagamento — são
          dias úteis de diferença, e é a reclamação número um de quem compra
          pela internet. A PDP escreve o mesmo embaixo da calculadora dela.
        */}
        {mostrandoLista ? <span>Dias úteis, contados da postagem. </span> : null}
        <a
          href="https://buscacepinter.correios.com.br/app/endereco/index.php"
          target="_blank"
          rel="noopener noreferrer"
        >
          Não sei meu CEP
        </a>
      </p>

      <p className="sr-only" aria-live="polite">
        {fala}
      </p>
    </section>
  )
}
