import Link from "next/link"
import { Raio } from "./raio"
import { site } from "@/lib/site"

export function Logo({ tamanho = "md" }: { tamanho?: "md" | "lg" }) {
  const classes = tamanho === "lg" ? "text-[clamp(2.4rem,9vw,5.5rem)]" : "text-2xl"
  return (
    <Link
      href="/"
      className={`titulo-marca inline-flex items-center gap-[0.15em] text-tinta ${classes}`}
      aria-label={`${site.nome} — página inicial`}
    >
      <Raio className="h-[0.9em] w-[0.9em] text-amarelo drop-shadow-[2px_2px_0_#12181f]" />
      <span>
        Fucking<span className="text-papel [text-shadow:2px_2px_0_#12181f]">Barba</span>
      </span>
    </Link>
  )
}
