# Supabase — banco, imagens e Edge Functions

O Supabase entra com três funções na arquitetura: **Postgres** (banco do Medusa), **Storage**
(imagens de produto) e **Edge Functions** (a porta de entrada do que vem de fora). Auth e Realtime
ficam de fora nesta fase.

## O que está aqui

| Caminho                                     | O que é                                                                                                                                                                       |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `migrations/20260919000000_schema_loja.sql` | Schema `loja`: `eventos_webhook`, `web_vitals` (+ view `web_vitals_p75`), `newsletter`. RLS ligado, só `service_role` escreve. **Nada no schema `public`** — ele é do Medusa. |
| `functions/webhook-pagamento/`              | Recebe o Pagar.me (Basic ou `?chave=` na URL), grava o evento bruto, repassa ao Medusa com o `x-webhook-segredo`. Idempotente.                                                |
| `functions/vitals/`                         | Beacon de LCP/INP/CLS do navegador → `loja.web_vitals`. Só POST da origem da loja.                                                                                            |
| `functions/_shared/`                        | Cliente com `service_role` (schema `loja`), comparação em tempo constante, resposta JSON.                                                                                     |
| `config.toml`                               | `verify_jwt = false` nas duas funções (chamadas de fora, sem JWT do Supabase).                                                                                                |

Ficam pra depois, no mesmo padrão: `feed-merchant` (fase 3), `newsletter` (fase 3).

O aviso de rastreio do parceiro de entrega (a Frenet) NÃO passa por aqui: vai direto pro Medusa, em
`/hooks/envio/:parceiro` (ver "Envios" no AGENTS.md). Cada aviso de rastreio já traz a situação mais
recente do pacote, e o núcleo dos envios guarda tudo no banco dele. Se um dia valer a pena guardar o
aviso bruto antes, uma `webhook-envio` aqui seria só um repasse — com os cabeçalhos do parceiro —, e
nada no Medusa muda.

## Subir

```bash
npm i -g supabase                       # CLI
supabase login
supabase link --project-ref SEUREF       # Project Settings → General → Reference ID
supabase db push                         # aplica migrations/ (só o schema loja; o Medusa cuida do dele)

# segredos das funções — digitados por quem tem o acesso, nunca colados em conversa
# o webhook aceita UMA de duas autenticações (ver o topo do index.ts):
supabase secrets set PAGARME_WEBHOOK_USER=... PAGARME_WEBHOOK_PASS=...   # se o painel do Pagar.me pedir usuário e senha
supabase secrets set PAGARME_WEBHOOK_CHAVE=...                           # se não: openssl rand -hex 24, e a URL leva ?chave=<ela>
supabase secrets set MEDUSA_WEBHOOK_URL=https://api.SEUDOMINIO.com.br/hooks/payment/pagarme_pagarme
supabase secrets set MEDUSA_WEBHOOK_SEGREDO=...                          # IGUAL ao do Railway (server e worker)
supabase secrets set SITE_ORIGENS=https://www.SEUDOMINIO.com.br,https://SEUPROJETO.vercel.app

supabase functions deploy webhook-pagamento
supabase functions deploy vitals
```

URLs: `https://SEUREF.supabase.co/functions/v1/webhook-pagamento` (cole no painel do Pagar.me — com
`?chave=…` no fim, se for essa a autenticação) e `https://SEUREF.supabase.co/functions/v1/vitals` (o
front usa na fase 3).

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
- Todo webhook é gravado **antes** de ser processado. Se o Medusa estiver fora, o evento fica na
  tabela — e o pedido não depende dele: a conciliação do worker pergunta ao próprio Pagar.me, a cada
  5 minutos, por toda sessão pendente (`apps/backend/src/lib/conciliar-pagamentos.ts`). A tabela é
  registro: auditoria, e reenvio à mão se um dia for preciso.
- O payload é aviso; a API do provedor é a verdade. O Medusa confirma o status antes de mudar um pedido.
