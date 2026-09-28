"use client"

import { useActionState } from "react"
import { Campo } from "@/components/checkout/campo"
import { Raio } from "@/components/icones"
import { encontrarPedido } from "@/lib/acoes/avaliar"
import { ENCONTRAR_INICIO, type EstadoDoEncontrar } from "@/lib/avaliar-visivel"
import { SEM_CONEXAO, semQueda } from "@/lib/rede"

/** Sem internet, a ação nem volta: a frase aparece em cima do botão, com o que foi digitado. */
const procurar = (anterior: EstadoDoEncontrar, fd: FormData) =>
  semQueda(
    () => encontrarPedido(anterior, fd),
    (): EstadoDoEncontrar => ({
      tipo: "erro",
      texto: SEM_CONEXAO,
      numero: String(fd.get("numero") ?? ""),
      email: String(fd.get("email") ?? ""),
      rodada: (anterior.tipo === "inicio" ? 0 : anterior.rodada) + 1,
    })
  )

/**
 * A PÁGINA SEM O LINK — o número do pedido e o e-mail da compra.
 *
 * Os dois têm que bater (o número sozinho é sequencial), e o link vai PRO
 * E-MAIL DA COMPRA: quem sabe o número e o e-mail de alguém não avalia no
 * nome dele sem a caixa de entrada. A tela diz sempre o mesmo — ela não sabe
 * (nem deve dizer) se o pedido existe.
 */
export function Encontrar({ recado }: { recado?: string }) {
  const [estado, acao, procurando] = useActionState(procurar, ENCONTRAR_INICIO)
  const erro = estado.tipo === "erro" ? estado : null
  const mandado = estado.tipo === "mandado" ? estado : null

  return (
    <section className="bloco avaliar__bloco" aria-labelledby="t-avaliar">
      <h1 id="t-avaliar">Avaliar o pedido</h1>
      <p className="avaliar__txt">
        O jeito mais rápido é o botão <b>Avaliar</b> do e-mail que a gente mandou depois da entrega
        — ele já abre com tudo preenchido. Sem o e-mail, escreva o número do pedido e o e-mail da
        compra: a gente manda o link de novo pra lá.
      </p>
      {mandado ? (
        <p className="avaliar__recado" role="status" data-link-mandado>
          Pronto: se o número e o e-mail forem de um pedido que ainda pode ser avaliado, o link
          chega em instantes em <b>{mandado.email}</b>. Abra o e-mail e toque em <b>Avaliar</b> —
          não chegou? Olhe o spam.
        </p>
      ) : recado && !erro ? (
        <p className="avaliar__recado" role="status">
          {recado}
        </p>
      ) : null}
      <form
        action={acao}
        onSubmit={(ev) => procurando && ev.preventDefault()}
        noValidate
        data-encontrar
      >
        <div className="campos avaliar__campos" key={erro?.rodada ?? mandado?.rodada ?? 0}>
          <Campo
            rotulo="Número do pedido"
            nome="numero"
            inputMode="numeric"
            autoComplete="off"
            placeholder="#1234"
            defaultValue={erro?.numero ?? ""}
            erro={erro?.campo === "numero" ? erro.texto : ""}
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
            defaultValue={erro?.email ?? ""}
            erro={erro?.campo === "email" ? erro.texto : ""}
            required
          />
        </div>
        {erro && !erro.campo ? (
          <p className="avaliar__recado" role="alert">
            {erro.texto}
          </p>
        ) : null}
        <button
          type="submit"
          className="btn btn--bloco"
          disabled={procurando}
          aria-busy={procurando}
        >
          {procurando ? (
            <>
              <span className="giro" aria-hidden="true" /> Mandando…
            </>
          ) : (
            <>
              Mandar o link pro meu e-mail <Raio className="btn__bolt" />
            </>
          )}
        </button>
      </form>
    </section>
  )
}
