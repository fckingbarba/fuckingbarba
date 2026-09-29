import type { Metadata } from "next"
import Link from "next/link"
import { Fragment, Suspense } from "react"
import { IndiqueUmBrother } from "@/components/conta/indique"
import {
  ForaDoAr,
  LinhaDoAndamento,
  NenhumPedido,
  PraRepor,
  RepetirPedido,
  SeuTratamento,
  seSessaoAcabou,
} from "@/components/conta/pedidos"
import {
  dadosCompletos,
  EM_ANDAMENTO,
  linhasDoEndereco,
  type ClienteVisivel,
} from "@/lib/conta-visivel"
import { lerCliente } from "@/lib/conta"
import { documentoEscondido } from "@/lib/documento"
import { lerRastreios, listarPedidos, type LeituraDosPedidos } from "@/lib/pedidos-da-conta"
import type { FichaDoSite } from "@/lib/ficha"
import { lerFichaDaConta } from "@/lib/ficha-da-conta"
import { lerIndicacaoDaConta } from "@/lib/indicacao-da-conta"
import { mascararTelefone } from "@/lib/telefone"

/**
 * /conta — a visão geral.
 *
 * O que a pessoa veio fazer, na ordem em que ela vem fazer: pagar o Pix que
 * ficou pendente, ver onde está a encomenda, e repor o que acabou — o que
 * está acabando pela conta da reposição (0188), e o último pedido. Com o
 * Fator em uso, o dia do tratamento (0190). Depois dos pedidos, o indique
 * um brother (0215): o link da pessoa. Endereço e dados ficam por último,
 * pequenos — são atalhos pras telas deles.
 */
export const metadata: Metadata = {
  title: "Minha conta",
}

export default function Pagina() {
  return (
    <section aria-labelledby="t-painel">
      <div className="cabeca-tela">
        <h1 id="t-painel">Visão geral</h1>
      </div>
      <Suspense fallback={<p className="bloco">Buscando seus pedidos…</p>}>
        <Painel />
      </Suspense>
    </section>
  )
}

async function Painel() {
  const [leitura, conta, daFicha, indique] = await Promise.all([
    listarPedidos(),
    lerCliente(),
    lerFichaDaConta(),
    lerIndicacaoDaConta(),
  ])
  seSessaoAcabou(leitura.estado)
  seSessaoAcabou(conta.estado)

  return (
    <div className="painel-grade">
      <Pedidos leitura={leitura} ficha={daFicha.estado === "ok" ? daFicha.ficha : null} />
      {indique.estado === "ok" && indique.indicacao ? (
        <div className="bloco bloco--largo" data-bloco-indique>
          <p className="rotulo">Indique um brother</p>
          <IndiqueUmBrother inicial={indique.indicacao} />
        </div>
      ) : null}
      {conta.estado === "ok" ? (
        <>
          <EnderecoPrincipal cliente={conta.cliente} />
          <SeusDados cliente={conta.cliente} />
        </>
      ) : null}
    </div>
  )
}

/* ── os pedidos ───────────────────────────────────────────────────────────── */

