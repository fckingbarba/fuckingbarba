"use client"

import { useEffect, useId, useRef, useState, useSyncExternalStore, useTransition } from "react"
import { Caminhao } from "@/components/icones"
import { useFrete } from "@/components/configuracoes/contexto"
import { cotarFrete, type Cotacao, type OpcaoCotada } from "@/lib/acoes/frete"
import { mascararCep } from "@/lib/cep-formato"
import { cepGuardado, guardarCep } from "@/lib/cep-guardado"
import { fraseDoQueFalta } from "@/lib/configuracoes"
import { emReais } from "@/lib/formato"

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

export function CalculadoraDeFrete({
  itens,
  titulo = "Quando chega na sua casa",
}: {
  /** O que está selecionado agora: o kit, a quantidade, o que foi marcado. */
  itens: ItemPraCotar[]
  titulo?: string
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
      if (r.ok) guardarCep(cepLimpo)
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

  const resultado = cotacao?.ok ? cotacao : null
  const falta = resultado?.faltaPraGratis ?? null

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

      <div className="cep__linha">
        <label className="sr-only" htmlFor={idDoCep}>
          CEP de entrega
        </label>
        <input
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
          {calculando ? "Calculando…" : resultado ? "Recalcular" : "Calcular"}
        </button>
      </div>

      {/*
        `aria-live` polido: o resultado chega depois de um clique que a pessoa
        deu, e interromper o leitor de tela no meio de outra coisa seria
        grosseria. O bloco existe sempre, mesmo vazio — região viva que nasce
        junto com o conteúdo costuma não ser anunciada.
      */}
      <div className="cep__resposta" role="status" aria-live="polite">
        {cotacao && !cotacao.ok ? <p className="cep__erro">{cotacao.mensagem}</p> : null}

        {resultado?.opcoes.map((o) => (
          <p className="cep__opcao" key={o.faixa}>
            <span className="cep__opcao-nome">
              {o.nome}
              {o.prazo ? <small>Chega em {o.prazo}</small> : null}
              {/*
                Quem entrega fica na linha de baixo, e só quando existe. Na
                emergência não existe — ninguém cotou —, e escrever
                "Correios" ali seria inventar a transportadora de um frete
                que a loja arbitrou sozinha.
              */}
              {quemEntrega(o) ? <small className="cep__quem">{quemEntrega(o)}</small> : null}
            </span>
            <span className="cep__opcao-preco" data-gratis={o.preco === 0 ? "" : undefined}>
              {o.preco === 0 ? "Grátis" : emReais(o.preco)}
            </span>
          </p>
        ))}

        {/*
          O QUE FALTA PRO FRETE GRÁTIS volta aqui — e aqui ele faz sentido,
          porque está ao lado do preço que a pessoa acabou de ver. Era isso
          que faltava na barrinha antiga: um número pra comparar.
        */}
        {resultado && falta !== null && falta > 0 ? (
          <p className="cep__falta">{fraseDoQueFalta(politica, falta)}</p>
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

      <p className="cep__pe">
        {/*
          ISTO NÃO É LETRA MIÚDA DE ENFEITE. O prazo da transportadora começa
          a contar quando o pacote é POSTADO, não quando o pagamento cai —
          são dias úteis de diferença, e é a reclamação número um de quem
          vende pela internet no Brasil.
        */}
        Prazo contado em dias úteis depois da postagem.{" "}
        <a
          href="https://buscacepinter.correios.com.br/app/endereco/"
          target="_blank"
          rel="noopener noreferrer"
        >
          Não sei meu CEP
        </a>
      </p>
    </form>
  )
}
