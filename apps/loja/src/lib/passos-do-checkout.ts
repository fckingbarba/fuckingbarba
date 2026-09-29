import { limparCep } from "./cep-formato"
import type { CheckoutVisivel, ErrosDoFormulario } from "./checkout-visivel"
import { conferirDocumento, type Documento } from "./documento"
import { ehUf } from "./endereco"
import { conferirTelefone } from "./telefone"

/**
 * AS REGRAS DOS PASSOS 1 E 2 — as mesmas na tela e na ação.
 *
 * O passo seguinte abre no clique, e a loja grava por trás (entrega 0201).
 * Então a tela confere o formulário ANTES de abrir o próximo passo: com uma
 * regra na tela e outra na ação, o passo abriria com um dado que a ação
 * recusa, e a pessoa voltaria de onde saiu. Por isso a regra é uma só, aqui,
 * e os dois lados importam — sem dependência nenhuma de servidor.
 *
 * A AÇÃO CONFERE TUDO DE NOVO. Server action é um POST público (ver
 * `acoes/checkout.ts`): o que a tela conferiu não vale nada pra ela. E ela
 * ainda tem o que a tela não sabe — o CEP de outra cidade (ViaCEP), o e-mail
 * que o Medusa recusa, a sacola que expirou.
 */

/* ── passo 1: o contato ───────────────────────────────────────────────────── */

/**
 * E-mail: A MESMA REGRA DO MEDUSA, nem mais nem menos — a do zod 4 que o
 * `POST /store/carts/:id` usa (`z.string().email()`, em
 * `@medusajs/medusa/dist/api/store/carts/validators.js`; a regex é a
 * `email` de `zod/v4/core/regexes`). Mais rígida que ela, recusaria e-mail
 * que o pedido aceita: venda perdida. Mais frouxa — como era, só "algo@algo.xx"
 * —, "joão@gmail.com", "jose..silva@gmail.com" e "maria@gmail.com." passavam
 * aqui, o Medusa recusava com 400, e a tela dizia "Não consegui falar com a
 * loja agora" pra sempre: a pessoa não saía do passo 1 (entrega 0136). Se o
 * Medusa mudar a regra num upgrade, o 400 dele ainda cai embaixo do campo
 * (`salvarContato`), e não na frase genérica.
 */
const EMAIL_DO_MEDUSA =
  /^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-\.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/
const ehEmail = (v: string) => EMAIL_DO_MEDUSA.test(v)

/** O que mais escapa na digitação do e-mail — a frase aponta o conserto. */
export function dicaDoEmail(v: string): string {
  if (/[^ -~]/.test(v)) return "E-mail não leva acento nem cedilha. Confere as letras."
  if (v.includes(",")) return "Tem uma vírgula no e-mail. No lugar dela vai um ponto."
  if (/\s/.test(v)) return "E-mail não tem espaço. Confere o que foi digitado."
  if (v.includes("..")) return "Tem dois pontos seguidos no e-mail. Deixa um só."
  if (v.includes(".@")) return "Tem um ponto logo antes do @. Tira ele."
  if (v.endsWith(".")) return "O e-mail terminou num ponto. Tira ele."
  return "Escreve um e-mail que você abre — é por ele que as novidades do pedido chegam."
}

/**
 * O maior e-mail que o Pagar.me aceita. Acima disso ele recusa o pedido
 * inteiro — e a loja só descobria no "pagar", com "não consegui iniciar o
 * pagamento" e nenhuma pista do porquê (24/09). Recusado aqui, no passo 1, a
 * pessoa lê o motivo embaixo do campo. (O backend confere de novo, em
 * `modules/pagarme/pedido.ts`.)
 */
const EMAIL_MAXIMO = 64

const texto = (fd: FormData, campo: string) => String(fd.get(campo) ?? "").trim()

export type ContatoDigitado = {
  email: string
  nome: string
  sobrenome: string
  /** `+55…`, do `conferirTelefone`. */
  telefone: string
  documento: Documento
}

export type Conferencia<T> = { ok: true; dados: T } | { ok: false; erros: ErrosDoFormulario }

