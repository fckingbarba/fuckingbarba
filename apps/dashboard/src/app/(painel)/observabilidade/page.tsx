import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { SoPara } from "@/components/area"
import { Icone } from "@/components/icones"
import { Integracoes, Problemas, Rotinas } from "@/components/observabilidade"
import { Cabeca, ForaDoAr, SemAcesso } from "@/components/telas"
import { medusa } from "@/lib/medusa"
import type { TelaDaObservabilidade } from "@/lib/observabilidade"

export const metadata: Metadata = { title: "Observabilidade" }

/**
 * OBSERVABILIDADE — a saúde da loja: o que quebrou (com o que fazer), as
 * integrações e as rotinas automáticas. Vem pronto do backend
 * (`GET /dashboard/observabilidade`), que confere a loja antes de responder.
 * Dono e operação.
 */
export default function Pagina() {
  return (
    <SoPara area="observabilidade">
      <Observabilidade />
    </SoPara>
  )
}

const mais = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

async function Observabilidade() {
  const r = await medusa("/dashboard/observabilidade", { metodo: "GET", token: "sessao" })
  if (r.status === 401)
    redirect(`/sair?motivo=${r.corpo.message === "fora_da_equipe" ? "fora" : "expirou"}`)
  if (r.status === 403) return <SemAcesso area="observabilidade" />
  if (r.status !== 200) return <ForaDoAr />
  const t = r.corpo as unknown as TelaDaObservabilidade
  const { problemas, rotinas, integracoes, emails } = t.numeros

  return (
    <div data-tela>
      <Cabeca
        titulo="Observabilidade"
        sub="A saúde da loja: o que quebrou, o que as rotinas automáticas fizeram e como estão as integrações."
      />
      <div className="faixa" data-nivel={t.geral.nivel} data-geral>
        <Icone nome={t.geral.nivel === "info" ? "check" : "alerta"} />
        <div>
          <p className="faixa__titulo">{t.geral.titulo}</p>
          <p>{t.geral.texto}</p>
        </div>
      </div>
      <div className="numeros">
        <div
          className={`numero${problemas.graves ? " numero--grave" : ""}`}
          data-numero="problemas"
        >
          <p className="numero__rot">Problemas abertos</p>
          <p className="numero__valor">{problemas.abertos}</p>
          <p className="numero__sub">
            {mais(problemas.graves, "grave", "graves")} · {problemas.olhar} pra olhar
          </p>
        </div>
        <div className="numero" data-numero="rotinas">
          <p className="numero__rot">Rotinas automáticas</p>
          <p className="numero__valor">
            {rotinas.ok} de {rotinas.total}
          </p>
          <p className="numero__sub">rodaram bem na última vez</p>
        </div>
        <div className="numero" data-numero="integracoes">
          <p className="numero__rot">Integrações</p>
          <p className="numero__valor">
            {integracoes.ok} de {integracoes.total}
          </p>
          <p className="numero__sub">com sinal bom agora</p>
        </div>
        <div className="numero" data-numero="emails">
          <p className="numero__rot">E-mails hoje</p>
          <p className="numero__valor">{emails.hoje}</p>
          <p className="numero__sub">
            {emails.falhas ? mais(emails.falhas, "não saiu", "não saíram") : "nenhum falhou"}
          </p>
        </div>
      </div>

      <section className="bloco" data-problemas>
        <div className="bloco__cabeca">
          <div>
            <h2 className="bloco__titulo">Problemas</h2>
            <p className="bloco__sub">
              Do mais grave pro menos. O que depende da loja sai sozinho quando for resolvido; o
              resto, quem marca fica registrado.
            </p>
          </div>
        </div>
        <Problemas problemas={t.problemas} />
      </section>

      <section className="bloco" data-integracoes>
        <div className="bloco__cabeca">
          <div>
            <h2 className="bloco__titulo">Integrações</h2>
            <p className="bloco__sub">
              Os serviços de que a loja depende, e o último sinal de cada um.
            </p>
          </div>
        </div>
        <Integracoes integracoes={t.integracoes} />
      </section>

      <section className="bloco bloco--sem-pad" data-rotinas>
        <div className="bloco__cabeca">
          <div>
            <h2 className="bloco__titulo">Rotinas automáticas</h2>
            <p className="bloco__sub">
              O que a loja faz sozinha, de tempos em tempos. Falhou, ela tenta de novo na próxima.
            </p>
          </div>
        </div>
        <Rotinas rotinas={t.rotinas} />
      </section>

      <section className="bloco" data-avisados>
        <div className="bloco__cabeca">
          <div>
            <h2 className="bloco__titulo">Quem é avisado</h2>
            <p className="bloco__sub">
              O estorno que não sai, a nota travada e a conexão do Bling caída também vão por
              e-mail, na hora, pros usuários do admin do Medusa. O resto fica só aqui, e no número
              vermelho do menu quando é grave.
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
