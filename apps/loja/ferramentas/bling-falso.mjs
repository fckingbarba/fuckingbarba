import { createHmac } from "node:crypto"
import { createServer } from "node:http"

/**
 * UM BLING DE MENTIRA, pro `conferir-erp.mjs`.
 *
 * Fala o formato da API v3 que a loja usa (`apps/backend/src/modules/bling/`):
 * o OAuth (a tela de autorização, que devolve direto pro endereço de volta, e
 * o `/oauth/token`), os produtos com o saldo, os contatos, o pedido de venda
 * (que reserva o saldo, como o Bling), a NF-e gerada do pedido e a SEFAZ —
 * que autoriza, demora, rejeita ou fica pendente, conforme `painel.sefaz`.
 *
 * O QUE ELE COBRA DA LOJA, porque o Bling de verdade cobra:
 *   - client id e secret SÓ no cabeçalho do `/oauth/token`, e o `enable-jwt`;
 *   - o código de autorização é de uso único — reusar REVOGA o usuário
 *     (`painel.revogado`), como no Bling;
 *   - o token vence (`painel.validadeDoToken`) e o de renovação é trocado a
 *     cada renovação: o velho deixa de valer;
 *   - a parcela tem de bater com o total do pedido, e o item com um produto;
 *   - uma nota só por pedido de venda.
 *
 * `painel.avisar(url, evento, dados)` manda um aviso assinado (webhook), como
 * o Bling manda: `X-Bling-Signature-256: sha256=<HMAC do corpo com o secret>`.
 *
 * Porta: `PORTA_BLING_FALSO` (padrão 4340).
 */

export const PORTA_PADRAO = Number(process.env.PORTA_BLING_FALSO || 4340)

