import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Container,
  Heading,
  Table,
  Text,
  toast,
  usePrompt,
} from "@medusajs/ui"
import { useEffect, useMemo, useState } from "react"

/**
 * OS ENDEREÇOS E AS FOTOS DA NUVEMSHOP — a prévia e a troca.
 *
 * Abre pela tela do ERP. Primeiro só MOSTRA: cada produto da loja antiga, o
 * produto daqui com o mesmo código (SKU) e o que muda nele — o endereço vira
 * o de lá, as fotos passam a ser as da galeria de lá, e o produto sem
 * categoria ganha a de lá. Nada muda até "Trazer da Nuvemshop".
 *
 * O formato do que o backend devolve está escrito dos dois lados
 * (`lib/nuvemshop.ts`): o admin é bundle próprio e não importa código do
 * servidor.
 */

type Item = {
  nuvem: {
    slug: string
    nome: string
    skus: string[]
    fotos: string[]
    categoria: { nome: string; slug: string } | null
  }
  produto: { id: string; titulo: string; handle: string; status: string; fotos: number } | null
  endereco: { de: string; para: string } | null
  ocupante: { id: string; titulo: string; handle: string; novoHandle: string } | null
  trocaFotos: boolean
  categoria: { id: string; handle: string; nome: string } | null
  bloqueio: string | null
  pronto: boolean
}

type Previa = {
  loja: string
  lidoEm: string
  itens: Item[]
  falharam: { slug: string; motivo: string }[]
}

type Relatorio = {
  enderecos: { titulo: string; de: string; para: string }[]
  afastados: { titulo: string; de: string; para: string }[]
  fotos: {
    produtos: { titulo: string; handle: string }[]
    copiadas: number
    reaproveitadas: number
    falharam: string[]
  }
  categorias: { titulo: string; categoria: string }[]
  pulados: { nome: string; motivo: string }[]
}

async function pedir<T>(caminho: string, corpo?: unknown): Promise<T> {
  const r = await fetch(caminho, {
    method: corpo === undefined ? "GET" : "POST",
    credentials: "include",
    ...(corpo === undefined
      ? {}
      : { headers: { "content-type": "application/json" }, body: JSON.stringify(corpo) }),
  })
  const resposta = await r.json().catch(() => ({}))
  if (!r.ok)
    throw new Error((resposta as { message?: string }).message ?? `o backend respondeu ${r.status}`)
  return resposta as T
}

