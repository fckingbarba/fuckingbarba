import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import type { MedusaContainer } from "@medusajs/framework/types"
import { mergeMetadata, Modules } from "@medusajs/framework/utils"
// A trava que o Medusa usa sem Redis (a do `medusa develop` local): a mesma
// regra da de produção — um por vez na mesma chave, fila pra quem chega.
import { InMemoryLockingProvider } from "@medusajs/locking/dist/providers/in-memory"
import {
  comValorNoCaminho,
  gravarNoMetadataDoPedido,
  lerNoCaminho,
  travaDoMetadata,
} from "../metadata-do-pedido"
import { CHAVE_DA_OFERTA, lerOferta } from "../recomendacao"

/**
 * O REGISTRO QUE SUMIA — o #467, no banco local, em 23/09.
 *
 * A confirmação gravou `emails.confirmado`, a oferta do checkout gravou
 * `fb_bump` uns 10 ms depois, e a confirmação sumiu: a varredura seguinte
 * mandou o e-mail de novo. Os testes daqui guardam a regra que fecha isso —
 * todo dono do metadata do pedido grava pela mesma porta, um por vez, só a
 * chave dele — e que ninguém volte a gravar pelo lado.
 */

const volta = () => new Promise<void>((r) => setImmediate(r))

type Gravacao = { id: string; metadata: Record<string, unknown> }

/**
 * O módulo de pedidos, do jeito que o Medusa grava o metadata
 * (`medusa-internal-service.js`, `update`): lê o pedido, mistura na memória
 * com o MESMO `mergeMetadata` dele e grava a coluna inteira — com uma volta
 * no laço de eventos entre ler e gravar, que é o caminho até o banco. É
 * nessa volta que o registro de um se perdia debaixo do registro do outro.
 */
function moduloDePedidos(inicial: Record<string, Record<string, unknown>> = { order_1: {} }) {
  const gravado = new Map(Object.entries(structuredClone(inicial)))
  const gravacoes: Gravacao[] = []
  let falharNaProxima = false
  return {
    gravacoes,
    metadata: (id = "order_1") => gravado.get(id),
    falharNaProximaGravacao: () => void (falharNaProxima = true),
    async retrieveOrder(id: string) {
      await volta()
      const metadata = gravado.get(id)
      if (!metadata) throw new Error(`Order id not found: ${id}`)
      return { id, metadata: structuredClone(metadata) }
    },
    async updateOrders(dados: Gravacao[]) {
      for (const { id, metadata } of dados) {
        const lido = structuredClone(gravado.get(id) ?? {})
        await volta()
        if (falharNaProxima) {
          falharNaProxima = false
          throw new Error("o banco caiu")
        }
        gravacoes.push({ id, metadata })
        gravado.set(id, mergeMetadata(lido, metadata))
      }
    },
  }
}

function containerCom(pedidos: ReturnType<typeof moduloDePedidos>) {
  const trava = new InMemoryLockingProvider()
  const container = {
    resolve: (nome: string) => {
      if (nome === Modules.ORDER) return pedidos
      if (nome === Modules.LOCKING) return trava
      throw new Error(`o teste não montou o ${nome}`)
    },
  } as unknown as MedusaContainer
  return { container, trava }
}

const CONFIRMADO = { em: "2026-09-23T19:42:10.000Z", como: "email", id: "re_1" }
const CANCELADO = { em: "2026-09-23T19:42:10.000Z", como: "email", porque: "estornado" }
const OFERTA = { produto: "oleo", aceito: true, em: "2026-09-23T19:42:10.010Z" }
const PARCEIRO = { parceiro: "frenet", referencia: "FB-467", entrou: true, id: "7", tentativas: 1 }

/** A pergunta do `registrar-oferta.ts`: grava só se ainda não houver oferta. */
const seNaoTiverOferta = (oferta: typeof OFERTA) => (atual: unknown) =>
  lerOferta({ [CHAVE_DA_OFERTA]: atual }) ? undefined : oferta

