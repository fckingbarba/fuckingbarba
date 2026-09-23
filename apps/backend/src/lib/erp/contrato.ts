/**
 * O CONTRATO DO ERP — o que a loja pede a qualquer ERP, na língua dela.
 *
 * A loja não sabe o que é "pedido de venda", "situação 5" ou "saldo
 * virtual": ela sabe que tem um estoque pra espelhar e uma nota pra emitir,
 * acompanhar e desfazer. Cada ERP tem um TRADUTOR que cumpre este contrato
 * (o do Bling está em `src/modules/bling/erp.ts`), e trocar de ERP é
 * escrever outro tradutor e pôr em `erps.ts` — o estoque, as notas, os
 * e-mails e a Frenet não mudam.
 *
 *   ┌─ a loja (lib/erp) ──────────────┐        ┌─ o tradutor ─────────────┐
 *   │ estoque.ts   espelha o saldo    │ ──────▶│ lerSaldos                │
 *   │ notas.ts     emite, acompanha,  │ ──────▶│ emitirNota, consultarNota│
 *   │              desfaz, avisa      │        │ desfazerNota             │
 *   │ catalogo.ts  importa os produtos│ ──────▶│ lerCatalogo              │
 *   │ conexao.ts   guarda os tokens   │ ──────▶│ autorização e renovação  │
 *   └─────────────────────────────────┘        └──────────────────────────┘
 *
 * O ERP MANDA NO ESTOQUE (decidido em 23/09): entrada, produção e perda são
 * lançadas nele, e a loja só copia o saldo. A nota sai quando o pagamento
 * cai, e vai pra SEFAZ na hora.
 */

/** Os tokens da autorização. A loja guarda cifrado (`cofre.ts`) e nunca mostra. */
export type Credenciais = {
  acesso: string
  renovacao: string
  /** ISO. */
  expiraEm: string
}

export type ResultadoDaAutorizacao =
  { ok: true; credenciais: Credenciais; empresa: string | null } | { ok: false; motivo: string }

export type Renovacao =
  | { ok: true; credenciais: Credenciais }
  | {
      ok: false
      motivo: string
      /** O ERP recusou a renovação: só conectando de novo, no admin. */
      caiu: boolean
    }

/**
 * Como o tradutor pega o token: `token()` dá um que vale agora, e
 * `renovado(o que falhou)` troca por outro quando o ERP recusou aquele
 * (ver `conexao.ts`, que é quem guarda).
 */
export type Acesso = {
  token(): Promise<string>
  renovado(recusado: string): Promise<string>
}

/* ── o estoque ────────────────────────────────────────────────────────────── */

export type SaldoNoErp = {
  sku: string
  /** O que dá pra vender: o que está na prateleira menos o que o ERP já reservou. */
  saldo: number
}

export type LeituraDeSaldos =
  | {
      ok: true
      saldos: SaldoNoErp[]
      /** Os SKUs que o ERP não conhece (ou tem inativos): a loja não mexe neles. */
      naoAchados: string[]
    }
  | { ok: false; motivo: string }

/* ── o catálogo (a importação dos produtos) ───────────────────────────────── */

/** Centímetros, da caixa fechada: é o que a transportadora mede. */
export type MedidasDaCaixa = { comprimento: number; largura: number; altura: number }

/**
 * Uma foto do produto no ERP. O `url` pode mudar a cada leitura (link que
 * vence); a `chave` não muda enquanto a foto for a mesma. É pela chave que a
 * loja sabe que já copiou aquela foto.
 */
export type FotoNoErp = { url: string; chave: string }

export type VariacaoNoErp = {
  id: string
  sku: string | null
  /** "Tamanho" → "G". */
  opcoes: Record<string, string>
  /** Em reais. `null`: vale o do produto. */
  preco: number | null
  /** `null`: vale o do produto. */
  pesoGramas: number | null
  medidas: MedidasDaCaixa | null
}

