"use client"

import type { Route } from "next"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { useAvisar } from "@/components/avisos"
import {
  mandarTesteDaCampanha,
  mudarACampanha,
  verACampanha,
  type ResultadoDaCampanhaNoPainel,
} from "@/lib/acoes/crm"
import type {
  CampanhaNaTela,
  ErrosDaCampanha,
  JeitoDaCampanha,
  PublicoDaCampanha,
  TelaDasCampanhas,
  TextoDaCampanha,
} from "@/lib/crm"

/**
 * O FORMULÁRIO DA CAMPANHA (entrega 0206) — o e-mail (assunto, com o teste
 * de outro assunto, prévia, título, texto, botão e produtos), pra quem vai e
 * quando. "Ver como fica" e "Mandar pra mim" valem sem salvar. Quem confere
 * campo a campo e grava é o Medusa (`POST /dashboard/crm/campanhas`); o erro
 * volta embaixo do campo.
 *
 * A HORA é a de Brasília: o campo do navegador dá "2026-11-27T08:00", e sai
 * como "2026-11-27T08:00:00-03:00" (sem horário de verão desde 2019).
 */

const inteiro = new Intl.NumberFormat("pt-BR")

/** "2026-11-27T08:00" (Brasília) → ISO. */
const agendaEmIso = (v: string) => (v ? new Date(`${v}:00-03:00`).toISOString() : null)

/** ISO → "2026-11-27T08:00", em Brasília, pro campo do navegador. */
function agendaNoCampo(iso: string | null): string {
  if (!iso) return ""
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, p.value])
  )
  return `${partes.year}-${partes.month}-${partes.day}T${partes.hour}:${partes.minute}`
}

/** Quanto tempo o envio leva: uns 100 a cada 5 minutos (a rotina `campanhas-do-crm`). */
function quantoTempo(pessoas: number): string {
  const minutos = Math.ceil(pessoas / 100) * 5
  if (minutos < 60) return "menos de 1 hora"
  const meias = Math.round(minutos / 30)
  return `umas ${Math.floor(meias / 2)}h${meias % 2 ? "30" : ""}`
}

/** Os dois jeitos de chegar (0210), com o que cada um quer dizer. */
const JEITOS: { id: JeitoDaCampanha; nome: string; sub: string }[] = [
  {
    id: "oferta",
    nome: "Oferta",
    sub: "Cai em Promoções, com o “cancelar inscrição” do Gmail. Pra desconto e preço, como a Black.",
  },
  {
    id: "recado",
    nome: "Recado do Matheus",
    sub: "Tenta o Principal — quem decide é o Gmail. Assinado “Matheus, da FuckingBarba”, sem emoji, com o sair da lista no pé. Pra lançamento e novidade, sem preço.",
  },
]

const VAZIO: TextoDaCampanha = {
  nome: "",
  assunto: "",
  assuntoB: null,
  previa: "",
  titulo: "",
  texto: "",
  botao: { texto: "Ver na loja", caminho: "/" },
  produtos: [],
  publico: "todos",
  jeito: "oferta",
}

