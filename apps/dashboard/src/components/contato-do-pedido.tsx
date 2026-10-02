"use client"

import { useState } from "react"
import { useAvisar } from "@/components/avisos"
import { Icone } from "@/components/icones"
import { anotarContato } from "@/lib/acoes/pedidos"

/**
 * FALAR COM O CLIENTE DO PEDIDO (0247) — o código do Pix pra copiar e o
 * WhatsApp com a mensagem pronta. O clique fica no histórico do pedido (quem
 * e quando), pra ninguém chamar a mesma pessoa duas vezes.
 */

/**
 * Copia o copia e cola do Pix. Se o navegador não deixar copiar, o código
 * aparece numa caixa pra selecionar à mão.
 */
export function CopiarPix({ id, codigo }: { id: string; codigo: string }) {
  const avisar = useAvisar()
  const [amostra, setAmostra] = useState(false)

  async function copiar() {
    try {
      await navigator.clipboard.writeText(codigo)
      avisar({
        ok: true,
        texto:
          "Código do Pix copiado. Mande sozinho numa mensagem: o cliente copia e cola no banco.",
      })
      void anotarContato(id, "pix")
    } catch {
      setAmostra(true)
      avisar({ ok: false, texto: "Não consegui copiar. Selecione o código embaixo e copie à mão." })
    }
  }

  return (
    <>
      <button type="button" className="btn btn--menor btn--bloco" data-copiar-pix onClick={copiar}>
        <Icone nome="pix" />
        Copiar o código do Pix
      </button>
      {amostra ? (
        <div className="link-pronto link-pronto--pix" data-codigo-pix>
          <code>{codigo}</code>
        </div>
      ) : null}
    </>
  )
}

/** Abre o WhatsApp numa aba nova, com a mensagem pronta — quem manda muda o que quiser antes. */
export function WhatsappDoPedido({
  id,
  link,
  estilo = "",
}: {
  id: string
  link: string
  estilo?: string
}) {
  return (
    <a
      className={`btn btn--menor btn--whatsapp ${estilo}`.trim()}
      href={link}
      target="_blank"
      rel="noopener noreferrer"
      data-whatsapp-pedido={id}
      onClick={() => void anotarContato(id, "whatsapp")}
    >
      <Icone nome="whatsapp" />
      Chamar no WhatsApp
    </a>
  )
}
