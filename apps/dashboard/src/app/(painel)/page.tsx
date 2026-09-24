import type { Metadata } from "next"
import Link from "next/link"
import { Icone } from "@/components/icones"
import { Cabeca } from "@/components/telas"
import { lerMembro } from "@/lib/eu"

export const metadata: Metadata = { title: "Início" }

/**
 * O INÍCIO — por enquanto, o mapa do que o painel já faz e do que vem.
 *
 * O Início do protótipo (o que precisa de você hoje, as vendas, as visitas)
 * chega na fase 2, junto com os pedidos: sem eles, não há o que mostrar.
 * A ordem das fases é a do ESTADO.md, 4.5.
 */
const FASES = [
  {
    titulo: "A base",
    txt: "Entrar com código no e-mail, os papéis valendo no servidor, a equipe e os acessos.",
  },
  {
    titulo: "Pedidos e Início",
    txt: "Os pedidos do dia, o que despachar, as vendas e as visitas.",
  },
  {
    titulo: "Produtos",
    txt: "Fotos, vídeos, textos, seções, fundos e a caixa de compra de cada página.",
  },
  {
    titulo: "Home",
    txt: "As seções da home e o banner com vários slides, com rascunho e “Publicar”.",
  },
  { titulo: "Carrinho abandonado", txt: "Os 5 e-mails que chamam de volta quem deixou a sacola." },
  {
    titulo: "Cupons, clientes e configurações",
    txt: "Cupons, a lista de clientes, a newsletter e as configurações da loja.",
  },
  { titulo: "Observabilidade", txt: "Os erros e as rotinas da loja, num lugar só." },
]
const FASE_ATUAL = 1

export default async function Inicio() {
  const leitura = await lerMembro()
  if (leitura.estado !== "ok") return null
  const { membro, areas } = leitura
  const primeiroNome = membro.nome.split(" ")[0]

  return (
    <div data-tela>
      <Cabeca
        titulo={`Oi, ${primeiroNome}`}
        sub="O painel da loja está nascendo, uma parte por vez. Aqui fica o que já funciona e o que vem."
      />

      {areas.includes("equipe") ? (
        <div className="faixa" data-nivel="info">
          <Icone nome="equipe" />
          <div>
            <p className="faixa__titulo">Comece pela equipe</p>
            <p>
              Convide quem vai usar o painel, cada um com o próprio e-mail e o papel certo. O acesso
              de cada papel vale no servidor, não só na tela.
            </p>
            <div className="faixa__acoes">
              <Link className="btn btn--menor" href="/configuracoes/equipe">
                <Icone nome="enviar" />
                Equipe e acessos
              </Link>
            </div>
          </div>
        </div>
      ) : null}

      <section className="bloco">
        <div className="bloco__cabeca">
          <div>
            <h2 className="bloco__titulo">O que vem, na ordem</h2>
            <p className="bloco__sub">Cada fase entra no ar quando está pronta e conferida.</p>
          </div>
        </div>
        <ol className="fases">
          {FASES.map((f, i) => {
            const numero = i + 1
            return (
              <li
                key={f.titulo}
                data-feita={numero <= FASE_ATUAL ? "" : undefined}
                data-agora={numero === FASE_ATUAL + 1 ? "" : undefined}
              >
                <span className="fases__num">
                  {numero <= FASE_ATUAL ? <Icone nome="check" className="fases__check" /> : numero}
                </span>
                <div>
                  <p className="fases__titulo">
                    {f.titulo}
                    {numero <= FASE_ATUAL
                      ? " · no ar"
                      : numero === FASE_ATUAL + 1
                        ? " · a próxima"
                        : ""}
                  </p>
                  <p className="fases__txt">{f.txt}</p>
                </div>
              </li>
            )
          })}
        </ol>
      </section>
    </div>
  )
}
