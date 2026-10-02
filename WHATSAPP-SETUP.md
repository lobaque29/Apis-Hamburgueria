# Configurar envio automático pelo WhatsApp

O site envia os pedidos para `POST /pedidos/whatsapp`. O servidor encaminha a mensagem pela WhatsApp Cloud API; o token de acesso nunca deve ser colocado no HTML ou enviado ao navegador.

## 1. Configurar o app e o número na Meta

No Meta for Developers, abra ou crie um app empresarial, adicione o produto WhatsApp e siga o fluxo de configuração da Cloud API. Vincule o número de WhatsApp Business que será usado como remetente e conclua as verificações solicitadas pela Meta.

O número que recebe os pedidos é configurado separadamente em `WHATSAPP_ORDER_RECIPIENT`. Use um número autorizado/permitido pelo ambiente Meta em uso. Em produção, confirme as regras de opt-in e mensagens de negócio da Meta para a conta.

Para testar com o remetente de teste, adicione o destinatário na lista de números de teste da Etapa 1. Selecione o país correto, confira o número exibido antes de avançar e conclua a verificação diretamente na Meta. O destinatário usado pela API deve estar autorizado nessa lista.

## 2. Criar e aprovar o template

No WhatsApp Manager, crie um template com o nome `novo_pedido`, idioma `Português (Brasil)` (`pt_BR`) e categoria adequada à finalidade, e envie-o para aprovação. No corpo, use este texto, mantendo as cinco variáveis nesta ordem:

```text
Novo pedido recebido na Brasa & Pão.
Cliente: {{1}}
Telefone: {{2}}
Endereço de entrega: {{3}}
Itens: {{4}}
Total: {{5}}
```

O template precisa ter exatamente cinco variáveis de texto no corpo. Se escolher outro nome ou idioma, configure `WHATSAPP_ORDER_TEMPLATE_NAME` e `WHATSAPP_ORDER_TEMPLATE_LANGUAGE` de acordo com o template aprovado.

## 3. Configurar as variáveis no servidor

Copie `.env.example` para `.env` e preencha os valores a partir do painel da Meta. A API carrega `.env` automaticamente usando o suporte nativo do Node.js (Node 20.12 ou superior). Em produção, prefira configurar as variáveis como secrets no serviço de hospedagem:

- `WHATSAPP_ACCESS_TOKEN`: token de acesso da Cloud API. Trate como segredo e use um token de sistema adequado para produção.
- `WHATSAPP_PHONE_NUMBER_ID`: ID do número remetente exibido na configuração da API.
- `WHATSAPP_ORDER_RECIPIENT`: telefone que recebe os pedidos, com código do país e apenas dígitos.
- `WHATSAPP_ORDER_TEMPLATE_NAME`: nome exato do template aprovado.
- `WHATSAPP_ORDER_TEMPLATE_LANGUAGE`: idioma configurado no template.
- `WHATSAPP_API_VERSION`: versão Graph API suportada pelo app Meta.
- `MONGO_URI`: conexão do banco usado pela API.

Variáveis definidas diretamente no ambiente do processo têm precedência sobre valores em `.env`. Não comite `.env`, token, nem outros segredos.

## 4. Executar e testar

Com MongoDB disponível e as variáveis definidas no ambiente:

```bash
npm test
node Api.js
```

Abra `http://localhost:3000`, faça um pedido de teste e confirme que o servidor retorna a confirmação de envio e que o destinatário recebe a mensagem. A suíte automatizada simula a resposta da Meta; ela não substitui o teste real com credenciais e template aprovados.

Para produção, publique a aplicação atrás de HTTPS, defina as variáveis como secrets do serviço de hospedagem e monitore os logs de falhas de envio.

## Solução de problemas

- `Recipient phone number not in allowed list` (`131030`): no modo de teste, adicione e verifique o destinatário na lista de números de teste do app. O número também precisa estar selecionado como destinatário autorizado na Meta.
- `Template name does not exist in the translation` (`132001`): confirme que o nome e o idioma configurados correspondem a um template aprovado para a conta remetente.
- Erro de parâmetros (`132000`): o corpo do template aprovado deve ter cinco variáveis de texto, na mesma ordem definida acima.
