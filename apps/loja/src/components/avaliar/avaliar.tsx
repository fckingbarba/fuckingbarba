"use client"

import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useActionState, useId, useState } from "react"
import { OutroPedido } from "@/components/avaliar/outro-pedido"
import { ID_ESTRELA } from "@/components/estrelas"
import { Raio } from "@/components/icones"
import { enviarAvaliacao } from "@/lib/acoes/avaliar"
import {
  AVALIACAO_INICIO,
  FRASE_DA_NOTA,
  LIMITES,
  NOTAS,
  type EstadoDaAvaliacao,
  type PedidoParaAvaliar,
  type ProdutoParaAvaliar,
} from "@/lib/avaliar-visivel"
import { SEM_CONEXAO, semQueda } from "@/lib/rede"

/** Sem internet, a ação nem volta: a frase aparece em cima do botão, com o que foi digitado. */
const enviar = (anterior: EstadoDaAvaliacao, fd: FormData) =>
  semQueda(
    () => enviarAvaliacao(anterior, fd),
    (): EstadoDaAvaliacao => ({
      tipo: "erro",
      texto: SEM_CONEXAO,
      valores: {
        produto: String(fd.get("produto") ?? ""),
        nota: String(fd.get("nota") ?? ""),
        nome: String(fd.get("nome") ?? ""),
        texto: String(fd.get("texto") ?? ""),
      },
      rodada: (anterior.tipo === "erro" ? anterior.rodada : 0) + 1,
    })
  )

/** O produto que abre marcado: o do botão do e-mail, se ainda não tem nota; senão, o primeiro sem nota. */
function primeiroSemNota(produtos: ProdutoParaAvaliar[], pedido: string | null): string {
  const livres = produtos.filter((p) => !p.avaliado)
  return (livres.find((p) => p.id === pedido) ?? livres[0])?.id ?? ""
}

/**
 * A AVALIAÇÃO DE UM PEDIDO — o produto, as estrelas, o nome e o texto.
 *
 * O número do pedido vem do link (não se digita: é ele que diz que a
 * pessoa comprou); o nome vem sugerido ("Rafael S.") e é dela pra mudar —
 * é como aparece no site. O produto abre marcado quando o botão do e-mail
 * era de um produto.
 *
 * DEPOIS DE MANDAR, o "valeu" oferece os outros produtos do pedido. Avaliar
 * outro remonta o formulário do zero (`vez`) e relê a página, pra o "já
 * avaliado" vir do Medusa, e não de uma conta daqui.
 */
export function Avaliar({
  pedido,
  escolhido,
}: {
  pedido: PedidoParaAvaliar
  escolhido: string | null
}) {
  const router = useRouter()
  const [vez, setVez] = useState(0)
  const [pedida, setPedida] = useState(escolhido)
  const livres = pedido.produtos.filter((p) => !p.avaliado)

  if (!livres.length) {
    return (
      <section className="bloco avaliar__bloco" aria-labelledby="t-avaliar">
        <Cabeca numero={pedido.numero} titulo="Pedido avaliado" />
        <p className="avaliar__txt">
          Você já avaliou {pedido.produtos.length === 1 ? "o produto" : "todos os produtos"} deste
          pedido. Valeu por contar!
        </p>
        <Link className="btn btn--bloco" href="/">
          Voltar pra loja <Raio className="btn__bolt" />
        </Link>
        <OutroPedido />
      </section>
    )
  }

  return (
    <Formulario
      key={vez}
      pedido={pedido}
      produtoInicial={primeiroSemNota(pedido.produtos, pedida)}
      avaliarOutro={(id) => {
        setPedida(id)
        setVez((v) => v + 1)
        router.refresh()
      }}
    />
  )
}

function Cabeca({ numero, titulo }: { numero: number; titulo: string }) {
  return (
    <>
      <p className="avaliar__pedido">
        Pedido <b>#{numero}</b>
      </p>
      <h1 id="t-avaliar">{titulo}</h1>
    </>
  )
}