export function conferirContato(fd: FormData): Conferencia<ContatoDigitado> {
  const email = texto(fd, "email").toLowerCase()
  const nome = texto(fd, "nome")
  const sobrenome = texto(fd, "sobrenome")

  const erros: ErrosDoFormulario = {}
  if (!ehEmail(email)) {
    erros.email = dicaDoEmail(email)
  } else if (email.length > EMAIL_MAXIMO) {
    erros.email = `Esse e-mail passa de ${EMAIL_MAXIMO} caracteres, o limite do pagamento. Usa outro, por favor.`
  }
  if (!nome) erros.nome = "Falta o nome."
  if (!sobrenome) erros.sobrenome = "Falta o sobrenome."

  const telefone = conferirTelefone(texto(fd, "telefone"))
  if (!telefone) erros.telefone = "Telefone com DDD, 10 ou 11 dígitos."

  const doc = conferirDocumento(texto(fd, "documento"))
  if (!doc.ok) erros.documento = doc.erro

  if (!telefone || !doc.ok || Object.keys(erros).length) return { ok: false, erros }
  return { ok: true, dados: { email, nome, sobrenome, telefone, documento: doc.documento } }
}

/* ── passo 2: o endereço ──────────────────────────────────────────────────── */

export type EnderecoDigitado = {
  /** Só os 8 dígitos. */
  cep: string
  rua: string
  numero: string
  complemento: string
  bairro: string
  cidade: string
  uf: string
  /** A entrega marcada no formulário — a primeira da lista, se ninguém tocou. */
  frete: string | null
}

export function conferirEndereco(fd: FormData): Conferencia<EnderecoDigitado> {
  const dados: EnderecoDigitado = {
    cep: limparCep(texto(fd, "cep")),
    rua: texto(fd, "rua"),
    numero: texto(fd, "numero"),
    complemento: texto(fd, "complemento"),
    bairro: texto(fd, "bairro"),
    cidade: texto(fd, "cidade"),
    uf: texto(fd, "uf").toUpperCase(),
    frete: texto(fd, "opcao") || null,
  }

  const erros: ErrosDoFormulario = {}
  if (!dados.cep) erros.cep = "CEP tem 8 dígitos."
  if (!dados.rua) erros.rua = "Falta a rua."
  if (!dados.numero) erros.numero = "Falta o número. Se não tem, escreve S/N."
  if (!dados.bairro) erros.bairro = "Falta o bairro."
  if (!dados.cidade) erros.cidade = "Falta a cidade."
  if (!ehUf(dados.uf)) erros.uf = "Estado em duas letras (SP, RJ, MG…)."

  return Object.keys(erros).length ? { ok: false, erros } : { ok: true, dados }
}

/* ── o carrinho como vai ficar ────────────────────────────────────────────── */

/** O que um passo enviou e a loja ainda está gravando. */
export type Adiantado =
  { etapa: "contato"; dados: ContatoDigitado } | { etapa: "entrega"; dados: EnderecoDigitado }

/**
 * O carrinho com o que o passo enviou já dentro — é por ele que a tela
 * decide que passo abrir e o que escrever na linha do passo feito, enquanto
 * a ação ainda vai e volta. Só os campos que o passo grava; o dinheiro
 * (frete, total) continua o do carrinho de verdade até a resposta chegar.
 */
export function comOAdiantado(c: CheckoutVisivel, a: Adiantado): CheckoutVisivel {
  if (a.etapa === "contato") {
    const { email, nome, sobrenome, telefone, documento } = a.dados
    return {
      ...c,
      email,
      documento: documento.valor,
      entrega: { ...c.entrega, nome, sobrenome, telefone },
    }
  }
  const { frete, ...endereco } = a.dados
  return {
    ...c,
    entrega: { ...c.entrega, ...endereco },
    freteEscolhido: frete ?? c.freteEscolhido,
  }
}

/**
 * O carrinho de verdade já tem o que o passo enviou? É quando a tela deixa de
 * precisar do adiantado — a resposta da ação e a página refeita chegaram.
 */
export function jaChegou(c: CheckoutVisivel, a: Adiantado): boolean {
  if (a.etapa === "contato") return c.email === a.dados.email && Boolean(c.documento)
  return (
    limparCep(c.entrega.cep) === a.dados.cep &&
    c.entrega.numero === a.dados.numero &&
    (!a.dados.frete || c.freteEscolhido === a.dados.frete)
  )
}
