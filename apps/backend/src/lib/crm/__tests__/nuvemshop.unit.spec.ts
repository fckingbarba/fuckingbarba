import {
  dataDeBrasilia,
  decodificar,
  dinheiro,
  lerArquivoDaNuvemshop,
  lerCsv,
  recomprasPorTipo,
} from "../nuvemshop"

/**
 * A base da Nuvemshop: os três arquivos como a loja antiga exporta (Latin-1,
 * ponto e vírgula), com gente inventada — e o que fica de cada um.
 */

const emLatin1 = (t: string) => new Uint8Array(Buffer.from(t, "latin1"))
const emUtf8 = (t: string) => new Uint8Array(Buffer.from(t, "utf8"))

const CLIENTES = [
  "Nome completo;CPF/CNPJ;E-mail;Telefone de Contato;Endereço;Cidade;Total Consumido (BRL);Número de Compras;Última Compra;Data;Cadastrado;Inscrição para newsletter;Marketing;Marketing (atualização)",
  "RAFAEL DA SILVA;11144477735;Rafael@Exemplo.com ;+5511988887777;Rua Um, 1;Blumenau;189.80;2;20/08/2026;16/09/2025;SIM;16-09-2025;Aceita;18/11/2025",
  "joão souza;;joao@exemplo.com;;;;0.00;0;;02/01/2026;NÃO;NÃO;Não aceita;02/01/2026",
  "Sem e-mail;;não é e-mail;;;;0.00;0;;02/01/2026;NÃO;NÃO;Aceita;02/01/2026",
].join("\r\n")

const VENDAS = [
  "Número do Pedido;E-mail;Data;Status do Pedido;Status do Pagamento;Status do Envio;Subtotal;Desconto;Valor do Frete;Total;Nome do comprador;CPF / CNPJ;Telefone;Endereço;Cupom de Desconto;Anotações do Comprador;Data de pagamento;Data de envío;Nome do Produto;Valor do Produto;Quantidade Comprada;SKU;Meio de pagamento;Dados do cartão",
  '1001;rafael@exemplo.com;10/01/2026 09:30:00;Aberto;Confirmado;Entregue;179.80;0.00;15.00;194.80;Rafael da Silva;11144477735;+5511988887777;Rua Um, 1;;"deixar na portaria; obrigado\nde novo";10/01/2026;12/01/2026;Kit Completo FuckingBarba;99.90;1;FBKIT01;Cartão de crédito;Visa ****1234',
  "1001;rafael@exemplo.com;;;;;;;;;;;;;;;;;Fator de Crescimento para Barba 30ml;79.90;1;fbfcb01;;",
  "1002;rafael@exemplo.com;20/02/2026 18:00:00;Aberto;Confirmado;Enviado;79.90;7.99;0.00;71.91;Rafael;;;;volta10;;20/02/2026;22/02/2026;Fator de Crescimento para Barba 30ml;79.90;1;FBFCB01;Pix;",
  "1003;joao@exemplo.com;05/03/2026 08:00:00;Aberto;Recusado;Não está embalado;99.90;0;0;99.90;João;;;;;;;;Kit Completo FuckingBarba;99.90;2;FBKIT01;Cartão de crédito;",
].join("\n")

const CARRINHOS = [
  "ID do carrinho;Data de criação;Tipo de abandono;Total do carrinho;Nome;E-mail;Telefone;CPF / CNPJ;Endereço;Nome do produto;Variante / SKU;Quantidade;Preço unitário",
  "555;29/08/2026 12:32:26;Tentou pagar mas falhou;R$1.093,18;Rafael;rafael@exemplo.com;+55;111;Rua;Kit 3x Fator de Crescimento;FBKIT06;1;199.90",
  ";;;;;rafael@exemplo.com;;;;Óleo para Barba;FBOL01;2;59.90",
  "555;;;;;rafael@exemplo.com;;;;Óleo para Barba;FBOL01;2;59.90",
].join("\n")