const Nuvemshop = () => {
  const [previa, setPrevia] = useState<Previa | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [marcados, setMarcados] = useState<Set<string>>(new Set())
  const [trazendo, setTrazendo] = useState(false)
  const [relatorio, setRelatorio] = useState<Relatorio | null>(null)
  const perguntar = usePrompt()

  const ler = () => {
    setPrevia(null)
    setErro(null)
    pedir<Previa>("/admin/nuvemshop")
      .then((p) => {
        setPrevia(p)
        setMarcados(
          new Set(p.itens.filter((i) => !i.bloqueio && !i.pronto).map((i) => i.nuvem.slug))
        )
      })
      .catch((e) => setErro(e instanceof Error ? e.message : String(e)))
  }
  useEffect(ler, [])

  const escolhidos = useMemo(
    () => (previa?.itens ?? []).filter((i) => marcados.has(i.nuvem.slug)),
    [previa, marcados]
  )

  const alternar = (slug: string) =>
    setMarcados((m) => {
      const novo = new Set(m)
      if (novo.has(slug)) novo.delete(slug)
      else novo.add(slug)
      return novo
    })

  const trazer = async () => {
    const enderecos = escolhidos.filter((i) => i.endereco).length
    const fotos = escolhidos.filter((i) => i.trocaFotos).length
    const sim = await perguntar({
      title: "Trazer da Nuvemshop?",
      description:
        `${enderecos} produto(s) mudam de endereço e ${fotos} ficam com as fotos da Nuvemshop ` +
        "no lugar das de hoje.",
      confirmText: "Trazer",
      cancelText: "Cancelar",
    })
    if (!sim) return
    setTrazendo(true)
    try {
      const { relatorio } = await pedir<{ relatorio: Relatorio }>("/admin/nuvemshop", {
        slugs: escolhidos.map((i) => i.nuvem.slug),
      })
      setRelatorio(relatorio)
      toast.success("Pronto.")
      window.scrollTo({ top: 0 })
    } catch (e) {
      toast.error(`Não terminou: ${e instanceof Error ? e.message : e}`)
    } finally {
      setTrazendo(false)
    }
  }

  if (relatorio) return <Pronto r={relatorio} />

  return (
    <Container className="divide-y p-0">
      <div className="px-6 py-4">
        <a className="text-ui-fg-subtle txt-small underline" href="/app/erp">
          ← ERP
        </a>
        <Heading level="h1" className="mt-2">
          Endereços e fotos da Nuvemshop
        </Heading>
        <Text size="small" className="text-ui-fg-subtle mt-1">
          Cada produto daqui fica com o endereço (/produtos/…) e as fotos que ele tem na loja da
          Nuvemshop, casados pelo código (SKU): o link que já circula continua valendo quando o
          domínio vier pra cá. Quem está sem categoria ganha a de lá. Nome, preço e o resto
          continuam vindo do Bling. Nada muda até você confirmar lá embaixo.
        </Text>
      </div>

      {erro ? (
        <div className="flex flex-col gap-3 px-6 py-4">
          <Alert variant="error">Não consegui montar a prévia: {erro}.</Alert>
          <div>
            <Button size="small" variant="secondary" onClick={ler}>
              Tentar de novo
            </Button>
          </div>
        </div>
      ) : !previa ? (
        <Text className="text-ui-fg-subtle px-6 py-4">
          Lendo a loja da Nuvemshop… leva uns segundos.
        </Text>
      ) : (
        <>
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell />
                <Table.HeaderCell>Na Nuvemshop</Table.HeaderCell>
                <Table.HeaderCell>Aqui</Table.HeaderCell>
                <Table.HeaderCell>Endereço</Table.HeaderCell>
                <Table.HeaderCell>Fotos</Table.HeaderCell>
                <Table.HeaderCell>Categoria</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {previa.itens.map((i) => (
                <Table.Row key={i.nuvem.slug} className="align-top">
                  <Table.Cell className="w-8 pt-4">
                    <Checkbox
                      disabled={Boolean(i.bloqueio) || i.pronto}
                      checked={marcados.has(i.nuvem.slug)}
                      onCheckedChange={() => alternar(i.nuvem.slug)}
                    />
                  </Table.Cell>
                  <Table.Cell className="py-3">
                    <div className="flex gap-3">
                      {i.nuvem.fotos[0] ? (
                        <img
                          src={i.nuvem.fotos[0]}
                          alt=""
                          className="h-12 w-12 shrink-0 rounded object-cover"
                        />
                      ) : (
                        <div className="bg-ui-bg-subtle h-12 w-12 shrink-0 rounded" />
                      )}
                      <div className="flex flex-col gap-1">
                        <Text size="small" weight="plus">
                          {i.nuvem.nome || i.nuvem.slug}
                        </Text>
                        <Text size="xsmall" className="text-ui-fg-subtle">
                          {i.nuvem.skus.join(" · ") || "sem SKU"} · {i.nuvem.fotos.length} foto(s)
                        </Text>
                      </div>
                    </div>
                  </Table.Cell>
                  <Table.Cell className="py-3">
                    {i.produto ? (
                      <Text size="small">
                        {i.produto.titulo}
                        <span className="text-ui-fg-subtle">
                          {" "}
                          · {i.produto.status === "published" ? "publicado" : "rascunho"}
                        </span>
                      </Text>
                    ) : (
                      <Text size="small" className="text-ui-fg-subtle">
                        —
                      </Text>
                    )}
                  </Table.Cell>
                  {i.bloqueio ? (
                    <>
                      <Table.Cell className="py-3">
                        <Text size="small" className="text-ui-fg-error">
                          Não dá: {i.bloqueio}.
                        </Text>
                      </Table.Cell>
                      <Table.Cell />
                      <Table.Cell />
                    </>
                  ) : i.pronto ? (
                    <>
                      <Table.Cell className="py-3">
                        <Badge size="2xsmall" color="green">
                          Pronto
                        </Badge>
                        <Text size="xsmall" className="text-ui-fg-subtle mt-1">
                          Endereço e fotos já são os da Nuvemshop.
                        </Text>
                      </Table.Cell>
                      <Table.Cell />
                      <Table.Cell />
                    </>
                  ) : (
                    <>
                      <Table.Cell className="py-3">
                        {i.endereco ? (
                          <Text size="xsmall">
                            <span className="text-ui-fg-muted line-through">
                              /produtos/{i.endereco.de}
                            </span>
                            <br />→ /produtos/{i.endereco.para}
                          </Text>
                        ) : (
                          <Text size="xsmall" className="text-ui-fg-subtle">
                            igual: /produtos/{i.nuvem.slug}
                          </Text>
                        )}
                        {i.ocupante ? (
                          <Text size="xsmall" className="text-ui-fg-muted mt-1">
                            “{i.ocupante.titulo}” (rascunho) estava com esse endereço: vira
                            /produtos/{i.ocupante.novoHandle}.
                          </Text>
                        ) : null}
                      </Table.Cell>
                      <Table.Cell className="py-3">
                        <Text size="xsmall">
                          {i.trocaFotos
                            ? `${i.nuvem.fotos.length} da Nuvemshop no lugar das ${i.produto?.fotos ?? 0} de hoje`
                            : "as mesmas"}
                        </Text>
                      </Table.Cell>
                      <Table.Cell className="py-3">
                        <Text size="xsmall" className={i.categoria ? "" : "text-ui-fg-subtle"}>
                          {i.categoria ? `${i.categoria.nome} (estava sem)` : "fica como está"}
                        </Text>
                      </Table.Cell>
                    </>
                  )}
                </Table.Row>
              ))}
            </Table.Body>
          </Table>

          {previa.falharam.length ? (
            <div className="px-6 py-4">
              <Alert variant="warning">
                Não consegui ler estas páginas da Nuvemshop:{" "}
                {previa.falharam.map((f) => `${f.slug} (${f.motivo})`).join("; ")}.
              </Alert>
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-4 px-6 py-4">
            <Text size="small" className="text-ui-fg-subtle">
              {escolhidos.length} produto(s) escolhido(s). As fotos são copiadas pro armazenamento
              da loja: o endereço de lá some com a Nuvemshop.
            </Text>
            <Button isLoading={trazendo} disabled={!escolhidos.length} onClick={trazer}>
              Trazer da Nuvemshop
            </Button>
          </div>
          {trazendo ? (
            <Text size="small" className="text-ui-fg-subtle px-6 pb-4">
              Trazendo… as fotos são copiadas uma a uma. Não feche a página.
            </Text>
          ) : null}
        </>
      )}
    </Container>
  )
}

function Lista({ titulo, itens }: { titulo: string; itens: string[] }) {
  if (!itens.length) return null
  return (
    <div className="flex flex-col gap-1">
      <Text size="small" weight="plus">
        {titulo} ({itens.length})
      </Text>
      <ul className="text-ui-fg-subtle txt-small list-disc pl-5">
        {itens.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    </div>
  )
}

function Pronto({ r }: { r: Relatorio }) {
  return (
    <Container className="divide-y p-0">
      <div className="px-6 py-4">
        <a className="text-ui-fg-subtle txt-small underline" href="/app/erp">
          ← ERP
        </a>
        <Heading level="h1" className="mt-2">
          Trazido da Nuvemshop
        </Heading>
        <Text size="small" className="text-ui-fg-subtle mt-1">
          A loja já foi avisada; a primeira visita a cada página ainda pode mostrar a versão de
          antes.
        </Text>
      </div>
      <div className="flex flex-col gap-4 px-6 py-4">
        <Lista
          titulo="Endereços trocados"
          itens={r.enderecos.map((e) => `${e.titulo}: /produtos/${e.de} → /produtos/${e.para}`)}
        />
        <Lista
          titulo="Com as fotos da Nuvemshop"
          itens={r.fotos.produtos.map((p) => `${p.titulo} — /produtos/${p.handle}`)}
        />
        <Lista
          titulo="Categoria posta"
          itens={r.categorias.map((c) => `${c.titulo}: ${c.categoria}`)}
        />
        <Lista
          titulo="Rascunhos que saíram do caminho"
          itens={r.afastados.map((a) => `${a.titulo}: /produtos/${a.de} → /produtos/${a.para}`)}
        />
        <Lista titulo="Não mudaram" itens={r.pulados.map((p) => `${p.nome}: ${p.motivo}`)} />
        <Lista titulo="Fotos que não vieram" itens={r.fotos.falharam} />
        <Text size="small" className="text-ui-fg-subtle">
          Fotos: {r.fotos.copiadas} copiada(s) pro armazenamento da loja
          {r.fotos.reaproveitadas ? `, ${r.fotos.reaproveitadas} já estavam lá` : ""}.
        </Text>
        <div className="flex gap-2">
          <Button size="small" onClick={() => window.location.assign("/app/products")}>
            Ver os produtos
          </Button>
          <Button size="small" variant="secondary" onClick={() => window.location.reload()}>
            Abrir a prévia de novo
          </Button>
        </div>
      </div>
    </Container>
  )
}

export default Nuvemshop
