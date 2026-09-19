# Supabase — banco, imagens e Edge Functions

O Supabase entra com três funções na arquitetura: **Postgres** (banco do Medusa), **Storage**
(imagens de produto) e **Edge Functions** (a porta de entrada do que vem de fora). Auth e Realtime
ficam de fora nesta fase.

## O que está aqui

| Caminho                                     | O que é                                                                                                                                                                       |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `migrations/20260919000000_schema_loja.sql` | Schema `loja`: `eventos_webhook`, `web_vitals` (+ view `web_vitals_p75`), `newsletter`. RLS ligado, só `service_role` escreve. **Nada no schema `public`** — ele é do Medusa. |
| `functions/webhook-pagamento/`              | Recebe o Pagar.me (autenticação básica), grava o evento bruto, repassa ao Medusa. Idempotente.                                                                                |
| `functions/vitals/`                         | Beacon de LCP/INP/CLS do navegador → `loja.web_vitals`. Só POST da origem da loja.                                                                                            |
| `functions/_shared/`                        | Cliente com `service_role` (schema `loja`), comparação em tempo constante, resposta JSON.                                                                                     |
| `config.toml`                               | `verify_jwt = false` nas duas funções (chamadas de fora, sem JWT do Supabase).                                                                                                |

Ficam pra depois, no mesmo padrão: `webhook-frete` (fase 5), `feed-merchant` (fase 3), `newsletter` (fase 3).

## Subir

```bash
npm i -g supabase                       # CLI
supabase login
supabase link --project-ref SEUREF       # Project Settings → General → Reference ID
supabase db push                         # aplica migrations/ (só o schema loja; o Medusa cuida do dele)

# segredos das funções
supabase secrets set PAGARME_WEBHOOK_USER=... PAGARME_WEBHOOK_PASS=...   # fase 4
supabase secrets set MEDUSA_WEBHOOK_URL=https://api.SEUDOMINIO.com.br/hooks/payment/pagarme_pagarme   # fase 4
supabase secrets set SITE_ORIGENS=https://www.SEUDOMINIO.com.br,https://SEUPROJETO.vercel.app

supabase functions deploy webhook-pagamento
supabase functions deploy vitals
```

URLs: `https://SEUREF.supabase.co/functions/v1/webhook-pagamento` (cole no painel do Pagar.me, fase 4)
e `https://SEUREF.supabase.co/functions/v1/vitals` (o front usa na fase 3).

## Rodar e testar local

```bash
cd supabase/functions
deno check webhook-pagamento/index.ts vitals/index.ts
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... PAGARME_WEBHOOK_USER=u PAGARME_WEBHOOK_PASS=p \
  deno run --allow-net --allow-env webhook-pagamento/index.ts     # http://localhost:8000
```

## Regras que não mudam

- Uma Edge Function **nunca escreve pedido, estoque ou preço** direto no Postgres. Ela chama a API do
  Medusa; quem tem a regra de negócio é ele.
- Todo webhook é gravado **antes** de ser processado. Se o Medusa estiver fora, o evento espera; o job
  do worker (fase 4) reenvia os que estão com `processado_em is null` — ele lê a tabela direto, porque
  está no mesmo Postgres.
- O payload é aviso; a API do provedor é a verdade. O Medusa confirma o status antes de mudar um pedido.
