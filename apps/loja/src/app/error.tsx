"use client"

import { useEffect } from "react"
import { TelaDeErro } from "@/components/tela-de-erro"
import { avisarTelaDeErro } from "@/components/telemetria/telemetria"

/**
 * Página que falhou ao montar — o desenho e o porquê estão na `TelaDeErro`.
 *
 * Fica dentro do layout raiz: cabeçalho, sacola e rodapé continuam na tela.
 * Erro no próprio layout raiz (as configurações da loja, lidas lá) não chega
 * aqui; esse é o `global-error.tsx`. O que caiu vai pra Observabilidade do
 * painel (`avisarTelaDeErro`).
 */
export default function Erro({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  useEffect(() => avisarTelaDeErro(error), [error])
  return <TelaDeErro retry={retry} />
}
