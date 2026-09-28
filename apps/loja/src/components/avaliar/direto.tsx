"use client"

import Image from "next/image"
import Link from "next/link"
import { useActionState, useId, useState } from "react"
import { EscolhaDaNota } from "@/components/avaliar/nota"
import { Campo } from "@/components/checkout/campo"
import { ID_ESTRELA } from "@/components/estrelas"
import { Raio } from "@/components/icones"
import { enviarAvaliacaoDireta } from "@/lib/acoes/avaliar"
import {
  DIRETO_INICIO,
  LIMITES,
  type CampoDireto,
  type EstadoDireto,
  type ProdutoDaLoja,
  type ValoresDiretos,
} from "@/lib/avaliar-visivel"
import { SEM_CONEXAO, semQueda } from "@/lib/rede"

/** Sem internet, a ação nem volta: a frase aparece em cima do botão, com o que foi digitado. */
const enviar = (anterior: EstadoDireto, fd: FormData) =>
  semQueda(
    () => enviarAvaliacaoDireta(anterior, fd),
    (): EstadoDireto => ({
      tipo: "erro",
      texto: SEM_CONEXAO,
      valores: {
        numero: String(fd.get("numero") ?? ""),
        email: String(fd.get("email") ?? ""),
        nome: String(fd.get("nome") ?? ""),
        produto: String(fd.get("produto") ?? ""),
        nota: String(fd.get("nota") ?? ""),
        texto: String(fd.get("texto") ?? ""),
      },
      rodada: (anterior.tipo === "erro" ? anterior.rodada : 0) + 1,
    })
  )

const VAZIO: ValoresDiretos = { numero: "", email: "", nome: "", produto: "", nota: "", texto: "" }

/**
 * A AVALIAÇÃO SEM O LINK — a página `/avaliar` aberta direto, sem o botão do
 * e-mail (o endereço que a loja manda pelo WhatsApp, pra quem comprou aqui
 * ou na loja antiga): o número do pedido, o e-mail da compra, o nome, o
 * produto, as estrelas e o texto, num envio só.
 *
 * O PRODUTO SAI DA LISTA DA LOJA INTEIRA: a página não sabe o que veio no
 * pedido, e não deve saber — quem sabe o número e o e-mail de alguém não lê
 * a compra dele aqui. O Medusa confere no envio (o pedido, e se o produto
 * veio nele ou num kit dele) e só diz se entrou ou por que não.
 *
 * DEPOIS DE MANDAR, "avaliar outro produto" volta com o pedido, o e-mail e o
 * nome preenchidos: quem comprou três coisas não digita tudo três vezes.
 */
export function AvaliarDireto({
  produtos,
  escolhido,
  recado,
}: {
  produtos: ProdutoDaLoja[]
  /** O produto que abre marcado (o `?produto=` do endereço), se é da loja. */
  escolhido: string | null
  /** Uma frase em cima do formulário: o link do e-mail que não abriu. */
  recado?: string
}) {
  const [vez, setVez] = useState(0)
  const [guardados, setGuardados] = useState<ValoresDiretos>({ ...VAZIO, produto: escolhido ?? "" })
  return (
    <Formulario
      key={vez}
      produtos={produtos}
      inicio={guardados}
      recado={vez ? undefined : recado}
      avaliarOutro={(v) => {
        setGuardados({ ...VAZIO, numero: v.numero, email: v.email, nome: v.nome })
        setVez((n) => n + 1)
      }}
    />
  )
}

