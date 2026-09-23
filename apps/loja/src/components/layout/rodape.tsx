import Link from "next/link"
import { Fragment } from "react"
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
import { LogoDaBandeira } from "@/components/bandeira"
import { Newsletter } from "./newsletter"
import { Selos } from "./selos"
import { BANDEIRAS_ACEITAS } from "@/lib/cartao"
import { linkDoWhatsapp, whatsappNaTela } from "@/lib/configuracoes"
import { configuracoes } from "@/lib/medusa"
import { formasDePagamento, navegacao, parcelamento, redes, site } from "@/lib/site"

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

export async function Rodape() {
  /*
    WhatsApp, e-mail, horário e CNPJ vêm das configurações do Medusa. O que
    ainda não foi preenchido simplesmente NÃO APARECE — em vez de aparecer
    como "(00) 00000-0000", que é o que estava no ar até agora, em toda
    página, no lugar onde o Google lê o contato do negócio.
  */
  const { empresa, atendimento } = await configuracoes()
  const zap = linkDoWhatsapp(atendimento.whatsapp)
  const zapNaTela = whatsappNaTela(atendimento.whatsapp)

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
            {/* A logo inteira, uma vez por página, no lugar do raio + nome em
                texto. É o único lugar em que ela cabe com o tamanho que
                merece — no cabeçalho ela ficaria pequena demais pra ler
                BARBA. O nome fica no `aria-label`: pra quem lê a tela, a
                imagem já diz tudo. */}
            <Link className="rodape__marca" href="/" aria-label={`${site.nome} — página inicial`}>
              {/*
                ARQUIVO, e não SVG dentro do HTML. São 18 KB de caminho — a
                letra desenhada à mão — que iam DUAS vezes em toda página: no
                HTML e de novo no pacote do React. Rodapé nunca é o que a
                pessoa vê primeiro, então pesava justo no que a página baixa
                antes do principal aparecer (o LCP). Como arquivo, vai uma vez,
                fica em cache entre as páginas, e com `lazy` só é pedido quando
                o rodapé chega perto da tela. O desenho é o mesmo de
                `ferramentas/logo/saida/logo.svg`, copiado.
              */}
              {/* eslint-disable-next-line @next/next/no-img-element -- SVG estático: o otimizador não mexe em SVG */}
              <img
                src="/marca/logo-completa.svg"
                alt=""
                width={119}
                height={95}
                loading="lazy"
                decoding="async"
              />
            </Link>
            <p className="rodape__assinatura">{site.assinatura}</p>
            <h2 className="rodape__titulo">Siga-nos</h2>
            <ul className="rodape__redes">
              {redes.map((rede) => {
                const Icone = ICONES_REDE[rede.nome]
                return (
                  <li key={rede.nome}>
                    <a href={rede.url} aria-label={`${rede.nome} da ${site.nome}`} rel="noopener">
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
              {zap && zapNaTela ? (
                <li>
                  <a href={zap} rel="noopener">
                    <WhatsApp />
                    <span>{zapNaTela}</span> · WhatsApp
                  </a>
                </li>
              ) : null}
              {atendimento.email ? (
                <li>
                  <a href={`mailto:${atendimento.email}`}>
                    <Envelope />
                    <span>{atendimento.email}</span>
                  </a>
                </li>
              ) : null}
            </ul>
            {atendimento.horario?.length ? (
              <p className="rodape__horario">
                {atendimento.horario.map((linha, i) => (
                  <Fragment key={linha}>
                    {i > 0 ? <br /> : null}
                    {linha}
                  </Fragment>
                ))}
              </p>
            ) : null}
          </div>
        </div>

        <Selos />

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
          {/* As mesmas bandeiras que o campo do cartão reconhece no checkout
              (`lib/cartao.ts`): a que o rodapé anuncia e a que o checkout
              aceita saem da mesma lista. */}
          <ul className="rodape__bandeiras" aria-label="Bandeiras aceitas no cartão">
            {BANDEIRAS_ACEITAS.map((b) => (
              <li key={b}>
                <LogoDaBandeira bandeira={b} />
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="rodape__fim">
        <div className="rodape__fim-wrap">
          <p className="rodape__legal">
            © {ANO_PUBLICACAO} {site.nome} — Todos os direitos reservados
            {empresa.cnpj ? `. CNPJ ${empresa.cnpj}` : ""}. Resultados podem variar conforme uso
            individual.
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
