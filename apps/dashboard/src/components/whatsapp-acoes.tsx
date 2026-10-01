"use client"

import { useRouter } from "next/navigation"
import { useEffect, useRef, useState, useTransition, type FormEvent } from "react"
import { useAvisar } from "@/components/avisos"
import { Icone } from "@/components/icones"
import {
  devolverAoAtendente,
  responderNoWhatsapp,
  salvarAjustesDoWhatsapp,
  testarOAtendente,
} from "@/lib/acoes/whatsapp"
import type { AjustesDoWhatsapp, FalaDoTeste, RespostaDoTeste } from "@/lib/whatsapp"

/**
 * AS AÇÕES DO WHATSAPP NO PAINEL (0234): responder como equipe, devolver pro
 * atendente, a tela que se refaz sozinha, os ajustes (o liga/desliga e as
 * regras) e o teste do atendente.
 */

/**
 * A TELA SE REFAZ SOZINHA — de 15 em 15 segundos, com a aba à vista: a
 * conversa nova e a resposta do atendente aparecem sem recarregar. O que
 * está sendo escrito no campo fica (o React mantém o estado).
 */
export function AtualizarSozinho({ segundos = 15 }: { segundos?: number }) {
  const router = useRouter()
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh()
    }, segundos * 1000)
    return () => window.clearInterval(id)
  }, [router, segundos])
  return null
}

export function Responder({
  conversa,
  nome,
  janelaAte,
}: {
  conversa: string
  nome: string
  janelaAte: string | null
}) {
  const avisar = useAvisar()
  const [texto, setTexto] = useState("")
  const [indo, comecar] = useTransition()

  if (!janelaAte)
    return (
      <div className="wa__compor" data-janela-fechada>
        <p className="wa__nota">
          Passou de 24 horas da última mensagem: o WhatsApp não deixa a loja escrever primeiro.
          Quando a pessoa mandar mensagem de novo, dá pra responder daqui.
        </p>
      </div>
    )

  function enviar(e: FormEvent) {
    e.preventDefault()
    const t = texto.trim()
    if (!t) return
    comecar(async () => {
      const r = await responderNoWhatsapp(conversa, t)
      avisar(r)
      if (r.ok) setTexto("")
    })
  }

  return (
    <form className="wa__compor" onSubmit={enviar} data-responder>
      <label htmlFor={`resposta-${conversa}`}>Responder como equipe</label>
      <div className="wa__compor-linha">
        <textarea
          id={`resposta-${conversa}`}
          rows={2}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder={`Escreva pra ${nome.split(" ")[0]}… sai pelo WhatsApp da loja`}
          maxLength={4000}
        />
        <button className="btn btn--menor" type="submit" disabled={indo || !texto.trim()}>
          {indo ? "Enviando…" : "Enviar"}
        </button>
      </div>
      <p className="wa__nota">
        Dá pra responder até <strong>{janelaAte}</strong> (24 horas da última mensagem dela). Quem
        responde aqui assina como a loja, e o atendente fica quieto nesta conversa.
      </p>
    </form>
  )
}

export function Devolver({ conversa }: { conversa: string }) {
  const avisar = useAvisar()
  const [indo, comecar] = useTransition()
  return (
    <button
      type="button"
      className="btn btn--contorno btn--menor"
      disabled={indo}
      data-devolver
      onClick={() => comecar(async () => avisar(await devolverAoAtendente(conversa)))}
    >
      <Icone nome="seta" />
      {indo ? "Devolvendo…" : "Devolver pro atendente"}
    </button>
  )
}

const O_QUE_ELE_SABE: { nome: string; deOnde: string }[] = [
  { nome: "Produtos e preços de agora", deOnde: "o catálogo, com promoção e esgotado" },
  { nome: "Desconto por quantidade", deOnde: "as faixas de 2 e de 3 ou mais" },
  { nome: "A página de cada produto", deOnde: "como usar, pra quem é, as dúvidas" },
  { nome: "As dúvidas da loja", deOnde: "pagamento, entrega, troca" },
  { nome: "Os pedidos e o rastreio", deOnde: "do telefone de quem escreve" },
  { nome: "O Pix de novo", deOnde: "numa mensagem só com o código" },
  { nome: "O frete pelo CEP", deOnde: "a mesma conta do checkout" },
  { nome: "A sacola montada", deOnde: "o link que abre o checkout" },
]

