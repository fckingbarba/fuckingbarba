import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { DetailWidgetProps, AdminProduct } from "@medusajs/framework/types"
import {
  Button,
  Container,
  Heading,
  Input,
  Label,
  Switch,
  Text,
  Textarea,
  toast,
} from "@medusajs/ui"
import { useEffect, useState } from "react"

/*
  O mesmo corte que o `lib/pdp.ts` aplica na gravação, repetido aqui pro
  campo não deixar digitar o que o servidor vai cortar em silêncio. São dois
  pacotes diferentes — o admin é bundle próprio —, então o número é escrito
  dos dois lados, como em qualquer contrato de API. Quem confere que os dois
  concordam é o `conferir-pdp.mjs`.
*/
const LIMITE_DA_LINHA = 48

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
      {
        k: "fotoDe",
        tipo: "texto",
        rotulo: "Foto de",
        dica: "o handle do produto cuja foto vira o fundo",
      },
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
const deLinhas = (v: string) =>
  v
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)

type Fundo = { imagem: string; veu?: number }
type NoCatalogo = { id: string; title: string; handle: string; thumbnail: string | null }

/**
 * A MEDIDA RECOMENDADA DA FOTO.
 *
 * 1920 de largura porque a seção é de ponta a ponta da tela: em monitor de
 * 1440 com tela retina, menos que isso aparece borrado. Mais que isso não
 * melhora e pesa — e peso de imagem é a primeira coisa que derruba a nota de
 * performance, que o CI cobra em 90.
 *
 * O assunto no meio de cima porque a foto é cortada a partir de 40% do topo:
 * rosto na parte de baixo some no corte em tela larga.
 */
const MEDIDA = "1920 × 1080 px · JPG ou WebP · até 400 KB · assunto no meio de cima"

