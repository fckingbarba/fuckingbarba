"use client"

import {
  useActionState,
  useEffect,
  useOptimistic,
  useRef,
  useState,
  useTransition,
  type FormEvent,
  type TransitionStartFunction,
} from "react"
import { Mais, Raio } from "@/components/icones"
import { adicionarOferta, consultarCep, escolherFrete, salvarEntrega } from "@/lib/acoes/checkout"
import { mascararCep } from "@/lib/cep-formato"
import {
  ESTADO_INICIAL,
  type CheckoutVisivel,
  type Oferta,
  type OpcaoDeFrete,
} from "@/lib/checkout-visivel"
import { UFS } from "@/lib/endereco"
import { emReais } from "@/lib/formato"
import { site } from "@/lib/site"
import { Campo } from "./campo"
import {
  Giro,
  Painel,
  Recado,
  useAvisaOcupado,
  useFechaQuandoSalva,
  type PropsDaEtapa,
} from "./etapas"

/**
 * PASSO 2 — o endereço e o frete.
 *
 * SÓ O CEP À VISTA. O resto do endereço aparece depois, já preenchido. São
 * seis campos a menos na primeira olhada, e quem digita CEP no celular só
 * precisa do teclado numérico.
 *
 * O CEP PREENCHE E NÃO MANDA EM NADA. Se não achar — CEP novo, zona rural,
 * serviço fora do ar — os campos abrem vazios e editáveis, exatamente como
 * estariam se o atalho não existisse. Nenhum fica travado depois de
 * preenchido, porque endereço de CEP acerta a rua e erra o resto com
 * frequência.
 *
 * O FRETE MORA AQUI, e não num passo só dele: ele depende do CEP que acabou
 * de ser digitado, e mandar a pessoa pra outra tela pra escolher entre duas
 * linhas é uma parede a mais no meio de uma decisão que ela já tomou.
 */

type Props = PropsDaEtapa & {
  checkout: CheckoutVisivel
  fretes: OpcaoDeFrete[]
  sugestoes: Oferta[]
  falta: number
  piso: number
}

