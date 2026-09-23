import { defineRouteConfig } from "@medusajs/admin-sdk"
import { CogSixTooth } from "@medusajs/icons"
import {
  Button,
  Container,
  Heading,
  Input,
  Label,
  Select,
  Text,
  Textarea,
  toast,
} from "@medusajs/ui"
import { useEffect, useState } from "react"

/**
 * CONFIGURAÇÕES DA LOJA — a tela que existe pra ninguém precisar de deploy.
 *
 * O que se edita aqui aparece na loja: a política de frete manda na faixa do
 * topo, na barra da sacola, na tarja do card e (quando o Frenet entrar) na
 * cotação; os dados da empresa aparecem no rodapé e nas páginas legais.
 *
 * ┌─ POR QUE A POLÍTICA DE FRETE É UM SELETOR, E NÃO UM CAMPO DE NÚMERO ────┐
 * │ Porque "sem promoção" e "frete fixo" são estados de verdade, não um    │
 * │ número mágico. Com um campo só, "desligar o frete grátis" viraria      │
 * │ digitar 999999 no piso — e a loja continuaria dizendo "frete grátis a  │
 * │ partir de R$ 999.999,00" em toda página.                               │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * O QUE ESTA TELA NÃO FAZ: inventar. Campo vazio grava `null`, e a loja
 * mostra uma tarja vermelha de "pendente" no lugar. É de propósito — CNPJ de
 * exemplo em página legal é pior que CNPJ ausente, porque parece verdadeiro.
 *
 * O VÍDEO DA HOME sobe pelo módulo de arquivos do Medusa (o mesmo das fotos
 * dos produtos) e é MEDIDO aqui, no navegador, antes de subir: a loja
 * precisa da largura e da altura pra reservar o espaço — e, se o navegador
 * não consegue nem abrir o arquivo pra medir, o do cliente também não vai
 * conseguir tocar.
 */

export const config = defineRouteConfig({
  label: "Configurações da loja",
  icon: CogSixTooth,
})

type Modo = "nenhuma" | "gratis" | "fixo"

type Video = { url: string; largura: number; altura: number }

/** MP4 toca em todo navegador; WebM, em quase todos. .MOV do iPhone, não. */
const TIPOS_DE_VIDEO = ["video/mp4", "video/webm"]
/** Acima disso o upload nem começa. */
const MAXIMO_MB = 50
/** Acima disso sobe, mas com o aviso de que pesa pra quem abre no 4G. */
const PESADO_MB = 20

type Forma = {
  modo: Modo
  piso: string
  preco: string
  alvo: "mais-barata" | "todas"
  tetoDeCusto: string
  precoDeEmergencia: string
  prazoDeEmergencia: string
  razaoSocial: string
  cnpj: string
  endereco: string
  whatsapp: string
  email: string
  horario: string
  prazoDePostagem: string
}

const VAZIA: Forma = {
  modo: "nenhuma",
  piso: "",
  preco: "",
  alvo: "mais-barata",
  tetoDeCusto: "",
  precoDeEmergencia: "",
  prazoDeEmergencia: "",
  razaoSocial: "",
  cnpj: "",
  endereco: "",
  whatsapp: "",
  email: "",
  horario: "",
  prazoDePostagem: "",
}

const texto = (v: unknown) => (typeof v === "string" ? v : "")
const numero = (v: unknown) => (typeof v === "number" ? String(v) : "")

/* Arrow function, não `function`: é o que a regra de lint do próprio Medusa
   exige pros componentes de rota do admin — o dashboard monta a tela por
   referência, e declaração içada quebra o hot reload dele. */
