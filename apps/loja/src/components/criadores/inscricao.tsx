"use client"

import Link from "next/link"
import { useActionState, useEffect, useId, useRef, useState, type ReactNode } from "react"
import { ID_ESTRELA } from "@/components/estrelas"
import { Raio } from "@/components/icones"
import { inscreverCriador } from "@/lib/acoes/criadores"
import {
  BARBAS,
  EVENTO_DO_MODELO,
  EXPERIENCIAS,
  INSCRICAO_INICIO,
  LIMITES,
  MODELOS,
  NOME_DO_MODELO,
  OFERTA,
  SEGUIDORES,
  type CampoDaInscricao,
  type EstadoDaInscricao,
  type Modelo,
} from "@/lib/criadores-visivel"
import { SEM_CONEXAO, semQueda } from "@/lib/rede"
import { redes, site } from "@/lib/site"

const TIKTOK = redes.find((r) => r.nome === "TikTok")?.url ?? site.instagram

const ehModelo = (v: unknown): v is Modelo => v === "fixo" || v === "comissao" || v === "conversar"

/** Sem internet, a ação nem volta: a frase aparece em cima do botão, com o que foi digitado. */
const enviar = (anterior: EstadoDaInscricao, fd: FormData) =>
  semQueda(
    () => inscreverCriador(anterior, fd),
    (): EstadoDaInscricao => ({
      tipo: "erro",
      texto: SEM_CONEXAO,
      valores: {
        nome: String(fd.get("nome") ?? ""),
        whatsapp: String(fd.get("whatsapp") ?? ""),
        email: String(fd.get("email") ?? ""),
        cidade: String(fd.get("cidade") ?? ""),
        instagram: String(fd.get("instagram") ?? ""),
        tiktok: String(fd.get("tiktok") ?? ""),
        seguidores: String(fd.get("seguidores") ?? ""),
        barba: String(fd.get("barba") ?? ""),
        experiencia: String(fd.get("experiencia") ?? ""),
        video: String(fd.get("video") ?? ""),
        parceria: fd.get("parceria") === "on",
        modelo: String(fd.get("modelo") ?? ""),
        aceite: fd.get("aceite") === "on",
      },
      rodada: (anterior.tipo === "erro" ? anterior.rodada : 0) + 1,
    })
  )

/**
 * A INSCRIÇÃO — quem é, onde posta, como tá a barba e como quer ganhar. Os
 * campos são os do checkout (`.campo`), com a mesma cara: quem vem dos
 * anúncios da loja reconhece.
 *
 * O MODELO pode chegar marcado pelos botões das propostas ("Quero o
 * fixo"), pelo evento `EVENTO_DO_MODELO`. Depois de mandar, o "valeu" diz
 * pra onde a loja vai responder; "mandar de novo" remonta o formulário (o
 * Medusa atualiza a inscrição do mesmo e-mail).
 */
export function Inscricao() {
  const [vez, setVez] = useState(0)
  return <Formulario key={vez} deNovo={() => setVez((v) => v + 1)} />
}