export function Entrega({ checkout, fretes, sugestoes, falta, piso, aoSalvar, ...casca }: Props) {
  const [estado, acao, enviando] = useActionState(salvarEntrega, ESTADO_INICIAL)
  useFechaQuandoSalva(estado, aoSalvar)
  useAvisaOcupado(casca, enviando ? "Salvando…" : null)
  const { recalcular, recalculando } = casca

  // Um envio por vez, e nenhum com o frete trocando: o rádio fica travado no
  // caminho, e rádio travado não entra no FormData — o passo gravaria o
  // endereço sem a entrega. Os botões já travam; isto cobre o Enter num campo
  // de texto e o toque repetido na barra do celular.
  function aoEnviar(ev: FormEvent<HTMLFormElement>) {
    if (enviando || recalculando) ev.preventDefault()
  }

  const inicial = checkout.entrega
  const [cep, setCep] = useState(mascararCep(inicial.cep))
  const [rua, setRua] = useState(inicial.rua)
  const [bairro, setBairro] = useState(inicial.bairro)
  const [cidade, setCidade] = useState(inicial.cidade)
  const [uf, setUf] = useState(inicial.uf)
  // O endereço já apareceu? Abre quando o CEP resolve, e fica aberto — quem
  // voltou pra corrigir o número não quer ver os campos sumirem.
  //
  // CEP gravado também abre: ele pode ter vindo da SACOLA, que grava o CEP
  // e a entrega no carrinho. Se o ViaCEP não soube a rua naquela hora, o
  // carrinho chega com CEP e sem rua — e fechado aqui, a pessoa veria o CEP
  // preenchido sem campo nenhum pra digitar o resto, e sem a entrega que
  // acabou de escolher. O atalho do CEP só dispara quando ele é digitado.
  const [abriu, setAbriu] = useState(Boolean(inicial.rua || inicial.numero || inicial.cep))

  const [buscando, buscar] = useTransition()
  const [naoAchou, setNaoAchou] = useState(false)
  const numeroRef = useRef<HTMLInputElement>(null)
  const ufRef = useRef<HTMLSelectElement>(null)
  const ultimoBuscado = useRef("")
  const querFoco = useRef(false)

  /*
    O RESET DO FORMULÁRIO NÃO POUPA O SELECT: depois de cada resposta da
    ação o React dá `reset()` no `<form action>`, e o `<select>` controlado
    volta pra opção marcada no HTML — o estado segue "SP", e o React só
    reescreve o DOM quando o valor muda. Aqui isso se escondia atrás de um
    acaso (a barra do celular faz o passo desenhar de novo logo depois, e
    o desenho devolvia o valor); nos endereços da conta, não tinha acaso, e
    o segundo envio chegava sem estado. O efeito roda depois do reset.
  */
  useEffect(() => {
    if (ufRef.current && ufRef.current.value !== uf) ufRef.current.value = uf
  }, [estado, uf])

  function aoMudarCep(valor: string) {
    const mascarado = mascararCep(valor)
    setCep(mascarado)

    const limpo = mascarado.replace(/\D+/g, "")
    if (limpo.length !== 8 || limpo === ultimoBuscado.current) return

    ultimoBuscado.current = limpo
    setNaoAchou(false)
    buscar(async () => {
      /* Além de preencher os campos, isto grava o CEP no carrinho e pede
         o `refresh()` — é o que traz as opções de entrega, que agora só
         existem depois de a transportadora cotar pra este CEP. */
      const achado = await consultarCep(limpo)
      // Abre de qualquer jeito: CEP que o ViaCEP não conhece existe, e a
      // pessoa precisa dos campos pra digitar à mão.
      setAbriu(true)
      if (!achado.encontrado) {
        setNaoAchou(true)
        return
      }
      // Só preenche o que veio: CEP de rua única devolve logradouro, CEP de
      // cidade inteira não — e apagar o que a pessoa já digitou por causa de
      // um campo vazio na resposta seria trabalho perdido dela.
      if (achado.rua) setRua(achado.rua)
      if (achado.bairro) setBairro(achado.bairro)
      if (achado.cidade) setCidade(achado.cidade)
      if (achado.uf) setUf(achado.uf)
      // O foco vai pro número num efeito, não aqui: neste ponto o bloco do
      // endereço ainda está com `hidden`, e focar elemento escondido não faz
      // nada. O `hidden` só sai no render que `setAbriu` provoca.
      querFoco.current = true
    })
  }

  // Depois que o endereço aparece, o cursor vai pro número — o único campo
  // que a consulta de CEP nunca sabe, e onde a pessoa ia clicar em seguida.
  //
  // O pedido de foco fica num `ref`, e não em estado: mover foco é mexer no
  // DOM, não em dado da tela, e guardar isso em estado faria o componente
  // renderizar duas vezes só pra desligar a bandeirinha.
  useEffect(() => {
    if (!abriu || !querFoco.current) return
    querFoco.current = false
    numeroRef.current?.focus()
  }, [abriu])

  const e = estado.erros
  const v = (campo: string, gravado: string) => estado.valores?.[campo] ?? gravado

  return (
    <Painel etapa="entrega" aberta={casca.aberta}>
      <form id="form-entrega" action={acao} onSubmit={aoEnviar} noValidate>
        <div className="campos">
          <Campo
            rotulo="CEP"
            nome="cep"
            largura="campo--cep"
            inputMode="numeric"
            autoComplete="postal-code"
            placeholder="00000-000"
            maxLength={9}
            value={cep}
            onChange={(ev) => aoMudarCep(ev.target.value)}
            erro={e.cep}
            required
            enfeite={<span className="campo__spinner" aria-hidden="true" />}
            ocupado={buscando}
          />
        </div>

        <div className="campos" data-endereco hidden={!abriu}>
          <Campo
            rotulo="Endereço"
            nome="rua"
            largura="campo--4"
            autoComplete="address-line1"
            placeholder="Rua, avenida…"
            value={rua}
            onChange={(ev) => setRua(ev.target.value)}
            erro={e.rua}
            required
          />
          <Campo
            rotulo="Número"
            nome="numero"
            largura="campo--2 campo--meio"
            ref={numeroRef}
            inputMode="text"
            placeholder="123"
            defaultValue={v("numero", inicial.numero)}
            erro={e.numero}
            required
          />
          <Campo
            rotulo="Complemento"
            nota="(opcional)"
            nome="complemento"
            largura="campo--4"
            autoComplete="address-line2"
            placeholder="Apto, bloco, referência"
            defaultValue={v("complemento", inicial.complemento)}
          />
          <Campo
            rotulo="Bairro"
            nome="bairro"
            largura="campo--3"
            autoComplete="address-level3"
            value={bairro}
            onChange={(ev) => setBairro(ev.target.value)}
            erro={e.bairro}
            required
          />
          <Campo
            rotulo="Cidade"
            nome="cidade"
            largura="campo--2 campo--cidade"
            autoComplete="address-level2"
            value={cidade}
            onChange={(ev) => setCidade(ev.target.value)}
            erro={e.cidade}
            required
          />
          <div className="campo campo--uf">
            <label htmlFor="uf">UF</label>
            <select
              ref={ufRef}
              id="uf"
              name="uf"
              autoComplete="address-level1"
              value={uf}
              onChange={(ev) => setUf(ev.target.value)}
              aria-invalid={e.uf ? true : undefined}
              aria-describedby="erro-uf"
              required
            >
              <option value="">—</option>
              {UFS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <span className="campo__erro" id="erro-uf" aria-live="polite">
              {e.uf ?? ""}
            </span>
          </div>
        </div>

        <p className="aviso-frete" aria-live="polite" hidden={!buscando && !naoAchou}>
          {buscando ? "Procurando o endereço…" : null}
          {!buscando && naoAchou ? "Não achei esse CEP. Preenche à mão que funciona igual." : null}
        </p>

        <Fretes
          checkout={checkout}
          fretes={fretes}
          abriu={abriu}
          recalcular={recalcular}
          recalculando={recalculando}
        />

        <Completa
          sugestoes={sugestoes}
          falta={falta}
          piso={piso}
          temFrete={abriu && fretes.length > 0}
          recalcular={recalcular}
          recalculando={recalculando}
        />

        <Recado estado={estado} />

        <div className="acoes">
          <button
            type="button"
            className="btn btn--fantasma"
            onClick={() => casca.aoAbrir("contato")}
          >
            ← Voltar
          </button>
          <button
            type="submit"
            className="btn"
            disabled={enviando || recalculando}
            aria-busy={enviando || undefined}
          >
            {enviando ? <Giro /> : null}
            {enviando ? "Salvando…" : "Ir pro pagamento"}
            {enviando ? null : <Raio className="btn__bolt" />}
          </button>
        </div>
      </form>
    </Painel>
  )
}

/* ── as opções de frete ───────────────────────────────────────────────────── */

/**
 * A LISTA VEM DO MEDUSA, INTEIRA. Preço e prazo saem de lá já resolvidos pra
 * este carrinho — inclusive o frete grátis, que no Medusa é um segundo preço
 * da mesma opção com regra no valor dos itens. A loja não sabe que existe
 * piso nenhum: ela escreve "Grátis" quando o preço volta zero.
 *
 * A ESCOLHA GRAVA NA HORA, sem esperar o botão: o valor do frete entra no
 * resumo ao lado, e um total que só atualiza no clique seguinte é um total em
 * que ninguém confia.
 *
 * ┌─ A ESPERA DA TROCA ────────────────────────────────────────────────────┐
 * │ A marca muda no clique (`useOptimistic`); a opção escolhida ganha a    │
 * │ barrinha menta correndo embaixo, e o dinheiro do resumo esmaece até o  │
 * │ Medusa responder — o mesmo desenho da espera da sacola. Os preços das  │
 * │ opções não esmaecem: eles não mudam com a troca, só o total muda.      │
 * │                                                                        │
 * │ Se o Medusa recusar (a opção sumiu entre a cotação e o clique), a      │
 * │ transição acaba sem `refresh()`, a marca volta sozinha pra gravada, e  │
 * │ o recado diz por quê. Antes a resposta era jogada fora: a tela mostrava│
 * │ uma entrega e o carrinho guardava outra.                               │
 * └────────────────────────────────────────────────────────────────────────┘
 */
function Fretes({
  checkout,
  fretes,
  abriu,
  recalcular,
  recalculando,
}: {
  checkout: CheckoutVisivel
  fretes: OpcaoDeFrete[]
  abriu: boolean
  recalcular: TransitionStartFunction
  recalculando: boolean
}) {
  /*
    A gravada no carrinho — ou, quando não há nenhuma, a primeira da lista,
    que é a que o envio do passo grava junto com o endereço.

    E TAMBÉM QUANDO A GRAVADA NÃO ESTÁ NA LISTA. Acontece com a econômica
    que some por empatar no preço com a expressa (`lib/frete.ts`): quem
    calculou na sacola antes da regra existir pode ter a econômica pendurada
    no carrinho, e aí nenhum rádio apareceria marcado. Cai pra primeira
    visível, e o envio do passo grava ela — o dinheiro não muda, porque as
    duas custavam o mesmo; o que muda é a tela deixar de mentir que ninguém
    escolheu nada.
  */
  const naLista = fretes.some((f) => f.id === checkout.freteEscolhido)
  const gravada = (naLista ? checkout.freteEscolhido : null) ?? fretes[0]?.id ?? ""
  const [marcada, preverMarca] = useOptimistic(gravada)
  const [erro, setErro] = useState("")
  const trocando = marcada !== gravada

  if (!abriu) return null

  function escolher(id: string) {
    setErro("")
    recalcular(async () => {
      preverMarca(id)
      const fd = new FormData()
      fd.set("opcao", id)
      const r = await escolherFrete(ESTADO_INICIAL, fd)
      if (!r.ok) setErro(r.mensagem || "Não consegui trocar a entrega agora. Tenta de novo.")
    })
  }

  return (
    <fieldset className="opcoes" style={{ marginTop: 16 }} aria-busy={trocando || undefined}>
      <legend>Como quer receber</legend>

      {fretes.length === 0 ? (
        <p className="aviso-frete">
          Não temos entrega pra esse CEP ainda. Confere se o número está certo — se estiver, chama a
          gente no WhatsApp que a gente dá um jeito.
        </p>
      ) : (
        fretes.map((f) => (
          <label
            className="opcao"
            key={f.id}
            data-mexendo={trocando && marcada === f.id ? "" : undefined}
          >
            {f.preco === 0 ? <span className="opcao__selo">Frete grátis</span> : null}
            <input
              type="radio"
              name="opcao"
              value={f.id}
              checked={marcada === f.id}
              // Travado só enquanto uma troca vai e volta: duas cruzadas no
              // caminho podiam deixar gravada a primeira e marcada a segunda.
              disabled={recalculando}
              onChange={() => escolher(f.id)}
            />
            <span>
              <span className="opcao__nome">{f.nome}</span>
              <span className="opcao__desc">{f.prazo}</span>
            </span>
            <span className="opcao__valor" data-gratis={f.preco === 0 ? "" : undefined}>
              {f.preco === 0 ? "Grátis" : emReais(f.preco)}
              {f.preco === 0 && f.precoCheio ? <s>{emReais(f.precoCheio)}</s> : null}
            </span>
          </label>
        ))
      )}

      {erro ? (
        <p className="campo__erro" role="alert">
          {erro}
        </p>
      ) : null}
    </fieldset>
  )
}

/* ── completa o frete grátis ──────────────────────────────────────────────── */

/**
 * "Faltam R$ X pro frete grátis. Completa com:" — e um produto por categoria.
 *
 * O QUE TORNA ISTO HONESTO é a regra de quem entra na lista: só produto que
 * SOZINHO fecha a conta. Sugerir um de R$ 20 quando faltam R$ 40 é mandar a
 * pessoa clicar duas vezes pra descobrir que ainda não deu — e aí a promessa
 * do chip era mentira.
 *
 * Discreto de propósito: uma faixa cinza com texto pequeno e chips de borda,
 * sem foto. É informação útil, não banner.
 */
function Completa({
  sugestoes,
  falta,
  piso,
  temFrete,
  recalcular,
  recalculando,
}: {
  sugestoes: Oferta[]
  falta: number
  piso: number
  temFrete: boolean
  recalcular: TransitionStartFunction
  recalculando: boolean
}) {
  const [dispensado, setDispensado] = useState(false)
  // Qual chip está indo pro carrinho. Otimista: volta a `null` sozinho
  // quando a transição acaba, deu certo ou não.
  const [pondo, marcarPondo] = useOptimistic<string | null>(null)
  const [aviso, setAviso] = useState("")
  const [falhou, setFalhou] = useState("")

  // Sem CEP (logo, sem frete calculado), já grátis, dispensado, ou nada que
  // feche a conta: some. Nada de caixa vazia ocupando espaço.
  if (!temFrete || falta <= 0 || dispensado || sugestoes.length === 0) return null

  return (
    <div className="completa">
      <div className="completa__topo">
        <p className="completa__txt">
          <Raio aria-hidden="true" />
          Faltam <b>{emReais(falta)}</b> pro frete grátis (a partir de {emReais(piso)}). Completa
          com:
        </p>
        <button type="button" className="completa__dispensa" onClick={() => setDispensado(true)}>
          dispensar
        </button>
      </div>

      <ul className="completa__chips">
        {sugestoes.map((o) => (
          <li key={o.varianteId}>
            <button
              type="button"
              className="completa__chip"
              disabled={recalculando}
              data-mexendo={pondo === o.varianteId ? "" : undefined}
              aria-label={`Adicionar ${o.nome} por ${emReais(o.preco)} e liberar o frete grátis`}
              onClick={() =>
                recalcular(async () => {
                  marcarPondo(o.varianteId)
                  const r = await adicionarOferta(o.varianteId)
                  setFalhou(r.ok ? "" : o.nome)
                  setAviso(
                    r.ok
                      ? `${o.nome} adicionado. Frete grátis liberado.`
                      : `Não consegui adicionar o ${o.nome}.`
                  )
                })
              }
            >
              <span>
                <span className="completa__cat">{nomeDaCategoria(o.categoria)}</span>
                <br />
                {o.nome} <small>{emReais(o.preco)}</small>
              </span>
              <Mais aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>

      {/*
        Quando o clique não pega — produto que acabou entre a página carregar
        e o dedo chegar, rede caindo —, a pessoa PRECISA ver. Antes isto só
        existia pra leitor de tela, e quem enxerga clicava de novo achando
        que tinha errado a mira.
      */}
      {falhou ? (
        <p className="completa__falhou" role="alert">
          Não consegui adicionar o {falhou} agora — pode ter acabado. Tenta outro, ou segue sem.
        </p>
      ) : null}

      <span className="sr-only" aria-live="polite">
        {aviso}
      </span>
    </div>
  )
}

function nomeDaCategoria(handle: string): string {
  return site.categorias.find((c) => c.handle === handle)?.nome ?? handle
}
