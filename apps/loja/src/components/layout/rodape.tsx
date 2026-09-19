import Link from "next/link"
import {
  Envelope,
  Facebook,
  Instagram,
  Raio,
  SetaTopo,
  TikTok,
  WhatsApp,
  YouTube,
} from "@/components/icones"
import { Newsletter } from "./newsletter"
import {
  contato,
  formasDePagamento,
  navegacao,
  parcelamento,
  redes,
  site,
} from "@/lib/site"

/**
 * Rodapé escuro de toda página: novidades, quatro colunas, pagamento e a
 * barra legal. Componente de servidor — o único pedaço com JS é o formulário
 * de novidades, que é ilha à parte.
 *
 * A faixa zebrada do topo e o raio gigante d'água são `::before` e `::after`
 * no CSS: nenhuma imagem extra pra baixar num bloco que aparece em toda
 * página e que ninguém rola até o fim na primeira visita.
 */

const ICONES_REDE = {
  Instagram,
  Facebook,
  YouTube,
  TikTok,
} as const

/**
 * Ano da primeira publicação desta loja — não é pra virar todo 1º de janeiro.
 * O aviso de direitos autorais marca quando a obra foi publicada; ler a data
 * de hoje aqui, além de não ser mais certo, tornaria dinâmico um rodapé que
 * hoje sai pronto do cache em toda página.
 */
const ANO_PUBLICACAO = 2026

export function Rodape() {
  return (
    <footer className="rodape" id="rodape">
      <div className="rodape__wrap">
        <section className="rodape__news" aria-labelledby="news-titulo">
          <div>
            <h2 className="rodape__news-titulo" id="news-titulo">
              <Raio /> Quer receber novidades barbudas?
            </h2>
          </div>
          <Newsletter />
        </section>

        <div className="rodape__colunas">
          <div>
            <Link className="rodape__marca" href="/">
              <Raio /> {site.nome}
            </Link>
            <p className="rodape__assinatura">{site.assinatura}</p>
            <h2 className="rodape__titulo">Siga-nos</h2>
            <ul className="rodape__redes">
              {redes.map((rede) => {
                const Icone = ICONES_REDE[rede.nome]
                return (
                  <li key={rede.nome}>
                    <a
                      href={rede.url}
                      aria-label={`${rede.nome} da ${site.nome}`}
                      rel="noopener"
                    >
                      <Icone />
                    </a>
                  </li>
                )
              })}
            </ul>
          </div>

          <nav aria-labelledby="rod-uteis">
            <h2 className="rodape__titulo" id="rod-uteis">
              Links úteis
            </h2>
            <ul className="rodape__lista">
              {navegacao.uteis.map((item) => (
                <li key={item.texto}>
                  <Link href={item.href}>{item.texto}</Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-labelledby="rod-politicas">
            <h2 className="rodape__titulo" id="rod-politicas">
              Políticas
            </h2>
            <ul className="rodape__lista">
              {navegacao.politicas.map((item) => (
                <li key={item.texto}>
                  <Link href={item.href}>{item.texto}</Link>
                </li>
              ))}
            </ul>
          </nav>

          <div id="rodape-contato">
            <h2 className="rodape__titulo">Entrar em contato</h2>
            <ul className="rodape__lista">
              <li>
                <a href={`https://wa.me/${contato.whatsapp.numero}`} rel="noopener">
                  <WhatsApp />
                  <span>{contato.whatsapp.exibicao}</span> · WhatsApp
                </a>
              </li>
              <li>
                <a href={`mailto:${contato.email}`}>
                  <Envelope />
                  <span>{contato.email}</span>
                </a>
              </li>
            </ul>
            <p className="rodape__horario">
              {contato.horario[0]}
              <br />
              {contato.horario[1]}
            </p>
          </div>
        </div>

        <section className="rodape__pagamento" aria-labelledby="rod-pag">
          <h2 className="rodape__pagamento-titulo" id="rod-pag">
            Formas de pagamento
          </h2>
          <ul className="rodape__formas">
            {formasDePagamento.map((forma) => (
              <li key={forma}>{forma}</li>
            ))}
            <li>
              Cartão em até <b>{parcelamento}</b>
            </li>
          </ul>
        </section>
      </div>

      <div className="rodape__fim">
        <div className="rodape__fim-wrap">
          <p className="rodape__legal">
            © {ANO_PUBLICACAO} {site.nome} — Todos os direitos reservados. CNPJ {contato.cnpj}. Resultados
            podem variar conforme uso individual.
          </p>
          <a className="rodape__topo" href="#inicio">
            <SetaTopo />
            Voltar ao topo
          </a>
        </div>
      </div>
    </footer>
  )
}
