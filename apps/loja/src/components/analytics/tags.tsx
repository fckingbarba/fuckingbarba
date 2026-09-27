"use client"

import { useEffect, useMemo } from "react"
import { chegadaDaVisita, guardarACampanha } from "@/lib/chegada"
import type { Integracoes } from "@/lib/configuracoes"
import { parceirosDe } from "@/lib/consentimento"
import { anotarNaLoja } from "@/lib/rastrear"
import { Consentimento, useConsentimento } from "./consentimento"
import { ligarIntegracoes } from "./integracoes"

/**
 * AS TAGS DE TERCEIROS — GA4, Google Ads, Pixel da Meta, Pixel do TikTok e
 * Microsoft Clarity, com os códigos do painel (Configurações → Integrações;
 * o layout raiz passa).
 *
 * NADA CARREGA ANTES DO "ACEITAR". Até a fase 6, o GA4 carregava com o
 * consentimento negado e mandava visita sem cookie — e a política de
 * privacidade prometia que nenhum script de medição carregava sem o aceite.
 * Agora a promessa vale: sem o sim, a página não tem script de nenhum deles,
 * e com o sim, `ligarIntegracoes` monta tudo na hora, sem recarregar.
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
    if (estado === "sim") ligarIntegracoes(integracoes)
  }, [estado, integracoes])

  // A chegada: guardada já na primeira página, e anotada quando vier o sim. A
  // campanha do link também, pros parceiros de quem aceitar depois de sair daqui.
  useEffect(() => {
    guardarACampanha()
    const chegada = chegadaDaVisita()
    if (chegada) anotarNaLoja("visita", chegada.dados, { onde: chegada.onde })
  }, [])

  return <Consentimento parceiros={parceiros} estado={estado} />
}
