/**
 * CEP: limpar e mascarar.
 *
 * Separado de `cep.ts` porque aquele é `server-only` (fala com o ViaCEP) e o
 * formulário de entrega é componente de cliente: importar o arquivo do
 * servidor a partir dele quebraria o build. Aqui não há import nenhum, então
 * os dois lados usam exatamente a mesma noção de "CEP limpo" — que é o que
 * impede a máscara de aceitar o que a validação recusa.
 */

/** Oito dígitos, sem traço. String vazia se não der oito. */
export function limparCep(entrada: string): string {
  const so = entrada.replace(/\D+/g, "")
  return so.length === 8 ? so : ""
}

/** 01310100 → 01310-100, pondo o traço enquanto a pessoa digita. */
export function mascararCep(entrada: string): string {
  const so = entrada.replace(/\D+/g, "").slice(0, 8)
  return so.replace(/^(\d{5})(\d)/, "$1-$2")
}
