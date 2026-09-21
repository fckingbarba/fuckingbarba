/**
 * O CEP QUE A PESSOA JÁ DIGITOU, guardado no navegador.
 *
 * Quem calculou o frete numa página de produto não digita de novo na sacola,
 * nem na próxima PDP, nem na visita de amanhã. As duas calculadoras — a da
 * PDP e o bloco "Frete e prazo" da sacola — leem e escrevem daqui, e é por
 * isso que isto saiu de dentro de uma delas: com uma cópia em cada, bastava
 * uma trocar o nome da chave pra outra parar de enxergar o CEP.
 *
 * `localStorage` é por navegador e some quando a pessoa limpa os dados — por
 * isso toda leitura e escrita vai dentro de try/catch e a tela funciona igual
 * sem ele. Em modo anônimo o acesso LANÇA, não devolve vazio.
 *
 * Sem import nenhum: roda no navegador, dentro de componente de cliente.
 */

const CHAVE = "fb_cep"

export function cepGuardado(): string {
  try {
    return localStorage.getItem(CHAVE) ?? ""
  } catch {
    return ""
  }
}

export function guardarCep(cep: string) {
  try {
    localStorage.setItem(CHAVE, cep)
  } catch {
    /* navegador sem armazenamento: a calculadora funciona igual, só não
       lembra do CEP na próxima visita */
  }
}
