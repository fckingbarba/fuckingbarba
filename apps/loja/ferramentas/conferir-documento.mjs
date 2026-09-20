/**
 * Confere o validador de CPF/CNPJ contra números que existem no mundo.
 *
 *   node ferramentas/conferir-documento.mjs
 *
 * Validador de documento é código que ninguém revisita e que, quando erra,
 * erra silencioso: o cliente digita certo, a loja diz que está errado, e ele
 * vai comprar em outro lugar. Ninguém abre chamado pra isso.
 *
 * O caso que este arquivo existe pra travar é o CNPJ ALFANUMÉRICO, em vigor
 * desde julho de 2026. Um validador só-numérico passa em todos os testes
 * antigos e recusa toda empresa aberta de julho pra cá.
 */

import { conferirDocumento, ehCnpj, ehCpf, mascararDocumento } from "../src/lib/documento.ts"

let falhas = 0
let testes = 0
const ok = (cond, texto, det = "") => {
  testes++
  if (cond) console.log(`  ✓ ${texto}`)
  else {
    falhas++
    console.log(`  ✗ ${texto}${det ? ` — ${det}` : ""}`)
  }
}
const titulo = (t) => console.log(`\n${t}`)

/* ── CPF ──────────────────────────────────────────────────────────────────── */

titulo("CPF que vale")
// Bases arbitrárias com os dígitos fechados pelo módulo 11, conferidas à mão.
for (const cpf of [
  "111.444.777-35",
  "11144477735",
  "529.982.247-25",
  "398.352.427-39",
  "168.995.509-03",
  "027.651.093-38",
]) {
  ok(ehCpf(cpf), `${cpf} passa`)
}

titulo("CPF que não vale")
ok(!ehCpf("111.444.777-36"), "dígito trocado não passa")
ok(!ehCpf("111.111.111-11"), "todos iguais não passam, mesmo fechando o módulo 11")
ok(!ehCpf("000.000.000-00"), "zeros não passam")
ok(!ehCpf("1114447773"), "10 dígitos não passam")
ok(!ehCpf("111444777350"), "12 dígitos não passam")
ok(!ehCpf(""), "vazio não passa")

/* ── CNPJ numérico, o de sempre ───────────────────────────────────────────── */

titulo("CNPJ numérico")
// 33.000.167/0001-01 é o da Petrobras; 11.222.333/0001-81 é o exemplo clássico.
for (const cnpj of ["11.222.333/0001-81", "33.000.167/0001-01", "60.746.948/0001-12"]) {
  ok(ehCnpj(cnpj), `${cnpj} passa`)
}
ok(!ehCnpj("11.222.333/0001-82"), "dígito trocado não passa")
ok(!ehCnpj("11.111.111/1111-11"), "todos iguais não passam")

/* ── CNPJ alfanumérico, o de julho de 2026 pra cá ─────────────────────────── */

titulo("CNPJ alfanumérico")
/**
 * `12ABC34501DE35` é o exemplo publicado junto com a especificação: base
 * `12ABC34501DE`, dígitos `35`. Se esta linha falhar, o cálculo com letras
 * está errado e nenhuma empresa nova consegue comprar.
 */
ok(ehCnpj("12ABC34501DE35"), "12.ABC.345/01DE-35 passa (exemplo oficial)")
ok(ehCnpj("12.ABC.345/01DE-35"), "e passa pontuado do mesmo jeito")
ok(ehCnpj("12abc34501de35"), "minúsculo passa — a pessoa não digita em caixa alta")
ok(!ehCnpj("12ABC34501DE34"), "dígito trocado não passa")
ok(!ehCnpj("12ABC34501DEA5"), "letra no lugar do dígito verificador não passa")

/* ── a porta de entrada ───────────────────────────────────────────────────── */

titulo("conferirDocumento")
const cpf = conferirDocumento("111.444.777-35")
ok(cpf.ok && cpf.documento.tipo === "cpf", "reconhece CPF pelo tamanho")
ok(cpf.ok && cpf.documento.valor === "11144477735", "guarda sem pontuação")

const cnpj = conferirDocumento("12.abc.345/01de-35")
ok(cnpj.ok && cnpj.documento.tipo === "cnpj", "reconhece CNPJ pelo tamanho")
ok(cnpj.ok && cnpj.documento.valor === "12ABC34501DE35", "guarda maiúsculo e sem pontuação")

const curto = conferirDocumento("123")
ok(!curto.ok, "número curto é recusado")
ok(!curto.ok && /11 d[íi]gitos/.test(curto.erro), "e o erro diz o tamanho esperado", curto.erro)

const vazio = conferirDocumento("   ")
ok(!vazio.ok && /Preencha/.test(vazio.erro), "vazio pede pra preencher", vazio.erro)

/* ── a máscara ────────────────────────────────────────────────────────────── */

titulo("Máscara enquanto digita")
const esperado = [
  ["1", "1"],
  ["111", "111"],
  ["1114", "111.4"],
  ["111444777", "111.444.777"],
  ["11144477735", "111.444.777-35"],
  ["12ABC34501DE35", "12.ABC.345/01DE-35"],
  ["12abc34501de35", "12.ABC.345/01DE-35"],
]
for (const [entrada, saida] of esperado) {
  const veio = mascararDocumento(entrada)
  ok(veio === saida, `"${entrada}" → "${saida}"`, `veio "${veio}"`)
}
ok(
  mascararDocumento("111444777350000000") === "11.144.477/7350-00",
  "corta em 14 caracteres em vez de aceitar lixo",
  mascararDocumento("111444777350000000")
)

console.log(`\n${testes - falhas}/${testes} passaram`)
process.exit(falhas ? 1 : 0)
