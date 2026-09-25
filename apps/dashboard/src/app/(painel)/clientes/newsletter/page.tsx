import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { SoPara } from "@/components/area"
import { AbasDeClientes } from "@/components/clientes"
import { ListaDaNewsletter } from "@/components/newsletter"
import { Cabeca, ForaDoAr, SemAcesso } from "@/components/telas"
import type { Newsletter } from "@/lib/clientes"
import { medusa } from "@/lib/medusa"

export const metadata: Metadata = { title: "Newsletter" }

/**
 * A NEWSLETTER — quem aceitou receber ofertas por e-mail, numa lista só: o
 * rodapé da loja e a caixa de "Meus dados" da conta (`GET
 * /dashboard/newsletter` junta os dois). É uma aba de Clientes, e não uma
 * lista à parte: o e-mail de cliente leva pra ficha, e a ficha mostra o
 * mesmo "sim". Marketing e dono.
 */
export default function Pagina() {
  return (
    <SoPara area="newsletter">
      <Lista />
    </SoPara>
  )
}

const pct = (n: number, total: number) => (total ? `${Math.round((n / total) * 100)}%` : "—")

async function Lista() {
  const r = await medusa("/dashboard/newsletter", { metodo: "GET", token: "sessao" })
  if (r.status === 401)
    redirect(`/sair?motivo=${r.corpo.message === "fora_da_equipe" ? "fora" : "expirou"}`)
  if (r.status === 403) return <SemAcesso area="newsletter" />
  if (r.status !== 200) return <ForaDoAr />
  const { inscritos, numeros: n } = r.corpo as unknown as Newsletter

  return (
    <div data-tela>
      <Cabeca
        titulo="Clientes"
        sub="Quem aceitou receber ofertas por e-mail: no rodapé da loja ou na conta."
      />
      <AbasDeClientes atual="newsletter" comNewsletter />
      <div className="numeros" data-numeros-newsletter>
        <div className="numero numero--destaque">
          <p className="numero__rot">Recebem ofertas</p>
          <p className="numero__valor num">{n.total}</p>
          <p className="numero__sub">
            {n.semana ? `+${n.semana} esta semana` : "nenhum novo esta semana"}
          </p>
        </div>
        <div className="numero">
          <p className="numero__rot">Do rodapé</p>
          <p className="numero__valor num">{n.rodape}</p>
          <p className="numero__sub">{pct(n.rodape, n.total)}</p>
        </div>
        <div className="numero">
          <p className="numero__rot">Da conta</p>
          <p className="numero__valor num">{n.conta}</p>
          <p className="numero__sub">{pct(n.conta, n.total)}</p>
        </div>
      </div>
      <ListaDaNewsletter inscritos={inscritos} />
    </div>
  )
}
