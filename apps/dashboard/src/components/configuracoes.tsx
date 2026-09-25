"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState, useTransition, type FormEvent, type ReactNode } from "react"
import { useAvisar } from "@/components/avisos"
import { Campo } from "@/components/campo"
import {
  mudarJanela,
  salvarEmergencia,
  salvarEmpresa,
  salvarFrete,
  salvarIntegracoes,
  type ResultadoDoFormulario,
} from "@/lib/acoes/configuracoes"
import {
  ABAS,
  type CampoDaIntegracao,
  type FormularioDaEmergencia as DadosDaEmergencia,
  type FormularioDaEmpresa as DadosDaEmpresa,
  type FormularioDasIntegracoes as DadosDasIntegracoes,
  type FormularioDoFrete as DadosDoFrete,
} from "@/lib/configuracoes"

/**
 * AS CONFIGURAÇÕES NA TELA — as abas e os formulários do protótipo. Cada
 * formulário manda o que está na tela; quem confere campo a campo é o
 * Medusa, e o erro volta embaixo do campo. Salvo, o aviso de baixo diz, e a
 * aba se refaz com o que ficou gravado.
 */

export function AbasDasConfiguracoes() {
  const caminho = usePathname()
  return (
    <nav className="abas" aria-label="Configurações">
      {ABAS.map((a) => (
        <Link
          key={a.href}
          href={a.href}
          aria-current={caminho.startsWith(a.href) ? "page" : undefined}
        >
          {a.nome}
        </Link>
      ))}
    </nav>
  )
}

/** O formulário comum: manda, marca os erros, avisa. */
function useFormulario<T extends object>(
  inicial: T,
  enviar: (f: T) => Promise<ResultadoDoFormulario>
) {
  const avisar = useAvisar()
  const [f, setF] = useState<T>(inicial)
  const [erros, setErros] = useState<Record<string, string>>({})
  const [salvando, comecar] = useTransition()
  const mudar = <K extends keyof T>(campo: K, valor: T[K]) =>
    setF((a) => ({ ...a, [campo]: valor }))
  function salvar(ev: FormEvent) {
    ev.preventDefault()
    if (salvando) return
    comecar(async () => {
      const r = await enviar(f)
      setErros(r.erros ?? {})
      avisar(r)
    })
  }
  return { f, mudar, erros, salvando, salvar }
}

function Acoes({ salvando, nota }: { salvando: boolean; nota: string }) {
  return (
    <div className="form-acoes">
      <span className="pequeno suave">{nota}</span>
      <button
        type="submit"
        className="btn btn--menor"
        disabled={salvando}
        aria-busy={salvando || undefined}
      >
        {salvando ? "Salvando…" : "Salvar"}
      </button>
    </div>
  )
}

export function FormularioDaEmpresa({ inicial }: { inicial: DadosDaEmpresa }) {
  const { f, mudar, erros, salvando, salvar } = useFormulario(inicial, salvarEmpresa)
  const campo = (
    c: keyof DadosDaEmpresa,
    rotulo: string,
    extra: Partial<Parameters<typeof Campo>[0]> = {}
  ) => (
    <Campo
      rotulo={rotulo}
      nome={c}
      data-campo={c}
      value={f[c]}
      erro={erros[c]}
      onChange={(e) => mudar(c, e.target.value)}
      largura="campo--3"
      {...extra}
    />
  )
  return (
    <form className="bloco" onSubmit={salvar} noValidate data-form="empresa">
      <div className="campos">
        {campo("razaoSocial", "Razão social", { placeholder: "Como está no CNPJ" })}
        {campo("cnpj", "CNPJ", { inputMode: "numeric", placeholder: "00.000.000/0000-00" })}
        {campo("endereco", "Endereço", {
          nota: "— aparece no rodapé e nas páginas legais",
          placeholder: "Rua, número — cidade/UF",
          largura: "",
        })}
        {campo("whatsapp", "WhatsApp de atendimento", {
          inputMode: "tel",
          placeholder: "(00) 00000-0000",
        })}
        {campo("email", "E-mail de atendimento", {
          inputMode: "email",
          placeholder: "contato@fuckingbarba.com.br",
        })}
        <div className="campo campo--3">
          <label htmlFor="cfg-horario">
            Horário <small>— uma linha por frase</small>
          </label>
          <textarea
            id="cfg-horario"
            data-campo="horario"
            rows={3}
            value={f.horario}
            placeholder={"Seg a sex, 9h às 18h"}
            aria-invalid={erros.horario ? true : undefined}
            aria-describedby={erros.horario ? "cfg-horario-erro" : undefined}
            onChange={(e) => mudar("horario", e.target.value)}
          />
          <p
            className="campo__erro"
            id="cfg-horario-erro"
            role={erros.horario ? "alert" : undefined}
          >
            {erros.horario ?? ""}
          </p>
        </div>
        {campo("prazoDePostagem", "Prazo de postagem", { placeholder: "Ex.: até 1 dia útil" })}
      </div>
      <Acoes salvando={salvando} nota="A loja atualiza em alguns segundos." />
    </form>
  )
}

