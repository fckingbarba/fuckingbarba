import type { SVGProps } from "react"

/** O raio da marca — mesmo path do protótipo e do favicon. */
export function Raio(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" {...props}>
      <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z" />
    </svg>
  )
}
