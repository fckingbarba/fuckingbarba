import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { DetailWidgetProps, AdminProduct } from "@medusajs/framework/types"
import { Button, Container, Heading, Input, Label, Switch, Text, Textarea, toast } from "@medusajs/ui"
import { useEffect, useState } from "react"

/**
 * O EDITOR DA PÁGINA DO PRODUTO, dentro da página do produto.
 *
 * As oito seções editoriais da PDP moravam num arquivo TypeScript da loja:
 * trocar uma frase era um deploy. Agora moram no `metadata` do produto, e se
 * editam aqui — na mesma tela onde você já mexe em preço, foto e estoque,
 * porque publicar um produto é uma tarefa só. Uma tela separada seria uma
 * segunda visita que alguém esquece de fazer.
 *
 * ┌─ POR QUE OS CAMPOS SÃO DESCRITOS EM DADO, E NÃO EM JSX ────────────────┐
 * │ São oito seções e umas quarenta entradas. Escritas à mão, seriam       │
 * │ quarenta blocos quase iguais — e cada seção nova no futuro, mais um.   │
 * │ Aqui cada seção é uma linha de `SECOES`, e o formulário se desenha a   │
 * │ partir dela. Acrescentar campo é acrescentar uma entrada na lista.     │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ LIGAR/DESLIGAR É OUTRA COISA QUE APAGAR ──────────────────────────────┐
 * │ A chavinha de cada seção mexe no LAYOUT (`visibilidade`), não no       │
 * │ conteúdo. Desligar esconde a seção e guarda o texto; apagar o texto é  │
 * │ esvaziar os campos. São intenções diferentes — "não quero isto agora"  │
 * │ e "isto não serve mais" — e juntá-las faria a primeira destruir o      │
 * │ trabalho da segunda.                                                    │
 * └─────────────────────────────────────────────────────────────────────────┘
 */

export const config = defineWidgetConfig({ zone: "product.details.after" })

type Campo =
  | { k: string; tipo: "texto" | "textao"; rotulo: string; dica?: string }
  | { k: string; tipo: "lista"; rotulo: string; dica?: string }
  | { k: string; tipo: "repetidor"; rotulo: string; dica?: string; sub: SubCampo[] }

type SubCampo = { k: string; tipo: "texto" | "textao" | "lista"; rotulo: string; dica?: string }

type Secao = { k: string; id: string; nome: string; dica: string; campos: Campo[] }

const UM_POR_LINHA = "um por linha"

const SECOES: Secao[] = [
  {
    k: "promessa",
    id: "produto.promessa",
    nome: "O que muda na sua cara",
    dica: "A promessa do produto, em tópicos curtos.",
    campos: [
      { k: "chapeu", tipo: "texto", rotulo: "Chapéu", dica: "a linha pequena acima do título" },
      { k: "titulo", tipo: "texto", rotulo: "Título", dica: "use *asteriscos* pra destacar" },
      { k: "itens", tipo: "lista", rotulo: "Itens", dica: UM_POR_LINHA },
      { k: "rodape", tipo: "texto", rotulo: "Rodapé (opcional)" },
    ],
  },
  {
    k: "tempo",
    id: "produto.tempo",
    nome: "Quando o resultado aparece",
    dica: "A linha do tempo. Só prometa prazo que o produto cumpre.",
    campos: [
      { k: "titulo", tipo: "texto", rotulo: "Título" },
      {
        k: "passos",
        tipo: "repetidor",
        rotulo: "Passos",
        sub: [
          { k: "quando", tipo: "texto", rotulo: "Quando" },
          { k: "titulo", tipo: "texto", rotulo: "Título" },
          { k: "texto", tipo: "textao", rotulo: "Texto" },
        ],
      },
      { k: "aviso", tipo: "texto", rotulo: "Aviso (opcional)" },
    ],
  },
  {
    k: "faixa",
    id: "produto.faixa",
    nome: "Faixa de foto",
    dica: "A faixa larga com foto de fundo.",
    campos: [
      { k: "chapeu", tipo: "texto", rotulo: "Chapéu" },
      { k: "titulo", tipo: "texto", rotulo: "Título" },
      { k: "texto", tipo: "textao", rotulo: "Texto" },
      { k: "chamada", tipo: "texto", rotulo: "Chamada do botão" },
      { k: "fotoDe", tipo: "texto", rotulo: "Foto de", dica: "o handle do produto cuja foto vira o fundo" },
    ],
  },
  {
    k: "rotina",
    id: "produto.rotina",
    nome: "Monte a rotina",
    dica: "Os outros produtos que completam a rotina. Não repita este aqui.",
    campos: [
      { k: "titulo", tipo: "texto", rotulo: "Título" },
      {
        k: "itens",
        tipo: "repetidor",
        rotulo: "Produtos",
        sub: [
          { k: "handle", tipo: "texto", rotulo: "Handle do produto" },
          { k: "passo", tipo: "texto", rotulo: "Passo" },
          { k: "para", tipo: "texto", rotulo: "Para que serve" },
        ],
      },
    ],
  },
  {
    k: "funciona",
    id: "produto.funciona",
    nome: "Como funciona e modo de uso",
    dica: "",
    campos: [
      { k: "comoTitulo", tipo: "texto", rotulo: "Título — como funciona" },
      { k: "comoFotoDe", tipo: "texto", rotulo: "Foto de (handle)" },
      { k: "comoTexto", tipo: "lista", rotulo: "Parágrafos", dica: "um por linha" },
      { k: "usoTitulo", tipo: "texto", rotulo: "Título — modo de uso" },
      { k: "usoFotoDe", tipo: "texto", rotulo: "Foto de (handle)" },
      { k: "usoPassos", tipo: "lista", rotulo: "Passos", dica: UM_POR_LINHA },
      { k: "dica", tipo: "texto", rotulo: "Dica (opcional)" },
    ],
  },
  {
    k: "versus",
    id: "produto.versus",
    nome: "O nosso e o genérico",
    dica: "Comparação honesta. Não cite marca concorrente pelo nome.",
    campos: [
      { k: "titulo", tipo: "texto", rotulo: "Título" },
      { k: "nomeDeles", tipo: "texto", rotulo: "Como chamar o outro" },
      { k: "descricaoDeles", tipo: "texto", rotulo: "Descrição do outro" },
      { k: "nosso", tipo: "lista", rotulo: "O nosso", dica: UM_POR_LINHA },
      { k: "deles", tipo: "lista", rotulo: "O deles", dica: UM_POR_LINHA },
    ],
  },
  {
    k: "quem",
    id: "produto.quem",
    nome: "Pra quem é, pra quem não é",
    dica: "Dizer pra quem NÃO serve evita devolução — e vende mais, não menos.",
    campos: [
      { k: "titulo", tipo: "texto", rotulo: "Título" },
      { k: "sim", tipo: "lista", rotulo: "É pra você se…", dica: UM_POR_LINHA },
      { k: "nao", tipo: "lista", rotulo: "Não é pra você se…", dica: UM_POR_LINHA },
    ],
  },
  {
    k: "duvidas",
    id: "produto.duvidas",
    nome: "Perguntas frequentes",
    dica: "As perguntas que chegam no WhatsApp. Responda como responderia lá.",
    campos: [
      { k: "titulo", tipo: "texto", rotulo: "Título" },
      {
        k: "perguntas",
        tipo: "repetidor",
        rotulo: "Perguntas",
        sub: [
          { k: "pergunta", tipo: "texto", rotulo: "Pergunta" },
          { k: "resposta", tipo: "lista", rotulo: "Resposta", dica: "um parágrafo por linha" },
        ],
      },
    ],
  },
]

