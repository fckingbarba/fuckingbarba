"use client"

import {
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from "react"
import { useAvisar } from "@/components/avisos"
import { Gaveta } from "@/components/gaveta"
import { Icone } from "@/components/icones"
import { FundoDaSecao, type EstadoDoFundo } from "@/components/produto/fundo-da-secao"
import { salvarSecao } from "@/lib/acoes/produtos"
import {
  itemVazio,
  oQueFalta,
  paraGravar,
  paraOFormulario,
  SECOES,
  VEU,
  type Campo,
  type DetalheDoProduto,
  type Fundo,
  type NoCatalogo,
  type SecaoDaPagina,
  type Valores,
} from "@/lib/produtos"

/**
 * A GAVETA DE UMA SEÇÃO — o texto dela e a imagem de fundo, neste produto,
 * num "Salvar" só.
 *
 * Os campos saem da definição da seção (`SECOES`, em `lib/produtos.ts`):
 * texto, caixa de texto, lista de linhas, grupo de itens (as etapas, as
 * perguntas…), produto do catálogo e caixinha. Nada vai pro site antes do
 * "Salvar"; quem confere se está completo é o Medusa, que devolve o que
 * falta — e aqui o que falta fica marcado, com o nome da tela.
 */

type Caminho = (string | number)[]

const chaveDe = (caminho: Caminho) => caminho.join(".")

function ler(raiz: unknown, caminho: Caminho): unknown {
  return caminho.reduce<unknown>(
    (v, k) => (v && typeof v === "object" ? (v as Record<string, unknown>)[k] : undefined),
    raiz
  )
}

/** Troca um valor lá dentro, sem mexer no objeto de antes (o React compara por referência). */
function gravar<T>(raiz: T, caminho: Caminho, valor: unknown): T {
  if (!caminho.length) return valor as T
  const [k, ...resto] = caminho
  if (Array.isArray(raiz)) {
    const copia = [...raiz]
    copia[k as number] = gravar(copia[k as number], resto, valor)
    return copia as T
  }
  const o = (raiz ?? {}) as Record<string, unknown>
  return { ...o, [k]: gravar(o[k as string], resto, valor) } as T
}

type Contexto = {
  base: string
  faltando: ReadonlySet<string>
  produto: DetalheDoProduto
  catalogo: NoCatalogo[]
  mudar: Dispatch<SetStateAction<Valores>>
  /** O que focar depois do próximo desenho (o item que subiu, o que entrou). */
  focar: (seletor: string) => void
}

export function EditorDeSecao({
  produto,
  secao,
  catalogo,
  fechar,
}: {
  produto: DetalheDoProduto
  secao: SecaoDaPagina
  catalogo: NoCatalogo[]
  fechar: () => void
}) {
  const def = SECOES[secao.id]
  const avisar = useAvisar()
  const base = useId()
  const formulario = useRef<HTMLFormElement>(null)
  const [valores, setValores] = useState<Valores>(() => abrir(def.campos, secao.valores))
  const [fundo, setFundo] = useState<EstadoDoFundo>(() => ({
    computador: secao.fundo ? { url: secao.fundo.imagem } : null,
    celular: secao.fundo?.imagemCelular ? { url: secao.fundo.imagemCelular } : null,
    veu: secao.fundo?.veu ?? VEU.padrao,
  }))
  const [subindo, setSubindo] = useState(false)
  const [faltando, setFaltando] = useState<string[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, comecar] = useTransition()
  const [foco, setFoco] = useState<string | null>(null)

  useEffect(() => {
    if (!foco || !formulario.current) return
    formulario.current.querySelector<HTMLElement>(foco)?.focus()
    setFoco(null)
  }, [foco])

  const comFundo = Boolean(def.fundo && secao.aceitaFundo)
  const temTexto = def.campos.some((c) => c.tipo !== "nota")

  function salvar(ev: FormEvent) {
    ev.preventDefault()
    if (subindo || salvando) return
    comecar(async () => {
      const r = await salvarSecao(
        produto.id,
        secao.id,
        paraGravar(def.campos, valores),
        comFundo ? fundoParaGravar(fundo) : undefined
      )
      if (r.ok) {
        avisar(r)
        fechar()
        return
      }
      const falta = r.faltando ?? []
      setErro(
        falta.length
          ? `Falta preencher: ${[...new Set(falta.map((f) => oQueFalta(def, f)))].join(", ")}.`
          : r.texto
      )
      setFaltando(falta)
      // O item de grupo que tem campo faltando abre, pra ele aparecer marcado.
      if (falta.length) {
        setValores((v) => abrirOsQueFaltam(def.campos, v, falta))
        setFoco('[aria-invalid="true"], [data-falta]')
      }
    })
  }

  const contexto: Contexto = {
    base,
    faltando: new Set(faltando),
    produto,
    catalogo,
    mudar: setValores,
    focar: setFoco,
  }

  return (
    <Gaveta titulo={def.nome} fechar={fechar}>
      <form onSubmit={salvar} noValidate ref={formulario} data-editor={secao.id}>
        <p className="gaveta__produto">
          Neste produto: <b>{produto.nome}</b>
        </p>
        {def.realce ? (
          <p className="dica-realce">
            Pra destacar uma palavra {def.realce}, escreva entre asteriscos: <code>*sua cara*</code>{" "}
            vira <b>sua cara</b>.
          </p>
        ) : null}
        {temTexto ? (
          <div className="campos">
            <Campos campos={def.campos} caminho={[]} valores={valores} ctx={contexto} />
          </div>
        ) : null}
        {comFundo && def.fundo ? (
          <FundoDaSecao
            produtoId={produto.id}
            medida={def.fundo}
            valor={fundo}
            mudar={setFundo}
            aoSubir={setSubindo}
          />
        ) : null}
        {erro ? (
          <p className="gaveta__erro" role="alert">
            <Icone nome="alerta" />
            {erro}
          </p>
        ) : null}
        <div className="form-acoes">
          <button type="button" className="btn btn--fantasma" onClick={fechar}>
            Cancelar
          </button>
          <button
            type="submit"
            className="btn btn--menor"
            disabled={subindo || salvando}
            aria-busy={salvando || undefined}
          >
            {subindo ? "Esperando a foto subir…" : salvando ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </form>
    </Gaveta>
  )
}

/** O fundo que vai pro Medusa: sem a foto do computador, não há fundo (a do celular é extra dela). */
function fundoParaGravar(f: EstadoDoFundo): Fundo | null {
  if (!f.computador) return null
  return {
    imagem: f.computador.url,
    ...(f.celular ? { imagemCelular: f.celular.url } : {}),
    veu: f.veu,
  }
}

/**
 * Os valores do formulário, pra abrir a gaveta. Grupo vazio já abre com um
 * item (é por onde se começa); com mais de dois, só o primeiro fica aberto —
 * cabe na tela do celular.
 */
function abrir(campos: Campo[], gravado: Valores | null): Valores {
  const v = paraOFormulario(campos, gravado)
  for (const c of campos) {
    if (c.tipo !== "grupo") continue
    const itens = v[c.c] as Valores[]
    v[c.c] = itens.length
      ? itens.map((item, i) => ({ ...item, __aberto: itens.length <= 2 || i === 0 }))
      : [{ ...itemVazio(c.campos), __aberto: true }]
  }
  return v
}

function abrirOsQueFaltam(campos: Campo[], v: Valores, falta: string[]): Valores {
  let novo = v
  for (const c of campos) {
    if (c.tipo !== "grupo") continue
    const itens = (novo[c.c] as Valores[]) ?? []
    novo = gravar(
      novo,
      [c.c],
      itens.map((item, i) =>
        falta.some((f) => f.startsWith(`${c.c}.${i}.`)) ? { ...item, __aberto: true } : item
      )
    )
  }
  return novo
}

function Campos({
  campos,
  caminho,
  valores,
  ctx,
}: {
  campos: Campo[]
  caminho: Caminho
  valores: Valores
  ctx: Contexto
}) {
  return campos.map((campo, n) => {
    if (campo.tipo === "nota")
      return (
        <div className="campo" key={`nota-${n}`}>
          <p className={`nota-form${campo.atencao ? " nota-form--atencao" : ""}`}>{campo.texto}</p>
        </div>
      )
    const aqui = [...caminho, campo.c]
    return <UmCampo key={campo.c} campo={campo} caminho={aqui} valores={valores} ctx={ctx} />
  })
}

function UmCampo({
  campo,
  caminho,
  valores,
  ctx,
}: {
  campo: Exclude<Campo, { tipo: "nota" }>
  caminho: Caminho
  valores: Valores
  ctx: Contexto
}) {
  const chave = chaveDe(caminho)
  const id = `${ctx.base}-${chave.replace(/\./g, "-")}`
  const falta = ctx.faltando.has(chave) || undefined
  const valor = ler(valores, caminho)
  const mudar = (novo: unknown) => ctx.mudar((v) => gravar(v, caminho, novo))
  const ajuda = "ajuda" in campo && campo.ajuda ? campo.ajuda : null
  const idAjuda = ajuda ? `${id}-ajuda` : undefined

  if (campo.tipo === "texto")
    return (
      <div className={`campo${campo.meia ? " campo--3" : ""}`}>
        <label htmlFor={id}>{campo.rot}</label>
        <input
          id={id}
          data-campo={chave}
          value={typeof valor === "string" ? valor : ""}
          placeholder={campo.exemplo ? `Ex.: ${campo.exemplo}` : undefined}
          aria-invalid={falta}
          aria-describedby={idAjuda}
          onChange={(e) => mudar(e.target.value)}
        />
        {ajuda ? (
          <p className="campo__ajuda" id={idAjuda}>
            {ajuda}
          </p>
        ) : null}
      </div>
    )

  if (campo.tipo === "area" || campo.tipo === "paragrafos")
    return (
      <div className="campo">
        <label htmlFor={id}>{campo.rot}</label>
        <textarea
          id={id}
          data-campo={chave}
          rows={campo.tipo === "paragrafos" ? 5 : (campo.linhas ?? 3)}
          value={typeof valor === "string" ? valor : ""}
          aria-invalid={falta}
          aria-describedby={idAjuda}
          onChange={(e) => mudar(e.target.value)}
        />
        {ajuda ? (
          <p className="campo__ajuda" id={idAjuda}>
            {ajuda}
          </p>
        ) : null}
      </div>
    )

  if (campo.tipo === "marcar")
    return (
      <div className="campo">
        <label className="marcar">
          <input
            type="checkbox"
            data-campo={chave}
            checked={valor === true}
            onChange={(e) => {
              const marcado = e.target.checked
              // O marco é UM: marcar uma etapa desmarca as outras do grupo.
              if (campo.unico && marcado && caminho.length >= 3) {
                const grupo = caminho.slice(0, -2)
                const esta = caminho[caminho.length - 2] as number
                ctx.mudar((v) =>
                  gravar(
                    v,
                    grupo,
                    ((ler(v, grupo) as Valores[]) ?? []).map((item, i) => ({
                      ...item,
                      [campo.c]: i === esta,
                    }))
                  )
                )
              } else mudar(marcado)
            }}
          />{" "}
          {campo.rot}
        </label>
      </div>
    )

  if (campo.tipo === "produto") {
    const opcoes = [
      ...(campo.comEste
        ? [{ handle: ctx.produto.handle, nome: `Este produto (${ctx.produto.nome})` }]
        : []),
      ...ctx.catalogo.map((p) => ({
        handle: p.handle,
        nome: `${p.nome}${p.esgotado ? " · esgotado" : ""}`,
      })),
    ]
    const atual = typeof valor === "string" ? valor : ""
    if (atual && !opcoes.some((o) => o.handle === atual))
      opcoes.push({ handle: atual, nome: `${atual} (fora do site)` })
    return (
      <div className={`campo${campo.meia ? " campo--3" : ""}`}>
        <label htmlFor={id}>{campo.rot}</label>
        <select
          id={id}
          data-campo={chave}
          value={atual}
          aria-invalid={falta}
          aria-describedby={idAjuda}
          onChange={(e) => mudar(e.target.value)}
        >
          <option value="">Escolha</option>
          {opcoes.map((o) => (
            <option key={o.handle} value={o.handle}>
              {o.nome}
            </option>
          ))}
        </select>
        {ajuda ? (
          <p className="campo__ajuda" id={idAjuda}>
            {ajuda}
          </p>
        ) : null}
      </div>
    )
  }

  if (campo.tipo === "lista") {
    const itens = Array.isArray(valor) ? (valor as string[]) : []
    const linha = (i: number) => `[data-campo="${chave}.${i}"]`
    return (
      <fieldset
        className="campo lista-form"
        data-falta={falta && !itens.length ? "" : undefined}
        tabIndex={-1}
      >
        <legend className="campo__rot">{campo.rot}</legend>
        {itens.map((txt, i) => {
          const comum = {
            "data-campo": `${chave}.${i}`,
            "aria-label": `${campo.item} ${i + 1}`,
            "aria-invalid": (falta && i === 0) || undefined,
            value: txt,
          }
          return (
            <div className="lista-form__linha" key={i}>
              {campo.grande ? (
                <textarea
                  {...comum}
                  rows={3}
                  onChange={(e) => mudar(gravar(itens, [i], e.target.value))}
                />
              ) : (
                <input {...comum} onChange={(e) => mudar(gravar(itens, [i], e.target.value))} />
              )}
              <BotoesDoItem
                nome={`${campo.item} ${i + 1}`}
                chave={chave}
                i={i}
                total={itens.length}
                mover={(j) => {
                  const nova = [...itens]
                  ;[nova[i], nova[j]] = [nova[j], nova[i]]
                  mudar(nova)
                }}
                tirar={() => {
                  mudar(itens.filter((_, k) => k !== i))
                  ctx.focar(`[data-mais="${chave}"]`)
                }}
                focar={ctx.focar}
              />
            </div>
          )
        })}
        <button
          type="button"
          className="btn btn--menor btn--contorno"
          data-mais={chave}
          onClick={() => {
            mudar([...itens, ""])
            ctx.focar(linha(itens.length))
          }}
        >
          <Icone nome="mais" />
          Adicionar {campo.item.toLowerCase()}
        </button>
        {ajuda ? <p className="campo__ajuda">{ajuda}</p> : null}
      </fieldset>
    )
  }

  // grupo
  const itens = Array.isArray(valor) ? (valor as Valores[]) : []
  return (
    <fieldset className="campo grupo-form" data-falta={falta ? "" : undefined} tabIndex={-1}>
      <legend className="campo__rot">{campo.rot}</legend>
      {falta ? (
        <p className="campo__ajuda campo__ajuda--falta">
          Pelo menos {campo.item.toLowerCase()} completo, com todos os campos.
        </p>
      ) : null}
      {itens.map((item, i) => {
        const rotulo = typeof item[campo.rotItem] === "string" ? String(item[campo.rotItem]) : ""
        const nome = rotulo.trim() || `${campo.item} ${i + 1}`
        const aberto = item.__aberto === true
        const idCorpo = `${id}-${i}`
        return (
          <div className="grupo-form__item" key={String(item.__id)} data-item={`${chave}.${i}`}>
            <div className="grupo-form__topo">
              <button
                type="button"
                className="grupo-form__abre"
                aria-expanded={aberto}
                aria-controls={aberto ? idCorpo : undefined}
                data-abre={`${chave}.${i}`}
                onClick={() => mudar(gravar(itens, [i, "__aberto"], !aberto))}
              >
                <Icone nome="seta" />
                <span>{nome}</span>
              </button>
              <BotoesDoItem
                nome={nome}
                chave={chave}
                i={i}
                total={itens.length}
                mover={(j) => {
                  const nova = [...itens]
                  ;[nova[i], nova[j]] = [nova[j], nova[i]]
                  mudar(nova)
                }}
                tirar={() => {
                  mudar(itens.filter((_, k) => k !== i))
                  ctx.focar(`[data-mais="${chave}"]`)
                }}
                focar={ctx.focar}
              />
            </div>
            {aberto ? (
              <div className="grupo-form__corpo" id={idCorpo}>
                <div className="campos">
                  <Campos
                    campos={campo.campos}
                    caminho={[...caminho, i]}
                    valores={valores}
                    ctx={ctx}
                  />
                </div>
              </div>
            ) : null}
          </div>
        )
      })}
      <button
        type="button"
        className="btn btn--menor btn--contorno"
        data-mais={chave}
        onClick={() => {
          mudar([...itens, { ...itemVazio(campo.campos), __aberto: true }])
          ctx.focar(`[data-item="${chave}.${itens.length}"] :is(input, select, textarea)`)
        }}
      >
        <Icone nome="mais" />
        Adicionar {campo.item.toLowerCase()}
      </button>
    </fieldset>
  )
}

/** Subir, descer e tirar um item de lista ou de grupo. O foco acompanha o item que andou. */
function BotoesDoItem({
  nome,
  chave,
  i,
  total,
  mover,
  tirar,
  focar,
}: {
  nome: string
  chave: string
  i: number
  total: number
  mover: (j: number) => void
  tirar: () => void
  focar: (seletor: string) => void
}) {
  const botao = (acao: string, j: number) =>
    `[data-mover="${acao}"][data-lista="${chave}"][data-i="${j}"]`
  const andar = (acao: "subir" | "descer") => {
    const j = acao === "subir" ? i - 1 : i + 1
    mover(j)
    // Chegou na ponta: a seta dele desliga, e o foco vai pra outra.
    const naPonta = acao === "subir" ? j === 0 : j === total - 1
    focar(botao(naPonta ? (acao === "subir" ? "descer" : "subir") : acao, j))
  }
  return (
    <span className="lista-form__botoes">
      <button
        type="button"
        aria-label={`Subir ${nome}`}
        data-mover="subir"
        data-lista={chave}
        data-i={i}
        disabled={i === 0}
        onClick={() => andar("subir")}
      >
        <Icone nome="cima" />
      </button>
      <button
        type="button"
        aria-label={`Descer ${nome}`}
        data-mover="descer"
        data-lista={chave}
        data-i={i}
        disabled={i === total - 1}
        onClick={() => andar("descer")}
      >
        <Icone nome="baixo" />
      </button>
      <button type="button" aria-label={`Tirar ${nome}`} data-tirar={chave} onClick={tirar}>
        <Icone nome="fechar" />
      </button>
    </span>
  )
}
