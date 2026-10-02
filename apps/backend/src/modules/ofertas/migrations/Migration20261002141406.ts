import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261002141406 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "oferta_oculta" add column if not exists "relogio_minutos" integer null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "oferta_oculta" drop column if exists "relogio_minutos";`);
  }

}
