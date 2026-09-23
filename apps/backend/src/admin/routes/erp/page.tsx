import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Receipt } from "@medusajs/icons"
import { Alert, Button, Container, Heading, Select, Text, toast } from "@medusajs/ui"
import { useEffect, useState } from "react"

/**
 * O ERP — a conexão com o Bling, o estoque e as notas que precisam de alguém.
 *
 * É a tela de CONECTAR (o botão leva à autorização do Bling, e a volta cai
 * aqui) e de CONFERIR: com que empresa está ligado, desde quando as notas
 * saem sozinhas, o que a última sincronização de estoque mudou, e as notas
 * que a loja não resolve sozinha — a autorizada de pedido cancelado (a API
 * não cancela: é no painel do ERP, em até 24 horas), a rejeitada, a que o
 * ERP recusou. E é a porta da importação dos produtos (`erp/catalogo`).
 *
 * E a JANELA ANTES DA NOTA: quanto ela espera depois do pagamento (o pedido
 * cancelado dentro dela não chega a ter nota), com os pedidos esperando e o
 * "Emitir agora" de cada um.
 *
 * O formato do que o backend devolve está escrito dos dois lados
 * (`GET /admin/erp`): o admin é bundle próprio e não importa código do
 * servidor.
 */

export const config = defineRouteConfig({
  label: "ERP",
  icon: Receipt,
})

type Relatorio = {
  em: string
  ok: boolean
  motivo?: string
  conferidos: number
  mudaram: { sku: string; de: number; para: number }[]
  naoAchados: string[]
  semSku: string[]
}

type Pendencia = {
  pedidoId: string
  referencia: string
  tipo: "cancelar" | "rejeitada" | "denegada" | "nao-sai" | "tentando"
  detalhe: string | null
  prazo: string | null
}

type Esperando = { pedidoId: string; referencia: string; notaEm: string }

type Situacao = {
  erp: { id: string; nome: string }
  configurado: boolean
  conectado: boolean
  empresa: string | null
  conectadoEm: string | null
  notasDesde: string | null
  janelaDaNota: number
  queda: string | null
  estoque: Relatorio | null
  pendencias: Pendencia[]
  esperando: Esperando[]
}

/** As janelas da lista; outra, gravada pela API, aparece como "N minutos". */
const JANELAS: { minutos: number; rotulo: string }[] = [
  { minutos: 0, rotulo: "Na hora do pagamento" },
  { minutos: 30, rotulo: "30 minutos depois do pagamento" },
  { minutos: 60, rotulo: "1 hora depois do pagamento" },
  { minutos: 120, rotulo: "2 horas depois do pagamento" },
  { minutos: 240, rotulo: "4 horas depois do pagamento" },
]

const hora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })

const quando = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—"

type Permissao = {
  escopo: string
  acao: "ler" | "gravar"
  paraQue: string
  ok: boolean | null
  motivo: string | null
}

type ResultadoDaNota =
  | { resultado: "autorizada"; referencia: string; numero: string | null }
  | { resultado: "processando"; referencia: string }
  | { resultado: "esperando"; referencia: string; notaEm: string }
  | { resultado: "nada"; motivo: string }
  | { resultado: "falhou"; referencia: string; motivo: string; definitivo: boolean }

const O_QUE_FAZER: Record<Pendencia["tipo"], string> = {
  cancelar: "Pedido cancelado com a nota autorizada: cancele a nota no ERP",
  rejeitada: "Rejeitada pela SEFAZ: corrija e reenvie no ERP — a loja acompanha",
  denegada: "Denegada pela SEFAZ: fale com o contador",
  "nao-sai":
    "A loja desistiu de emitir: corrija o que falta e tente de novo, ou emita à mão no ERP",
  tentando: "A nota ainda não saiu — a loja tenta de novo sozinha",
}

async function pedir<T>(
  caminho: string,
  metodo: "GET" | "POST" = "GET",
  envio?: unknown
): Promise<T> {
  const r = await fetch(caminho, {
    method: metodo,
    credentials: "include",
    ...(envio === undefined
      ? {}
      : { headers: { "content-type": "application/json" }, body: JSON.stringify(envio) }),
  })
  const corpo = await r.json().catch(() => ({}))
  if (!r.ok)
    throw new Error((corpo as { message?: string }).message ?? `o backend respondeu ${r.status}`)
  return corpo as T
}

