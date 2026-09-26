/**
 * Depoimentos de clientes, em três listas — e cada uma afirma uma coisa
 * diferente pra quem lê.
 *
 * - `AVALIACOES`: uma pessoa identificada deu uma nota ao produto. Nome,
 *   estrela e, com pedido no sistema, o selo de compra verificada.
 * - `TRECHOS`: o que clientes disseram em entrevistas com a loja. Sem nome,
 *   sem estrela e sem selo — ver a última caixa.
 * - `ANTES_E_DEPOIS`: uma avaliação com as duas fotos.
 *
 * **`AVALIACOES` e `ANTES_E_DEPOIS` começam vazias de propósito.** Enquanto
 * estiverem vazias, as seções delas não aparecem — nem meio preenchidas, nem
 * com exemplo. Isso não é excesso de zelo: depoimento inventado é publicidade
 * enganosa (CDC, art. 37), e quando vai junto de estrela em dado estruturado
 * o Google trata como motivo de punição, não de destaque. Prova social falsa
 * também é a coisa que o cliente mais rápido percebe — e a que mais rápido
 * derruba a confiança no resto da página, inclusive no que é verdade.
 *
 * ┌─ COMO PREENCHER UMA AVALIAÇÃO ────────────────────────────────────────┐
 * │ 1. Cole o texto EXATAMENTE como o cliente escreveu. Não corrija a     │
 * │    gramática, não "melhore", não encurte. Texto retocado deixa de ser │
 * │    depoimento e vira anúncio seu com nome de outra pessoa.            │
 * │ 2. Nome: como a pessoa se identificou. "André B." está ótimo; nome    │
 * │    completo sem autorização, não.                                     │
 * │ 3. `compraVerificada` só quando existir pedido no sistema com esse    │
 * │    cliente. É uma afirmação sua, e alguém pode pedir pra comprovar.   │
 * │ 4. Foto de antes e depois exige autorização explícita da pessoa —     │
 * │    imagem de rosto é dado pessoal (LGPD), e "ela mandou no WhatsApp"  │
 * │    não é autorização pra publicar no site.                            │
 * └───────────────────────────────────────────────────────────────────────┘
 *
 * Exemplo de como fica preenchido (é só um exemplo, não um depoimento):
 *
 *   export const AVALIACOES: Avaliacao[] = [
 *     {
 *       nome: "André B.",
 *       nota: 5,
 *       texto: "Usei por 1 mês e não vi muita coisa, mais continuei e no " +
 *              "terceiro mês começou aparecer novos fios, valeu a paciência.",
 *       compraVerificada: true,
 *       produtoHandle: "fator-de-crescimento-para-barba",
 *     },
 *   ]
 *
 * ┌─ TRECHO DE ENTREVISTA NÃO É AVALIAÇÃO ────────────────────────────────┐
 * │ Na tela, o trecho aparece como é: "Entrevista com cliente", sem       │
 * │ nome, sem estrela e sem selo — e fica fora da nota média, do          │
 * │ "em N avaliações" e do dado estruturado do Google. Nome e estrela     │
 * │ diriam que uma pessoa identificada deu aquela nota ao produto, e      │
 * │ numa entrevista isso não aconteceu.                                   │
 * │                                                                       │
 * │ 1. O texto é o que a pessoa DISSE, sem retoque — a mesma regra da     │
 * │    avaliação. Frase escrita pela loja não é trecho, é anúncio.        │
 * │ 2. Um trecho entra uma vez, no produto de que ele fala. Repetir os    │
 * │    do Fator nos quatro kits dele fazia a mesma fala valer por cinco.  │
 * │ 3. Quem AVALIAR depois (o e-mail pedindo avaliação) entra em          │
 * │    `AVALIACOES`, com o nome e a nota que a própria pessoa deu.        │
 * └───────────────────────────────────────────────────────────────────────┘
 */