const PdpWidget = ({ data: produto }: DetailWidgetProps<AdminProduct>) => {
  const [conteudo, setConteudo] = useState<Qualquer>({})
  const [visibilidade, setVisibilidade] = useState<Record<string, boolean>>({})
  const [fundos, setFundos] = useState<Record<string, Fundo>>({})
  const [combinada, setCombinada] = useState<{
    kits?: boolean
    notaDoAvulso?: string
    produtos?: string[]
  }>({})
  const [catalogo, setCatalogo] = useState<NoCatalogo[]>([])
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [aberta, setAberta] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/admin/produtos/${produto.id}/pdp`, { credentials: "include" })
      .then((r) => r.json())
      .then(({ pdp }) => {
        setConteudo((pdp?.conteudo ?? {}) as Qualquer)
        setVisibilidade((pdp?.layout?.visibilidade ?? {}) as Record<string, boolean>)
        setFundos((pdp?.fundos ?? {}) as Record<string, Fundo>)
        setCombinada(pdp?.combinada ?? {})
      })
      .catch(() => toast.error("Não consegui ler o conteúdo da página"))
      .finally(() => setCarregando(false))
  }, [produto.id])

  /* O catálogo pro seletor de produtos que combinam. O próprio produto fica
     de fora: oferecer o que a pessoa já está olhando não é venda combinada. */
  useEffect(() => {
    fetch("/admin/products?limit=100&fields=id,title,handle,thumbnail", { credentials: "include" })
      .then((r) => r.json())
      .then(({ products }) =>
        setCatalogo(
          (products ?? [])
            .filter((p: NoCatalogo) => p.id !== produto.id && p.handle)
            .map((p: NoCatalogo) => ({
              id: p.id,
              title: p.title,
              handle: p.handle,
              thumbnail: p.thumbnail,
            }))
        )
      )
      .catch(() => undefined)
  }, [produto.id])

  /**
   * Sobe o arquivo pelo módulo de arquivos do Medusa — o mesmo que guarda as
   * fotos dos produtos. Devolve a URL pública, que é o que vai no fundo.
   */
  async function subir(arquivo: File): Promise<string | null> {
    const corpo = new FormData()
    corpo.append("files", arquivo)
    try {
      const r = await fetch("/admin/uploads", {
        method: "POST",
        credentials: "include",
        body: corpo,
      })
      if (!r.ok) throw new Error(String(r.status))
      const { files } = await r.json()
      return files?.[0]?.url ?? null
    } catch {
      toast.error("Não consegui subir a imagem")
      return null
    }
  }

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
          fundos,
          combinada,
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
      setFundos(pdp.fundos ?? {})
      setCombinada(pdp.combinada ?? {})

      const pedidas = Object.keys(conteudo).filter((k) =>
        Object.keys(secaoDe(k)).some((c) => String(secaoDe(k)[c] ?? "").length)
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
          As seções de texto da PDP. A chavinha esconde a seção sem apagar o que está escrito. Seção
          com campo obrigatório vazio não vai pro ar — a loja prefere não desenhar a desenhar um
          cabeçalho solto.
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
                onCheckedChange={(v) => setVisibilidade((x) => ({ ...x, [secao.id]: v }))}
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

                {/* A faixa tem foto e véu próprios desde o desenho: pôr uma
                    segunda imagem atrás empilharia dois fundos e viraria um
                    retângulo preto. A foto dela é o campo "Foto de". */}
                {secao.k !== "faixa" ? (
                  <FundoDaSecao
                    fundo={fundos[secao.id]}
                    aoSubir={subir}
                    aoMudar={(f) =>
                      setFundos((x) => {
                        const novo = { ...x }
                        if (f) novo[secao.id] = f
                        else delete novo[secao.id]
                        return novo
                      })
                    }
                  />
                ) : null}
              </div>
            ) : null}
          </div>
        )
      })}

      <div className="flex flex-col gap-4 px-6 py-4">
        <div>
          <Text weight="plus">O que aparece junto</Text>
          <Text size="xsmall" className="text-ui-fg-subtle">
            Duas coisas diferentes: levar MAIS DO MESMO (os kits de quantidade) e levar OUTRO
            produto.
          </Text>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <Text size="small" weight="plus">
              Kits de quantidade
            </Text>
            <Text size="xsmall" className="text-ui-fg-subtle">
              Automático: aparece quando este produto tem kit de 2 ou 3 cadastrado. A chave só serve
              pra esconder.
            </Text>
          </div>
          <Switch
            checked={combinada.kits !== false}
            onCheckedChange={(v) => setCombinada((c) => ({ ...c, kits: v ? undefined : false }))}
          />
        </div>

        {/*
          A linha de apoio do cartão de 1 frasco. Os kits tiram a deles do
          subtítulo do próprio kit; o avulso não tem de onde, porque o
          subtítulo dele descreve o produto, não a quantidade — e sem nada
          escrito aqui o primeiro cartão fica com um buraco do tamanho da
          descrição dos outros dois.
        */}
        <div className="flex flex-col gap-2">
          <Label size="small" weight="plus">
            Linha embaixo de &quot;1 frasco&quot;
          </Label>
          <Input
            value={combinada.notaDoAvulso ?? ""}
            maxLength={LIMITE_DA_LINHA}
            placeholder="1 mês de uso"
            onChange={(e) =>
              setCombinada((c) => ({ ...c, notaDoAvulso: e.target.value || undefined }))
            }
          />
          <Text size="xsmall" className="text-ui-fg-subtle">
            Curta: ela divide o cartão com o nome e o preço. Os kits já têm a deles — é o subtítulo
            de cada kit.
          </Text>
        </div>

        <div className="flex flex-col gap-2">
          <Label size="small" weight="plus">
            Leve junto (ao lado do preço)
          </Label>
          <Text size="xsmall" className="text-ui-fg-subtle">
            Aparecem como caixinhas na coluna de compra, e entram na sacola no mesmo clique do
            &quot;Adicionar&quot;. Dois costuma ser o número certo — a partir do terceiro a escolha
            vira lista e empurra o botão pra baixo da tela. Sem nenhum marcado, a oferta não
            aparece; o carrossel do fim da página continua mostrando o resto do catálogo de qualquer
            jeito.
          </Text>
          <div className="mt-1 flex flex-col gap-2">
            {catalogo.map((item) => {
              const marcado = (combinada.produtos ?? []).includes(item.handle)
              return (
                <label key={item.id} className="flex cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    checked={marcado}
                    onChange={() =>
                      setCombinada((c) => {
                        const atuais = c.produtos ?? []
                        const novos = marcado
                          ? atuais.filter((h) => h !== item.handle)
                          : [...atuais, item.handle]
                        return { ...c, produtos: novos.length ? novos : undefined }
                      })
                    }
                  />
                  {item.thumbnail ? (
                    <img src={item.thumbnail} alt="" className="h-8 w-8 object-cover" />
                  ) : (
                    <span className="bg-ui-bg-subtle h-8 w-8" />
                  )}
                  <Text size="small">{item.title}</Text>
                </label>
              )
            })}
          </div>
        </div>
      </div>

      <div className="flex justify-end px-6 py-4">
        <Button onClick={salvar} isLoading={salvando}>
          Salvar página
        </Button>
      </div>
    </Container>
  )
}

export default PdpWidget

/**
 * A IMAGEM DE FUNDO DA SEÇÃO.
 *
 * Sem imagem, a seção fica com a cor que ela já tem — que é o desenho
 * aprovado, não um estado provisório. Por isso não existe "escolher cor":
 * o que se acrescenta é uma foto ATRÁS, e a cor original vem por cima como
 * véu, preservando o contraste de tudo que está escrito.
 *
 * O VÉU É O CONTROLE. Em 100 a foto não aparece (é a tela de hoje); quanto
 * menor, mais ela aparece. 70 costuma ser o ponto em que a foto vira textura
 * sem atrapalhar leitura — abaixo de 60, comece a olhar com atenção.
 */
const FundoDaSecao = ({
  fundo,
  aoSubir,
  aoMudar,
}: {
  fundo?: Fundo
  aoSubir: (f: File) => Promise<string | null>
  aoMudar: (f: Fundo | undefined) => void
}) => {
  const [subindo, setSubindo] = useState(false)

  return (
    <div className="border-ui-border-base flex flex-col gap-2 border-t pt-4">
      <Label size="small" weight="plus">
        Imagem de fundo (opcional)
      </Label>
      <Text size="xsmall" className="text-ui-fg-subtle">
        {MEDIDA}
      </Text>

      {fundo?.imagem ? (
        <>
          <img src={fundo.imagem} alt="" className="h-28 w-full object-cover" />
          <div className="flex items-center gap-3">
            <Label size="xsmall" className="w-24 shrink-0">
              Véu {fundo.veu ?? 85}%
            </Label>
            <input
              type="range"
              min={40}
              max={100}
              step={5}
              value={fundo.veu ?? 85}
              onChange={(e) => aoMudar({ ...fundo, veu: Number(e.target.value) })}
              className="flex-1"
            />
          </div>
          <Text size="xsmall" className="text-ui-fg-subtle">
            100% é a tela de hoje, sem foto à vista. Quanto menor, mais a foto aparece.
          </Text>
          <div>
            <Button variant="transparent" size="small" onClick={() => aoMudar(undefined)}>
              Remover imagem
            </Button>
          </div>
        </>
      ) : (
        <div>
          <label>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const arquivo = e.target.files?.[0]
                if (!arquivo) return
                setSubindo(true)
                const url = await aoSubir(arquivo)
                setSubindo(false)
                if (url) aoMudar({ imagem: url, veu: 85 })
              }}
            />
            <Button variant="secondary" size="small" asChild isLoading={subindo}>
              <span>{subindo ? "Subindo…" : "Escolher imagem"}</span>
            </Button>
          </label>
        </div>
      )}
    </div>
  )
}

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
                aoMudar={(v) => aoMudar(itens.map((x, j) => (j === i ? { ...x, [sub.k]: v } : x)))}
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
        <Textarea rows={3} value={String(valor ?? "")} onChange={(e) => aoMudar(e.target.value)} />
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
