import { model } from "@medusajs/framework/utils"

/**
 * UMA MEDIDA DE VELOCIDADE DE UMA VISITA DE VERDADE — o que o navegador de
 * quem visitou a loja mediu e mandou (`lib/observabilidade/telemetria.ts`):
 * o tempo até aparecer o principal da tela (LCP), a demora pra reagir ao
 * toque (INP) e o quanto as coisas pularam de lugar (CLS).
 *
 * Uma linha por medida, sem nada de quem visitou: a página (sem o que
 * identifica alguém) e se era celular ou computador. A tela soma os últimos
 * 28 dias, como o Google; o vigia apaga o que passou disso.
 */
export const Medida = model
  .define("obs_medida", {
    id: model.id({ prefix: "med" }).primaryKey(),
    /** "LCP", "INP" ou "CLS". */
    metrica: model.text(),
    /** Milissegundos (LCP, INP) ou a pontuação (CLS). */
    valor: model.float(),
    /** "celular" ou "computador". */
    aparelho: model.text(),
    /** "/produtos/fator-de-crescimento", "/conta/pedidos/:id". */
    pagina: model.text(),
  })
  .indexes([{ on: ["metrica", "aparelho"] }, { on: ["created_at"] }])