type FalaNaTela = FalaDoTeste & { extras?: string[]; meta?: RespostaDoTeste }

/**
 * OS AJUSTES E O TESTE, juntos: o teste usa as regras do campo, mesmo antes
 * de salvar — dá pra mexer, testar e só salvar quando ficar bom.
 */
export function AjustesETeste({ ajustes }: { ajustes: AjustesDoWhatsapp }) {
  const avisar = useAvisar()
  const [ligado, setLigado] = useState(ajustes.ligado)
  const [regras, setRegras] = useState(ajustes.regras ?? "")
  const [salvando, salvar] = useTransition()
  const [ligando, ligar] = useTransition()

  const [telefone, setTelefone] = useState("")
  const [mensagem, setMensagem] = useState("")
  const [falas, setFalas] = useState<FalaNaTela[]>([])
  const [testando, testar] = useTransition()
  const fim = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fim.current?.scrollIntoView({ block: "nearest" })
  }, [falas])

  function trocar() {
    const proximo = !ligado
    ligar(async () => {
      const r = await salvarAjustesDoWhatsapp({ ligado: proximo })
      avisar(r)
      if (r.ok) setLigado(proximo)
    })
  }

  function mandarTeste(e: FormEvent) {
    e.preventDefault()
    const t = mensagem.trim()
    if (!t) return
    const conversa: FalaNaTela[] = [...falas, { de: "cliente", texto: t }]
    setFalas(conversa)
    setMensagem("")
    testar(async () => {
      const r = await testarOAtendente({
        falas: conversa.slice(-20).map(({ de, texto }) => ({ de, texto })),
        telefone,
        regras,
      })
      if (!r.ok) {
        avisar({ ok: false, texto: r.texto })
        setFalas(conversa.slice(0, -1))
        setMensagem(t)
        return
      }
      setFalas([...conversa, { de: "atendente", texto: r.resposta.texto, meta: r.resposta }])
    })
  }

  return (
    <div className="wa-ajustes">
      <div className="wa-ajustes__coluna">
        <section className="bloco" data-ajuste-ligado>
          <div className="wa-ajustes__linha">
            <div>
              <h2 className="bloco__titulo">O atendente</h2>
              <p className="wa-ajustes__sub">
                Desligado, as mensagens continuam chegando aqui, e só a equipe responde.
              </p>
            </div>
            <button
              type="button"
              className="wa-chave"
              aria-pressed={ligado}
              disabled={ligando}
              onClick={trocar}
              data-chave
            >
              <span className="wa-chave__trilho" aria-hidden="true">
                <span className="wa-chave__bola" />
              </span>
              {ligado ? "Ligado" : "Desligado"}
            </button>
          </div>
        </section>

        <section className="bloco wa-regras" data-regras>
          <h2 className="bloco__titulo">Regras da loja</h2>
          <p className="wa-ajustes__sub" style={{ marginBottom: 12 }}>
            O que o atendente segue além do padrão: o jeito de falar, o que oferecer, o que passar
            pra equipe. Preço, frete e prazo continuam vindo do sistema, nunca daqui.
          </p>
          <label className="sr-only" htmlFor="wa-regras">
            Regras da loja
          </label>
          <textarea
            id="wa-regras"
            value={regras}
            onChange={(e) => setRegras(e.target.value)}
            maxLength={ajustes.limite}
            placeholder={
              'Uma regra por linha. Ex.: Pode chamar de "irmão", nunca de "mano".\nAtacado e revenda: chame a equipe.'
            }
          />
          <div className="wa-regras__pe">
            <span>
              {regras.length.toLocaleString("pt-BR")} de {ajustes.limite.toLocaleString("pt-BR")}{" "}
              letras
            </span>
            <button
              type="button"
              className="btn btn--menor"
              disabled={salvando || regras === (ajustes.regras ?? "")}
              onClick={() => salvar(async () => avisar(await salvarAjustesDoWhatsapp({ regras })))}
              data-salvar-regras
            >
              {salvando ? "Salvando…" : "Salvar regras"}
            </button>
          </div>
        </section>

        <section className="bloco">
          <h2 className="bloco__titulo" style={{ marginBottom: 12 }}>
            O que ele já sabe sozinho
          </h2>
          <ul className="wa-sabe">
            {O_QUE_ELE_SABE.map((s) => (
              <li key={s.nome}>
                <Icone nome="check" />
                <span>
                  {s.nome}
                  <small>{s.deOnde}</small>
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="bloco wa-teste" data-teste>
        <div className="wa-teste__topo">
          <div className="wa-ajustes__linha">
            <h2 className="bloco__titulo">Testar o atendente</h2>
            {falas.length ? (
              <button type="button" className="btn btn--fantasma" onClick={() => setFalas([])}>
                Recomeçar
              </button>
            ) : null}
          </div>
          <p className="wa-ajustes__sub">
            Escreva como se fosse um cliente. Nada sai pelo WhatsApp e nada fica nas conversas. Usa
            as regras do campo, mesmo sem salvar.
          </p>
          <label className="wa-teste__tel">
            <span>Como o cliente do número</span>
            <input
              type="tel"
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
              placeholder="vazio = quem nunca comprou"
              data-teste-telefone
            />
          </label>
        </div>
        <div className="wa__mensagens" data-teste-mensagens aria-live="polite">
          {falas.length ? null : (
            <p className="wa-ajustes__sub" style={{ alignSelf: "center", marginTop: 40 }}>
              Ex.: &quot;quanto tá o fator? e o frete pro 89036-370?&quot;
            </p>
          )}
          {falas.map((f, i) =>
            f.de === "cliente" ? (
              <div key={i} className="wa-msg" data-autor="cliente">
                <p className="wa-msg__texto">{f.texto}</p>
              </div>
            ) : (
              <div key={i} style={{ display: "contents" }}>
                <div className="wa-msg" data-autor="bot" data-teste-resposta>
                  <p className="wa-msg__de">
                    O atendente responderia
                    {f.meta?.ferramentas.map((nome) => (
                      <span key={nome} className="wa-msg__ferramenta">
                        {nome}
                      </span>
                    ))}
                  </p>
                  <p className="wa-msg__texto">{f.texto}</p>
                </div>
                {f.meta?.extras.map((x, j) => (
                  <div key={j} className="wa-msg" data-autor="bot" data-separada="">
                    <p className="wa-msg__de">Só o código, pra copiar</p>
                    <p className="wa-msg__texto">{x}</p>
                  </div>
                ))}
                {f.meta ? (
                  <div className="wa-teste__meta" data-teste-meta>
                    <span>
                      {(f.meta.ms / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} s
                    </span>
                    <span>{f.meta.custo}</span>
                    <span>sabia: {f.meta.sabia}</span>
                    {f.meta.equipe ? <span>chamaria a equipe: {f.meta.equipe}</span> : null}
                  </div>
                ) : null}
              </div>
            )
          )}
          {testando ? (
            <div className="wa-msg" data-autor="bot">
              <p className="wa-msg__texto">digitando…</p>
            </div>
          ) : null}
          <div ref={fim} />
        </div>
        <form className="wa-teste__compor" onSubmit={mandarTeste}>
          <label className="sr-only" htmlFor="wa-teste">
            Mensagem de teste
          </label>
          <input
            id="wa-teste"
            type="text"
            value={mensagem}
            onChange={(e) => setMensagem(e.target.value)}
            placeholder="ex.: cadê meu pedido?"
            maxLength={1000}
            data-teste-mensagem
          />
          <button
            className="btn btn--preto btn--menor"
            type="submit"
            disabled={testando || !mensagem.trim()}
          >
            {testando ? "Testando…" : "Testar"}
          </button>
        </form>
      </section>
    </div>
  )
}
