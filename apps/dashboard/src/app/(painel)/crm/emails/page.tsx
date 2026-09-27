import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { SoPara } from "@/components/area"
import { AbasDoCrm } from "@/components/crm"
import { ExemploDoCrm } from "@/components/emails-do-crm"
import { Cabeca, ForaDoAr, SemAcesso } from "@/components/telas"
import { CAMINHO_DOS_EMAILS, type TelaDosEmails } from "@/lib/crm"
import { ler } from "@/lib/medusa"

export const metadata: Metadata = { title: "E-mails do CRM" }

/**
 * O MODELO DOS E-MAILS DO CRM — três exemplos (boas-vindas, hora de repor e
 * carrinho), montados pelo Medusa com os produtos, os preços e a empresa de
 * verdade (`GET /dashboard/crm/emails`), e o "Mandar pra mim" de cada um,
 * pra ver no celular como chega. Quem abre o CRM (no padrão, o dono e o
 * marketing). A leitura sai junto com a pergunta de quem é (`ler`).
 */
export default function Pagina() {
  void ler(CAMINHO_DOS_EMAILS)
  return (
    <SoPara area="crm">
      <Emails />
    </SoPara>
  )
}

async function Emails() {
  const r = await ler(CAMINHO_DOS_EMAILS)
  if (r.status === 401)
    redirect(`/sair?motivo=${r.corpo.message === "fora_da_equipe" ? "fora" : "expirou"}`)
  if (r.status === 403) return <SemAcesso area="crm" />
  if (r.status !== 200) return <ForaDoAr />
  const tela = r.corpo as unknown as TelaDosEmails

  return (
    <div data-tela data-modelo-dos-emails>
      <Cabeca
        titulo="CRM"
        sub="O modelo dos e-mails de oferta: como cada um chega pra quem aceitou receber."
      />
      <AbasDoCrm atual="emails" />
      {tela.semLoja ? (
        <p className="nota-form nota-form--atencao" role="alert" data-sem-loja>
          Falta o endereço da loja no Medusa (LOJA_URL): sem ele, os links dos e-mails não teriam
          pra onde ir.
        </p>
      ) : (
        <>
          <section className="bloco" aria-labelledby="emails-como" data-como>
            <h2 className="bloco__titulo" id="emails-como">
              Como todo e-mail de oferta sai
            </h2>
            <ul className="modelo-emails__regras">
              <li>
                Sai de <b data-remetente>{tela.remetente}</b>. O teste vai pra{" "}
                <b data-para>{tela.para}</b>.
              </li>
              <li>
                No pé, o <b>Sair da lista em 1 clique</b>: tira a pessoa das ofertas (newsletter,
                conta e base da Nuvemshop). Os e-mails dos pedidos continuam.
              </li>
              <li data-um-clique={tela.umClique ? "" : undefined}>
                {tela.umClique
                  ? "No Gmail e no iPhone, o “cancelar inscrição” aparece no alto do e-mail e tira na hora."
                  : "O “cancelar inscrição” do alto do e-mail leva pra página de sair da loja."}
              </li>
              <li>
                Todo link pra loja leva a campanha: a visita e a compra aparecem em Marketing →
                Canais, como E-mail.
              </li>
              <li>
                O cupom e o depoimento dos exemplos são de mentira. Se clicar em Sair da lista no
                teste, você sai da lista de verdade.
              </li>
            </ul>
          </section>
          <div className="modelo-emails">
            {tela.exemplos.map((x) => (
              <ExemploDoCrm key={x.id} exemplo={x} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
