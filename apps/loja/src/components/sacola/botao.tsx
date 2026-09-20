"use client"

import Link from "next/link"
import { Sacola } from "@/components/icones"
import { useSacola } from "@/components/sacola/contexto"
import { EM_BREVE } from "@/lib/site"

/**
 * O BOTÃO DA SACOLA, no cabeçalho.
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

  const { carrinho, abrir, aberta } = sacola

  return (
    <button
      type="button"
      className="cabecalho__icone"
      onClick={abrir}
      aria-haspopup="dialog"
      aria-expanded={aberta}
      aria-controls="carrinho-gaveta"
      aria-label={
        carrinho.unidades === 1
          ? "Sacola com 1 item"
          : `Sacola com ${carrinho.unidades} ${carrinho.unidades === 0 ? "item" : "itens"}`
      }
    >
      <Sacola />
      {/*
        O número é `aria-hidden` porque o `aria-label` do botão já o diz por
        extenso. Sem isso o leitor de tela anuncia "Sacola com 2 itens, 2".
      */}
      <span className="cabecalho__contador" aria-hidden="true">
        {carrinho.unidades}
      </span>
    </button>
  )
}
