-- ─────────────────────────────────────────────────────────────────────────────
-- Schema `loja` — tudo que é da FuckingBarba e NÃO é do Medusa.
--
-- O Medusa é dono do schema `public` (dezenas de tabelas, migrações dele).
-- Nada nosso entra lá; nada daqui é lido pelo Medusa por SQL direto, exceto o
-- job do worker que reenvia webhooks pendentes (fase 4).
--
-- Quem escreve aqui: só as Edge Functions, com a service_role. Nenhuma tabela
-- é acessível pela chave anon — RLS ligado e sem política = porta fechada.
--
-- Aplicar: `supabase db push` (CLI) ou colar no SQL Editor do painel.
-- ─────────────────────────────────────────────────────────────────────────────

create schema if not exists loja;

comment on schema loja is 'Tabelas próprias da loja FuckingBarba (webhooks, telemetria, newsletter). O Medusa vive em public.';

-- ── Webhooks recebidos ──────────────────────────────────────────────────────
-- Cada chamada de Pagar.me / Frenet / Melhor Envio / Bling vira uma linha ANTES
-- de qualquer processamento: auditoria, replay e a garantia de que um evento
-- não se perde quando o Medusa está reiniciando.
create table if not exists loja.eventos_webhook (
  id            bigint generated always as identity primary key,
  origem        text        not null check (origem in ('pagarme', 'frenet', 'melhor_envio', 'bling')),
  id_externo    text,                              -- id do evento no provedor (idempotência)
  evento        text,                              -- ex.: order.paid
  payload       jsonb       not null,
  cabecalhos    jsonb,                             -- headers relevantes (sem segredo)
  recebido_em   timestamptz not null default now(),
  processado_em timestamptz,                       -- quando o Medusa aceitou (2xx)
  tentativas    integer     not null default 0,
  erro          text                               -- última falha ao repassar
);

-- Mesmo evento entregue duas vezes (o provedor reenvia) não duplica.
create unique index if not exists eventos_webhook_origem_id_externo_uidx
  on loja.eventos_webhook (origem, id_externo)
  where id_externo is not null;

-- O job de reenvio busca só o que está pendente.
create index if not exists eventos_webhook_pendentes_idx
  on loja.eventos_webhook (recebido_em)
  where processado_em is null;

comment on table loja.eventos_webhook is 'Todo webhook externo, bruto, antes de virar ação no Medusa.';

-- ── Web Vitals reais ────────────────────────────────────────────────────────
-- LCP, INP, CLS (e TTFB/FCP) medidos no navegador de visitante real. É o
-- "P75 fora da meta por 3 dias" da seção Observabilidade.
create table if not exists loja.web_vitals (
  id            bigint generated always as identity primary key,
  recebido_em   timestamptz not null default now(),
  pagina        text        not null,              -- caminho sem query (/produtos/oleo-para-barba)
  metrica       text        not null check (metrica in ('LCP', 'INP', 'CLS', 'TTFB', 'FCP')),
  valor         double precision not null,
  avaliacao     text        check (avaliacao in ('good', 'needs-improvement', 'poor')),
  navegacao     text,                              -- navigate | reload | back-forward | prerender
  dispositivo   text        check (dispositivo in ('mobile', 'desktop', 'tablet')),
  conexao       text,                              -- 4g | 3g | slow-2g …
  id_navegacao  text                               -- agrupa métricas da mesma visita
);

create index if not exists web_vitals_recebido_em_idx on loja.web_vitals (recebido_em desc);
create index if not exists web_vitals_pagina_metrica_idx on loja.web_vitals (pagina, metrica, recebido_em desc);

-- P75 dos últimos 7 dias por página e métrica — o que o painel semanal lê.
create or replace view loja.web_vitals_p75 as
select
  pagina,
  metrica,
  count(*)                                                     as amostras,
  percentile_cont(0.75) within group (order by valor)          as p75,
  round(100.0 * avg((avaliacao = 'good')::int))                as pct_bom
from loja.web_vitals
where recebido_em > now() - interval '7 days'
group by pagina, metrica;

-- ── Newsletter ──────────────────────────────────────────────────────────────
-- Cadastro do rodapé. Consentimento explícito e datado (LGPD); a origem e as
-- UTMs vêm do cookie de atribuição do site.
create table if not exists loja.newsletter (
  email          text        primary key check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  consentimento  boolean     not null default true,
  consentido_em  timestamptz not null default now(),
  origem         text,                             -- rodape | checkout | popup
  utm            jsonb,
  cancelado_em   timestamptz
);

-- ── Segurança: RLS ligado em tudo, sem política = ninguém além da service_role ─
alter table loja.eventos_webhook enable row level security;
alter table loja.web_vitals      enable row level security;
alter table loja.newsletter      enable row level security;

revoke all on schema loja from anon, authenticated;
revoke all on all tables in schema loja from anon, authenticated;
grant usage on schema loja to service_role;
grant all on all tables in schema loja to service_role;
grant all on all sequences in schema loja to service_role;
alter default privileges in schema loja grant all on tables to service_role;
alter default privileges in schema loja grant all on sequences to service_role;

-- ── Limpeza: vitals com mais de 90 dias não servem pra nada ─────────────────
-- Agende no painel (Database → Cron) ou com pg_cron:
--   select cron.schedule('limpa-web-vitals', '17 3 * * *',
--     $$delete from loja.web_vitals where recebido_em < now() - interval '90 days'$$);
