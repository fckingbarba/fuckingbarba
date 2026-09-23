import { Cadeado, Cartao, Raio, Relogio } from "@/components/icones"
import { PARCELAS_SEM_JUROS, site } from "@/lib/site"

/**
 * OS SELOS DE SEGURANÇA, no rodapé.
 *
 * Desenhados aqui, e não colados de um PNG baixado, por duas razões — uma de
 * desenho e uma bem mais séria.
 *
 * A DE DESENHO: selo de banco de imagem vem com degradê, canto redondo e
 * azul de outra marca. No meio de uma página que é chanfro, borda dura e
 * três cores, ele aparece como o que é — enfeite colado de fora. Selo que
 * parece colado de fora não tranquiliza ninguém; faz o contrário.
 *
 * A SÉRIA: cada linha aqui é uma AFIRMAÇÃO, e todas elas têm que ser
 * verdade e verificáveis pelo próprio cliente na mesma tela.
 *
 *   Conexão segura ..... o cadeado do navegador prova, ao lado da URL
 *   Pagamento .......... quem processa é o provedor; dado de cartão não
 *                        encosta no nosso servidor
 *   7 dias ............. art. 49 do CDC, vale por lei e não depende de nós
 *   Loja oficial ....... é a marca dele
 *
 * >>> O QUE NÃO ENTROU, e por quê: um selo com a marca do Google dizendo
 *     "Navegação Segura". O Google não emite selo pra loja pendurar no
 *     rodapé — esses arquivos circulam soltos por aí. Pôr a marca deles ali
 *     afirma, pro cliente, que o Google certificou este site. Não
 *     certificou. É uso indevido de marca de terceiro e é certificação
 *     inventada (CDC art. 37 §1º), que é a mesma família do antes/depois com
 *     duas pessoas e da garantia que não existia. Um selo que promete
 *     segurança mentindo sobre a origem dele é o pior selo possível.
 *
 * >>> O SELO DE PAGAMENTO fica assim, genérico, até o provedor entrar (fase
 *     4). Aí ele vira o selo LICENCIADO que o próprio provedor entrega — que
 *     vale mais que este, porque é verificável, e é o único jeito certo de
 *     usar marca de terceiro: com autorização.
 */

const SELOS = [
  {
    Icone: Cadeado,
    titulo: "Conexão segura",
    detalhe: "Certificado SSL",
  },
  {
    Icone: Cartao,
    titulo: "Pagamento protegido",
    detalhe: `Pix ou ${PARCELAS_SEM_JUROS}x no cartão`,
  },
  {
    Icone: Relogio,
    titulo: "7 dias pra desistir",
    detalhe: "Direito de arrependimento",
  },
  {
    Icone: Raio,
    titulo: "Loja oficial",
    detalhe: site.nome,
  },
] as const

/*
  `selos__item`, e não `selo`: a Minha conta tem a etiqueta "Principal" do
  endereço com a classe `.selo`, e o CSS dela carrega DEPOIS do rodapé. As
  duas brigavam, e a da conta ganhava — `inline-block`, maiúsculas, borda
  cinza: o rodapé nunca mostrou este desenho, mostrava a etiqueta esticada.
*/
export function Selos() {
  return (
    <section className="selos" aria-labelledby="selos-titulo">
      <h2 className="selos__titulo" id="selos-titulo">
        Compra segura
      </h2>
      <ul className="selos__lista">
        {SELOS.map(({ Icone, titulo, detalhe }) => (
          <li className="selos__item" key={titulo}>
            <span className="selos__icone" aria-hidden="true">
              <Icone />
            </span>
            <span className="selos__texto">
              <b>{titulo}</b>
              <small>{detalhe}</small>
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
