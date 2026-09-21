"use client"

import { useLayoutEffect } from "react"

/**
 * A PÁGINA DIZ AO DOCUMENTO QUE ESTÁ NA TELA — pra regra global que depende
 * dela (o fundo do `body`, a carcaça do layout raiz) valer só enquanto ela
 * está visível.
 *
 * ┌─ POR QUE NÃO `body:has(.pagina)` ──────────────────────────────────────┐
 * │ O Next (com Cache Components) não desmonta a página quando a pessoa    │
 * │ navega: esconde com `display: none` e guarda até três, pra quem volta  │
 * │ encontrar tudo como deixou — é o `<Activity>` do React, explicado em   │
 * │ `node_modules/next/dist/docs/01-app/02-guides/preserving-ui-state.md`. │
 * │ A página escondida CONTINUA NO DOCUMENTO, e o `:has()` seguia casando  │
 * │ com ela: a home aberta pelo logo do checkout vinha sem cabeçalho e sem │
 * │ rodapé.                                                                │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * Então a página marca o `<html>` com `data-tela="<nome>"` num efeito de
 * layout — que o React roda de novo quando ela reaparece e desfaz quando ela
 * é escondida, como desfaz ao desmontar —, e o CSS pergunta pela marca. É o
 * que a documentação recomenda pra estado global: um `data-*` que o React
 * controla, no lugar de um `:has()` que ninguém controla.
 *
 * E ANTES DO REACT? Na carga direta (o HTML que o servidor manda), a marca
 * ainda não existe, e o cabeçalho da loja apareceria até o JavaScript chegar.
 * Nessa fase o `:has()` diz a verdade — ainda não há página guardada —, então
 * o CSS usa ele enquanto o `<html>` não tem `data-hidratado`, que a primeira
 * marca liga e ninguém desliga. Por isso cada regra vem em dupla nos
 * arquivos de `estilos/`: uma pela marca, outra pelo `:has()` de antes.
 */
export function MarcaDaTela({ tela }: { tela: string }) {
  useLayoutEffect(() => {
    document.documentElement.dataset.hidratado = ""
    contar(tela, +1)
    return () => contar(tela, -1)
  }, [tela])

  return null
}

/*
 * Uma contagem, e não um liga/desliga: duas telas de obrigado (pedidos
 * diferentes) podem se cruzar na troca — uma escondendo, outra aparecendo —,
 * e a que sai não pode apagar a marca da que entra, seja qual for a ordem.
 */
const visiveis = new Map<string, number>()

function contar(tela: string, delta: number) {
  visiveis.set(tela, (visiveis.get(tela) ?? 0) + delta)
  const telas = [...visiveis].filter(([, n]) => n > 0).map(([t]) => t)
  const raiz = document.documentElement
  if (telas.length) raiz.dataset.tela = telas.join(" ")
  else delete raiz.dataset.tela
}
