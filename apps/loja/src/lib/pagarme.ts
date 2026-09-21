/**
 * O CARTÃO VIRA TOKEN — no navegador, e só aqui.
 *
 *   navegador ──(número, validade, CVV)──▶ Pagar.me
 *   navegador ◀──────────(token_…)──────── Pagar.me
 *   navegador ──────────(token_…)─────────▶ loja ▶ Medusa ▶ Pagar.me
 *
 * O número do cartão sai do navegador UMA vez, direto pro Pagar.me, e o que
 * volta é um código que vale 60 segundos e um uso. É esse código que viaja
 * na ação de finalizar — o servidor da loja nunca vê o cartão, e por isso a
 * loja não precisa carregar a certificação PCI inteira nas costas.
 *
 * ┌─ AS DUAS REGRAS DO PAGAR.ME PRA ESTA CHAMADA ──────────────────────────┐
 * │ 1. Autentica com a chave PÚBLICA, na query string (`appId`). Nenhum    │
 * │    cabeçalho além de `Content-Type` — ele recusa até `Authorization`.  │
 * │    A chave secreta jamais chega perto deste arquivo.                   │
 * │ 2. O DOMÍNIO da loja precisa estar cadastrado no painel do Pagar.me.   │
 * │    Fora dele, a chamada é recusada — e é por isso que o preview da     │
 * │    Vercel (`*.vercel.app`) não tokeniza sem cadastrar o domínio dele.  │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * `NEXT_PUBLIC_PAGARME_API` só existe no teste, pra apontar pro Pagar.me
 * falso do conferidor. A chave pública é pública por desenho (como a `pk_` do
 * Medusa): vai no JavaScript da página de qualquer jeito.
 */

const API = (process.env.NEXT_PUBLIC_PAGARME_API || "https://api.pagar.me/core/v5").replace(
  /\/+$/,
  ""
)
const CHAVE_PUBLICA = process.env.NEXT_PUBLIC_PAGARME_PUBLIC_KEY ?? ""

export type CartaoDigitado = {
  numero: string
  nome: string
  /** MM/AA, como o campo mascara. */
  validade: string
  cvv: string
}

export type Tokenizado =
  { ok: true; token: string; bandeira: string; final: string } | { ok: false; mensagem: string }

/**
 * O nome como a bandeira aceita: maiúsculo, sem acento, só letras e espaço.
 * "José d'Ávila" vira "JOSE DAVILA" — que é como está gravado no plástico.
 */
export function nomeNoCartao(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z ]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()
}

export async function tokenizar(cartao: CartaoDigitado): Promise<Tokenizado> {
  if (!CHAVE_PUBLICA) {
    return {
      ok: false,
      mensagem: "O pagamento com cartão não está disponível agora. Paga no Pix, ou chama a gente.",
    }
  }

  const [mes, ano] = cartao.validade.split("/")
  const corpo = {
    type: "card",
    card: {
      number: cartao.numero.replace(/\D+/g, ""),
      holder_name: nomeNoCartao(cartao.nome),
      exp_month: Number(mes),
      exp_year: Number(ano),
      cvv: cartao.cvv.replace(/\D+/g, ""),
    },
  }

  try {
    const resposta = await fetch(`${API}/tokens?appId=${encodeURIComponent(CHAVE_PUBLICA)}`, {
      method: "POST",
      // SÓ este cabeçalho. Ver a caixa lá em cima.
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(15_000),
    })
    const json = (await resposta.json().catch(() => null)) as {
      id?: string
      card?: { brand?: string; last_four_digits?: string }
    } | null

    if (!resposta.ok || !json?.id) {
      return {
        ok: false,
        mensagem: "Não consegui validar o cartão. Confere número, validade e CVV e tenta de novo.",
      }
    }
    return {
      ok: true,
      token: json.id,
      bandeira: json.card?.brand ?? "",
      final: json.card?.last_four_digits ?? "",
    }
  } catch {
    return {
      ok: false,
      mensagem:
        "Não consegui falar com o Pagar.me agora. Tenta de novo em instantes, ou paga no Pix.",
    }
  }
}
