import type { LinhaDeStatus } from "@/lib/configuracoes"

/**
 * As abas que só se conferem (o pagamento, a entrega): uma linha por coisa,
 * com o selo de ligado ou desligado quando é algo que liga.
 */
export function LinhasDeStatus({ linhas, dado }: { linhas: LinhaDeStatus[]; dado: string }) {
  return (
    <section className="bloco" data-linhas={dado}>
      <div className="linhas">
        {linhas.map((l) => (
          <div className="linha" key={l.titulo}>
            <div>
              <p className="linha__titulo">{l.titulo}</p>
              <p className="linha__txt">{l.texto}</p>
            </div>
            {l.ligado === null ? null : (
              <span className="status" data-s={l.ligado ? "ativo" : "pausado"}>
                {l.ligado ? "Ligado" : "Desligado"}
              </span>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
