"use client"

import Link from "next/link"
import { Sacola } from "@/components/icones"
import { useSacola } from "@/components/sacola/contexto"
import { EM_BREVE } from "@/lib/site"

/**
 * O BOTÃO DA SACOLA, no cabeçalho do computador (no celular, a sacola mora na
 * barra de baixo: `layout/barra-de-baixo.tsx`).
 *
 * O contador é o número de UNIDADES, não de linhas: quem pôs três frascos do
 * mesmo produto espera ver 3, não 1. É a conta que o Medusa devolve pronta.
 *
 * SEM PROVEDOR ELE VIRA LINK. Acontece numa página montada fora do layout,
 * ou num teste — e aí o certo é levar a pessoa pra algum lugar em vez de
 * oferecer um botão que não abre nada.
 */
export function BotaoDaSacola() {
  const sacola = useSacola()

  if (!sacola) {
    return (
      <Link className="cabecalho__icone" href={EM_BREVE} aria-label="Sacola">
        <Sacola />
      </Link>
    )
  }

  const { carrinho, leitura, abrir, aberta } = sacola
  // Antes da primeira resposta do servidor, o número seria o zero de partida,
  // e não o da pessoa — com o Medusa fora, um "0" mentiroso (ver `leitura`).
  const sabe = leitura === "feita"

  return (
    <button
      type="button"
      className="cabecalho__icone"
      onClick={abrir}
      aria-haspopup="dialog"
      aria-expanded={aberta}
      aria-controls="carrinho-gaveta"
      aria-label={nomeDaSacola(sabe, carrinho.unidades)}
    >
      <Sacola />
      {/*
        O número é `aria-hidden` porque o `aria-label` do botão já o diz por
        extenso. Sem isso o leitor de tela anuncia "Sacola com 2 itens, 2".
      */}
      {sabe ? (
        <span className="cabecalho__contador" aria-hidden="true">
          {carrinho.unidades}
        </span>
      ) : null}
    </button>
  )
}

/**
 * O nome do botão pra quem lê a tela, com o número por extenso. O mesmo no
 * cabeçalho e na barra de baixo: os dois são "a sacola", e os conferidores
 * acham um ou outro pelo nome, conforme a largura da tela.
 */
export function nomeDaSacola(sabe: boolean, unidades: number) {
  if (!sabe) return "Sacola"
  if (unidades === 1) return "Sacola com 1 item"
  return `Sacola com ${unidades} ${unidades === 0 ? "item" : "itens"}`
}
