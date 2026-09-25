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
 * IMPORTAR OS PRODUTOS DO ERP — a prévia, a escolha e a troca.
 *
 * Abre pela tela do ERP (não fica no menu: é coisa de fazer uma vez, ou de
 * vez em quando). Primeiro só MOSTRA: cada produto do ERP, o que acontece
 * com ele no site, e quais produtos do site saem. A pessoa desmarca o que
 * não é de vender (insumo, embalagem) e o que quer manter no site. Nada muda
 * até "Trocar os produtos".
 *
 * O formato do que o backend devolve está escrito dos dois lados
 * (`lib/erp/catalogo.ts`): o admin é bundle próprio e não importa código do
 * servidor.
 */

type Medidas = { comprimento: number; largura: number; altura: number }

type ProdutoDoErp = {
  id: string
  nome: string
  skus: string[]
  como: "atualiza" | "recria" | "novo"
  handle: string
  primeira: boolean
  /** O nome dado no painel: fica no lugar do nome do ERP. */
  nomeDaLoja: string | null
  bloqueio: string | null
  avisos: string[]
  noSite: string[]
  preco: { de: number; ate: number } | null
  /** O preço foi mudado no painel: o do ERP não entra. */
  precoDoPainel: boolean
  pesoGramas: number | null
  medidas: Medidas | null
  fotos: string[]
  variacoes: number
  composicao: boolean
  descricao: string | null
}

type ProdutoDoSite = {
  id: string
  titulo: string
  handle: string
  status: string
  skus: string[]
  categorias: string[]
  preco: number | null
  precoDe: number | null
  pesoGramas: number | null
  medidas: Medidas | null
  fotos: number
  temTextos: boolean
  esperando: number
}

type Previa = {
  erp: { id: string; nome: string }
  lidoEm: string
  produtos: ProdutoDoErp[]
  doSite: ProdutoDoSite[]
  restantes: number
}

type Resumo = { titulo: string; handle: string }

type Relatorio = {
  atualizados: Resumo[]
  recriados: Resumo[]
  criados: Resumo[]
  removidos: Resumo[]
  rascunho: Resumo[]
  pulados: { nome: string; motivo: string }[]
  fotos: { copiadas: number; reaproveitadas: number; falharam: string[] }
  promocoes: { precos: number; listas: string[] }
  estoque: { ok: boolean; mudaram: number; motivo?: string } | null
  avisos: string[]
}

const reais = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
const faixa = (p: ProdutoDoErp["preco"]) =>
  !p ? "—" : p.de === p.ate ? reais(p.de) : `${reais(p.de)} a ${reais(p.ate)}`
const caixa = (m: Medidas | null) => (m ? `${m.comprimento} × ${m.largura} × ${m.altura} cm` : "—")
const peso = (g: number | null) => (g ? `${g} g` : "—")
const mesmaCaixa = (a: Medidas | null, b: Medidas | null) =>
  Boolean(
    a && b && a.comprimento === b.comprimento && a.largura === b.largura && a.altura === b.altura
  )

async function pedir<T>(caminho: string, corpo?: unknown): Promise<T> {
  const r = await fetch(caminho, {
    method: corpo === undefined ? "GET" : "POST",
    credentials: "include",
    ...(corpo === undefined
      ? {}
      : { headers: { "content-type": "application/json" }, body: JSON.stringify(corpo) }),
  })
  const resposta = await r.json().catch(() => ({}))
  if (!r.ok) {
    const m = (resposta as { message?: string }).message
    throw new Error(
      m === "erp_desconectado"
        ? "o ERP não está conectado"
        : (m ?? `o backend respondeu ${r.status}`)
    )
  }
  return resposta as T
}

/** Antes → depois, quando muda; só o de depois, quando é novo ou igual. */
function Troca({ antes, depois, muda }: { antes: string | null; depois: string; muda: boolean }) {
  if (!antes || !muda) return <>{depois}</>
  return (
    <>
      <span className="text-ui-fg-muted line-through">{antes}</span> → {depois}
    </>
  )
}