function Formulario({
  pedido,
  produtoInicial,
  avaliarOutro,
}: {
  pedido: PedidoParaAvaliar
  produtoInicial: string
  avaliarOutro: (id: string) => void
}) {
  const [estado, acao, enviando] = useActionState(enviar, AVALIACAO_INICIO)
  const valores = estado.tipo === "erro" ? estado.valores : null
  const [produto, setProduto] = useState(valores?.produto || produtoInicial)
  const [nota, setNota] = useState(Number(valores?.nota) || 0)
  const [sobre, setSobre] = useState(0)
  const id = useId()
  const erroDe = (campo: string) =>
    estado.tipo === "erro" && estado.campo === campo ? estado.texto : ""

  if (estado.tipo === "enviada") {
    const faltam = pedido.produtos.filter((p) => estado.faltam.includes(p.id))
    return (
      <section
        className="bloco avaliar__bloco avaliar__obrigado"
        aria-labelledby="t-avaliar"
        data-avaliacao-enviada
      >
        <span className="avaliar__ico" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <use href={`#${ID_ESTRELA}`} />
          </svg>
        </span>
        <h1 id="t-avaliar" role="status">
          Valeu{estado.nome ? `, ${estado.nome}` : ""}!
        </h1>
        <p className="avaliar__txt">
          Sua avaliação{" "}
          {estado.produto ? (
            <>
              do <b>{estado.produto}</b>{" "}
            </>
          ) : null}
          chegou. Ela aparece no site depois que a loja ler.
        </p>
        {faltam.length ? (
          <>
            <p className="avaliar__txt">
              {faltam.length === 1
                ? "Quer avaliar o outro produto do pedido?"
                : "Quer avaliar os outros produtos do pedido?"}
            </p>
            <ul className="avaliar__outros">
              {faltam.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className="avaliar__outro"
                    onClick={() => avaliarOutro(p.id)}
                    data-avaliar-outro={p.id}
                  >
                    <Foto produto={p} />
                    <span>{p.nome}</span>
                    <b>Avaliar</b>
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <Link className="btn btn--bloco" href="/">
            Voltar pra loja <Raio className="btn__bolt" />
          </Link>
        )}
      </section>
    )
  }

  const escolhido = pedido.produtos.find((p) => p.id === produto)
  const frase = FRASE_DA_NOTA[sobre || nota] ?? "Toque nas estrelas"

  return (
    <section className="bloco avaliar__bloco" aria-labelledby="t-avaliar">
      <Cabeca numero={pedido.numero} titulo="O que você achou?" />
      <p className="avaliar__txt">
        Dê as estrelas e conte como foi. A avaliação aparece no site com o nome que você escolher,
        depois que a loja ler.
      </p>

      <form
        action={acao}
        // Um envio por vez: o Enter no campo não passa pelo botão travado.
        onSubmit={(ev) => enviando && ev.preventDefault()}
        noValidate
        data-avaliar
      >
        <input type="hidden" name="produto_nome" value={escolhido?.nome ?? ""} />

        <fieldset className="avaliar__grupo" aria-describedby={`${id}-produto`}>
          <legend>Produto</legend>
          <div className="avaliar__produtos">
            {pedido.produtos.map((p) => (
              <label
                key={p.id}
                className="avaliar__produto"
                data-avaliado={p.avaliado || undefined}
              >
                <input
                  type="radio"
                  name="produto"
                  value={p.id}
                  checked={produto === p.id}
                  onChange={() => setProduto(p.id)}
                  disabled={p.avaliado}
                />
                <Foto produto={p} />
                <span className="avaliar__produto-nome">
                  {p.nome}
                  {p.avaliado ? <small>já avaliado</small> : null}
                </span>
              </label>
            ))}
          </div>
          <span className="campo__erro" id={`${id}-produto`} aria-live="polite">
            {erroDe("produto")}
          </span>
        </fieldset>

        <fieldset className="avaliar__grupo" aria-describedby={`${id}-nota`}>
          <legend>Sua nota</legend>
          <div className="avaliar__estrelas" onMouseLeave={() => setSobre(0)}>
            {NOTAS.map((n) => (
              <label
                key={n}
                className="avaliar__estrela"
                data-acesa={(sobre || nota) >= n || undefined}
                onMouseEnter={() => setSobre(n)}
              >
                <input
                  type="radio"
                  name="nota"
                  value={n}
                  checked={nota === n}
                  onChange={() => setNota(n)}
                />
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <use href={`#${ID_ESTRELA}`} />
                </svg>
                <span className="sr-only">
                  {n} {n === 1 ? "estrela" : "estrelas"}: {FRASE_DA_NOTA[n]}
                </span>
              </label>
            ))}
            <span className="avaliar__frase" aria-hidden="true">
              {frase}
            </span>
          </div>
          <span className="campo__erro" id={`${id}-nota`} aria-live="polite">
            {erroDe("nota")}
          </span>
        </fieldset>

        <div className="campos avaliar__campos">
          <div className="campo">
            <label htmlFor={`${id}-nome`}>
              Seu nome <small>(é assim que aparece no site)</small>
            </label>
            <input
              id={`${id}-nome`}
              name="nome"
              type="text"
              autoComplete="given-name"
              key={`nome-${estado.tipo === "erro" ? estado.rodada : 0}`}
              defaultValue={valores ? valores.nome : pedido.nome}
              maxLength={LIMITES.nome.max}
              aria-invalid={Boolean(erroDe("nome")) || undefined}
              aria-describedby={`${id}-erro-nome`}
              required
            />
            <span className="campo__erro" id={`${id}-erro-nome`} aria-live="polite">
              {erroDe("nome")}
            </span>
          </div>
          <div className="campo">
            <label htmlFor={`${id}-texto`}>Sua avaliação</label>
            <textarea
              id={`${id}-texto`}
              name="texto"
              rows={5}
              key={`texto-${estado.tipo === "erro" ? estado.rodada : 0}`}
              defaultValue={valores?.texto ?? ""}
              maxLength={LIMITES.texto.max}
              placeholder="Como foi usar? O que mudou? Pra quem você indicaria?"
              aria-invalid={Boolean(erroDe("texto")) || undefined}
              aria-describedby={`${id}-erro-texto`}
              required
            />
            <span className="campo__erro" id={`${id}-erro-texto`} aria-live="polite">
              {erroDe("texto")}
            </span>
          </div>
        </div>

        {estado.tipo === "erro" && !estado.campo ? (
          <p className="avaliar__recado" role="alert">
            {estado.texto}
          </p>
        ) : null}

        <button type="submit" className="btn btn--bloco" disabled={enviando} aria-busy={enviando}>
          {enviando ? (
            <>
              <span className="giro" aria-hidden="true" /> Enviando…
            </>
          ) : (
            <>
              Enviar avaliação <Raio className="btn__bolt" />
            </>
          )}
        </button>
      </form>
      <OutroPedido />
    </section>
  )
}

function Foto({ produto }: { produto: ProdutoParaAvaliar }) {
  return produto.imagem ? (
    <Image className="avaliar__foto" src={produto.imagem} alt="" width={56} height={56} />
  ) : (
    <span className="avaliar__foto" aria-hidden="true" />
  )
}
