import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/*
  As tentativas de antes (todas de cartão, no Pagar.me) ficam SEM `provedor`
  de propósito: o disjuntor só lê as que têm (`terminadasDosParceiros`), e as
  de antes foram fechadas com a regra antiga — que chamava de "fora" também o
  cartão que o Pagar.me recusou sem dizer por quê. Contadas, duas delas mais
  uma falha de verdade tirariam o Pagar.me do caminho logo depois do deploy.
*/
export class Migration20260927125357 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "obs_tentativa" add column if not exists "provedor" text null, add column if not exists "forma" text not null default 'cartao';`
    )
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table if exists "obs_tentativa" drop column if exists "provedor", drop column if exists "forma";`
    )
  }
}
