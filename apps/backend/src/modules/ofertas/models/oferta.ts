import { model } from "@medusajs/framework/utils"

/**
 * UMA OFERTA OCULTA — o que o painel escolheu (Cupons e descontos → Ofertas
 * ocultas). As regras de cada campo moram em `lib/ofertas/regras.ts`.
 *
 * O ENDEREÇO (`slug`) é o fim do link: `/oferta/<slug>`. Não muda depois de
 * criada — o link já pode estar no story de alguém. Único entre as que não
 * foram apagadas.
 *
 * OS PRODUTOS: `[{ produto, por }]` — o id do produto e o preço de UMA
 * unidade na oferta, em reais. Vale pra todas as variações do produto, como
 * o promocional do painel.
 *
 * O PREÇO QUE O CARRINHO COBRA não mora aqui: mora na lista de preço
 * `lista_id` (o Medusa, regra `fb_oferta` = este id), refeita a cada minuto
 * a partir daqui (`lib/ofertas/precos.ts`).
 *
 * O RELÓGIO (`relogio_minutos`, opcional): o tempo que a página mostra pra
 * cada pessoa, recomeçando quando zera; o preço vale até o fim de verdade.
 *
 * PAUSADA, a lista fica em rascunho e o link mostra "Essa oferta acabou".
 * ENCERRAR é trazer o `termina_em` pra agora.
 */
export const Oferta = model
  .define("oferta_oculta", {
    id: model.id({ prefix: "ofe" }).primaryKey(),
    /** O fim do link: "vip-outubro-k7m2". Só `a-z0-9-`. */
    slug: model.text(),
    /** Só pro painel: "Lista VIP de outubro". */
    nome: model.text(),
    /** O que o cliente lê no alto da página: "Só pra quem tem o link". */
    titulo: model.text(),
    /** Uma frase embaixo do título, ou nada. */
    chamada: model.text().nullable(),
    comeca_em: model.dateTime(),
    termina_em: model.dateTime(),
    pausada: model.boolean().default(false),
    /**
     * O tempo que o relógio da página mostra, em minutos (entrega 0245): cada
     * pessoa vê esse tempo a partir de quando abre a oferta, e quando zera ele
     * recomeça — o preço vale até o `termina_em` (escolha da loja). Nunca
     * mostra mais que o que falta de verdade. `null`: o relógio conta até o fim.
     */
    relogio_minutos: model.number().nullable(),
    /** `[{ produto: "prod_…", por: 69.9 }]`. */
    produtos: model.json(),
    /** A lista de preço do Medusa desta oferta. */
    lista_id: model.text().nullable(),
    /** O id do membro da equipe que criou. */
    criada_por: model.text().nullable(),
  })
  .indexes([{ on: ["slug"], unique: true, where: "deleted_at IS NULL" }])