function Formulario({
  produtos,
  inicio,
  recado,
  avaliarOutro,
}: {
  produtos: ProdutoDaLoja[]
  inicio: ValoresDiretos
  recado?: string
  avaliarOutro: (v: ValoresDiretos) => void
}) {
  const [estado, acao, enviando] = useActionState(enviar, DIRETO_INICIO)

  if (estado.tipo === "enviada") {
    const produto = produtos.find((p) => p.id === estado.valores.produto)
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
          {produto ? (
            <>
              do <b>{produto.nome}</b>{" "}
            </>
          ) : null}
          chegou. Ela aparece no site depois que a loja ler.
        </p>
        <button
          type="button"
          className="btn btn--bloco"
          onClick={() => avaliarOutro(estado.valores)}
          data-avaliar-outro-produto
        >
          Avaliar outro produto <Raio className="btn__bolt" />
        </button>
        <p className="avaliar__trocar">
          <Link className="link" href="/">
            Voltar pra loja
          </Link>
        </p>
      </section>
    )
  }

  const erro = estado.tipo === "erro" ? estado : null
  const erroDe = (campo: CampoDireto) => (erro?.campo === campo ? erro.texto : "")

  return (
    <section className="bloco avaliar__bloco" aria-labelledby="t-avaliar">
      <h1 id="t-avaliar">Avaliar um produto</h1>
      <p className="avaliar__txt">
        O pedido e o e-mail só conferem a compra. No site aparecem o nome, as estrelas e o texto,
        depois que a loja ler.
      </p>
      {recado && !erro ? (
        <p className="avaliar__recado" role="status">
          {recado}
        </p>
      ) : null}

      <form
        action={acao}
        // Um envio por vez: o Enter no campo não passa pelo botão travado.
        onSubmit={(ev) => enviando && ev.preventDefault()}
        noValidate
        data-avaliar-direto
      >
        {/* Refeitos a cada resposta (`rodada`): o React esvazia o formulário
            depois da ação, e eles voltam com o que estava digitado. */}
        <Campos
          key={erro?.rodada ?? 0}
          produtos={produtos}
          valores={erro?.valores ?? inicio}
          erroDe={erroDe}
        />

        {erro && !erro.campo ? (
          <p className="avaliar__recado" role="alert">
            {erro.texto}
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
    </section>
  )
}

function Campos({
  produtos,
  valores,
  erroDe,
}: {
  produtos: ProdutoDaLoja[]
  valores: ValoresDiretos
  erroDe: (campo: CampoDireto) => string
}) {
  const id = useId()
  const [produto, setProduto] = useState(
    produtos.some((p) => p.id === valores.produto) ? valores.produto : ""
  )
  const [nota, setNota] = useState(Number(valores.nota) || 0)
  const escolhido = produtos.find((p) => p.id === produto)

  return (
    <>
      <div className="campos avaliar__campos">
        <Campo
          rotulo="Número do pedido"
          nota="(está no e-mail da compra)"
          nome="numero"
          inputMode="numeric"
          autoComplete="off"
          placeholder="#1234"
          defaultValue={valores.numero}
          erro={erroDe("numero")}
          maxLength={20}
          required
        />
        <Campo
          rotulo="E-mail da compra"
          nome="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="voce@email.com"
          defaultValue={valores.email}
          erro={erroDe("email")}
          maxLength={254}
          required
        />
        <Campo
          rotulo="Seu nome"
          nota="(é assim que aparece no site)"
          nome="nome"
          autoComplete="given-name"
          placeholder="Rafael S."
          defaultValue={valores.nome}
          erro={erroDe("nome")}
          maxLength={LIMITES.nome.max}
          required
        />
      </div>

      <div className="campo avaliar__escolha">
        <label htmlFor={`${id}-produto`}>Produto</label>
        <div className="avaliar__escolha-linha">
          {escolhido?.imagem ? (
            <Image className="avaliar__foto" src={escolhido.imagem} alt="" width={56} height={56} />
          ) : (
            <span className="avaliar__foto" aria-hidden="true" />
          )}
          {/* Sem `value`: o `reset()` que o React dá no formulário depois da
              ação volta o select pro `defaultValue` — o controlado voltaria
              pra primeira opção com o estado ainda marcando o produto (ver o
              da UF em `checkout/entrega.tsx`). O estado é só pra foto. */}
          <select
            id={`${id}-produto`}
            name="produto"
            defaultValue={produto}
            onChange={(ev) => setProduto(ev.target.value)}
            aria-invalid={Boolean(erroDe("produto")) || undefined}
            aria-describedby={`${id}-erro-produto`}
            required
          >
            <option value="">Escolha o que você comprou</option>
            {produtos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </div>
        <span className="campo__erro" id={`${id}-erro-produto`} aria-live="polite">
          {erroDe("produto")}
        </span>
      </div>

      <EscolhaDaNota nota={nota} aoEscolher={setNota} erro={erroDe("nota")} id={id} />

      <div className="campos avaliar__campos">
        <div className="campo">
          <label htmlFor={`${id}-texto`}>Sua avaliação</label>
          <textarea
            id={`${id}-texto`}
            name="texto"
            rows={5}
            defaultValue={valores.texto}
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
    </>
  )
}
