"use client"

import Image from "next/image"
import Link from "next/link"
import { useEffect, useRef, type MouseEvent } from "react"
import { Fechar, Lixeira, Mais, Raio, Sacola as IconeSacola } from "@/components/icones"
import { useSacola } from "@/components/sacola/contexto"
import { FreteEPrazo } from "@/components/sacola/entrega"
import { useFrete } from "@/components/configuracoes/contexto"
import { faltaPraPromocao, frasesDoFrete, progressoDaPromocao } from "@/lib/configuracoes"
import { emReais } from "@/lib/formato"
import { DESTINO_DO_CHECKOUT, EM_BREVE, PARCELA_MINIMA, PARCELAS_SEM_JUROS } from "@/lib/site"

/**
 * A GAVETA DA SACOLA
 *
 * Entra pela direita, que é de onde o cliente espera que o carrinho venha.
 * Véu escuro atrás, foco preso dentro, Esc fecha.
 *
 * TUDO QUE ELA MOSTRA VEIO DO MEDUSA. Ela não soma, não multiplica e não
 * aplica desconto: cada número aqui é o que a última ação devolveu. É a
 * mesma regra da dobra, e pelo mesmo motivo — o dia em que a gaveta fizer a
 * própria conta, ela vai discordar do checkout em alguma promoção, e quem
 * descobre é o cliente na hora de pagar.
 *
 * `inert` enquanto fechada é o detalhe que quase todo mundo esquece: sem
 * ele, a gaveta continua no Tab escondida fora da tela, e quem navega por
 * teclado passeia por dez botões invisíveis antes de chegar no conteúdo.
 */
