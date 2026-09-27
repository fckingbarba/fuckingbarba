import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { TabelaDeAcessos } from "@/components/acessos"
import { Equipe, type PessoaDaLista } from "@/components/equipe"
import { ForaDoAr, SemAcesso } from "@/components/telas"
import { Ajuda } from "@/components/visual"
import type { Area, Matriz, Membro } from "@/lib/equipe"
import { medusa } from "@/lib/medusa"

export const metadata: Metadata = { title: "Equipe e acessos" }

/**
 * EQUIPE E ACESSOS — quem entra, com que papel, e a tabela do que cada papel
 * abre, que o dono muda (as caixinhas da operação e do marketing). A lista,
 * a tabela e as regras dela vêm do Medusa (`GET /dashboard/equipe`), que só
 * responde ao dono; salvar é `POST /dashboard/acessos`.
 */
export default async function Pagina() {
  const r = await medusa("/dashboard/equipe", { metodo: "GET", token: "sessao" })
  if (r.status === 401)
    redirect(`/sair?motivo=${r.corpo.message === "fora_da_equipe" ? "fora" : "expirou"}`)
  if (r.status === 403) return <SemAcesso area="equipe" />
  if (r.status !== 200) return <ForaDoAr />

  const membros = paraALista((r.corpo.membros ?? []) as Membro[])
  const acesso = (r.corpo.acesso ?? {}) as Matriz
  const padrao = (r.corpo.padrao ?? acesso) as Matriz

  return (
    <>
      <Equipe membros={membros} eu={String(r.corpo.eu ?? "")} acesso={acesso} />
      <section className="bloco bloco--sem-pad acessos">
        <div className="bloco__cabeca">
          <div className="bloco__titulos">
            <h2 className="bloco__titulo">O que cada papel abre</h2>
            <Ajuda>
              Marque o que a operação e o marketing abrem — o dono abre tudo. Vale no servidor, não
              só na tela, a partir do próximo clique de cada pessoa.
            </Ajuda>
          </div>
        </div>
        <TabelaDeAcessos
          key={JSON.stringify(acesso)}
          acesso={acesso}
          padrao={padrao}
          fixas={(r.corpo.fixas ?? []) as Area[]}
          dentroDe={(r.corpo.dentroDe ?? {}) as Partial<Record<Area, Area>>}
        />
      </section>
    </>
  )
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
