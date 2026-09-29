"use client"

import { useState } from "react"
import { useAvisar } from "@/components/avisos"
import { Icone } from "@/components/icones"
import { importarArquivoDaBase } from "@/lib/acoes/crm"

/**
 * MANDAR A BASE DA NUVEMSHOP — os três arquivos que a loja antiga exporta,
 * de uma vez ou um por vez. Cada um sai comprimido do navegador (o de vendas,
 * 1,8 MB, vira uns 300 KB) e entra por inteiro no Medusa, que reconhece qual
 * é pelo cabeçalho e guarda só o que o CRM usa. Mandar de novo atualiza.
 */

const MAXIMO = 8 * 1024 * 1024

/** O arquivo comprimido em gzip, em base64 — pelo `CompressionStream` do navegador. */
async function comprimido(arquivo: File): Promise<string> {
  const gz = await new Response(
    arquivo.stream().pipeThrough(new CompressionStream("gzip"))
  ).arrayBuffer()
  const bytes = new Uint8Array(gz)
  let binario = ""
  for (let i = 0; i < bytes.length; i += 0x8000)
    binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binario)
}

type Resultado = { nome: string; ok: boolean; texto: string }

export function EnviarBase({ vazia }: { vazia: boolean }) {
  const avisar = useAvisar()
  const [enviando, setEnviando] = useState("")
  const [resultados, setResultados] = useState<Resultado[]>([])

  async function enviar(lista: FileList | null) {
    const arquivos = Array.from(lista ?? [])
    if (!arquivos.length || enviando) return
    setResultados([])
    const saida: Resultado[] = []
    for (const arquivo of arquivos) {
      setEnviando(arquivo.name)
      if (arquivo.size > MAXIMO) {
        saida.push({ nome: arquivo.name, ok: false, texto: `“${arquivo.name}” passa de 8 MB.` })
        continue
      }
      try {
        const r = await importarArquivoDaBase({
          nome: arquivo.name,
          gzip: await comprimido(arquivo),
        })
        saida.push({ nome: arquivo.name, ...r })
      } catch {
        saida.push({
          nome: arquivo.name,
          ok: false,
          texto: `Não consegui mandar “${arquivo.name}”. Tenta de novo em instantes.`,
        })
      }
    }
    setEnviando("")
    setResultados(saida)
    const certos = saida.filter((r) => r.ok).length
    avisar({
      ok: certos === saida.length,
      texto:
        certos === saida.length
          ? certos === 1
            ? "Arquivo importado."
            : `${certos} arquivos importados.`
          : "Algum arquivo não entrou: veja embaixo.",
    })
  }

  return (
    <section className="bloco" aria-labelledby="base-enviar" data-enviar-base>
      <div className="bloco__cabeca">
        <div>
          <h2 className="bloco__titulo" id="base-enviar">
            {vazia ? "Mandar a base da Nuvemshop" : "Mandar de novo"}
          </h2>
          <p className="bloco__sub">
            Na Nuvemshop, exporte as listas de Clientes, de Vendas e de Carrinhos abandonados, e
            escolha aqui os três arquivos (de uma vez ou um por vez). Mandar de novo atualiza: nada
            duplica, e ninguém sai.
          </p>
        </div>
      </div>
      <label className="base-envio" data-enviando={enviando ? "" : undefined}>
        <input
          type="file"
          accept=".csv,text/csv"
          multiple
          disabled={Boolean(enviando)}
          data-arquivos-da-base
          onChange={(e) => {
            void enviar(e.target.files)
            e.target.value = ""
          }}
        />
        <span className="fila__ico">
          <Icone nome={enviando ? "relogio" : "cima"} />
        </span>
        <span className="base-envio__txt">
          <b>{enviando ? `Mandando “${enviando}”…` : "Escolher os arquivos"}</b>
          <small>clientes.csv, vendas.csv e carrinho_abandonado.csv</small>
        </span>
      </label>
      {resultados.length ? (
        <ul className="base-resultados" data-resultados-da-base>
          {resultados.map((r) => (
            <li key={r.nome} data-ok={r.ok ? "" : undefined}>
              <Icone nome={r.ok ? "check" : "alerta"} />
              <span>{r.texto}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="pequeno suave base-privacidade">
        Fica só o que o CRM usa: o e-mail, o primeiro nome, o “sim” pras ofertas, os pedidos e os
        carrinhos. Das vendas, também o nome, o celular, o CPF e o endereço de entrega de cada
        pedido, guardados cifrados: é o que preenche o checkout do “Refazer o pedido”. Os dados do
        cartão, e o CPF, o telefone e o endereço de clientes e de carrinhos, são jogados fora na
        chegada.
      </p>
    </section>
  )
}