export async function subirBlingFalso({
  porta = PORTA_PADRAO,
  clientId = "cliente-de-teste",
  clientSecret = "segredo-de-teste",
  volta,
} = {}) {
  /* O id é único no Bling de verdade, e o banco local guarda os das rodadas
     anteriores: começar sempre do mesmo número faria o aviso de uma nota achar
     a nota de outra rodada. Do relógio, então. */
  let proximo = Number(String(Date.now()).slice(-9)) * 100
  const novoId = () => ++proximo
  const painel = {
    clientId,
    clientSecret,
    /** Pra onde a tela de autorização devolve (a URL do cadastro do app). */
    volta,
    /** Segundos de validade do token de acesso. */
    validadeDoToken: 21600,
    /** "autoriza" | "demora" (2 consultas até autorizar) | "rejeita" | "pendente" */
    sefaz: "autoriza",
    revogado: false,
    codigos: new Map(),
    codigosTrocados: 0,
    acessos: new Set(),
    renovacao: null,
    /** codigo (SKU) → { id, codigo, situacao, saldo } */
    produtos: new Map(),
    contatos: new Map(),
    pedidos: new Map(),
    notas: new Map(),
    /** cada chamada: `{ metodo, caminho, consulta, corpo, jwt }` */
    chamadas: [],
    formas: [
      { id: 11, descricao: "Boleto", tipoPagamento: 15, situacao: 1, padrao: 1, finalidade: 3 },
      { id: 12, descricao: "Pix", tipoPagamento: 17, situacao: 1, padrao: 0, finalidade: 2 },
      { id: 13, descricao: "Cartão", tipoPagamento: 3, situacao: 1, padrao: 0, finalidade: 3 },
    ],
  }

  painel.produto = (codigo, saldo, { situacao = "A" } = {}) => {
    const atual = painel.produtos.get(codigo)
    if (atual) Object.assign(atual, { saldo, situacao })
    else painel.produtos.set(codigo, { id: novoId(), codigo, situacao, saldo })
    return painel.produtos.get(codigo)
  }
  painel.notaDoPedidoDeVenda = (numeroLoja) => {
    const pedido = [...painel.pedidos.values()].find((p) => p.numeroLoja === numeroLoja)
    return pedido?.notaFiscal ? painel.notas.get(pedido.notaFiscal.id) : undefined
  }
  painel.pedidoDeVenda = (numeroLoja) =>
    [...painel.pedidos.values()].find((p) => p.numeroLoja === numeroLoja)
  painel.autorizar = (nota) => {
    Object.assign(nota, {
      situacao: 5,
      numero: String(nota.id).padStart(6, "0"),
      serie: 1,
      chaveAcesso: `4226091234567800019955001${String(nota.id).padStart(9, "0")}1${String(nota.id).padStart(8, "0")}`,
      dataEmissao: new Date(Date.now() - 3 * 3600 * 1000)
        .toISOString()
        .slice(0, 19)
        .replace("T", " "),
      linkDanfe: `https://www.bling.com.br/doc.view.php?id=falso${nota.id}`,
    })
  }
  painel.avisar = async (url, evento, dados, { segredo = painel.clientSecret } = {}) => {
    const corpo = JSON.stringify({
      eventId: `ev-${novoId()}`,
      date: new Date().toISOString(),
      version: "v1",
      event: evento,
      companyId: "empresa-falsa",
      data: dados,
    })
    const assinatura = `sha256=${createHmac("sha256", segredo).update(corpo, "utf8").digest("hex")}`
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-bling-signature-256": assinatura },
      body: corpo,
    })
    return r.status
  }

  const json = (res, status, dados) => {
    res.writeHead(status, { "content-type": "application/json" })
    res.end(dados === undefined ? "" : JSON.stringify(dados))
  }
  const erro = (res, status, mensagem, tipo = "VALIDATION_ERROR") =>
    json(res, status, { error: { type: tipo, message: mensagem, description: mensagem } })
  const tokens = () => {
    const acesso = `acesso-${novoId()}`
    const renovacao = `renovacao-${novoId()}`
    painel.acessos.add(acesso)
    painel.renovacao = renovacao
    return {
      access_token: acesso,
      refresh_token: renovacao,
      expires_in: painel.validadeDoToken,
      token_type: "Bearer",
    }
  }
  const saldoDo = (p) => ({
    id: p.id,
    codigo: p.codigo,
    situacao: p.situacao,
    formato: "S",
    estoque: { saldoVirtualTotal: p.saldo },
  })
  const lista = (consulta, chave) => consulta.getAll(`${chave}[]`)

  const servidor = createServer((req, res) => {
    let bruto = ""
    req.on("data", (p) => (bruto += p))
    req.on("end", () => {
      const url = new URL(req.url, `http://127.0.0.1:${porta}`)
      const caminho = url.pathname.replace(/^\/Api\/v3/, "")
      let corpo = null
      try {
        corpo = bruto && req.headers["content-type"]?.includes("json") ? JSON.parse(bruto) : bruto
      } catch {
        corpo = null
      }

      /* ── a tela de autorização: devolve direto, como se a pessoa aceitasse ── */
      if (caminho === "/oauth/authorize" && req.method === "GET") {
        if (url.searchParams.get("client_id") !== painel.clientId)
          return erro(res, 400, "client_id inválido")
        const codigo = `codigo-${novoId()}`
        painel.codigos.set(codigo, false)
        const destino = new URL(painel.volta)
        destino.searchParams.set("code", codigo)
        destino.searchParams.set("state", url.searchParams.get("state") ?? "")
        res.writeHead(302, { location: destino.toString() })
        res.end()
        return
      }

      /* ── o token ── */
      if (caminho === "/oauth/token" && req.method === "POST") {
        const esperado = `Basic ${Buffer.from(`${painel.clientId}:${painel.clientSecret}`).toString("base64")}`
        if (req.headers.authorization !== esperado)
          return erro(res, 401, "credenciais do app inválidas", "invalid_client")
        const form = new URLSearchParams(bruto)
        if (form.has("client_secret")) return erro(res, 400, "o client secret não vai no corpo")
        if (form.get("grant_type") === "authorization_code") {
          const codigo = form.get("code")
          if (!painel.codigos.has(codigo)) return erro(res, 400, "código inválido", "invalid_grant")
          if (painel.codigos.get(codigo)) {
            painel.revogado = true
            return erro(res, 400, "código já utilizado — usuário revogado", "invalid_grant")
          }
          painel.codigos.set(codigo, true)
          painel.codigosTrocados++
          return json(res, 200, tokens())
        }
        if (form.get("grant_type") === "refresh_token") {
          if (!painel.renovacao || form.get("refresh_token") !== painel.renovacao) {
            return erro(res, 400, "Invalid refresh token", "invalid_grant")
          }
          return json(res, 200, tokens())
        }
        return erro(res, 400, "grant_type desconhecido")
      }

      /* ── daqui pra baixo, só com token ── */
      const token = (req.headers.authorization ?? "").replace(/^Bearer /, "")
      if (painel.revogado || !painel.acessos.has(token))
        return erro(res, 401, "token inválido", "invalid_token")
      painel.chamadas.push({
        metodo: req.method,
        caminho,
        consulta: Object.fromEntries(url.searchParams),
        corpo,
        jwt: req.headers["enable-jwt"] === "1",
      })

      if (caminho === "/empresas/me/dados-basicos") {
        return json(res, 200, {
          data: { id: "empresa-falsa", nome: "FuckingBarba (Bling falso)", cnpj: "00000000000191" },
        })
      }

      if (caminho === "/produtos" && req.method === "GET") {
        const codigos = lista(url.searchParams, "codigos")
        const soAtivos = url.searchParams.get("criterio") === "2"
        const achados = [...painel.produtos.values()].filter(
          (p) => codigos.includes(p.codigo) && (!soAtivos || p.situacao === "A")
        )
        return json(res, 200, { data: achados.map(saldoDo) })
      }
      if (caminho === "/estoques/saldos" && req.method === "GET") {
        const ids = lista(url.searchParams, "idsProdutos").map(Number)
        const achados = [...painel.produtos.values()].filter((p) => ids.includes(p.id))
        return json(res, 200, {
          data: achados.map((p) => ({
            produto: { id: p.id, codigo: p.codigo },
            saldoFisicoTotal: p.saldo,
            saldoVirtualTotal: p.saldo,
          })),
        })
      }

      if (caminho === "/contatos" && req.method === "GET") {
        const doc = url.searchParams.get("numeroDocumento")
        return json(res, 200, {
          data: [...painel.contatos.values()].filter((c) => c.numeroDocumento === doc),
        })
      }
      const contato = caminho.match(/^\/contatos\/(\d+)$/)
      if (contato && req.method === "GET") {
        const c = painel.contatos.get(Number(contato[1]))
        return c
          ? json(res, 200, { data: c })
          : erro(res, 404, "contato não existe", "RESOURCE_NOT_FOUND")
      }
      if ((caminho === "/contatos" && req.method === "POST") || (contato && req.method === "PUT")) {
        if (!corpo?.nome || !corpo?.tipo || !corpo?.situacao)
          return erro(res, 400, "Informe o nome, o tipo e a situação")
        if (!corpo?.endereco?.geral?.municipio)
          return erro(res, 400, "O valor do campo cidade não foi encontrado no sistema.")
        const id = contato ? Number(contato[1]) : novoId()
        painel.contatos.set(id, { ...corpo, id })
        return contato ? json(res, 200, { data: { id } }) : json(res, 201, { data: { id } })
      }

      if (caminho === "/formas-pagamentos" && req.method === "GET")
        return json(res, 200, { data: painel.formas })
      if (caminho === "/situacoes/modulos" && req.method === "GET") {
        return json(res, 200, {
          data: [
            { id: 98300, nome: "Contas", descricao: "Contas a receber" },
            { id: 98310, nome: "Vendas", descricao: "Pedidos de venda" },
          ],
        })
      }
      if (caminho === "/situacoes/modulos/98310" && req.method === "GET") {
        return json(res, 200, {
          data: [
            { id: 6, nome: "Em aberto" },
            { id: 9, nome: "Atendido" },
            { id: 12, nome: "Cancelado" },
          ],
        })
      }

      if (caminho === "/pedidos/vendas" && req.method === "GET") {
        const numeros = lista(url.searchParams, "numerosLojas")
        return json(res, 200, {
          data: [...painel.pedidos.values()]
            .filter((p) => numeros.includes(p.numeroLoja))
            .map((p) => ({ id: p.id, numeroLoja: p.numeroLoja, situacao: { id: p.situacao } })),
        })
      }
      if (caminho === "/pedidos/vendas" && req.method === "POST") {
        if (!painel.contatos.has(corpo?.contato?.id)) return erro(res, 400, "Informe o contato")
        const itens = corpo?.itens ?? []
        for (const i of itens) {
          if (![...painel.produtos.values()].some((p) => p.id === i.produto?.id))
            return erro(res, 400, `Produto ${i.codigo} não encontrado`)
        }
        const soma =
          itens.reduce((s, i) => s + i.valor * i.quantidade, 0) -
          (corpo.desconto?.valor ?? 0) +
          (corpo.transporte?.frete ?? 0)
        const parcelas = (corpo.parcelas ?? []).reduce((s, p) => s + p.valor, 0)
        if (Math.abs(soma - parcelas) > 0.01)
          return erro(
            res,
            400,
            `O valor das parcelas (${parcelas}) difere do total da venda (${soma.toFixed(2)})`
          )
        const id = novoId()
        painel.pedidos.set(id, { ...corpo, id, situacao: 6, notaFiscal: null })
        // O pedido em aberto reserva: o saldo virtual cai.
        for (const i of itens) {
          const p = [...painel.produtos.values()].find((x) => x.id === i.produto.id)
          p.saldo -= i.quantidade
        }
        return json(res, 201, { data: { id, alertas: [] } })
      }
      const pedido = caminho.match(/^\/pedidos\/vendas\/(\d+)(\/.*)?$/)
      if (pedido) {
        const p = painel.pedidos.get(Number(pedido[1]))
        if (!p) return erro(res, 404, "pedido não existe", "RESOURCE_NOT_FOUND")
        const resto = pedido[2] ?? ""
        if (!resto && req.method === "GET")
          return json(res, 200, { data: { ...p, notaFiscal: p.notaFiscal } })
        if (resto === "/gerar-nfe" && req.method === "POST") {
          if (p.notaFiscal) return erro(res, 400, "Esta venda já possui nota fiscal")
          const id = novoId()
          painel.notas.set(id, {
            id,
            situacao: 1,
            numero: "",
            serie: 1,
            valorNota: p.parcelas.reduce((s, x) => s + x.valor, 0),
            pedido: p.id,
            consultas: 0,
            envios: 0,
          })
          p.notaFiscal = { id }
          return json(res, 201, { idNotaFiscal: id })
        }
        const situacao = resto.match(/^\/situacoes\/(\d+)$/)
        if (situacao && req.method === "PATCH") {
          const nova = Number(situacao[1])
          if (nova === 12 && p.situacao !== 12) {
            for (const i of p.itens) {
              const prod = [...painel.produtos.values()].find((x) => x.id === i.produto.id)
              prod.saldo += i.quantidade
            }
          }
          p.situacao = nova
          return json(res, 204)
        }
      }

      const nota = caminho.match(/^\/nfe\/(\d+)(\/enviar)?$/)
      if (nota) {
        const n = painel.notas.get(Number(nota[1]))
        if (!n) return erro(res, 404, "nota não existe", "RESOURCE_NOT_FOUND")
        if (nota[2] && req.method === "POST") {
          n.envios++
          n.enviarEmail = url.searchParams.get("enviarEmail")
          if (n.situacao !== 1) return erro(res, 400, "A nota não está pendente")
          if (painel.sefaz === "autoriza") painel.autorizar(n)
          else if (painel.sefaz === "demora") n.situacao = 3
          else if (painel.sefaz === "rejeita") n.situacao = 4
          return json(res, 200, { data: { xml: "<nfe/>" } })
        }
        if (req.method === "GET") {
          n.consultas++
          if (n.situacao === 3 && n.consultas >= 3) painel.autorizar(n)
          return json(res, 200, {
            data: { ...n, chaveAcesso: n.chaveAcesso ?? "", linkDanfe: n.linkDanfe ?? "" },
          })
        }
      }
      if (caminho === "/nfe" && req.method === "DELETE") {
        const ids = lista(url.searchParams, "idsNotas").map(Number)
        const excluidos = ids.filter((id) => [1, 4].includes(painel.notas.get(id)?.situacao))
        for (const id of excluidos) {
          painel.notas.delete(id)
          for (const p of painel.pedidos.values()) if (p.notaFiscal?.id === id) p.notaFiscal = null
        }
        return json(res, 200, { data: { idsExcluidos: excluidos, alertas: [] } })
      }

      return erro(
        res,
        404,
        `o Bling falso não conhece ${req.method} ${caminho}`,
        "RESOURCE_NOT_FOUND"
      )
    })
  })

  await new Promise((r) => servidor.listen(porta, "127.0.0.1", r))
  painel.fechar = () => servidor.close()
  painel.porta = porta
  painel.url = `http://127.0.0.1:${porta}/Api/v3`
  return painel
}
