"use client"

import { useEffect, useState } from "react"
import { rastrear } from "@/lib/rastrear"

/**
 * O PIX A PAGAR — QR, copia-e-cola e quanto tempo ainda vale.
 *
 * A caixa é a `.feito__pix` do protótipo, agora com o QR de verdade no lugar
 * do xadrez de exemplo. A IMAGEM É DO PAGAR.ME (`qr_code_url`), carregada
 * direto de lá: gerar o QR aqui pediria uma biblioteca a mais no navegador
 * pra desenhar o mesmo código que o copia-e-cola já carrega. Se a imagem não
 * carregar, o copia-e-cola continua ali — ele é o que paga no celular, que é
 * onde a maioria paga.
 *
 * `referrerPolicy="no-referrer"` porque o endereço desta página tem o id do
 * pedido, e ele não precisa ir parar no log de ninguém.
 *
 * O TEMPO QUE FALTA é contado no navegador, em minutos, e só depois de
 * montar: a hora do servidor e a do celular de quem compra nunca batem, e um
 * relógio renderizado no servidor chegaria na tela já errado.
 */
export function Pix({
  copiaECola,
  imagem,
  expiraEm,
  total,
}: {
  copiaECola: string
  imagem: string
  expiraEm: string
  total: number
}) {
  const [copiado, setCopiado] = useState<"sim" | "falhou" | null>(null)
  const [minutos, setMinutos] = useState<number | null>(null)

  useEffect(() => {
    const fim = Date.parse(expiraEm)
    if (!Number.isFinite(fim)) return
    const contar = () => setMinutos(Math.max(0, Math.ceil((fim - Date.now()) / 60_000)))
    const primeira = setTimeout(contar, 0)
    const relogio = setInterval(contar, 20_000)
    return () => {
      clearTimeout(primeira)
      clearInterval(relogio)
    }
  }, [expiraEm])

  async function copiar() {
    try {
      await navigator.clipboard.writeText(copiaECola)
      setCopiado("sim")
      rastrear("pix_copiado", { value: total })
    } catch {
      // Sem permissão de área de transferência (alguns navegadores embutidos,
      // como o do Instagram): o código continua na tela, selecionável.
      setCopiado("falhou")
    }
    setTimeout(() => setCopiado(null), 2500)
  }

  const vencido = minutos === 0

  return (
    <div className="feito__pix" data-vencido={vencido ? "" : undefined}>
      {imagem ? (
        // eslint-disable-next-line @next/next/no-img-element -- imagem de fora, gerada pro pedido; o otimizador do Next não tem o que fazer com ela
        <img
          className="feito__qr"
          src={imagem}
          alt="QR code do Pix deste pedido"
          width={150}
          height={150}
          referrerPolicy="no-referrer"
        />
      ) : null}
      <p className="feito__pix-rotulo">Copia e cola</p>
      <code>{copiaECola}</code>
      <button type="button" className="btn feito__copiar" onClick={copiar} disabled={vencido}>
        {copiado === "sim" ? "Copiado!" : "Copiar código"}
      </button>
      <p className="feito__validade" aria-live="polite">
        {copiado === "falhou"
          ? "Não consegui copiar sozinho — seleciona o código acima e copia."
          : minutos === null
            ? ""
            : vencido
              ? "Este código venceu. O pedido vai ser cancelado e o estoque volta pra loja."
              : `Vale por mais ${minutos} ${minutos === 1 ? "minuto" : "minutos"}.`}
      </p>
    </div>
  )
}
