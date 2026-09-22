import type { Metadata } from "next"
import Link from "next/link"
import { Fragment, Suspense } from "react"
import {
  ForaDoAr,
  LinhaDoAndamento,
  NenhumPedido,
  RepetirPedido,
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
import { mascararTelefone } from "@/lib/telefone"

/**
 * /conta — a visão geral.
 *
 * O que a pessoa veio fazer, na ordem em que ela vem fazer: pagar o Pix que
 * ficou pendente, ver onde está a encomenda, e repor o que acabou. Endereço
 * e dados ficam por último, pequenos — são atalhos pras telas deles.
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
  const [leitura, conta] = await Promise.all([listarPedidos(), lerCliente()])
  seSessaoAcabou(leitura.estado)
  seSessaoAcabou(conta.estado)

  return (
    <div className="painel-grade">
      <Pedidos leitura={leitura} />
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

async function Pedidos({ leitura }: { leitura: LeituraDosPedidos }) {
  if (leitura.estado !== "ok") return <ForaDoAr largo />

  const { pedidos } = leitura
  if (!pedidos.length) {
    return (
      <NenhumPedido largo>
        Quando você comprar, ele aparece aqui — com rastreio e tudo.
      </NenhumPedido>
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
  // Comprar de novo: o último que chegou (ou está chegando) — é o que acaba.
  const repetir = pedidos.find((p) => p.situacao === "entregue" || p.situacao === "enviado")

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

      {repetir ? (
        <div className="bloco bloco--largo" data-bloco-de-novo>
          <p className="rotulo">Comprar de novo</p>
          <RepetirPedido p={repetir} />
        </div>
      ) : null}

      {!abertos.length && !repetir ? (
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
