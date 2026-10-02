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
import { criarOferta, mudarOferta } from "@/lib/acoes/ofertas"
import {
  COR_DA_SITUACAO,
  descontoDe,
  enderecoSugerido,
  NOME_DA_SITUACAO,
  numero,
  ofertaVazia,
  prazoEmFrase,
  quando,
  type FormularioDaOferta,
  type OfertaNaLista,
  type ProdutoDoFormulario,
} from "@/lib/ofertas"
import { reais } from "@/lib/pedidos"

/**
 * AS OFERTAS OCULTAS NA TELA — a lista (com o link pra copiar, a chave e o
 * "Encerrar") e a gaveta da oferta nova. A chave vale na hora (a tela já
 * mostra enquanto vai, e volta sozinha se o Medusa recusar); a encerrada não
 * tem chave: pra vender de novo, é outra oferta, com outro link.
 */

/** "Fator: R$ 79,90 → R$ 59,90 (-25%) · Óleo: …" — uma ficha por produto. */
const produtosEmFrase = (o: OfertaNaLista) =>
  o.produtos
    .map((p) => {
      const d = descontoDe(p.hoje, p.por)
      return `${p.nome}: ${p.hoje !== null ? `${reais(p.hoje)} → ` : ""}${reais(p.por)}${d ? ` (-${d}%)` : ""}`
    })
    .join(" · ")

function CopiarLink({ link, endereco }: { link: string; endereco: string }) {
  const avisar = useAvisar()
  async function copiar() {
    try {
      await navigator.clipboard.writeText(link)
      avisar({ ok: true, texto: "Link da oferta copiado — é só colar." })
    } catch {
      avisar({ ok: false, texto: "Não consegui copiar. Selecione o link e copie à mão." })
    }
  }
  return (
    <button type="button" className="btn btn--menor" data-copiar-oferta={endereco} onClick={copiar}>
      <Icone nome="check" />
      Copiar
    </button>
  )
}

/**
 * OS LINKS (entrega 0241: "tem que mandar direto para a PDP"). Com um
 * produto, o link da oferta já leva direto pra página dele. Com vários, um
 * link por produto (cada um pra página do seu), e o geral, pra página com
 * todos.
 */
function LinksDaOferta({ oferta: o }: { oferta: OfertaNaLista }) {
  if (o.produtos.length === 1)
    return o.link ? (
      <LinkPronto
        rotulo="Link · vai direto pra página do produto"
        link={o.link}
        chave={o.endereco}
      />
    ) : null
  return (
    <>
      {o.produtos.map((p) =>
        p.link ? (
          <LinkPronto
            key={p.id}
            rotulo={`Link de ${p.nome}`}
            link={p.link}
            chave={`${o.endereco}/${p.id}`}
          />
        ) : null
      )}
      {o.link ? (
        <LinkPronto rotulo="Página com todos os produtos" link={o.link} chave={o.endereco} />
      ) : null}
    </>
  )
}

function LinkPronto({ rotulo, link, chave }: { rotulo: string; link: string; chave: string }) {
  return (
    <div className="oferta__link" data-link-oferta={chave}>
      <p className="oferta__link-rotulo">{rotulo}</p>
      <div className="link-pronto">
        <code>{link}</code>
        <CopiarLink link={link} endereco={chave} />
      </div>
    </div>
  )
}