export type Avaliacao = {
  nome: string
  /** De 1 a 5, como a pessoa deu. */
  nota: 1 | 2 | 3 | 4 | 5
  /** O texto do cliente, sem edição. */
  texto: string
  /** Só marque quando existir o pedido no sistema. */
  compraVerificada?: boolean
  /** Handle do produto usado — a foto sai do catálogo. */
  produtoHandle?: string
}

/**
 * O que um cliente disse numa entrevista com a loja: um trecho, e não uma
 * avaliação — sem nome, sem nota e sem selo. Ver a última caixa lá em cima.
 */
export type Trecho = {
  /** O que o cliente disse, sem edição. */
  texto: string
  /** O produto de que o trecho fala — a foto sai do catálogo. */
  produtoHandle: string
}

/** O que a esteira da home e a seção de cada produto mostram: avaliação ou trecho. */
export type Depoimento = Avaliacao | Trecho

export type AntesEDepois = Avaliacao & {
  /** Uma frase curta que resume o depoimento, pra servir de título. */
  titulo: string
  local?: string
  /** Caminhos em `public/`. Sem as duas fotos, o depoimento não entra. */
  fotos: { antes: string; depois: string }
}

/** A esteira da home ("Nossos clientes nos amam") e a seção de cada produto. */
export const AVALIACOES: Avaliacao[] = []

const doProduto = (produtoHandle: string, textos: string[]): Trecho[] =>
  textos.map((texto) => ({ texto, produtoHandle }))

/**
 * Os trechos das entrevistas com clientes — ver a última caixa lá em cima.
 * Aparecem na esteira da home e na seção do produto de cada um.
 *
 * Vieram da PR #90, que os publicava como avaliação: com nome, nota e selo de
 * compra verificada, e os do Fator copiados nos quatro kits. Aqui entraram só
 * o texto e o produto. O exemplo do André B., na primeira caixa, estava na
 * lista dela e ficou de fora — é exemplo, não depoimento.
 */