function Segmento<T extends string>({
  nome,
  valor,
  opcoes,
  mudar,
}: {
  nome: string
  valor: T
  opcoes: readonly (readonly [T, string])[]
  mudar: (v: T) => void
}) {
  return (
    <div className="segmento">
      {opcoes.map(([v, rotulo]) => (
        <label key={v}>
          <input
            type="radio"
            name={nome}
            value={v}
            data-opcao={`${nome}:${v}`}
            checked={valor === v}
            onChange={() => mudar(v)}
          />
          <span>{rotulo}</span>
        </label>
      ))}
    </div>
  )
}

function Bloco({ titulo, sub, children }: { titulo: string; sub: string; children: ReactNode }) {
  return (
    <>
      <div className="bloco__cabeca">
        <div>
          <h2 className="bloco__titulo">{titulo}</h2>
          <p className="bloco__sub">{sub}</p>
        </div>
      </div>
      {children}
    </>
  )
}

export function FormularioDoFrete({ inicial, frase }: { inicial: DadosDoFrete; frase: string }) {
  const { f, mudar, erros, salvando, salvar } = useFormulario(inicial, salvarFrete)
  return (
    <form className="bloco" onSubmit={salvar} noValidate data-form="frete">
      <Bloco
        titulo="Promoção de frete"
        sub="Quem cobra e quem anuncia leem daqui: a sacola, o checkout e a página do produto."
      >
        <p className="previa" data-frase-do-frete>
          Hoje: {frase}
        </p>
        <div className="campos" style={{ marginTop: 14 }}>
          <fieldset className="campo">
            <legend className="campo__rot">Promoção</legend>
            <Segmento
              nome="modo"
              valor={f.modo}
              mudar={(v) => mudar("modo", v)}
              opcoes={[
                ["nenhuma", "Nenhuma"],
                ["gratis", "Frete grátis"],
                ["fixo", "Preço fixo"],
              ]}
            />
            <p className="campo__erro" role={erros.modo ? "alert" : undefined}>
              {erros.modo ?? ""}
            </p>
          </fieldset>
          {f.modo !== "nenhuma" ? (
            <>
              <Campo
                rotulo="A partir de"
                nota="— em produtos"
                nome="piso"
                data-campo="piso"
                inputMode="decimal"
                value={f.piso}
                erro={erros.piso}
                onChange={(e) => mudar("piso", e.target.value)}
                largura="campo--3"
              />
              {f.modo === "fixo" ? (
                <Campo
                  rotulo="Preço do frete"
                  nome="preco"
                  data-campo="preco"
                  inputMode="decimal"
                  value={f.preco}
                  erro={erros.preco}
                  onChange={(e) => mudar("preco", e.target.value)}
                  largura="campo--3"
                />
              ) : null}
              <fieldset className="campo campo--3">
                <legend className="campo__rot">Vale em</legend>
                <Segmento
                  nome="alvo"
                  valor={f.alvo}
                  mudar={(v) => mudar("alvo", v)}
                  opcoes={[
                    ["mais-barata", "A mais barata"],
                    ["todas", "Todas"],
                  ]}
                />
                <p className="campo__ajuda">
                  {f.alvo === "todas"
                    ? "Qualquer opção da cotação, inclusive a expressa."
                    : "A opção mais barata daquele CEP, seja qual for a transportadora."}
                </p>
              </fieldset>
            </>
          ) : null}
        </div>
        <Acoes salvando={salvando} nota="Vale na próxima cotação." />
      </Bloco>
    </form>
  )
}

