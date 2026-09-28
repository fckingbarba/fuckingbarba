"use client"

import { useOptimistic, useState, useTransition } from "react"
import { useAvisar } from "@/components/avisos"
import { Icone } from "@/components/icones"
import { mandarTesteDoFluxo, mudarOsFluxos } from "@/lib/acoes/crm"
import type { IdDoFluxo, TelaDosFluxos } from "@/lib/crm"

/**
 * A ABA FLUXOS DO CRM — cada fluxo com a chave de ligar, o que vendeu, e os
 * toques (quando sai, quantos saíram, o "Mandar pra mim" de cada um). A chave
 * troca na hora e o aviso de baixo confirma.
 */

const QUEM_ENTRA: Record<IdDoFluxo, string> = {
  pix: "Gerou o Pix e não pagou.",
  checkout: "Digitou o e-mail no checkout e não pagou.",
  carrinho: "Pôs na sacola e não foi pro checkout — e a loja sabe quem é.",
  reposicao:
    "Comprou, e o produto está pra acabar, pela conta dos dias dos Ajustes: 7 e 2 dias antes, 3 e 10 dias depois, com o “Refazer o pedido”. Todo cliente, da loja nova e da antiga, sem cupom. Começa desligado: ligue depois da estreia, em 3/10.",
  jornada:
    "O pedido chegou (pelo aviso da Frenet, ou 10 dias depois de pago). O modo de uso quando chega, o “Como tá indo?” em 7 dias (só “Tá indo bem” e “Tenho uma dúvida”), a rotina completa em 21, e o Fator em 3 e 60 dias. Começa desligado.",
  "boas-vindas":
    "Se cadastrou no pop-up da 1ª compra. Depois do cupom, os e-mails da trilha do que a pessoa via: crescer a barba, cuidar da barba, cabelo — ou, sem produto, “Barba ou cabelo?”. Desligado, o pop-up some da loja.",
  estreia:
    "Aceitou ofertas na loja antiga (a base da Nuvemshop) e ainda não comprou na nova. Um e-mail da loja nova pra cada um, e o “vence amanhã” pra quem ganhou cupom. Começa desligado: ligue depois de pôr a Nuvemshop em manutenção.",
}

const inteiro = new Intl.NumberFormat("pt-BR")
const reais = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
const porCento = (parte: number, todo: number) => (todo ? Math.round((parte / todo) * 100) : 0)

type Fluxo = TelaDosFluxos["fluxos"][number]

export function FluxosDoCrm({ tela }: { tela: TelaDosFluxos }) {
  const avisar = useAvisar()
  const [indo, comecar] = useTransition()
  const [fluxos, aplicar] = useOptimistic(
    tela.fluxos,
    (lista: Fluxo[], { id, ligado }: { id: IdDoFluxo; ligado: boolean }) =>
      lista.map((f) => (f.id === id ? { ...f, ligado } : f))
  )

  function mudar(f: Fluxo) {
    const ligado = !f.ligado
    comecar(async () => {
      aplicar({ id: f.id, ligado })
      avisar(await mudarOsFluxos({ fluxo: f.id, ligado }))
    })
  }

  return (
    <div className="fluxos" aria-busy={indo || undefined}>
      {fluxos.map((f) => (
        <section
          className="bloco fluxo"
          key={f.id}
          data-fluxo={f.id}
          aria-labelledby={`fluxo-${f.id}`}
        >
          <div className="fluxo__topo">
            <div>
              <h2 className="bloco__titulo" id={`fluxo-${f.id}`}>
                {f.nome}
              </h2>
              <p className="fluxo__quem">{QUEM_ENTRA[f.id]}</p>
            </div>
            <div className="fluxo__chave">
              <span className="status" data-s={f.ligado ? "entregue" : "cancelado"} data-situacao>
                {f.ligado ? (f.desde ? `Ligado desde ${f.desde}` : "Ligado") : "Desligado"}
              </span>
              <button
                type="button"
                className="chave"
                role="switch"
                aria-checked={f.ligado}
                aria-label={`${f.nome} ligado`}
                data-ligar={f.id}
                onClick={() => mudar(f)}
              />
            </div>
          </div>
          <NumerosDoFluxo f={f} dias={tela.dias} />
          {f.publico ? <PublicoDaEstreia p={f.publico} /> : null}
          <ol className="fluxo__toques">
            {f.toques.map((t) => (
              <Toque key={t.id} toque={t} />
            ))}
          </ol>
        </section>
      ))}
    </div>
  )
}

function NumerosDoFluxo({ f, dias }: { f: Fluxo; dias: number }) {
  const n = f.numeros
  return (
    <div className="numeros numeros--fluxo" data-numeros-do-fluxo>
      <div className="numero">
        <p className="numero__rot">Receberam</p>
        <p className="numero__valor num" data-numero="pessoas">
          {inteiro.format(n.pessoas)}
        </p>
        <p className="numero__sub">
          {inteiro.format(n.enviados)} e-mails em {dias} dias
        </p>
      </div>
      <div className="numero numero--destaque">
        <p className="numero__rot">Compraram</p>
        <p className="numero__valor num" data-numero="compraram">
          {inteiro.format(n.compraram)}
        </p>
        <p className="numero__sub">
          {n.pessoas ? `${porCento(n.compraram, n.pessoas)}% em até 7 dias` : "em até 7 dias"}
        </p>
      </div>
      <div className="numero">
        <p className="numero__rot">Vendido</p>
        <p className="numero__valor num" data-numero="vendido">
          {reais.format(n.vendido)}
        </p>
        <p className="numero__sub">o 1º pedido de cada um</p>
      </div>
      <div className="numero">
        <p className="numero__rot">Cupons</p>
        <p className="numero__valor num" data-numero="cupons">
          {inteiro.format(n.cuponsUsados)}
          <small> de {inteiro.format(n.cupons)}</small>
        </p>
        <p className="numero__sub">usados</p>
      </div>
      {/* As boas-vindas não têm controle: o cupom foi a pessoa que pediu. */}
      {f.id === "boas-vindas" ? null : (
        <div
          className="numero numero--controle"
          title="Os 5% que não recebem: é como se sabe o que o fluxo vende a mais"
        >
          <p className="numero__rot">Sem e-mail</p>
          <p className="numero__valor num" data-numero="controle">
            {n.controle.pessoas ? `${porCento(n.controle.compraram, n.controle.pessoas)}%` : "—"}
          </p>
          <p className="numero__sub">
            {n.controle.pessoas
              ? `${inteiro.format(n.controle.compraram)} de ${inteiro.format(n.controle.pessoas)} compraram`
              : "o controle ainda está vazio"}
          </p>
        </div>
      )}
    </div>
  )
}