describe("o metadata do pedido, com vários donos", () => {
  it("gravando direto no Medusa, um registro apaga o outro (o #467)", async () => {
    // A prova de que o módulo falso tem a mesma corrida do Medusa: sem a
    // porta, os dois leem o mesmo "antes" e o último apaga o primeiro.
    const pedidos = moduloDePedidos({ order_1: { cliente_ga: "123" } })
    await Promise.all([
      pedidos.updateOrders([{ id: "order_1", metadata: { emails: { confirmado: CONFIRMADO } } }]),
      pedidos.updateOrders([{ id: "order_1", metadata: { [CHAVE_DA_OFERTA]: OFERTA } }]),
    ])
    expect(pedidos.metadata()).toEqual({ cliente_ga: "123", [CHAVE_DA_OFERTA]: OFERTA })
  })

  it("pela porta, a confirmação e a oferta gravadas juntas ficam as duas", async () => {
    const pedidos = moduloDePedidos({ order_1: { cliente_ga: "123" } })
    const { container } = containerCom(pedidos)
    await Promise.all([
      gravarNoMetadataDoPedido(container, "order_1", ["emails", "confirmado"], CONFIRMADO),
      gravarNoMetadataDoPedido(container, "order_1", CHAVE_DA_OFERTA, seNaoTiverOferta(OFERTA)),
    ])
    expect(pedidos.metadata()).toEqual({
      cliente_ga: "123",
      emails: { confirmado: CONFIRMADO },
      [CHAVE_DA_OFERTA]: OFERTA,
    })
  })

  it("confirmação e cancelamento moram no mesmo `emails`, e um não apaga o outro", async () => {
    const pedidos = moduloDePedidos()
    const { container } = containerCom(pedidos)
    await Promise.all([
      gravarNoMetadataDoPedido(container, "order_1", ["emails", "confirmado"], CONFIRMADO),
      gravarNoMetadataDoPedido(container, "order_1", ["emails", "cancelado"], CANCELADO),
    ])
    expect(pedidos.metadata()).toEqual({
      emails: { confirmado: CONFIRMADO, cancelado: CANCELADO },
    })
  })

  it("todos os donos de uma vez: nenhum registro se perde", async () => {
    const pedidos = moduloDePedidos({ order_1: { cliente_ga: "123" } })
    const { container } = containerCom(pedidos)
    const estornos = { pay_1: { situacao: "devolvido", esperado: 6258, cobranca: "ch_1" } }
    await Promise.all([
      gravarNoMetadataDoPedido(container, "order_1", ["emails", "confirmado"], CONFIRMADO),
      gravarNoMetadataDoPedido(container, "order_1", CHAVE_DA_OFERTA, seNaoTiverOferta(OFERTA)),
      gravarNoMetadataDoPedido(container, "order_1", "fb_parceiro", PARCEIRO),
      gravarNoMetadataDoPedido(container, "order_1", "estornos", estornos),
      gravarNoMetadataDoPedido(container, "order_1", ["emails", "cancelado"], CANCELADO),
    ])
    expect(pedidos.metadata()).toEqual({
      cliente_ga: "123",
      emails: { confirmado: CONFIRMADO, cancelado: CANCELADO },
      [CHAVE_DA_OFERTA]: OFERTA,
      fb_parceiro: PARCEIRO,
      estornos,
    })
  })

  it("só a chave de quem grava vai pro Medusa — nunca o metadata inteiro", async () => {
    const pedidos = moduloDePedidos({
      order_1: { cliente_ga: "123", emails: { cancelado: CANCELADO }, fb_parceiro: PARCEIRO },
    })
    const { container } = containerCom(pedidos)
    await gravarNoMetadataDoPedido(container, "order_1", ["emails", "confirmado"], CONFIRMADO)
    expect(pedidos.gravacoes).toEqual([
      { id: "order_1", metadata: { emails: { cancelado: CANCELADO, confirmado: CONFIRMADO } } },
    ])
  })

  it("o registro de um dono troca o dele, e só o dele", async () => {
    const pedidos = moduloDePedidos({ order_1: { fb_parceiro: PARCEIRO, cliente_ga: "123" } })
    const { container } = containerCom(pedidos)
    const tirado = { ...PARCEIRO, tirado_em: "2026-09-24T10:00:00.000Z" }
    expect(await gravarNoMetadataDoPedido(container, "order_1", "fb_parceiro", tirado)).toBe(true)
    expect(pedidos.metadata()).toEqual({ fb_parceiro: tirado, cliente_ga: "123" })
  })

  it("a função recebe o que está lá AGORA, e `undefined` não grava nada", async () => {
    const pedidos = moduloDePedidos({ order_1: { [CHAVE_DA_OFERTA]: OFERTA } })
    const { container } = containerCom(pedidos)
    const vistos: unknown[] = []
    const gravou = await gravarNoMetadataDoPedido(
      container,
      "order_1",
      CHAVE_DA_OFERTA,
      (atual) => {
        vistos.push(atual)
        return undefined
      }
    )
    expect(gravou).toBe(false)
    expect(vistos).toEqual([OFERTA])
    expect(pedidos.gravacoes).toEqual([])
  })

  it("a oferta entra uma vez: dois avisos juntos, o primeiro fica", async () => {
    const pedidos = moduloDePedidos()
    const { container } = containerCom(pedidos)
    const recusou = { ...OFERTA, aceito: false, em: "2026-09-23T19:42:10.020Z" }
    const gravaram = await Promise.all([
      gravarNoMetadataDoPedido(container, "order_1", CHAVE_DA_OFERTA, seNaoTiverOferta(OFERTA)),
      gravarNoMetadataDoPedido(container, "order_1", CHAVE_DA_OFERTA, seNaoTiverOferta(recusou)),
    ])
    expect(gravaram).toEqual([true, false])
    expect(pedidos.metadata()).toEqual({ [CHAVE_DA_OFERTA]: OFERTA })
  })

  it("o que não parece oferta não conta como oferta", async () => {
    const pedidos = moduloDePedidos({ order_1: { [CHAVE_DA_OFERTA]: null } })
    const { container } = containerCom(pedidos)
    expect(
      await gravarNoMetadataDoPedido(
        container,
        "order_1",
        CHAVE_DA_OFERTA,
        seNaoTiverOferta(OFERTA)
      )
    ).toBe(true)
    expect(pedidos.metadata()).toEqual({ [CHAVE_DA_OFERTA]: OFERTA })
  })

  it("`null` grava `null` (o desfazer da oferta)", async () => {
    const pedidos = moduloDePedidos({ order_1: { [CHAVE_DA_OFERTA]: OFERTA, cliente_ga: "123" } })
    const { container } = containerCom(pedidos)
    await gravarNoMetadataDoPedido(container, "order_1", CHAVE_DA_OFERTA, null)
    expect(pedidos.metadata()).toEqual({ [CHAVE_DA_OFERTA]: null, cliente_ga: "123" })
  })

  it("a trava é por pedido: um pedido esperando não segura o outro", async () => {
    const pedidos = moduloDePedidos({ order_1: {}, order_2: {} })
    const { container, trava } = containerCom(pedidos)
    let soltar = () => {}
    const segurando = trava.execute(
      travaDoMetadata("order_2"),
      () => new Promise<void>((r) => (soltar = r))
    )
    await volta()

    await gravarNoMetadataDoPedido(container, "order_1", "a", 1)
    expect(pedidos.metadata("order_1")).toEqual({ a: 1 })

    const noOutro = gravarNoMetadataDoPedido(container, "order_2", "b", 2)
    for (let i = 0; i < 5; i++) await volta()
    expect(pedidos.metadata("order_2")).toEqual({})
    soltar()
    await segurando
    await noOutro
    expect(pedidos.metadata("order_2")).toEqual({ b: 2 })
  })

  it("a trava de cada dono fica por fora, e as duas não se esperam", async () => {
    const pedidos = moduloDePedidos()
    const { container, trava } = containerCom(pedidos)
    await trava.execute("pedido-confirmado:order_1", () =>
      gravarNoMetadataDoPedido(container, "order_1", ["emails", "confirmado"], CONFIRMADO)
    )
    expect(pedidos.metadata()).toEqual({ emails: { confirmado: CONFIRMADO } })
  })

  it("a gravação que falha solta a trava, e a próxima grava", async () => {
    const pedidos = moduloDePedidos()
    const { container } = containerCom(pedidos)
    pedidos.falharNaProximaGravacao()
    await expect(
      gravarNoMetadataDoPedido(container, "order_1", ["emails", "confirmado"], CONFIRMADO)
    ).rejects.toThrow("o banco caiu")
    await gravarNoMetadataDoPedido(container, "order_1", ["emails", "confirmado"], CONFIRMADO)
    expect(pedidos.metadata()).toEqual({ emails: { confirmado: CONFIRMADO } })
  })

  it("pedido que não existe é erro, e não um metadata novo", async () => {
    const pedidos = moduloDePedidos()
    const { container } = containerCom(pedidos)
    await expect(gravarNoMetadataDoPedido(container, "order_x", "a", 1)).rejects.toThrow(
      "not found"
    )
    await expect(gravarNoMetadataDoPedido(container, "order_1", [], 1)).rejects.toThrow(
      "chave vazia"
    )
  })
})

