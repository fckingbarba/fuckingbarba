"use client"

import { useActionState, useCallback, useState } from "react"
import { Campo } from "@/components/checkout/campo"
import { Giro, Recado, useFechaQuandoSalva } from "@/components/checkout/resposta"
import { Aviso, useAviso } from "@/components/conta/pecas"
import { Raio } from "@/components/icones"
import { salvarDados } from "@/lib/acoes/dados"
import { ESTADO_INICIAL } from "@/lib/checkout-visivel"
import type { ClienteVisivel } from "@/lib/conta-visivel"
import { formatarDocumento, mascararDocumento } from "@/lib/documento"
import { mascararTelefone } from "@/lib/telefone"

/**
 * MEUS DADOS — os campos do passo 1 do checkout, com as mesmas máscaras, e o
 * que a pessoa quer receber. O desenho é o do protótipo da conta.
 *
 * O e-mail aparece, mas não se edita no campo: trocar é mandar código pro
 * novo (senão a pessoa perde a conta num erro de digitação) — é o próximo
 * passo da conta, e até lá ele fica só pra ler.
 *
 * AS PREFERÊNCIAS NASCEM DESMARCADAS: é consentimento (LGPD), e
 * consentimento não vem marcado. A ação guarda a data do "sim".
 */
export function FormularioDeDados({ cliente }: { cliente: ClienteVisivel }) {
  const [estado, acao, enviando] = useActionState(salvarDados, ESTADO_INICIAL)
  const { aviso, avisar } = useAviso()
  useFechaQuandoSalva(
    estado,
    useCallback(() => avisar("Dados salvos."), [avisar])
  )

  // Celular e documento são controlados por causa da máscara (como no
  // checkout); o resto vive no próprio DOM. O celular gravado vem +5511…,
  // e a máscara tira o país.
  const [telefone, setTelefone] = useState(mascararTelefone(cliente.telefone))
  const [documento, setDocumento] = useState(
    cliente.documento ? formatarDocumento(cliente.documento) : ""
  )

  const e = estado.erros
  const v = (campo: string, gravado: string) => estado.valores?.[campo] ?? gravado
  // Caixinha: com resposta de erro, o que a pessoa tinha marcado; sem, o gravado.
  const marcada = (campo: string, gravada: boolean) =>
    estado.valores ? estado.valores[campo] === "on" : gravada

  return (
    <>
      <form
        className="bloco"
        action={acao}
        onSubmit={(ev) => enviando && ev.preventDefault()}
        noValidate
        data-form-dados
      >
        <div className="campos">
          <Campo
            rotulo="Nome"
            nome="nome"
            largura="campo--3"
            autoComplete="given-name"
            placeholder="Primeiro nome"
            maxLength={60}
            defaultValue={v("nome", cliente.nome)}
            erro={e.nome}
            required
          />
          <Campo
            rotulo="Sobrenome"
            nome="sobrenome"
            largura="campo--3"
            autoComplete="family-name"
            maxLength={80}
            defaultValue={v("sobrenome", cliente.sobrenome)}
            erro={e.sobrenome}
            required
          />
          {/* Sem campo: é texto. O rótulo tem a cara do `label` dos outros
              (`.campo__rotulo`, em conta.css), e é lido junto, na ordem. */}
          <div className="campo">
            <span className="campo__rotulo">E-mail</span>
            <div className="email-fixo" data-email-fixo>
              <span>{cliente.email}</span>
            </div>
          </div>
          {/* Sem `maxLength`, como no checkout: o navegador cortaria o que é
              colado antes de a máscara ver o +55. */}
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

        <fieldset className="preferencias">
          <legend>O que você quer receber</legend>
          <label className="marcar">
            <input
              type="checkbox"
              name="ofertas-email"
              defaultChecked={marcada("ofertas-email", Boolean(cliente.ofertas.email))}
            />{" "}
            <span>Novidades e ofertas por e-mail</span>
          </label>
          <label className="marcar">
            <input
              type="checkbox"
              name="ofertas-whatsapp"
              defaultChecked={marcada("ofertas-whatsapp", Boolean(cliente.ofertas.whatsapp))}
            />{" "}
            <span>Ofertas pelo WhatsApp</span>
          </label>
        </fieldset>

        <Recado estado={estado} />

        <div className="form-acoes">
          <span />
          <button
            type="submit"
            className="btn"
            disabled={enviando}
            aria-busy={enviando || undefined}
          >
            {enviando ? <Giro /> : null}
            {enviando ? "Salvando…" : "Salvar"}
            {enviando ? null : <Raio className="btn__bolt" />}
          </button>
        </div>
      </form>

      <Aviso aviso={aviso} />
    </>
  )
}
