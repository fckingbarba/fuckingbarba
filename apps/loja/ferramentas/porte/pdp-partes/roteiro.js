
<script>
/* ============================================================
   PDP — GALERIA
   Miniatura troca a foto grande; a foto grande abre o zoom.
   O zoom é <dialog>: foco preso, Esc fecha, nada de biblioteca.
   ============================================================ */
(function () {
  var raiz  = document.querySelector('[data-galeria]');
  if (!raiz) return;

  var palco = raiz.querySelector('[data-galeria-palco]');
  var foto  = palco && palco.querySelector('img');
  var minis = [].slice.call(raiz.querySelectorAll('.galeria__mini'));
  var zoom  = raiz.querySelector('[data-galeria-zoom]');
  var zFoto = zoom && zoom.querySelector('img');
  var zSai  = zoom && zoom.querySelector('[data-galeria-zoom-fecha]');

  if (!palco || !foto) return;

  // produto com uma foto só não mostra fita de miniatura: uma miniatura
  // sozinha embaixo da foto grande parece defeito
  var fita = raiz.querySelector('[data-galeria-minis]');
  if (fita && minis.length < 2) fita.hidden = true;

  function mostra(botao) {
    var url = botao.getAttribute('data-foto');
    if (!url || url === foto.getAttribute('src')) return;
    foto.src = url;
    minis.forEach(function (m) {
      if (m === botao) m.setAttribute('aria-current', 'true');
      else m.removeAttribute('aria-current');
    });
  }

  minis.forEach(function (m) {
    m.addEventListener('click', function () { mostra(m); });
    // seta esquerda/direita anda na fita de miniaturas
    m.addEventListener('keydown', function (e) {
      var i = minis.indexOf(m);
      var alvo = e.key === 'ArrowRight' ? minis[i + 1]
               : e.key === 'ArrowLeft'  ? minis[i - 1] : null;
      if (!alvo) return;
      e.preventDefault();
      alvo.focus();
      mostra(alvo);
    });
  });

  if (zoom && zFoto && typeof zoom.showModal === 'function') {
    palco.addEventListener('click', function () {
      zFoto.src = foto.getAttribute('src');
      zoom.showModal();
    });
    if (zSai) zSai.addEventListener('click', function () { zoom.close(); });
    // clique fora da foto fecha. O <dialog> recebe o clique do ::backdrop
    // nele mesmo, então basta checar se o alvo foi o próprio dialog.
    zoom.addEventListener('click', function (e) { if (e.target === zoom) zoom.close(); });
  } else if (palco) {
    // navegador sem <dialog>: o palco deixa de fingir que amplia
    palco.style.cursor = 'default';
    var lupa = palco.querySelector('.galeria__lupa');
    if (lupa) lupa.hidden = true;
  }
})();
</script>

<script>
/* ============================================================
   PDP — PREÇO, KIT E QUANTIDADE

   Uma função só (`pinta`) desenha TUDO que depende da escolha:
   preço grande, parcela, botão da dobra, barra fixa, a linha do
   Fator dentro da rotina e o <meta itemprop="price"> do schema.

   Foi de propósito: preço em ecommerce aparece em cinco lugares,
   e é assim que a barra fixa acaba mostrando um número e o botão
   cobrando outro.
   ============================================================ */
