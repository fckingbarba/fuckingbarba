import { redirect } from "next/navigation"
import { ForaDoAr, SemAcesso } from "@/components/telas"
import {
  ConversaAberta,
  ListaDeConversas,
  NumerosDoWhatsapp,
  QuemEscreve,
  TopoDoWhatsapp,
} from "@/components/whatsapp"
import { AtualizarSozinho } from "@/components/whatsapp-acoes"
import { ler } from "@/lib/medusa"
import {
  ehFiltro,
  ehIdDeConversa,
  enderecoDoWhatsapp,
  type ConversaNaTela,
  type TelaDoWhatsapp,
} from "@/lib/whatsapp"

export type BuscaDoWhatsapp = { filtro?: string; busca?: string; pagina?: string }

/** O caminho da API da lista, com a fita, a busca e a página do endereço. */
export function caminhoDaLista(b: BuscaDoWhatsapp): string {
  const q = new URLSearchParams()
  if (ehFiltro(b.filtro)) q.set("filtro", b.filtro)
  if (typeof b.busca === "string" && b.busca.trim()) q.set("busca", b.busca.trim().slice(0, 60))
  if (typeof b.pagina === "string" && /^\d{1,6}$/.test(b.pagina)) q.set("pagina", b.pagina)
  const s = q.toString()
  return s ? `/dashboard/whatsapp?${s}` : "/dashboard/whatsapp"
}

/**
 * AS CONVERSAS NA TELA — a lista (com a fita, a busca e a página do
 * endereço) e, com uma aberta, a conversa e quem escreve. No celular, com uma
 * conversa aberta, só ela aparece (a seta volta pra lista).
 */
export async function TelaDasConversas({
  caminho,
  conversa,
}: {
  caminho: string
  conversa?: string
}) {
  const [lista, aberta] = await Promise.all([
    ler(caminho),
    conversa && ehIdDeConversa(conversa)
      ? ler(`/dashboard/whatsapp/conversas/${conversa}`)
      : Promise.resolve(null),
  ])
  if (lista.status === 401)
    redirect(`/sair?motivo=${lista.corpo.message === "fora_da_equipe" ? "fora" : "expirou"}`)
  if (lista.status === 403) return <SemAcesso area="whatsapp" />
  if (lista.status !== 200) return <ForaDoAr />
  const tela = lista.corpo as unknown as TelaDoWhatsapp
  const c =
    aberta && aberta.status === 200
      ? ((aberta.corpo as { conversa: ConversaNaTela }).conversa ?? null)
      : null
  const voltar = enderecoDoWhatsapp({ filtro: tela.filtro, busca: tela.busca })

  return (
    <div data-tela>
      <AtualizarSozinho />
      <TopoDoWhatsapp aba="conversas" ligado={tela.ligado} falta={tela.falta} />
      <NumerosDoWhatsapp n={tela.numeros} />
      <div className={c ? "wa wa--aberta" : "wa wa--sem-conversa"}>
        <ListaDeConversas tela={tela} aberta={c?.id} />
        {c ? (
          <>
            <ConversaAberta c={c} voltar={voltar} />
            <QuemEscreve c={c} />
          </>
        ) : (
          <div className="wa__vazia">
            {conversa
              ? "Essa conversa não existe mais. Escolha outra na lista."
              : "Escolha uma conversa na lista pra ler e responder."}
          </div>
        )}
      </div>
    </div>
  )
}
