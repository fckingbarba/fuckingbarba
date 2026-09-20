"use client"

import { useActionState, useRef, useState, useTransition } from "react"
import { consultarCep, salvarEntrega } from "@/lib/acoes/checkout"
import { mascararCep } from "@/lib/cep-formato"
import { ESTADO_INICIAL, type CheckoutVisivel } from "@/lib/checkout-visivel"
import { Campo, Selecao } from "./campo"
import { Casca, Recado, useFechaQuandoSalva, type PropsDaEtapa } from "./etapas"

/**
 * ETAPA 2 — o endereço.
 *
 * O CEP PREENCHE O RESTO, E NÃO MANDA EM NADA. Assim que os oito dígitos
 * entram, a loja consulta e preenche rua, bairro, cidade e estado. Se não
 * achar — CEP novo, zona rural, serviço fora do ar — não acontece nada de
 * ruim: os campos continuam lá, vazios e editáveis, exatamente como estariam
 * se o atalho não existisse. Nenhum campo fica travado depois de preenchido,
 * porque endereço de CEP acerta a rua e erra o resto com frequência.
 *
 * O FOCO PULA PRO NÚMERO depois que o CEP preenche. É o único campo que a
 * consulta nunca sabe, e é onde a pessoa ia clicar em seguida de qualquer
 * jeito.
 */

const UFS = [
  "AC",
  "AL",
  "AM",
  "AP",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MG",
  "MS",
  "MT",
  "PA",
  "PB",
  "PE",
  "PI",
  "PR",
  "RJ",
  "RN",
  "RO",
  "RR",
  "RS",
  "SC",
  "SE",
  "SP",
  "TO",
] as const

export function Entrega({
  checkout,
  aoSalvar,
  ...casca
}: PropsDaEtapa & { checkout: CheckoutVisivel }) {
  const [estado, acao, enviando] = useActionState(salvarEntrega, ESTADO_INICIAL)
  useFechaQuandoSalva(estado, aoSalvar)

  const inicial = checkout.entrega
  const [cep, setCep] = useState(mascararCep(inicial.cep))
  const [rua, setRua] = useState(inicial.rua)
  const [bairro, setBairro] = useState(inicial.bairro)
  const [cidade, setCidade] = useState(inicial.cidade)
  const [uf, setUf] = useState(inicial.uf)

  const [buscando, buscar] = useTransition()
  const [naoAchou, setNaoAchou] = useState(false)
  const numeroRef = useRef<HTMLInputElement>(null)
  const ultimoBuscado = useRef("")

  function aoMudarCep(valor: string) {
    const mascarado = mascararCep(valor)
    setCep(mascarado)

    const limpo = mascarado.replace(/\D+/g, "")
    if (limpo.length !== 8 || limpo === ultimoBuscado.current) return

    ultimoBuscado.current = limpo
    setNaoAchou(false)
    buscar(async () => {
      const achado = await consultarCep(limpo)
      if (!achado.encontrado) {
        setNaoAchou(true)
        return
      }
      // Só preenche o que veio: CEP de rua única devolve logradouro, CEP de
      // cidade inteira não — e apagar o que a pessoa já tinha digitado por
      // causa de um campo vazio na resposta seria trabalho perdido dela.
      if (achado.rua) setRua(achado.rua)
      if (achado.bairro) setBairro(achado.bairro)
      if (achado.cidade) setCidade(achado.cidade)
      if (achado.uf) setUf(achado.uf)
      numeroRef.current?.focus()
    })
  }

  const e = estado.erros
  // Idem: depois do reset do React, o que estava na tela volta daqui.
  const v = (campo: string, gravado: string) => estado.valores?.[campo] ?? gravado

  return (
    <Casca
      {...casca}
      aoSalvar={aoSalvar}
      resumo={
        inicial.cep ? (
          <>
            {inicial.rua}, {inicial.numero}
            {inicial.complemento ? ` — ${inicial.complemento}` : ""} · {inicial.bairro} ·{" "}
            {inicial.cidade}/{inicial.uf} · {mascararCep(inicial.cep)}
          </>
        ) : null
      }
    >
      <form action={acao} className="etapa__form" noValidate>
        <div className="campo-par campo-par--cep">
          <Campo
            rotulo="CEP"
            nome="cep"
            inputMode="numeric"
            autoComplete="postal-code"
            placeholder="00000-000"
            value={cep}
            onChange={(ev) => aoMudarCep(ev.target.value)}
            erro={e.cep}
            required
          />
          <p className="entrega__estado" aria-live="polite">
            {buscando ? "Procurando o endereço…" : null}
            {!buscando && naoAchou
              ? "Não achei esse CEP. Preenche à mão que funciona igual."
              : null}
          </p>
        </div>

        <Campo
          rotulo="Rua"
          nome="rua"
          autoComplete="address-line1"
          value={rua}
          onChange={(ev) => setRua(ev.target.value)}
          erro={e.rua}
          required
        />

        <div className="campo-par">
          <Campo
            rotulo="Número"
            nome="numero"
            ref={numeroRef}
            inputMode="text"
            defaultValue={v("numero", inicial.numero)}
            erro={e.numero}
            dica="Não tem número? Escreve S/N."
            required
          />
          <Campo
            rotulo="Complemento"
            nome="complemento"
            autoComplete="address-line2"
            defaultValue={v("complemento", inicial.complemento)}
            erro={e.complemento}
            dica="Apartamento, bloco, fundos. Opcional."
          />
        </div>

        <Campo
          rotulo="Bairro"
          nome="bairro"
          value={bairro}
          onChange={(ev) => setBairro(ev.target.value)}
          erro={e.bairro}
          required
        />

        <div className="campo-par campo-par--cidade">
          <Campo
            rotulo="Cidade"
            nome="cidade"
            autoComplete="address-level2"
            value={cidade}
            onChange={(ev) => setCidade(ev.target.value)}
            erro={e.cidade}
            required
          />
          <Selecao
            rotulo="Estado"
            nome="uf"
            opcoes={UFS}
            value={uf}
            onChange={(ev) => setUf(ev.target.value)}
            erro={e.uf}
            required
          />
        </div>

        <Recado estado={estado} />

        <button type="submit" className="btn btn--bloco" disabled={enviando}>
          {enviando ? "Salvando…" : "Ver as opções de entrega"}
        </button>
      </form>
    </Casca>
  )
}