function Formulario({ deNovo }: { deNovo: () => void }) {
  const [estado, acao, enviando] = useActionState(enviar, INSCRICAO_INICIO)
  const valores = estado.tipo === "erro" ? estado.valores : null
  const [modelo, setModelo] = useState("")
  const id = useId()
  const erroDe = (campo: CampoDaInscricao) =>
    estado.tipo === "erro" && estado.campo === campo ? estado.texto : ""
  /** A chave que remonta o campo depois de um erro, pra ele voltar com o que foi digitado. */
  const vez = (campo: string) => `${campo}-${estado.tipo === "erro" ? estado.rodada : 0}`

  useEffect(() => {
    const ouvir = (e: Event) => {
      const m = (e as CustomEvent<unknown>).detail
      if (ehModelo(m)) setModelo(m)
    }
    window.addEventListener(EVENTO_DO_MODELO, ouvir)
    return () => window.removeEventListener(EVENTO_DO_MODELO, ouvir)
  }, [])

  if (estado.tipo === "enviada") {
    return (
      <Sucesso
        nome={estado.nome}
        whatsapp={estado.whatsapp}
        modelo={estado.modelo}
        deNovo={deNovo}
      />
    )
  }

  const modeloMarcado = modelo || valores?.modelo || ""

  return (
    <form
      action={acao}
      className="bloco criadores__form"
      onSubmit={(ev) => enviando && ev.preventDefault()}
      noValidate
      data-inscricao
      data-clarity-mask="true"
    >
      <fieldset className="criadores__grupo">
        <legend className="criadores__grupo-titulo">
          <span className="bloco__num">1</span>Você
        </legend>
        <div className="campos">
          <Campo id={`${id}-nome`} rotulo="Nome completo" erro={erroDe("nome")}>
            <input
              id={`${id}-nome`}
              name="nome"
              type="text"
              autoComplete="name"
              placeholder="Ex.: Rafael Souza"
              key={vez("nome")}
              defaultValue={valores?.nome ?? ""}
              maxLength={LIMITES.nome.max}
              aria-invalid={Boolean(erroDe("nome")) || undefined}
              aria-describedby={`${id}-nome-erro`}
              required
            />
          </Campo>
          <Campo
            id={`${id}-whatsapp`}
            rotulo="WhatsApp com DDD"
            erro={erroDe("whatsapp")}
            classe="campo--3"
          >
            <input
              id={`${id}-whatsapp`}
              name="whatsapp"
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              placeholder="(47) 99999-0000"
              key={vez("whatsapp")}
              defaultValue={valores?.whatsapp ?? ""}
              maxLength={20}
              aria-invalid={Boolean(erroDe("whatsapp")) || undefined}
              aria-describedby={`${id}-whatsapp-erro`}
              required
            />
          </Campo>
          <Campo id={`${id}-email`} rotulo="E-mail" erro={erroDe("email")} classe="campo--3">
            <input
              id={`${id}-email`}
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="voce@email.com"
              key={vez("email")}
              defaultValue={valores?.email ?? ""}
              maxLength={254}
              aria-invalid={Boolean(erroDe("email")) || undefined}
              aria-describedby={`${id}-email-erro`}
              required
            />
          </Campo>
          <Campo id={`${id}-cidade`} rotulo="Cidade e estado" erro={erroDe("cidade")}>
            <input
              id={`${id}-cidade`}
              name="cidade"
              type="text"
              autoComplete="address-level2"
              placeholder="Ex.: Joinville, SC"
              key={vez("cidade")}
              defaultValue={valores?.cidade ?? ""}
              maxLength={LIMITES.cidade.max}
              aria-invalid={Boolean(erroDe("cidade")) || undefined}
              aria-describedby={`${id}-cidade-erro`}
              required
            />
          </Campo>
        </div>
      </fieldset>

      <fieldset className="criadores__grupo">
        <legend className="criadores__grupo-titulo">
          <span className="bloco__num">2</span>Seu conteúdo
        </legend>
        <div className="campos">
          <Campo id={`${id}-instagram`} rotulo="Instagram" classe="campo--3">
            <span
              className="criadores__arroba"
              data-invalido={Boolean(erroDe("redes")) || undefined}
            >
              <span aria-hidden="true">@</span>
              <input
                id={`${id}-instagram`}
                name="instagram"
                type="text"
                autoCapitalize="off"
                autoComplete="off"
                spellCheck={false}
                placeholder="seuperfil"
                key={vez("instagram")}
                defaultValue={valores?.instagram ?? ""}
                maxLength={120}
                aria-invalid={Boolean(erroDe("redes")) || undefined}
                aria-describedby={`${id}-redes-erro`}
              />
            </span>
          </Campo>
          <Campo id={`${id}-tiktok`} rotulo="TikTok" classe="campo--3">
            <span
              className="criadores__arroba"
              data-invalido={Boolean(erroDe("redes")) || undefined}
            >
              <span aria-hidden="true">@</span>
              <input
                id={`${id}-tiktok`}
                name="tiktok"
                type="text"
                autoCapitalize="off"
                autoComplete="off"
                spellCheck={false}
                placeholder="seuperfil"
                key={vez("tiktok")}
                defaultValue={valores?.tiktok ?? ""}
                maxLength={120}
                aria-invalid={Boolean(erroDe("redes")) || undefined}
                aria-describedby={`${id}-redes-erro`}
              />
            </span>
          </Campo>
          <span
            className="campo__erro criadores__erro-largo"
            id={`${id}-redes-erro`}
            aria-live="polite"
          >
            {erroDe("redes")}
          </span>
          <Campo
            id={`${id}-seguidores`}
            rotulo="Seguidores no seu maior perfil"
            opcional
            erro={erroDe("seguidores")}
          >
            <select
              id={`${id}-seguidores`}
              name="seguidores"
              key={vez("seguidores")}
              defaultValue={valores?.seguidores ?? ""}
              aria-describedby={`${id}-seguidores-erro`}
            >
              <option value="">Escolha uma faixa</option>
              {SEGUIDORES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome}
                </option>
              ))}
            </select>
          </Campo>
          <Opcoes
            id={`${id}-barba`}
            nome="barba"
            legenda="Sua barba hoje"
            opcoes={BARBAS}
            marcada={valores?.barba ?? ""}
            erro={erroDe("barba")}
            chave={vez("barba")}
          />
          <Opcoes
            id={`${id}-experiencia`}
            nome="experiencia"
            legenda="Já gravou publi ou UGC?"
            opcional
            opcoes={EXPERIENCIAS}
            marcada={valores?.experiencia ?? ""}
            erro={erroDe("experiencia")}
            chave={vez("experiencia")}
          />
          <Campo id={`${id}-video`} rotulo="Link de um vídeo seu" opcional erro={erroDe("video")}>
            <input
              id={`${id}-video`}
              name="video"
              type="text"
              inputMode="url"
              autoCapitalize="off"
              autoComplete="off"
              spellCheck={false}
              placeholder="Reels, TikTok ou Google Drive"
              key={vez("video")}
              defaultValue={valores?.video ?? ""}
              maxLength={LIMITES.video}
              aria-invalid={Boolean(erroDe("video")) || undefined}
              aria-describedby={`${id}-video-erro ${id}-video-ajuda`}
            />
            <small className="criadores__ajuda" id={`${id}-video-ajuda`}>
              Não precisa ser publi. De preferência, um em que você aparece falando.
            </small>
          </Campo>
          <label className="criadores__marcar">
            <input
              type="checkbox"
              name="parceria"
              key={vez("parceria")}
              defaultChecked={valores?.parceria ?? false}
            />
            <span>Topo rodar alguns vídeos como anúncio de parceria, saindo pelo meu perfil.</span>
          </label>
        </div>
      </fieldset>

      <fieldset className="criadores__grupo" aria-describedby={`${id}-modelo-erro`}>
        <legend className="criadores__grupo-titulo">
          <span className="bloco__num">3</span>Como quer ganhar
        </legend>
        {/* Remonta a cada envio: o React 19 limpa o formulário depois da ação, e o rádio
            controlado ficaria desmarcado com o estado dizendo o contrário. */}
        <div
          className="criadores__modelos"
          key={vez("modelos")}
          data-invalido={Boolean(erroDe("modelo")) || undefined}
        >
          {MODELOS.map((m) => (
            <label key={m.id} className="criadores__modelo">
              <input
                type="radio"
                name="modelo"
                value={m.id}
                checked={modeloMarcado === m.id}
                onChange={() => setModelo(m.id)}
              />
              <span className="criadores__modelo-caixa">
                <b>{m.rotulo}</b>
                <span className="criadores__modelo-valor">{m.valor}</span>
                <small>{m.detalhe}</small>
              </span>
            </label>
          ))}
        </div>
        <span className="campo__erro" id={`${id}-modelo-erro`} aria-live="polite">
          {erroDe("modelo")}
        </span>
      </fieldset>

      <div className="criadores__aceite-bloco">
        <label className="criadores__marcar">
          <input
            type="checkbox"
            name="aceite"
            key={vez("aceite")}
            defaultChecked={valores?.aceite ?? false}
            aria-invalid={Boolean(erroDe("aceite")) || undefined}
            aria-describedby={`${id}-aceite-erro`}
          />
          <span>
            Tenho 18 anos ou mais e autorizo a FuckingBarba a usar estes dados pra avaliar minha
            inscrição e falar comigo por WhatsApp e e-mail.{" "}
            <Link href="/privacidade" target="_blank">
              Política de privacidade
            </Link>
          </span>
        </label>
        <span className="campo__erro" id={`${id}-aceite-erro`} aria-live="polite">
          {erroDe("aceite")}
        </span>
      </div>

      {estado.tipo === "erro" && !estado.campo ? (
        <p className="criadores__recado" role="alert">
          {estado.texto}
        </p>
      ) : null}

      <button type="submit" className="btn btn--bloco" disabled={enviando} aria-busy={enviando}>
        {enviando ? (
          <>
            <span className="giro" aria-hidden="true" /> Enviando…
          </>
        ) : (
          <>
            Enviar inscrição <Raio className="btn__bolt" />
          </>
        )}
      </button>
    </form>
  )
}