export function FormularioDaCampanha({
  tela,
  campanha,
}: {
  tela: TelaDasCampanhas
  campanha: CampanhaNaTela | null
}) {
  const avisar = useAvisar()
  const router = useRouter()
  const [texto, setTexto] = useState<TextoDaCampanha>(campanha?.texto ?? VAZIO)
  const [comTeste, setComTeste] = useState(Boolean(campanha?.texto.assuntoB))
  const [agenda, setAgenda] = useState(agendaNoCampo(campanha?.agenda ?? null))
  const [erros, setErros] = useState<ErrosDaCampanha>({})
  const [previas, setPrevias] = useState<Previa[] | null>(null)
  const [ocupado, comecar] = useTransition()
  const [oQue, setOQue] = useState<string | null>(null)
  const [apagar, setApagar] = useState(false)

  const pessoas = tela.publicos.find((p) => p.id === texto.publico)?.pessoas ?? 0
  const mudar = <K extends keyof TextoDaCampanha>(k: K, v: TextoDaCampanha[K]) =>
    setTexto((t) => ({ ...t, [k]: v }))
  /** O que vai pro Medusa: sem o assunto B, se o teste está desligado. */
  const atual = (): TextoDaCampanha => ({
    ...texto,
    assuntoB: comTeste ? (texto.assuntoB ?? "") : null,
    botao: texto.botao?.texto.trim() ? texto.botao : null,
  })
  const erro = (k: keyof ErrosDaCampanha) => (
    <p className="campo__erro" role={erros[k] ? "alert" : undefined} data-erro={k}>
      {erros[k] ?? ""}
    </p>
  )

  function acao(nome: string, fazer: () => Promise<void>) {
    // O teste ligado com o assunto B vazio: o Medusa leria "sem teste", e a pessoa não veria.
    const levaOTexto = nome !== "desmarcar" && nome !== "apagar"
    if (levaOTexto && comTeste && !(texto.assuntoB ?? "").trim()) {
      setErros((e) => ({ ...e, assuntoB: "Escreva o assunto B, ou tire o teste." }))
      avisar({ ok: false, texto: "Confira os campos em vermelho." })
      return
    }
    setOQue(nome)
    comecar(async () => {
      try {
        await fazer()
      } catch {
        avisar({ ok: false, texto: "A conexão caiu. Confere a internet e tenta de novo." })
      } finally {
        setOQue(null)
      }
    })
  }

  const depois = (r: ResultadoDaCampanhaNoPainel, destino: "lista" | "ficar") => {
    setErros(r.ok ? {} : (r.erros ?? {}))
    avisar({ ok: r.ok, texto: r.texto })
    if (!r.ok) return
    if (destino === "lista") router.push("/crm/campanhas" as Route)
    else if (!campanha) router.replace(`/crm/campanhas/${r.id}` as Route)
    else router.refresh()
  }

  const salvar = () =>
    acao("salvar", async () =>
      depois(
        await mudarACampanha({ acao: "salvar", id: campanha?.id ?? null, campanha: atual() }),
        "ficar"
      )
    )
  const agendar = () =>
    acao("agendar", async () =>
      depois(
        await mudarACampanha({
          acao: "agendar",
          id: campanha?.id ?? null,
          campanha: atual(),
          agenda: agendaEmIso(agenda),
        }),
        "lista"
      )
    )
  const ver = () =>
    acao("ver", async () => {
      const r = await verACampanha(atual())
      if (!r.ok) {
        setErros(r.erros ?? {})
        avisar({ ok: false, texto: r.texto })
        return
      }
      setErros({})
      setPrevias(r.emails)
    })
  const testar = () =>
    acao("testar", async () => {
      const r = await mandarTesteDaCampanha(atual())
      setErros(r.ok ? {} : (r.erros ?? {}))
      avisar({ ok: r.ok, texto: r.texto })
    })
  const desmarcar = () =>
    acao("desmarcar", async () =>
      depois(await mudarACampanha({ acao: "desmarcar", id: campanha!.id }), "ficar")
    )
  const apagarRascunho = () =>
    acao("apagar", async () =>
      depois(await mudarACampanha({ acao: "apagar", id: campanha!.id }), "lista")
    )

  const girando = (nome: string) =>
    ocupado && oQue === nome ? <span className="giro" aria-hidden="true" /> : null

  return (
    <div className="campanha-form" data-formulario-da-campanha>
      <section className="bloco" aria-labelledby="campanha-quem">
        <h2 className="bloco__titulo" id="campanha-quem">
          Pra quem, e quando
        </h2>
        <div className="campos">
          <div className="campo campo--3">
            <label htmlFor="campanha-nome">
              Nome <small>(só a equipe vê)</small>
            </label>
            <input
              id="campanha-nome"
              data-campo="nome"
              value={texto.nome}
              maxLength={80}
              placeholder="Black Friday 2026"
              aria-invalid={Boolean(erros.nome)}
              onChange={(e) => mudar("nome", e.target.value)}
            />
            {erro("nome")}
          </div>
          <div className="campo campo--3">
            <label htmlFor="campanha-publico">Pra quem</label>
            <select
              id="campanha-publico"
              data-campo="publico"
              value={texto.publico}
              aria-invalid={Boolean(erros.publico)}
              onChange={(e) => mudar("publico", e.target.value as PublicoDaCampanha)}
            >
              {tela.publicos.map((p) => (
                <option key={p.id} value={p.id} data-pessoas={p.pessoas}>
                  {p.nome} — {inteiro.format(p.pessoas)} {p.pessoas === 1 ? "pessoa" : "pessoas"}
                </option>
              ))}
            </select>
            {erro("publico")}
          </div>
          <div className="campo campo--3">
            <label htmlFor="campanha-agenda">Quando sai</label>
            <input
              id="campanha-agenda"
              data-campo="agenda"
              type="datetime-local"
              value={agenda}
              aria-invalid={Boolean(erros.agenda)}
              onChange={(e) => setAgenda(e.target.value)}
            />
            <p className="campo__ajuda" data-quanto-tempo>
              Hora de Brasília. Sai aos poucos: pra {inteiro.format(pessoas)}{" "}
              {pessoas === 1 ? "pessoa" : "pessoas"}, {quantoTempo(pessoas)}. Das 22h às 8h, espera
              as 8h.
            </p>
            {erro("agenda")}
          </div>
        </div>
      </section>

      <section className="bloco" aria-labelledby="campanha-email">
        <h2 className="bloco__titulo" id="campanha-email">
          O e-mail
        </h2>
        <div className="campos">
          <fieldset className="campo" aria-invalid={Boolean(erros.jeito)} data-campo="jeito">
            <legend className="campo__rot">Como chega</legend>
            <div className="campanha-jeitos">
              {JEITOS.map((j) => (
                <label key={j.id} className="campanha-jeito" data-jeito={j.id}>
                  <input
                    type="radio"
                    name="campanha-jeito"
                    value={j.id}
                    checked={texto.jeito === j.id}
                    onChange={() => mudar("jeito", j.id)}
                  />
                  <span className="campanha-jeito__nome">{j.nome}</span>
                  <span className="campanha-jeito__sub">{j.sub}</span>
                </label>
              ))}
            </div>
            {erro("jeito")}
          </fieldset>
          <div className="campo campo--4">
            <label htmlFor="campanha-assunto">Assunto</label>
            <input
              id="campanha-assunto"
              data-campo="assunto"
              value={texto.assunto}
              maxLength={120}
              aria-invalid={Boolean(erros.assunto)}
              onChange={(e) => mudar("assunto", e.target.value)}
            />
            {erro("assunto")}
          </div>
          <div className="campo campo--2 campo--marcar">
            <label className="marcar">
              <input
                type="checkbox"
                data-campo="comTeste"
                checked={comTeste}
                onChange={(e) => setComTeste(e.target.checked)}
              />
              Testar outro assunto (metade recebe cada um)
            </label>
          </div>
          {comTeste ? (
            <div className="campo campo--4">
              <label htmlFor="campanha-assunto-b">Assunto B</label>
              <input
                id="campanha-assunto-b"
                data-campo="assuntoB"
                value={texto.assuntoB ?? ""}
                maxLength={120}
                aria-invalid={Boolean(erros.assuntoB)}
                onChange={(e) => mudar("assuntoB", e.target.value)}
              />
              <p className="campo__ajuda">A tela mostra qual dos dois vendeu mais em 7 dias.</p>
              {erro("assuntoB")}
            </div>
          ) : null}
          <div className="campo">
            <label htmlFor="campanha-previa">
              Prévia <small>(a linha cinza depois do assunto, na caixa de entrada)</small>
            </label>
            <input
              id="campanha-previa"
              data-campo="previa"
              value={texto.previa}
              maxLength={150}
              aria-invalid={Boolean(erros.previa)}
              onChange={(e) => mudar("previa", e.target.value)}
            />
            {erro("previa")}
          </div>
          <div className="campo">
            <label htmlFor="campanha-titulo">Título</label>
            <input
              id="campanha-titulo"
              data-campo="titulo"
              value={texto.titulo}
              maxLength={80}
              aria-invalid={Boolean(erros.titulo)}
              onChange={(e) => mudar("titulo", e.target.value)}
            />
            {erro("titulo")}
          </div>
          <div className="campo">
            <label htmlFor="campanha-texto">Texto</label>
            <textarea
              id="campanha-texto"
              data-campo="texto"
              rows={6}
              value={texto.texto}
              maxLength={1500}
              aria-invalid={Boolean(erros.texto)}
              onChange={(e) => mudar("texto", e.target.value)}
            />
            <p className="campo__ajuda">Deixe uma linha em branco entre os parágrafos.</p>
            {erro("texto")}
          </div>
          <div className="campo campo--3">
            <label htmlFor="campanha-botao">Botão</label>
            <input
              id="campanha-botao"
              data-campo="botaoTexto"
              value={texto.botao?.texto ?? ""}
              maxLength={40}
              placeholder="Sem botão"
              aria-invalid={Boolean(erros.botao)}
              onChange={(e) =>
                mudar("botao", { texto: e.target.value, caminho: texto.botao?.caminho ?? "/" })
              }
            />
            {erro("botao")}
          </div>
          <div className="campo campo--3">
            <label htmlFor="campanha-destino">O botão leva pra</label>
            <select
              id="campanha-destino"
              data-campo="botaoCaminho"
              value={texto.botao?.caminho ?? "/"}
              onChange={(e) =>
                mudar("botao", { texto: texto.botao?.texto ?? "", caminho: e.target.value })
              }
            >
              <option value="/">A página inicial</option>
              <option value="/produtos">Todos os produtos</option>
              {tela.produtos.map((p) => (
                <option key={p.handle} value={`/produtos/${p.handle}`}>
                  {p.nome}
                </option>
              ))}
            </select>
          </div>
          <fieldset className="campo" aria-invalid={Boolean(erros.produtos)}>
            <legend className="campo__rot">
              Produtos no e-mail <small>(até 3)</small>
            </legend>
            <div className="campanha-produtos">
              {tela.produtos.map((p) => {
                const marcado = texto.produtos.includes(p.handle)
                return (
                  <label key={p.handle} className="marcar">
                    <input
                      type="checkbox"
                      data-produto={p.handle}
                      checked={marcado}
                      disabled={!marcado && texto.produtos.length >= 3}
                      onChange={(e) =>
                        mudar(
                          "produtos",
                          e.target.checked
                            ? [...texto.produtos, p.handle]
                            : texto.produtos.filter((h) => h !== p.handle)
                        )
                      }
                    />
                    {p.nome}
                  </label>
                )
              })}
            </div>
            {erro("produtos")}
          </fieldset>
        </div>
      </section>

      <div className="form-acoes campanha-acoes">
        <div className="campanha-acoes__grupo">
          <button
            type="button"
            className="btn btn--contorno btn--menor"
            onClick={ver}
            disabled={ocupado}
            data-ver-como-fica
          >
            {girando("ver")}
            Ver como fica
          </button>
          <button
            type="button"
            className="btn btn--contorno btn--menor"
            onClick={testar}
            disabled={ocupado}
            data-mandar-pra-mim
          >
            {girando("testar")}
            Mandar pra mim
          </button>
        </div>
        <div className="campanha-acoes__grupo">
          {campanha?.situacao === "rascunho" ? (
            <button
              type="button"
              className="btn btn--fantasma btn--menor"
              onClick={() => (apagar ? apagarRascunho() : setApagar(true))}
              disabled={ocupado}
              data-apagar
            >
              {girando("apagar")}
              {apagar ? "Clique de novo pra apagar" : "Apagar"}
            </button>
          ) : null}
          {campanha?.situacao === "agendada" ? (
            <button
              type="button"
              className="btn btn--fantasma btn--menor"
              onClick={desmarcar}
              disabled={ocupado}
              data-desmarcar
            >
              {girando("desmarcar")}
              Desmarcar o envio
            </button>
          ) : null}
          <button
            type="button"
            className="btn btn--contorno btn--menor"
            onClick={salvar}
            disabled={ocupado}
            data-salvar
          >
            {girando("salvar")}
            Salvar
          </button>
          <button
            type="button"
            className="btn btn--menor"
            onClick={agendar}
            disabled={ocupado}
            data-agendar
          >
            {girando("agendar")}
            {campanha?.situacao === "agendada" ? "Agendar de novo" : "Agendar"}
          </button>
        </div>
      </div>

      {previas ? <QuadroDaPrevia previas={previas} /> : null}
    </div>
  )
}

