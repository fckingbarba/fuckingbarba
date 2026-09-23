import Image from "next/image"
import { NOMES_DAS_BANDEIRAS, type Bandeira } from "@/lib/cartao"

/**
 * O LOGO DA BANDEIRA — no fim do campo do número do cartão (checkout) e ao
 * lado de "Cartão em até 3x sem juros" (rodapé).
 *
 * OS LOGOS OFICIAIS, em arquivo (`public/bandeiras/`). Eram desenhos nossos
 * — "VISA" em Arial itálico, a Elo com três bolinhas empilhadas — e a loja
 * notou (23/09): num campo de cartão, logo que não é o da bandeira parece
 * golpe. Os arquivos vêm do projeto payment-icons, com os cantos retos da
 * marca; a licença (MPL-2.0) está em `public/bandeiras/LICENCA.txt`.
 *
 * Arquivo, e não SVG dentro da página: o da Hipercard sozinho tem 16 KB de
 * desenho, e o rodapé mostra os cinco em TODA página. Como arquivo, o
 * navegador baixa uma vez e guarda. `unoptimized` porque é SVG — não há o
 * que o otimizador de imagem do Next fazer com ele.
 *
 * O `alt` com o nome: o logo é a única coisa que diz, pra quem usa leitor de
 * tela, que a bandeira foi reconhecida.
 */
export function LogoDaBandeira({ bandeira }: { bandeira: Exclude<Bandeira, ""> }) {
  return (
    <Image
      src={`/bandeiras/${bandeira}.svg`}
      alt={`Cartão ${NOMES_DAS_BANDEIRAS[bandeira]}`}
      width={40}
      height={25}
      unoptimized
    />
  )
}
