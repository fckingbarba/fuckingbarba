import type { Route } from "next"
import Link from "next/link"

/**
 * AS MIGALHAS
 *
 * Duas funções ao mesmo tempo: dizer onde a pessoa está e dar ao Google o
 * `BreadcrumbList` — que é o que troca a URL crua por "fuckingbarba.com.br ›
 * Barba › Fator de Crescimento" no resultado de busca.
 *
 * Em microdata, e não em JSON-LD à parte, de propósito: assim não existe a
 * chance de o bloco de dados dizer uma trilha e a tela mostrar outra. Os dois
 * saem do mesmo JSX.
 *
 * `position` começa em 1 e não pode pular número — o Google descarta a lista
 * inteira quando pula.
 */

/**
 * `Route` e não `string`: com `typedRoutes` ligado, o compilador confere cada
 * href contra as rotas que existem de verdade. Migalha é justamente onde
 * link morto passa despercebido — ela aparece em toda página de produto e
 * quase ninguém clica nela até um cliente clicar.
 *
 * O parâmetro de tipo não é frescura: `Route` sozinho (com o `string` padrão)
 * só aceita rota ESTÁTICA. Rota dinâmica — `/barba`, que casa com
 * `/[categoria]` — só passa quando o compilador vê o texto literal, e pra
 * isso ele precisa subir por aqui em vez de virar `string` no caminho. A
 * alternativa seria um `as Route` no `<Link>`, que é desligar a checagem
 * exatamente onde ela serve.
 */
export type Migalha<T extends string = string> = { nome: string; href?: Route<T> }

export function Migalhas<T extends string>({ trilha }: { trilha: readonly Migalha<T>[] }) {
  return (
    <nav className="migalhas" aria-label="Você está em">
      <ol className="migalhas__lista" itemScope itemType="https://schema.org/BreadcrumbList">
        {trilha.map((m, i) => (
          <li
            key={`${m.nome}-${i}`}
            itemProp="itemListElement"
            itemScope
            itemType="https://schema.org/ListItem"
          >
            {m.href ? (
              <Link href={m.href} itemProp="item">
                <span itemProp="name">{m.nome}</span>
              </Link>
            ) : (
              <span className="migalhas__atual" itemProp="name">
                {m.nome}
              </span>
            )}
            <meta itemProp="position" content={String(i + 1)} />
          </li>
        ))}
      </ol>
    </nav>
  )
}
