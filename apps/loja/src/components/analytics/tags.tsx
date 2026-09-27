"use client"

import { useEffect, useMemo } from "react"
import { chegadaDaVisita, guardarACampanha } from "@/lib/chegada"
import type { Integracoes } from "@/lib/configuracoes"
import { parceirosDe } from "@/lib/consentimento"
import { anotarNaLoja } from "@/lib/rastrear"
import { Consentimento, useConsentimento } from "./consentimento"

/**
 * AS TAGS DE TERCEIROS — GA4, Google Ads, Pixel da Meta, Pixel do TikTok e
 * Microsoft Clarity, com os códigos do painel (Configurações → Integrações;
 * o layout raiz passa).
 *
 * O GA4 E A CLARITY MEDEM TODO MUNDO, COMO NA NUVEMSHOP (0166, pedido do
 * dono: lá o GA4 ligava sem perguntar, e as visitas da loja nova ficavam bem
 * abaixo; 0171: a Clarity também, pra ver a jornada de quem não responde a
 * faixa). Os dois ligam na primeira página, antes da resposta, só pra medir;
 * quem clica em "Só o necessário" sai. O resto — o anúncio do Google e da
 * Microsoft, a Meta, o TikTok e o CRM da própria loja — segue esperando o
 * "Aceitar": sem o sim, a página não tem script de nenhum deles. A política
 * de privacidade diz as duas coisas.
 *
 * Os trechos dos parceiros moram noutro pedaço de JavaScript (`import()`),
 * que só baixa quando alguma tag liga: a primeira tela de quem não tem nada
 * ligado não carrega nenhum deles (a home mede cada byte no Lighthouse do
 * CI). A resposta que muda antes de ele chegar (o "não" logo de cara) desliga
 * o que ele ia montar.
 *
 * A FAIXA APARECE SEMPRE, com ou sem parceiro ligado no painel: a própria
 * loja anota o que a pessoa faz pro CRM (`lib/anotar.ts`), e isso também
 * espera o sim. A chegada da visita (a campanha do link, de onde veio) é
 * anotada daqui, uma vez por sessão.
 */
export function Tags({ integracoes }: { integracoes: Integracoes }) {
  const parceiros = useMemo(() => parceirosDe(integracoes), [integracoes])
  const estado = useConsentimento(parceiros)

  useEffect(() => {
    const sim = estado === "sim"
    if (!sim && !(estado === "sem-resposta" && (integracoes.ga4 || integracoes.clarity))) return
    let valendo = true
    import("./integracoes").then(
      (m) => {
        if (valendo) m.ligarIntegracoes(integracoes, sim)
      },
      () => undefined
    )
    return () => {
      valendo = false
    }
  }, [estado, integracoes])

  // A chegada: guardada já na primeira página, e anotada quando vier o sim. A
  // campanha do link também, pros parceiros de quem aceitar depois de sair daqui.
  useEffect(() => {
    guardarACampanha()
    const chegada = chegadaDaVisita()
    if (chegada) anotarNaLoja("visita", chegada.dados, { onde: chegada.onde })
  }, [])

  return (
    <Consentimento
      parceiros={parceiros}
      estado={estado}
      ga4={integracoes.ga4}
      clarity={integracoes.clarity}
    />
  )
}
