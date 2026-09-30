"use client"

import { useState, useTransition } from "react"
import { useAvisar } from "@/components/avisos"
import { salvarCustos, salvarSimples } from "@/lib/acoes/financeiro"
import { diaEmTexto, emCampo, reais, type TelaDosCustos } from "@/lib/financeiro"

/**
 * CUSTOS E IMPOSTO — o custo de cada produto (e desde quando vale), a
 * embalagem por pedido, a % do Pix no Pagar.me e a alíquota do Simples de
 * cada mês. Só vai pro
 * Medusa o que mudou. O custo novo vale a partir do dia escolhido: as vendas
 * de antes seguem com o custo de antes. O primeiro custo de um produto vale
 * desde o começo do DRE; mudar um custo que já existe, a partir de hoje.
 */

type Linha = { valor: string; desde: string }

export function FormularioDosCustos({ tela }: { tela: TelaDosCustos }) {
  const avisar = useAvisar()
  const [indo, comecar] = useTransition()
  const inicial = () =>
    Object.fromEntries(
      tela.produtos.map((p) => [
        p.id,
        { valor: emCampo(p.custo), desde: p.custo === null ? tela.comeco : tela.hoje },
      ])
    ) as Record<string, Linha>
  const [linhas, setLinhas] = useState<Record<string, Linha>>(inicial)
  const [embalagem, setEmbalagem] = useState<Linha>({
    valor: emCampo(tela.embalagem?.valor ?? null),
    desde: tela.embalagem ? tela.hoje : tela.comeco,
  })
  const [pix, setPix] = useState<Linha>({
    valor: emCampo(tela.taxaDoPix?.valor ?? null),
    desde: tela.taxaDoPix ? tela.hoje : tela.comeco,
  })
  const [erro, setErro] = useState<string | null>(null)
  const mudar = (id: string, campos: Partial<Linha>) =>
    setLinhas((a) => ({ ...a, [id]: { ...a[id], ...campos } }))

  const mudou = (valor: string, antes: number | null) => valor.trim() !== emCampo(antes)

  return (
    <form
      className="bloco bloco--sem-pad"
      data-custos
      aria-busy={indo || undefined}
      onSubmit={(e) => {
        e.preventDefault()
        const custos = tela.produtos
          .filter((p) => mudou(linhas[p.id].valor, p.custo))
          .map((p) => ({ produto: p.id, ...linhas[p.id] }))
        const emb = mudou(embalagem.valor, tela.embalagem?.valor ?? null) ? embalagem : null
        const taxaDoPix = mudou(pix.valor, tela.taxaDoPix?.valor ?? null) ? pix : null
        comecar(async () => {
          const r = await salvarCustos({ custos, embalagem: emb, taxaDoPix })
          setErro(r.ok ? null : r.texto)
          avisar(r)
        })
      }}
    >
      <div className="bloco__cabeca fin-custos__cabeca">
        <div>
          <h2 className="bloco__titulo">Custo de cada produto</h2>
          <p className="bloco__sub">
            Quanto você paga por unidade. Mudou o custo? Escolha de quando vale: os meses de antes
            não mudam. Kit: some o custo dos itens dele (e a caixa, se tiver).
          </p>
        </div>
      </div>
      <div className="tabela-rola">
        <table className="tabela fin-custos">
          <thead>
            <tr>
              <th scope="col">Produto</th>
              <th scope="col" className="direita">
                Preço hoje
              </th>
              <th scope="col">Custo (R$)</th>
              <th scope="col">Vale desde</th>
              <th scope="col" className="direita">
                Sobra por unidade
              </th>
            </tr>
          </thead>
          <tbody>
            {tela.produtos.map((p) => {
              const l = linhas[p.id]
              const alterado = mudou(l.valor, p.custo)
              return (
                <tr key={p.id} data-produto={p.id} data-sem-custo={p.custo === null || undefined}>
                  <th scope="row">
                    <span className="fin-custos__produto">
                      {p.foto ? (
                        // eslint-disable-next-line @next/next/no-img-element -- foto do Medusa, de qualquer host
                        <img src={p.foto} alt="" width={36} height={36} loading="lazy" />
                      ) : (
                        <i />
                      )}
                      <span>
                        {p.nome}
                        {p.publicado ? null : <small className="tabela__sub">rascunho</small>}
                        {p.antes.length ? (
                          <small className="tabela__sub">
                            antes:{" "}
                            {p.antes
                              .map((a) => `${reais(a.valor)} desde ${diaEmTexto(a.desde)}`)
                              .join(" · ")}
                          </small>
                        ) : null}
                      </span>
                    </span>
                  </th>
                  <td className="direita num">{p.preco === null ? "—" : reais(p.preco)}</td>
                  <td>
                    <input
                      className="fin-custos__campo"
                      inputMode="decimal"
                      autoComplete="off"
                      aria-label={`Custo de ${p.nome}`}
                      placeholder="falta"
                      value={l.valor}
                      data-vazio={!l.valor || undefined}
                      onChange={(e) => mudar(p.id, { valor: e.target.value })}
                    />
                  </td>
                  <td>
                    {alterado ? (
                      <input
                        type="date"
                        className="fin-custos__campo fin-custos__campo--dia"
                        aria-label={`O custo de ${p.nome} vale desde`}
                        value={l.desde}
                        min="2020-01-01"
                        onChange={(e) => mudar(p.id, { desde: e.target.value })}
                      />
                    ) : (
                      <span className="tabela__sub">{p.desde ? diaEmTexto(p.desde) : "—"}</span>
                    )}
                  </td>
                  <td className="direita num">
                    {p.sobra === null ? (
                      <span className="fin-selo fin-selo--falta">sem custo</span>
                    ) : (
                      <>
                        <b>{reais(p.sobra)}</b>
                        <small className="tabela__sub">
                          {p.sobraPct?.toFixed(1).replace(".", ",")}%
                        </small>
                      </>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="fin-embalagem" data-embalagem>
        <label className="fin-embalagem__rot" htmlFor="fin-embalagem">
          <b>Embalagem e material, por pedido</b>
          <small>Caixa, fita, cartão, brinde. Entra no custo dos produtos.</small>
        </label>
        <input
          id="fin-embalagem"
          className="fin-custos__campo"
          inputMode="decimal"
          autoComplete="off"
          placeholder="falta"
          value={embalagem.valor}
          data-vazio={!embalagem.valor || undefined}
          onChange={(e) => setEmbalagem((a) => ({ ...a, valor: e.target.value }))}
        />
        {mudou(embalagem.valor, tela.embalagem?.valor ?? null) ? (
          <input
            type="date"
            className="fin-custos__campo fin-custos__campo--dia"
            aria-label="A embalagem vale desde"
            value={embalagem.desde}
            min="2020-01-01"
            onChange={(e) => setEmbalagem((a) => ({ ...a, desde: e.target.value }))}
          />
        ) : (
          <span className="tabela__sub">
            {tela.embalagem ? `desde ${diaEmTexto(tela.embalagem.desde)}` : ""}
          </span>
        )}
      </div>
      <div className="fin-embalagem" data-taxa-do-pix>
        <label className="fin-embalagem__rot" htmlFor="fin-taxa-do-pix">
          <b>Taxa do Pix no Pagar.me (%)</b>
          <small>
            A do seu contrato: a API do Pagar.me não traz (ele cobra o Pix no mês seguinte). A do
            cartão e a do Mercado Pago vêm sozinhas.
          </small>
        </label>
        <input
          id="fin-taxa-do-pix"
          className="fin-custos__campo"
          inputMode="decimal"
          autoComplete="off"
          placeholder="falta"
          value={pix.valor}
          data-vazio={!pix.valor || undefined}
          onChange={(e) => setPix((a) => ({ ...a, valor: e.target.value }))}
        />
        {mudou(pix.valor, tela.taxaDoPix?.valor ?? null) ? (
          <input
            type="date"
            className="fin-custos__campo fin-custos__campo--dia"
            aria-label="A taxa do Pix vale desde"
            value={pix.desde}
            min="2020-01-01"
            onChange={(e) => setPix((a) => ({ ...a, desde: e.target.value }))}
          />
        ) : (
          <span className="tabela__sub">
            {tela.taxaDoPix ? `desde ${diaEmTexto(tela.taxaDoPix.desde)}` : ""}
          </span>
        )}
      </div>
      <div className="fin-rodape">
        {erro ? (
          <p className="campo__erro" role="alert">
            {erro}
          </p>
        ) : (
          <span className="tabela__sub">
            Produto novo entra aqui sozinho, com o custo em branco.
          </span>
        )}
        <button type="submit" className="btn" disabled={indo}>
          Salvar custos
        </button>
      </div>
    </form>
  )
}

/** A alíquota efetiva do Simples de cada mês — a do extrato do PGDAS-D que o contador manda. */
export function FormularioDoSimples({ tela }: { tela: TelaDosCustos }) {
  const avisar = useAvisar()
  const [indo, comecar] = useTransition()
  const inicial = () =>
    Object.fromEntries(
      tela.simples.map((s) => [s.mes, s.valor === null ? "" : emCampo(s.valor)])
    ) as Record<string, string>
  const [valores, setValores] = useState<Record<string, string>>(inicial)
  const [erro, setErro] = useState<string | null>(null)

  return (
    <form
      className="bloco"
      data-simples
      aria-busy={indo || undefined}
      onSubmit={(e) => {
        e.preventDefault()
        const mudaram = tela.simples.filter(
          (s) => valores[s.mes].trim() !== (s.valor === null ? "" : emCampo(s.valor))
        )
        comecar(async () => {
          for (const s of mudaram) {
            const r = await salvarSimples(s.mes, valores[s.mes])
            if (!r.ok) {
              setErro(`${s.nome}: ${r.texto}`)
              avisar(r)
              return
            }
          }
          setErro(null)
          avisar({
            ok: true,
            texto: mudaram.length ? "Alíquotas do Simples salvas" : "Nada mudou",
          })
        })
      }}
    >
      <h2 className="bloco__titulo">Imposto · Simples Nacional</h2>
      <p className="bloco__sub">
        A alíquota efetiva de cada mês: vem no extrato do PGDAS-D que o contador manda. Sem a do
        mês, o DRE usa a do último mês que tem — e avisa.
      </p>
      <div className="fin-simples">
        {tela.simples.map((s) => (
          <label key={s.mes} className="fin-simples__linha" data-mes={s.mes}>
            <span>{s.nome}</span>
            <span className="fin-simples__campo">
              <input
                inputMode="decimal"
                autoComplete="off"
                placeholder={s.usa ?? "falta"}
                value={valores[s.mes]}
                data-vazio={!valores[s.mes] || undefined}
                onChange={(e) => setValores((a) => ({ ...a, [s.mes]: e.target.value }))}
              />
              <span aria-hidden="true">%</span>
            </span>
          </label>
        ))}
      </div>
      {erro ? (
        <p className="campo__erro" role="alert">
          {erro}
        </p>
      ) : null}
      <button type="submit" className="btn" disabled={indo}>
        Salvar
      </button>
    </form>
  )
}
