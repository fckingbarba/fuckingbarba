import type { Metadata } from "next"
import type { Route } from "next"
import Link from "next/link"
import { JanelaDaNota } from "@/components/configuracoes"
import { ForaDoAr, SemAcesso } from "@/components/telas"
import { lerConfiguracoes } from "@/lib/ler-configuracoes"

export const metadata: Metadata = { title: "Nota fiscal" }

/** O ERP, a hora da nota e o que está esperando alguém. */
export default async function Pagina() {
  const t = await lerConfiguracoes()
  if (t === "sem-acesso") return <SemAcesso area="configuracoes" />
  if (!t) return <ForaDoAr />
  const { erp, janela, janelas, pendencias } = t.nota
  const situacao = !erp.configurado
    ? { s: "pausado", nome: "Não configurado" }
    : erp.queda
      ? { s: "problema", nome: "Caiu" }
      : erp.conectado
        ? { s: "ativo", nome: "Conectado" }
        : { s: "pausado", nome: "Desconectado" }
  return (
    <>
      <section className="bloco" data-erp>
        <div className="bloco__cabeca">
          <div>
            <h2 className="bloco__titulo">{erp.nome}</h2>
            <p className="bloco__sub">
              {erp.queda
                ? `A conexão caiu: ${erp.queda}. Conecte de novo no admin, na tela do ${erp.nome}.`
                : (erp.desde ??
                  (erp.configurado
                    ? `Conecte no admin, na tela do ${erp.nome}.`
                    : "Sem o app do ERP nas variáveis: as notas não saem pela loja."))}
            </p>
          </div>
          <span className="status" data-s={situacao.s}>
            {situacao.nome}
          </span>
        </div>
        {erp.configurado ? <JanelaDaNota inicial={janela} janelas={janelas} /> : null}
      </section>
      <section className="bloco" data-pendencias>
        <div className="bloco__cabeca">
          <div>
            <h2 className="bloco__titulo">Pendências</h2>
            <p className="bloco__sub">
              As notas que precisam de alguém, e as que esperam a janela pra sair.
            </p>
          </div>
        </div>
        {pendencias.length ? (
          <div className="linhas">
            {pendencias.map((p) => (
              <div
                className="linha"
                key={`${p.pedidoId ?? "varios"}-${p.titulo}`}
                data-pendencia={p.pedidoId ?? "varios"}
              >
                <div>
                  <p className="linha__titulo">{p.titulo}</p>
                  <p className="linha__txt">{p.texto}</p>
                </div>
                {p.pedidoId ? (
                  <Link
                    className="btn btn--menor btn--contorno"
                    href={`/pedidos/${p.pedidoId}` as Route}
                  >
                    Ver
                  </Link>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="vazio vazio--curto">Nenhuma nota esperando ninguém.</p>
        )}
      </section>
    </>
  )
}