const ErpPage = () => {
  const [s, setS] = useState<Situacao | null>(null)
  const [ocupado, setOcupado] = useState<
    "conectar" | "estoque" | "notas" | "permissoes" | "janela" | `tentar:${string}` | null
  >(null)
  const [permissoes, setPermissoes] = useState<Permissao[] | null>(null)

  const ler = () =>
    pedir<Situacao>("/admin/erp")
      .then(setS)
      .catch(() => toast.error("Não consegui ler a situação do ERP agora."))

  const conferirPermissoes = async () => {
    setOcupado("permissoes")
    try {
      const { permissoes } = await pedir<{ permissoes: Permissao[] }>(
        "/admin/erp/permissoes",
        "POST"
      )
      setPermissoes(permissoes)
    } catch (e) {
      toast.error(`Não deu pra conferir as permissões: ${e instanceof Error ? e.message : e}`)
    } finally {
      setOcupado(null)
    }
  }

  /** "Tentar de novo" e "Emitir agora": a nota sai agora, sem esperar a janela. */
  const emitirAgora = async (p: { pedidoId: string; referencia: string }) => {
    setOcupado(`tentar:${p.pedidoId}`)
    try {
      const { resultado: r } = await pedir<{ resultado: ResultadoDaNota }>(
        "/admin/erp/notas/tentar",
        "POST",
        { pedidoId: p.pedidoId }
      )
      if (r.resultado === "autorizada") toast.success(`${p.referencia}: nota autorizada.`)
      else if (r.resultado === "processando")
        toast.success(`${p.referencia}: a nota foi pra SEFAZ — a loja acompanha.`)
      else toast.error(`${p.referencia}: não saiu — ${"motivo" in r ? r.motivo : "?"}.`)
      await ler()
    } catch (e) {
      toast.error(`Não deu pra emitir: ${e instanceof Error ? e.message : e}`)
    } finally {
      setOcupado(null)
    }
  }

  const mudarJanela = async (minutos: number) => {
    setOcupado("janela")
    try {
      await pedir("/admin/erp/notas/janela", "POST", { minutos })
      toast.success(
        minutos
          ? "Pronto. A janela vale também pros pedidos que já estão esperando."
          : "Pronto. A nota sai na hora — os que estavam esperando saem na próxima varredura."
      )
      await ler()
    } catch (e) {
      toast.error(`Não deu pra mudar: ${e instanceof Error ? e.message : e}`)
    } finally {
      setOcupado(null)
    }
  }

  useEffect(() => {
    const busca = new URLSearchParams(window.location.search)
    if (busca.get("conectado")) {
      toast.success("Conectado. As notas e o estoque passam a andar sozinhos.")
      // Logo depois de conectar: a hora de ver se o app tem todas as permissões.
      void conferirPermissoes()
    }
    const erro = busca.get("erro")
    if (erro) toast.error(`A conexão não foi concluída: ${erro}`)
    if (busca.has("conectado") || erro)
      window.history.replaceState(null, "", window.location.pathname)
    ler()
  }, [])

  const conectar = async () => {
    setOcupado("conectar")
    try {
      const { url } = await pedir<{ url: string }>("/admin/erp/conectar", "POST")
      window.location.assign(url)
    } catch (e) {
      toast.error(`Não deu pra começar a conexão: ${e instanceof Error ? e.message : e}`)
      setOcupado(null)
    }
  }

  const sincronizar = async () => {
    setOcupado("estoque")
    try {
      const { relatorio } = await pedir<{ relatorio: Relatorio }>("/admin/erp/estoque", "POST")
      toast.success(
        relatorio.ok
          ? relatorio.mudaram.length
            ? `Estoque atualizado em ${relatorio.mudaram.length} produto(s).`
            : "Estoque conferido: nada mudou."
          : `O estoque não foi lido: ${relatorio.motivo}`
      )
      await ler()
    } catch (e) {
      toast.error(`Não deu pra sincronizar: ${e instanceof Error ? e.message : e}`)
    } finally {
      setOcupado(null)
    }
  }

  const conferirNotas = async () => {
    setOcupado("notas")
    try {
      const { relatorio } = await pedir<{
        relatorio: {
          emitidas: string[]
          autorizadas: string[]
          esperando: string[]
          falharam: string[]
          pendentes: number
        }
      }>("/admin/erp/notas", "POST")
      toast.success(
        `Notas conferidas: ${relatorio.emitidas.length} emitida(s), ` +
          `${relatorio.autorizadas.length} autorizada(s)` +
          (relatorio.esperando.length
            ? `, ${relatorio.esperando.length} pedido(s) no ${s?.erp.nome ?? "ERP"} esperando a janela`
            : "") +
          (relatorio.falharam.length ? `, ${relatorio.falharam.length} com problema.` : ".")
      )
      await ler()
    } catch (e) {
      toast.error(`Não deu pra conferir as notas: ${e instanceof Error ? e.message : e}`)
    } finally {
      setOcupado(null)
    }
  }

  if (!s) {
    return (
      <Container className="p-6">
        <Text>Carregando…</Text>
      </Container>
    )
  }

  const nome = s.erp.nome
  const estoque = s.estoque

  return (
    <Container className="divide-y p-0">
      <div className="px-6 py-4">
        <Heading level="h1">ERP — {nome}</Heading>
        <Text size="small" className="text-ui-fg-subtle mt-1">
          O {nome} manda no estoque (a loja copia o saldo) e emite a nota fiscal de cada pedido
          pago: o pedido de venda vai pra lá na hora, e a nota, depois da janela de cancelamento.
          Autorizada, ela segue pro painel da Frenet junto do pedido.
        </Text>
      </div>

      <div className="flex flex-col gap-3 px-6 py-4">
        <Heading level="h2">Conexão</Heading>
        {!s.configurado ? (
          <Alert variant="warning">
            Falta o app do {nome}: crie um aplicativo privado na Central de Extensões do {nome}{" "}
            (Área do Integrador) e ponha o client id e o client secret no Railway — BLING_CLIENT_ID
            e BLING_CLIENT_SECRET. O passo a passo está no ESTADO do projeto.
          </Alert>
        ) : s.conectado ? (
          <>
            <Text size="small">
              Conectado{s.empresa ? ` à empresa ${s.empresa}` : ""} desde {quando(s.conectadoEm)}.
              As notas saem sozinhas pros pedidos pagos desde {quando(s.notasDesde)} — os de antes
              seguem com a nota feita à mão.
            </Text>
            <div>
              <Button
                size="small"
                variant="secondary"
                isLoading={ocupado === "conectar"}
                onClick={conectar}
              >
                Conectar de novo
              </Button>
            </div>
          </>
        ) : (
          <>
            {s.queda ? (
              <Alert variant="error">
                A conexão caiu: {s.queda}. Enquanto não conectar de novo, a loja não emite nota nem
                atualiza o estoque.
              </Alert>
            ) : (
              <Text size="small">
                Ainda não conectado. O botão leva à tela de autorização do {nome}; entre com o
                usuário administrador da conta.
              </Text>
            )}
            <div>
              <Button size="small" isLoading={ocupado === "conectar"} onClick={conectar}>
                Conectar o {nome}
              </Button>
            </div>
          </>
        )}
      </div>

      {s.conectado ? (
        <>
          <div className="flex flex-col gap-3 px-6 py-4">
            <Heading level="h2">Quando a nota sai</Heading>
            <Text size="small">
              O pedido de venda vai pro {nome} na hora do pagamento. A nota espera: se o pedido for
              cancelado antes, a loja cancela o pedido de venda lá sozinha, e não há nota pra
              cancelar (a API do {nome} não cancela nota autorizada). A etiqueta da Frenet espera a
              nota.
            </Text>
            <div className="w-full max-w-xs">
              <Select
                value={String(s.janelaDaNota)}
                onValueChange={(v) => mudarJanela(Number(v))}
                disabled={ocupado === "janela"}
              >
                <Select.Trigger>
                  <Select.Value />
                </Select.Trigger>
                <Select.Content>
                  {(JANELAS.some((j) => j.minutos === s.janelaDaNota)
                    ? JANELAS
                    : [
                        ...JANELAS,
                        {
                          minutos: s.janelaDaNota,
                          rotulo: `${s.janelaDaNota} minutos depois do pagamento`,
                        },
                      ]
                  ).map((j) => (
                    <Select.Item key={j.minutos} value={String(j.minutos)}>
                      {j.rotulo}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select>
            </div>
            {s.esperando.length ? (
              <ul className="flex flex-col gap-2">
                {s.esperando.map((p) => (
                  <li key={p.pedidoId} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <Text size="small">
                      <a className="underline" href={`/app/orders/${p.pedidoId}`}>
                        {p.referencia}
                      </a>{" "}
                      — a nota sai depois de {hora(p.notaEm)}.
                    </Text>
                    <Button
                      size="small"
                      variant="secondary"
                      isLoading={ocupado === `tentar:${p.pedidoId}`}
                      onClick={() => emitirAgora(p)}
                    >
                      Emitir agora
                    </Button>
                  </li>
                ))}
              </ul>
            ) : s.janelaDaNota ? (
              <Text size="small" className="text-ui-fg-subtle">
                Nenhum pedido esperando a nota agora.
              </Text>
            ) : null}
            {s.esperando.length ? (
              <Text size="small" className="text-ui-fg-subtle">
                Precisa despachar antes? Use &quot;Emitir agora&quot; — não emita a nota à mão no{" "}
                {nome}, senão ela sai duas vezes.
              </Text>
            ) : null}
          </div>

          <div className="flex flex-col gap-3 px-6 py-4">
            <Heading level="h2">Notas que precisam de alguém</Heading>
            {s.pendencias.length ? (
              <ul className="flex flex-col gap-2">
                {s.pendencias.map((p) => (
                  <li key={`${p.pedidoId}-${p.tipo}`}>
                    <Alert variant={p.tipo === "cancelar" ? "error" : "warning"}>
                      <div className="flex flex-col gap-1">
                        <Text size="small" weight="plus">
                          <a className="underline" href={`/app/orders/${p.pedidoId}`}>
                            {p.referencia}
                          </a>{" "}
                          — {O_QUE_FAZER[p.tipo]}
                          {p.tipo === "cancelar" && p.prazo ? ` até ${quando(p.prazo)}` : ""}
                          {p.tipo === "tentando" && p.prazo
                            ? ` (a próxima tentativa é às ${quando(p.prazo)})`
                            : ""}
                          .
                        </Text>
                        {p.detalhe ? (
                          <Text size="small" className="text-ui-fg-subtle">
                            {p.detalhe}
                          </Text>
                        ) : null}
                        {p.tipo === "nao-sai" ? (
                          <div className="mt-1">
                            <Button
                              size="small"
                              variant="secondary"
                              isLoading={ocupado === `tentar:${p.pedidoId}`}
                              onClick={() => emitirAgora(p)}
                            >
                              Tentar de novo
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    </Alert>
                  </li>
                ))}
              </ul>
            ) : (
              <Text size="small" className="text-ui-fg-subtle">
                Nenhuma nos últimos 7 dias.
              </Text>
            )}
            <div>
              <Button
                size="small"
                variant="secondary"
                isLoading={ocupado === "notas"}
                onClick={conferirNotas}
              >
                Conferir as notas agora
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-3 px-6 py-4">
            <Heading level="h2">Permissões do app no {nome}</Heading>
            <Text size="small" className="text-ui-fg-subtle">
              O {nome} só deixa a loja mexer no que o app da loja tem permissão (os escopos). Quando
              falta uma, ele responde &quot;sem permissão&quot; (403) — aqui a loja confere uma por
              uma.
            </Text>
            {permissoes ? (
              <ul className="flex flex-col gap-1">
                {permissoes.map((p) => (
                  <li key={`${p.escopo}-${p.acao}-${p.paraQue}`}>
                    <Text
                      size="small"
                      className={
                        p.ok === false ? "text-ui-fg-error" : p.ok ? "" : "text-ui-fg-subtle"
                      }
                    >
                      {p.ok === false ? "✗" : p.ok ? "✓" : "?"} {p.escopo} ({p.acao})
                      <span className="text-ui-fg-subtle"> — {p.paraQue}</span>
                      {p.ok === null && p.motivo ? ` (não deu pra conferir: ${p.motivo})` : ""}
                    </Text>
                  </li>
                ))}
              </ul>
            ) : null}
            {permissoes?.some((p) => p.ok === false) ? (
              <Alert variant="error">
                Falta permissão no app:{" "}
                {[
                  ...new Set(
                    permissoes.filter((p) => p.ok === false).map((p) => `“${p.escopo}” (${p.acao})`)
                  ),
                ].join(", ")}
                . No {nome}, em Central de Extensões → Área do Integrador → o app da loja, marque o
                que falta nos escopos e salve. Onde falta &quot;gravar&quot; e a leitura passou, o
                escopo está lá, mas sem a permissão de inserir e editar: procure, dentro dele, a
                opção de gerenciar (ou inserir e editar). Depois, aqui, clique em &quot;Conectar de
                novo&quot; — a loja tenta de novo sozinha as notas que ficaram esperando.
              </Alert>
            ) : permissoes?.every((p) => p.ok) ? (
              <Text size="small">Todas as permissões que a loja usa estão no app.</Text>
            ) : null}
            <div>
              <Button
                size="small"
                variant="secondary"
                isLoading={ocupado === "permissoes"}
                onClick={conferirPermissoes}
              >
                Conferir as permissões
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-3 px-6 py-4">
            <Heading level="h2">Estoque</Heading>
            {estoque ? (
              <>
                <Text size="small">
                  Última sincronização: {quando(estoque.em)}
                  {estoque.ok
                    ? ` — ${estoque.conferidos} produto(s) conferido(s), ${
                        estoque.mudaram.length ? `${estoque.mudaram.length} mudaram` : "nada mudou"
                      }.`
                    : ` — não deu: ${estoque.motivo}.`}
                </Text>
                {estoque.mudaram.length ? (
                  <Text size="small" className="text-ui-fg-subtle">
                    {estoque.mudaram.map((m) => `${m.sku}: ${m.de} → ${m.para}`).join(" · ")}
                  </Text>
                ) : null}
                {estoque.naoAchados.length ? (
                  <Alert variant="warning">
                    Sem produto ativo com este SKU no {nome}: {estoque.naoAchados.join(", ")}. O
                    estoque deles não é mexido — confira o código do produto nos dois lados.
                  </Alert>
                ) : null}
                {estoque.semSku.length ? (
                  <Alert variant="warning">
                    Sem SKU na loja (não há como achar no {nome}): {estoque.semSku.join(", ")}.
                  </Alert>
                ) : null}
              </>
            ) : (
              <Text size="small" className="text-ui-fg-subtle">
                Ainda não sincronizou. Acontece sozinho a cada 5 minutos.
              </Text>
            )}
            <div>
              <Button
                size="small"
                variant="secondary"
                isLoading={ocupado === "estoque"}
                onClick={sincronizar}
              >
                Sincronizar agora
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-3 px-6 py-4">
            <Heading level="h2">Produtos</Heading>
            <Text size="small">
              Trazer do {nome} os produtos do site: nome, descrição, preço, peso, medidas e fotos.
              Da loja da Nuvemshop, o endereço de cada produto e as fotos da vitrine. Nos dois,
              primeiro você vê a prévia; nada muda até confirmar.
            </Text>
            <div className="flex flex-wrap gap-2">
              <Button
                size="small"
                variant="secondary"
                onClick={() => window.location.assign("/app/erp/catalogo")}
              >
                Importar produtos do {nome}
              </Button>
              <Button
                size="small"
                variant="secondary"
                onClick={() => window.location.assign("/app/nuvemshop")}
              >
                Endereços e fotos da Nuvemshop
              </Button>
            </div>
          </div>
        </>
      ) : null}
    </Container>
  )
}

export default ErpPage
