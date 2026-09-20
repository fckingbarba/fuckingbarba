import { loadEnv, defineConfig } from "@medusajs/framework/utils"

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
    },
  },
  admin: {
    // No worker o admin nem é compilado: poupa minutos de build e memória.
    disable: process.env.ADMIN_DISABLED === "true",
    backendUrl: process.env.MEDUSA_BACKEND_URL || "http://localhost:9000",
  },
  modules: [...redisModules, ...fileModule, ...fulfillmentModule],
})
