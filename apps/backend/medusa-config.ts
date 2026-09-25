import {
  ContainerRegistrationKeys,
  defineConfig,
  loadEnv,
  Modules,
} from "@medusajs/framework/utils"

loadEnv(process.env.NODE_ENV || "development", process.cwd())

/**
 * Configuração do Medusa da FuckingBarba.
 *
 * Um único código roda em dois processos no Railway, definidos por variável
 * de ambiente (ver .env.example):
 *
 *   WORKER_MODE=server  ADMIN_DISABLED=false  → atende a API e serve o admin em /app
 *   WORKER_MODE=worker  ADMIN_DISABLED=true   → só jobs, subscribers e workflows
 *
 * Localmente, sem essas variáveis, roda tudo junto (shared) com Redis local.
 */

const emProducao = process.env.NODE_ENV === "production"
const redisUrl = process.env.REDIS_URL || "redis://localhost:6379"
const workerMode = (process.env.WORKER_MODE || "shared") as "shared" | "worker" | "server"

/**
 * Banco: Supabase Postgres pelo pooler em MODO SESSÃO (porta 5432).
 * O modo transação (6543) não funciona com o Medusa. SSL é obrigatório no
 * Supabase; o certificado é da AWS, então desligamos a verificação de CA e,
 * como a documentação do Medusa pede, a DATABASE_URL leva `?ssl_mode=disable`
 * no fim (isso impede a URL de sobrescrever este objeto de SSL).
 */
const usaSsl = (process.env.DATABASE_SSL ?? String(emProducao)) === "true"

const redisModules = [
  {
    resolve: "@medusajs/medusa/caching",
    options: {
      ttl: 3600,
      providers: [
        {
          resolve: "@medusajs/caching-redis",
          id: "caching-redis",
          is_default: true,
          options: { redisUrl },
        },
      ],
    },
  },
  {
    resolve: "@medusajs/medusa/event-bus-redis",
    options: {
      redisUrl,
      jobOptions: {
        removeOnComplete: { age: 3600, count: 1000 },
        removeOnFail: { age: 24 * 3600, count: 1000 },
      },
    },
  },
  {
    resolve: "@medusajs/medusa/workflow-engine-redis",
    options: { redis: { redisUrl } },
  },
  {
    resolve: "@medusajs/medusa/locking",
    options: {
      providers: [
        {
          resolve: "@medusajs/medusa/locking-redis",
          id: "locking-redis",
          is_default: true,
          options: { redisUrl },
        },
      ],
    },
  },
]

/**
 * Imagens no Supabase Storage pela API compatível com S3.
 * Só entra quando as variáveis existem; sem elas o Medusa usa disco local
 * (bom pra desenvolvimento, inútil no Railway, que não persiste disco).
 */
const fileModule = process.env.S3_BUCKET
  ? [
      {
        resolve: "@medusajs/medusa/file",
        options: {
          providers: [
            {
              resolve: "@medusajs/medusa/file-s3",
              id: "s3",
              options: {
                file_url: process.env.S3_FILE_URL,
                access_key_id: process.env.S3_ACCESS_KEY_ID,
                secret_access_key: process.env.S3_SECRET_ACCESS_KEY,
                region: process.env.S3_REGION,
                bucket: process.env.S3_BUCKET,
                endpoint: process.env.S3_ENDPOINT,
                prefix: process.env.S3_PREFIX || "",
                cache_control: "public, max-age=31536000, immutable",
                // Supabase e MinIO exigem URL no estilo "path".
                additional_client_config: { forcePathStyle: true },
              },
            },
          ],
        },
      },
    ]
  : []

/**
 * FRETE COTADO NA HORA, PELA FRENET.
 *
 * Declarar o módulo de fulfillment SUBSTITUI o padrão do Medusa, então o
 * provedor manual precisa vir listado aqui junto — sem ele, as opções de
 * frete que dependem de despacho manual (e qualquer devolução) ficam sem
 * provedor e o Medusa recusa criá-las.
 *
 * O token é lido da variável de ambiente e nunca fica em código. Sem ele o
 * módulo sobe do mesmo jeito e avisa no log: cada cotação cai no preço de
 * emergência das configurações da loja, e a loja continua de pé.
 */
const fulfillmentModule = [
  {
    resolve: "@medusajs/medusa/fulfillment",
    options: {
      providers: [
        { resolve: "@medusajs/medusa/fulfillment-manual", id: "manual" },
        {
          resolve: "./src/modules/frenet",
          id: "frenet",
          options: {
            token: process.env.FRENET_TOKEN,
            /* Isto roda enquanto o cliente espera na tela de entrega. Seis
               segundos é o que dá pra pedir de paciência antes de valer mais
               a pena cair na emergência do que continuar esperando. */
            tempoLimite: Number(process.env.FRENET_TEMPO_LIMITE_MS || 6000),
          },
        },
      ],
    },
  },
]

/**
 * PAGAMENTO PELO PAGAR.ME — Pix e cartão em até 3x.
 *
 * Declarar o módulo de pagamento NÃO tira o `pp_system_default`: o Medusa
 * registra o provedor de sistema sempre, e é ele que a região usa enquanto o
 * `npm run pagamento` não trocar. Então este bloco pode entrar antes da chave
 * existir — sem ela, o provedor sobe, avisa no log, e o script da região se
 * recusa a ligá-lo.
 *
 * `PAGARME_URL` só existe no teste (o conferidor sobe um Pagar.me falso).
 */
