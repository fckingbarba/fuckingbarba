import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { extname, join, resolve } from "node:path"
import { emailDoCodigo } from "../src/lib/emails/codigo"
import { emailDoEnvio } from "../src/lib/emails/envio"
import { emailDoEstornoQueFalhou } from "../src/lib/emails/estorno-falhou"
import {
  emailDePagamentoDevolvido,
  emailDePedidoCancelado,
  type CancelamentoDoEmail,
} from "../src/lib/emails/pedido-cancelado"
import { emailDePedidoConfirmado, type PedidoDoEmail } from "../src/lib/emails/pedido-confirmado"
import type { Email } from "../src/lib/email"

/**
 * A PRÉVIA DOS E-MAILS — o HTML de verdade, com dados de exemplo, numa
 * página só: cada e-mail no computador, no celular e no modo escuro.
 *
 *   npx ts-node ferramentas/previa-emails.ts
 *   FOTOS=<pasta com fotos de produto> npx ts-node ferramentas/previa-emails.ts
 *
 * Sai em `ferramentas/saida/previa-emails.html` (fora do git). Não manda
 * nada pra ninguém: é a mesma função que o backend chama, com a saída
 * escrita em arquivo em vez de ir pro Resend.
 *
 * AS IMAGENS VÃO EMBUTIDAS na prévia (a logo e os ícones de
 * `apps/loja/public/email/`), porque o endereço de verdade só existe depois
 * do deploy da loja. No e-mail que sai, elas são links pra `LOJA_URL`.
 *
 * O MODO ESCURO da prévia é o do Apple Mail: a mesma regra do e-mail, com o
 * `prefers-color-scheme` trocado por "sempre". O app do Gmail escurece do
 * jeito dele, e isso só se vê num celular de verdade.
 */

const LOJA = "https://loja.exemplo"
process.env.LOJA_URL = LOJA

const raiz = resolve(__dirname, "..")
const publico = resolve(raiz, "../loja/public/email")
const saida = join(raiz, "ferramentas/saida")

const TIPOS: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
}

const comoDado = (arquivo: string) =>
  `data:${TIPOS[extname(arquivo).toLowerCase()] ?? "image/png"};base64,${readFileSync(arquivo).toString("base64")}`

/** As fotos de exemplo, se a pasta vier em FOTOS; sem ela, o quadrado cinza. */
function fotos(): (string | null)[] {
  const pasta = process.env.FOTOS
  if (!pasta || !existsSync(pasta)) return [null, null, null]
  const arquivos = readdirSync(pasta)
    .filter(
      (a) => TIPOS[extname(a).toLowerCase()] && !a.startsWith("mini-") && !a.startsWith("amostra")
    )
    .sort()
  return [0, 1, 2].map((i) => (arquivos[i] ? comoDado(join(pasta, arquivos[i])) : null))
}

function exemploDePedido(): PedidoDoEmail {
  const [f1, f2, f3] = fotos()
  return {
    id: "order_01K5EXEMPLO",
    numero: 1042,
    email: "rafael.souza@email.com",
    itens: [
      {
        nome: "Balm Modelador para Barba FuckingBarba 90g",
        variante: null,
        imagem: f1,
        quantidade: 2,
        precoUnitario: 53.9,
        total: 107.8,
      },
      {
        nome: "Fator de Crescimento para Barba 30ml",
        variante: null,
        imagem: f2,
        quantidade: 1,
        precoUnitario: 79.9,
        total: 79.9,
      },
      {
        nome: "Kit Completo FuckingBarba — Shampoo, Balm e Óleo",
        variante: null,
        imagem: f3,
        quantidade: 1,
        precoUnitario: 99.9,
        total: 99.9,
      },
    ],
    subtotal: 287.6,
    desconto: 15,
    frete: 0,
    total: 272.6,
    formaDeEntrega: "Entrega econômica",
    entrega: {
      nome: "Rafael Souza",
      linha1: "Rua das Palmeiras, 123",
      linha2: "Apto 42 — Centro",
      cidade: "Blumenau",
      uf: "SC",
      cep: "89036-370",
    },
    pagamento: { forma: "cartao", bandeira: "Visa", final: "4242", parcelas: 3 },
  }
}

/**
 * O cancelamento, nas quatro versões que a loja manda: o Pix estornado, o
 * cartão estornado, o Pix que venceu e o cancelado antes de qualquer cobrança.
 * É o mesmo pedido de cima — o que muda é só o que aconteceu com o dinheiro.
 */
