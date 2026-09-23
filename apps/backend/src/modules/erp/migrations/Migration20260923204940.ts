import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260923204940 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "erp_conexao" add column if not exists "janela_da_nota" integer null;`
    )
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "erp_conexao" drop column if exists "janela_da_nota";`)
  }
}