const CatalogoDoErp = () => {
  const [previa, setPrevia] = useState<Previa | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [marcados, setMarcados] = useState<Set<string>>(new Set())
  const [manter, setManter] = useState<Set<string>>(new Set())
  const [trocando, setTrocando] = useState(false)
  const [relatorio, setRelatorio] = useState<Relatorio | null>(null)
  const perguntar = usePrompt()

  const ler = () => {
    setPrevia(null)
    setErro(null)
    pedir<Previa>("/admin/erp/catalogo")
      .then((p) => {
        setPrevia(p)
        setMarcados(new Set(p.produtos.filter((x) => !x.bloqueio).map((x) => x.id)))
        setManter(new Set())
      })
      .catch((e) => setErro(e instanceof Error ? e.message : String(e)))
  }
  useEffect(ler, [])

  const doSite = useMemo(() => new Map((previa?.doSite ?? []).map((s) => [s.id, s])), [previa])
  // Sai do site o que nenhum marcado cobre. O bloqueado (sem preço, sem SKU)
  // também protege o do site: ele fica como está, em vez de sumir por causa
  // de um cadastro incompleto no ERP.
  const saem = useMemo(() => {
    if (!previa) return []
    const cobertos = new Set(
      previa.produtos.filter((p) => marcados.has(p.id) || p.bloqueio).flatMap((p) => p.noSite)
    )
    return previa.doSite.filter((s) => !cobertos.has(s.id))
  }, [previa, marcados])

  const escolhidos = previa?.produtos.filter((p) => marcados.has(p.id)) ?? []
  const substituidos = escolhidos.filter((p) => p.como !== "novo")
  const novos = escolhidos.filter((p) => p.como === "novo")
  const remover = saem.filter((s) => !manter.has(s.id))
  const comTextos = [
    ...substituidos.filter((p) => p.primeira).flatMap((p) => p.noSite.map((id) => doSite.get(id))),
    ...remover,
  ].filter((s) => s?.temTextos).length

  const alternar = (conjunto: Set<string>, id: string) => {
    const novo = new Set(conjunto)
    if (novo.has(id)) novo.delete(id)
    else novo.add(id)
    return novo
  }

  const trocar = async () => {
    const sim = await perguntar({
      title: "Trocar os produtos do site?",
      description:
        `${substituidos.length} substituído(s), ${novos.length} novo(s) em rascunho e ` +
        `${remover.length} saindo do site. Não dá pra desfazer pelo admin.`,
      confirmText: "Trocar",
      cancelText: "Cancelar",
    })
    if (!sim) return
    setTrocando(true)
    try {
      const { relatorio } = await pedir<{ relatorio: Relatorio }>("/admin/erp/catalogo", {
        importar: escolhidos.map((p) => p.id),
        remover: remover.map((s) => s.id),
      })
      setRelatorio(relatorio)
      toast.success("Produtos trocados.")
      window.scrollTo({ top: 0 })
    } catch (e) {
      toast.error(`A troca não terminou: ${e instanceof Error ? e.message : e}`)
    } finally {
      setTrocando(false)
    }
  }

  const nome = previa?.erp.nome ?? "ERP"

  if (relatorio) return <Pronto relatorio={relatorio} nome={nome} />

  return (
    <Container className="divide-y p-0">
      <div className="px-6 py-4">
        <a className="text-ui-fg-subtle txt-small underline" href="/app/erp">
          ← ERP
        </a>
        <Heading level="h1" className="mt-2">
          Importar os produtos do {nome}
        </Heading>
        <Text size="small" className="text-ui-fg-subtle mt-1">
          O site passa a ter os produtos que você marcar aqui, com o nome, a descrição, o preço, o
          peso, as medidas e as fotos do {nome}. Nada muda até você confirmar lá embaixo.
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
          Lendo os produtos do ERP… leva uns segundos por produto.
        </Text>
      ) : (
        <>
          <div className="flex flex-col gap-3 px-6 py-4">
            <Heading level="h2">O que vem do {nome}</Heading>
            <Text size="small" className="text-ui-fg-subtle">
              {previa.produtos.length} produto(s) ativo(s). Desmarque o que não é de vender, como
              insumo e embalagem.
            </Text>
            {previa.restantes ? (
              <Alert variant="warning">
                Mais {previa.restantes} produto(s) ativo(s) ficaram de fora desta leitura (ela lê
                até 150 por vez).
              </Alert>
            ) : null}
          </div>
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell />
                <Table.HeaderCell>Produto no {nome}</Table.HeaderCell>
                <Table.HeaderCell>Preço</Table.HeaderCell>
                <Table.HeaderCell>Peso</Table.HeaderCell>
                <Table.HeaderCell>Caixa</Table.HeaderCell>
                <Table.HeaderCell>No site</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {previa.produtos.map((p) => {
                const hoje = doSite.get(p.noSite[0] ?? "")
                // O preço do produto (o "de", quando há promoção): é ele que o ERP troca, e a
                // promoção fica.
                const precoHoje = hoje ? (hoje.precoDe ?? hoje.preco) : null
                const fora = !p.bloqueio && !marcados.has(p.id)
                return (
                  <Table.Row key={p.id} className={`align-top ${fora ? "opacity-60" : ""}`}>
                    <Table.Cell className="w-8 pt-4">
                      <Checkbox
                        disabled={Boolean(p.bloqueio)}
                        checked={marcados.has(p.id)}
                        onCheckedChange={() => setMarcados((m) => alternar(m, p.id))}
                      />
                    </Table.Cell>
                    <Table.Cell className="py-3">
                      <div className="flex gap-3">
                        {p.fotos[0] ? (
                          <img
                            src={p.fotos[0]}
                            alt=""
                            className="h-12 w-12 shrink-0 rounded object-cover"
                          />
                        ) : (
                          <div className="bg-ui-bg-subtle h-12 w-12 shrink-0 rounded" />
                        )}
                        <div className="flex flex-col gap-1">
                          <Text size="small" weight="plus">
                            {p.nome}
                          </Text>
                          <Text size="xsmall" className="text-ui-fg-subtle">
                            {p.skus.join(" · ") || "sem SKU"} · {p.fotos.length} foto(s)
                            {p.variacoes ? ` · ${p.variacoes} variações` : ""}
                            {p.composicao ? " · kit" : ""}
                          </Text>
                          {p.avisos.map((a) => (
                            <Text key={a} size="xsmall" className="text-ui-fg-muted">
                              {a}
                            </Text>
                          ))}
                        </div>
                      </div>
                    </Table.Cell>
                    <Table.Cell className="whitespace-nowrap py-3">
                      <Troca
                        antes={precoHoje !== null ? reais(precoHoje) : null}
                        depois={
                          p.precoDoPainel && precoHoje !== null ? reais(precoHoje) : faixa(p.preco)
                        }
                        muda={
                          !p.precoDoPainel &&
                          precoHoje !== null &&
                          (!p.preco || p.preco.de !== precoHoje)
                        }
                      />
                      {hoje?.precoDe && p.como !== "novo" && p.primeira ? (
                        <Text size="xsmall" className="text-ui-fg-muted">
                          sai o “de {reais(hoje.precoDe)}”
                        </Text>
                      ) : null}
                    </Table.Cell>
                    <Table.Cell className="whitespace-nowrap py-3">
                      <Troca
                        antes={hoje ? peso(hoje.pesoGramas) : null}
                        depois={peso(p.pesoGramas ?? (hoje?.pesoGramas || null))}
                        muda={Boolean(p.pesoGramas && hoje && p.pesoGramas !== hoje.pesoGramas)}
                      />
                    </Table.Cell>
                    <Table.Cell className="whitespace-nowrap py-3">
                      <Troca
                        antes={hoje ? caixa(hoje.medidas) : null}
                        depois={caixa(p.medidas ?? hoje?.medidas ?? null)}
                        muda={Boolean(p.medidas && hoje && !mesmaCaixa(p.medidas, hoje.medidas))}
                      />
                    </Table.Cell>
                    <Table.Cell className="py-3">
                      {p.bloqueio ? (
                        <Text size="small" className="text-ui-fg-error">
                          Não entra: {p.bloqueio}.{hoje ? ` “${hoje.titulo}” fica como está.` : ""}
                        </Text>
                      ) : fora ? (
                        <Text size="small" className="text-ui-fg-subtle">
                          Fica de fora.
                          {hoje
                            ? ` “${hoje.titulo}”, que está no site, entra na lista dos que saem.`
                            : ""}
                        </Text>
                      ) : p.como === "novo" ? (
                        <>
                          <Badge size="2xsmall" color="blue">
                            Novo
                          </Badge>
                          <Text size="xsmall" className="text-ui-fg-subtle mt-1">
                            Entra em rascunho, sem categoria: /produtos/{p.handle}
                          </Text>
                        </>
                      ) : (
                        <>
                          <Badge
                            size="2xsmall"
                            color={p.como === "recria" ? "orange" : p.primeira ? "green" : "grey"}
                          >
                            {p.como === "recria"
                              ? "Substitui (nasce de novo)"
                              : p.primeira
                                ? "Substitui"
                                : "Atualiza"}
                          </Badge>
                          <Text size="xsmall" className="text-ui-fg-subtle mt-1">
                            {hoje?.titulo} · /produtos/{p.handle}
                            {hoje?.categorias.length ? ` · ${hoje.categorias.join(", ")}` : ""}
                          </Text>
                          {!p.primeira ? (
                            <Text size="xsmall" className="text-ui-fg-muted">
                              Já veio do {nome}: muda só {p.nomeDaLoja ? "" : "nome, "}descrição,
                              preço, peso e medidas.
                            </Text>
                          ) : null}
                          {p.nomeDaLoja ? (
                            <Text size="xsmall" className="text-ui-fg-muted">
                              O nome na loja fica “{p.nomeDaLoja}” (dado no painel).
                            </Text>
                          ) : null}
                        </>
                      )}
                    </Table.Cell>
                  </Table.Row>
                )
              })}
            </Table.Body>
          </Table>

          <div className="flex flex-col gap-3 px-6 py-4">
            <Heading level="h2">Saem do site</Heading>
            {saem.length ? (
              <>
                <Text size="small" className="text-ui-fg-subtle">
                  Os produtos do site que nenhum marcado acima substitui. Desmarque o que quiser
                  manter como está.
                </Text>
                <ul className="flex flex-col gap-2">
                  {saem.map((s) => (
                    <li key={s.id} className="flex items-start gap-3">
                      <Checkbox
                        className="mt-0.5"
                        checked={!manter.has(s.id)}
                        onCheckedChange={() => setManter((m) => alternar(m, s.id))}
                      />
                      <div>
                        <Text size="small" weight="plus">
                          {s.titulo}{" "}
                          <span className="text-ui-fg-subtle font-normal">
                            {s.status === "published" ? "· publicado" : "· rascunho"} · /produtos/
                            {s.handle}
                            {s.skus.length ? ` · ${s.skus.join(", ")}` : ""}
                          </span>
                        </Text>
                        {s.esperando ? (
                          <Text size="xsmall" className="text-ui-fg-subtle">
                            Tem {s.esperando} pedido(s) esperando envio: vira rascunho em vez de
                            sair (o pedido continua de pé). Apague depois de enviar.
                          </Text>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <Text size="small" className="text-ui-fg-subtle">
                Nenhum produto sai.
              </Text>
            )}
          </div>

          <div className="flex flex-col gap-2 px-6 py-4">
            <Heading level="h2">O que muda na loja</Heading>
            <ul className="text-ui-fg-subtle txt-small flex list-disc flex-col gap-1 pl-5">
              <li>
                O substituído fica com o nome, a descrição, o preço, o peso, as medidas e as fotos
                do {nome}, no mesmo endereço e nas mesmas categorias. A sacola de quem está
                comprando e os pedidos em andamento continuam valendo.
              </li>
              <li>
                Na primeira vez de cada produto, saem o subtítulo, os textos da página (os blocos
                editados no admin) e o preço “de/por”
                {comTextos ? ` — ${comTextos} produto(s) têm esses textos hoje` : ""}. Promoção nova
                se cria no painel, na lista de produtos (o promocional).
              </li>
              <li>
                O que já veio do {nome} antes (“Atualiza”) muda só nome, descrição, preço, peso e
                medidas: as fotos, os textos e as promoções de hoje ficam.
              </li>
              <li>
                O preço mudado no painel (na lista de produtos) fica: o do {nome} não entra nesse
                produto.
              </li>
              <li>
                A descrição do {nome} vai pro Google e pra busca da loja. A página do produto não
                tem um bloco de descrição.
              </li>
              <li>Os novos entram em rascunho, sem categoria: revise e publique em Produtos.</li>
              <li>O desconto por quantidade e as ofertas do checkout se refazem sozinhos.</li>
              <li>Quem tiver na sacola um produto que sai vai ver o item indisponível.</li>
            </ul>
          </div>

          <div className="flex items-center justify-between gap-4 px-6 py-4">
            <Text size="small" className="text-ui-fg-subtle">
              {substituidos.length} substituído(s) · {novos.length} novo(s) · {remover.length}{" "}
              saindo
            </Text>
            <Button
              variant="danger"
              isLoading={trocando}
              disabled={!escolhidos.length && !remover.length}
              onClick={trocar}
            >
              Trocar os produtos
            </Button>
          </div>
          {trocando ? (
            <Text size="small" className="text-ui-fg-subtle px-6 pb-4">
              Trocando… pode levar alguns minutos: as fotos são copiadas uma a uma. Não feche a
              página.
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

function Pronto({ relatorio: r, nome }: { relatorio: Relatorio; nome: string }) {
  const endereco = (x: Resumo) => `${x.titulo} — /produtos/${x.handle}`
  return (
    <Container className="divide-y p-0">
      <div className="px-6 py-4">
        <a className="text-ui-fg-subtle txt-small underline" href="/app/erp">
          ← ERP
        </a>
        <Heading level="h1" className="mt-2">
          Produtos trocados
        </Heading>
        <Text size="small" className="text-ui-fg-subtle mt-1">
          Os novos estão em rascunho: revise e publique em Produtos. Ao publicar, o estoque do{" "}
          {nome} chega em até 5 minutos.
        </Text>
      </div>
      <div className="flex flex-col gap-4 px-6 py-4">
        <Lista titulo="Substituídos" itens={[...r.atualizados, ...r.recriados].map(endereco)} />
        <Lista titulo="Novos, em rascunho" itens={r.criados.map(endereco)} />
        <Lista titulo="Saíram do site" itens={r.removidos.map(endereco)} />
        <Lista
          titulo="Ficaram em rascunho (têm pedido esperando envio)"
          itens={r.rascunho.map(endereco)}
        />
        <Lista titulo="Não entraram" itens={r.pulados.map((p) => `${p.nome}: ${p.motivo}`)} />
        <Lista titulo="Fotos que não vieram" itens={r.fotos.falharam} />
        <Lista titulo="Avisos" itens={r.avisos} />
        <Text size="small" className="text-ui-fg-subtle">
          Fotos: {r.fotos.copiadas} copiada(s) pro armazenamento da loja
          {r.fotos.reaproveitadas ? `, ${r.fotos.reaproveitadas} já estavam lá` : ""}.
          {r.promocoes.precos || r.promocoes.listas.length
            ? ` Promoções: ${r.promocoes.precos} preço(s) “de/por” tirado(s)` +
              (r.promocoes.listas.length
                ? `; lista(s) que ficaram vazias e foram apagadas: ${r.promocoes.listas.join(", ")}.`
                : ".")
            : ""}
          {r.estoque
            ? r.estoque.ok
              ? ` Estoque sincronizado com o ${nome} (${r.estoque.mudaram} mudaram).`
              : ` O estoque não sincronizou agora (${r.estoque.motivo}); o job tenta em 5 minutos.`
            : ""}
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

export default CatalogoDoErp