describe("a letra, o CSV e os valores", () => {
  it("Latin-1 ou UTF-8 (com o BOM), o mesmo texto", () => {
    expect(decodificar(emLatin1("João;Óleo"))).toBe("João;Óleo")
    expect(decodificar(emUtf8("\uFEFFJoão;Óleo"))).toBe("João;Óleo")
  })

  it("aspas com o separador e a quebra de linha dentro; a linha vazia fora", () => {
    expect(lerCsv('a;b\r\n"x;y";"z\n""w"""\n\n1;2')).toEqual([
      ["a", "b"],
      ["x;y", 'z\n"w"'],
      ["1", "2"],
    ])
    expect(lerCsv("a,b\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ])
  })

  it("o dinheiro com ponto, com vírgula e com R$; a data de Brasília", () => {
    expect(dinheiro("94.58")).toBe(94.58)
    expect(dinheiro("R$1.093,18")).toBe(1093.18)
    expect(dinheiro("")).toBeNull()
    expect(dataDeBrasilia("27/09/2026 11:00:58")).toEqual(new Date("2026-09-27T14:00:58Z"))
    expect(dataDeBrasilia("16-09-2025")).toEqual(new Date("2025-09-16T15:00:00Z"))
    expect(dataDeBrasilia("NÃO")).toBeNull()
  })
})

describe("os três arquivos", () => {
  it("clientes: o e-mail limpo, o primeiro nome, o sim das ofertas — e nada de CPF, telefone ou endereço", () => {
    const r = lerArquivoDaNuvemshop(emLatin1(CLIENTES))
    expect(r).toEqual({
      tipo: "clientes",
      ignoradas: 1,
      pessoas: [
        {
          email: "rafael@exemplo.com",
          nome: "Rafael",
          aceitaOfertas: true,
          ofertasEm: new Date("2025-11-18T15:00:00Z"),
          newsletterEm: new Date("2025-09-16T15:00:00Z"),
          tinhaConta: true,
          desde: new Date("2025-09-16T15:00:00Z"),
        },
        {
          email: "joao@exemplo.com",
          nome: "João",
          aceitaOfertas: false,
          ofertasEm: new Date("2026-01-02T15:00:00Z"),
          newsletterEm: null,
          tinhaConta: false,
          desde: new Date("2026-01-02T15:00:00Z"),
        },
      ],
    })
    expect(JSON.stringify(r)).not.toMatch(/11144477735|988887777|Rua Um|Blumenau/)
  })

  it("vendas: o pedido e os itens das linhas de baixo, o SKU em maiúsculas, o cupom", () => {
    const r = lerArquivoDaNuvemshop(emLatin1(VENDAS))
    if (!("tipo" in r) || r.tipo !== "vendas") throw new Error("não leu as vendas")
    expect(
      r.pedidos.map((p) => [p.numero, p.pagamento, p.envio, p.meio, p.total, p.cupom])
    ).toEqual([
      ["1001", "confirmado", "entregue", "cartao", 194.8, null],
      ["1002", "confirmado", "enviado", "pix", 71.91, "VOLTA10"],
      ["1003", "recusado", "nao-enviado", "cartao", 99.9, null],
    ])
    expect(r.pedidos[0].itens).toEqual([
      { sku: "FBKIT01", nome: "Kit Completo FuckingBarba", quantidade: 1, valor: 99.9 },
      { sku: "FBFCB01", nome: "Fator de Crescimento para Barba 30ml", quantidade: 1, valor: 79.9 },
    ])
    expect(r.pedidos[0].feitoEm).toEqual(new Date("2026-01-10T12:30:00Z"))
    expect(r.pedidos[0].enviadoEm).toEqual(new Date("2026-01-12T15:00:00Z"))
    expect(r.pedidos[2].pagoEm).toBeNull()
    expect(JSON.stringify(r)).not.toMatch(/11144477735|988887777|Rua Um|portaria|1234/)
  })

  it("carrinhos: o total com vírgula, o tipo do abandono, e o item sem carrinho fora", () => {
    const r = lerArquivoDaNuvemshop(emLatin1(CARRINHOS))
    expect(r).toEqual({
      tipo: "carrinhos",
      ignoradas: 1,
      carrinhos: [
        {
          id: "555",
          email: "rafael@exemplo.com",
          criadoEm: new Date("2026-08-29T15:32:26Z"),
          tipo: "pagamento-falhou",
          total: 1093.18,
          itens: [
            { sku: "FBKIT06", nome: "Kit 3x Fator de Crescimento", quantidade: 1, valor: 199.9 },
            { sku: "FBOL01", nome: "Óleo para Barba", quantidade: 2, valor: 59.9 },
          ],
        },
      ],
    })
  })

  it("o arquivo que não é da Nuvemshop, o vazio e o grande", () => {
    expect(lerArquivoDaNuvemshop(emLatin1("nome;idade\nana;30"))).toEqual({ erro: "desconhecido" })
    expect(lerArquivoDaNuvemshop(emLatin1("Número do Pedido;E-mail;SKU\n"))).toEqual({
      erro: "vazio",
    })
    expect(lerArquivoDaNuvemshop(new Uint8Array(9 * 1024 * 1024))).toEqual({ erro: "grande" })
  })
})

describe("quanto tempo leva pra comprar de novo", () => {
  it("a mediana por unidade, só quando a compra seguinte traz o mesmo tipo", () => {
    const dia = (d: number) => new Date(Date.UTC(2026, 0, 1) + d * 86_400_000)
    const r = recomprasPorTipo([
      // Ana: 1 Fator, e de novo em 30 dias; depois 3 Fatores, e de novo em 120 (40 por unidade).
      { email: "a", feitoEm: dia(0), pago: true, itens: [{ sku: "FBFCB01", quantidade: 1 }] },
      { email: "a", feitoEm: dia(30), pago: true, itens: [{ sku: "FBKIT06", quantidade: 1 }] },
      { email: "a", feitoEm: dia(150), pago: true, itens: [{ sku: "FBFCB01", quantidade: 1 }] },
      // Beto: Kit Completo, e depois só um Fator — nada de shampoo, balm ou óleo de novo.
      { email: "b", feitoEm: dia(0), pago: true, itens: [{ sku: "FBKIT01", quantidade: 1 }] },
      { email: "b", feitoEm: dia(50), pago: true, itens: [{ sku: "FBFCB01", quantidade: 1 }] },
      // O pedido não pago não conta.
      { email: "b", feitoEm: dia(60), pago: false, itens: [{ sku: "FBFCB01", quantidade: 1 }] },
    ])
    expect(r.fator).toEqual({ dias: 35, recompras: 2 })
    expect(r.shampoo).toBeNull()
    expect(r.oleo).toBeNull()
  })
})