const Configuracoes = () => {
  const [forma, setForma] = useState<Forma>(VAZIA)
  const [video, setVideo] = useState<Video | null>(null)
  const [subindo, setSubindo] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    fetch("/admin/configuracoes", { credentials: "include" })
      .then((r) => r.json())
      .then(({ configuracoes: c }) => {
        const f = c?.frete ?? {}
        setForma({
          modo: (f.modo as Modo) ?? "nenhuma",
          piso: numero(f.piso),
          preco: numero(f.preco),
          alvo: f.alvo === "todas" ? "todas" : "mais-barata",
          tetoDeCusto: numero(f.tetoDeCusto),
          precoDeEmergencia: numero(c?.cotacao?.precoDeEmergencia),
          prazoDeEmergencia: texto(c?.cotacao?.prazoDeEmergencia),
          razaoSocial: texto(c?.empresa?.razaoSocial),
          cnpj: texto(c?.empresa?.cnpj),
          endereco: texto(c?.empresa?.endereco),
          whatsapp: texto(c?.atendimento?.whatsapp),
          email: texto(c?.atendimento?.email),
          // Uma linha por linha do rodapé — é assim que ele desenha.
          horario: (c?.atendimento?.horario ?? []).join("\n"),
          prazoDePostagem: texto(c?.atendimento?.prazoDePostagem),
        })
        setVideo(c?.home?.video ?? null)
      })
      .catch(() => toast.error("Não consegui ler as configurações"))
      .finally(() => setCarregando(false))
  }, [])

  function mudar<K extends keyof Forma>(campo: K, valor: Forma[K]) {
    setForma((f) => ({ ...f, [campo]: valor }))
  }

  /**
   * Escolheu o arquivo: confere o tipo e o tamanho, mede, e sobe. O vídeo só
   * vai pra loja no "Salvar", como todo o resto da tela.
   */
  async function escolherVideo(arquivo: File) {
    const mb = Math.round((arquivo.size / 1024 / 1024) * 10) / 10
    if (!TIPOS_DE_VIDEO.includes(arquivo.type)) {
      toast.error("Use um vídeo MP4. Se for .MOV do iPhone, exporte como MP4 antes.")
      return
    }
    if (mb > MAXIMO_MB) {
      toast.error(`O vídeo tem ${mb} MB, e o limite é ${MAXIMO_MB} MB. Encurte ou comprima antes.`)
      return
    }
    setSubindo(true)
    try {
      const medidas = await medir(arquivo)
      if (!medidas) {
        toast.error(
          "Esse vídeo não abre neste navegador — exporte como MP4 (H.264) e tente de novo."
        )
        return
      }
      const url = await subir(arquivo)
      if (!url) return
      setVideo({ url, ...medidas })
      toast.success(
        mb > PESADO_MB
          ? `Vídeo carregado, mas com ${mb} MB ele pesa pra quem abre no celular — se der, comprima. Clique em Salvar pra ele ir pra loja.`
          : "Vídeo carregado. Clique em Salvar pra ele ir pra loja."
      )
    } finally {
      setSubindo(false)
    }
  }

  async function salvar() {
    setSalvando(true)
    try {
      const resposta = await fetch("/admin/configuracoes", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          frete:
            forma.modo === "nenhuma"
              ? { modo: "nenhuma" }
              : {
                  modo: forma.modo,
                  piso: forma.piso,
                  preco: forma.preco,
                  alvo: forma.alvo,
                  tetoDeCusto: forma.tetoDeCusto || null,
                },
          empresa: {
            razaoSocial: forma.razaoSocial,
            cnpj: forma.cnpj,
            endereco: forma.endereco,
          },
          cotacao: {
            precoDeEmergencia: forma.precoDeEmergencia || null,
            prazoDeEmergencia: forma.prazoDeEmergencia || null,
          },
          atendimento: {
            whatsapp: forma.whatsapp,
            email: forma.email,
            horario: forma.horario.split("\n").filter((l) => l.trim()),
            prazoDePostagem: forma.prazoDePostagem,
          },
          home: { video },
        }),
      })
      if (!resposta.ok) throw new Error(String(resposta.status))
      const { loja_avisada } = await resposta.json()

      /*
        A mensagem diz se a LOJA foi avisada, não só se o banco gravou. São
        coisas diferentes: gravado e não avisado significa que o site segue
        mostrando o número velho até o cache vencer — e quem salvou precisa
        saber disso na hora, não descobrir olhando o site.
      */
      toast.success(
        loja_avisada
          ? "Salvo. A loja já está mostrando os valores novos."
          : "Salvo no Medusa, mas não consegui avisar a loja — ela pode levar um tempo pra atualizar."
      )
    } catch {
      toast.error("Não consegui salvar")
    } finally {
      setSalvando(false)
    }
  }

  if (carregando) {
    return (
      <Container className="p-6">
        <Text>Carregando…</Text>
      </Container>
    )
  }

  const temPromocao = forma.modo !== "nenhuma"

  return (
    <Container className="divide-y p-0">
      <div className="px-6 py-4">
        <Heading level="h1">Configurações da loja</Heading>
        <Text size="small" className="text-ui-fg-subtle mt-1">
          O que está aqui aparece na loja. Campo vazio vira uma tarja de &quot;pendente&quot; nas
          páginas legais, em vez de um valor de exemplo.
        </Text>
      </div>

      {/* ── FRETE ────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 px-6 py-5">
        <Heading level="h2">Frete</Heading>

        <Campo rotulo="Política" dica="Vale pra loja inteira, e é o que a vitrine anuncia.">
          <Select value={forma.modo} onValueChange={(v) => mudar("modo", v as Modo)}>
            <Select.Trigger>
              <Select.Value />
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="nenhuma">Sem promoção de frete</Select.Item>
              <Select.Item value="gratis">Frete grátis a partir de um valor</Select.Item>
              <Select.Item value="fixo">Frete fixo a partir de um valor</Select.Item>
            </Select.Content>
          </Select>
        </Campo>

        {temPromocao ? (
          <>
            <Campo
              rotulo="A partir de (R$)"
              dica="Valor dos produtos, sem o frete. Deixe 0 pra valer em qualquer pedido."
            >
              <Input
                type="number"
                step="0.01"
                min="0"
                value={forma.piso}
                onChange={(e) => mudar("piso", e.target.value)}
              />
            </Campo>

            {forma.modo === "fixo" ? (
              <Campo
                rotulo="Preço do frete (R$)"
                dica="Se a transportadora cobrar menos que isso, vale o dela — promoção não encarece."
              >
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={forma.preco}
                  onChange={(e) => mudar("preco", e.target.value)}
                />
              </Campo>
            ) : null}

            <Campo
              rotulo="Em qual opção"
              dica="Com cotação ao vivo, a mais barata muda por CEP — hoje pode ser PAC, amanhã Loggi."
            >
              <Select value={forma.alvo} onValueChange={(v) => mudar("alvo", v as Forma["alvo"])}>
                <Select.Trigger>
                  <Select.Value />
                </Select.Trigger>
                <Select.Content>
                  <Select.Item value="mais-barata">Só na mais barata</Select.Item>
                  <Select.Item value="todas">Em todas, inclusive as expressas</Select.Item>
                </Select.Content>
              </Select>
            </Campo>

            <Campo
              rotulo="Teto de custo (R$), opcional"
              dica="Acima disso a promoção não vale e o cliente paga o preço cheio. Protege de entrega cara pro interior."
            >
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="sem teto"
                value={forma.tetoDeCusto}
                onChange={(e) => mudar("tetoDeCusto", e.target.value)}
              />
            </Campo>
          </>
        ) : (
          <Text size="small" className="text-ui-fg-subtle">
            Sem promoção, a loja não fala de frete grátis em lugar nenhum: a faixa do topo, a barra
            da sacola e a tarja dos produtos somem sozinhas.
          </Text>
        )}
      </div>

      {/* ── COTAÇÃO ──────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 px-6 py-5">
        <Heading level="h2">Quando a cotação falhar</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          O frete é cotado na hora, pelo CEP do cliente. Se a transportadora não responder — cai,
          demora demais, ou o token vence —, a loja fica sem opção de entrega, e sem opção de
          entrega ninguém consegue fechar pedido. Este é o valor que ela cobra nessas horas.
        </Text>

        <Campo
          rotulo="Frete de emergência"
          dica="Deixe vazio pra não vender sem cotar: é o mais seguro, e para a loja enquanto durar a queda."
        >
          <Input
            type="number"
            step="0.01"
            min="0"
            placeholder="vazio = a loja para de vender"
            value={forma.precoDeEmergencia}
            onChange={(e) => mudar("precoDeEmergencia", e.target.value)}
          />
        </Campo>

        <Campo
          rotulo="Prazo de entrega nessas horas"
          dica="A frase inteira, como ela vai aparecer: '7 dias úteis'."
        >
          <Input
            placeholder="7 dias úteis"
            value={forma.prazoDeEmergencia}
            onChange={(e) => mudar("prazoDeEmergencia", e.target.value)}
          />
        </Campo>

        <Text size="xsmall" className="text-ui-fg-subtle">
          Escolha um valor que você aceita bancar se ficar curto: enquanto a cotação estiver fora, é
          este que o cliente vê, e frete anunciado a loja é obrigada a cumprir. O frete grátis acima
          do piso continua valendo por cima dele. O prazo é a sua promessa pra esses pedidos — sem
          cotação, ninguém sabe em quantos dias a transportadora entrega.
        </Text>
      </div>

      {/* ── EMPRESA ──────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 px-6 py-5">
        <Heading level="h2">Empresa</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          Aparece no rodapé de toda página e nas páginas legais. Enquanto estiver vazio, as páginas
          mostram uma tarja vermelha de pendente.
        </Text>

        <Campo rotulo="Razão social">
          <Input value={forma.razaoSocial} onChange={(e) => mudar("razaoSocial", e.target.value)} />
        </Campo>
        <Campo rotulo="CNPJ">
          <Input
            placeholder="00.000.000/0001-00"
            value={forma.cnpj}
            onChange={(e) => mudar("cnpj", e.target.value)}
          />
        </Campo>
        <Campo rotulo="Endereço">
          <Input value={forma.endereco} onChange={(e) => mudar("endereco", e.target.value)} />
        </Campo>
      </div>

      {/* ── ATENDIMENTO ──────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 px-6 py-5">
        <Heading level="h2">Atendimento</Heading>

        <Campo rotulo="WhatsApp" dica="Com DDI e DDD, só números: 5511988887777.">
          <Input
            inputMode="numeric"
            placeholder="5511988887777"
            value={forma.whatsapp}
            onChange={(e) => mudar("whatsapp", e.target.value)}
          />
        </Campo>
        <Campo rotulo="E-mail">
          <Input
            type="email"
            value={forma.email}
            onChange={(e) => mudar("email", e.target.value)}
          />
        </Campo>
        <Campo rotulo="Horário" dica="Uma linha por linha do rodapé.">
          <Textarea
            rows={2}
            value={forma.horario}
            onChange={(e) => mudar("horario", e.target.value)}
          />
        </Campo>
        <Campo
          rotulo="Prazo de postagem"
          dica="O tempo ENTRE o pagamento e a postagem — o prazo do transportador começa depois."
        >
          <Input
            placeholder="1 a 2 dias úteis"
            value={forma.prazoDePostagem}
            onChange={(e) => mudar("prazoDePostagem", e.target.value)}
          />
        </Campo>
      </div>

      {/* ── HOME ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 px-6 py-5">
        <Heading level="h2">Home</Heading>

        <Campo
          rotulo="Vídeo da história da marca"
          dica="Aparece no lugar da foto, na seção “O cuidado que impõe presença”. Toca sozinho e sem som quando a pessoa chega nele; se o vídeo tiver som, aparece um botão pra ligar."
        >
          {video ? (
            <div className="flex flex-col gap-2">
              <video
                src={video.url}
                controls
                muted
                playsInline
                className="max-h-72 w-auto self-start rounded"
              />
              <Text size="xsmall" className="text-ui-fg-subtle">
                {video.largura}×{video.altura}
                {video.altura > video.largura ? " · em pé" : " · deitado"}
              </Text>
              <div className="flex gap-2">
                <EscolherVideo rotulo="Trocar vídeo" subindo={subindo} aoEscolher={escolherVideo} />
                <Button variant="transparent" size="small" onClick={() => setVideo(null)}>
                  Tirar o vídeo
                </Button>
              </div>
            </div>
          ) : (
            <EscolherVideo rotulo="Escolher vídeo" subindo={subindo} aoEscolher={escolherVideo} />
          )}
        </Campo>

        <Text size="xsmall" className="text-ui-fg-subtle">
          MP4, de preferência em pé (do jeito que o celular grava) e curto — até uns 30 segundos e{" "}
          {PESADO_MB} MB. Vídeo .MOV do iPhone não toca em todo navegador: exporte como MP4 antes.
          Sem vídeo, a seção mostra a foto do óleo, como sempre.
        </Text>
      </div>

      <div className="flex justify-end px-6 py-4">
        <Button onClick={salvar} isLoading={salvando}>
          Salvar
        </Button>
      </div>
    </Container>
  )
}

export default Configuracoes

/**
 * Sobe pelo módulo de arquivos do Medusa — o mesmo das fotos dos produtos e
 * dos fundos da PDP. Devolve a URL pública, ou `null` (e o aviso na tela).
 */
async function subir(arquivo: File): Promise<string | null> {
  const corpo = new FormData()
  corpo.append("files", arquivo)
  try {
    const r = await fetch("/admin/uploads", { method: "POST", credentials: "include", body: corpo })
    if (!r.ok) throw new Error(String(r.status))
    const { files } = await r.json()
    return files?.[0]?.url ?? null
  } catch {
    toast.error("Não consegui subir o vídeo")
    return null
  }
}

/** A largura e a altura do vídeo — e a prova de que este navegador consegue abrir ele. */
function medir(arquivo: File): Promise<{ largura: number; altura: number } | null> {
  return new Promise((pronto) => {
    const endereco = URL.createObjectURL(arquivo)
    const video = document.createElement("video")
    const fim = (medidas: { largura: number; altura: number } | null) => {
      URL.revokeObjectURL(endereco)
      pronto(medidas)
    }
    video.preload = "metadata"
    video.muted = true
    video.onloadedmetadata = () =>
      fim(
        video.videoWidth && video.videoHeight
          ? { largura: video.videoWidth, altura: video.videoHeight }
          : null
      )
    video.onerror = () => fim(null)
    video.src = endereco
  })
}

const EscolherVideo = ({
  rotulo,
  subindo,
  aoEscolher,
}: {
  rotulo: string
  subindo: boolean
  aoEscolher: (arquivo: File) => void
}) => {
  return (
    <label className="self-start">
      <input
        type="file"
        accept="video/mp4,video/webm"
        className="hidden"
        disabled={subindo}
        onChange={(e) => {
          const arquivo = e.target.files?.[0]
          // Zera o campo: escolher o MESMO arquivo de novo (depois de um erro)
          // não dispararia o `onChange`.
          e.target.value = ""
          if (arquivo) aoEscolher(arquivo)
        }}
      />
      <Button variant="secondary" size="small" asChild isLoading={subindo}>
        <span>{subindo ? "Subindo…" : rotulo}</span>
      </Button>
    </label>
  )
}

const Campo = ({
  rotulo,
  dica,
  children,
}: {
  rotulo: string
  dica?: string
  children: React.ReactNode
}) => {
  return (
    <div className="flex flex-col gap-1">
      <Label size="small" weight="plus">
        {rotulo}
      </Label>
      {children}
      {dica ? (
        <Text size="xsmall" className="text-ui-fg-subtle">
          {dica}
        </Text>
      ) : null}
    </div>
  )
}
