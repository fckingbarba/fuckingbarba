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
import { Fichas } from "@/components/visual"
import { criarPromocao, mudarPromocao } from "@/lib/acoes/promocoes"
import { hojeAMeiaNoite, type Catalogo } from "@/lib/cupons"
import { reais } from "@/lib/pedidos"
import {
  contaEmFrase,
  COR_DA_SITUACAO,
  etiquetaDa,
  NOME_DA_SITUACAO,
  previaDaPromocao,
  PROMOCAO_VAZIA,
  type FormularioDaPromocao,
  type PromocaoNaLista,
} from "@/lib/promocoes"

/**
 * AS PROMOÇÕES NA TELA — a lista com a chave de cada uma, e a gaveta da
 * promoção nova, com as seções do "Compre X e pague Y" da Nuvemshop. A chave
 * vale na hora (a tela já mostra enquanto vai, e volta sozinha se o Medusa
 * recusar); a encerrada não tem chave: pra valer de novo, é outra promoção.
 */
export function ListaDePromocoes({ promocoes: gravadas }: { promocoes: PromocaoNaLista[] }) {
  const avisar = useAvisar()
  const [indo, comecar] = useTransition()
  const [promocoes, aplicar] = useOptimistic(
    gravadas,
    (lista: PromocaoNaLista[], { id, ligar }: { id: string; ligar: boolean }) =>
      lista.map((p) =>
        p.id === id
          ? { ...p, ligado: ligar, situacao: ligar ? ("valendo" as const) : ("pausado" as const) }
          : p
      )
  )

  function mudar(p: PromocaoNaLista) {
    const ligar = !p.ligado
    comecar(async () => {
      aplicar({ id: p.id, ligar })
      avisar(await mudarPromocao(p.id, ligar ? "ligar" : "pausar"))
    })
  }

  if (!promocoes.length)
    return (
      <p className="vazio vazio--curto">
        Nenhuma promoção ainda. A primeira nasce no &ldquo;Nova promoção&rdquo;, aqui em cima.
      </p>
    )
  return (
    <div className="linhas" aria-busy={indo || undefined}>
      {promocoes.map((p) => (
        <div className="linha" key={p.id} data-promocao={p.codigo}>
          <div>
            <p className="linha__titulo">
              {p.nome} {/* O selo que a loja mostra no produto, com o mesmo preto (0155). */}
              <span className="promo__selo" title="O selo na loja">
                {p.etiqueta}
              </span>
            </p>
            <p className="linha__txt">{p.descricao}</p>
            <Fichas frase={p.regra} />
            <p className="cupom__numeros">
              {p.pedidos ? (
                <>
                  <span>
                    <b>{p.pedidos}</b> {p.pedidos === 1 ? "pedido" : "pedidos"}
                  </span>
                  <span>
                    <b>{reais(p.desconto)}</b> de desconto
                  </span>
                  <span>
                    <b>{reais(p.vendeu)}</b> em pedidos pagos
                  </span>
                </>
              ) : (
                <span>nenhum pedido ainda</span>
              )}
            </p>
          </div>
          <div className="cupom__lado">
            <span className="status" data-s={COR_DA_SITUACAO[p.situacao]}>
              {NOME_DA_SITUACAO[p.situacao]}
            </span>
            {p.situacao !== "vencido" ? (
              <button
                type="button"
                className="chave"
                role="switch"
                aria-checked={p.ligado}
                aria-label={`Promoção ${p.nome} valendo`}
                data-chave-promocao={p.codigo}
                onClick={() => mudar(p)}
              />
            ) : null}
          </div>
        </div>
      ))}
    </div>
  )
}

/** O botão do bloco das promoções, e a gaveta com o formulário. */
export function NovaPromocao({
  catalogo = { categorias: [], produtos: [] },
}: {
  catalogo?: Catalogo
}) {
  const [aberta, setAberta] = useState(false)
  return (
    <>
      <button
        type="button"
        className="btn btn--menor"
        data-nova-promocao
        onClick={() => setAberta(true)}
      >
        <Icone nome="mais" />
        Nova promoção
      </button>
      {aberta ? <GavetaDaPromocao catalogo={catalogo} fechar={() => setAberta(false)} /> : null}
    </>
  )
}

/** Uma seção da gaveta, como os cartões do "Criar promoção" da Nuvemshop. */
function Secao({ titulo, id, children }: { titulo: string; id: string; children: ReactNode }) {
  return (
    <section className="cupom-secao" aria-labelledby={id} data-secao-promocao={id}>
      <h3 className="cupom-secao__titulo" id={id}>
        {titulo}
      </h3>
      {children}
    </section>
  )
}