export function FormularioDaEmergencia({ inicial }: { inicial: DadosDaEmergencia }) {
  const { f, mudar, erros, salvando, salvar } = useFormulario(inicial, salvarEmergencia)
  return (
    <form className="bloco" onSubmit={salvar} noValidate data-form="emergencia">
      <Bloco titulo="Se a Frenet cair" sub="O que a loja faz quando a cotação não responde.">
        <div className="campos">
          <Campo
            rotulo="Preço de emergência"
            nome="preco"
            data-campo="emergencia-preco"
            inputMode="decimal"
            placeholder="Em branco: não vende"
            value={f.preco}
            erro={erros.preco}
            onChange={(e) => mudar("preco", e.target.value)}
            largura="campo--3"
          />
          <Campo
            rotulo="Prazo que a loja promete"
            nome="prazo"
            data-campo="emergencia-prazo"
            placeholder="Ex.: 7 dias úteis"
            value={f.prazo}
            erro={erros.prazo}
            onChange={(e) => mudar("prazo", e.target.value)}
            largura="campo--3"
          />
          <div className="campo">
            <p className="campo__ajuda">
              <b>Em branco, a loja para de vender</b> até a cotação voltar, em vez de cobrar um
              número que ninguém escolheu. Preenchido, continua vendendo por esse preço e esse prazo
              — e o número é seu.
            </p>
          </div>
        </div>
        <Acoes salvando={salvando} nota="Vale na próxima cotação." />
      </Bloco>
    </form>
  )
}

export function JanelaDaNota({
  inicial,
  janelas,
}: {
  inicial: number
  janelas: { minutos: number; nome: string }[]
}) {
  const avisar = useAvisar()
  const [janela, setJanela] = useState(inicial)
  const [mudando, comecar] = useTransition()
  function escolher(minutos: number) {
    const antes = janela
    setJanela(minutos)
    comecar(async () => {
      const r = await mudarJanela(minutos)
      if (!r.ok) setJanela(antes)
      avisar(r)
    })
  }
  return (
    <div className="campo" aria-busy={mudando || undefined}>
      <span className="campo__rot">Quando a nota sai</span>
      <div className="segmento">
        {janelas.map((j) => (
          <label key={j.minutos}>
            <input
              type="radio"
              name="janela"
              value={j.minutos}
              data-janela={j.minutos}
              checked={janela === j.minutos}
              onChange={() => escolher(j.minutos)}
            />
            <span>{j.nome}</span>
          </label>
        ))}
      </div>
      <p className="campo__ajuda">
        A janela deixa cancelar sem nota. Cancelado dentro dela, o pedido de venda é cancelado no
        Bling sozinho. Depois, a nota se cancela no Bling em até 24 h.
      </p>
    </div>
  )
}

/**
 * Os códigos das integrações: cola o código, ou o trecho inteiro que a
 * plataforma deu — quem acha o código dentro é o Medusa. Em branco desliga.
 */
export function FormularioDasIntegracoes({
  inicial,
  campos,
}: {
  inicial: DadosDasIntegracoes
  campos: CampoDaIntegracao[]
}) {
  const { f, mudar, erros, salvando, salvar } = useFormulario(inicial, salvarIntegracoes)
  return (
    <form className="bloco" onSubmit={salvar} noValidate data-form="integracoes">
      <Bloco
        titulo="Os códigos"
        sub="Cole o código, ou o trecho inteiro que a plataforma deu. Em branco, a integração fica desligada."
      >
        <div className="campos">
          {campos.map((c) => (
            <div className="campo campo--3" key={c.chave}>
              <label htmlFor={`cfg-${c.chave}`}>{c.nome}</label>
              <input
                id={`cfg-${c.chave}`}
                name={c.chave}
                data-campo={c.chave}
                value={f[c.chave]}
                placeholder={c.exemplo}
                autoComplete="off"
                spellCheck={false}
                aria-invalid={erros[c.chave] ? true : undefined}
                aria-describedby={`cfg-${c.chave}-ajuda${erros[c.chave] ? ` cfg-${c.chave}-erro` : ""}`}
                onChange={(e) => mudar(c.chave, e.target.value)}
              />
              <p className="campo__ajuda" id={`cfg-${c.chave}-ajuda`}>
                {c.onde}
              </p>
              <p
                className="campo__erro"
                id={`cfg-${c.chave}-erro`}
                role={erros[c.chave] ? "alert" : undefined}
              >
                {erros[c.chave] ?? ""}
              </p>
            </div>
          ))}
        </div>
        <Acoes salvando={salvando} nota="A loja carrega depois do “Aceitar” dos cookies." />
      </Bloco>
    </form>
  )
}
