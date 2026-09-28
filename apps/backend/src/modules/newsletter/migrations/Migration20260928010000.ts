import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/** O nome e a página do pop-up da 1ª compra (entrega 0177). */
export class Migration20260928010000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "newsletter_inscricao" add column if not exists "nome" text null, add column if not exists "pagina" text null;`
    )
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table if exists "newsletter_inscricao" drop column if exists "nome", drop column if exists "pagina";`
    )
  }
}
