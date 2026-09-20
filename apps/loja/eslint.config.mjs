import { defineConfig, globalIgnores } from "eslint/config"
import nextVitals from "eslint-config-next/core-web-vitals"
import nextTs from "eslint-config-next/typescript"

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    /*
     * O protótipo da PDP não é código que sobe. `pdp-partes/` guarda pedaços
     * de HTML — `roteiro.js` começa com um `<script>` literal, que nenhum
     * parser de JavaScript aceita — e as suítes em Playwright usam `expect`
     * solto, que o lint lê como expressão jogada fora. Era isso que deixava
     * `npm run lint` vermelho desde que o protótipo entrou: erro de sintaxe
     * num arquivo que nunca foi JavaScript.
     */
    "ferramentas/**",
  ]),
])

export default eslintConfig
