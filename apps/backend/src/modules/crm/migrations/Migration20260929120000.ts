import { Migration } from "@medusajs/framework/mikro-orm/migrations";

/**
 * A entrega dos pedidos da Nuvemshop (entrega 0202): o nome, o celular, o CPF
 * e o endereço de cada pedido, cifrados — o "Refazer o pedido" da reposição.
 */
export class Migration20260929120000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "crm_base_pedido" add column if not exists "entrega" text null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "crm_base_pedido" drop column if exists "entrega";`);
  }

}