async function Pedidos({
  leitura,
  ficha,
}: {
  leitura: LeituraDosPedidos
  ficha: FichaDoSite | null
}) {
  if (leitura.estado !== "ok") return <ForaDoAr largo />

  // O que está acabando e o tratamento: das compras da loja nova e da antiga —
  // por isso vêm antes do "nenhum pedido".
  const aviso = ficha?.reposicao ?? null
  const daFicha = (
    <>
      {aviso ? (
        <div className="bloco bloco--largo" data-bloco-reposicao>
          <p className="rotulo">Pra repor</p>
          <PraRepor aviso={aviso} />
        </div>
      ) : null}
      {ficha?.tratamento ? (
        <div className="bloco bloco--largo" data-bloco-tratamento>
          <p className="rotulo">Seu tratamento</p>
          <SeuTratamento t={ficha.tratamento} />
        </div>
      ) : null}
    </>
  )

  const { pedidos } = leitura
  if (!pedidos.length) {
    return (
      <>
        {daFicha}
        <NenhumPedido largo>
          Quando você comprar, ele aparece aqui — com rastreio e tudo.
        </NenhumPedido>
      </>
    )
  }

  // O Pix primeiro: é o único que depende da pessoa. O resto, do mais novo
  // pro mais velho, que é como a lista já vem.
  const abertos = pedidos
    .filter((p) => EM_ANDAMENTO.includes(p.situacao))
    .sort((a, b) => Number(b.situacao === "pix") - Number(a.situacao === "pix"))
  // Os que estão na rua dizem onde estão: uma pergunta por pedido a caminho.
  const naRua = await Promise.all(
    abertos
      .filter((p) => p.situacao === "enviado")
      .map(async (p) => [p.id, (await lerRastreios(p.id))[0] ?? null] as const)
  )
  const rastreioDe = new Map(naRua)
  // Comprar de novo: o último que chegou (ou está chegando) — é o que acaba. Se é o
  // mesmo pedido do "Pra repor", o botão de lá já faz isso.
  const ultimo = pedidos.find((p) => p.situacao === "entregue" || p.situacao === "enviado")
  const repetir = ultimo && ultimo.id !== aviso?.pedido ? ultimo : undefined

  return (
    <>
      {abertos.length ? (
        <div className="bloco bloco--largo" data-bloco-andamento>
          <p className="rotulo">Em andamento</p>
          <div className="andamento">
            {abertos.map((p) => (
              <LinhaDoAndamento key={p.id} p={p} rastreio={rastreioDe.get(p.id) ?? null} />
            ))}
          </div>
        </div>
      ) : null}

      {daFicha}

      {repetir ? (
        <div className="bloco bloco--largo" data-bloco-de-novo>
          <p className="rotulo">Comprar de novo</p>
          <RepetirPedido p={repetir} />
        </div>
      ) : null}

      {!abertos.length && !repetir && !aviso && !ficha?.tratamento ? (
        <div className="bloco bloco--largo">
          <p className="rotulo">Em andamento</p>
          <p className="resumo-curto">Nenhum pedido em andamento agora.</p>
        </div>
      ) : null}

      <p className="ajuda">
        <Link className="link" href="/conta/pedidos">
          Ver todos os pedidos ({pedidos.length})
        </Link>
      </p>
    </>
  )
}

/* ── os atalhos do pé ─────────────────────────────────────────────────────── */

/*
  Conta nova nasce só com o e-mail (o código não pede mais nada). Nome,
  celular e CPF vêm da primeira compra — ou daqui, e aí o checkout já abre
  preenchido. Os dois blocos dizem isso quando estão vazios.
*/

function EnderecoPrincipal({ cliente }: { cliente: ClienteVisivel }) {
  const principal = cliente.enderecos.find((e) => e.principal)
  return (
    <div className="bloco bloco--atalho" data-bloco-endereco>
      <p className="rotulo">Endereço principal</p>
      {principal ? (
        <address className="resumo-curto">
          <b>{principal.apelido || "Principal"}</b>
          {linhasDoEndereco(principal).map((linha, i) => (
            <Fragment key={i}>
              <br />
              {linha}
            </Fragment>
          ))}
        </address>
      ) : (
        <p className="resumo-curto">
          <small>
            Nenhum endereço salvo ainda. O primeiro que você usar no checkout fica guardado aqui.
          </small>
        </p>
      )}
      <Link className="link" href="/conta/enderecos">
        {principal ? "Ver endereços" : "Adicionar endereço"}
      </Link>
    </div>
  )
}

function SeusDados({ cliente }: { cliente: ClienteVisivel }) {
  const completo = dadosCompletos(cliente)
  return (
    <div className="bloco bloco--atalho" data-bloco-dados>
      <p className="rotulo">Seus dados</p>
      {completo && cliente.documento ? (
        <p className="resumo-curto">
          <b>{`${cliente.nome} ${cliente.sobrenome}`.trim()}</b>
          <br />
          {mascararTelefone(cliente.telefone)}
          <br />
          <small>{documentoEscondido(cliente.documento)}</small>
        </p>
      ) : (
        <p className="resumo-curto">
          <small>Falta nome, celular e CPF. Com eles aqui, o checkout já abre preenchido.</small>
        </p>
      )}
      <Link className="link" href="/conta/dados">
        {completo ? "Editar dados" : "Completar dados"}
      </Link>
    </div>
  )
}