describe("o caminho até a chave", () => {
  it("lê o que está no caminho, ou `undefined`", () => {
    const m = { emails: { confirmado: CONFIRMADO }, lixo: "texto" }
    expect(lerNoCaminho(m, ["emails", "confirmado"])).toEqual(CONFIRMADO)
    expect(lerNoCaminho(m, ["emails", "cancelado"])).toBeUndefined()
    expect(lerNoCaminho(m, ["lixo", "confirmado"])).toBeUndefined()
    expect(lerNoCaminho(null, ["emails"])).toBeUndefined()
    expect(lerNoCaminho(m, [])).toBe(m)
  })

  it("põe o valor no caminho sem mexer nos vizinhos", () => {
    expect(comValorNoCaminho({ cancelado: CANCELADO }, ["confirmado"], CONFIRMADO)).toEqual({
      cancelado: CANCELADO,
      confirmado: CONFIRMADO,
    })
    expect(comValorNoCaminho(undefined, ["a", "b"], 1)).toEqual({ a: { b: 1 } })
    expect(comValorNoCaminho("lixo", ["confirmado"], 1)).toEqual({ confirmado: 1 })
    expect(comValorNoCaminho([1, 2], ["confirmado"], 1)).toEqual({ confirmado: 1 })
    expect(comValorNoCaminho({ a: 1 }, [], 2)).toBe(2)
  })

  it("não muda o objeto que recebeu", () => {
    const antes = { cancelado: CANCELADO }
    comValorNoCaminho(antes, ["confirmado"], CONFIRMADO)
    expect(antes).toEqual({ cancelado: CANCELADO })
  })
})

