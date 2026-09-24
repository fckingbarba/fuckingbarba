import CodigoDeAcesso from "../codigo/service"

/**
 * ENTRAR NO PAINEL DA LOJA — o provedor de auth `codigo-equipe`.
 *
 * É o mesmo "código no e-mail" da conta do cliente (`modules/codigo`), com
 * as mesmas regras de validade e tentativas — mas numa identidade SEPARADA.
 * O Medusa guarda uma identidade por provedor e e-mail, então o código que
 * alguém pede na loja fica numa (`codigo`) e o do painel noutra
 * (`codigo-equipe`): o código da loja não abre o painel, nem ao contrário,
 * mesmo quando a pessoa da equipe também é cliente.
 *
 * Registrado com `id: "codigo-equipe"` no `medusa-config.ts`, o que abre
 * `POST /auth/equipe/codigo-equipe`. Quem pode usar é só o ator `equipe`
 * (`authMethodsPerActor`). Quem MANDA o código é `POST /dashboard/entrar/codigo`,
 * e só pra quem está na equipe.
 *
 * O `identifier` precisa ser igual ao `id` do registro: é por ele que o
 * provedor acha a identidade dele na hora de conferir.
 */
export default class CodigoDaEquipe extends CodigoDeAcesso {
  static identifier = "codigo-equipe"
  static DISPLAY_NAME = "Código por e-mail (painel da loja)"
}