(function () {
  var kits = document.querySelector('[data-kits]');
  if (!kits) return;

  var FRASCO_CHEIO = 133.20;   // preço cheio de 1 frasco, pro riscado

  var campo   = document.querySelector('[data-qtd-campo]');
  var menos   = document.querySelector('[data-qtd="-"]');
  var mais    = document.querySelector('[data-qtd="+"]');
  var botao   = document.querySelector('[data-pdp-comprar]');
  var grande  = document.querySelector('[data-preco-grande]');
  var parcela = document.querySelector('[data-parcela]');
  var schema  = document.querySelector('[data-preco-schema]');
  var bBarra  = document.querySelector('[data-barra-comprar]');
  var pBarra  = document.querySelector('[data-barra-preco]');

  function brl(n) {
    return 'R$ ' + n.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  function escolhido() {
    return kits.querySelector('input[name="kit"]:checked');
  }

  function pinta() {
    var k = escolhido();
    if (!k) return;

    var preco  = parseFloat(k.getAttribute('data-preco'));
    var frascos = parseInt(k.getAttribute('data-unidades'), 10) || 1;
    var nome   = k.getAttribute('data-nome');
    var id     = k.getAttribute('data-id');
    var cheio  = FRASCO_CHEIO * frascos;

    if (grande)  grande.textContent = brl(preco);
    if (schema)  schema.setAttribute('content', preco.toFixed(2));
    if (parcela) parcela.textContent = '3x de ' + brl(preco / 3);

    [botao, bBarra].forEach(function (b) {
      if (!b) return;
      b.setAttribute('data-produto-id', id);
      b.setAttribute('data-produto-nome', nome);
      b.setAttribute('data-produto-preco', preco.toFixed(2));
    });

    if (pBarra) pBarra.innerHTML = brl(preco) + ' <s>' + brl(cheio) + '</s>';

    // a rotina passa a somar o kit escolhido, senão a página se
    // contradiz: 3 frascos aqui em cima e R$ 79,90 lá embaixo
    var fixo = document.querySelector('[data-rotina-item][data-fixo]');
    if (fixo) {
      fixo.setAttribute('data-preco', preco.toFixed(2));
      fixo.setAttribute('data-cheio', cheio.toFixed(2));
      fixo.setAttribute('data-nome', nome);
      fixo.setAttribute('data-id', id);
      var linha = fixo.closest('.rotina__item');
      var rNome = linha && linha.querySelector('.rotina__nome');
      var rPreco = linha && linha.querySelector('.rotina__preco');
      if (rNome) rNome.textContent = frascos === 1
        ? 'Fator de Crescimento 30 ml'
        : 'Fator de Crescimento — ' + frascos + ' frascos';
      if (rPreco) rPreco.innerHTML = brl(preco) + ' <s>' + brl(cheio) + '</s>';
      fixo.dispatchEvent(new CustomEvent('rotina:mudou', { bubbles: true }));
    }
  }

  kits.addEventListener('change', pinta);

  /* ---------- quantidade ---------- */
  function qtd() {
    var n = parseInt(campo && campo.value, 10);
    return (!n || n < 1) ? 1 : Math.min(n, 10);
  }

  function ajusta(n) {
    if (!campo) return;
    campo.value = Math.max(1, Math.min(10, n));
    if (menos) menos.disabled = campo.value <= 1;
    if (mais)  mais.disabled  = campo.value >= 10;
  }

  if (menos) menos.addEventListener('click', function () { ajusta(qtd() - 1); });
  if (mais)  mais.addEventListener('click',  function () { ajusta(qtd() + 1); });
  if (campo) campo.addEventListener('change', function () { ajusta(qtd()); });

  /* O carrinho da carcaça adiciona 1 por clique. Aqui a gente completa
     o resto da quantidade. Este ouvinte é registrado DEPOIS do script do
     carrinho (ordem dos <script> no arquivo), então ele roda depois que
     a primeira unidade já entrou. */
  document.addEventListener('produto:comprar', function (e) {
    var b = e.detail && e.detail.botao;
    if (!b || !b.hasAttribute('data-pdp-comprar')) return;

    var faltam = qtd() - 1;
    if (faltam < 1) return;

    var carrinho = window.FuckingBarba && window.FuckingBarba.carrinho;
    if (!carrinho) return;
    for (var i = 0; i < faltam; i++) {
      carrinho.adicionar({
        id:     b.getAttribute('data-produto-id'),
        nome:   b.getAttribute('data-produto-nome'),
        preco:  parseFloat(b.getAttribute('data-produto-preco')),
        imagem: b.getAttribute('data-produto-imagem'),
        url:    '#'
      });
    }
  });

  ajusta(1);
  pinta();
})();
</script>

<script>
/* ============================================================
   PDP — FRETE NA PÁGINA

   Chama FuckingBarba.carrinho.calcularFrete(cep), a MESMA função
   que a gaveta da sacola usa. Quando o Frenet entrar no lugar da
   simulação, é um ponto só de troca — e não tem como a página
   dizer um prazo e o carrinho dizer outro.
   ============================================================ */
(function () {
  var caixa = document.querySelector('[data-frete]');
  if (!caixa) return;

  var form  = caixa.querySelector('[data-frete-form]');
  var campo = caixa.querySelector('[data-frete-cep]');
  var botao = caixa.querySelector('[data-frete-botao]');
  var erro  = caixa.querySelector('[data-frete-erro]');
  var lista = caixa.querySelector('[data-frete-opcoes]');

  if (!form || !campo || !lista) return;

  var LIVRE_ACIMA = 149.90;

  function brl(n) {
    return 'R$ ' + n.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  function mascara(v) {
    v = String(v).replace(/\D/g, '').slice(0, 8);
    return v.length > 5 ? v.slice(0, 5) + '-' + v.slice(5) : v;
  }

  function escapa(t) {
    return String(t).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function prazoTexto(o) {
    if (o.prazo) return o.prazo;
    if (!o.dias) return '';
    if (o.dias[1] === 0) return 'Chega hoje, pedindo até 12h';
    if (o.dias[0] === o.dias[1]) return 'Chega em ' + o.dias[0] + (o.dias[0] === 1 ? ' dia útil' : ' dias úteis');
    return 'Chega em ' + o.dias[0] + ' a ' + o.dias[1] + ' dias úteis';
  }

  /* O preço desta página é o que está escolhido agora no seletor de kit. */
  function valorAtual() {
    var k = document.querySelector('input[name="kit"]:checked');
    var q = parseInt((document.querySelector('[data-qtd-campo]') || {}).value, 10) || 1;
    return k ? parseFloat(k.getAttribute('data-preco')) * q : 0;
  }

  campo.addEventListener('input', function () {
    campo.value = mascara(campo.value);
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var cep = campo.value.replace(/\D/g, '');

    if (cep.length !== 8) {
      erro.hidden = false;
      erro.textContent = 'Digite os 8 números do CEP.';
      campo.focus();
      return;
    }

    erro.hidden = true;
    botao.setAttribute('aria-busy', 'true');
    botao.textContent = 'Calculando';

    var fn = (window.FuckingBarba && window.FuckingBarba.carrinho
              && window.FuckingBarba.carrinho.calcularFrete);

    if (!fn) {
      botao.removeAttribute('aria-busy');
      botao.textContent = 'Calcular';
      erro.hidden = false;
      erro.textContent = 'Não consegui calcular agora. Tenta de novo em instantes.';
      return;
    }

    Promise.resolve(fn(cep, [])).then(function (ops) {
      botao.removeAttribute('aria-busy');
      botao.textContent = 'Recalcular';

      ops = ops || [];
      if (!ops.length) {
        erro.hidden = false;
        erro.textContent = 'Não entregamos nesse CEP por enquanto.';
        lista.hidden = true;
        return;
      }

      /* Frete grátis só vale pra opção mais barata, e só se o valor
         DESTA página já passar da régua. Mostrar "grátis" antes disso
         é a promessa que quebra no checkout. */
      var passou = valorAtual() >= LIVRE_ACIMA;
      var barata = ops.reduce(function (m, o) { return (!m || o.preco < m.preco) ? o : m; }, null);

      lista.hidden = false;
      lista.innerHTML = ops.map(function (o) {
        var gratis = passou && barata && o.id === barata.id;
        return '<li>' +
          '<span><span class="compra__frete-nome">' + escapa(o.nome) + '</span>' +
          '<span class="compra__frete-prazo">' + escapa(prazoTexto(o)) + '</span></span>' +
          '<span class="compra__frete-preco"' + (gratis ? ' data-gratis' : '') + '>' +
            (gratis ? 'Grátis<s>' + brl(o.preco) + '</s>' : brl(o.preco)) +
          '</span></li>';
      }).join('');

      if (!passou) {
        var falta = LIVRE_ACIMA - valorAtual();
        lista.insertAdjacentHTML('beforeend',
          '<li style="border-top-width:3px"><span class="compra__frete-nome">' +
          'Faltam ' + brl(falta) + ' pro frete grátis</span></li>');
      }

      // o CEP também vale pra sacola: quem já digitou aqui não digita de novo
      var c = window.FuckingBarba && window.FuckingBarba.carrinho;
      if (c && c.definirCep) { try { c.definirCep(cep); } catch (x) {} }
    }).catch(function () {
      botao.removeAttribute('aria-busy');
      botao.textContent = 'Calcular';
      erro.hidden = false;
      erro.textContent = 'Não consegui calcular agora. Tenta de novo em instantes.';
    });
  });
})();
</script>

<script>
/* ============================================================
   PDP — ROTINA
   Soma o que está marcado e move a barra do frete grátis.
   A régua é a mesma da sacola (R$ 149,90): se os dois números
   divergirem um dia, é porque alguém mudou num lugar só.
   ============================================================ */
(function () {
  var raiz = document.querySelector('[data-rotina]');
  if (!raiz) return;

  var LIVRE_ACIMA = 149.90;

  var itens  = [].slice.call(raiz.querySelectorAll('[data-rotina-item]'));
  var quanto = raiz.querySelector('[data-rotina-quantos]');
  var valor  = raiz.querySelector('[data-rotina-valor]');
  var cheio  = raiz.querySelector('[data-rotina-cheio]');
  var frete  = raiz.querySelector('[data-rotina-frete]');
  var fTexto = raiz.querySelector('[data-rotina-frete-texto]');
  var barra  = raiz.querySelector('[data-rotina-barra]');
  var compra = raiz.querySelector('[data-rotina-comprar]');

  function brl(n) {
    return 'R$ ' + n.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  // o produto da página não desmarca: ele é o motivo da rotina existir
  itens.forEach(function (i) {
    if (i.hasAttribute('data-fixo')) {
      i.addEventListener('click', function (e) { e.preventDefault(); });
    }
  });

  function marcados() {
    return itens.filter(function (i) { return i.checked; });
  }

  function soma() {
    var sel = marcados();
    var total = 0, total_cheio = 0;

    sel.forEach(function (i) {
      total += parseFloat(i.getAttribute('data-preco')) || 0;
      total_cheio += parseFloat(i.getAttribute('data-cheio')) || 0;
    });

    if (quanto) quanto.textContent = sel.length + (sel.length === 1 ? ' item' : ' itens');
    if (valor)  valor.textContent = brl(total);
    if (cheio)  {
      cheio.textContent = brl(total_cheio);
      cheio.hidden = total_cheio <= total;
    }

    var falta = LIVRE_ACIMA - total;
    var pct = Math.max(0, Math.min(100, (total / LIVRE_ACIMA) * 100));

    if (barra) {
      barra.style.width = pct + '%';
      if (falta <= 0) barra.setAttribute('data-gratis', '');
      else barra.removeAttribute('data-gratis');
    }

    if (frete && fTexto) {
      if (falta <= 0) {
        frete.setAttribute('data-gratis', '');
        fTexto.innerHTML = '<b>Frete grátis liberado.</b>';
      } else {
        frete.removeAttribute('data-gratis');
        fTexto.innerHTML = 'Faltam <b>' + brl(falta) + '</b> pro frete grátis';
      }
    }

    // o texto do botão conta quantos vão: "Levar os 3" é mais claro
    // que "Levar a rotina" quando ele desmarcou dois
    if (compra && compra.firstChild && compra.firstChild.nodeType === 3) {
      compra.firstChild.nodeValue = sel.length > 1
        ? ' Levar os ' + sel.length + ' '
        : ' Levar só este ';
    }
  }

  itens.forEach(function (i) { i.addEventListener('change', soma); });
  // o seletor de kit lá em cima muda o preço do item fixo
  raiz.addEventListener('rotina:mudou', soma);

  if (compra) {
    compra.addEventListener('click', function (e) {
      var carrinho = window.FuckingBarba && window.FuckingBarba.carrinho;
      if (!carrinho) return;
      e.preventDefault();

      marcados().forEach(function (i) {
        carrinho.adicionar({
          id:     i.getAttribute('data-id'),
          nome:   i.getAttribute('data-nome'),
          preco:  parseFloat(i.getAttribute('data-preco')),
          imagem: i.getAttribute('data-imagem'),
          url:    '#'
        });
      });

      // com vários itens de uma vez, abrir a sacola é mais claro que
      // a animação de voo: o cliente confere o que entrou
      if (carrinho.abrir) carrinho.abrir();
    });
  }

  soma();
})();
</script>

<script>
/* ============================================================
   PDP — BARRA DE COMPRA FIXA
   Aparece quando o botão da dobra sai de vista. Enquanto está
   fora, fica com visibility:hidden — não entra no Tab nem no
   leitor de tela.
   ============================================================ */
(function () {
  var barra = document.querySelector('[data-barra]');
  var alvo  = document.querySelector('[data-pdp-comprar]');
  if (!barra || !alvo || !('IntersectionObserver' in window)) return;

  barra.hidden = false;   // a visibilidade fica no CSS, com transição

  new IntersectionObserver(function (entradas) {
    // fora de vista E a página já rolou pra baixo: senão a barra
    // aparece no carregamento, antes do cliente ver o botão de cima
    var e = entradas[0];
    var passou = !e.isIntersecting && e.boundingClientRect.top < 0;
    barra.classList.toggle('e-visivel', passou);
  }, { threshold: 0 }).observe(alvo);
})();
</script>

<script>
/* ============================================================
   PDP — ESTOQUE
   O aviso de "últimas unidades" só existe se o número for o
   estoque de verdade. Na loja real quem chama isto é o servidor,
   com inventory_quantity do Medusa.

   Pra ver funcionando no protótipo, abra o console e rode:
       FuckingBarba.pdp.definirEstoque(3)
       FuckingBarba.pdp.definirEstoque(40)   // some sozinho
   ============================================================ */
(function () {
  var aviso = document.querySelector('[data-estoque]');
  if (!aviso) return;
  var texto = aviso.querySelector('span');

  var MOSTRA_ABAIXO_DE = 6;

  window.FuckingBarba = window.FuckingBarba || {};
  window.FuckingBarba.pdp = window.FuckingBarba.pdp || {};
  window.FuckingBarba.pdp.definirEstoque = function (n) {
    n = parseInt(n, 10);
    if (!n || n <= 0) {
      aviso.hidden = false;
      texto.textContent = 'Sem estoque no momento.';
      return;
    }
    if (n >= MOSTRA_ABAIXO_DE) { aviso.hidden = true; return; }
    aviso.hidden = false;
    texto.textContent = n === 1
      ? 'Última unidade em estoque.'
      : 'Restam ' + n + ' unidades em estoque.';
  };
})();
</script>

<script>
/* ============================================================
   PDP — VÍDEOS

   Mesmo <dialog> da galeria: foco preso, Esc fecha, sem
   biblioteca. O src só é atribuído na hora de abrir e é limpo
   ao fechar — assim a página não baixa quatro vídeos que
   ninguém pediu, e o som não continua tocando atrás do modal
   quando o cliente fecha no meio.
   ============================================================ */
(function () {
  var raiz = document.querySelector('[data-videos]');
  if (!raiz) return;

  var tela  = raiz.querySelector('[data-videos-tela]');
  var video = tela && tela.querySelector('video');
  var sai   = tela && tela.querySelector('[data-videos-fecha]');

  if (!tela || !video || typeof tela.showModal !== 'function') {
    // navegador sem <dialog>: os cartazes deixam de fingir que abrem
    [].forEach.call(raiz.querySelectorAll('.videos__item'), function (b) {
      b.disabled = true;
    });
    return;
  }

  function fechar() {
    video.pause();
    video.removeAttribute('src');
    video.load();          // solta o buffer; sem isto o Chrome segura o arquivo
    if (tela.open) tela.close();
  }

  raiz.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.videos__item');
    if (!b || b.disabled) return;
    var src = b.getAttribute('data-video');
    if (!src) return;
    video.src = src;
    tela.showModal();
    var p = video.play();
    // autoplay com som bloqueado não é erro: o controle está à vista
    if (p && p.catch) p.catch(function () {});
  });

  if (sai) sai.addEventListener('click', fechar);
  tela.addEventListener('click', function (e) { if (e.target === tela) fechar(); });
  tela.addEventListener('close', fechar);
})();
</script>