export function Gaveta() {
  const sacola = useSacola()
  const painel = useRef<HTMLDivElement>(null)
  const fechaRef = useRef<HTMLButtonElement>(null)

  const aberta = sacola?.aberta ?? false

  // Ao abrir, o foco vai pro botão de fechar: é a saída, e é o lugar de onde
  // o Tab percorre a gaveta na ordem em que ela é lida.
  useEffect(() => {
    if (aberta) fechaRef.current?.focus()
  }, [aberta])

  // Foco preso: Tab no último volta pro primeiro. Sem isso o foco escapa
  // pro fundo, que está inerte — e aí o teclado simplesmente some.
  useEffect(() => {
    if (!aberta) return
    function aoTeclar(e: KeyboardEvent) {
      if (e.key !== "Tab" || !painel.current) return
      const focaveis = painel.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
      const primeiro = focaveis[0]
      const ultimo = focaveis[focaveis.length - 1]
      if (!primeiro || !ultimo) return
      if (e.shiftKey && document.activeElement === primeiro) {
        e.preventDefault()
        ultimo.focus()
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault()
        primeiro.focus()
      }
    }
    window.addEventListener("keydown", aoTeclar)
    return () => window.removeEventListener("keydown", aoTeclar)
  }, [aberta])

  if (!sacola) return null

  const { carrinho, ocupada, mexendo, erro, fechar, mudar, tirar } = sacola
  const vazia = carrinho.itens.length === 0

  /*
   * LINK DE DENTRO DA GAVETA FECHA A GAVETA. Ela mora no layout, que não
   * desmonta entre uma página e outra: sem isto, "Finalizar compra" abria o
   * checkout com a gaveta ainda por cima, e o véu dela engolia o primeiro
   * clique no formulário. Fecha já no clique — esperar a navegação terminar
   * deixaria a gaveta um instante em cima da página que está chegando.
   *
   * Com Ctrl/⌘/Shift ou o botão do meio, o link abre noutra aba e esta
   * página fica onde está; a gaveta também.
   */
  function aoNavegar(ev: MouseEvent<HTMLAnchorElement>) {
    if (ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return
    fechar()
  }

  return (
    <>
      <div className="sacolinha__veu" onClick={fechar} aria-hidden="true" />

      {/*
        <div> e não <aside>: `aside` já tem papel de "conteúdo
        complementar", e o ARIA não deixa trocar esse papel por dialog.

        `data-vazio` é o que troca os dois estados, e quem faz a troca é o
        CSS do protótipo — não um `vazia ? ... : null` espalhado pelo JSX.
        Os dois blocos existem sempre no HTML e o seletor `[data-vazio]`
        decide qual aparece; assim a marcação e a folha não têm como
        discordar sobre o que está na tela.
      */}
      <div
        className="sacolinha"
        id="carrinho-gaveta"
        ref={painel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="carrinho-titulo"
        inert={!aberta}
        data-vazio={vazia ? "" : undefined}
        /*
          `data-ocupada` é o que esmaece o dinheiro enquanto o Medusa
          recalcula, e `aria-busy` conta a mesma coisa pra quem não vê a
          tela. Quantidade já mudou; o que está "carregando" aqui é só o
          valor.
        */
        data-ocupada={ocupada ? "" : undefined}
        aria-busy={ocupada || undefined}
      >
        <div className="sacolinha__topo">
          <h2 className="sacolinha__titulo" id="carrinho-titulo">
            <IconeSacola />
            Sua sacola
            <span className="sacolinha__qtd">{carrinho.unidades}</span>
          </h2>
          <button
            type="button"
            className="sacolinha__fecha"
            ref={fechaRef}
            onClick={fechar}
            aria-label="Fechar a sacola"
          >
            <Fechar />
          </button>
        </div>

        <MedidorDeFrete subtotal={carrinho.subtotal} />

        <div className="sacolinha__vazio">
          <IconeSacola />
          <p className="sacolinha__vazio-titulo">Sua sacola está vazia</p>
          <p>Escolhe alguma coisa boa ali embaixo que a gente cuida do resto.</p>
          <button type="button" className="btn" onClick={fechar}>
            Ver produtos
            <Raio className="btn__bolt" />
          </button>
        </div>

        <div className="sacolinha__corpo">
          <ul className="sacolinha__lista">
            {carrinho.itens.map((item) => (
              <li
                className="sacolinha__item"
                key={item.id}
                data-mexendo={mexendo === item.id ? "" : undefined}
              >
                {item.imagem ? (
                  <Link
                    className="sacolinha__foto"
                    href={item.handle ? `/produtos/${item.handle}` : EM_BREVE}
                    onClick={aoNavegar}
                    tabIndex={-1}
                    aria-hidden="true"
                  >
                    <Image src={item.imagem} alt="" width={72} height={72} />
                  </Link>
                ) : null}

                <div>
                  <h3 className="sacolinha__nome">
                    <Link
                      href={item.handle ? `/produtos/${item.handle}` : EM_BREVE}
                      onClick={aoNavegar}
                    >
                      {item.nome}
                    </Link>
                  </h3>
                  {item.variante ? <p className="sacolinha__unitario">{item.variante}</p> : null}
                  <p className="sacolinha__unitario">{emReais(item.precoUnitario)} cada</p>

                  <span className="sacolinha__qtde">
                    {/*
                        Em quantidade 1 o "menos" removeria a linha sem
                        avisar. Virar "Remover" torna a consequência visível
                        antes do clique, em vez de depois.
                      */}
                    <button
                      type="button"
                      className="sacolinha__passo"
                      disabled={ocupada}
                      onClick={() =>
                        item.quantidade <= 1 ? tirar(item.id) : mudar(item.id, item.quantidade - 1)
                      }
                      aria-label={
                        item.quantidade <= 1
                          ? `Remover ${item.nome} da sacola`
                          : `Diminuir a quantidade de ${item.nome}`
                      }
                      data-lixeira={item.quantidade <= 1 ? "" : undefined}
                    >
                      {item.quantidade <= 1 ? <Lixeira /> : "−"}
                    </button>
                    <span className="sacolinha__numero" aria-hidden="true">
                      {item.quantidade}
                    </span>
                    <button
                      type="button"
                      className="sacolinha__passo"
                      disabled={ocupada}
                      onClick={() => mudar(item.id, item.quantidade + 1)}
                      aria-label={`Aumentar a quantidade de ${item.nome}`}
                    >
                      <Mais />
                    </button>
                  </span>

                  <span className="sr-only">
                    {item.nome}, quantidade {item.quantidade}, subtotal {emReais(item.total)}
                  </span>
                </div>

                <div className="sacolinha__direita">
                  <span className="sacolinha__parcial">{emReais(item.total)}</span>
                  <button
                    type="button"
                    className="sacolinha__tira"
                    disabled={ocupada}
                    onClick={() => tirar(item.id)}
                    aria-label={`Remover ${item.nome} da sacola`}
                  >
                    Remover
                  </button>
                </div>
              </li>
            ))}
          </ul>

          {/*
            FRETE E PRAZO, no desenho do protótipo — e DENTRO do corpo que
            rola, como lá: só o topo e o pé ficam presos, pra ninguém perder
            o "Finalizar compra" de vista numa sacola comprida.

            Convive com a barrinha lá de cima: ela é o empurrão ("faltam
            R$ 50 pro frete grátis"); este bloco é a resposta — quanto custa,
            em quantos dias chega, e qual das entregas vai no pedido.
          */}
          {vazia ? null : <FreteEPrazo />}
        </div>

        <div className="sacolinha__pe">
          {/*
            `role="status"` e não `alert`: o retorno vem de um clique que a
            pessoa deu. A região existe sempre, mesmo vazia — região viva que
            nasce junto com o texto costuma não ser anunciada.
          */}
          <p className="sacolinha__aviso" role="status" aria-live="polite">
            {erro ?? ""}
          </p>

          {/*
            SUBTOTAL E FRETE NUMA LINHA, como no protótipo — só quando o
            carrinho TEM frete. Os três números são do Medusa: o subtotal é o
            dos produtos já com desconto, e com ele subtotal + frete fecha
            com o total de baixo. Sem frete escolhido, a linha some e o
            rótulo diz "Subtotal", que é o que o número é.
          */}
          <p className="sacolinha__detalhe" hidden={carrinho.frete === null}>
            <span>
              Subtotal <b>{emReais(carrinho.totalDosItens)}</b>
            </span>
            <span>
              Frete{" "}
              <b data-gratis={carrinho.frete === 0 ? "" : undefined}>
                {carrinho.frete === 0 ? "Grátis" : emReais(carrinho.frete ?? 0)}
              </b>
            </span>
          </p>

          <p className="sacolinha__soma">
            <span className="sacolinha__soma-esq">
              <span className="sacolinha__soma-rotulo">
                {carrinho.frete === null ? "Subtotal" : "Total"}
              </span>
              <Parcela total={carrinho.total} />
            </span>
            <span className="sacolinha__soma-valor">{emReais(carrinho.total)}</span>
          </p>

          {/*
            Pro /checkout, que cobra de verdade (Pix ou cartão, pelo
            Pagar.me). Com `CHECKOUT_ABERTO` em `false`, este botão volta pro
            /em-breve — ver `lib/site.ts`.
          */}
          <Link
            href={DESTINO_DO_CHECKOUT}
            className="btn btn--bloco sacolinha__finalizar"
            onClick={aoNavegar}
          >
            Finalizar compra
            <Raio className="btn__bolt" />
          </Link>

          <button type="button" className="sacolinha__continuar" onClick={fechar}>
            Continuar comprando
          </button>
        </div>
      </div>
    </>
  )
}

/**
 * O MEDIDOR DE FRETE GRÁTIS
 *
 * O número que ele persegue é o mesmo do resto do site (`site.ts`), e o
 * progresso é medido contra o SUBTOTAL — o valor das mercadorias —, não
 * contra o total. Medir contra o total contaria o próprio frete como
 * progresso rumo ao frete grátis, que é uma cobra mordendo o rabo.
 *
 * `aria-valuenow` existe porque leitor de tela lê a porcentagem, não a
 * barra: sem ele a barra é um retângulo mudo.
 */
function MedidorDeFrete({ subtotal }: { subtotal: number }) {
  const politica = useFrete()
  const frases = frasesDoFrete(politica)
  const falta = faltaPraPromocao(politica, subtotal)
  const porcento = progressoDaPromocao(politica, subtotal)

  /*
    Sem política de frete não há meta, e sem meta não há barra de progresso.
    Desenhar o trilho cheio "porque sim" seria pior que não desenhar: uma
    barra de progresso que já nasce completa não informa nada e ocupa o topo
    da sacola, que é onde a pessoa olha o total.
  */
  if (!frases || falta === null || porcento === null) return null

  const chegou = falta <= 0

  return (
    <div className="sacolinha__frete">
      <div className="sacolinha__frete-topo">
        <p className="sacolinha__frete-rotulo">
          <Raio />
          {frases.selo}
        </p>
        <p className="sacolinha__frete-texto">
          {chegou
            ? politica.modo === "gratis"
              ? "Conseguiu — é por nossa conta"
              : "Conseguiu"
            : `Faltam ${emReais(falta)}`}
        </p>
      </div>

      <span
        className="sacolinha__frete-trilho"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={porcento}
        aria-label={`Progresso para ${frases.selo.toLowerCase()}`}
      >
        <span className="sacolinha__frete-barra" style={{ width: `${porcento}%` }} />
        <Raio className="sacolinha__frete-raio" style={{ left: `${porcento}%` }} />
      </span>
    </div>
  )
}

/** Some quando a parcela fica pequena demais pra operadora aceitar. */
function Parcela({ total }: { total: number }) {
  const valor = total / PARCELAS_SEM_JUROS
  if (valor < PARCELA_MINIMA) return null
  return (
    <span className="sacolinha__parcela">
      ou {PARCELAS_SEM_JUROS}x de {emReais(valor)}
    </span>
  )
}
