"use client"

import { useActionState, useEffect, useRef, useState, type MouseEvent } from "react"
import { Raio } from "@/components/icones"
import { salvarContato } from "@/lib/acoes/checkout"
import {
  ESTADO_INICIAL,
  estadoComErros,
  estadoSemResposta,
  type CheckoutVisivel,
  type EstadoDaEtapa,
} from "@/lib/checkout-visivel"
import { mascararDocumento } from "@/lib/documento"
import { conferirContato } from "@/lib/passos-do-checkout"
import { SEM_CONEXAO, semQueda } from "@/lib/rede"
import { sugestaoDoEmail } from "@/lib/sugestao-do-email"
import { mascararTelefone } from "@/lib/telefone"
import { Campo } from "./campo"
import {
  Giro,
  Painel,
  Recado,
  SALVANDO,
  TOQUE_REPETIDO_MS,
  trazerPraVista,
  useAvisaOcupado,
  useFocaNoErro,
  type PropsDaEtapa,
} from "./etapas"

/**
 * PASSO 1 — e-mail, nome, celular e documento.
 *
 * O e-mail vem primeiro porque é o único campo cujo valor a loja precisa
 * mesmo que a compra não termine: é por onde a gente avisa que o carrinho
 * ficou pra trás. Pedir depois seria pedir tarde.
 *
 * CPF OU CNPJ NO MESMO CAMPO. Obrigar a escolher o tipo antes de digitar é um
 * clique a mais pra todo mundo por causa da minoria que compra como empresa —
 * e o tamanho do número já diz qual é. A máscara se reorganiza sozinha no 12º
 * caractere, que é onde o CNPJ se revela.
 *
 * O "CONTINUAR" ABRE A ENTREGA NA HORA (entrega 0201): o envio que confere
 * (`conferirContato`, as regras da ação) adianta o carrinho — `adiantar`, em
 * `etapas.tsx` —, e a ação grava por trás. O que não confere fica aqui, com o
 * erro embaixo do campo, sem ida à loja. A ação que recusa (a sacola que
 * expirou, o e-mail que o Medusa não aceita, a rede) traz o passo de volta.
 *
 * "VOCÊ QUIS DIZER …?" (entrega 0248): o domínio com erro de digitação
 * ("hotmail.con", "gmial.com") ganha a sugestão embaixo do campo quando a
 * pessoa sai dele, e o PRIMEIRO "Continuar" com ele para ali — o e-mail do
 * pedido, o do Pix e os da entrega voltariam todos. Tocar na sugestão
 * conserta e segue; o segundo "Continuar" com o mesmo e-mail passa, que
 * pode ser o domínio de verdade de alguém (`lib/sugestao-do-email.ts`) —
 * menos o toque repetido de quem tocou duas vezes na barra do celular.
 */
