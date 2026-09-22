import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { AdminOrder, DetailWidgetProps } from "@medusajs/framework/types"
import { Alert, Button, Container, Heading, Text, toast } from "@medusajs/ui"
import { useState } from "react"

/**
 * A FAIXA DO ESTORNO QUE NÃO SAIU, na página do pedido.
 *
 * O Medusa marca "Refunded" quando PEDE o estorno; se o Pagar.me não faz, o
 * resto da página continua dizendo que devolveu. Esta faixa é o que a
 * conciliação anotou no pedido (`metadata.estornos`, ver
 * `src/lib/estornos.ts`) — pra aparecer, ela não pergunta nada a ninguém,
 * só lê.
 *
 * ONDE ELA APARECE: o Medusa 2.21 põe widget no FIM da coluna principal,
 * seja qual for a zona (`before` e `after` caem no mesmo lugar). Quem
 * quiser ela no topo arrasta uma vez, no ajuste do layout (o ícone de
 * controles no canto do cabeçalho) — a escolha fica guardada.
 *
 * O formato do registro está escrito dos dois lados: o admin é bundle
 * próprio e não importa código do servidor (como no `pdp.tsx`). Quem
 * confere que os dois concordam é o `conferir-pagamento.mjs`.
 */

export const config = defineWidgetConfig({ zone: "order.details.before" })

type Registro = {
  situacao?: "falhou" | "devolvido"
  esperado?: number
  devolvido?: number
  cobranca?: string
  forma?: "pix" | "cartao"
  desde?: string
  motivo?: string
  tentativas?: number
  proxima?: string | null
  confirmado?: string
  sozinha?: boolean
}

type Resposta = { resultado?: string; motivo?: string }

const reais = (centavos: number) =>
  (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })

/** "22/09 às 13:39", na hora de quem está olhando. */
function quando(iso: string | null | undefined): string {
  if (!iso) return ""
  const d = new Date(iso)
  const dia = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
  return `${dia} às ${hora}`
}

const vezes = (n: number) => `${n} ${n === 1 ? "vez" : "vezes"}`

/** O que dizer depois do botão. `resultado` vem de `POST /admin/pedidos/:id/estorno`. */
function frase(r: Resposta): { ok: boolean; texto: string } {
  switch (r.resultado) {
    case "devolvido":
      return { ok: true, texto: "O Pagar.me confirmou: o dinheiro voltou pra quem comprou." }
    case "pedido":
      return {
        ok: true,
        texto:
          "Pedi o estorno de novo. O Pagar.me leva alguns minutos pra confirmar — a " +
          "conciliação confere sozinha, e esta faixa muda quando ele voltar.",
      }
    case "andando":
      return { ok: true, texto: "O estorno está andando no Pagar.me: espere ele terminar." }
    case "sem-estorno":
      return { ok: false, texto: "Este pedido não tem estorno pra conferir." }
    default:
      return { ok: false, texto: `Não deu: ${r.motivo ?? "o Pagar.me não respondeu"}.` }
  }
}

const EstornoDoPedido = ({ data }: DetailWidgetProps<AdminOrder>) => {
  const [tentando, setTentando] = useState(false)
  const registros = Object.values(
    ((data.metadata ?? {}) as { estornos?: Record<string, Registro | null> }).estornos ?? {}
  ).filter((r): r is Registro => Boolean(r))
  const falhos = registros.filter((r) => r.situacao === "falhou")
  // Só os que falharam antes de voltar: estorno que deu certo de primeira não precisa de faixa.
  const voltaram = registros.filter((r) => r.situacao === "devolvido" && r.desde)
  if (!falhos.length && !voltaram.length) return null

  async function tentar() {
    setTentando(true)
    try {
      const r = await fetch(`/admin/pedidos/${data.id}/estorno`, {
        method: "POST",
        credentials: "include",
      })
      const { ok, texto } = frase(r.ok ? ((await r.json()) as Resposta) : { resultado: "erro" })
      if (ok) toast.success(texto)
      else toast.error(texto)
      // A faixa é o metadata do pedido: recarregar é o jeito de ela mostrar o novo.
      if (ok) setTimeout(() => window.location.reload(), 2500)
    } catch {
      toast.error("Não consegui falar com o backend agora. Tenta de novo em instantes.")
    } finally {
      setTentando(false)
    }
  }

  return (
    <Container className="flex flex-col gap-4 px-6 py-5">
      {falhos.map((r) => {
        const falta = Math.max(0, (r.esperado ?? 0) - (r.devolvido ?? 0))
        const pediu = r.tentativas ?? 0
        return (
          <Alert key={r.cobranca} variant="error">
            <div className="flex flex-col gap-2">
              <Heading level="h2">O estorno não chegou em quem comprou</Heading>
              <Text size="small">
                O Pagar.me não devolveu {reais(falta)} ({r.motivo ?? "a cobrança voltou pra paga"}
                ). Este pedido aparece como estornado aqui, mas o dinheiro não voltou.
              </Text>
              <Text size="small" className="text-ui-fg-subtle">
                {r.sozinha
                  ? r.proxima
                    ? `A loja pede de novo sozinha em ${quando(r.proxima)}` +
                      (pediu ? ` — já pediu ${vezes(pediu)}.` : ".")
                    : `A loja já pediu de novo ${vezes(pediu)} e parou de tentar sozinha.`
                  : "Este a loja não pede de novo sozinha: estorne pelo painel do Pagar.me."}{" "}
                No painel do Pagar.me, a cobrança é {r.cobranca}.
              </Text>
              {r.sozinha ? (
                <div>
                  <Button size="small" variant="secondary" isLoading={tentando} onClick={tentar}>
                    Tentar o estorno de novo
                  </Button>
                </div>
              ) : null}
            </div>
          </Alert>
        )
      })}
      {voltaram.map((r) => (
        <Alert key={r.cobranca} variant="success">
          <Text size="small">
            Estorno confirmado no Pagar.me em {quando(r.confirmado)}: {reais(r.devolvido ?? 0)}{" "}
            voltaram pra quem comprou
            {r.tentativas ? `, depois de a loja pedir de novo ${vezes(r.tentativas)}` : ""}.
          </Text>
        </Alert>
      ))}
    </Container>
  )
}

export default EstornoDoPedido
