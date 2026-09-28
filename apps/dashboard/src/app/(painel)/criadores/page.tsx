import type { Metadata, Route } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { SoPara } from "@/components/area"
import { CopiarLinkDaPagina, ListaDosCriadores } from "@/components/criadores"
import { Paginas } from "@/components/paginas"
import { Cabeca, ForaDoAr, SemAcesso } from "@/components/telas"
import { ehFiltro, FILTROS, type Filtro, type TelaDosCriadores } from "@/lib/criadores"
import { ler } from "@/lib/medusa"
import { paginaDoEndereco } from "@/lib/paginas"

export const metadata: Metadata = { title: "Criadores" }

type Busca = Promise<{ filtro?: string; pagina?: string }>

/** O endereço da lista: a fita e a página (os padrões não vão). */
const endereco = (filtro: Filtro, pagina = 1) => {
  const q = new URLSearchParams()
  if (filtro !== "novas") q.set("filtro", filtro)
  if (pagina > 1) q.set("pagina", String(pagina))
  const s = q.toString()
  return (s ? `/criadores?${s}` : "/criadores") as Route
}

/**
 * CRIADORES — quem quer gravar os vídeos da loja, pela página escondida
 * `/criadores` da loja (o link vai por mensagem, pra quem a loja chamar: ela
 * não aparece no site nem no Google). A nova espera aqui: aprovada, é chamar
 * no WhatsApp pra fechar; recusada, não. A fita e a página ficam no endereço
 * (`?filtro=aprovadas&pagina=2`); de 30 em 30.
 */
export default async function Pagina({ searchParams }: { searchParams: Busca }) {
  const { filtro, pagina } = await searchParams
  const q = new URLSearchParams()
  if (ehFiltro(filtro)) q.set("filtro", filtro)
  const p = paginaDoEndereco(pagina)
  if (p && p > 1) q.set("pagina", String(p))
  const caminho = `/dashboard/criadores?${q}`
  void ler(caminho)
  return (
    <SoPara area="criadores">
      <Lista caminho={caminho} />
    </SoPara>
  )
}

const sem = (link: string) => link.replace(/^https?:\/\/(www\.)?/, "")

async function Lista({ caminho }: { caminho: string }) {
  const r = await ler(caminho)
  if (r.status === 401)
    redirect(`/sair?motivo=${r.corpo.message === "fora_da_equipe" ? "fora" : "expirou"}`)
  if (r.status === 403) return <SemAcesso area="criadores" />
  if (r.status !== 200) return <ForaDoAr />
  const tela = r.corpo as unknown as TelaDosCriadores

  return (
    <div data-tela>
      <Cabeca
        titulo="Criadores"
        sub="Quem quer gravar os vídeos da loja, pela página de inscrição. Aprovou, é chamar no WhatsApp pra fechar."
        acoes={tela.pagina ? <CopiarLinkDaPagina link={tela.pagina} /> : null}
      />
      {tela.pagina ? (
        <p className="criadores__pagina" data-pagina-dos-criadores>
          A página de inscrição:{" "}
          <a href={tela.pagina} target="_blank" rel="noopener noreferrer">
            {sem(tela.pagina)}
          </a>
          . Ela é escondida — fora do menu, do site e do Google: só abre com o link.
        </p>
      ) : null}
      <div className="numeros" data-numeros-criadores>
        <div className="numero numero--destaque">
          <p className="numero__rot">Esperando você</p>
          <p className="numero__valor num">{tela.contagem.novas}</p>
          <p className="numero__sub">
            {tela.contagem.novas === 1 ? "inscrição nova" : "inscrições novas"}
          </p>
        </div>
        <div className="numero">
          <p className="numero__rot">Aprovadas</p>
          <p className="numero__valor num">{tela.contagem.aprovadas}</p>
          <p className="numero__sub">pra chamar e fechar</p>
        </div>
        <div className="numero">
          <p className="numero__rot">Querem o fixo</p>
          <p className="numero__valor num">{tela.modelos.fixo}</p>
          <p className="numero__sub">entre novas e aprovadas</p>
        </div>
        <div className="numero">
          <p className="numero__rot">Querem comissão</p>
          <p className="numero__valor num">{tela.modelos.comissao}</p>
          <p className="numero__sub">
            {tela.modelos.conversar
              ? `e ${tela.modelos.conversar} ${tela.modelos.conversar === 1 ? "quer" : "querem"} conversar antes`
              : "entre novas e aprovadas"}
          </p>
        </div>
      </div>
      <nav className="filtros" aria-label="Filtrar inscrições">
        {FILTROS.map((f) => (
          <Link
            key={f.id}
            className="filtro"
            href={endereco(f.id)}
            aria-current={tela.filtro === f.id ? "page" : undefined}
          >
            {f.nome} <b>{tela.contagem[f.id] ?? 0}</b>
          </Link>
        ))}
      </nav>
      <section className="bloco bloco--sem-pad">
        <ListaDosCriadores tela={tela} />
      </section>
      {tela.paginacao ? (
        <Paginas
          paginacao={tela.paginacao}
          endereco={(n) => endereco(tela.filtro, n)}
          rotulo="inscrições"
        />
      ) : null}
      <p className="lista-nota">
        CPF, endereço e chave Pix não vêm na inscrição: entram no contrato, depois do sim. Quem
        pedir pra sair: recuse e depois apague — apagar é de vez.
      </p>
    </div>
  )
}
