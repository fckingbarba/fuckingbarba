"use client"

import { useEffect, useId, useRef, useState, useTransition } from "react"
import "@/estilos/primeira-compra.css"
import { cadastrarNaPrimeiraCompra } from "@/lib/acoes/primeira-compra"
import { COOKIE_DO_POPUP, DIAS_FECHADO, type RespostaDoPopup } from "@/lib/primeira-compra"

/**
 * O POP-UP DA 1ª COMPRA — o nome e o e-mail em troca do cupom
 * (`lib/acoes/primeira-compra.ts`). No computador, no meio da tela; no
 * celular, sobe de baixo. Quem abre é o vigia (`./vigia.tsx`), que só baixa
 * este arquivo (e o CSS dele) na hora.
 *
 * Fechar (o X, o "Agora não", o fundo escuro ou o Esc) guarda a escolha por
 * 30 dias. Cadastrar, pra sempre — quem grava é o servidor.
 */

const X = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M5 5l14 14M19 5L5 19"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="square"
      fill="none"
    />
  </svg>
)

export function PopupDaPrimeiraCompra({
  porcento,
  dias,
  pagina,
  aoFechar,
}: {
  porcento: number
  dias: number
  pagina: string
  aoFechar: () => void
}) {
  const [resposta, setResposta] = useState<RespostaDoPopup | null>(null)
  const [email, setEmail] = useState("")
  const [enviando, comecar] = useTransition()
  const [copiado, setCopiado] = useState(false)
  const nome = useRef<HTMLInputElement>(null)
  const campoEmail = useRef<HTMLInputElement>(null)
  const titulo = useId()
  const cadastrou = resposta !== null && resposta.tipo !== "erro"

  const fechar = () => {
    if (!cadastrou) {
      const seguro = location.protocol === "https:" ? "; secure" : ""
      document.cookie =
        `${COOKIE_DO_POPUP}=fechado.${Date.now()}; path=/; max-age=${DIAS_FECHADO * 86400}` +
        `; samesite=lax${seguro}`
    }
    aoFechar()
  }
  const fecharRef = useRef(fechar)
  useEffect(() => {
    fecharRef.current = fechar
  })

  useEffect(() => {
    // No computador o cursor já vai pro nome; no celular não (o teclado cobriria a loja).
    if (matchMedia("(pointer: fine)").matches) nome.current?.focus({ preventScroll: true })
    const antes = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") fecharRef.current()
    }
    addEventListener("keydown", aoTeclar)
    return () => {
      document.body.style.overflow = antes
      removeEventListener("keydown", aoTeclar)
    }
  }, [])

  function enviar(fd: FormData) {
    const dados = {
      nome: String(fd.get("nome") ?? ""),
      email: String(fd.get("email") ?? ""),
      pagina,
    }
    setEmail(dados.email.trim())
    comecar(async () => {
      try {
        const r = await cadastrarNaPrimeiraCompra(dados)
        setResposta(r)
        if (r.tipo === "erro") (r.campo === "nome" ? nome : campoEmail).current?.focus()
      } catch {
        setResposta({
          tipo: "erro",
          campo: null,
          texto: "A conexão caiu. Confere a internet e tenta de novo.",
        })
      }
    })
  }

  async function copiar(codigo: string) {
    try {
      await navigator.clipboard.writeText(codigo)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 1800)
    } catch {
      // sem a área de transferência: o código está na tela e no e-mail
    }
  }

  const erro = resposta?.tipo === "erro" ? resposta : null
  const codigo =
    resposta && (resposta.tipo === "ok" || resposta.tipo === "ja-cadastrado")
      ? resposta.codigo
      : null
  const comNome = resposta && "nome" in resposta && resposta.nome ? `, ${resposta.nome}` : ""

  return (
    <div
      className="pc-escuro"
      onClick={(e) => {
        if (e.target === e.currentTarget) fechar()
      }}
      data-primeira-compra
    >
      <div className="pc-popup" role="dialog" aria-modal="true" aria-labelledby={titulo}>
        <span className="pc-alca" aria-hidden="true" />
        <div className="pc-lado" aria-hidden="true">
          <span className="pc-grande">
            {porcento}
            <small>%</small>
          </span>
          <span className="pc-pequeno">
            na 1ª
            <br />
            compra
          </span>
        </div>
        <div className="pc-corpo">
          <button type="button" className="pc-fechar" aria-label="Fechar" onClick={fechar}>
            {X}
          </button>
          {!cadastrou ? (
            <form
              className="pc-pedir"
              noValidate
              onSubmit={(e) => {
                // Sem o `action` do React: ele limparia os campos a cada envio, e o erro
                // faria a pessoa digitar tudo de novo.
                e.preventDefault()
                enviar(new FormData(e.currentTarget))
              }}
            >
              <p className="pc-titulo" id={titulo}>
                Um presente pra começar
              </p>
              <p className="pc-texto">
                Deixa seu nome e e-mail que o cupom de {porcento}% chega na hora, junto com as
                ofertas da loja. Vale {dias} dias.
              </p>
              <input
                ref={nome}
                className="pc-campo"
                name="nome"
                type="text"
                placeholder="Seu nome"
                autoComplete="given-name"
                aria-label="Seu nome"
                aria-invalid={erro?.campo === "nome" || undefined}
                maxLength={60}
                required
                data-campo-nome
              />
              <input
                ref={campoEmail}
                className="pc-campo"
                name="email"
                type="email"
                inputMode="email"
                placeholder="seu@email.com"
                autoComplete="email"
                aria-label="Seu e-mail"
                aria-invalid={erro?.campo === "email" || undefined}
                maxLength={254}
                required
                data-campo-email
              />
              {erro ? (
                <p className="pc-erro" role="alert" data-erro>
                  {erro.texto}
                </p>
              ) : null}
              <button type="submit" className="pc-botao" disabled={enviando} aria-busy={enviando}>
                {enviando ? "Enviando…" : "Quero meu cupom"}
              </button>
              <button type="button" className="pc-agora-nao" onClick={fechar}>
                Agora não
              </button>
            </form>
          ) : (
            <div className="pc-feito" data-feito={resposta?.tipo}>
              {resposta?.tipo === "ja-cliente" ? (
                <>
                  <p className="pc-titulo" id={titulo}>
                    Você já é de casa{comNome}
                  </p>
                  <p className="pc-texto">
                    O cupom é pra primeira compra. Mas você entrou na lista das ofertas: fica de
                    olho no e-mail.
                  </p>
                </>
              ) : codigo ? (
                <>
                  <span className="pc-selo">
                    {resposta?.tipo === "ok" ? "Cupom enviado" : "Você já tem cupom"}
                  </span>
                  <p className="pc-titulo" id={titulo}>
                    Tá no seu e-mail{comNome}
                  </p>
                  <p className="pc-texto">
                    Mandamos pra <b>{email}</b>. Se não achar, olha na aba Promoções. E o desconto
                    já fica guardado na sua sacola: entra sozinho no pagamento.
                  </p>
                  <div className="pc-codigo">
                    <code data-codigo>{codigo}</code>
                    <button type="button" className="pc-copiar" onClick={() => void copiar(codigo)}>
                      {copiado ? "Copiado" : "Copiar"}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="pc-titulo" id={titulo}>
                    Esse e-mail já ganhou{comNome}
                  </p>
                  <p className="pc-texto">
                    O cupom de primeira compra é um por e-mail, e o seu já foi. Fica de olho nas
                    ofertas no e-mail.
                  </p>
                </>
              )}
              <button type="button" className="pc-botao" onClick={fechar} data-continuar>
                Continuar comprando
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
