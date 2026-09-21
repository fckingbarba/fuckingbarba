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

  return {
    /** Ainda cabe mais uma nesta janela? Só olha — quem conta é `contar`. */
    cabe(chave: string, janela: Janela, agora = Date.now()): boolean {
      return dentro(chave, janela, agora).length < janela.limite
    },
    contar(chave: string, janela: Janela, agora = Date.now()) {
      const lista = dentro(chave, janela, agora)
      lista.push(agora)
      vezes.set(chave, lista)
      // Um teto pro mapa: sob ataque de muitos IPs, a memória não cresce sem
      // fim. Esquecer os mais antigos é aceitável — o limite global continua.
      if (vezes.size > MAX_CHAVES) {
        const primeira = vezes.keys().next().value
        if (primeira !== undefined) vezes.delete(primeira)
      }
    },
  }
}