/**
 * O "VALEU" — no lugar do formulário. Ele é bem mais curto, e a página ficaria
 * parada lá embaixo, nas dúvidas: por isso rola até ele e põe o foco nele
 * (quem usa leitor de tela ouve o título).
 */
function Sucesso({
  nome,
  whatsapp,
  modelo,
  deNovo,
}: {
  nome: string
  whatsapp: string
  modelo: Modelo
  deNovo: () => void
}) {
  const caixa = useRef<HTMLElement>(null)
  const id = useId()
  useEffect(() => {
    const reduz = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    caixa.current?.focus({ preventScroll: true })
    caixa.current?.scrollIntoView({ behavior: reduz ? "auto" : "smooth", block: "center" })
  }, [])
  return (
    <section
      className="bloco criadores__sucesso"
      data-inscricao-enviada
      aria-labelledby={`${id}-valeu`}
      tabIndex={-1}
      ref={caixa}
    >
      <span className="criadores__sucesso-ico" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <use href={`#${ID_ESTRELA}`} />
        </svg>
      </span>
      <h3 className="criadores__h2" id={`${id}-valeu`} role="status">
        Valeu{nome ? `, ${nome}` : ""}!
      </h3>
      <p>
        A gente olha seu perfil e responde em até {OFERTA.respostaDiasUteis} dias úteis, no WhatsApp{" "}
        <b className="num">{whatsapp}</b>.
      </p>
      <p>
        Modelo escolhido: <b>{NOME_DO_MODELO[modelo]}</b>.
      </p>
      <p>
        Enquanto isso, segue a gente no{" "}
        <a href={site.instagram} target="_blank" rel="noopener noreferrer">
          Instagram
        </a>{" "}
        e no{" "}
        <a href={TIKTOK} target="_blank" rel="noopener noreferrer">
          TikTok
        </a>
        : @fuckingbarba.
      </p>
      <button type="button" className="criadores__de-novo" onClick={deNovo}>
        Errou algum dado? Manda de novo com o mesmo e-mail
      </button>
    </section>
  )
}

