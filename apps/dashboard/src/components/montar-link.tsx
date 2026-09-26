"use client"

import { useId, useState } from "react"
import { useAvisar } from "@/components/avisos"
import { Icone } from "@/components/icones"
import type { Pagina } from "@/lib/marketing"

/**
 * O MONTADOR DE LINK DE CAMPANHA — o link com a marca da campanha (UTM) pra
 * colar no post, no e-mail, na bio, ou mandar pro influenciador: a venda
 * que vier dele aparece em Campanhas, com o nome escolhido, e no canal
 * certo (`canalDe`, no backend, conhece a origem e o meio de cada opção).
 * Tudo aqui, no navegador; o endereço é o da loja (`LOJA_URL`, no backend).
 */

const ONDE = [
  { valor: "instagram|social", nome: "Instagram (post, story, bio)" },
  { valor: "email|email", nome: "E-mail ou newsletter" },
  { valor: "whatsapp|social", nome: "WhatsApp" },
  { valor: "influenciador|social", nome: "Influenciador" },
  { valor: "google|cpc", nome: "Anúncio no Google" },
  { valor: "instagram|paid", nome: "Anúncio no Instagram ou Facebook" },
] as const

/** "Stories de Outubro!" → "stories-de-outubro": como o nome vai no link e aparece em Campanhas. */
export function nomeDaCampanha(nome: string): string {
  return nome
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
}

export function MontarLink({ loja, paginas }: { loja: string | null; paginas: Pagina[] }) {
  const avisar = useAvisar()
  const id = useId()
  const [onde, setOnde] = useState<string>(ONDE[0].valor)
  const [nome, setNome] = useState("")
  const [pagina, setPagina] = useState(paginas[0]?.caminho ?? "/")
  const campanha = nomeDaCampanha(nome)
  const [fonte, meio] = onde.split("|")
  const link =
    loja && campanha
      ? `${loja}${pagina}?utm_source=${fonte}&utm_medium=${meio}&utm_campaign=${campanha}`
      : null

  async function copiar() {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      avisar({ ok: true, texto: "Link copiado — é só colar." })
    } catch {
      avisar({ ok: false, texto: "Não consegui copiar. Selecione o link e copie à mão." })
    }
  }

  return (
    <section className="bloco" data-montar-link>
      <div className="bloco__cabeca">
        <div>
          <h2 className="bloco__titulo">Montar link de campanha</h2>
          <p className="bloco__sub">
            Cole esse link no post, no e-mail ou na bio: a venda que vier dele aparece em Campanhas.
          </p>
        </div>
      </div>
      {loja ? (
        <>
          <div className="campos">
            <div className="campo campo--2">
              <label htmlFor={`${id}-onde`}>Onde o link vai</label>
              <select id={`${id}-onde`} value={onde} onChange={(e) => setOnde(e.target.value)}>
                {ONDE.map((o) => (
                  <option key={o.valor} value={o.valor}>
                    {o.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className="campo campo--2">
              <label htmlFor={`${id}-nome`}>Nome da campanha</label>
              <input
                id={`${id}-nome`}
                value={nome}
                autoComplete="off"
                placeholder="stories-outubro"
                onChange={(e) => setNome(e.target.value)}
              />
            </div>
            <div className="campo campo--2">
              <label htmlFor={`${id}-pagina`}>Pra qual página</label>
              <select
                id={`${id}-pagina`}
                value={pagina}
                onChange={(e) => setPagina(e.target.value)}
              >
                {paginas.map((p) => (
                  <option key={p.caminho} value={p.caminho}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="link-pronto">
            <code data-link={link ?? ""}>
              {link ?? "Escreva o nome da campanha pra montar o link."}
            </code>
            <button type="button" className="btn btn--menor" onClick={copiar} disabled={!link}>
              <Icone nome="check" />
              Copiar
            </button>
          </div>
        </>
      ) : (
        <p className="sem-dados">
          O endereço da loja não está configurado no servidor (LOJA_URL): sem ele, não dá pra montar
          o link.
        </p>
      )}
    </section>
  )
}
