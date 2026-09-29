/**
 * A MEMÓRIA CURTA DAS LEITURAS DO MARKETING (entrega 0199).
 *
 * Abrir o Marketing dispara várias rotas juntas (o Resumo, as visitas, "O que
 * os dados dizem" e os canais), e o "O que os dados dizem" roda as contas das
 * seis abas — cada uma lendo os pedidos do período. Eram cinco leituras iguais
 * dos pedidos com o total por abertura (e a história inteira, pros Clientes).
 *
 * Aqui a mesma leitura (a mesma `chave`: o que se lê e desde quando) sai uma
 * vez: quem chega junto espera a mesma resposta, e quem chega depois, até
 * `MARKETING_MEMORIA_SEGUNDOS` (90, sem a variável; 0 desliga), recebe a
 * guardada. Os números do Marketing são de dias: 90 segundos não mudam a
 * leitura de ninguém. As telas do dia a dia (Início, Pedidos) não passam por
 * aqui — lá, o que acabou de mudar aparece na hora.
 *
 * Quem recebe não pode mexer no que recebeu: a resposta é a mesma pra todos
 * (as contas do Marketing montam objetos novos — conferido na 0199).
 */

const guardadas = new Map<string, { vence: number; valor: Promise<unknown> }>()

/** Quantos segundos a leitura fica guardada: `MARKETING_MEMORIA_SEGUNDOS`, 90 sem ela. */
export function segundosDaMemoria(): number {
  const n = Number(process.env.MARKETING_MEMORIA_SEGUNDOS ?? 90)
  return Number.isFinite(n) && n >= 0 ? n : 90
}

/** A leitura da `chave`: a guardada, se ainda vale; senão, `ler()` — e guarda. */
export function lembrar<T>(chave: string, ler: () => Promise<T>, agora = Date.now()): Promise<T> {
  const segundos = segundosDaMemoria()
  if (!segundos) return ler()
  for (const [k, g] of guardadas) if (g.vence <= agora) guardadas.delete(k)
  const guardada = guardadas.get(chave)
  if (guardada) return guardada.valor as Promise<T>
  const valor = ler()
  const nova = { vence: agora + segundos * 1000, valor }
  guardadas.set(chave, nova)
  // A que falhou não fica: a próxima pergunta lê de novo.
  valor.catch(() => {
    if (guardadas.get(chave) === nova) guardadas.delete(chave)
  })
  return valor
}

/** Pros testes: esquece tudo. */
export function esquecerAMemoria() {
  guardadas.clear()
}
