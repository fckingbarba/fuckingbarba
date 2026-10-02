"use client"

import Image from "next/image"
import Link from "next/link"
import { useEffect, useRef, type MouseEvent } from "react"
import {
  Bandeira,
  Caminhao,
  Certo,
  Fechar,
  Lixeira,
  Mais,
  Raio,
  Sacola as IconeSacola,
} from "@/components/icones"
import { useSacola } from "@/components/sacola/contexto"
import { CupomDaSacola } from "@/components/sacola/cupom"
import { FreteEPrazo } from "@/components/sacola/entrega"
import { LevaJunto, useLevaJunto, useLevar } from "@/components/sacola/leva-junto"
import { useFrete, useParcelaMinima } from "@/components/configuracoes/contexto"
import type { SugestaoDaSacola } from "@/lib/carrinho-visivel"
import { faltaPraPromocao, frasesDoFrete, progressoDaPromocao } from "@/lib/configuracoes"
import { emReais } from "@/lib/formato"
import type { PromocaoDaLinha } from "@/lib/promocoes"
import { nomeCurto, type ModeloDeRecomendacao, type SugestaoEscolhida } from "@/lib/recomendacao"
import { DESTINO_DO_CHECKOUT, EM_BREVE, PARCELAS_SEM_JUROS } from "@/lib/site"

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
export function Gaveta({
  vitrine,
  modelo,
}: {
  vitrine: readonly SugestaoDaSacola[]
  /** O modelo do "Leva junto" — `null` quando o Medusa não respondeu. */
  modelo: ModeloDeRecomendacao | null
}) {
  const sacola = useSacola()
  const painel = useRef<HTMLDivElement>(null)
  const fechaRef = useRef<HTMLButtonElement>(null)

  const aberta = sacola?.aberta ?? false
  // Uma escolha do motor pra gaveta inteira: o que fecha o frete grátis vai
  // pro medidor, o resto pro "Leva junto" (0207).
  const { completa, lista } = useLevaJunto(vitrine, modelo)

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

  const { carrinho, leitura, relendo, ocupada, mexendo, erro, fechar, mudar, tirar, recarregar } =
    sacola
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
          valor. Com `data-previsto` (entrega 0252), a conta de baixo já é a
          certa — a sacola fez no clique (`contaNaHora`) — e o dinheiro fica
          firme: a escrita segue em voo, mas não há o que esperar na tela.
        */
        data-ocupada={ocupada ? "" : undefined}
        data-previsto={carrinho.previsto ? "" : undefined}
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

        <MedidorDeFrete subtotal={carrinho.subtotal} completa={completa} aoNavegar={aoNavegar} />

        {/*
          "Vazia" só quando o servidor disse que está. Antes da primeira
          resposta, ou sem resposta nenhuma, o vazio da tela é o de partida —
          e a sacola da pessoa pode estar cheia lá no Medusa (ver `leitura`).
        */}
        <div className="sacolinha__vazio" data-leitura={leitura}>
          <IconeSacola />
          {leitura === "feita" ? (
            <>
              <p className="sacolinha__vazio-titulo">Sua sacola está vazia</p>
              <p>Escolhe alguma coisa boa ali embaixo que a gente cuida do resto.</p>
              <button type="button" className="btn" onClick={fechar}>
                Ver produtos
                <Raio className="btn__bolt" />
              </button>
            </>
          ) : leitura === "falhou" ? (
            <>
              <p className="sacolinha__vazio-titulo">Não consegui abrir sua sacola</p>
              <p>
                Ela continua guardada: foi a loja que não respondeu agora. Tenta de novo em
                instantes.
              </p>
              <button type="button" className="btn" onClick={recarregar} disabled={relendo}>
                {relendo ? "Tentando…" : "Tentar de novo"}
                <Raio className="btn__bolt" />
              </button>
            </>
          ) : (
            <p className="sacolinha__vazio-titulo">Abrindo sua sacola…</p>
          )}
        </div>

        <div className="sacolinha__corpo">
          <ul className="sacolinha__lista">
            {carrinho.itens.map((item) => (
              <li
                className="sacolinha__item"
                key={item.id}
                data-mexendo={mexendo === item.id || item.chegando ? "" : undefined}
                data-chegando={item.chegando ? "" : undefined}
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
                  {item.promocao ? <RecadoDaPromocao recado={item.promocao} /> : null}

                  <span className="sacolinha__qtde">
                    {/*
                        Em quantidade 1 o "menos" removeria a linha sem
                        avisar. Virar "Remover" torna a consequência visível
                        antes do clique, em vez de depois.
                      */}
                    <button
                      type="button"
                      className="sacolinha__passo"
                      disabled={item.chegando}
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
                      disabled={item.chegando}
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
                    disabled={item.chegando}
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
          {/* O "leva junto" entre a lista e o frete, como no protótipo: primeiro
              o que mais cabe na sacola, depois quanto custa mandar. */}
          {vazia ? null : <LevaJunto escolhidos={lista} aoNavegar={aoNavegar} />}
          {vazia ? null : <FreteEPrazo />}
        </div>

        <div className="sacolinha__pe">
          {/*
            `role="status"` e não `alert`: o retorno vem de um clique que a
            pessoa deu. A região existe sempre, mesmo vazia — região viva que
            nasce junto com o texto costuma não ser anunciada.
          */}
          <CupomDaSacola />

          <p className="sacolinha__aviso" role="status" aria-live="polite">
            {erro ?? ""}
          </p>

          {/*
            SUBTOTAL E FRETE NUMA LINHA, como no protótipo — só quando o
            carrinho TEM frete ou desconto. Os números são do Medusa: o
            subtotal é o dos produtos já com desconto, e com ele subtotal +
            frete fecha com o total de baixo. Sem frete escolhido, a linha
            some e o rótulo diz "Subtotal", que é o que o número é.

            COM DESCONTO (o cupom da sacola, o "Leve X, pague Y"), a linha
            mostra os produtos ANTES dele e o desconto do lado (0207):
            produtos − desconto + frete dá o total de baixo, e quem aplicou o
            cupom vê quanto ele tirou.
          */}
          <p
            className="sacolinha__detalhe"
            hidden={carrinho.frete === null && !(carrinho.desconto > 0)}
          >
            {carrinho.desconto > 0 ? (
              <>
                <span>
                  Produtos <b>{emReais(carrinho.subtotal)}</b>
                </span>
                <span>
                  Desconto <b data-desconto="">− {emReais(carrinho.desconto)}</b>
                </span>
              </>
            ) : (
              <span>
                Subtotal <b>{emReais(carrinho.totalDosItens)}</b>
              </span>
            )}
            {carrinho.frete === null ? null : (
              <span>
                Frete{" "}
                <b data-gratis={carrinho.frete === 0 ? "" : undefined}>
                  {carrinho.frete === 0 ? "Grátis" : emReais(carrinho.frete)}
                </b>
              </span>
            )}
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
          {/* Sem "Continuar comprando" (0209, pedido do dono): quem quer
              voltar pra loja fecha no X do topo ou toca fora da sacola. */}
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
 * progresso rumo ao frete grátis, que é uma cobra mordendo o rabo. E é o
 * subtotal ANTES do cupom, que é o que o Medusa compara com o piso
 * (`somaDosProdutos`, no backend): o cupom não tira ninguém do frete grátis.
 *
 * O DESENHO DA 0207: a frase grande ("Faltam R$ 41,10 pro frete grátis"),
 * o caminhão andando na barra até a bandeira da meta, e — faltando valor — o
 * produto que SOZINHO fecha a conta, com "+ Adicionar": é o primeiro que o
 * motor de recomendação escolheu entre os que fecham (`useLevaJunto`). Um
 * toque, e o frete sai grátis. Chegou, o bloco fica verde.
 *
 * `aria-valuenow` existe porque leitor de tela lê a porcentagem, não a
 * barra: sem ele a barra é um retângulo mudo.
 */
function MedidorDeFrete({
  subtotal,
  completa,
  aoNavegar,
}: {
  subtotal: number
  completa: SugestaoEscolhida | null
  aoNavegar: (ev: MouseEvent<HTMLAnchorElement>) => void
}) {
  const politica = useFrete()
  const levar = useLevar()
  const frases = frasesDoFrete(politica)
  const falta = faltaPraPromocao(politica, subtotal)
  const porcento = progressoDaPromocao(politica, subtotal)

  /*
    Sem política de frete não há meta, e sem meta não há barra de progresso.
    Desenhar o trilho cheio "porque sim" seria pior que não desenhar: uma
    barra de progresso que já nasce completa não informa nada e ocupa o topo
    da sacola, que é onde a pessoa olha o total.
  */
  if (politica.modo === "nenhuma" || !frases || falta === null || porcento === null) return null

  const chegou = falta <= 0
  const alvo = politica.modo === "gratis" ? "frete grátis" : `frete de ${emReais(politica.preco)}`

  return (
    <div className="sacolinha__frete" data-completo={chegou ? "" : undefined}>
      <p className="sacolinha__frete-frase">
        {chegou ? (
          <>
            <Certo className="sacolinha__frete-certo" />
            {politica.modo === "gratis"
              ? "Frete grátis liberado!"
              : `Frete de ${emReais(politica.preco)} liberado!`}
          </>
        ) : (
          // Um bloco só: dentro do flex, cada pedaço da frase virava uma coluna.
          <span>
            {falta === 1 ? "Falta" : "Faltam"} <mark>{emReais(falta)}</mark> pro <b>{alvo}</b>
          </span>
        )}
      </p>

      <span
        className="sacolinha__frete-trilho"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={porcento}
        aria-label={`Progresso para ${frases.selo.toLowerCase()}`}
      >
        <span className="sacolinha__frete-barra" style={{ width: `${porcento}%` }} />
        {chegou ? null : (
          <span className="sacolinha__frete-caminhao" style={{ left: `${porcento}%` }}>
            <Caminhao />
          </span>
        )}
      </span>

      <p className="sacolinha__frete-pe">
        <span>
          {chegou
            ? politica.modo === "gratis"
              ? "O frete é por nossa conta"
              : (frases.nota ?? frases.completa)
            : `${emReais(subtotal)} na sacola`}
        </span>
        {politica.piso > 0 ? (
          <span className="sacolinha__frete-meta">
            <Bandeira />
            {emReais(politica.piso)}
          </span>
        ) : null}
      </p>

      {!chegou && completa ? (
        <div className="sacolinha__completa" data-completa={completa.varianteId}>
          <Link
            className="sacolinha__completa-foto"
            href={`/produtos/${completa.handle}`}
            onClick={aoNavegar}
            tabIndex={-1}
            aria-hidden="true"
          >
            {completa.imagem ? (
              <Image src={completa.imagem} alt="" width={68} height={68} sizes="34px" />
            ) : null}
          </Link>
          {/* Uma linha só (0209): o cartão de três linhas tomava metade da
              sacola no celular. O "completa o frete" já está dito na frase
              de cima; aqui fica o nome curto e o preço. */}
          <span className="sacolinha__completa-texto">
            <b>{nomeCurto(completa.nome)}</b> <span>{emReais(completa.preco)}</span>
          </span>
          <button
            type="button"
            className="sacolinha__completa-add"
            onClick={() => levar(completa)}
            aria-label={`Adicionar ${completa.nome} à sacola, completa o ${alvo}`}
          >
            <Mais />
            Levar
          </button>
        </div>
      ) : null}
    </div>
  )
}

/**
 * O RECADO DO "LEVE X, PAGUE Y" numa linha da sacola: a etiqueta da
 * promoção, quantas saíram de graça nesta linha (pelo ajuste do Medusa), e o
 * empurrão na última linha da promoção, quando a próxima unidade já é de
 * graça: "mais 1 sai de graça" — ou, se as próximas custam alguma coisa
 * (num "leve 3", a faixa de 2 deixa de valer na terceira), "mais 1 por
 * R$ 4,90" (`custam`, que vem pronto do servidor). Sem CSS novo: a sacola
 * mora em toda página, e a home não tem folga (o quadro do LCP, no
 * AGENTS.md).
 */
function RecadoDaPromocao({ recado }: { recado: PromocaoDaLinha }) {
  return (
    <p className="sacolinha__unitario" data-promocao-linha>
      <b>{recado.etiqueta}</b>
      {recado.gratis ? ` · ${recado.gratis} de graça` : ""}
      {recado.mais
        ? recado.custam
          ? ` · mais ${recado.mais} por ${emReais(recado.custam)}`
          : ` · mais ${recado.mais} ${recado.mais === 1 ? "sai" : "saem"} de graça`
        : ""}
    </p>
  )
}

/** Some quando a parcela fica abaixo da mínima da loja (as Configurações). */
function Parcela({ total }: { total: number }) {
  const minima = useParcelaMinima()
  const valor = total / PARCELAS_SEM_JUROS
  if (valor < minima) return null
  return (
    <span className="sacolinha__parcela">
      ou {PARCELAS_SEM_JUROS}x de {emReais(valor)}
    </span>
  )
}
