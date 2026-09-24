import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { AdminProduct, DetailWidgetProps } from "@medusajs/framework/types"
import { Container, Heading, Text } from "@medusajs/ui"
import { useEffect, useState } from "react"

/**
 * A PÁGINA DO PRODUTO SE EDITA NO PAINEL — este widget só aponta pra lá.
 *
 * Até a fase 3 do painel (24/09), o texto das seções, os fundos e a caixa
 * de compra se editavam aqui. Agora é no painel da loja, em Produtos: com
 * a foto do celular em cada fundo, a caixa de compra "uma coisa ou outra",
 * o registro de quem mudou o quê — e cada "Salvar" muda só o que mudou.
 *
 * DOIS EDITORES DO MESMO TEXTO SE ATROPELAVAM: este mandava a página
 * inteira a cada "Salvar", e apagava o que o painel tinha gravado desde que
 * esta tela abriu (a ordem das seções ele apagava sempre). Então aqui fica
 * o aviso, com o link — e a rota que ele usava (`/admin/produtos/:id/pdp`)
 * continua de pé pros conferidores.
 */

export const config = defineWidgetConfig({ zone: "product.details.after" })

const PdpWidget = ({ data: produto }: DetailWidgetProps<AdminProduct>) => {
  const [painel, setPainel] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/admin/produtos/${produto.id}/pdp`, { credentials: "include" })
      .then((r) => r.json())
      .then((r: { painel?: string | null }) => setPainel(r.painel ?? null))
      .catch(() => undefined)
  }, [produto.id])

  return (
    <Container className="flex flex-col gap-2 px-6 py-4">
      <Heading level="h2">Página do produto</Heading>
      <Text size="small" className="text-ui-fg-subtle">
        Os textos das seções, as imagens de fundo e a caixa de compra deste produto agora se editam
        no painel da loja, em Produtos.
      </Text>
      {painel ? (
        <Text size="small">
          <a
            className="underline"
            href={`${painel}/produtos/${produto.id}`}
            target="_blank"
            rel="noreferrer noopener"
          >
            Abrir este produto no painel
          </a>
        </Text>
      ) : null}
    </Container>
  )
}

export default PdpWidget