type Previa = { assunto: string; html: string }

/**
 * O E-MAIL COMO CHEGA, num quadro sem script — o mesmo `sandbox` do modelo
 * dos e-mails (`emails-do-crm.tsx`, que diz o porquê), e os links em outra
 * aba. Com o teste do assunto, um botão pra cada.
 */
function QuadroDaPrevia({ previas }: { previas: Previa[] }) {
  const [qual, setQual] = useState(0)
  const atual = previas[qual] ?? previas[0]
  return (
    <section
      className="bloco previa-da-campanha"
      aria-label="Como fica o e-mail"
      data-previa-da-campanha
    >
      {previas.length > 1 ? (
        <div className="previa-da-campanha__abas" role="group" aria-label="Qual assunto">
          {previas.map((p, i) => (
            <button
              key={i}
              type="button"
              className="btn btn--menor btn--contorno"
              aria-pressed={qual === i}
              onClick={() => setQual(i)}
            >
              Assunto {i === 0 ? "A" : "B"}
            </button>
          ))}
        </div>
      ) : null}
      <p className="previa-da-campanha__assunto">
        <span>Assunto:</span> {atual?.assunto}
      </p>
      <iframe
        className="previa-da-campanha__quadro"
        title="O e-mail da campanha"
        srcDoc={(atual?.html ?? "").replace(/<head>/i, '<head><base target="_blank">')}
        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      />
    </section>
  )
}

