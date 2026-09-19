import { notFound } from "next/navigation"

/**
 * Destino do rewrite que o proxy faz pra caminhos de primeiro nível que não
 * existem (/qualquer-coisa). Como esta rota é estática, o `notFound()` roda
 * antes de qualquer streaming e a resposta sai com status 404 de verdade —
 * diferente do `notFound()` dentro de uma rota dinâmica com Cache Components,
 * que vira um 200 com meta noindex (soft 404).
 */
// A rota existe só pra lançar 404; a validação de navegação instantânea não se aplica.
export const instant = false

export default function NaoEncontrado() {
  notFound()
}
