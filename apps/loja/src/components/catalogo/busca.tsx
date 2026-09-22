import Form from "next/form"
import { Raio } from "@/components/icones"
import { TAMANHO_MAXIMO } from "@/lib/busca"

/**
 * O CAMPO DE BUSCA DA PÁGINA DE RESULTADOS.
 *
 * O do cabeçalho some depois de buscar (ele fecha pra não ficar por cima dos
 * resultados), e quem errou uma letra quer corrigir ALI, olhando o que veio —
 * não voltar ao topo e reabrir a lupa. Então a página tem o dela, já com o
 * que foi buscado.
 *
 * `next/form` com `action` de texto: é um formulário GET comum (funciona sem
 * JavaScript, vira `/busca?q=…`), e com JavaScript a troca de página é feita
 * pelo Next, sem recarregar a loja. O mesmo do cabeçalho.
 *
 * O `key` no campo é o que troca o texto quando a busca muda por FORA dele
 * (pelo cabeçalho, ou pelo voltar do navegador): `defaultValue` só vale na
 * primeira pintura, e sem o `key` o campo mostraria a busca anterior em cima
 * dos resultados da nova.
 */
export function CampoDeBusca({ inicial }: { inicial: string }) {
  return (
    <Form action="/busca" role="search" className="busca">
      <label className="sr-only" htmlFor="busca-termo">
        Buscar produtos
      </label>
      <input
        key={inicial}
        id="busca-termo"
        type="search"
        name="q"
        defaultValue={inicial}
        placeholder="O que você procura?"
        enterKeyHint="search"
        maxLength={TAMANHO_MAXIMO}
      />
      <button type="submit" className="btn">
        Buscar
        <Raio className="btn__bolt" />
      </button>
    </Form>
  )
}
