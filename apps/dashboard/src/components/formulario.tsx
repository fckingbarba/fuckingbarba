"use client"

import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from "react"
import { Icone } from "@/components/icones"
import {
  CampoDeFoto,
  CampoDeVideo,
  type DestinoDoVideo,
} from "@/components/produto/campos-de-midia"
import {
  FundoDaSecao,
  type EstadoDoFundo,
  type SubirImagem,
} from "@/components/produto/fundo-da-secao"
import {
  chaveDe,
  gravar,
  itemVazio,
  ler,
  type Caminho,
  type Campo,
  type ImagensDoCampo,
  type Valores,
} from "@/lib/formulario"
import { VEU, type NoCatalogo, type VideoDaPdp } from "@/lib/produtos"

/**
 * OS CAMPOS DE UMA SEÇÃO, na gaveta — o mesmo desenho pra página do produto
 * e pra home. Texto, caixa de texto, lista de linhas, grupo de itens (as
 * etapas, as perguntas, os produtos do palco…), produto do catálogo,
 * caixinha, e — só na página do produto — foto e vídeo, que sobem pra ele.
 *
 * Quem chama guarda os valores e diz o contexto: o catálogo pros seletores,
 * o produto da página (se houver), o que está faltando (marcado), e como
 * focar e esperar o que está subindo.
 */

export type ContextoDoFormulario = {
  base: string
  faltando: ReadonlySet<string>
  catalogo: NoCatalogo[]
  /** O produto da página: o "Este produto" dos seletores, e pra onde sobem foto e vídeo. */
  produto?: { id: string; handle: string; nome: string }
  /** Pra onde sobe a imagem de um campo de imagens (a arte do banner, a foto da última chamada). */
  subir?: SubirImagem
  /** Pra onde sobe o vídeo de um campo de vídeo: o produto da página, ou a home. */
  video?: DestinoDoVideo
  mudar: Dispatch<SetStateAction<Valores>>
  /** O que focar depois do próximo desenho (o item que subiu, o que entrou). */
  focar: (seletor: string) => void
  /** Uma foto ou um vídeo começou (+1) ou acabou (-1) de subir: o "Salvar" espera. */
  aoSubir: (delta: 1 | -1) => void
}

