import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { Equipe, type PessoaDaLista } from "@/components/equipe"
import { ForaDoAr, SemAcesso } from "@/components/telas"
import { NOME_DO_PAPEL, PAPEIS, type Area, type Membro, type Papel } from "@/lib/equipe"
import { medusa } from "@/lib/medusa"

export const metadata: Metadata = { title: "Equipe e acessos" }

/**
 * EQUIPE E ACESSOS — quem entra, com que papel, e a tabela do que cada papel
 * abre. A lista e a tabela vêm do Medusa (`GET /dashboard/equipe`), que só
 * responde ao dono.
 */
export default async function Pagina() {
  const r = await medusa("/dashboard/equipe", { metodo: "GET", token: "sessao" })
  if (r.status === 401)
    redirect(`/sair?motivo=${r.corpo.message === "fora_da_equipe" ? "fora" : "expirou"}`)
  if (r.status === 403) return <SemAcesso area="equipe" />
  if (r.status !== 200) return <ForaDoAr />

  const membros = paraALista((r.corpo.membros ?? []) as Membro[])
  const acesso = (r.corpo.acesso ?? {}) as Record<Area, Papel[]>

  return (
    <>
      <Equipe membros={membros} eu={String(r.corpo.eu ?? "")} />
      <section className="bloco bloco--sem-pad">
        <div className="bloco__cabeca">
          <div>
            <h2 className="bloco__titulo">O que cada papel abre</h2>
            <p className="bloco__sub">
              Vale no servidor, não só na tela: a área que o papel não abre nem sai da loja.
            </p>
          </div>
        </div>
        <div className="tabela-rola">
          <table className="matriz">
            <thead>
              <tr>
                <th>Área</th>
                {PAPEIS.map((p) => (
                  <th key={p}>{NOME_DO_PAPEL[p]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(Object.keys(NOME_DA_LINHA) as Area[]).map((area) => (
                <tr key={area}>
                  <th>{NOME_DA_LINHA[area]}</th>
                  {PAPEIS.map((p) => {
                    const abre = acesso[area]?.includes(p) ?? false
                    return (
                      <td key={p} className={abre ? "sim" : "nao"}>
                        {abre ? "abre" : "—"}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}

/** As linhas da tabela, na ordem do menu. */
const NOME_DA_LINHA: Record<Area, string> = {
  inicio: "Início",
  pedidos: "Pedidos",
  carrinhos: "Carrinhos abandonados",
  produtos: "Produtos",
  cupons: "Cupons e descontos",
  clientes: "Clientes",
  home: "Layout da home",
  observabilidade: "Observabilidade",
  configuracoes: "Configurações",
  equipe: "Equipe e acessos",
}

const HORA_DE_BRASILIA = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  hour: "2-digit",
  minute: "2-digit",
})
const DIA_DE_BRASILIA = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
})
const DATA_CHAVE = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" })

/** "hoje, 14:32" · "ontem, 09:10" · "12/09" — no fuso da loja, que é o de quem lê. */
function quando(iso: string, agora: number): string {
  const d = new Date(iso)
  const dia = DATA_CHAVE.format(d)
  if (dia === DATA_CHAVE.format(agora)) return `hoje, ${HORA_DE_BRASILIA.format(d)}`
  if (dia === DATA_CHAVE.format(agora - 24 * 60 * 60 * 1000))
    return `ontem, ${HORA_DE_BRASILIA.format(d)}`
  return DIA_DE_BRASILIA.format(d)
}

/**
 * A frase do estado de cada pessoa, escrita aqui (no servidor, na hora do
 * pedido), pra tela não calcular hora — no navegador, o fuso é o de quem lê.
 */
function paraALista(membros: Membro[], agora = Date.now()): PessoaDaLista[] {
  return membros.map((m) => comEstado(m, agora))
}

function comEstado(m: Membro, agora: number): PessoaDaLista {
  if (m.situacao === "convidado") {
    const vence = m.convite_vence_em ? Date.parse(m.convite_vence_em) : 0
    const vencido = !vence || vence <= agora
    return {
      ...m,
      conviteVencido: vencido,
      estado: vencido
        ? "o convite venceu — reenvie pra pessoa entrar"
        : `convite mandado, ainda não entrou · vale até ${DIA_DE_BRASILIA.format(vence)}`,
    }
  }
  return {
    ...m,
    conviteVencido: false,
    estado: m.ultimo_acesso
      ? `último acesso ${quando(m.ultimo_acesso, agora)}`
      : "ainda não entrou",
  }
}
