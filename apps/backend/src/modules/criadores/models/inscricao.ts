import { model } from "@medusajs/framework/utils"

/**
 * UMA INSCRIÇÃO DE CRIADOR — quem quer gravar os 20 vídeos da loja, pela
 * página escondida `/criadores` (o link vai por mensagem, pra quem a loja
 * chamar). Os valores aceitos em cada campo moram em `lib/criadores/regras.ts`.
 *
 * SÓ O QUE A LOJA PRECISA PRA DECIDIR E CHAMAR: nome, WhatsApp, e-mail,
 * cidade, os perfis e o jeito de ganhar. CPF, endereço e chave Pix NÃO
 * entram aqui — vêm depois do sim, no contrato (a página diz isso). A data
 * do "sim" da autorização fica porque é a prova do consentimento (LGPD, art.
 * 8º, § 2º).
 *
 * UMA POR E-MAIL (o índice único): quem manda de novo atualiza a sua, e a
 * recusada volta pra fila (`workflows/criadores/inscrever.ts`).
 *
 * A SITUAÇÃO: `nova` (esperando o painel), `aprovada` (a loja vai chamar) ou
 * `recusada`. Quem decidiu fica em `decidida_por` (o membro da equipe) e no
 * registro da equipe. Quem pede pra apagar é APAGADO (recusa e apaga, no
 * painel) — nada de guardar com marca.
 */
export const Inscricao = model
  .define("criador_inscricao", {
    id: model.id({ prefix: "cria" }).primaryKey(),
    nome: model.text(),
    /** Só os dígitos, com o DDD e sem o 55: "47999990000". */
    whatsapp: model.text(),
    email: model.text(),
    /** Como a pessoa escreveu: "Joinville, SC". */
    cidade: model.text(),
    /** O perfil sem o @, em minúsculas. Pelo menos um dos dois. */
    instagram: model.text().nullable(),
    tiktok: model.text().nullable(),
    /** A faixa de seguidores do maior perfil (`SEGUIDORES`), ou nada. */
    seguidores: model.text().nullable(),
    /** Como está a barba (`BARBAS`). */
    barba: model.text(),
    /** Se já gravou publi ou UGC (`EXPERIENCIAS`), ou nada. */
    experiencia: model.text().nullable(),
    /** Um vídeo da pessoa (Reels, TikTok, Drive) — sempre `https://`. */
    video: model.text().nullable(),
    /** Topa rodar alguns vídeos como anúncio de parceria, pelo perfil dela. */
    parceria: model.boolean().default(false),
    /** Como quer ganhar (`MODELOS`): o fixo, a comissão ou conversar antes. */
    modelo: model.text(),
    situacao: model.enum(["nova", "aprovada", "recusada"]).default("nova"),
    /** Quando ela marcou a autorização (a última vez que mandou). */
    consentido_em: model.dateTime(),
    decidida_em: model.dateTime().nullable(),
    /** O id do membro da equipe que aprovou ou recusou. */
    decidida_por: model.text().nullable(),
  })
  .indexes([
    { on: ["email"], unique: true, where: "deleted_at IS NULL" },
    { on: ["situacao"], where: "deleted_at IS NULL" },
  ])