/** QUEM ENTRA NA ESTREIA — os 4 jeitos do e-mail e quantos saem em cada dia. */
function PublicoDaEstreia({ p }: { p: NonNullable<Fluxo["publico"]> }) {
  const jeitos = [
    { nome: "Na hora de repor", n: p.repor, cupom: false },
    { nome: "No tratamento", n: p.cliente, cupom: false },
    { nome: "Sumiram", n: p.sumido, cupom: true },
    { nome: "Nunca compraram", n: p.lead, cupom: true },
  ]
  const dias = p.lotes.filter((n) => n > 0)
  return (
    <div className="estreia" data-publico-da-estreia>
      <div className="estreia__jeitos">
        {jeitos.map((j) => (
          <div className="estreia__jeito" key={j.nome} data-jeito={j.nome}>
            <b className="num">{inteiro.format(j.n)}</b>
            <span>
              {j.nome}
              {j.cupom ? (
                <span className="fluxo__cupom" title="Ganham cupom">
                  <Icone nome="cupons" /> cupom
                </span>
              ) : null}
            </span>
          </div>
        ))}
      </div>
      <p className="estreia__lotes" data-lotes>
        {inteiro.format(p.pessoas)} {p.pessoas === 1 ? "pessoa" : "pessoas"}
        {dias.length > 1
          ? ` em ${dias.length} dias: ${dias.map((n) => inteiro.format(n)).join(" · ")}`
          : ""}
        . O 1º dia sai quando você liga; os outros, às 10h.
        {p.jaCompraram
          ? ` ${inteiro.format(p.jaCompraram)} já ${p.jaCompraram === 1 ? "comprou" : "compraram"} na loja nova e ${p.jaCompraram === 1 ? "fica" : "ficam"} de fora.`
          : ""}
      </p>
    </div>
  )
}

function Toque({ toque }: { toque: Fluxo["toques"][number] }) {
  const avisar = useAvisar()
  const [mandando, setMandando] = useState(false)
  async function mandar() {
    setMandando(true)
    try {
      avisar(await mandarTesteDoFluxo(toque.id, toque.nome))
    } catch {
      avisar({ ok: false, texto: "A conexão caiu. Confere a internet e tenta de novo." })
    } finally {
      setMandando(false)
    }
  }
  return (
    <li className="fluxo__toque" data-toque={toque.id}>
      <span className="fluxo__quando">{toque.quando}</span>
      <span className="fluxo__nome">
        {toque.nome}
        {toque.cupom ? (
          <span className="fluxo__cupom" title="Este e-mail dá o cupom">
            <Icone nome="cupons" /> cupom
          </span>
        ) : null}
      </span>
      <span className="fluxo__enviados num" data-enviados>
        {inteiro.format(toque.enviados)}
      </span>
      <button
        type="button"
        className="btn btn--contorno btn--menor"
        disabled={mandando}
        aria-busy={mandando}
        onClick={() => void mandar()}
        data-mandar-pra-mim
      >
        {mandando ? "Mandando…" : "Mandar pra mim"}
      </button>
    </li>
  )
}

/** O DESCONTO DO CUPOM — o % do e-mail de 1 dia depois, pros dois fluxos. */
export function DescontoDosFluxos({
  desconto,
  limites,
}: {
  desconto: number
  limites: [number, number]
}) {
  const avisar = useAvisar()
  const [valor, setValor] = useState(String(desconto))
  const [salvando, comecar] = useTransition()
  return (
    <section className="bloco" aria-labelledby="fluxos-desconto" data-desconto-dos-fluxos>
      <h2 className="bloco__titulo" id="fluxos-desconto">
        O desconto do cupom
      </h2>
      <p className="bloco__sub">
        Vai no e-mail de 1 dia depois, no cupom da 1ª compra (o do pop-up) e na estreia (pra quem
        sumiu e quem nunca comprou): um cupom só da pessoa, de uso único, que vence em 2 dias (3 no
        carrinho abandonado, na 1ª compra e na estreia). No máximo um a cada 60 dias pro mesmo
        e-mail (o da 1ª compra, um por e-mail), e ele soma com o preço promocional.
      </p>
      <form
        className="fluxo__desconto"
        onSubmit={(e) => {
          e.preventDefault()
          comecar(async () => avisar(await mudarOsFluxos({ desconto: valor })))
        }}
      >
        <label className="campo fluxo__campo">
          <span className="campo__rot">Desconto (%)</span>
          <input
            type="number"
            inputMode="numeric"
            min={limites[0]}
            max={limites[1]}
            step={1}
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            data-desconto
          />
        </label>
        <button type="submit" className="btn btn--menor" disabled={salvando} data-salvar-desconto>
          {salvando ? "Salvando…" : "Salvar"}
        </button>
      </form>
    </section>
  )
}
