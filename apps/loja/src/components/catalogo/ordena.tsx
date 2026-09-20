import { Raio } from "@/components/icones"
import { ORDENS, type Ordem } from "@/lib/catalogo"

/**
 * A ORDENAÇÃO — formulário de verdade, `method="get"`, sem uma linha de JS.
 *
 * O que isso compra, concretamente:
 *
 *   · a escolha vira `?ordem=barato` na URL, que é uma página que o servidor
 *     sabe desenhar, que dá pra mandar por WhatsApp e que volta igual no
 *     botão voltar do navegador;
 *   · funciona antes de qualquer script carregar, e continua funcionando se
 *     o script falhar. `<select onChange={…}>` não faz nada nesse caso, e
 *     quebra CALADO — a pessoa escolhe "menor preço", a lista não muda, e
 *     ela conclui que a loja está com defeito.
 *
 * O BOTÃO FICA SEMPRE VISÍVEL, em vez de aparecer só dentro de `<noscript>`.
 * Dois estados diferentes do mesmo controle é o tipo de coisa que ninguém
 * testa, e o que não se testa é o que quebra.
 *
 * Server Component de propósito: não há estado nenhum aqui. O valor atual
 * vem da URL, que já é o estado.
 */

export function Ordena({ ordem }: { ordem: Ordem }) {
  return (
    <form className="ordena" method="get">
      <label className="ordena__rotulo" htmlFor="ordem">
        Ordenar por
      </label>
      <span className="ordena__caixa">
        {/*
          `defaultValue` e não `value`: é um Server Component, não existe
          onChange, e `value` sem onChange faz o React reclamar de campo
          controlado sem controlador. O navegador é que guarda a escolha até
          o envio — que é exatamente o comportamento desejado.
        */}
        <select className="ordena__select" id="ordem" name="ordem" defaultValue={ordem}>
          {ORDENS.map((o) => (
            <option key={o.id || "relevancia"} value={o.id}>
              {o.nome}
            </option>
          ))}
        </select>
        <button className="ordena__vai" type="submit" aria-label="Aplicar ordenação">
          <Raio aria-hidden="true" />
        </button>
      </span>
    </form>
  )
}