/** Um campo do checkout: o rótulo, o que vai dentro e a frase do erro embaixo. */
function Campo({
  id,
  rotulo,
  opcional,
  erro,
  classe,
  children,
}: {
  id: string
  rotulo: string
  opcional?: boolean
  erro?: string
  classe?: string
  children: ReactNode
}) {
  return (
    <div className={classe ? `campo ${classe}` : "campo"}>
      <label htmlFor={id}>
        {rotulo} {opcional ? <small>(opcional)</small> : null}
      </label>
      {children}
      {erro !== undefined ? (
        <span className="campo__erro" id={`${id}-erro`} aria-live="polite">
          {erro}
        </span>
      ) : null}
    </div>
  )
}

/** Uma pergunta de marcar uma opção (a barba, a experiência), com as opções lado a lado. */
function Opcoes({
  id,
  nome,
  legenda,
  opcional,
  opcoes,
  marcada,
  erro,
  chave,
}: {
  id: string
  nome: string
  legenda: string
  opcional?: boolean
  opcoes: readonly { id: string; nome: string }[]
  marcada: string
  erro: string
  chave: string
}) {
  return (
    <fieldset className="campo criadores__opcoes" aria-describedby={`${id}-erro`} key={chave}>
      <legend>
        {legenda} {opcional ? <small>(opcional)</small> : null}
      </legend>
      <div className="criadores__chips" data-invalido={Boolean(erro) || undefined}>
        {opcoes.map((o) => (
          <label key={o.id} className="criadores__chip">
            <input type="radio" name={nome} value={o.id} defaultChecked={marcada === o.id} />
            <span>{o.nome}</span>
          </label>
        ))}
      </div>
      <span className="campo__erro" id={`${id}-erro`} aria-live="polite">
        {erro}
      </span>
    </fieldset>
  )
}
