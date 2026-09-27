/**
 * QUANTAS VEZES, EM QUANTO TEMPO — uma janela deslizante, na memória.
 *
 * Serve pro que não tem dono no banco: o endereço de IP que pede código pra
 * e-mails diferentes, e o total da loja. (O limite por e-mail mora no banco,
 * junto do código, em `modules/codigo/regras.ts`.)
 *
 * NA MEMÓRIA, E NÃO NO REDIS, sabendo o preço: o contador zera quando o
 * servidor reinicia, e se um dia o backend rodar em duas instâncias, cada
 * uma conta a sua metade. Hoje é um processo só (`WORKER_MODE=shared`, ver
 * ESTADO.md), e o que isto segura — alguém disparando código pra mil
 * e-mails — é contido do mesmo jeito. O limite que protege cada CONTA é o do
 * banco; este protege a loja de virar máquina de spam.
 */

type Janela = { limite: number; ms: number }

const MAX_CHAVES = 20_000

export function criarLimite() {
  const vezes = new Map<string, number[]>()

  function dentro(chave: string, janela: Janela, agora: number): number[] {
    const lista = (vezes.get(chave) ?? []).filter((t) => agora - t < janela.ms)
    if (lista.length) vezes.set(chave, lista)
    else vezes.delete(chave)
    return lista
  }

  function contar(chave: string, janela: Janela, agora = Date.now()) {
    const lista = dentro(chave, janela, agora)
    lista.push(agora)
    vezes.set(chave, lista)
    // Um teto pro mapa: sob ataque de muitos IPs, a memória não cresce sem
    // fim. Esquecer os mais antigos é aceitável — o limite global continua.
    if (vezes.size > MAX_CHAVES) {
      const primeira = vezes.keys().next().value
      if (primeira !== undefined) vezes.delete(primeira)
    }
  }

  return {
    /** Ainda cabe mais uma nesta janela? Só olha — quem conta é `contar`. */
    cabe(chave: string, janela: Janela, agora = Date.now()): boolean {
      return dentro(chave, janela, agora).length < janela.limite
    },
    contar,
    /**
     * CONTA JÁ, e devolve como desfazer — pra quem ainda vai esperar o banco
     * antes de saber se o pedido sai. Conferir (`cabe`) e só contar no fim
     * deixava pedidos ao mesmo tempo passarem todos pela conferência, porque
     * nenhum tinha contado ainda (auditoria de 27/09: uma rajada mandava
     * centenas de códigos). Conferir e reservar vão juntos, sem `await` no
     * meio; quem no fim não mandou nada devolve a vaga.
     */
    reservar(chave: string, janela: Janela, agora = Date.now()): () => void {
      contar(chave, janela, agora)
      let devolvida = false
      return () => {
        if (devolvida) return
        devolvida = true
        const lista = vezes.get(chave)
        const i = lista?.indexOf(agora) ?? -1
        if (!lista || i < 0) return
        lista.splice(i, 1)
        if (!lista.length) vezes.delete(chave)
      }
    },
  }
}

/**
 * QUANTO, NO DIA — um total por chave que zera à meia-noite (UTC), pro teto
 * de VOLUME (quantos eventos um endereço grava por dia; auditoria de 27/09).
 * A janela deslizante de `criarLimite` guardaria um horário por evento; aqui
 * é um número por chave. Mesmo preço: mora na memória e zera no reinício.
 */
export function criarTetoDoDia() {
  const somas = new Map<string, { dia: string; total: number }>()
  const diaDe = (agora: number) => new Date(agora).toISOString().slice(0, 10)

  function lido(chave: string, agora: number): number {
    const s = somas.get(chave)
    return s && s.dia === diaDe(agora) ? s.total : 0
  }

  return {
    /** Ainda cabem mais `peso` hoje? Só olha — quem soma é `somar`. */
    cabe(chave: string, teto: number, peso = 1, agora = Date.now()): boolean {
      return lido(chave, agora) + peso <= teto
    },
    somar(chave: string, peso = 1, agora = Date.now()) {
      somas.set(chave, { dia: diaDe(agora), total: lido(chave, agora) + peso })
      if (somas.size > MAX_CHAVES) {
        const primeira = somas.keys().next().value
        if (primeira !== undefined) somas.delete(primeira)
      }
    },
  }
}