export type ProdutoNoErp = {
  id: string
  nome: string
  /** O código do produto. No produto com variações, quem vende são elas. */
  sku: string | null
  /** Texto puro (o ERP guarda HTML). */
  descricao: string | null
  /** Em reais. */
  preco: number | null
  pesoGramas: number | null
  medidas: MedidasDaCaixa | null
  fotos: FotoNoErp[]
  /** O kit montado no ERP: na loja é um produto como outro qualquer, com o SKU dele. */
  composicao: boolean
  /** Vazia no produto simples. */
  variacoes: VariacaoNoErp[]
}

export type LeituraDoCatalogo =
  | {
      ok: true
      produtos: ProdutoNoErp[]
      /** Os ids pedidos que o ERP não tem mais como produto ativo. */
      naoAchados: string[]
      /** Produtos que ficaram de fora do limite de uma leitura. */
      restantes: number
    }
  | { ok: false; motivo: string }

/* ── a nota ───────────────────────────────────────────────────────────────── */

export type EnderecoDaNota = {
  /** Só dígitos. */
  cep: string
  rua: string
  numero: string
  complemento: string | null
  bairro: string
  cidade: string
  uf: string
}

/** O pedido pago, com o que a nota precisa — no vocabulário da loja. */
export type PedidoParaNota = {
  /** O número que a loja mostra. */
  numero: number
  /** Como o pedido se chama no ERP: "FB-1042" (o mesmo nome do painel da Frenet). */
  referencia: string
  /** O dia da compra, em Brasília: AAAA-MM-DD. */
  data: string
  cliente: {
    nome: string
    documento: { tipo: "cpf" | "cnpj"; valor: string }
    email: string | null
    /** Só dígitos, com DDD. */
    telefone: string | null
    endereco: EnderecoDaNota
  }
  entrega: EnderecoDaNota & { nome: string }
  itens: {
    sku: string
    nome: string
    quantidade: number
    /** Em reais: o preço da unidade antes dos descontos do pedido. */
    precoUnitario: number
  }[]
  /** Em reais: os descontos do pedido todo (cupom, oferta do checkout). */
  desconto: number
  /** Em reais. */
  frete: number
  /** Em reais: o que a pessoa pagou. */
  total: number
  pagamento: { forma: "pix" | "cartao" | "outra"; parcelas: number }
}

/**
 * Os passos já dados no ERP — o tradutor define o que vai aqui (no Bling, os
 * ids do contato, do pedido de venda e da nota). A loja só guarda e devolve.
 */
export type Passos = Record<string, unknown>

/** Onde a nota está, na língua da loja. */
export type SituacaoNoErp =
  | "pendente" // criada no ERP, ainda não foi pra SEFAZ
  | "processando" // na SEFAZ, sem resposta
  | "autorizada"
  | "rejeitada"
  | "denegada"
  | "cancelada"

export type EstadoDaNota = {
  situacao: SituacaoNoErp
  /** O que o ERP disse: o motivo da rejeição, o nome da situação dele. */
  detalhe: string | null
  numero: string | null
  serie: string | null
  chave: string | null
  /** ISO: quando foi autorizada. */
  emitidaEm: string | null
  /** Em reais. */
  valor: number | null
  linkDanfe: string | null
}

export type ResultadoDaEmissao =
  | { ok: true; nota: EstadoDaNota }
  | {
      ok: false
      motivo: string
      /** Tentar de novo não resolve (o ERP recusou o que recebeu). */
      definitivo: boolean
      /**
       * Não é definitivo — depois do conserto, a mesma tentativa passa —, mas
       * alguém precisa agir no ERP (a permissão que falta no app). A equipe
       * recebe o aviso; a loja segue tentando.
       */
      precisaDeGente?: boolean
    }

export type ResultadoDaConsulta = { ok: true; nota: EstadoDaNota } | { ok: false; motivo: string }

