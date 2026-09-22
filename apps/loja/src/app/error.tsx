"use client"

import { TelaDeErro } from "@/components/tela-de-erro"

/**
 * Página que falhou ao montar — o desenho e o porquê estão na `TelaDeErro`.
 *
 * Fica dentro do layout raiz: cabeçalho, sacola e rodapé continuam na tela.
 * Erro no próprio layout raiz (as configurações da loja, lidas lá) não chega
 * aqui; esse é o `global-error.tsx`.
 */
export default function Erro({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <TelaDeErro retry={retry} />
}
