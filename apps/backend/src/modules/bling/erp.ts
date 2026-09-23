import type { ErpDaLoja } from "../../lib/erp/contrato"
import { concluirAutorizacao, configurado, renovar, urlDeAutorizacao } from "./autorizacao"
import { lerAviso } from "./avisos"
import { lerCatalogo } from "./catalogo"
import { consultarNota, desfazerNota, emitirNota, lerPassos } from "./notas"
import { conferirPermissoes } from "./permissoes"
import { lerSaldos } from "./produtos"

/**
 * O BLING COMO ERP DA LOJA — o tradutor, montado no contrato
 * (`lib/erp/contrato.ts`). Tudo que é FORMATO do Bling mora nesta pasta:
 *
 *   api.ts          a fila das chamadas, o token, o 429
 *   autorizacao.ts  o OAuth (o app privado, os escopos, a renovação)
 *   produtos.ts     SKU → id do Bling, e o saldo
 *   catalogo.ts     os produtos inteiros, pra importação (peso, medidas, fotos)
 *   notas.ts        cliente → pedido de venda → NF-e → SEFAZ
 *   permissoes.ts   qual escopo falta no app (o 403 não diz)
 *   avisos.ts       o webhook assinado
 *
 * No dia em que a loja trocar de ERP, esta pasta sai, a do outro entra, e
 * `lib/erp/erps.ts` troca uma linha.
 */
export const bling: ErpDaLoja = {
  id: "bling",
  nome: "Bling",
  configurado,
  segredoDoCofre: () => process.env.BLING_CLIENT_SECRET ?? "",
  urlDeAutorizacao,
  concluirAutorizacao,
  renovar,
  lerSaldos,
  lerCatalogo,
  emitirNota,
  consultarNota,
  desfazerNota,
  pedidoNoErp: (passos) => Boolean(lerPassos(passos).pedido),
  idDaNota: (passos) => {
    const { nota } = lerPassos(passos)
    return nota ? String(nota) : null
  },
  lerAviso,
  conferirPermissoes,
}
