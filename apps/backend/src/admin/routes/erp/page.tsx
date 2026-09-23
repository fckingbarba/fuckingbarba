import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Receipt } from "@medusajs/icons"
import { Alert, Button, Container, Heading, Text, toast } from "@medusajs/ui"
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
  tipo: "cancelar" | "rejeitada" | "denegada" | "nao-sai"
  detalhe: string | null
  prazo: string | null
}

type Situacao = {
  erp: { id: string; nome: string }
  configurado: boolean
  conectado: boolean
  empresa: string | null
  conectadoEm: string | null
  notasDesde: string | null
  queda: string | null
  estoque: Relatorio | null
  pendencias: Pendencia[]
}

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

const O_QUE_FAZER: Record<Pendencia["tipo"], string> = {
  cancelar: "Pedido cancelado com a nota autorizada: cancele a nota no ERP",
  rejeitada: "Rejeitada pela SEFAZ: corrija e reenvie no ERP — a loja acompanha",
  denegada: "Denegada pela SEFAZ: fale com o contador",
  "nao-sai": "A loja não consegue emitir: emita à mão no ERP",
}

async function pedir<T>(caminho: string, metodo: "GET" | "POST" = "GET"): Promise<T> {
  const r = await fetch(caminho, { method: metodo, credentials: "include" })
  const corpo = await r.json().catch(() => ({}))
  if (!r.ok)
    throw new Error((corpo as { message?: string }).message ?? `o backend respondeu ${r.status}`)
  return corpo as T
}

const ErpPage = () => {
  const [s, setS] = useState<Situacao | null>(null)
  const [ocupado, setOcupado] = useState<"conectar" | "estoque" | "notas" | null>(null)

  const ler = () =>
    pedir<Situacao>("/admin/erp")
      .then(setS)
      .catch(() => toast.error("Não consegui ler a situação do ERP agora."))

  useEffect(() => {
    const busca = new URLSearchParams(window.location.search)
    if (busca.get("conectado"))
      toast.success("Conectado. As notas e o estoque passam a andar sozinhos.")
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
          falharam: string[]
          pendentes: number
        }
      }>("/admin/erp/notas", "POST")
      toast.success(
        `Notas conferidas: ${relatorio.emitidas.length} emitida(s), ` +
          `${relatorio.autorizadas.length} autorizada(s)` +
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
          pago, que vai pra SEFAZ na hora e segue pro painel da Frenet junto do pedido.
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
                          {p.tipo === "cancelar" && p.prazo ? ` até ${quando(p.prazo)}` : ""}.
                        </Text>
                        {p.detalhe ? (
                          <Text size="small" className="text-ui-fg-subtle">
                            {p.detalhe}
                          </Text>
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
              Primeiro você vê a prévia e escolhe o que entra; nada muda até confirmar.
            </Text>
            <div>
              <Button
                size="small"
                variant="secondary"
                onClick={() => window.location.assign("/app/erp/catalogo")}
              >
                Importar produtos do {nome}
              </Button>
            </div>
          </div>
        </>
      ) : null}
    </Container>
  )
}

export default ErpPage
