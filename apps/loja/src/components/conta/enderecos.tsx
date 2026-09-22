"use client"

import {
  Fragment,
  useActionState,
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from "react"
import { Campo } from "@/components/checkout/campo"
import { Giro, Recado, useFechaQuandoSalva } from "@/components/checkout/resposta"
import { Aviso, useAviso } from "@/components/conta/pecas"
import { Mais, Raio } from "@/components/icones"
import {
  consultarCepDaConta,
  excluirEndereco,
  salvarEndereco,
  tornarPrincipal,
} from "@/lib/acoes/enderecos"
import { mascararCep } from "@/lib/cep-formato"
import {
  ENDERECO_INICIAL,
  LIMITE_DE_ENDERECOS,
  linhasDoEndereco,
  type EnderecoDaConta,
  type EstadoDoEndereco,
} from "@/lib/conta-visivel"
import { UFS } from "@/lib/endereco"

/**
 * OS ENDEREÇOS DA CONTA — o desenho é o de `ferramentas/porte/prototipo-conta.html`
 * (`desenharEnderecos` e o formulário de lá), com o Medusa atrás.
 *
 * O FORMULÁRIO ENTRA NA GRADE, no lugar do que ele edita: no do cartão, pra
 * editar; no do "Adicionar", pra um novo. Lá embaixo, depois de tudo, a
 * pessoa clicava em "Editar" e o formulário abria longe do endereço.
 *
 * EXCLUIR PERGUNTA ANTES, na própria caixa — sem janela do navegador por
 * cima. E o foco anda com a pessoa: depois de salvar, volta pro "Editar" do
 * cartão salvo; depois de excluir, pro "Adicionar"; no "Não", pro "Excluir".
 * Quem usa teclado ou leitor de tela não recomeça do topo da página.
 */
export function Enderecos({
  enderecos,
  quem,
}: {
  enderecos: EnderecoDaConta[]
  /** Nome e sobrenome do dono da conta — é quem recebe (ver `lugarParaMedusa`). */
  quem: string
}) {
  const [aberto, setAberto] = useState<string | null>(null)
  const [confirmando, setConfirmando] = useState<string | null>(null)
  const [mexendo, mexer] = useTransition()
  const { aviso, avisar } = useAviso()

  /*
    O FOCO DEPOIS DO PRÓXIMO DESENHO. Quem salva ou exclui muda a lista (o
    `refresh()` da ação traz a nova), e o botão que deve receber o foco só
    existe depois disso. O pedido fica num `ref` — mover foco é mexer no
    DOM, não em dado da tela —, e o efeito sem dependências confere a cada
    desenho se o alvo já chegou.
  */
  const focar = useRef<string | null>(null)
  useEffect(() => {
    const seletor = focar.current
    if (!seletor) return
    // Botão travado não recebe foco: enquanto a ação corre, os do cartão
    // esperam — e o pedido espera junto, pro desenho seguinte.
    const alvo = document.querySelector<HTMLButtonElement>(seletor)
    if (alvo && !alvo.disabled) {
      focar.current = null
      alvo.focus()
    }
  })

  const doEditar = (id: string) => `[data-editar-endereco="${id}"]`
  const NOVO = "[data-novo-endereco]"

  function abrir(qual: string) {
    setConfirmando(null)
    setAberto(qual)
  }

  function cancelar() {
    const era = aberto
    setAberto(null)
    focar.current = era && era !== "novo" ? doEditar(era) : NOVO
  }

  const aoSalvar = useCallback(
    (estado: EstadoDoEndereco) => {
      const eraNovo = aberto === "novo"
      setAberto(null)
      avisar(eraNovo ? "Endereço salvo." : "Endereço atualizado.")
      focar.current = estado.id ? doEditar(estado.id) : NOVO
    },
    [aberto, avisar]
  )

  function principal(id: string) {
    mexer(async () => {
      const r = await tornarPrincipal(id)
      avisar(r.ok ? "Endereço principal trocado." : r.mensagem)
      focar.current = doEditar(id)
    })
  }

  function excluir(id: string) {
    mexer(async () => {
      const r = await excluirEndereco(id)
      setConfirmando(null)
      avisar(r.ok ? "Endereço excluído." : r.mensagem)
      focar.current = NOVO
    })
  }

  const cheio = enderecos.length >= LIMITE_DE_ENDERECOS

  return (
    <>
      <div className="enderecos" data-lista-enderecos aria-busy={mexendo || undefined}>
        {enderecos.map((e) =>
          aberto === e.id ? (
            <FormularioDeEndereco
              key={`editar-${e.id}`}
              endereco={e}
              // "Usar como principal" só quando há outro pra disputar o posto
              // — e nunca no próprio principal: ele deixa de ser quando outro vira.
              podePrincipal={!e.principal && enderecos.length > 1}
              aoCancelar={cancelar}
              aoSalvar={aoSalvar}
            />
          ) : (
            <article
              key={e.id}
              className="bloco endereco"
              data-principal={e.principal ? "" : undefined}
              data-endereco={e.id}
            >
              <div className="endereco__topo">
                <h2 className="endereco__apelido">{e.apelido || "Endereço"}</h2>
                {e.principal ? <span className="selo selo--principal">Principal</span> : null}
              </div>
              <address className="info">
                {quem ? (
                  <>
                    {quem}
                    <br />
                  </>
                ) : null}
                {linhasDoEndereco(e).map((linha, i) => (
                  <Fragment key={i}>
                    {i ? <br /> : null}
                    {linha}
                  </Fragment>
                ))}
              </address>
              <div className="endereco__acoes">
                {confirmando === e.id ? (
                  <>
                    <span className="endereco__confirma">Excluir este endereço?</span>
                    <button
                      type="button"
                      className="link"
                      data-excluir-sim={e.id}
                      disabled={mexendo}
                      onClick={() => excluir(e.id)}
                    >
                      Sim, excluir
                    </button>
                    <button
                      type="button"
                      className="link"
                      data-excluir-nao={e.id}
                      disabled={mexendo}
                      onClick={() => {
                        setConfirmando(null)
                        focar.current = `[data-excluir-endereco="${e.id}"]`
                      }}
                    >
                      Não
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className="link"
                      data-editar-endereco={e.id}
                      disabled={mexendo}
                      onClick={() => abrir(e.id)}
                    >
                      Editar
                    </button>
                    {e.principal ? null : (
                      <button
                        type="button"
                        className="link"
                        data-principal-endereco={e.id}
                        disabled={mexendo}
                        onClick={() => principal(e.id)}
                      >
                        Tornar principal
                      </button>
                    )}
                    <button
                      type="button"
                      className="link"
                      data-excluir-endereco={e.id}
                      disabled={mexendo}
                      onClick={() => {
                        setConfirmando(e.id)
                        focar.current = `[data-excluir-nao="${e.id}"]`
                      }}
                    >
                      Excluir
                    </button>
                  </>
                )}
              </div>
            </article>
          )
        )}

        {aberto === "novo" ? (
          <FormularioDeEndereco
            key="novo"
            endereco={null}
            podePrincipal={enderecos.length > 0}
            aoCancelar={cancelar}
            aoSalvar={aoSalvar}
          />
        ) : (
          <button
            type="button"
            className="endereco--novo"
            data-novo-endereco
            disabled={cheio || mexendo}
            onClick={() => abrir("novo")}
          >
            <Mais aria-hidden="true" /> Adicionar endereço
          </button>
        )}
      </div>

      {cheio ? (
        <p className="ajuda">
          Sua conta já tem {LIMITE_DE_ENDERECOS} endereços. Exclui um pra guardar outro.
        </p>
      ) : null}

      <Aviso aviso={aviso} />
    </>
  )
}

/* ── o formulário: o passo 2 do checkout, fora do checkout ────────────────── */

/**
 * CEP primeiro; o resto aparece quando a busca volta (ou quando ela não acha,
 * pra preencher à mão), e o cursor cai no número — o único campo que a
 * busca nunca sabe. Pra editar, abre tudo. É o `entrega.tsx` do checkout,
 * sem o frete — e sem gravar o CEP em carrinho nenhum
 * (`consultarCepDaConta`).
 */
function FormularioDeEndereco({
  endereco,
  podePrincipal,
  aoCancelar,
  aoSalvar,
}: {
  endereco: EnderecoDaConta | null
  podePrincipal: boolean
  aoCancelar: () => void
  aoSalvar: (estado: EstadoDoEndereco) => void
}) {
  const [estado, acao, enviando] = useActionState(salvarEndereco, ENDERECO_INICIAL)
  useFechaQuandoSalva(estado, aoSalvar)

  const [cep, setCep] = useState(endereco ? mascararCep(endereco.cep) : "")
  const [rua, setRua] = useState(endereco?.rua ?? "")
  const [bairro, setBairro] = useState(endereco?.bairro ?? "")
  const [cidade, setCidade] = useState(endereco?.cidade ?? "")
  const [uf, setUf] = useState(endereco?.uf ?? "")
  const [abriu, setAbriu] = useState(Boolean(endereco))
  const [naoAchou, setNaoAchou] = useState(false)
  /** O erro do CEP que a tela sabe sozinha (enviar antes da busca voltar). */
  const [erroCep, setErroCep] = useState("")
  const [buscando, buscar] = useTransition()
  /** Quantas buscas voltaram — é o que manda o cursor andar, até com os campos já abertos. */
  const [voltas, setVoltas] = useState(0)

  const formRef = useRef<HTMLFormElement>(null)
  const cepRef = useRef<HTMLInputElement>(null)
  const numeroRef = useRef<HTMLInputElement>(null)
  const ruaRef = useRef<HTMLInputElement>(null)
  const ufRef = useRef<HTMLSelectElement>(null)
  const ultimoBuscado = useRef(endereco?.cep ?? "")
  /** Pra onde o cursor vai quando os campos aparecerem: o número, ou a rua. */
  const querFoco = useRef<"numero" | "rua" | null>(null)

  // Abriu: o formulário vem pra vista, e o cursor pro CEP.
  useEffect(() => {
    formRef.current?.scrollIntoView({ block: "nearest" })
    cepRef.current?.focus({ preventScroll: true })
  }, [])

  // O foco vai num efeito, e não na resposta da busca: ali os campos ainda
  // estão com `hidden`, e focar elemento escondido não faz nada.
  useEffect(() => {
    if (!abriu || !querFoco.current) return
    const qual = querFoco.current
    querFoco.current = null
    ;(qual === "numero" ? numeroRef : ruaRef).current?.focus()
  }, [abriu, voltas])

  /*
    O RESET DO FORMULÁRIO NÃO POUPA O SELECT. Depois de cada resposta da
    ação, o React dá `reset()` no `<form action>` (ver `valores`), e o
    `<select>` controlado volta pra primeira opção NA TELA — o estado segue
    "SP", e o React só reescreve o DOM quando o valor muda. O envio seguinte
    mandava o estado vazio, e a pessoa lia "Escolhe o estado." num campo que
    ela via preenchido um segundo antes. O efeito roda depois do reset e
    devolve o valor (o passo 2 do checkout tem o mesmo).
  */
  useEffect(() => {
    if (ufRef.current && ufRef.current.value !== uf) ufRef.current.value = uf
  }, [estado, uf])

  function procurar(limpo: string) {
    ultimoBuscado.current = limpo
    setNaoAchou(false)
    buscar(async () => {
      const achado = await consultarCepDaConta(limpo)
      setAbriu(true)
      setVoltas((n) => n + 1)
      if (!achado.encontrado) {
        setNaoAchou(true)
        querFoco.current = "rua"
        return
      }
      if (achado.rua) setRua(achado.rua)
      if (achado.bairro) setBairro(achado.bairro)
      if (achado.cidade) setCidade(achado.cidade)
      if (achado.uf) setUf(achado.uf)
      querFoco.current = "numero"
    })
  }

  function aoMudarCep(valor: string) {
    const mascarado = mascararCep(valor)
    setCep(mascarado)
    setErroCep("")
    const limpo = mascarado.replace(/\D+/g, "")
    if (limpo.length === 8 && limpo !== ultimoBuscado.current) procurar(limpo)
  }

  /*
    Enviar com os campos ainda escondidos mandaria rua e número vazios, e os
    erros cairiam em campos que ninguém vê. Então: CEP incompleto diz isso
    no CEP; CEP completo e a busca ainda não feita, busca — e é ela que abre
    o resto.
  */
  function aoEnviar(ev: FormEvent<HTMLFormElement>) {
    if (enviando) {
      ev.preventDefault()
      return
    }
    if (abriu) return
    ev.preventDefault()
    const limpo = cep.replace(/\D+/g, "")
    if (limpo.length !== 8) {
      setErroCep("CEP tem 8 dígitos.")
      cepRef.current?.focus()
    } else if (!buscando) {
      procurar(limpo)
    }
  }

  const e = estado.erros
  // O que voltou da ação vem antes do que está gravado: é o que a pessoa
  // acabou de digitar, e o React já deu reset no formulário.
  const v = (campo: string, gravado: string) => estado.valores?.[campo] ?? gravado
  const marcadoAntes = estado.valores ? estado.valores.principal === "on" : false

  return (
    <form
      ref={formRef}
      className="bloco"
      action={acao}
      onSubmit={aoEnviar}
      noValidate
      data-form-endereco={endereco?.id ?? "novo"}
    >
      <h2 className="bloco__titulo endereco__titulo-form">
        {endereco ? "Editar endereço" : "Novo endereço"}
      </h2>
      {endereco ? <input type="hidden" name="id" value={endereco.id} /> : null}

      <div className="campos">
        <Campo
          rotulo="CEP"
          nome="cep"
          largura="campo--cep"
          ref={cepRef}
          inputMode="numeric"
          autoComplete="postal-code"
          placeholder="00000-000"
          maxLength={9}
          value={cep}
          onChange={(ev) => aoMudarCep(ev.target.value)}
          erro={erroCep || e.cep}
          required
          enfeite={<span className="campo__spinner" aria-hidden="true" />}
          ocupado={buscando}
          depois={
            <p className="cep-ajuda">
              <a
                href="https://buscacepinter.correios.com.br/app/endereco/index.php"
                target="_blank"
                rel="noopener noreferrer"
              >
                Não sei meu CEP
              </a>
            </p>
          }
        />
      </div>

      <p className="aviso-frete endereco__busca" aria-live="polite" hidden={!buscando && !naoAchou}>
        {buscando ? "Procurando o endereço…" : null}
        {!buscando && naoAchou ? "Não achei esse CEP. Preenche à mão que funciona igual." : null}
      </p>

      <div className="campos endereco__resto" hidden={!abriu}>
        <Campo
          rotulo="Endereço"
          nome="rua"
          largura="campo--4"
          ref={ruaRef}
          autoComplete="address-line1"
          placeholder="Rua, avenida…"
          maxLength={120}
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
          maxLength={20}
          defaultValue={v("numero", endereco?.numero ?? "")}
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
          maxLength={80}
          defaultValue={v("complemento", endereco?.complemento ?? "")}
        />
        <Campo
          rotulo="Bairro"
          nome="bairro"
          largura="campo--3"
          autoComplete="address-level3"
          maxLength={80}
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
          maxLength={80}
          value={cidade}
          onChange={(ev) => setCidade(ev.target.value)}
          erro={e.cidade}
          required
        />
        <div className="campo campo--uf">
          <label htmlFor={`uf-${endereco?.id ?? "novo"}`}>UF</label>
          <select
            ref={ufRef}
            id={`uf-${endereco?.id ?? "novo"}`}
            name="uf"
            autoComplete="address-level1"
            value={uf}
            onChange={(ev) => setUf(ev.target.value)}
            aria-invalid={e.uf ? true : undefined}
            aria-describedby={`erro-uf-${endereco?.id ?? "novo"}`}
            required
          >
            <option value="">—</option>
            {UFS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <span className="campo__erro" id={`erro-uf-${endereco?.id ?? "novo"}`} aria-live="polite">
            {e.uf ?? ""}
          </span>
        </div>
        <Campo
          rotulo="Nome do endereço"
          nota="(opcional)"
          nome="apelido"
          largura="campo--3"
          placeholder="Casa, trabalho…"
          maxLength={40}
          defaultValue={v("apelido", endereco?.apelido ?? "")}
        />
      </div>

      {podePrincipal ? (
        <label className="marcar endereco__marca" hidden={!abriu}>
          <input type="checkbox" name="principal" defaultChecked={marcadoAntes} />{" "}
          <span>Usar como principal</span>
        </label>
      ) : null}

      <Recado estado={estado} />

      <div className="form-acoes">
        <button type="button" className="btn btn--fantasma" onClick={aoCancelar}>
          Cancelar
        </button>
        <button type="submit" className="btn" disabled={enviando} aria-busy={enviando || undefined}>
          {enviando ? <Giro /> : null}
          {enviando ? "Salvando…" : "Salvar endereço"}
          {enviando ? null : <Raio className="btn__bolt" />}
        </button>
      </div>
    </form>
  )
}