function GavetaDaPromocao({ catalogo, fechar }: { catalogo: Catalogo; fechar: () => void }) {
  const avisar = useAvisar()
  const id = useId()
  const [f, setF] = useState<FormularioDaPromocao>(PROMOCAO_VAZIA)
  const [erros, setErros] = useState<Record<string, string>>({})
  const [erro, setErro] = useState("")
  const [criando, comecar] = useTransition()
  const mudar = <K extends keyof FormularioDaPromocao>(campo: K, valor: FormularioDaPromocao[K]) =>
    setF((a) => ({ ...a, [campo]: valor }))

  function criar(ev: FormEvent) {
    ev.preventDefault()
    if (criando) return
    comecar(async () => {
      const r = await criarPromocao(f)
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
    <p className="campo__erro" id={`promocao-${c}-erro`} role={erros[c] ? "alert" : undefined}>
      {erros[c] ?? ""}
    </p>
  )

  const campo = (
    c: "nome" | "comprando" | "pague" | "de" | "ate" | "etiqueta",
    rotulo: string,
    extra: { tipo?: string; modo?: "numeric"; largura?: string; dica?: string; ajuda?: string } = {}
  ) => (
    <div className={`campo ${extra.largura ?? ""}`.trim()}>
      <label htmlFor={`promocao-${c}`}>{rotulo}</label>
      <input
        id={`promocao-${c}`}
        data-campo={c}
        type={extra.tipo ?? "text"}
        inputMode={extra.modo}
        autoComplete="off"
        placeholder={extra.dica}
        value={f[c]}
        aria-invalid={erros[c] ? true : undefined}
        aria-describedby={erros[c] ? `promocao-${c}-erro` : undefined}
        onChange={(e) => mudar(c, e.target.value)}
      />
      {extra.ajuda ? <p className="campo__ajuda">{extra.ajuda}</p> : null}
      {erroDe(c)}
    </div>
  )

  /** Os botões de escolha da Nuvemshop ("Toda a loja", "Ilimitado"…), como rádios. */
  const escolha = <K extends "tipo" | "aplicarA" | "data">(
    c: K,
    rotulo: string,
    opcoes: readonly (readonly [FormularioDaPromocao[K], string])[],
    aoEscolher?: (v: FormularioDaPromocao[K]) => void
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

  return (
    <Gaveta titulo="Nova promoção" fechar={fechar}>
      <form onSubmit={criar} noValidate data-form-promocao>
        <Secao titulo="Nome" id={`${id}-nome`}>
          <div className="campos">
            {campo("nome", "Nome da promoção", {
              dica: "Leve 3 do Fator (outubro)",
              ajuda: "Só pra você achar depois: o cliente não vê.",
            })}
          </div>
        </Secao>

        <Secao titulo="Tipo de desconto" id={`${id}-tipo`}>
          <div className="campos">
            {escolha("tipo", "Tipo", [["leve-pague", "Compre X e pague Y"]] as const)}
            {campo("comprando", "Comprando", {
              modo: "numeric",
              largura: "campo--3",
              ajuda: "Quantas o cliente leva.",
            })}
            {campo("pague", "Pague", {
              modo: "numeric",
              largura: "campo--3",
              ajuda: "Quantas ele paga.",
            })}
            <p className="campo__ajuda campo" data-conta>
              {contaEmFrase(f)} Com vários produtos, vale a mais barata de cada grupo.
            </p>
          </div>
        </Secao>

        <Secao titulo="Aplicar a" id={`${id}-aplicar`}>
          <div className="campos">
            {escolha(
              "aplicarA",
              "Em quais produtos",
              [
                ["loja", "Toda a loja"],
                ["categorias", "Categorias"],
                ["produtos", "Produtos"],
              ] as const,
              (v) => setF((a) => ({ ...a, aplicarA: v, alvos: [] }))
            )}
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
            <div className="campo">
              <label className="marcar">
                <input
                  type="checkbox"
                  data-campo="promocional"
                  checked={f.promocional}
                  onChange={(e) => mudar("promocional", e.target.checked)}
                />
                Permitir aplicar a promoção a produtos com preço promocional
              </label>
              {!f.promocional ? (
                <p className="campo__ajuda">
                  Assim, o produto que está com &ldquo;de/por&rdquo; fica fora da promoção enquanto
                  estiver.
                </p>
              ) : null}
            </div>
          </div>
        </Secao>

        <Secao titulo="Limites de uso" id={`${id}-limites`}>
          <div className="campos">
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
          </div>
        </Secao>

        <Secao titulo="Etiqueta na loja" id={`${id}-etiqueta`}>
          <div className="campos">
            {campo("etiqueta", "Texto do selo", {
              dica: etiquetaDa({ ...f, etiqueta: "" }),
              ajuda: "Aparece no card, na página do produto e na sacola. Vazio, fica o do exemplo.",
            })}
          </div>
        </Secao>

        <p className="previa" data-previa-promocao>
          {previaDaPromocao(f, catalogo)}
        </p>
        <p className="pequeno suave" style={{ margin: "10px 0 0" }}>
          Não soma com o desconto por quantidade: enquanto a promoção vale, os produtos dela saem
          das faixas que chegam no Comprando — num &quot;leve 3&quot;, saem os 6% de 3 ou mais, e os
          4% de 2 unidades continuam. Cupom que não combina com outras promoções não desconta os
          itens dela.
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
            {criando ? "Criando…" : "Criar promoção"}
          </button>
        </div>
      </form>
    </Gaveta>
  )
}