export function Campos({
  campos,
  caminho,
  valores,
  ctx,
}: {
  campos: Campo[]
  caminho: Caminho
  valores: Valores
  ctx: ContextoDoFormulario
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
  ctx: ContextoDoFormulario
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
      ...(campo.comEste && ctx.produto
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
          <option value="">{campo.vazio ?? "Escolha"}</option>
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
        {campo.max !== undefined && itens.length >= campo.max ? (
          <p className="campo__ajuda">
            Até {campo.max} — {campo.item.toLowerCase()} a mais não cabe na seção.
          </p>
        ) : (
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
        )}
        {ajuda ? <p className="campo__ajuda">{ajuda}</p> : null}
      </fieldset>
    )
  }

  // A foto sobe pro produto da página: fora dela (a home), o campo não existe. O vídeo, pra onde o contexto diz.
  if (campo.tipo === "foto" && !ctx.produto) return null
  if (campo.tipo === "video" && !ctx.video) return null

  if (campo.tipo === "foto")
    return (
      <CampoDeFoto
        produtoId={ctx.produto!.id}
        chave={chave}
        rotulo={campo.rot}
        meia={campo.meia}
        forma={campo.forma}
        ajuda={campo.ajuda}
        url={typeof valor === "string" ? valor : ""}
        falta={falta}
        mudar={mudar}
        aoSubir={ctx.aoSubir}
      />
    )

  if (campo.tipo === "video")
    return (
      <CampoDeVideo
        destino={ctx.video!}
        uso={campo.uso ?? "uso"}
        chave={chave}
        rotulo={campo.rot}
        ajuda={campo.ajuda}
        video={valor && typeof valor === "object" ? (valor as VideoDaPdp) : null}
        mudar={mudar}
        aoSubir={ctx.aoSubir}
      />
    )

  if (campo.tipo === "opcoes")
    return (
      <div className={`campo${campo.meia ? " campo--3" : ""}`}>
        <label htmlFor={id}>{campo.rot}</label>
        <select
          id={id}
          data-campo={chave}
          value={typeof valor === "string" ? valor : ""}
          aria-describedby={idAjuda}
          onChange={(e) => mudar(e.target.value)}
        >
          {campo.opcoes.map(([v, rotulo]) => (
            <option key={v} value={v}>
              {rotulo}
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

  if (campo.tipo === "imagens")
    return ctx.subir ? (
      <CampoDeImagens
        campo={campo}
        chave={chave}
        valor={(valor ?? SEM_IMAGEM) as ImagensDoCampo}
        // Sobre o valor que está no formulário AGORA: a foto termina de subir depois.
        mudar={(f) =>
          ctx.mudar((v) => gravar(v, caminho, f((ler(v, caminho) ?? SEM_IMAGEM) as ImagensDoCampo)))
        }
        subir={ctx.subir}
        aoSubir={ctx.aoSubir}
      />
    ) : null

  // grupo
  const itens = Array.isArray(valor) ? (valor as Valores[]) : []
  const cheio = campo.max !== undefined && itens.length >= campo.max
  return (
    <fieldset className="campo grupo-form" data-falta={falta ? "" : undefined} tabIndex={-1}>
      <legend className="campo__rot">{campo.rot}</legend>
      {falta ? (
        <p className="campo__ajuda campo__ajuda--falta">
          {(campo.minimo ?? 1) > 1
            ? `Pelo menos ${campo.minimo} (${campo.item.toLowerCase()}s) completos, com todos os campos.`
            : `Pelo menos ${campo.item.toLowerCase()} completo, com todos os campos.`}
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
      {cheio ? (
        <p className="campo__ajuda">
          Até {campo.max} — {campo.item.toLowerCase()} a mais vira álbum, e ninguém olha.
        </p>
      ) : (
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
      )}
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

/**
 * O campo de imagens: o mesmo quadro do fundo das seções (computador e
 * celular, no formato que a loja mostra, com os avisos de tamanho), sem o
 * véu — a arte de um slide e a foto da última chamada não levam a cor da
 * seção por cima.
 */
const SEM_IMAGEM: ImagensDoCampo = { computador: null, celular: null }

function CampoDeImagens({
  campo,
  chave,
  valor,
  mudar,
  subir,
  aoSubir,
}: {
  campo: Extract<Campo, { tipo: "imagens" }>
  chave: string
  valor: ImagensDoCampo
  mudar: (f: (anterior: ImagensDoCampo) => ImagensDoCampo) => void
  subir: SubirImagem
  aoSubir: (delta: 1 | -1) => void
}) {
  const mudarEstado: Dispatch<SetStateAction<EstadoDoFundo>> = (f) =>
    mudar((anterior) => {
      const novo = typeof f === "function" ? f({ ...anterior, veu: VEU.padrao }) : f
      return { computador: novo.computador, celular: novo.celular }
    })

  // O quadro avisa "subindo" a cada desenho; o formulário quer só a mudança (+1, e −1 no fim).
  const subindo = useRef(false)
  const avisar = useRef(aoSubir)
  useEffect(() => {
    avisar.current = aoSubir
  })
  const aoMudarSubida = useCallback((agora: boolean) => {
    if (agora === subindo.current) return
    subindo.current = agora
    avisar.current(agora ? 1 : -1)
  }, [])

  return (
    <div className="campo" data-imagens={chave}>
      <FundoDaSecao
        subir={subir}
        medida={campo.medida}
        valor={{ ...valor, veu: VEU.padrao }}
        mudar={mudarEstado}
        aoSubir={aoMudarSubida}
        comVeu={false}
        legenda={campo.rot}
        ajuda={campo.ajuda ?? ""}
        rodape={
          campo.rodape ??
          "JPG, PNG ou WebP. A loja guarda em WebP, no tamanho certo pra cada tela. Sem a do celular, ele usa a do computador."
        }
      />
    </div>
  )
}