export const TRECHOS: Trecho[] = [
  ...doProduto("fator-de-crescimento-para-barba", [
    "Estou usando faz umas 3 semanas e já achei que preencheu melhor algumas falhas.",
    "No começo achei que não ia fazer diferença, mas agora tô percebendo uns fiozinhos novos.",
    "Comecei a usar e gostei bastante. A barba parece estar ficando mais uniforme.",
    "Estou usando todo dia e já consigo perceber uma diferença boa nas áreas que eram mais falhadas.",
    "Demorou um pouco pra eu notar, mas agora já vejo bastante diferença. Vou continuar usando.",
    "Minha barba sempre teve algumas falhas e comecei a perceber uns fios novos depois de algumas semanas.",
    "Achei bem fácil de aplicar e não fica aquela sensação oleosa na barba.",
    "Estou no primeiro frasco ainda, mas já gostei bastante do resultado nas laterais.",
    "Comprei sem esperar muito e me surpreendeu. Principalmente onde tinha mais falha.",
    "Estou usando certinho todos os dias e já comecei a perceber alguns fios aparecendo.",
    "Gostei bastante da aplicação, seca rápido e não deixa a barba pesada.",
    "No meu caso comecei a perceber diferença depois de algumas semanas. Vou continuar usando.",
    "Minha barba era bem falhada de um lado, agora já tá começando a ficar mais uniforme.",
    "Já estou no segundo frasco. Gostei bastante da evolução até agora.",
    "Estou usando diariamente e percebi uma melhora boa principalmente nas falhas da lateral.",
    "Gostei bastante do produto, fácil de usar e não fica com aspecto oleoso.",
    "No começo não percebi muita coisa, mas depois de um tempo comecei a notar vários fiozinhos novos.",
    "Estou gostando bastante. A barba parece estar mais cheia e com menos espaços.",
    "Primeiro frasco ainda, mas já estou vendo uma evolução boa. Vou seguir usando.",
    "Curti bastante o produto. Na região que tinha mais falha já comecei a perceber alguns fios novos.",
  ]),
  ...doProduto("kit-completo-para-barba", [
    "Peguei o kit completo e gostei bastante. Minha barba fica bem mais cuidada no dia a dia.",
    "Eu tinha bastante coceira na barba, principalmente depois do banho. Comecei a cuidar melhor e senti uma diferença boa.",
    "O shampoo foi o que mais gostei. Minha barba ficava com bastante descamação e agora tá bem melhor.",
    "Curti muito o kit, principalmente o óleo e o balm. Deixa a barba bem mais macia.",
    "Minha barba costumava coçar bastante durante o dia. Depois que comecei a cuidar melhor da rotina, melhorou bastante.",
    "Gostei dos produtos, principalmente pq minha barba ficava muito ressecada e soltava umas casquinhas.",
    "Comprei o kit completo pra testar a linha toda e gostei. O shampoo entrou de vez na minha rotina.",
    "Eu tinha bastante caspa na barba e resolvi começar a cuidar melhor. Achei que melhorou bastante a aparência.",
    "Já usava o óleo e resolvi pegar o kit completo. A barba fica muito mais macia e fácil de cuidar.",
    "Minha barba vivia coçando e eu nem sabia que precisava ter uma rotina de cuidados. O kit ajudou bastante no dia a dia.",
    "Chegou tudo certinho. Gostei principalmente do shampoo, minha barba fica bem limpa sem ficar ressecada.",
    "O kit facilitou muito minha rotina. Antes tinha bastante descamação na barba, hoje percebo bem menos.",
    "Comecei a cuidar mais da barba e fez diferença. Principalmente na coceira que eu sentia.",
    "Gostei muito do acabamento, principalmente usando o óleo e depois o balm. A barba fica bem mais alinhada.",
    "Comprei meio na dúvida e gostei bastante. Minha barba era bem seca e às vezes coçava muito.",
    "A pomada matte virou minha favorita. Segura bem e não deixa aquele brilho exagerado.",
    "O kit chegou bem embalado e os produtos são muito bons. Estou usando praticamente todo dia.",
    "Eu tinha bastante descamação e minha barba ficava com aspecto seco. Com a rotina de cuidados melhorou bastante.",
    "Minha barba sempre ficava meio bagunçada e coçando. Agora tô cuidando certinho e gostei bastante da diferença.",
    "Pra quem quer começar a cuidar melhor da barba, gostei muito do kit. Tem produto pra montar uma rotina completa.",
  ]),
  ...doProduto("shampoo-para-barba", [
    "Gostei bastante do shampoo, limpa bem e não deixa a barba ressecada.",
    "Minha barba ficava coçando bastante, principalmente no calor. Com o shampoo achei que melhorou bastante.",
    "Eu tinha bastante descamação na barba e comecei a usar esse shampoo. A aparência melhorou muito.",
    "O cheiro é bem agradável e deixa a barba bem macia depois do banho.",
    "Gostei pq limpa bem sem deixar aquela sensação de barba seca.",
    "Minha barba vivia com umas casquinhas, comecei a usar o shampoo e percebi uma diferença boa.",
    "Uso umas 3 vezes por semana e gostei bastante. A barba fica limpa e leve.",
    "Eu não dava muita atenção pra shampoo de barba, mas depois que comecei a usar percebi bastante diferença.",
    "Minha barba é bem grossa e esse shampoo deixou ela bem mais macia.",
    "Tinha bastante coceira na região do queixo, principalmente depois de alguns dias sem lavar. Gostei bastante desse shampoo.",
    "Faz bastante espuma e rende bem. Um pouquinho já dá pra lavar a barba toda.",
    "Minha barba ficava muito seca depois de lavar, com esse aqui não tive esse problema.",
    "Depois de algumas lavagens já achei a barba com um aspecto bem melhor.",
    "Gostei bastante da textura e do cheiro. Deixa a barba limpa sem ficar áspera.",
    "Comecei a usar pq minha barba tava descamando bastante. Até agora estou gostando do resultado.",
    "Produto muito bom, principalmente pra quem deixa a barba maior. Ajuda bastante na rotina.",
    "Minha barba ficou bem mais macia depois que comecei a usar. Agora faz parte do banho.",
    "Eu tinha bastante coceira e ressecamento na barba. Com o uso frequente achei que melhorou bastante.",
    "Gostei bastante, limpa bem e não deixa aquele cheiro forte depois.",
    "Comprei pra testar e já gostei na primeira lavagem. A barba fica bem limpa e macia.",
  ]),
  ...doProduto("balm-para-barba", [
    "O que mais gostei foi que diminuiu bastante o frizz, minha barba fica bem mais alinhada.",
    "Minha barba ficava cheia de fio espetado, o balm ajudou bastante a deixar tudo no lugar.",
    "Curti muito pra modelar, consigo deixar a barba no formato que gosto sem ficar dura.",
    "Tenho bastante frizz na barba e esse balm ajudou demais no controle dos fios.",
    "Uso de manhã pra modelar e segura bem durante o dia. Não fica com aquele aspecto pesado.",
    "Minha barba é bem rebelde, principalmente nas laterais. Com o balm consigo deixar bem mais alinhada.",
    "Gostei pq controla os fios arrepiados sem deixar a barba dura igual algumas pomadas.",
    "Pra modelar a barba ficou muito bom. Passo pouco produto e já consigo ajeitar os fios.",
    "Minha barba tem bastante frizz e ficava toda bagunçada depois de algumas horas. Com o balm fica bem mais controlada.",
    "Comecei a usar pra controlar os fios rebeldes e gostei bastante do resultado.",
    "Gostei do acabamento, consigo modelar sem perder aquele aspecto natural da barba.",
    "Depois do banho minha barba ficava toda espetada, agora passo o balm e consigo modelar bem mais fácil.",
    "Um dos produtos que mais gostei. Ajuda no frizz e deixa os fios bem mais comportados.",
    "Uso junto com o óleo e depois modelo com o pente. Fica bem alinhada e sem aqueles fios voando.",
    "Tenho a barba grossa e difícil de controlar, o balm ajudou bastante na modelação.",
    "Não precisa passar muito. Um pouco já ajuda a controlar o frizz e deixar a barba no formato.",
    "Gostei pq consigo modelar a barba sem deixar ela com aparência artificial.",
    "Minha barba ficava muito arrepiada durante o dia. O balm segura bem os fios e diminui bastante o frizz.",
    "Pra quem gosta de barba mais alinhada, achei muito bom. Modela bem e não deixa os fios duros.",
    "Virou parte da minha rotina. Passo de manhã, modelo rapidinho e a barba fica bem mais organizada.",
  ]),
  ...doProduto("oleo-para-barba", [
    "Minha barba ficou bem mais macia depois que comecei a usar o óleo, principalmente nas pontas.",
    "Gostei bastante, não fica com aquele aspecto de barba encharcada e o cheiro é muito bom.",
    "Minha barba é bem seca e o óleo ajudou muito a deixar os fios mais macios.",
    "Uso depois do banho e percebo que a barba fica bem mais fácil de pentear.",
    "Curti bastante o acabamento, deixa um brilho leve sem parecer oleoso demais.",
    "Minha barba ficava muito áspera, principalmente nas pontas. Com o óleo melhorou bastante.",
    "O cheiro é muito bom e fica bem suave depois de um tempo. Gostei bastante.",
    "Comecei a usar todos os dias e minha barba tá bem mais macia e hidratada.",
    "Tenho a barba mais cheia e o óleo ajuda bastante a deixar os fios mais comportados.",
    "Gostei porque hidrata sem deixar aquela sensação pesada. Algumas gotas já são suficientes.",
    "Minha barba tava bem ressecada, principalmente no inverno. O óleo fez bastante diferença na rotina.",
    "Depois do banho passo algumas gotas e penteio. A barba fica muito mais alinhada.",
    "Gostei muito do resultado, deixa os fios macios e com uma aparência bem cuidada.",
    "Uso junto com o balm e fica uma combinação muito boa. O óleo deixa a barba bem hidratada.",
    "Tenho barba grossa e o óleo ajudou bastante com aqueles fios mais secos e rebeldes.",
    "Rende bastante, não precisa exagerar. Com poucas gotas já consigo passar na barba toda.",
    "Depois que comecei a usar senti a barba bem menos áspera e com um aspecto melhor.",
    "Curti bastante, principalmente pelo cheiro e pela maciez que deixa nos fios.",
    "Minha barba ficava com bastante frizz, o óleo ajuda a deixar os fios mais controlados.",
    "Virou parte da minha rotina. Passo depois do banho e a barba fica muito mais macia e fácil de cuidar.",
  ]),
  ...doProduto("pasta-modeladora-matte-80g-fucking-barba", [
    "Gostei bastante da fixação, consigo deixar o cabelo no formato que quero sem ficar brilhando.",
    "Era exatamente o que eu procurava, segura bem e deixa aquele aspecto natural.",
    "Curti muito o efeito matte, não fica com aparência de cabelo cheio de produto.",
    "Meu cabelo é bem difícil de modelar e essa pomada segurou muito bem.",
    "Gostei da fixação, principalmente nas laterais. O penteado fica no lugar por bastante tempo.",
    "O que mais gostei foi que não deixa brilho. Fica arrumado mas com aspecto natural.",
    "Uso todo dia pra modelar e funciona muito bem. Um pouco de produto já resolve.",
    "Tenho bastante fio arrepiado e a pomada controla bem sem deixar o cabelo duro.",
    "Curti bastante o acabamento matte, fica bem discreto e segura o penteado durante o dia.",
    "Meu cabelo nunca ficava no lugar por muito tempo, com essa pomada consigo manter o formato bem melhor.",
    "Gostei bastante da textura, espalha fácil e não deixa aquela sensação pesada.",
    "Pra modelar o cabelo é muito boa. Consigo definir o penteado sem deixar com cara de molhado.",
    "A fixação me surpreendeu. Passei de manhã e o cabelo continuou bem alinhado durante o dia.",
    "Uso quando quero um penteado mais arrumado, mas sem aquele brilho de pomada tradicional.",
    "Tenho bastante cabelo e precisava de algo que segurasse bem. Essa pomada resolveu.",
    "Não precisa passar muito, uma quantidade pequena já dá uma boa modelada.",
    "Gostei principalmente porque segura sem deixar o cabelo duro. Fica bem natural.",
    "O efeito matte é muito bom, não curto produto que deixa o cabelo brilhando demais.",
    "Meu cabelo tem bastante frizz e a pomada ajuda muito a deixar os fios no lugar.",
    "Virou meu produto pra finalizar o cabelo. Modelo rápido e fica com um acabamento bem natural.",
  ]),
  ...doProduto("pasta-modeladora-brilho-80g-fucking-barba", [
    "Gostei bastante, deixa aquele aspecto molhado que eu curto e segura bem o penteado.",
    "O efeito molhado fica muito bom, principalmente quando quero deixar o cabelo mais alinhado.",
    "Curti demais o acabamento, fica com bastante brilho e aquele visual de cabelo molhado.",
    "Era exatamente o que eu procurava. Deixa o cabelo com aspecto molhado e bem modelado.",
    "Gostei da fixação e principalmente do efeito molhado, fica bem diferente da pomada matte.",
    "Meu cabelo fica com aspecto mais alinhado e com aquele brilho de molhado que eu gosto.",
    "Uso quando quero um visual mais arrumado. O efeito molhado deixa o penteado bem destacado.",
    "Curti bastante, espalha fácil e deixa aquele aspecto molhado sem precisar exagerar na quantidade.",
    "Tenho bastante cabelo e gostei muito do resultado. Fica bem alinhado e com efeito molhado.",
    "Pra sair à noite é a que eu mais uso. Deixa aquele visual molhado e bem alinhado.",
    "O brilho é bem forte e o aspecto molhado fica muito bom no cabelo.",
    "Meu cabelo fica muito mais arrumado usando essa pomada. O efeito molhado dá um acabamento muito bom.",
    "Gostei bastante da fixação, segura os fios e mantém o aspecto molhado por bastante tempo.",
    "Eu gosto de cabelo com aquele visual molhado e essa pomada entrega exatamente isso.",
    "Tenho bastante fio rebelde e a pomada controla bem. O efeito molhado deixa o resultado ainda melhor.",
    "Não precisa passar muito produto, com pouco já consigo modelar e deixar o aspecto molhado.",
    "Pra quem gosta de brilho e efeito molhado, gostei bastante. Deixa o cabelo bem destacado.",
    "O que mais gostei foi justamente o aspecto molhado. Fica aquele visual de cabelo recém arrumado.",
    "Meu cabelo fica bem mais alinhado e com um brilho forte, o efeito molhado ficou muito bom.",
    "Virou minha favorita pra quando quero um visual diferente. Fica bem modelado, brilhando e com aspecto molhado.",
  ]),
  ...doProduto("spray-modelador-matte-100ml-fucking-barba", [
    "Gostei bastante do spray, deixa o cabelo no lugar sem ficar com aquele brilho de gel.",
    "Muito prático pra usar no dia a dia. Borrifo, modelo com a mão e já fica do jeito que gosto.",
    "Curti o efeito matte, deixa o cabelo com textura e aspecto bem natural.",
    "Meu cabelo é bem liso e difícil de dar volume, o spray ajudou bastante nisso.",
    "O que mais gostei foi que não deixa aspecto molhado. Fica bem seco e natural.",
    "Uso antes de sair e segura bem o penteado durante o dia. Bem prático.",
    "Gostei bastante da textura que deixa no cabelo, dá mais volume sem pesar.",
    "Pra quem não gosta de produto com brilho, esse spray é muito bom. O acabamento fica bem matte.",
    "Meu cabelo perde o formato rápido, com o spray consigo deixar o penteado no lugar por muito mais tempo.",
    "Achei muito fácil de aplicar e seca rápido. Depois é só modelar com a mão.",
    "Gostei da fixação, principalmente porque não deixa o cabelo com aparência dura.",
    "Uso pra dar textura depois do banho. O acabamento matte ficou muito bom.",
    "Meu cabelo ficou com mais volume e textura usando o spray, gostei bastante.",
    "Curti porque consigo passar uma camada e, se precisar, reforçar depois sem pesar.",
    "Tenho bastante cabelo e gosto de deixar mais bagunçado. O spray ajuda muito na modelação.",
    "Muito mais rápido de usar que pomada. Borrifo, modelo e pronto.",
    "O efeito seco é o diferencial pra mim. Não gosto quando o cabelo fica com aparência molhada.",
    "Gostei bastante da fixação e do acabamento. O cabelo fica arrumado mas continua natural.",
    "Uso quando quero mais volume e textura. Dá uma diferença boa sem deixar o cabelo brilhando.",
    "Virou meu favorito pra finalizar o cabelo. É rápido, não pesa e deixa aquele acabamento matte que eu gosto.",
  ]),
]

/** O carrossel de antes e depois ("Resultados reais"). */
export const ANTES_E_DEPOIS: AntesEDepois[] = []

/**
 * A nota média que a esteira exibe. Calculada das avaliações que existem
 * aqui — e só delas: trecho de entrevista não tem nota. Não é "a nota da
 * loja": é a média do que está publicado, que é a única coisa que dá pra
 * provar olhando a própria página.
 */
export function notaMedia(avaliacoes: Avaliacao[]): number | null {
  if (!avaliacoes.length) return null
  const soma = avaliacoes.reduce((t, a) => t + a.nota, 0)
  return soma / avaliacoes.length
}
