"use client"

import { useEffect, useMemo } from "react"
import { chegadaDaVisita, guardarACampanha } from "@/lib/chegada"
import type { Integracoes } from "@/lib/configuracoes"
import { parceirosDe } from "@/lib/consentimento"
import { anotarNaLoja, crmLiberado } from "@/lib/rastrear"
import { Consentimento, useConsentimento } from "./consentimento"

/**
 * AS TAGS DE TERCEIROS — GA4, Google Ads, Pixel da Meta, Pixel do TikTok e
 * Microsoft Clarity, com os códigos do painel (Configurações → Integrações;
 * o layout raiz passa).
 *
 * TODAS LIGAM NA PRIMEIRA PÁGINA, COMO NA NUVEMSHOP (0230, pedido do dono,
 * com o aval dos advogados: os gestores de tráfego recebiam bem menos
 * eventos com os pixels esperando o "Aceitar"). A faixa é a da Nuvemshop, um
 * botão só ("Entendi"), e avisa; não trava nada. Só quem recusa na política
 * de privacidade (`mudar-resposta.tsx`) fica sem elas. O CRM da própria loja
 * é o que ainda espera o clique no "Entendi".
 *
 * Os trechos dos parceiros moram noutro pedaço de JavaScript (`import()`),
 * que só baixa quando alguma tag liga: a primeira tela não espera por eles
 * (a home mede cada byte no Lighthouse do CI).
 *
 * A FAIXA APARECE SEMPRE, com ou sem parceiro ligado no painel, até o
 * "Entendi". A chegada da visita (a campanha do link, de onde veio) é
 * anotada daqui, uma vez por sessão, quando o CRM liberar.
 */
export function Tags({ integracoes }: { integracoes: Integracoes }) {
  const parceiros = useMemo(() => parceirosDe(integracoes), [integracoes])
  const estado = useConsentimento(parceiros)

  useEffect(() => {
    if (estado === "sim") crmLiberado()
    if ((estado !== "sim" && estado !== "sem-resposta") || !parceiros.length) return
    let valendo = true
    import("./integracoes").then(
      (m) => {
        if (valendo) m.ligarIntegracoes(integracoes)
      },
      () => undefined
    )
    return () => {
      valendo = false
    }
  }, [estado, integracoes, parceiros])

  // A chegada: guardada já na primeira página, e anotada quando o CRM liberar. A
  // campanha do link também, pros parceiros, se as tags ligarem noutra página.
  useEffect(() => {
    guardarACampanha()
    const chegada = chegadaDaVisita()
    if (chegada) anotarNaLoja("visita", chegada.dados, { onde: chegada.onde })
  }, [])

  return <Consentimento parceiros={parceiros} estado={estado} />
}
