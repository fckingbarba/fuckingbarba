import type { Route } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import type { ReactNode } from "react"
import { LinkDoMenu } from "@/components/conta/pecas"
import { sair } from "@/lib/acoes/conta"
import { lerCliente } from "@/lib/conta"
import { listarPedidos } from "@/lib/pedidos-da-conta"

/**
 * O MENU DA CONTA — quem está logado, e as telas.
 *
 * À esquerda no computador; no celular vira uma fita de abas no topo
 * (`conta.css`). Os números do lado são quantos pedidos e quantos endereços
 * — saem das mesmas perguntas que a página da vez faz (`cache`), sem ida a
 * mais ao Medusa.
 *
 * É ELE QUEM DECIDE QUE A SESSÃO ACABOU: a leitura do cliente é a primeira
 * pergunta ao Medusa de qualquer tela da área. Token recusado vai pro
 * `/conta/sair`, que apaga o cookie e manda pro "entrar" com o recado.
 */
export async function MenuDaConta() {
  const [leitura, pedidos] = await Promise.all([lerCliente(), listarPedidos()])
  if (leitura.estado === "sem-sessao") redirect("/conta/entrar")
  if (leitura.estado === "expirou") redirect("/conta/sair?motivo=expirou")

  const cliente = leitura.estado === "ok" ? leitura.cliente : null
  const quantos = pedidos.estado === "ok" ? pedidos.pedidos.length : 0

  return (
    <Casca
      oi={cliente?.nome ? `Oi, ${cliente.nome}` : "Oi!"}
      email={cliente?.email ?? ""}
      quantos={quantos}
      enderecos={cliente?.enderecos.length ?? 0}
      marcar
    />
  )
}

/**
 * O menu antes de o Medusa responder: a mesma forma, sem o nome — e sem
 * marcar a tela da vez, que pede o endereço da página (`usePathname`), e
 * isso não existe na casca estática.
 */
export function MenuEsperando() {
  return <Casca oi="Oi!" email="" quantos={0} enderecos={0} marcar={false} />
}

function Casca({
  oi,
  email,
  quantos,
  enderecos,
  marcar,
}: {
  oi: string
  email: string
  quantos: number
  enderecos: number
  marcar: boolean
}) {
  return (
    <nav className="menu-conta" aria-label="Minha conta">
      <div className="menu-conta__quem">
        <p className="menu-conta__oi">{oi}</p>
        <p className="menu-conta__email" data-conta-email>
          {email}
        </p>
      </div>
      <div className="menu-conta__abas">
        <ul>
          <Item>
            <Destino href="/conta" marcar={marcar}>
              Visão geral
            </Destino>
          </Item>
          <Item>
            <Destino href="/conta/pedidos" prefixo="/conta/pedidos/" marcar={marcar}>
              Pedidos{" "}
              {quantos ? (
                <span className="menu-conta__num" data-conta-pedidos>
                  {quantos}
                </span>
              ) : null}
            </Destino>
          </Item>
          <Item>
            <Destino href="/conta/enderecos" marcar={marcar}>
              Endereços{" "}
              {enderecos ? (
                <span className="menu-conta__num" data-conta-enderecos>
                  {enderecos}
                </span>
              ) : null}
            </Destino>
          </Item>
          <Item>
            <Destino href="/conta/dados" marcar={marcar}>
              Meus dados
            </Destino>
          </Item>
          <Item>
            <form action={sair}>
              <button type="submit" className="menu-conta__sair">
                Sair
              </button>
            </form>
          </Item>
        </ul>
      </div>
    </nav>
  )
}

const Item = ({ children }: { children: ReactNode }) => <li>{children}</li>

function Destino({
  href,
  prefixo,
  marcar,
  children,
}: {
  href: Route
  prefixo?: string
  marcar: boolean
  children: ReactNode
}) {
  return marcar ? (
    <LinkDoMenu href={href} prefixo={prefixo}>
      {children}
    </LinkDoMenu>
  ) : (
    <Link href={href}>{children}</Link>
  )
}
