import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Envelope } from "@medusajs/icons"
import { Button, Container, Heading, Table, Text, toast, usePrompt } from "@medusajs/ui"
import { useEffect, useState } from "react"

/**
 * A NEWSLETTER DO RODAPÉ — quem se inscreveu, quando e de onde.
 *
 * Três coisas, e só elas: ver a lista, baixar em CSV (o arquivo que qualquer
 * ferramenta de e-mail importa) e remover quem pediu pra sair. Remover apaga
 * de verdade: é o que a Política de Privacidade promete ("fica até você pedir
 * pra sair").
 */
export const config = defineRouteConfig({
  label: "Newsletter",
  icon: Envelope,
})

type Inscricao = { id: string; email: string; origem: string | null; consentido_em: string }

const ORIGENS: Record<string, string> = { rodape: "Rodapé" }

function quando(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
}

/**
 * O CSV com a marca de UTF-8 na frente: sem ela, o Excel abre "joão" como
 * "joÃ£o" — e é no Excel que a lista vai ser aberta primeiro.
 */
function emCsv(inscricoes: Inscricao[]) {
  const linhas = [
    ["email", "inscrito_em", "origem"],
    ...inscricoes.map((i) => [i.email, i.consentido_em, i.origem ?? ""]),
  ]
  const texto = linhas
    .map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\n")
  return "\uFEFF" + texto
}

const Pagina = () => {
  const [inscricoes, setInscricoes] = useState<Inscricao[] | null>(null)
  const [erro, setErro] = useState(false)
  const perguntar = usePrompt()

  useEffect(() => {
    fetch("/admin/newsletter", { credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status))
        return r.json() as Promise<{ inscricoes: Inscricao[] }>
      })
      .then((d) => setInscricoes(d.inscricoes))
      .catch(() => setErro(true))
  }, [])

  async function remover(i: Inscricao) {
    const sim = await perguntar({
      title: "Remover da newsletter?",
      description: `${i.email} sai da lista e o registro é apagado. Se a pessoa se inscrever de novo, entra como inscrição nova.`,
      confirmText: "Remover",
      cancelText: "Cancelar",
    })
    if (!sim) return
    const r = await fetch(`/admin/newsletter/${i.id}`, { method: "DELETE", credentials: "include" })
    if (!r.ok) {
      toast.error("Não deu pra remover. Tente de novo.")
      return
    }
    setInscricoes((lista) => lista?.filter((x) => x.id !== i.id) ?? null)
    toast.success(`${i.email} saiu da lista`)
  }

  function baixar() {
    if (!inscricoes?.length) return
    const url = URL.createObjectURL(
      new Blob([emCsv(inscricoes)], { type: "text/csv;charset=utf-8" })
    )
    const link = document.createElement("a")
    link.href = url
    link.download = `newsletter-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between gap-4 px-6 py-4">
        <div>
          <Heading level="h1">Newsletter</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            {inscricoes === null
              ? "Quem se inscreveu pelo rodapé da loja."
              : `${inscricoes.length} ${inscricoes.length === 1 ? "pessoa inscrita" : "pessoas inscritas"} pelo rodapé da loja.`}
          </Text>
        </div>
        <Button variant="secondary" size="small" onClick={baixar} disabled={!inscricoes?.length}>
          Baixar CSV
        </Button>
      </div>

      {erro ? (
        <Text className="px-6 py-4">Não deu pra carregar a lista. Recarregue a página.</Text>
      ) : inscricoes === null ? (
        <Text className="px-6 py-4 text-ui-fg-subtle">Carregando…</Text>
      ) : !inscricoes.length ? (
        <Text className="px-6 py-4 text-ui-fg-subtle">Ninguém se inscreveu ainda.</Text>
      ) : (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>E-mail</Table.HeaderCell>
              <Table.HeaderCell>Inscrito em</Table.HeaderCell>
              <Table.HeaderCell>Origem</Table.HeaderCell>
              <Table.HeaderCell />
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {inscricoes.map((i) => (
              <Table.Row key={i.id}>
                <Table.Cell>{i.email}</Table.Cell>
                <Table.Cell>{quando(i.consentido_em)}</Table.Cell>
                <Table.Cell>{(i.origem && ORIGENS[i.origem]) ?? i.origem ?? "—"}</Table.Cell>
                <Table.Cell className="text-right">
                  <Button variant="transparent" size="small" onClick={() => remover(i)}>
                    Remover
                  </Button>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      )}
    </Container>
  )
}

export default Pagina
