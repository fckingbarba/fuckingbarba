import type { Metadata, Route } from "next"
import { redirect } from "next/navigation"
import { SoPara } from "@/components/area"
import { AbasDeClientes, BuscaDeClientes, ListaDosClientes } from "@/components/clientes"
import { Icone } from "@/components/icones"
import { Paginas } from "@/components/paginas"
import { Cabeca, ForaDoAr, SemAcesso } from "@/components/telas"
import type { ListaDeClientes } from "@/lib/clientes"
import { lerMembro } from "@/lib/eu"
import { ler } from "@/lib/medusa"
import { paginaDoEndereco } from "@/lib/paginas"

export const metadata: Metadata = { title: "Clientes" }

const INTEIRO = new Intl.NumberFormat("pt-BR")

type Busca = Promise<{ busca?: string; pagina?: string }>

/** O endereço da lista: a busca e a página (a primeira não vai). */
const endereco = (busca: string, pagina: number) => {
  const q = new URLSearchParams()
  if (busca) q.set("busca", busca)
  if (pagina > 1) q.set("pagina", String(pagina))
  const s = q.toString()
  return (s ? `/clientes?${s}` : "/clientes") as Route
}

/**
 * CLIENTES — quem já comprou ou tem conta na loja: quantos pedidos, quanto
 * gastou e se aceita ofertas. A busca vai no endereço (`?busca=rafael`).
 * Os três papéis abrem; o marketing vê só quem aceitou ofertas, e sem a
 * cidade — o backend (`GET /dashboard/clientes`) já manda assim. É quem não
 * abre os `contatos`: o papel criado pelo dono sem essa caixinha vê igual. De 30 em
 * 30 (`?pagina=`), e a leitura sai junto com a pergunta de quem é (`ler`).
 */
export default async function Pagina({ searchParams }: { searchParams: Busca }) {
  const { busca, pagina } = await searchParams
  const q = new URLSearchParams()
  if (busca?.trim()) q.set("busca", busca.trim().slice(0, 80))
  const p = paginaDoEndereco(pagina)
  if (p && p > 1) q.set("pagina", String(p))
  const caminho = `/dashboard/clientes?${q}`
  void ler(caminho)
  return (
    <SoPara area="clientes">
      <Lista caminho={caminho} />
    </SoPara>
  )
}

async function Lista({ caminho }: { caminho: string }) {
  const [r, leitura] = await Promise.all([ler(caminho), lerMembro()])
  if (r.status === 401)
    redirect(`/sair?motivo=${r.corpo.message === "fora_da_equipe" ? "fora" : "expirou"}`)
  if (r.status === 403) return <SemAcesso area="clientes" />
  if (r.status !== 200 || leitura.estado !== "ok") return <ForaDoAr />
  const lista = r.corpo as unknown as ListaDeClientes
  // Sem os contatos (o marketing, e o papel criado pelo dono sem essa caixinha): só quem aceitou ofertas.
  const semContatos = !leitura.areas.includes("contatos")
  const quem = leitura.membro.papel === "marketing" ? "O marketing" : "Seu papel"

  return (
    <div data-tela>
      <Cabeca
        titulo="Clientes"
        ajuda={
          semContatos
            ? `${quem} vê só quem aceitou receber ofertas — e sem CPF, telefone ou endereço (LGPD). Os outros não aparecem aqui.`
            : "Quem já comprou ou tem conta na loja. O ícone aceso diz por onde a pessoa aceitou receber ofertas: e-mail ou WhatsApp."
        }
      />
      <AbasDeClientes atual="lista" comNewsletter={leitura.areas.includes("newsletter")} />
      <div className="numeros numeros--dois" data-numeros-clientes>
        <div className="numero numero--destaque">
          <span className="numero__ico">
            <Icone nome="clientes" />
          </span>
          <p className="numero__rot">Clientes</p>
          <p className="numero__valor">{INTEIRO.format(lista.total)}</p>
        </div>
        <div className="numero">
          <span className="numero__ico">
            <Icone nome="email" />
          </span>
          <p className="numero__rot">Aceitam ofertas</p>
          <p className="numero__valor">{INTEIRO.format(lista.comOfertas)}</p>
          {lista.total ? (
            <div className="numero__pe">
              <span className="pilula">
                {Math.round((lista.comOfertas / lista.total) * 100)}% dos clientes
              </span>
            </div>
          ) : null}
        </div>
      </div>
      {semContatos ? (
        <p className="faixa faixa--curta" data-nivel="info" data-visao-marketing>
          <Icone nome="cadeado" />
          {leitura.membro.papel === "marketing" ? "Visão do marketing" : "Visão do seu papel"}: só
          quem aceitou ofertas.
        </p>
      ) : null}
      <BuscaDeClientes busca={lista.busca} />
      <section className="bloco bloco--sem-pad">
        <ListaDosClientes clientes={lista.clientes} comCidade={!semContatos} />
      </section>
      {lista.paginacao ? (
        <Paginas
          paginacao={lista.paginacao}
          endereco={(n) => endereco(lista.busca, n)}
          rotulo="clientes"
        />
      ) : null}
    </div>
  )
}