export function ListaDeOfertas({ ofertas: gravadas }: { ofertas: OfertaNaLista[] }) {
  const avisar = useAvisar()
  const [indo, comecar] = useTransition()
  const [confirmando, setConfirmando] = useState<string | null>(null)
  const [ofertas, aplicar] = useOptimistic(
    gravadas,
    (lista: OfertaNaLista[], { id, ligar }: { id: string; ligar: boolean }) =>
      lista.map((o) =>
        o.id === id ? { ...o, situacao: ligar ? ("no-ar" as const) : ("pausada" as const) } : o
      )
  )

  function chave(o: OfertaNaLista) {
    const ligar = o.situacao === "pausada"
    comecar(async () => {
      aplicar({ id: o.id, ligar })
      avisar(await mudarOferta(o.id, ligar ? "ligar" : "pausar"))
    })
  }

  function encerrar(o: OfertaNaLista) {
    setConfirmando(null)
    comecar(async () => {
      avisar(await mudarOferta(o.id, "encerrar"))
    })
  }

  if (!ofertas.length)
    return (
      <p className="vazio vazio--curto">
        Nenhuma oferta oculta ainda. A primeira nasce no &ldquo;Nova oferta&rdquo;, aqui em cima.
      </p>
    )
  return (
    <div className="linhas" aria-busy={indo || undefined}>
      {ofertas.map((o) => (
        <div className="linha oferta" key={o.id} data-oferta={o.endereco}>
          <div className="oferta__corpo">
            <p className="linha__titulo">{o.nome}</p>
            <p className="linha__txt">
              Na página: &ldquo;{o.titulo}&rdquo; · {prazoEmFrase(o)}
            </p>
            <Fichas frase={produtosEmFrase(o)} data-produtos-oferta={o.endereco} />
            <p className="cupom__numeros">
              {o.vendas.pedidos ? (
                <>
                  <span>
                    <b>{o.vendas.pedidos}</b> {o.vendas.pedidos === 1 ? "pedido" : "pedidos"}
                  </span>
                  <span>
                    <b>{reais(o.vendas.vendeu)}</b> em pedidos pagos
                  </span>
                </>
              ) : (
                <span>nenhum pedido ainda</span>
              )}
            </p>
            {o.situacao !== "encerrada" ? <LinksDaOferta oferta={o} /> : null}
            {confirmando === o.id ? (
              <div className="confirma" data-confirma-oferta={o.endereco}>
                <p>
                  Encerrar agora? O link passa a dizer que a oferta acabou, e quem está com o
                  produto na sacola volta pro preço de sempre ao abrir o checkout. Não tem volta:
                  pra vender de novo, é outra oferta.
                </p>
                <div className="confirma__acoes">
                  <button
                    type="button"
                    className="btn btn--menor btn--perigo"
                    data-encerrar-oferta-sim={o.endereco}
                    onClick={() => encerrar(o)}
                  >
                    Encerrar agora
                  </button>
                  <button
                    type="button"
                    className="btn btn--fantasma"
                    onClick={() => setConfirmando(null)}
                  >
                    Voltar
                  </button>
                </div>
              </div>
            ) : null}
          </div>
          <div className="cupom__lado">
            <span className="status" data-s={COR_DA_SITUACAO[o.situacao]}>
              {NOME_DA_SITUACAO[o.situacao]}
            </span>
            {o.situacao !== "encerrada" ? (
              <>
                <button
                  type="button"
                  className="chave"
                  role="switch"
                  aria-checked={o.situacao !== "pausada"}
                  aria-label={`Oferta ${o.nome} valendo`}
                  data-chave-oferta={o.endereco}
                  onClick={() => chave(o)}
                />
                <button
                  type="button"
                  className="btn btn--menor btn--contorno"
                  data-encerrar-oferta={o.endereco}
                  onClick={() => setConfirmando(o.id)}
                >
                  Encerrar
                </button>
              </>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  )
}

/** O botão do bloco das ofertas, e a gaveta com o formulário. */
export function NovaOferta({
  produtos,
  sorteio,
  loja,
}: {
  produtos: ProdutoDoFormulario[]
  sorteio: string
  loja: string | null
}) {
  const [aberta, setAberta] = useState(false)
  return (
    <>
      <button
        type="button"
        className="btn btn--menor"
        data-nova-oferta
        onClick={() => setAberta(true)}
      >
        <Icone nome="mais" />
        Nova oferta
      </button>
      {aberta ? (
        <GavetaDaOferta
          produtos={produtos}
          sorteio={sorteio}
          loja={loja}
          fechar={() => setAberta(false)}
        />
      ) : null}
    </>
  )
}

function Secao({ titulo, id, children }: { titulo: string; id: string; children: ReactNode }) {
  return (
    <section className="cupom-secao" aria-labelledby={id} data-secao-oferta={id}>
      <h3 className="cupom-secao__titulo" id={id}>
        {titulo}
      </h3>
      {children}
    </section>
  )
}

function GavetaDaOferta({
  produtos,
  sorteio,
  loja,
  fechar,
}: {
  produtos: ProdutoDoFormulario[]
  sorteio: string
  loja: string | null
  fechar: () => void
}) {
  const avisar = useAvisar()
  const id = useId()
  const [f, setF] = useState<FormularioDaOferta>(() => ofertaVazia())
  // O endereço acompanha o nome até a pessoa mexer nele.
  const [enderecoMexido, setEnderecoMexido] = useState(false)
  const [erros, setErros] = useState<Record<string, string>>({})
  const [erro, setErro] = useState("")
  const [criando, comecar] = useTransition()
  const mudar = <K extends keyof FormularioDaOferta>(campo: K, valor: FormularioDaOferta[K]) =>
    setF((a) => ({ ...a, [campo]: valor }))

  function criar(ev: FormEvent) {
    ev.preventDefault()
    if (criando) return
    comecar(async () => {
      const r = await criarOferta({
        ...f,
        endereco: f.endereco || enderecoSugerido(f.nome, sorteio),
      })
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
    <p className="campo__erro" id={`oferta-${c}-erro`} role={erros[c] ? "alert" : undefined}>
      {erros[c] ?? ""}
    </p>
  )

  const campo = (
    c: "nome" | "titulo" | "chamada" | "endereco" | "de" | "ate",
    rotulo: string,
    extra: {
      tipo?: string
      largura?: string
      dica?: string
      ajuda?: string
      mudou?: (v: string) => void
    } = {}
  ) => (
    <div className={`campo ${extra.largura ?? ""}`.trim()}>
      <label htmlFor={`oferta-${c}`}>{rotulo}</label>
      <input
        id={`oferta-${c}`}
        data-campo-oferta={c}
        type={extra.tipo ?? "text"}
        autoComplete="off"
        placeholder={extra.dica}
        value={f[c]}
        aria-invalid={erros[c] ? true : undefined}
        aria-describedby={erros[c] ? `oferta-${c}-erro` : undefined}
        onChange={(e) => (extra.mudou ? extra.mudou(e.target.value) : mudar(c, e.target.value))}
      />
      {extra.ajuda ? <p className="campo__ajuda">{extra.ajuda}</p> : null}
      {erroDe(c)}
    </div>
  )

  const escolhidos = produtos.filter((p) => p.id in f.precos)
  const endereco = f.endereco || enderecoSugerido(f.nome, sorteio)
  const link = `${loja ?? ""}/oferta/${endereco}`
  const previa = escolhidos.length
    ? `Quem abrir o link ${
        f.comeco === "data" && f.de ? `de ${quando(`${f.de}:00-03:00`)} ` : "a partir de agora "
      }${f.ate ? `até ${quando(`${f.ate}:00-03:00`)}` : ""} paga: ${escolhidos
        .map((p) => {
          const por = numero(f.precos[p.id] ?? "")
          return `${p.nome} por ${por !== null ? reais(por) : "R$ ?"}${
            p.preco !== null ? ` (na loja, ${reais(p.preco)})` : ""
          }`
        })
        .join("; ")}. Quem entra pela loja paga o preço de sempre.`
    : "Escolha os produtos e o preço de cada um na oferta."

  return (
    <Gaveta titulo="Nova oferta oculta" fechar={fechar}>
      <form onSubmit={criar} noValidate data-form-oferta>
        <Secao titulo="Nome" id={`${id}-nome`}>
          <div className="campos">
            {campo("nome", "Nome da oferta", {
              dica: "Lista VIP de outubro",
              ajuda: "Só pra você achar depois: o cliente não vê.",
              mudou: (v) =>
                setF((a) => ({
                  ...a,
                  nome: v,
                  endereco: enderecoMexido ? a.endereco : enderecoSugerido(v, sorteio),
                })),
            })}
          </div>
        </Secao>

        <Secao titulo="Na página da oferta" id={`${id}-pagina`}>
          <div className="campos">
            {campo("titulo", "Título", { ajuda: "O que o cliente lê no alto da página." })}
            {campo("chamada", "Frase embaixo do título (opcional)", {
              dica: "Preço de amigo, só até domingo.",
            })}
          </div>
        </Secao>

        <Secao titulo="Produtos e preços" id={`${id}-produtos`}>
          <p className="campo__ajuda cupom-secao__sub">
            Marque os produtos e diga o preço de cada um na oferta. Tem que ser menos que o de hoje
            na loja.
          </p>
          <div className="oferta-produtos" data-produtos-da-oferta>
            {produtos.length ? (
              produtos.map((p) => {
                const marcado = p.id in f.precos
                const por = numero(f.precos[p.id] ?? "")
                const d = descontoDe(p.preco, por)
                const chave = `por:${p.id}`
                return (
                  <div className="oferta-produto" key={p.id} data-produto-oferta={p.nome}>
                    <label className="marcar">
                      <input
                        type="checkbox"
                        checked={marcado}
                        data-marcar-produto={p.nome}
                        onChange={(e) =>
                          setF((a) => {
                            const precos = { ...a.precos }
                            if (e.target.checked) precos[p.id] = ""
                            else delete precos[p.id]
                            return { ...a, precos }
                          })
                        }
                      />
                      <span>
                        {p.nome}
                        <small className="oferta-produto__hoje">
                          {p.preco !== null ? `hoje ${reais(p.preco)}` : "sem preço"}
                        </small>
                      </span>
                    </label>
                    {marcado ? (
                      <div className="oferta-produto__por">
                        <label className="sr-only" htmlFor={`oferta-${p.id}`}>
                          Preço de {p.nome} na oferta
                        </label>
                        <input
                          id={`oferta-${p.id}`}
                          inputMode="decimal"
                          autoComplete="off"
                          placeholder="Por R$"
                          data-por-produto={p.nome}
                          value={f.precos[p.id] ?? ""}
                          aria-invalid={erros[chave] ? true : undefined}
                          onChange={(e) =>
                            setF((a) => ({ ...a, precos: { ...a.precos, [p.id]: e.target.value } }))
                          }
                        />
                        {d ? <span className="oferta-produto__desconto">-{d}%</span> : null}
                      </div>
                    ) : null}
                    {erros[chave] ? (
                      <p className="campo__erro oferta-produto__erro" role="alert">
                        {erros[chave]}
                      </p>
                    ) : null}
                  </div>
                )
              })
            ) : (
              <p className="campo__ajuda">Nenhum produto publicado na loja.</p>
            )}
          </div>
          {erroDe("produtos")}
        </Secao>

        <Secao titulo="Prazo" id={`${id}-prazo`}>
          <div className="campos">
            <fieldset className="campo">
              <legend className="campo__rot">Começa</legend>
              <div className="segmento">
                {(
                  [
                    ["agora", "Agora"],
                    ["data", "Numa data"],
                  ] as const
                ).map(([valor, nome]) => (
                  <label key={valor}>
                    <input
                      type="radio"
                      name={`${id}-comeco`}
                      value={valor}
                      data-escolha-oferta={`comeco:${valor}`}
                      checked={f.comeco === valor}
                      onChange={() => mudar("comeco", valor)}
                    />
                    <span>{nome}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            {f.comeco === "data"
              ? campo("de", "Começa em", { tipo: "datetime-local", largura: "campo--3" })
              : null}
            {campo("ate", "Termina em", {
              tipo: "datetime-local",
              largura: "campo--3",
              ajuda: "Depois disso, o link diz que a oferta acabou.",
            })}
          </div>
        </Secao>

        <Secao titulo="Link" id={`${id}-link`}>
          <div className="campos">
            {campo("endereco", "Fim do link", {
              ajuda:
                "Letras sem acento, números e hífen. As 4 letras do fim deixam o link difícil de adivinhar. Com um produto, o link leva direto pra página dele; com mais de um, cada produto ganha o seu link (aparece na lista depois de criar).",
              mudou: (v) => {
                setEnderecoMexido(true)
                mudar("endereco", v)
              },
            })}
          </div>
          <div className="link-pronto" data-link-da-oferta-nova>
            <code>{link}</code>
          </div>
        </Secao>

        <p className="previa" data-previa-oferta>
          {previa}
        </p>
        <p className="pequeno suave" style={{ margin: "10px 0 0" }}>
          A página da oferta não aparece no menu, na busca nem no Google: só abre com o link. Quem
          tem o link compra quantas vezes quiser até o fim. Levando 2 ou 3, vale o menor preço entre
          a oferta e o desconto por quantidade (não soma). Cupom que não combina com outras
          promoções não desconta os produtos da oferta.
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
            {criando ? "Criando…" : "Criar oferta"}
          </button>
        </div>
      </form>
    </Gaveta>
  )
}
