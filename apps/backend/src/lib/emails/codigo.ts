import type { Email } from "../email"

/**
 * O E-MAIL DO CÓDIGO DE ACESSO.
 *
 * O código vai NO ASSUNTO: aparece na notificação do celular e na lista da
 * caixa de entrada, e a pessoa digita sem abrir nada. É o que o "preencher
 * código do e-mail" do iPhone também lê.
 *
 * SEM LINK NENHUM, de propósito. E-mail de acesso com botão "clique aqui" é
 * exatamente o que golpe imita — o nosso só pede pra digitar seis números na
 * tela que a pessoa já tem aberta. E não depende do domínio da loja estar no
 * ar pra funcionar.
 *
 * HTML de e-mail é HTML de 2005: tabela, estilo em linha e nada de SVG (o
 * Gmail tira). A marca aparece em texto, nas cores dela; a fonte cai pra
 * Arial, que é a que todo leitor de e-mail tem.
 */
export function emailDoCodigo({
  para,
  codigo,
  minutos,
}: {
  para: string
  codigo: string
  minutos: number
}): Email {
  const assunto = `${codigo} é o seu código da FuckingBarba`
  const aviso = `Vale por ${minutos} minutos e só funciona uma vez.`
  const naoPediu = "Não pediu? Pode ignorar este e-mail: sem o código, ninguém entra na sua conta."

  const texto = [
    "FuckingBarba",
    "",
    `Seu código de acesso: ${codigo}`,
    "",
    "Digite na tela da loja pra entrar na sua conta.",
    aviso,
    "",
    naoPediu,
  ].join("\n")

  const html = `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${assunto}</title></head>
<body style="margin:0;padding:0;background:#f2f3f4;">
<div style="display:none;max-height:0;overflow:hidden;">${aviso} ${naoPediu}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f2f3f4;">
  <tr><td align="center" style="padding:28px 12px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;background:#ffffff;border:2px solid #12181f;">
      <tr><td style="background:#12181f;padding:18px 26px;font:italic 800 18px/1.2 Arial,Helvetica,sans-serif;letter-spacing:0.04em;text-transform:uppercase;color:#ffffff;">
        Fucking<span style="color:#ffd84d;">Barba</span>
      </td></tr>
      <tr><td style="padding:28px 26px 30px;font:400 15px/1.55 Arial,Helvetica,sans-serif;color:#12181f;">
        <p style="margin:0 0 6px;font:italic 800 20px/1.2 Arial,Helvetica,sans-serif;text-transform:uppercase;">Seu código de acesso</p>
        <p style="margin:0 0 20px;color:#566072;">Digite na tela da loja pra entrar na sua conta.</p>
        <p style="margin:0 0 20px;padding:18px 10px;background:#fff3c4;border:2px dashed #12181f;text-align:center;font:800 34px/1 'Courier New',Courier,monospace;letter-spacing:0.3em;color:#12181f;">${codigo}</p>
        <p style="margin:0 0 8px;font-size:13px;font-weight:700;">${aviso}</p>
        <p style="margin:0;font-size:13px;color:#566072;">${naoPediu}</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`

  return { para, assunto, html, texto }
}
