"use client"

import Image from "next/image"
import Link from "next/link"
import { useMemo, useState, type MouseEvent } from "react"
import { useFrete } from "@/components/configuracoes/contexto"
import { Mais, Raio } from "@/components/icones"
import { useSacola } from "@/components/sacola/contexto"
import { adicionar } from "@/lib/acoes/carrinho"
import { escolherLevaJunto, type SugestaoDaSacola } from "@/lib/carrinho-visivel"
import { faltaPraPromocao } from "@/lib/configuracoes"
import { emReais } from "@/lib/formato"

/**
 * O "LEVA JUNTO" DA GAVETA — o cross-sell do protótipo da loja
 * (`ferramentas/porte/prototipo.html`): até três produtos que ainda não estão
 * na sacola, cada um com foto, preço e "+ Adicionar". Faltando valor pro
 * frete grátis, o que fecha a conta vem primeiro, com a etiqueta — a regra
 * mora em `escolherLevaJunto` (`lib/carrinho-visivel.ts`).
 *
 * A LISTA VEM PRONTA DO SERVIDOR (`vitrineDaSacola`, no layout raiz): a
 * gaveta só escolhe, na hora, com o que está na sacola. Abrir a sacola não
 * espera ninguém.
 *
 * "Adicionar" entra na MESMA fila das quantidades (`comCarrinho`): com um
 * produto entrando, os botões de quantidade e de frete esperam, e o total
 * que volta substitui o da tela inteiro. O produto que entrou sai da lista
 * sozinho — ele agora está na sacola.
 *
 * Sacola vazia não tem leva junto: ali quem fala é o "Ver produtos".
 */
export function LevaJunto({
  vitrine,
  aoNavegar,
}: {
  vitrine: readonly SugestaoDaSacola[]
  /** O mesmo da gaveta: link de dentro dela fecha a gaveta. */
  aoNavegar: (ev: MouseEvent<HTMLAnchorElement>) => void
}) {
  const sacola = useSacola()
  const politica = useFrete()
  const [adicionando, setAdicionando] = useState<string | null>(null)
  const [erro, setErro] = useState("")

  const carrinho = sacola?.carrinho
  const escolhidos = useMemo(() => {
    if (!carrinho) return []
    const naSacola = new Set(carrinho.itens.map((i) => i.varianteId))
    return escolherLevaJunto(vitrine, naSacola, faltaPraPromocao(politica, carrinho.subtotal))
  }, [vitrine, carrinho, politica])

  if (!sacola || !carrinho || !carrinho.itens.length || !escolhidos.length) return null
  const { comCarrinho, ocupada } = sacola

  async function levar(s: SugestaoDaSacola) {
    if (ocupada) return
    setErro("")
    setAdicionando(s.varianteId)
    const r = await comCarrinho(() => adicionar(s.varianteId, 1)).catch(() => null)
    setAdicionando(null)
    if (!r) setErro("Não consegui falar com a loja agora. Tenta de novo em instantes.")
    else if (!r.ok) setErro(r.erro)
  }

  return (
    <section className="sacolinha__leve" aria-labelledby="sugestoes-titulo">
      <h3 className="sacolinha__leve-titulo" id="sugestoes-titulo">
        <Raio />
        Leva junto
      </h3>
      <ul className="sacolinha__leve-lista">
        {escolhidos.map((s) => (
          <li className="sacolinha__leve-item" key={s.varianteId}>
            {s.libera ? (
              <span className="sacolinha__leve-selo">
                <Raio />
                Libera o frete grátis
              </span>
            ) : null}
            {/* A foto leva pro produto, como o nome na lista de cima; fora do
                Tab e do leitor de tela, porque o botão já diz quem é. */}
            <Link
              className="sacolinha__leve-foto"
              href={`/produtos/${s.handle}`}
              onClick={aoNavegar}
              tabIndex={-1}
              aria-hidden="true"
            >
              {s.imagem ? (
                <Image src={s.imagem} alt="" width={148} height={148} sizes="148px" />
              ) : null}
            </Link>
            <div className="sacolinha__leve-corpo">
              <p className="sacolinha__leve-nome">{s.nome}</p>
              <p className="sacolinha__leve-preco">{emReais(s.preco)}</p>
              <button
                type="button"
                className="sacolinha__leve-add"
                onClick={() => levar(s)}
                disabled={ocupada}
                aria-busy={adicionando === s.varianteId || undefined}
                aria-label={`Adicionar ${s.nome} à sacola${s.libera ? ", libera o frete grátis" : ""}`}
                data-leva-junto={s.varianteId}
              >
                <Mais />
                {adicionando === s.varianteId ? "Adicionando…" : "Adicionar"}
              </button>
            </div>
          </li>
        ))}
      </ul>
      <p className="sacolinha__leve-recado" role="status">
        {erro}
      </p>
    </section>
  )
}
