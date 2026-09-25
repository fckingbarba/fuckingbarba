import type { Metadata } from "next"
import { ForaDoAr, SemAcesso } from "@/components/telas"
import { NOME_DO_PAPEL } from "@/lib/equipe"
import { lerConfiguracoes } from "@/lib/ler-configuracoes"

export const metadata: Metadata = { title: "E-mails" }

const papeis = (l: string[]) =>
  l
    .map((p) => NOME_DO_PAPEL[p as keyof typeof NOME_DO_PAPEL] ?? p)
    .join(" e ")
    .toLowerCase()

/** O que sai pro cliente, e o aviso de cada coisa pra quem resolve. */
export default async function Pagina() {
  const t = await lerConfiguracoes()
  if (t === "sem-acesso") return <SemAcesso area="configuracoes" />
  if (!t) return <ForaDoAr />
  return (
    <>
      <section className="bloco" data-emails-cliente>
        <div className="bloco__cabeca">
          <div>
            <h2 className="bloco__titulo">Pro cliente</h2>
            <p className="bloco__sub">Pelo Resend, de {t.emails.remetente}.</p>
          </div>
        </div>
        <div className="linhas">
          {t.emails.cliente.map((e) => (
            <div className="linha" key={e.nome}>
              <div>
                <p className="linha__titulo">{e.nome}</p>
                <p className="linha__txt">{e.texto}</p>
              </div>
              <span className="status" data-s={e.saindo ? "ativo" : "pausado"}>
                {e.saindo ? "Saindo" : "Em breve"}
              </span>
            </div>
          ))}
        </div>
      </section>
      <section className="bloco" data-emails-equipe>
        <div className="bloco__cabeca">
          <div>
            <h2 className="bloco__titulo">Pra equipe</h2>
            <p className="bloco__sub">
              Cada aviso vai pro papel que resolve, pro e-mail de quem está na equipe. Sem ninguém
              no painel, vai pros usuários do admin do Medusa, como antes.
            </p>
          </div>
        </div>
        <div className="linhas">
          {t.emails.equipe.map((e) => (
            <div className="linha" key={e.nome} data-aviso-da-equipe>
              <div>
                <p className="linha__titulo">{e.nome}</p>
                <p className="linha__txt">
                  {e.texto} Hoje recebe: {e.quem}.
                </p>
              </div>
              <span className="selo">vai pra: {papeis(e.papeis)}</span>
            </div>
          ))}
        </div>
      </section>
    </>
  )
}
