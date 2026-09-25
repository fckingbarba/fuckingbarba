"use client"

import { useEffect, useMemo } from "react"
import type { Integracoes } from "@/lib/configuracoes"
import { parceirosDe } from "@/lib/consentimento"
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
 * Sem nenhuma integração ligada, não há o que perguntar: nem faixa.
 */
export function Tags({ integracoes }: { integracoes: Integracoes }) {
  const parceiros = useMemo(() => parceirosDe(integracoes), [integracoes])
  const estado = useConsentimento(parceiros)

  useEffect(() => {
    if (estado === "sim") ligarIntegracoes(integracoes)
  }, [estado, integracoes])

  if (!parceiros.length) return null
  return <Consentimento parceiros={parceiros} estado={estado} />
}