function exemploDeCancelamento(
  motivo: CancelamentoDoEmail["motivo"],
  estorno: CancelamentoDoEmail["estorno"]
): CancelamentoDoEmail {
  const p = exemploDePedido()
  return {
    id: p.id,
    numero: p.numero,
    email: p.email,
    itens: p.itens,
    total: p.total,
    motivo,
    estorno,
  }
}

/** Troca os endereços de `LOJA_URL/email/...` pelas imagens embutidas. */
function comImagensEmbutidas(html: string): string {
  return html.replace(
    new RegExp(`${LOJA.replace(/\./g, "\\.")}/email/([a-z-]+\\.png)`, "g"),
    (_, arq) => comoDado(join(publico, arq))
  )
}

const escuro = (html: string) => html.replace("@media (prefers-color-scheme:dark)", "@media all")

const srcdoc = (html: string) => html.replace(/&/g, "&amp;").replace(/"/g, "&quot;")

/**
 * Um quadro com o e-mail. A altura de partida é um chute pra quem abre sem
 * JavaScript; com ele, o quadro encolhe e cresce até o tamanho do e-mail
 * (encolher primeiro é o que deixa o `scrollHeight` medir o conteúdo, e não
 * o próprio quadro).
 */
function quadro(rotulo: string, largura: number, altura: number, html: string): string {
  return `<figure class="quadro">
  <figcaption>${rotulo}</figcaption>
  <iframe style="width:${largura}px;height:${altura}px" srcdoc="${srcdoc(html)}"
    onload="this.style.height='10px';this.style.height=this.contentDocument.documentElement.scrollHeight+'px'"></iframe>
</figure>`
}

function secao(nome: string, email: Email, alturas: { pc: number; celular: number }): string {
  const html = comImagensEmbutidas(email.html)
  const previa = /<div style="display:none[^>]*>([^&<]*)/.exec(email.html)?.[1]?.trim() ?? ""
  return `<section>
  <h2>${nome}</h2>
  <div class="caixa-de-entrada">
    <b>FuckingBarba</b>
    <span><b>${email.assunto.replace(/</g, "&lt;")}</b> — ${previa}</span>
  </div>
  <div class="quadros">
    ${quadro("Computador (600 px)", 640, alturas.pc, html)}
    ${quadro("Celular (375 px)", 375, alturas.celular, html)}
    ${quadro("Celular, modo escuro", 375, alturas.celular, escuro(html))}
  </div>
  <details><summary>Versão só texto</summary><pre>${email.texto.replace(/</g, "&lt;")}</pre></details>
</section>`
}

function main() {
  const codigo = emailDoCodigo({ para: "rafael.souza@email.com", codigo: "482917", minutos: 10 })
  const pedido = emailDePedidoConfirmado({ pedido: exemploDePedido(), whatsapp: "5547999990000" })
  const doEnvio = (momento: "enviado" | "saiu" | "retirar" | "entregue") => {
    const p = exemploDePedido()
    return emailDoEnvio({
      momento,
      pedido: {
        id: p.id,
        numero: p.numero,
        email: p.email,
        itens: p.itens.map((i) => ({
          nome: i.nome,
          variante: i.variante,
          quantidade: i.quantidade,
        })),
        entrega: p.entrega,
      },
      envio: {
        codigo: "QS123456789BR",
        url: "https://rastreio.frenet.com.br/COR/QS123456789BR",
        transportadora: "Correios",
        servico: "PAC",
      },
      whatsapp: "5547999990000",
    })
  }
  process.env.MEDUSA_BACKEND_URL = "https://api.exemplo"
  const estorno = emailDoEstornoQueFalhou("matheus@exemplo.com", {
    pedidoId: "order_01K5EXEMPLO",
    numero: 1042,
    falta: 6258,
    forma: "pix",
    cobranca: "ch_x7Kq2mB4n9aP1eRt",
    motivo: "a cobrança voltou pra paga",
    sozinha: true,
    horas: 6,
    tentativas: 8,
  })
  const enviado = doEnvio("enviado")
  const saiu = doEnvio("saiu")
  const retirar = doEnvio("retirar")
  const entregue = doEnvio("entregue")

  const cancelado = (
    motivo: CancelamentoDoEmail["motivo"],
    estorno: CancelamentoDoEmail["estorno"]
  ) =>
    emailDePedidoCancelado({
      cancelamento: exemploDeCancelamento(motivo, estorno),
      whatsapp: "5547999990000",
    })
  const estornadoPix = cancelado("estornado", { valor: 272.6, forma: "pix" })
  const estornadoCartao = cancelado("estornado", { valor: 272.6, forma: "cartao" })
  const pixVencido = cancelado("pix-vencido", null)
  const semCobranca = cancelado("sem-cobranca", null)

  // O segundo e-mail do "cancelado antes do pagamento": o QR foi pago depois.
  const p = exemploDePedido()
  const pixDevolvido = emailDePagamentoDevolvido({
    devolucao: {
      id: p.id,
      numero: p.numero,
      email: p.email,
      itens: p.itens,
      total: p.total,
      devolvido: { valor: p.total, forma: "pix" },
    },
    whatsapp: "5547999990000",
  })

  const pagina = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Prévia dos e-mails</title>
<style>
  body { margin: 0; padding: 28px 20px 60px; background: #e7e9ec; color: #12181f;
    font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; }
  h1 { margin: 0 0 4px; font-size: 22px; }
  .nota { margin: 0 0 28px; color: #566072; max-width: 70ch; }
  section { margin: 0 0 48px; }
  h2 { margin: 0 0 12px; font-size: 17px; text-transform: uppercase; letter-spacing: .04em; }
  .caixa-de-entrada { display: flex; gap: 16px; max-width: 900px; padding: 12px 16px; margin: 0 0 18px;
    background: #fff; border: 1px solid #cfd5dc; font-size: 14px; white-space: nowrap; overflow: hidden; }
  .caixa-de-entrada span { overflow: hidden; text-overflow: ellipsis; color: #566072; }
  .caixa-de-entrada span b { color: #12181f; }
  .quadros { display: flex; flex-wrap: wrap; gap: 24px; align-items: flex-start; }
  .quadro { margin: 0; }
  figcaption { margin: 0 0 6px; font-size: 13px; font-weight: 700; color: #566072; }
  iframe { display: block; border: 1px solid #cfd5dc; background: #fff; }
  details { margin-top: 16px; }
  pre { background: #fff; border: 1px solid #cfd5dc; padding: 14px; white-space: pre-wrap; max-width: 640px; }
</style>
</head>
<body>
<h1>Prévia dos e-mails da FuckingBarba</h1>
<p class="nota">Dados de exemplo. O HTML é o mesmo que o backend manda; só as imagens estão embutidas
aqui, porque no e-mail de verdade elas vêm da loja. O modo escuro é o do Apple Mail — o app do Gmail
escurece do jeito dele.</p>
${secao("Código de acesso", codigo, { pc: 700, celular: 720 })}
${secao("Pedido confirmado", pedido, { pc: 1740, celular: 1860 })}
${secao("Pedido a caminho", enviado, { pc: 1300, celular: 1400 })}
${secao("Saiu pra entrega", saiu, { pc: 1300, celular: 1400 })}
${secao("Esperando retirada", retirar, { pc: 1300, celular: 1400 })}
${secao("Entregue", entregue, { pc: 1300, celular: 1400 })}
${secao("Cancelado, Pix estornado", estornadoPix, { pc: 1240, celular: 1340 })}
${secao("Cancelado, cartão estornado", estornadoCartao, { pc: 1240, celular: 1360 })}
${secao("Pix venceu", pixVencido, { pc: 1120, celular: 1220 })}
${secao("Cancelado antes do pagamento", semCobranca, { pc: 1120, celular: 1220 })}
${secao("Pix pago depois do cancelamento, devolvido", pixDevolvido, { pc: 1400, celular: 1560 })}
${secao("Estorno que não saiu (pra equipe)", estorno, { pc: 760, celular: 900 })}
</body>
</html>`

  mkdirSync(saida, { recursive: true })
  const arquivo = join(saida, "previa-emails.html")
  writeFileSync(arquivo, pagina)
  for (const [nome, e] of [
    ["codigo", codigo],
    ["pedido-confirmado", pedido],
    ["envio-enviado", enviado],
    ["envio-saiu", saiu],
    ["envio-retirar", retirar],
    ["envio-entregue", entregue],
    ["cancelado-estornado-pix", estornadoPix],
    ["cancelado-estornado-cartao", estornadoCartao],
    ["cancelado-pix-vencido", pixVencido],
    ["cancelado-sem-cobranca", semCobranca],
    ["pix-devolvido", pixDevolvido],
    ["estorno-falhou", estorno],
  ] as const) {
    writeFileSync(join(saida, `${nome}.html`), comImagensEmbutidas(e.html))
    writeFileSync(join(saida, `${nome}.escuro.html`), escuro(comImagensEmbutidas(e.html)))
    // As fotos de exemplo entram embutidas; no e-mail de verdade são links.
    const semFotos = e.html.replace(
      /data:[^"]+/g,
      "https://exemplo.supabase.co/storage/v1/object/public/p/foto.webp"
    )
    console.log(
      `${nome}: ${Buffer.byteLength(semFotos)} bytes de HTML (o Gmail corta acima de 102 KB)`
    )
  }
  console.log(`prévia: ${arquivo}`)
}

main()
