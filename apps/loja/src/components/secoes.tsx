import type { CSSProperties, ReactNode } from "react"
import { lerFundos, type FundoDaSecao } from "@/lib/pdp"
import { lerAjuste, resolver } from "@/lib/secoes/layout"
import type { Escopo } from "@/lib/secoes/registro"

/**
 * Monta as seções de uma página a partir do registro.
 *
 * É o único lugar do app que decide o que entra na página. As rotas viram
 * uma linha (`<Secoes escopo="home" />`) e param de saber quais seções
 * existem — que é o ponto: ligar, desligar e reordenar passa a ser dado, não
 * edição de JSX.
 *
 * Não leva `"use cache"` de propósito. Marcar aqui cacharia o HTML de TODAS
 * as seções como um bloco só, e cada uma tem o próprio tempo de vida (o
 * catálogo muda numa cadência, o texto editorial em outra). Como a única
 * coisa que esta função espera é o `lerAjuste`, que é cacheado, ela continua
 * pré-renderizável.
 */
export async function Secoes({ escopo, handle }: { escopo: Escopo; handle?: string }) {
  const ajuste = await lerAjuste(escopo, handle)

  const fundos = escopo === "produto" && handle ? await lerFundos(handle) : {}

  return resolver(escopo, ajuste).map((secao) => {
    // A união de `Secao` é o que garante, em tempo de compilação, que seção
    // de produto recebe o handle e seção de home não recebe nada.
    if (secao.escopo === "produto") {
      const Bloco = secao.componente
      return (
        <Fundo key={secao.id} fundo={fundos[secao.id]}>
          <Bloco handle={handle ?? ""} />
        </Fundo>
      )
    }
    const Bloco = secao.componente
    return <Bloco key={secao.id} />
  })
}

/**
 * O EMBRULHO QUE DÁ COR À SEÇÃO.
 *
 * Sem fundo escolhido, NÃO EMBRULHA NADA — devolve a seção como ela é. Não é
 * economia de DOM: um `<div>` a mais em volta de toda seção mudaria o que
 * `> *` e `+` alcançam no CSS já escrito, e a esmagadora maioria das seções
 * não tem fundo próprio. O caso comum tem que sair exatamente como saía.
 */
function Fundo({ fundo, children }: { fundo?: FundoDaSecao; children: ReactNode }) {
  if (!fundo) return <>{children}</>

  // A URL vem validada do backend (só http, https ou caminho relativo) — mas
  // as aspas aqui também impedem que um parêntese no nome do arquivo quebre
  // o `url()`.
  const estilo = {
    "--fundo-imagem": `url("${fundo.imagem}")`,
    ...(fundo.veu ? { "--veu": String(fundo.veu) } : {}),
  } as CSSProperties

  return (
    <div className="fundo fundo--imagem" style={estilo}>
      {children}
    </div>
  )
}
