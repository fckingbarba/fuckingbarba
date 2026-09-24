"use client"

import { useActionState, useCallback, useEffect, useState, useTransition } from "react"
import { useAvisar } from "@/components/avisos"
import { Gaveta } from "@/components/gaveta"
import { Icone } from "@/components/icones"
import { convidar, mudarPapel, reenviarConvite, tirarDaEquipe } from "@/lib/acoes/equipe"
import {
  iniciais,
  NOME_DO_PAPEL,
  PAPEIS,
  RESUMO_DO_PAPEL,
  type Membro,
  type Papel,
} from "@/lib/equipe"
import { CONVITE_INICIAL, type ResultadoDaMudanca } from "@/lib/equipe-visivel"

/** O membro, com a frase do estado dele já escrita pelo servidor (hora de Brasília). */
export type PessoaDaLista = Membro & { estado: string; conviteVencido: boolean }

/**
 * A EQUIPE — quem entra no painel, com que papel, e o que o dono faz com
 * cada um: mudar o papel, tirar da equipe, reenviar o convite. Tudo passa
 * pelo Medusa, que confere de novo (ninguém mexe em si mesmo; a loja nunca
 * fica sem dono) — o que a tela esconde é só conforto.
 */
export function Equipe({ membros, eu }: { membros: PessoaDaLista[]; eu: string }) {
  const [convidando, setConvidando] = useState(false)
  const [aberto, setAberto] = useState<string | null>(null)
  // O aviso de baixo é o do painel inteiro (`ComAvisos`, no layout).
  const avisarNoPainel = useAvisar()
  const mostrarAviso = (texto: string) => avisarNoPainel({ ok: true, texto })

  const fecharConvite = useCallback(() => setConvidando(false), [])

  return (
    <>
      <section className="bloco equipe">
        <div className="bloco__cabeca">
          <div>
            <h2 className="bloco__titulo">Quem entra no painel</h2>
            <p className="bloco__sub">
              Cada pessoa entra com o próprio e-mail, por código. Ninguém divide senha.
            </p>
          </div>
          <button type="button" className="btn btn--menor" onClick={() => setConvidando(true)}>
            <Icone nome="enviar" />
            Convidar pessoa
          </button>
        </div>
        <div className="linhas">
          {membros.map((m) => (
            <Pessoa
              key={m.id}
              membro={m}
              souEu={m.id === eu}
              aberta={aberto === m.id}
              abrir={() => setAberto(aberto === m.id ? null : m.id)}
              avisar={(texto) => {
                mostrarAviso(texto)
                setAberto(null)
              }}
            />
          ))}
        </div>
      </section>

      {convidando ? (
        <Gaveta titulo="Convidar pessoa" fechar={fecharConvite}>
          <FormConvite
            fechar={fecharConvite}
            aoConvidar={(texto) => {
              setConvidando(false)
              mostrarAviso(texto)
            }}
          />
        </Gaveta>
      ) : null}
    </>
  )
}

function Pessoa({
  membro,
  souEu,
  aberta,
  abrir,
  avisar,
}: {
  membro: PessoaDaLista
  souEu: boolean
  aberta: boolean
  abrir: () => void
  avisar: (texto: string) => void
}) {
  const convidado = membro.situacao === "convidado"
  return (
    <div className={`linha${aberta ? " linha--aberta" : ""}`}>
      <div className="com-foto">
        <span className="avatar" aria-hidden="true">
          {iniciais(membro.nome)}
        </span>
        <div style={{ minWidth: 0 }}>
          <p className="linha__titulo">
            {membro.nome} {souEu ? <span className="selo">você</span> : null}
          </p>
          <p className="linha__txt">
            {membro.email} · {membro.estado}
          </p>
        </div>
      </div>
      <div className="pessoa__lado">
        {convidado ? (
          <span className="status" data-s={membro.conviteVencido ? "cancelado" : "convite"}>
            {membro.conviteVencido ? "Convite vencido" : "Convite"}
          </span>
        ) : null}
        <span className="status" data-s={membro.papel === "dono" ? "enviado" : "ativo"}>
          {NOME_DO_PAPEL[membro.papel]}
        </span>
        {souEu ? null : (
          <button
            type="button"
            className="btn btn--fantasma"
            aria-expanded={aberta}
            aria-label={`Mudar o acesso de ${membro.nome}`}
            onClick={abrir}
          >
            {aberta ? "Fechar" : "Mudar"}
          </button>
        )}
      </div>
      {aberta ? <Mudar membro={membro} avisar={avisar} /> : null}
    </div>
  )
}

/**
 * O QUE O DONO MUDA NUMA PESSOA — o papel (a escolha em linha, como o
 * protótipo), o convite de novo (pra quem ainda não entrou) e tirar da
 * equipe, com a confirmação que diz o que acontece.
 */
