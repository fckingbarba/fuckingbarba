import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { SoPara } from "@/components/area"
import { Icone } from "@/components/icones"
import { Integracoes, Problemas, Rotinas, Velocidade } from "@/components/observabilidade"
import { Cabeca, ForaDoAr, SemAcesso } from "@/components/telas"
import { Ajuda, Faixa, Pilula } from "@/components/visual"
import { ler } from "@/lib/medusa"
import type { TelaDaObservabilidade } from "@/lib/observabilidade"

export const metadata: Metadata = { title: "Observabilidade" }

/**
 * OBSERVABILIDADE — a saúde da loja: o que quebrou (com o que fazer), as
 * integrações e as rotinas automáticas. Vem pronto do backend
 * (`GET /dashboard/observabilidade`), que confere a loja antes de responder.
 * Dono e operação.
 *
 * MAIS VISUAL (0158) — as explicações de cada bloco no "?" ao lado do
 * título; os números com ícone; o freio do cartão numa pílula.
 */
export default function Pagina() {
  // A leitura sai junto com a pergunta de quem é (a resposta fica no `cache`).
  void ler("/dashboard/observabilidade")
  return (
    <SoPara area="observabilidade">
      <Observabilidade />
    </SoPara>
  )
}

const mais = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

async function Observabilidade() {
  const r = await ler("/dashboard/observabilidade")
  if (r.status === 401)
    redirect(`/sair?motivo=${r.corpo.message === "fora_da_equipe" ? "fora" : "expirou"}`)
  if (r.status === 403) return <SemAcesso area="observabilidade" />
  if (r.status !== 200) return <ForaDoAr />
  const t = r.corpo as unknown as TelaDaObservabilidade
  const { problemas, rotinas, noAr, carregar } = t.numeros

  return (
    <div data-tela>
      <Cabeca
        titulo="Observabilidade"
        ajuda={
          <>
            A saúde da loja: o que quebrou, o que as rotinas automáticas fizeram e como estão as
            integrações.
            {"\n"}O estorno que não sai, a nota travada, a conexão do Bling caída e o robô testando
            cartão também vão por e-mail, na hora, pro papel que resolve (Configurações → E-mails).
            O resto fica só aqui, e no número vermelho do menu quando é grave.
          </>
        }
      />
      <Faixa
        nivel={t.geral.nivel}
        icone={t.geral.nivel === "info" ? "check" : "alerta"}
        titulo={t.geral.titulo}
        ajuda={t.geral.texto}
        data-geral=""
      />
      <div className="numeros">
        <div
          className={`numero${problemas.graves ? " numero--grave" : ""}`}
          data-numero="problemas"
        >
          <span className="numero__ico">
            <Icone nome="alerta" />
          </span>
          <p className="numero__rot">Problemas abertos</p>
          <p className="numero__valor">{problemas.abertos}</p>
          <p className="numero__sub">
            {mais(problemas.graves, "grave", "graves")} · {problemas.olhar} pra olhar
          </p>
        </div>
        <div className="numero" data-numero="rotinas">
          <span className="numero__ico">
            <Icone nome="relogio" />
          </span>
          <p className="numero__rot">Rotinas automáticas</p>
          <p className="numero__valor">
            {rotinas.ok} de {rotinas.total}
          </p>
          <p className="numero__sub">rodaram bem na última vez</p>
        </div>
        <div className="numero" data-numero="no-ar">
          <span className="numero__ico">
            <Icone nome="tela" />
          </span>
          <p className="numero__rot">Site no ar</p>
          <p className="numero__valor">{noAr.valor ?? "—"}</p>
          <p className="numero__sub">{noAr.texto}</p>
        </div>
        <div
          className={`numero${carregar.s === "ruim" ? " numero--grave" : ""}`}
          data-numero="carregar"
        >
          <span className="numero__ico">
            <Icone nome="celular" />
          </span>
          <p className="numero__rot">Carregar, no celular</p>
          <p className="numero__valor">{carregar.valor ?? "—"}</p>
          <p className="numero__sub">{carregar.texto}</p>
        </div>
      </div>

      <section className="bloco" data-problemas>
        <div className="bloco__cabeca">
          <div className="bloco__titulos">
            <h2 className="bloco__titulo">Problemas</h2>
            <Ajuda>
              Do mais grave pro menos. O que depende da loja sai sozinho quando for resolvido; o
              resto, quem marca fica registrado.
            </Ajuda>
          </div>
        </div>
        <Problemas problemas={t.problemas} />
      </section>

      <section className="bloco" data-integracoes>
        <div className="bloco__cabeca">
          <div className="bloco__titulos">
            <h2 className="bloco__titulo">Integrações</h2>
            <Ajuda>
              Os serviços de que a loja depende, e o último sinal de cada um: verde funcionando,
              amarelo pra olhar, vermelho parado. O que cada um faz fica no “?” dele.
            </Ajuda>
          </div>
        </div>
        <Integracoes integracoes={t.integracoes} />
      </section>

      {t.cartao ? (
        <section className="bloco" data-cartao>
          <div className="bloco__cabeca">
            <div className="bloco__titulos">
              <h2 className="bloco__titulo">Cartão</h2>
              <Ajuda>
                As tentativas de pagar com cartão nas últimas 24 horas. Quem tenta demais — o robô
                que testa cartão roubado — a loja segura antes de chegar no Pagar.me.
                {"\n"}Tentativas: as que foram pro Pagar.me. Aprovadas: o banco disse sim.
                Recusadas: o banco, a análise ou o dado do cartão. Barradas: a loja segurou antes.
                {"\n"}
                {t.cartao.freio.texto}
              </Ajuda>
            </div>
            {/* O freio numa pílula; a frase inteira no "?" do bloco. */}
            <Pilula
              icone={t.cartao.freio.ligado ? "cadeado" : "check"}
              suave={!t.cartao.freio.ligado}
              data-freio={t.cartao.freio.ligado ? "ligado" : "desligado"}
            >
              {t.cartao.freio.ligado ? "Freio ligado" : "Freio desligado"}
            </Pilula>
          </div>
          <div className="numeros">
            <div className="numero" data-numero="tentativas">
              <span className="numero__ico">
                <Icone nome="cartao" />
              </span>
              <p className="numero__rot">Tentativas</p>
              <p className="numero__valor">{t.cartao.tentativas}</p>
            </div>
            <div className="numero" data-numero="aprovadas">
              <span className="numero__ico">
                <Icone nome="check" />
              </span>
              <p className="numero__rot">Aprovadas</p>
              <p className="numero__valor">{t.cartao.aprovadas}</p>
            </div>
            <div className="numero" data-numero="recusadas">
              <span className="numero__ico">
                <Icone nome="fechar" />
              </span>
              <p className="numero__rot">Recusadas</p>
              <p className="numero__valor">{t.cartao.recusadas}</p>
            </div>
            <div className="numero" data-numero="barradas">
              <span className="numero__ico">
                <Icone nome="cadeado" />
              </span>
              <p className="numero__rot">Barradas</p>
              <p className="numero__valor">{t.cartao.barradas}</p>
            </div>
          </div>
        </section>
      ) : null}

      <section className="bloco bloco--sem-pad" data-rotinas>
        <div className="bloco__cabeca">
          <div className="bloco__titulos">
            <h2 className="bloco__titulo">Rotinas automáticas</h2>
            <Ajuda>
              O que a loja faz sozinha, de tempos em tempos. Falhou, ela tenta de novo na próxima.
            </Ajuda>
          </div>
        </div>
        <Rotinas rotinas={t.rotinas} />
      </section>

      <section className="bloco" data-velocidade>
        <div className="bloco__cabeca">
          <div className="bloco__titulos">
            <h2 className="bloco__titulo">Velocidade do site</h2>
            <Ajuda>
              Medida nas visitas de verdade, nos últimos 28 dias — é o que o Google usa pra
              ranquear.
              {t.velocidade.visitas
                ? ""
                : " Nenhuma visita medida ainda: os números chegam quando alguém usar a loja."}
            </Ajuda>
          </div>
          <Pilula icone="olho" suave data-medidas-da-velocidade="">
            {t.velocidade.visitas
              ? `${mais(t.velocidade.visitas, "página medida", "páginas medidas")}`
              : "nenhuma visita medida"}
          </Pilula>
        </div>
        <Velocidade vitais={t.velocidade.vitais} />
        {t.velocidade.maisLenta ? (
          <p className="pequeno" style={{ margin: "14px 0 0" }} data-mais-lenta>
            {t.velocidade.maisLenta}
          </p>
        ) : null}
      </section>

      {/* Quem é avisado: numa linha; o resto está no "?" do título da tela. */}
      <div className="faixa faixa--curta" data-nivel="info" data-avisados>
        <Icone nome="email" />
        <span>O que é grave também vai por e-mail, pro papel que resolve.</span>
      </div>
    </div>
  )
}