export type ResultadoDoDesfazer =
  | { ok: true; como: string }
  | {
      ok: false
      motivo: string
      /** Não há o que o código faça: alguém precisa desfazer no ERP. */
      precisaDeGente: boolean
    }

/* ── as permissões do app ─────────────────────────────────────────────────── */

export type PermissaoNoErp = {
  /** O nome do escopo, como a pessoa acha na tela de escopos do app no ERP. */
  escopo: string
  /** Pra que a loja precisa dele. */
  paraQue: string
  /** `null`: não deu pra conferir agora (o ERP fora do ar, a conexão caída). */
  ok: boolean | null
  motivo: string | null
}

/* ── os avisos do ERP (webhooks) ──────────────────────────────────────────── */

export type ChegadaDoErp = {
  cabecalhos: Record<string, string | string[] | undefined>
  consulta: Record<string, unknown>
  corpo: unknown
  /** O corpo cru: é sobre ele que o ERP assina. */
  bruto: string | null
}

export type LeituraDoAvisoDoErp =
  | {
      ok: true
      /** O saldo de algum produto mudou no ERP. */
      estoque: boolean
      /** Os ids (no ERP) das notas que mudaram. */
      notas: string[]
    }
  | {
      ok: false
      motivo: "sem-configuracao" | "nao-autorizado" | "ilegivel"
      detalhe: string
    }

/* ── o tradutor ───────────────────────────────────────────────────────────── */

export type ErpDaLoja = {
  /** O id na loja: é o que vai nas URLs (`/hooks/erp/<id>`) e nas tabelas. */
  id: string
  /** Como o ERP se chama nos e-mails e no admin. */
  nome: string
  /** As variáveis do app estão no ambiente? Sem elas, nem dá pra conectar. */
  configurado(): boolean
  /** De onde sai a chave do cofre (o segredo do app no ERP). */
  segredoDoCofre(): string

  urlDeAutorizacao(estado: string): string
  concluirAutorizacao(codigo: string): Promise<ResultadoDaAutorizacao>
  renovar(credenciais: Credenciais): Promise<Renovacao>

  lerSaldos(acesso: Acesso, skus: string[]): Promise<LeituraDeSaldos>

  /**
   * Os produtos ativos do ERP (serviço fica de fora), com peso, medidas,
   * fotos e variações. Com `ids`, só esses: é a releitura da importação,
   * que não confia no que a prévia mostrou minutos antes.
   */
  lerCatalogo(acesso: Acesso, ids?: string[]): Promise<LeituraDoCatalogo>

  /**
   * Leva a nota do pedido até a SEFAZ. Cada passo dado no ERP é gravado com
   * `salvar` NA HORA — a próxima tentativa continua dali. Não pode lançar.
   */
  emitirNota(
    acesso: Acesso,
    pedido: PedidoParaNota,
    passos: Passos,
    salvar: (passos: Passos) => Promise<void>
  ): Promise<ResultadoDaEmissao>
  consultarNota(acesso: Acesso, passos: Passos): Promise<ResultadoDaConsulta>
  /** Desfaz o que dá pra desfazer de um pedido cancelado antes da autorização. */
  desfazerNota(acesso: Acesso, passos: Passos): Promise<ResultadoDoDesfazer>
  /** Os passos já criaram o pedido no ERP? (É o que reserva o estoque lá.) */
  pedidoNoErp(passos: Passos): boolean
  /** O id da nota no ERP, se ela já existe — é por ele que o aviso do ERP acha o registro. */
  idDaNota(passos: Passos): string | null

  lerAviso(chegada: ChegadaDoErp): LeituraDoAvisoDoErp

  /**
   * Cada escopo que a loja usa, conferido com uma leitura inofensiva. É o que
   * diz, sem adivinhar, qual permissão falta no app quando o ERP responde
   * "sem permissão".
   */
  conferirPermissoes(acesso: Acesso): Promise<PermissaoNoErp[]>
}