const paymentModule = [
  {
    resolve: "@medusajs/medusa/payment",
    options: {
      providers: [
        {
          resolve: "./src/modules/pagarme",
          id: "pagarme",
          options: {
            chaveSecreta: process.env.PAGARME_SECRET_KEY,
            segredoDoWebhook: process.env.MEDUSA_WEBHOOK_SEGREDO,
            pixMinutos: Number(process.env.PAGARME_PIX_MINUTOS || 30),
            url: process.env.PAGARME_URL,
          },
        },
      ],
    },
  },
]

/**
 * ENTRAR NA CONTA — com código no e-mail, sem senha.
 *
 * Declarar o módulo de auth SUBSTITUI a lista de provedores padrão, então o
 * `emailpass` precisa vir junto: é por ele que o admin entra. O `codigo` é o
 * nosso (`src/modules/codigo/`) — a rota que manda o código é
 * `POST /store/conta/codigo`, e a que confere é `POST /auth/customer/codigo`.
 *
 * O `codigo-equipe` é o mesmo código, pro painel da loja
 * (`src/modules/codigo-equipe/`): manda por `POST /dashboard/entrar/codigo`,
 * confere em `POST /auth/equipe/codigo-equipe`. Outra identidade — o
 * cliente que também é da equipe tem as duas, e uma não abre a outra.
 *
 * Quem usa qual está em `authMethodsPerActor`, logo abaixo.
 */
const authModule = [
  {
    resolve: "@medusajs/medusa/auth",
    dependencies: [Modules.CACHE, ContainerRegistrationKeys.LOGGER],
    options: {
      providers: [
        { resolve: "@medusajs/medusa/auth-emailpass", id: "emailpass" },
        { resolve: "./src/modules/codigo", id: "codigo" },
        { resolve: "./src/modules/codigo-equipe", id: "codigo-equipe" },
      ],
    },
  },
]

/**
 * OS ENVIOS — o rastreio dos pacotes, venha o aviso de qual parceiro vier.
 *
 * Duas tabelas nossas (`envio` e `envio_evento`, pelo `medusa db:migrate`
 * como qualquer módulo). Quem fala com o parceiro é o tradutor dele
 * (`src/modules/frenet/rastreio.ts`); quem decide é o núcleo
 * (`src/lib/envios/`). Ver o AGENTS.md, "Envios".
 */
const enviosModule = [{ resolve: "./src/modules/envios" }]

/** A lista da newsletter do rodapé (`src/modules/newsletter`). */
const newsletterModule = [{ resolve: "./src/modules/newsletter" }]

/**
 * O ERP — a conexão (tokens cifrados) e a nota fiscal de cada pedido. Quem
 * fala com o ERP é o tradutor dele (`src/modules/bling/`); quem decide é
 * `src/lib/erp/`. Ver o AGENTS.md, "ERP".
 */
const erpModule = [{ resolve: "./src/modules/erp" }]

/**
 * A EQUIPE DO PAINEL DA LOJA — quem entra, com que papel, e o registro de
 * quem fez o quê (`src/modules/equipe/`). Ver o AGENTS.md, "Painel".
 */
const equipeModule = [{ resolve: "./src/modules/equipe" }]

/**
 * A SAÚDE DA LOJA PRO PAINEL — as rodadas dos jobs, os problemas e o sinal
 * de cada integração (`src/modules/observabilidade/`). Ver o AGENTS.md,
 * "Observabilidade".
 */
const observabilidadeModule = [{ resolve: "./src/modules/observabilidade" }]

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    databaseDriverOptions: usaSsl ? { connection: { ssl: { rejectUnauthorized: false } } } : {},
    redisUrl,
    workerMode,
    http: {
      storeCors: process.env.STORE_CORS!,
      adminCors: process.env.ADMIN_CORS!,
      authCors: process.env.AUTH_CORS!,
      jwtSecret: process.env.JWT_SECRET,
      cookieSecret: process.env.COOKIE_SECRET,
      /*
        Cliente entra SÓ pelo código; admin, só por e-mail e senha; a equipe
        do painel, só pelo código dela. Sem esta lista, qualquer provedor
        vale pra qualquer um — inclusive
        `POST /auth/customer/emailpass/register`, que criaria conta de
        cliente com senha, sem provar o e-mail, numa loja que nem pede senha.
        E um ator que não está aqui aceita TODOS os provedores: sem a linha
        `equipe`, o código de cliente viraria token de equipe.
      */
      authMethodsPerActor: {
        user: ["emailpass"],
        customer: ["codigo"],
        equipe: ["codigo-equipe"],
      },
      /*
        30 dias, e não o 1 dia padrão. O token do cliente mora num cookie
        `httpOnly` da loja e só viaja de servidor pra servidor; com 1 dia, a
        pessoa que volta na semana seguinte pra ver o pedido teria que pedir
        código de novo. O admin não muda: ele troca o token por uma sessão
        na hora de entrar, e a sessão tem a validade dela.
      */
      jwtExpiresIn: "30d",
    },
  },
  admin: {
    // No worker o admin nem é compilado: poupa minutos de build e memória.
    disable: process.env.ADMIN_DISABLED === "true",
    backendUrl: process.env.MEDUSA_BACKEND_URL || "http://localhost:9000",
  },
  modules: [
    ...redisModules,
    ...fileModule,
    ...fulfillmentModule,
    ...paymentModule,
    ...authModule,
    ...enviosModule,
    ...newsletterModule,
    ...erpModule,
    ...equipeModule,
    ...observabilidadeModule,
  ],
})