describe("ninguém grava no pedido pelo lado", () => {
  /*
    A porta só protege quem passa por ela. Um `updateOrders` novo, em
    qualquer lugar do backend, volta a abrir a corrida — então mora num
    lugar só. Se um dia precisar gravar no pedido algo que NÃO é metadata,
    ele entra na lista abaixo, com o porquê.
  */
  const SRC = join(__dirname, "..", "..")
  const PORTA = join("lib", "metadata-do-pedido.ts")
  const PERMITIDOS = new Set([PORTA])

  function arquivos(pasta: string): string[] {
    return readdirSync(pasta).flatMap((nome) => {
      const caminho = join(pasta, nome)
      if (statSync(caminho).isDirectory()) return nome === "__tests__" ? [] : arquivos(caminho)
      return /\.tsx?$/.test(nome) ? [caminho] : []
    })
  }

  it("o `updateOrders` só aparece na porta do metadata", () => {
    const fora = arquivos(SRC)
      .map((caminho) => relative(SRC, caminho))
      .filter((arquivo) => !PERMITIDOS.has(arquivo))
      .filter((arquivo) =>
        /\.updateOrders\(|updateOrderWorkflow\(/.test(readFileSync(join(SRC, arquivo), "utf8"))
      )
    expect(fora).toEqual([])
  })

  it("e a porta ainda é quem grava (a lista acima não ficou velha)", () => {
    expect(readFileSync(join(SRC, PORTA), "utf8")).toMatch(/\.updateOrders\(/)
  })
})
