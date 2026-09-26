"use client"

import {
  useId,
  useOptimistic,
  useState,
  useTransition,
  type FormEvent,
  type ReactNode,
} from "react"
import { useAvisar } from "@/components/avisos"
import { Gaveta } from "@/components/gaveta"
import { Icone } from "@/components/icones"
import { criarCupom, mudarCupom } from "@/lib/acoes/cupons"
import {
  codigoLimpo,
  COR_DA_SITUACAO,
  CUPOM_VAZIO,
  hojeAMeiaNoite,
  linkDoCupom,
  NOME_DA_SITUACAO,
  previaDoCupom,
  type Catalogo,
  type CupomNaLista,
  type FormularioDoCupom,
} from "@/lib/cupons"
import { reais } from "@/lib/pedidos"

/**
 * OS CUPONS NA TELA — a lista com a chave de cada um (e o link que aplica o
 * cupom sozinho), e a gaveta do cupom novo, com as seções do "Criar cupom"
 * da Nuvemshop. A chave vale na hora (a tela já mostra enquanto vai, e volta
 * sozinha se o Medusa recusar); o vencido e o esgotado não têm chave: pra
 * valer de novo, é outro cupom.
 */
export function ListaDeCupons({
  cupons: gravados,
  loja = null,
}: {
  cupons: CupomNaLista[]
  loja?: string | null
}) {
  const avisar = useAvisar()
  const [indo, comecar] = useTransition()
  const [cupons, aplicar] = useOptimistic(
    gravados,
    (lista: CupomNaLista[], { id, ligar }: { id: string; ligar: boolean }) =>
      lista.map((c) =>
        c.id === id
          ? { ...c, ligado: ligar, situacao: ligar ? ("valendo" as const) : ("pausado" as const) }
          : c
      )
  )

  function mudar(c: CupomNaLista) {
    const ligar = !c.ligado
    comecar(async () => {
      aplicar({ id: c.id, ligar })
      avisar(await mudarCupom(c.id, ligar ? "ligar" : "pausar"))
    })
  }

  if (!cupons.length)
    return (
      <p className="vazio vazio--curto">
        Nenhum cupom ainda. O primeiro nasce no &ldquo;Novo cupom&rdquo;, lá em cima.
      </p>
    )
  return (
    <div className="linhas" aria-busy={indo || undefined}>
      {cupons.map((c) => {
        const chave = c.situacao !== "vencido" && c.situacao !== "esgotado"
        return (
          <div className="linha" key={c.id} data-cupom={c.codigo}>
            <div>
              <p className="linha__titulo">
                <span className="num">{c.codigo}</span>
              </p>
              <p className="linha__txt">
                {c.descricao} · {c.regra}
              </p>
              <p className="linha__txt">
                <b>{c.usos}</b>
                {c.pedidos
                  ? ` · ${reais(c.desconto)} de desconto · ${reais(c.vendeu)} em pedidos pagos`
                  : ""}
              </p>
            </div>
            <div className="cupom__lado">
              {loja ? (
                <CopiarLink link={linkDoCupom(loja, c.codigo)} codigo={c.codigo} curto />
              ) : null}
              <span className="status" data-s={COR_DA_SITUACAO[c.situacao]}>
                {NOME_DA_SITUACAO[c.situacao]}
              </span>
              {chave ? (
                <button
                  type="button"
                  className="chave"
                  role="switch"
                  aria-checked={c.ligado}
                  aria-label={`Cupom ${c.codigo} valendo`}
                  data-chave-cupom={c.codigo}
                  onClick={() => mudar(c)}
                />
              ) : null}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** O botão que copia o link do cupom — o que a Nuvemshop chama de "Link do cupom". */
function CopiarLink({
  link,
  codigo,
  curto = false,
}: {
  link: string
  codigo: string
  curto?: boolean
}) {
  const avisar = useAvisar()
  async function copiar() {
    try {
      await navigator.clipboard.writeText(link)
      avisar({ ok: true, texto: `Link do ${codigo} copiado — é só colar.` })
    } catch {
      avisar({ ok: false, texto: "Não consegui copiar. Selecione o link e copie à mão." })
    }
  }
  return (
    <button
      type="button"
      className={curto ? "btn btn--menor btn--contorno cupom__link" : "btn btn--menor"}
      data-copiar-link={codigo}
      aria-label={curto ? `Copiar o link do cupom ${codigo}` : undefined}
      onClick={copiar}
    >
      <Icone nome="check" />
      {curto ? "Link" : "Copiar"}
    </button>
  )
}

/** O botão do alto da tela, e a gaveta com o formulário. */
export function NovoCupom({
  catalogo = { categorias: [], produtos: [] },
  loja = null,
}: {
  catalogo?: Catalogo
  loja?: string | null
}) {
  const [aberta, setAberta] = useState(false)
  return (
    <>
      <button
        type="button"
        className="btn btn--menor"
        data-novo-cupom
        onClick={() => setAberta(true)}
      >
        <Icone nome="mais" />
        Novo cupom
      </button>
      {aberta ? (
        <GavetaDoCupom catalogo={catalogo} loja={loja} fechar={() => setAberta(false)} />
      ) : null}
    </>
  )
}

/** Uma seção da gaveta, como os cartões do "Criar cupom" da Nuvemshop. */
function Secao({ titulo, id, children }: { titulo: string; id: string; children: ReactNode }) {
  return (
    <section className="cupom-secao" aria-labelledby={id} data-secao-cupom={id}>
      <h3 className="cupom-secao__titulo" id={id}>
        {titulo}
      </h3>
      {children}
    </section>
  )
}

function GavetaDoCupom({
  catalogo,
  loja,
  fechar,
}: {
  catalogo: Catalogo
  loja: string | null
  fechar: () => void
}) {
  const avisar = useAvisar()
  const id = useId()
  const [f, setF] = useState<FormularioDoCupom>(CUPOM_VAZIO)
  const [erros, setErros] = useState<Record<string, string>>({})
  const [erro, setErro] = useState("")
  const [criando, comecar] = useTransition()
  const mudar = <K extends keyof FormularioDoCupom>(campo: K, valor: FormularioDoCupom[K]) =>
    setF((a) => ({ ...a, [campo]: valor }))

  function criar(ev: FormEvent) {
    ev.preventDefault()
    if (criando) return
    comecar(async () => {
      const r = await criarCupom(f)
      if (r.ok) {
        avisar(r)
        fechar()
        return
      }
      setErros(r.erros ?? {})
      setErro(r.texto)
    })
  }

  const erroDe = (c: string) => (
    <p className="campo__erro" id={`cupom-${c}-erro`} role={erros[c] ? "alert" : undefined}>
      {erros[c] ?? ""}
    </p>
  )

  const campo = (
    c: keyof FormularioDoCupom,
    rotulo: string,
    extra: {
      nota?: string
      tipo?: string
      modo?: "numeric" | "decimal"
      largura?: string
      dica?: string
      ajuda?: string
    } = {}
  ) => (
    <div className={`campo ${extra.largura ?? ""}`.trim()}>
      <label htmlFor={`cupom-${c}`}>
        {rotulo}
        {extra.nota ? <small> {extra.nota}</small> : null}
      </label>
      <input
        id={`cupom-${c}`}
        data-campo={c}
        type={extra.tipo ?? "text"}
        inputMode={extra.modo}
        autoComplete="off"
        placeholder={extra.dica}
        value={f[c] as string}
        aria-invalid={erros[c] ? true : undefined}
        aria-describedby={erros[c] ? `cupom-${c}-erro` : undefined}
        style={c === "codigo" ? { textTransform: "uppercase" } : undefined}
        onChange={(e) => mudar(c, e.target.value as never)}
      />
      {extra.ajuda ? <p className="campo__ajuda">{extra.ajuda}</p> : null}
      {erroDe(c)}
    </div>
  )

  /** Os botões de escolha da Nuvemshop ("Ilimitado", "Limitado"…), como rádios. */
  const escolha = <K extends "tipo" | "aplicarA" | "porCupom" | "porCliente" | "data">(
    c: K,
    rotulo: string,
    opcoes: readonly (readonly [FormularioDoCupom[K], string])[],
    aoEscolher?: (v: FormularioDoCupom[K]) => void
  ) => (
    <fieldset className="campo">
      <legend className="campo__rot">{rotulo}</legend>
      <div className="segmento">
        {opcoes.map(([valor, nome]) => (
          <label key={valor}>
            <input
              type="radio"
              name={`${id}-${c}`}
              value={valor}
              data-escolha={`${c}:${valor}`}
              data-tipo={c === "tipo" ? valor : undefined}
              checked={f[c] === valor}
              onChange={() => (aoEscolher ? aoEscolher(valor) : mudar(c, valor))}
            />
            <span>{nome}</span>
          </label>
        ))}
      </div>
      {erroDe(c)}
    </fieldset>
  )

  const opcoesDoAlvo = f.aplicarA === "categorias" ? catalogo.categorias : catalogo.produtos
  const codigo = codigoLimpo(f.codigo)

  return (
    <Gaveta titulo="Novo cupom" fechar={fechar}>
      <form onSubmit={criar} noValidate data-form-cupom>
        <Secao titulo="Código do cupom" id={`${id}-codigo`}>
          <div className="campos">
            {campo("codigo", "Código", {
              dica: "JANEIROPROMO",
              ajuda: "É o código que o cliente digita na hora da compra.",
            })}
          </div>
          {loja ? (
            <div className="campo cupom-link" data-link-cupom>
              <p className="campo__rot">Link do cupom</p>
              <p className="campo__ajuda">
                Compartilhe este link com os clientes: o cupom entra sozinho na compra.
              </p>
              <div className="link-pronto">
                <code>{linkDoCupom(loja, codigo || "CÓDIGO")}</code>
                {codigo ? <CopiarLink link={linkDoCupom(loja, codigo)} codigo={codigo} /> : null}
              </div>
            </div>
          ) : null}
        </Secao>

        <Secao titulo="Tipo de desconto" id={`${id}-tipo`}>
          <div className="campos">
            {escolha("tipo", "Tipo", [
              ["porcento", "Porcentagem"],
              ["reais", "Valor fixo"],
              ["frete", "Frete grátis"],
            ] as const)}
            {f.tipo === "porcento" ? (
              campo("valor", "Qual a porcentagem de desconto?", {
                nota: "(%)",
                modo: "numeric",
                largura: "campo--3",
              })
            ) : f.tipo === "reais" ? (
              campo("valor", "Qual o valor do desconto?", {
                nota: "(R$)",
                modo: "decimal",
                largura: "campo--3",
              })
            ) : (
              <div className="campo">
                <label className="marcar">
                  <input
                    type="checkbox"
                    data-campo="soMaisBarato"
                    checked={f.soMaisBarato}
                    onChange={(e) => mudar("soMaisBarato", e.target.checked)}
                  />
                  Aplicar somente à opção de envio de menor custo
                </label>
                {erroDe("soMaisBarato")}
              </div>
            )}
          </div>
        </Secao>

        <Secao titulo="Aplicar a" id={`${id}-aplicar`}>
          <div className="campos">
            {escolha(
              "aplicarA",
              "A quem vale",
              [
                ["loja", "Toda a loja"],
                ["categorias", "Categorias"],
                ["produtos", "Produtos"],
              ] as const,
              (v) => setF((a) => ({ ...a, aplicarA: v, alvos: [] }))
            )}
            <p className="campo__ajuda campo" data-ajuda-aplicar>
              {f.aplicarA === "loja"
                ? "O cupom poderá ser usado em todos os produtos de todas as categorias da loja."
                : f.aplicarA === "categorias"
                  ? "O cupom só será aceito se todos os produtos do carrinho forem destas categorias."
                  : "O cupom só será aceito se todos os produtos do carrinho forem destes."}
            </p>
            {f.aplicarA !== "loja" ? (
              <fieldset className="campo">
                <legend className="campo__rot">
                  {f.aplicarA === "categorias" ? "Categorias" : "Produtos"}
                </legend>
                <div className="cupom-escolhas" data-alvos>
                  {opcoesDoAlvo.length ? (
                    opcoesDoAlvo.map((a) => (
                      <label className="marcar" key={a.id}>
                        <input
                          type="checkbox"
                          data-alvo={a.nome}
                          checked={f.alvos.includes(a.id)}
                          onChange={(e) =>
                            mudar(
                              "alvos",
                              e.target.checked
                                ? [...f.alvos, a.id]
                                : f.alvos.filter((x) => x !== a.id)
                            )
                          }
                        />
                        {a.nome}
                      </label>
                    ))
                  ) : (
                    <p className="campo__ajuda">Nada pra escolher ainda.</p>
                  )}
                </div>
                {erroDe("alvos")}
              </fieldset>
            ) : null}
          </div>
        </Secao>

        <Secao titulo="Limites de uso" id={`${id}-limites`}>
          <p className="campo__ajuda cupom-secao__sub">Defina as condições do seu cupom.</p>
          <div className="campos">
            <div className="campo">
              <label className="marcar">
                <input
                  type="checkbox"
                  data-campo="combina"
                  checked={f.combina}
                  onChange={(e) => mudar("combina", e.target.checked)}
                />
                Permitir combinar com outras promoções. Ex.: preço promocional e frete grátis.
              </label>
              {!f.combina ? (
                <p className="campo__ajuda">
                  Assim, o cupom não desconta produto que já está em promoção e não vale no pedido
                  que já ganhou o frete grátis.
                </p>
              ) : null}
            </div>
            {escolha("porCupom", "Por cupom", [
              ["ilimitado", "Ilimitado"],
              ["limitado", "Limitado"],
            ] as const)}
            {f.porCupom === "limitado"
              ? campo("limite", "Usos no total", { modo: "numeric", largura: "campo--3" })
              : null}
            {escolha("porCliente", "Por cliente", [
              ["ilimitado", "Ilimitado"],
              ["limitado", "Limitado"],
              ["primeira", "Primeira compra"],
            ] as const)}
            {f.porCliente === "limitado"
              ? campo("usosPorCliente", "Usos por cliente", {
                  modo: "numeric",
                  largura: "campo--3",
                })
              : null}
            {f.porCliente === "primeira" ? (
              <p className="campo__ajuda campo">
                Só pra quem nunca comprou na loja, uma vez — pelo e-mail da compra.
              </p>
            ) : null}
            {escolha(
              "data",
              "Data",
              [
                ["ilimitado", "Ilimitado"],
                ["periodo", "Período"],
              ] as const,
              (v) =>
                setF((a) => ({
                  ...a,
                  data: v,
                  de: v === "periodo" && !a.de ? hojeAMeiaNoite() : a.de,
                }))
            )}
            {f.data === "periodo" ? (
              <>
                {campo("de", "Começa", { tipo: "datetime-local", largura: "campo--3" })}
                {campo("ate", "Termina", { tipo: "datetime-local", largura: "campo--3" })}
              </>
            ) : null}
            {campo("minimo", "Valor do carrinho", {
              nota: "— acima de",
              modo: "decimal",
              largura: "campo--3",
              dica: "R$ 0",
              ajuda: "Não se aplica aos custos de frete.",
            })}
          </div>
        </Secao>

        <p className="previa" data-previa-cupom>
          {previaDoCupom(f, catalogo)}
        </p>
        <p className="pequeno suave" style={{ margin: "10px 0 0" }}>
          Um cupom por pedido: quem digita outro troca o de antes. &ldquo;Por cliente&rdquo; e
          &ldquo;primeira compra&rdquo; valem pelo e-mail da compra — o checkout confere quando a
          pessoa digita o e-mail.
        </p>
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
            disabled={criando}
            aria-busy={criando || undefined}
          >
            {criando ? "Criando…" : "Criar cupom"}
          </button>
        </div>
      </form>
    </Gaveta>
  )
}