type Qualquer = Record<string, unknown>

const linhas = (v: unknown) => (Array.isArray(v) ? v.join("\n") : "")
const deLinhas = (v: string) => v.split("\n").map((l) => l.trim()).filter(Boolean)

const PdpWidget = ({ data: produto }: DetailWidgetProps<AdminProduct>) => {
  const [conteudo, setConteudo] = useState<Qualquer>({})
  const [visibilidade, setVisibilidade] = useState<Record<string, boolean>>({})
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [aberta, setAberta] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/admin/produtos/${produto.id}/pdp`, { credentials: "include" })
      .then((r) => r.json())
      .then(({ pdp }) => {
        setConteudo((pdp?.conteudo ?? {}) as Qualquer)
        setVisibilidade((pdp?.layout?.visibilidade ?? {}) as Record<string, boolean>)
      })
      .catch(() => toast.error("Não consegui ler o conteúdo da página"))
      .finally(() => setCarregando(false))
  }, [produto.id])

  const secaoDe = (k: string) => (conteudo[k] ?? {}) as Qualquer
  const mudar = (secao: string, campo: string, valor: unknown) =>
    setConteudo((c) => ({ ...c, [secao]: { ...((c[secao] ?? {}) as Qualquer), [campo]: valor } }))

  async function salvar() {
    setSalvando(true)
    try {
      const r = await fetch(`/admin/produtos/${produto.id}/pdp`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          conteudo,
          layout: Object.keys(visibilidade).length ? { visibilidade } : {},
        }),
      })
      if (!r.ok) throw new Error(String(r.status))
      const { pdp, loja_avisada } = await r.json()

      /*
        Devolve o que o servidor ACEITOU, e não o que o formulário tinha. Se
        uma seção foi recusada por faltar campo obrigatório, a tela mostra
        isso na hora — em vez de a pessoa achar que salvou e descobrir pela
        loja que a seção não aparece.
      */
      setConteudo(pdp.conteudo)

      const pedidas = Object.keys(conteudo).filter(
        (k) => Object.keys(secaoDe(k)).some((c) => String(secaoDe(k)[c] ?? "").length)
      )
      const recusadas = pedidas.filter((k) => !(k in pdp.conteudo))

      if (recusadas.length) {
        toast.warning(
          `Salvo, mas ${recusadas.length} seção(ões) ficaram de fora por campo obrigatório vazio: ` +
            recusadas.map((k) => SECOES.find((s) => s.k === k)?.nome ?? k).join(", ")
        )
      } else {
        toast.success(
          loja_avisada
            ? "Salvo. A loja já está mostrando a página nova."
            : "Salvo no Medusa, mas não consegui avisar a loja — ela pode levar um tempo pra atualizar."
        )
      }
    } catch {
      toast.error("Não consegui salvar")
    } finally {
      setSalvando(false)
    }
  }

  if (carregando) {
    return (
      <Container className="p-6">
        <Text>Carregando a página do produto…</Text>
      </Container>
    )
  }

  return (
    <Container className="divide-y p-0">
      <div className="px-6 py-4">
        <Heading level="h2">Página do produto</Heading>
        <Text size="small" className="text-ui-fg-subtle mt-1">
          As seções de texto da PDP. A chavinha esconde a seção sem apagar o que está escrito.
          Seção com campo obrigatório vazio não vai pro ar — a loja prefere não desenhar a
          desenhar um cabeçalho solto.
        </Text>
      </div>

      {SECOES.map((secao) => {
        const valores = secaoDe(secao.k)
        const temTexto = Object.values(valores).some((v) =>
          Array.isArray(v) ? v.length : String(v ?? "").trim().length
        )
        const visivel = visibilidade[secao.id] ?? true
        const estaAberta = aberta === secao.k

        return (
          <div key={secao.k} className="px-6 py-4">
            <div className="flex items-center justify-between gap-4">
              <button
                type="button"
                className="flex-1 text-left"
                onClick={() => setAberta(estaAberta ? null : secao.k)}
              >
                <Text weight="plus">
                  {secao.nome}{" "}
                  <span className="text-ui-fg-muted">
                    {temTexto ? (visivel ? "" : "· escondida") : "· vazia"}
                  </span>
                </Text>
                {secao.dica ? (
                  <Text size="xsmall" className="text-ui-fg-subtle">
                    {secao.dica}
                  </Text>
                ) : null}
              </button>
              <Switch
                checked={visivel}
                onCheckedChange={(v) =>
                  setVisibilidade((x) => ({ ...x, [secao.id]: v }))
                }
              />
            </div>

            {estaAberta ? (
              <div className="mt-4 flex flex-col gap-4">
                {secao.campos.map((campo) => (
                  <CampoDaSecao
                    key={campo.k}
                    campo={campo}
                    valor={valores[campo.k]}
                    aoMudar={(v) => mudar(secao.k, campo.k, v)}
                  />
                ))}
              </div>
            ) : null}
          </div>
        )
      })}

      <div className="flex justify-end px-6 py-4">
        <Button onClick={salvar} isLoading={salvando}>
          Salvar página
        </Button>
      </div>
    </Container>
  )
}

export default PdpWidget

const CampoDaSecao = ({
  campo,
  valor,
  aoMudar,
}: {
  campo: Campo
  valor: unknown
  aoMudar: (v: unknown) => void
}) => {
  if (campo.tipo === "repetidor") {
    const itens = (Array.isArray(valor) ? valor : []) as Qualquer[]
    return (
      <div className="flex flex-col gap-3">
        <Label size="small" weight="plus">
          {campo.rotulo}
        </Label>
        {itens.map((item, i) => (
          <div key={i} className="border-ui-border-base flex flex-col gap-3 border-l-2 pl-3">
            {campo.sub.map((sub) => (
              <CampoDaSecao
                key={sub.k}
                campo={sub as Campo}
                valor={item[sub.k]}
                aoMudar={(v) =>
                  aoMudar(itens.map((x, j) => (j === i ? { ...x, [sub.k]: v } : x)))
                }
              />
            ))}
            <div>
              <Button
                variant="transparent"
                size="small"
                onClick={() => aoMudar(itens.filter((_, j) => j !== i))}
              >
                Remover
              </Button>
            </div>
          </div>
        ))}
        <div>
          <Button variant="secondary" size="small" onClick={() => aoMudar([...itens, {}])}>
            Adicionar {campo.rotulo.toLowerCase()}
          </Button>
        </div>
      </div>
    )
  }

  const comum = (
    <>
      <Label size="small" weight="plus">
        {campo.rotulo}
      </Label>
    </>
  )

  if (campo.tipo === "lista") {
    return (
      <div className="flex flex-col gap-1">
        {comum}
        <Textarea
          rows={Math.min(8, Math.max(3, (Array.isArray(valor) ? valor.length : 0) + 1))}
          value={linhas(valor)}
          onChange={(e) => aoMudar(deLinhas(e.target.value))}
        />
        {campo.dica ? (
          <Text size="xsmall" className="text-ui-fg-subtle">
            {campo.dica}
          </Text>
        ) : null}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      {comum}
      {campo.tipo === "textao" ? (
        <Textarea
          rows={3}
          value={String(valor ?? "")}
          onChange={(e) => aoMudar(e.target.value)}
        />
      ) : (
        <Input value={String(valor ?? "")} onChange={(e) => aoMudar(e.target.value)} />
      )}
      {campo.dica ? (
        <Text size="xsmall" className="text-ui-fg-subtle">
          {campo.dica}
        </Text>
      ) : null}
    </div>
  )
}