/** "VER O E-MAIL" da campanha que já saiu: como ele chegou (sem mudar nada). */
export function VerOEmailDaCampanha({ texto }: { texto: TextoDaCampanha }) {
  const avisar = useAvisar()
  const [previas, setPrevias] = useState<Previa[] | null>(null)
  const [ocupado, comecar] = useTransition()
  return (
    <section className="bloco" aria-labelledby="campanha-o-email" data-o-email-da-campanha>
      <div className="bloco__cabeca">
        <div>
          <h2 className="bloco__titulo" id="campanha-o-email">
            O e-mail
          </h2>
          <p className="bloco__sub">
            “{texto.assunto}”{texto.assuntoB ? <> e “{texto.assuntoB}”</> : null}
          </p>
        </div>
        {previas ? null : (
          <button
            type="button"
            className="btn btn--contorno btn--menor"
            disabled={ocupado}
            data-ver-o-email
            onClick={() =>
              comecar(async () => {
                const r = await verACampanha(texto)
                if (r.ok) setPrevias(r.emails)
                else avisar({ ok: false, texto: r.texto })
              })
            }
          >
            {ocupado ? <span className="giro" aria-hidden="true" /> : null}
            Ver como chegou
          </button>
        )}
      </div>
      {previas ? <QuadroDaPrevia previas={previas} /> : null}
    </section>
  )
}

/** "PARAR O ENVIO" da campanha que está saindo: quem ainda não recebeu, não recebe mais. */
export function PararACampanha({ id }: { id: string }) {
  const avisar = useAvisar()
  const router = useRouter()
  const [certeza, setCerteza] = useState(false)
  const [ocupado, comecar] = useTransition()
  return (
    <button
      type="button"
      className="btn btn--fantasma btn--menor"
      disabled={ocupado}
      data-parar
      onClick={() => {
        if (!certeza) return setCerteza(true)
        comecar(async () => {
          const r = await mudarACampanha({ acao: "parar", id })
          avisar({ ok: r.ok, texto: r.texto })
          if (r.ok) router.refresh()
        })
      }}
    >
      {ocupado ? <span className="giro" aria-hidden="true" /> : null}
      {certeza ? "Clique de novo pra parar" : "Parar o envio"}
    </button>
  )
}
