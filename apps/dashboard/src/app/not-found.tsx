import Link from "next/link"
import { Icone } from "@/components/icones"

/** Endereço que não existe no painel. */
export default function NaoEncontrado() {
  return (
    <main className="miolo">
      <div className="fora" data-tela>
        <div className="bloco">
          <span className="fila__ico">
            <Icone nome="alerta" />
          </span>
          <h1>Essa página não existe</h1>
          <p>O endereço pode ter mudado, ou faltou uma letra.</p>
          <Link className="btn btn--menor" href="/">
            Voltar pro início
          </Link>
        </div>
      </div>
    </main>
  )
}