export function Contato({ checkout, ...casca }: PropsDaEtapa & { checkout: CheckoutVisivel }) {
  const { adiantar, aoVoltar } = casca
  const [estado, acao, enviando] = useActionState(
    async (anterior: EstadoDaEtapa, fd: FormData): Promise<EstadoDaEtapa> => {
      const conferido = conferirContato(fd)
      if (!conferido.ok) return estadoComErros(anterior, conferido.erros, fd)
      // Sem internet, a ação nem volta: o recado fica no passo, e nada do que foi digitado se perde.
      const r = await semQueda(
        () => salvarContato(anterior, fd),
        () => estadoSemResposta(anterior, fd, SEM_CONEXAO)
      )
      if (!r.ok) aoVoltar("contato")
      return r
    },
    ESTADO_INICIAL
  )
  useAvisaOcupado(casca, enviando ? SALVANDO : null)
  const formulario = useFocaNoErro(estado)

  // Documento e celular são controlados só por causa da máscara; o resto é
  // `defaultValue` e vive no próprio DOM, que é onde o navegador já guarda
  // melhor. O celular gravado vem como +5511…; a máscara tira o país.
  const [documento, setDocumento] = useState(mascararDocumento(checkout.documento))
  const [telefone, setTelefone] = useState(mascararTelefone(checkout.entrega.telefone))

  const campoEmail = useRef<HTMLInputElement>(null)
  const botaoDaSugestao = useRef<HTMLButtonElement>(null)
  // `segurou`: veio do "Continuar", e não da saída do campo — aí ela vem pra vista.
  const [sugestao, setSugestao] = useState<{ email: string; segurou: boolean } | null>(null)
  // O e-mail que já parou um "Continuar", e quando: o segundo passa — é o que a pessoa quer.
  const jaParou = useRef<{ email: string; em: number } | null>(null)
  useEffect(() => {
    // No celular o "Continuar" é o da barra presa embaixo: a sugestão nasce fora da tela.
    if (!sugestao?.segurou || !botaoDaSugestao.current) return
    trazerPraVista(botaoDaSugestao.current)
    botaoDaSugestao.current.focus({ preventScroll: true })
  }, [sugestao])
  const aceitar = (ev: MouseEvent<HTMLButtonElement>) => {
    if (!campoEmail.current || !sugestao) return
    campoEmail.current.value = sugestao.email
    setSugestao(null)
    // Parou no "Continuar": consertado, segue sozinho, sem um toque a mais.
    if (sugestao.segurou) ev.currentTarget.form?.requestSubmit()
  }
  const arroba = sugestao ? sugestao.email.lastIndexOf("@") : -1

  const e = estado.erros
  // O que voltou da ação vem antes do que está gravado: é o que a pessoa
  // acabou de digitar, e o React já deu reset no formulário.
  const v = (campo: string, gravado: string) => estado.valores?.[campo] ?? gravado

  return (
    <Painel etapa="contato" aberta={casca.aberta}>
      <form
        id="form-contato"
        ref={formulario}
        action={acao}
        onSubmit={(ev) => {
          // Um envio por vez: o Enter num campo e o toque na barra do celular
          // não passam pelo botão travado.
          if (enviando) {
            ev.preventDefault()
            return
          }
          const fd = new FormData(ev.currentTarget)
          const conferido = conferirContato(fd)
          const email = String(fd.get("email") ?? "")
            .trim()
            .toLowerCase()
          // O formato errado ("gmail.com.", "joão@") tem a dica dele embaixo do campo, e
          // ela vem antes: a sugestão é pro e-mail bem escrito que não existe.
          const formatoOk = conferido.ok || !conferido.erros.email
          const sugerido = formatoOk ? sugestaoDoEmail(email) : null
          const parou = jaParou.current
          if (
            sugerido &&
            (parou?.email !== email || performance.now() - parou.em < TOQUE_REPETIDO_MS)
          ) {
            ev.preventDefault()
            // O toque repetido não conta como "é esse mesmo", e nem empurra a espera.
            if (parou?.email !== email) jaParou.current = { email, em: performance.now() }
            setSugestao({ email: sugerido, segurou: true })
            return
          }
          // Conferiu: a entrega abre agora, e não quando a ação voltar.
          if (conferido.ok) adiantar({ etapa: "contato", dados: conferido.dados })
        }}
        noValidate
      >
        <div className="campos">
          <Campo
            rotulo="E-mail"
            nome="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="voce@email.com"
            defaultValue={v("email", checkout.email)}
            erro={e.email}
            required
            ref={campoEmail}
            onBlur={(ev) => {
              const sugerido = sugestaoDoEmail(ev.currentTarget.value)
              setSugestao(sugerido ? { email: sugerido, segurou: false } : null)
            }}
            onChange={() => {
              if (sugestao) setSugestao(null)
            }}
            depois={
              // Sempre na página, mesmo vazia: a região viva que nasce com o texto não é lida.
              <p className="campo__sugestao" aria-live="polite">
                {sugestao ? (
                  <>
                    Você quis dizer{" "}
                    <button type="button" ref={botaoDaSugestao} onClick={aceitar}>
                      {sugestao.email.slice(0, arroba + 1)}
                      <b>{sugestao.email.slice(arroba + 1)}</b>
                    </button>
                    ?
                    {sugestao.segurou ? (
                      <small>Se o seu é esse mesmo, é só continuar.</small>
                    ) : null}
                  </>
                ) : null}
              </p>
            }
          />
          <Campo
            rotulo="Nome"
            nome="nome"
            largura="campo--3"
            autoComplete="given-name"
            placeholder="Primeiro nome"
            defaultValue={v("nome", checkout.entrega.nome)}
            erro={e.nome}
            required
          />
          {/*
            "Restante do nome", e não "Sobrenome" de novo: o campo ao lado
            pede o PRIMEIRO nome, e quem se chama "Ana Paula de Oliveira
            Santos" precisa saber onde põe o resto. Este nome vai inteiro pra
            etiqueta dos Correios e pra nota fiscal — sobrenome cortado no
            meio é entrega que o entregador não confere.
          */}
          <Campo
            rotulo="Sobrenome"
            nome="sobrenome"
            largura="campo--3"
            autoComplete="family-name"
            placeholder="Restante do nome"
            defaultValue={v("sobrenome", checkout.entrega.sobrenome)}
            erro={e.sobrenome}
            required
          />
          {/*
            Sem `maxLength`: o navegador cortaria o que é colado ANTES da
            máscara ver — "+55 11 98765-4321" chegaria sem os últimos
            dígitos. Quem limita a 11 dígitos é a própria máscara.
          */}
          <Campo
            rotulo="Celular"
            nota="(WhatsApp)"
            nome="telefone"
            largura="campo--3"
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            placeholder="(11) 99999-9999"
            value={telefone}
            onChange={(ev) => setTelefone(mascararTelefone(ev.target.value))}
            erro={e.telefone}
            required
          />
          <Campo
            rotulo="CPF ou CNPJ"
            nota="(pra nota fiscal)"
            nome="documento"
            largura="campo--3"
            inputMode="text"
            autoComplete="off"
            placeholder="000.000.000-00"
            value={documento}
            onChange={(ev) => setDocumento(mascararDocumento(ev.target.value))}
            erro={e.documento}
            required
          />
        </div>

        <Recado estado={estado} />

        <div className="acoes">
          <span />
          <button
            type="submit"
            className="btn"
            disabled={enviando}
            aria-busy={enviando || undefined}
          >
            {enviando ? <Giro /> : null}
            {enviando ? SALVANDO : "Continuar"}
            {enviando ? null : <Raio className="btn__bolt" />}
          </button>
        </div>
      </form>
    </Painel>
  )
}
