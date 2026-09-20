import { Logger } from "@medusajs/framework/types"

/**
 * Diz, antes de escrever, EM QUAL BANCO o script vai escrever.
 *
 * POR QUE ISTO EXISTE: `medusa exec` escreve em quem o `DATABASE_URL` do
 * ambiente apontar, e esse ambiente muda sem avisar — `.env` local, variável
 * exportada no terminal, serviço do Railway. Os dois jeitos de errar são
 * simétricos e os dois doem:
 *
 *   • rodar achando que é produção e ser o banco local — o script diz
 *     "2 kits criados", você vai no site e não tem kit nenhum, e passa meia
 *     hora procurando bug no front;
 *   • rodar achando que é local e ser produção — aí não tem meia hora de
 *     procura, tem um catálogo mexido no ar.
 *
 * Uma linha no começo resolve os dois. Não pergunta nada e não bloqueia: a
 * ideia é que o log do script já responda "onde isso foi parar?" seis meses
 * depois, quando ninguém lembrar de qual terminal rodou.
 *
 * A SENHA NUNCA SAI DAQUI. O log de um script vai parar em print, em issue e
 * em canal de equipe; o que interessa pra conferir é host e nome do banco.
 */
export function ondeEstou(logger: Logger, marca: string) {
  const url = process.env.DATABASE_URL

  if (!url) {
    logger.warn(`[${marca}] sem DATABASE_URL no ambiente — o Medusa vai usar o padrão dele`)
    return
  }

  try {
    const u = new URL(url)
    const banco = u.pathname.replace(/^\//, "") || "(sem nome)"
    const porta = u.port ? `:${u.port}` : ""
    const local = /^(localhost|127\.0\.0\.1|::1)$/.test(u.hostname)

    logger.info(
      `[${marca}] escrevendo em ${u.hostname}${porta}/${banco} ` +
        `— ${local ? "banco LOCAL" : "banco REMOTO (produção?)"}`
    )
  } catch {
    // URL torta não é motivo pra abortar: quem valida DATABASE_URL é o Medusa,
    // e ele vai falhar com mensagem melhor que a minha daqui a duas linhas.
    logger.warn(`[${marca}] não consegui ler o DATABASE_URL pra dizer qual banco é`)
  }
}
