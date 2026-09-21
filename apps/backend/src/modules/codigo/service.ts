import { AbstractAuthModuleProvider, MedusaError } from "@medusajs/framework/utils"
import type {
  AuthenticationInput,
  AuthenticationResponse,
  AuthIdentityDTO,
  AuthIdentityProviderService,
} from "@medusajs/framework/types"
import { conferir, normalizarEmail, TENTATIVAS, type MetadadosDoCodigo } from "./regras"

/**
 * ENTRAR COM O CÓDIGO DO E-MAIL — o provedor de auth `codigo`.
 *
 * Registrado no `medusa-config.ts` com `id: "codigo"`, o que abre a rota
 * `POST /auth/customer/codigo` do próprio Medusa. É ela que a loja chama com
 * `{ email, codigo }`; se o código confere, o Medusa devolve o token do
 * cliente, do mesmo jeito que devolveria pra e-mail e senha.
 *
 * ┌─ AS DUAS METADES DO CAMINHO ───────────────────────────────────────────┐
 * │ 1. MANDAR o código é a rota `POST /store/conta/codigo`, nossa. Ela     │
 * │    sorteia, guarda o hash no `provider_metadata` da identidade `codigo`│
 * │    daquele e-mail (criando a identidade se for a primeira vez) e manda │
 * │    o e-mail. Não mora aqui porque um provedor de auth só responde "deu │
 * │    certo" ou "não deu" — e "código enviado" não é nenhum dos dois.     │
 * │                                                                        │
 * │ 2. CONFERIR é aqui. Certo: o código some (não serve duas vezes) e a    │
 * │    identidade volta pro Medusa, que gera o token. Errado: a tentativa  │
 * │    conta, e na quinta o código morre — nem o certo entra mais.         │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * NÃO EXISTE CADASTRO. O `register` recusa sempre: a conta nasce do
 * primeiro código confirmado (a loja chama `POST /store/conta/vincular` com
 * o token). Um `register` aberto seria um jeito de criar identidade sem
 * provar que o e-mail é de quem pediu.
 *
 * OS ERROS SÃO CÓDIGOS, NÃO FRASES: `codigo_errado`, `codigo_vencido`,
 * `codigo_esgotado`. O Medusa devolve o texto do erro como `message` de um
 * 401, e a loja traduz pra frase da tela — que é onde a voz da marca mora.
 * E-mail sem identidade e identidade sem código pendente respondem
 * `codigo_errado`, igual ao código errado: a resposta não conta pra ninguém
 * quais e-mails têm conta.
 */
export default class CodigoDeAcesso extends AbstractAuthModuleProvider {
  static identifier = "codigo"
  static DISPLAY_NAME = "Código por e-mail"

  async register(): Promise<AuthenticationResponse> {
    return { success: false, error: "cadastro_pelo_codigo" }
  }

  async authenticate(
    dados: AuthenticationInput,
    identidades: AuthIdentityProviderService
  ): Promise<AuthenticationResponse> {
    const corpo = (dados.body ?? {}) as { email?: unknown; codigo?: unknown }
    const email = normalizarEmail(corpo.email)
    const codigo = typeof corpo.codigo === "string" ? corpo.codigo.replace(/\D+/g, "") : ""
    if (!email || codigo.length !== 6) return falha("codigo_errado")

    let identidade: AuthIdentityDTO
    try {
      identidade = await identidades.retrieve({ entity_id: email })
    } catch (e) {
      if ((e as { type?: string })?.type === MedusaError.Types.NOT_FOUND)
        return falha("codigo_errado")
      throw e
    }

    const minha = identidade.provider_identities?.find((p) => p.provider === this.provider)
    const meta = (minha?.provider_metadata ?? {}) as MetadadosDoCodigo
    const veredito = conferir(meta.codigo, email, codigo)

    if (veredito === "certo") {
      await identidades.update(email, {
        provider_metadata: { ...meta, codigo: null, ultimo_acesso: new Date().toISOString() },
      })
      return { success: true, authIdentity: semSegredos(identidade) }
    }

    if (veredito === "errado" && meta.codigo) {
      const tentativas = (meta.codigo.tentativas ?? 0) + 1
      await identidades.update(email, {
        provider_metadata: { ...meta, codigo: { ...meta.codigo, tentativas } },
      })
      // A quinta errada já responde "esgotado": dizer "errado" e deixar a
      // pessoa digitar de novo pra só então contar que acabou seria gastar a
      // paciência dela à toa.
      return falha(tentativas >= TENTATIVAS ? "codigo_esgotado" : "codigo_errado")
    }

    return falha(veredito === "sem_codigo" ? "codigo_errado" : `codigo_${veredito}`)
  }
}

function falha(error: string): AuthenticationResponse {
  return { success: false, error }
}

/**
 * A identidade sai daqui sem o `provider_metadata` — o hash e a lista de
 * envios são assunto deste provedor, e não têm por que viajar junto pro
 * resto do Medusa. É o que o `emailpass` faz com o hash da senha.
 */
function semSegredos(identidade: AuthIdentityDTO): AuthIdentityDTO {
  return {
    ...identidade,
    provider_identities: identidade.provider_identities?.map((p) => {
      const { provider_metadata: _fora, ...resto } = p
      return resto
    }),
  }
}