function Mudar({ membro, avisar }: { membro: PessoaDaLista; avisar: (texto: string) => void }) {
  const [papel, setPapel] = useState<Papel>(membro.papel)
  const [confirmando, setConfirmando] = useState(false)
  const [erro, setErro] = useState("")
  const [ocupado, comecar] = useTransition()

  function fazer(acao: () => Promise<ResultadoDaMudanca>) {
    setErro("")
    comecar(async () => {
      const r = await acao()
      if (r.ok) avisar(r.aviso)
      else setErro(r.erro)
    })
  }

  const nomeDoGrupo = `papel-${membro.id}`
  return (
    <div className="pessoa__mudar">
      <fieldset className="campo">
        <legend className="campo__rot">Papel</legend>
        <div className="segmento">
          {PAPEIS.map((p) => (
            <label key={p}>
              <input
                type="radio"
                name={nomeDoGrupo}
                value={p}
                checked={papel === p}
                onChange={() => setPapel(p)}
              />
              <span>{NOME_DO_PAPEL[p]}</span>
            </label>
          ))}
        </div>
        <p className="campo__ajuda">
          {NOME_DO_PAPEL[papel]}: {RESUMO_DO_PAPEL[papel]}.
        </p>
      </fieldset>

      <div className="pessoa__mudar-acoes">
        <button
          type="button"
          className="btn btn--menor"
          disabled={ocupado || papel === membro.papel}
          onClick={() => fazer(() => mudarPapel(membro.id, papel))}
        >
          {ocupado ? <span className="giro" aria-hidden="true" /> : null}
          Salvar papel
        </button>
        {membro.situacao === "convidado" ? (
          <button
            type="button"
            className="btn btn--contorno btn--menor"
            disabled={ocupado}
            onClick={() => fazer(() => reenviarConvite(membro.id))}
          >
            <Icone nome="email" />
            Reenviar convite
          </button>
        ) : null}
        <button
          type="button"
          className="btn btn--fantasma"
          disabled={ocupado}
          onClick={() => setConfirmando(true)}
        >
          Tirar da equipe
        </button>
      </div>

      {confirmando ? (
        <div className="confirma" role="alertdialog" aria-label={`Tirar ${membro.nome} da equipe`}>
          <p>
            <b>Tirar {membro.nome} da equipe?</b>
          </p>
          <ul>
            <li>
              O acesso cai na hora, até no celular em que a pessoa estiver com o painel aberto.
            </li>
            <li>O que foi feito até aqui fica no registro, com o nome de quem fez.</li>
            <li>Pra voltar, é só convidar de novo.</li>
          </ul>
          <div className="confirma__acoes">
            <button
              type="button"
              className="btn btn--perigo btn--menor"
              disabled={ocupado}
              onClick={() => fazer(() => tirarDaEquipe(membro.id))}
            >
              {ocupado ? <span className="giro" aria-hidden="true" /> : null}
              Tirar da equipe
            </button>
            <button
              type="button"
              className="btn btn--fantasma"
              onClick={() => setConfirmando(false)}
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : null}

      {erro ? (
        <p className="pessoa__erro" role="alert">
          {erro}
        </p>
      ) : null}
    </div>
  )
}

function FormConvite({
  fechar,
  aoConvidar,
}: {
  fechar: () => void
  aoConvidar: (texto: string) => void
}) {
  const [estado, acao, enviando] = useActionState(convidar, CONVITE_INICIAL)

  // Deu certo: a gaveta fecha e o aviso aparece — depois do render, que o
  // estado novo chega pelo `useActionState`.
  useEffect(() => {
    if (estado.ok) aoConvidar(estado.aviso)
  }, [estado, aoConvidar])

  const { erros, valores } = estado
  return (
    <form
      action={acao}
      onSubmit={(ev) => enviando && ev.preventDefault()}
      noValidate
      key={estado.rodada}
    >
      <div className="campos">
        <div className="campo">
          <label htmlFor="c-nome">Nome</label>
          <input
            id="c-nome"
            name="nome"
            autoComplete="off"
            defaultValue={valores.nome}
            aria-invalid={erros.nome ? true : undefined}
            aria-describedby="c-nome-erro"
            required
          />
          <p className="campo__erro" id="c-nome-erro">
            {erros.nome ?? ""}
          </p>
        </div>
        <div className="campo">
          <label htmlFor="c-email">E-mail</label>
          <input
            id="c-email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="off"
            placeholder="nome@fuckingbarba.com.br"
            defaultValue={valores.email}
            aria-invalid={erros.email ? true : undefined}
            aria-describedby="c-email-erro"
            required
          />
          <p className="campo__erro" id="c-email-erro">
            {erros.email ?? ""}
          </p>
        </div>
        <div className="campo">
          <label htmlFor="c-papel">Papel</label>
          <select
            id="c-papel"
            name="papel"
            defaultValue={valores.papel || "operacao"}
            aria-invalid={erros.papel ? true : undefined}
            aria-describedby="c-papel-ajuda"
          >
            {(["operacao", "marketing", "dono"] as Papel[]).map((p) => (
              <option key={p} value={p}>
                {NOME_DO_PAPEL[p]} — {RESUMO_DO_PAPEL[p]}
              </option>
            ))}
          </select>
          <p className="campo__ajuda" id="c-papel-ajuda">
            {erros.papel ?? "Dá pra mudar depois. O convite vale 7 dias."}
          </p>
        </div>
      </div>
      {estado.aviso && !estado.ok ? (
        <p className="pessoa__erro" role="alert" style={{ marginTop: 14 }}>
          {estado.aviso}
        </p>
      ) : null}
      <div className="form-acoes">
        <button type="button" className="btn btn--fantasma" onClick={fechar}>
          Cancelar
        </button>
        <button type="submit" className="btn btn--menor" disabled={enviando} aria-busy={enviando}>
          {enviando ? <span className="giro" aria-hidden="true" /> : <Icone nome="enviar" />}
          Mandar convite
        </button>
      </div>
    </form>
  )
}
