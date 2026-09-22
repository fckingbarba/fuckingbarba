import type { Metadata } from "next"
import Link from "next/link"
import type { ComponentType, SVGProps } from "react"
import { Envelope, Instagram, WhatsApp } from "@/components/icones"
import { Abertura, Dado, Lista, P, Pendente, Secao, Titulo } from "@/components/institucional/texto"
import { linkDoWhatsapp, whatsappNaTela } from "@/lib/configuracoes"
import { configuracoes } from "@/lib/medusa"
import { site } from "@/lib/site"

export const metadata: Metadata = {
  title: "Contato",
  description: `Como falar com a ${site.nome}: canais de atendimento, horário e dados da empresa.`,
  alternates: { canonical: "/contato" },
}

/**
 * CONTATO — com quem falar, e quem é a empresa.
 *
 * ┌─ OS CANAIS VÊM DO ADMIN, E O QUE FALTA APARECE ────────────────────────┐
 * │ WhatsApp, e-mail e horário saem das configurações do Medusa (admin →   │
 * │ Configurações), como no rodapé. A diferença é o que acontece quando    │
 * │ falta: o rodapé some com a linha, aqui fica a tarja de pendente. Numa  │
 * │ página que só existe pra dar o contato, sumir com ele deixaria a       │
 * │ página vazia sem ninguém reparar — e a tarja é o que o conferidor de   │
 * │ links relata como "falta isto pra abrir a loja". Preenchido no admin,  │
 * │ a tarja some sozinha; ninguém precisa voltar aqui.                     │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * O INSTAGRAM NÃO DEPENDE DO ADMIN: o endereço é da marca e mora em
 * `lib/site.ts`. Com os outros pendentes, é o canal que sobra — por isso ele
 * entra aqui como canal, e não só no "Siga-nos" do rodapé.
 *
 * OS DADOS DA EMPRESA NÃO SÃO ENFEITE. O Decreto 7.962/2013 (art. 2º) manda
 * a loja virtual mostrar, em local de destaque e fácil visualização, o nome
 * empresarial, o CNPJ e o endereço físico e eletrônico. Os termos já trazem
 * ("Quem vende", com a mesma frase); a página de contato é onde a pessoa
 * procura.
 *
 * O WHATSAPP VAI COM MÁSCARA NA TELA E SÓ DÍGITOS NO LINK: o admin guarda
 * "5547988887777", que é o que o `wa.me` aceita, e a tela mostra
 * "(47) 98888-7777" — ver `lib/configuracoes.ts`.
 */
export default async function Contato() {
  const { empresa, atendimento } = await configuracoes()
  const zap = linkDoWhatsapp(atendimento.whatsapp)
  const instagram = site.instagram.replace(/^https?:\/\/(www\.)?instagram\.com\//, "@")

  return (
    <>
      <Titulo>Fala com a gente</Titulo>

      <Abertura>
        Pedido, troca, dúvida antes de comprar ou qualquer outra coisa: é só chamar num destes
        canais.
      </Abertura>

      <ul className="mt-8 space-y-4">
        <Canal
          icone={WhatsApp}
          nome="WhatsApp"
          valor={whatsappNaTela(atendimento.whatsapp)}
          href={zap}
          falta="WhatsApp pendente"
          externo
        />
        <Canal
          icone={Envelope}
          nome="E-mail"
          valor={atendimento.email}
          href={atendimento.email ? `mailto:${atendimento.email}` : null}
          falta="e-mail pendente"
        />
        <Canal
          icone={Instagram}
          nome="Instagram"
          valor={instagram}
          detalhe="Mensagem direta"
          href={site.instagram}
          falta="Instagram pendente"
          externo
        />
      </ul>

      <p className="mt-6 leading-relaxed text-tinta">
        <b>Horário de atendimento:</b>{" "}
        {atendimento.horario?.length ? (
          atendimento.horario.join(" · ")
        ) : (
          <Pendente>horário pendente</Pendente>
        )}
      </p>

      <Secao titulo="Pra ir mais rápido">
        <Lista>
          <li>
            <b>É sobre um pedido?</b> Manda o número dele, o que começa com #. Ele aparece na tela
            logo depois da compra, nos e-mails do pedido e na{" "}
            <Link href="/conta/pedidos">Minha conta</Link>. Sem o número, o e-mail da compra também
            serve.
          </li>
          <li>
            <b>Onde está a encomenda?</b> O rastreio fica na{" "}
            <Link href="/conta/pedidos">Minha conta</Link> e no e-mail de envio.
          </li>
          <li>
            <b>Troca ou devolução?</b> O passo a passo está na{" "}
            <Link href="/trocas">política de entrega, troca e devolução</Link>.
          </li>
          <li>
            <b>Pagamento, frete ou prazo?</b> Pode ser que a resposta já esteja nas{" "}
            <Link href="/duvidas">dúvidas frequentes</Link>.
          </li>
        </Lista>
      </Secao>

      <Secao titulo="Quem vende">
        <P>
          <Dado valor={empresa.razaoSocial} falta="razão social pendente" />, CNPJ{" "}
          <Dado valor={empresa.cnpj} falta="CNPJ pendente" />,{" "}
          <Dado valor={empresa.endereco} falta="endereço pendente" />.
        </P>
      </Secao>
    </>
  )
}

/**
 * UM CANAL: o cartão inteiro é o link, quando existe.
 *
 * Sem o valor (dado pendente no admin), o cartão vira caixa tracejada, sem
 * sombra e sem link, com a tarja no lugar do número. Link pra `wa.me/` sem
 * número abriria o WhatsApp numa tela de erro — o pior lugar pra descobrir
 * que a loja não atende por ali.
 *
 * A sombra dura é `drop-shadow` no `<li>`, não `box-shadow` no cartão: o
 * chanfro é `clip-path`, que corta tudo o que passa da borda, sombra
 * inclusive. O filtro do pai é aplicado depois do recorte do filho, e por
 * isso segue o chanfro. É o mesmo truque do acordeão das dúvidas.
 */
function Canal({
  icone: Icone,
  nome,
  valor,
  detalhe,
  href,
  falta,
  externo = false,
}: {
  icone: ComponentType<SVGProps<SVGSVGElement>>
  nome: string
  valor: string | null
  detalhe?: string
  href: string | null
  falta: string
  externo?: boolean
}) {
  const corpo = (
    <>
      <Icone className="h-7 w-7 shrink-0" />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-xs font-extrabold uppercase tracking-[0.14em]">{nome}</span>
        {valor ? (
          <span className="text-lg font-bold [overflow-wrap:anywhere]">{valor}</span>
        ) : (
          <span>
            <Pendente>{falta}</Pendente>
          </span>
        )}
        {valor && detalhe ? <span className="text-sm text-tinta-suave">{detalhe}</span> : null}
      </span>
    </>
  )

  if (!href || !valor) {
    return (
      <li>
        <div className="chanfro-sm flex items-center gap-4 border-2 border-dashed border-tinta/40 bg-papel px-5 py-4 text-tinta">
          {corpo}
        </div>
      </li>
    )
  }

  return (
    <li className="[filter:drop-shadow(3px_3px_0_var(--color-tinta))]">
      <a
        className="canal chanfro-sm flex items-center gap-4 border-2 border-tinta bg-papel px-5 py-4"
        href={href}
        {...(externo ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      >
        {corpo}
      </a>
    </li>
  )
}
