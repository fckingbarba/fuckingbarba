"use client"

import { useEffect } from "react"
import { TelaDeErro } from "@/components/tela-de-erro"
import { avisarTelaDeErro } from "@/components/telemetria/telemetria"
import { site } from "@/lib/site"
import "./globals.css"

/**
 * Quando o que caiu foi o LAYOUT RAIZ — ele lê as configurações da loja no
 * Medusa (`configuracoes()`), e sem elas não há cabeçalho nem rodapé.
 *
 * Substitui o documento inteiro, então traz o próprio `<html>`, o próprio
 * `<title>` (metadata não vale aqui) e o CSS da loja, que o Next não põe
 * sozinho nesta tela. A fonte fica a do sistema: a Inter é carregada pelo
 * layout que acabou de cair.
 */
export default function ErroGeral({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  useEffect(() => avisarTelaDeErro(error), [error])
  return (
    <html lang="pt-BR" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <title>{`Não carregou · ${site.nome}`}</title>
        <TelaDeErro retry={retry} semCarcaca />
      </body>
    </html>
  )
}
