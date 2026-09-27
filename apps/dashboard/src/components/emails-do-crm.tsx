"use client"

import { useState } from "react"
import { useAvisar } from "@/components/avisos"
import { mandarTesteDoCrm } from "@/lib/acoes/crm"
import type { TelaDosEmails } from "@/lib/crm"

/**
 * UM EXEMPLO DO MODELO — a prévia (o HTML do e-mail, do jeito que sai) e o
 * "Mandar pra mim". A prévia mora num `iframe`: o estilo do e-mail não vaza
 * pro painel, e o do painel não entra nele. Os links abrem em outra aba.
 *
 * `sandbox` SEM `allow-scripts`: nada roda lá dentro. O `allow-same-origin`
 * é pra ela aparecer — sem ele o Chrome desenha o quadro em outro processo,
 * e às vezes o quadro fica em branco (visto no navegador embutido do app).
 * Sem script, a mesma origem não abre porta nenhuma.
 */
export function ExemploDoCrm({ exemplo }: { exemplo: TelaDosEmails["exemplos"][number] }) {
  const avisar = useAvisar()
  const [mandando, setMandando] = useState(false)

  async function mandar() {
    setMandando(true)
    try {
      avisar(await mandarTesteDoCrm(exemplo.id, exemplo.nome))
    } catch {
      avisar({ ok: false, texto: "A conexão caiu. Confere a internet e tenta de novo." })
    } finally {
      setMandando(false)
    }
  }

  return (
    <section
      className="bloco modelo-email"
      aria-labelledby={`email-${exemplo.id}`}
      data-exemplo={exemplo.id}
    >
      <div className="modelo-email__cabeca">
        <h2 className="bloco__titulo" id={`email-${exemplo.id}`}>
          {exemplo.nome}
        </h2>
        <p className="modelo-email__assunto" data-assunto>
          {exemplo.assunto}
        </p>
        <p className="modelo-email__previa">{exemplo.previa}</p>
      </div>
      <iframe
        className="modelo-email__quadro"
        title={`Prévia: ${exemplo.nome}`}
        srcDoc={exemplo.html.replace(/<head>/i, '<head><base target="_blank">')}
        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        data-previa
      />
      <button
        type="button"
        className="btn btn--contorno btn--menor"
        disabled={mandando}
        aria-busy={mandando}
        onClick={() => void mandar()}
        data-mandar-pra-mim
      >
        {mandando ? "Mandando…" : "Mandar pra mim"}
      </button>
    </section>
  )
}
