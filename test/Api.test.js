const assert = require('node:assert/strict');
const http = require('node:http');
const { after, before, test } = require('node:test');
const { app, Cardapio, Pedido } = require('../Api');

let server;
let baseUrl;

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
});

async function request(path, options) {
  return new Promise((resolve, reject) => {
    const outgoing = http.request(new URL(path, baseUrl), {
      method: options?.method || 'GET',
      headers: options?.headers
    }, (incoming) => {
      const chunks = [];
      incoming.on('data', (chunk) => chunks.push(chunk));
      incoming.on('end', () => {
        const body = Buffer.concat(chunks).toString();
        resolve({
          status: incoming.statusCode,
          json: async () => JSON.parse(body),
          text: async () => body
        });
      });
    });

    outgoing.on('error', reject);
    outgoing.end(options?.body);
  });
}

function json(body) {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  };
}

test('GET / serve a página do cardápio', async () => {
  const response = await request('/');
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /id="menu-list"/);
  assert.match(html, /id="order-form"/);
});

test('GET /cardapio lista os itens', async (context) => {
  const itens = [{ _id: 'item-1', nome: 'Brasa Clássico', preco: 29.9 }];
  context.mock.method(Cardapio, 'find', async () => itens);

  const response = await request('/cardapio');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), itens);
});

test('GET /cardapio retorna 500 quando a consulta falha', async (context) => {
  context.mock.method(Cardapio, 'find', async () => {
    throw new Error('Falha de consulta');
  });

  const response = await request('/cardapio');
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { erro: 'Falha de consulta' });
});

test('POST /cardapio cria um item válido', async (context) => {
  context.mock.method(Cardapio.prototype, 'save', async function save() {
    return this;
  });

  const response = await request('/cardapio', json({
    nome: 'Brasa Clássico',
    preco: 29.9,
    categoria: 'Clássico'
  }));
  const item = await response.json();

  assert.equal(response.status, 201);
  assert.equal(item.nome, 'Brasa Clássico');
  assert.equal(item.preco, 29.9);
  assert.equal(item.disponivel, true);
});

test('POST /cardapio rejeita dados inválidos', async () => {
  const response = await request('/cardapio', json({
    nome: '',
    preco: -1,
    categoria: ''
  }));

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { erro: 'Dados do cardápio inválidos' });
});

test('PUT /cardapio/:id atualiza um item', async (context) => {
  const item = { _id: 'item-1', nome: 'Burger atualizado' };
  const update = context.mock.method(Cardapio, 'findByIdAndUpdate', async () => item);

  const response = await request('/cardapio/item-1', {
    ...json({ nome: 'Burger atualizado' }),
    method: 'PUT'
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), item);
  assert.equal(update.mock.calls[0].arguments[0], 'item-1');
  assert.deepEqual(update.mock.calls[0].arguments[2], { new: true });
});

test('PUT /cardapio/:id retorna 404 para item inexistente', async (context) => {
  context.mock.method(Cardapio, 'findByIdAndUpdate', async () => null);

  const response = await request('/cardapio/item-inexistente', {
    ...json({ nome: 'Burger atualizado' }),
    method: 'PUT'
  });

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { erro: 'Item não encontrado' });
});

test('DELETE /cardapio/:id remove um item', async (context) => {
  context.mock.method(Cardapio, 'findByIdAndDelete', async () => ({ _id: 'item-1' }));

  const response = await request('/cardapio/item-1', { method: 'DELETE' });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { mensagem: 'Item removido com sucesso' });
});

test('DELETE /cardapio/:id retorna 404 para item inexistente', async (context) => {
  context.mock.method(Cardapio, 'findByIdAndDelete', async () => null);

  const response = await request('/cardapio/item-inexistente', { method: 'DELETE' });
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { erro: 'Item não encontrado' });
});

test('POST /pedidos cria um pedido e calcula o total pelo cardápio', async (context) => {
  const itens = [
    { _id: '000000000000000000000001', preco: 29.9, disponivel: true },
    { _id: '000000000000000000000002', preco: 34.9, disponivel: true }
  ];
  context.mock.method(Cardapio, 'find', async () => itens);
  context.mock.method(Pedido.prototype, 'save', async function save() {
    return this;
  });

  const response = await request('/pedidos', json({
    cliente: 'Ana',
    itens: ['000000000000000000000001', '000000000000000000000002']
  }));
  const pedido = await response.json();

  assert.equal(response.status, 201);
  assert.equal(pedido.cliente, 'Ana');
  assert.deepEqual(pedido.itens.map(String), [
    '000000000000000000000001',
    '000000000000000000000002'
  ]);
  assert.equal(pedido.total, 64.8);
  assert.equal(pedido.status, 'pendente');
});

test('POST /pedidos rejeita nome de cliente inválido', async () => {
  const response = await request('/pedidos', json({ cliente: ' ', itens: ['item-1'] }));
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { erro: 'Nome do cliente inválido' });
});

test('POST /pedidos rejeita lista de itens vazia', async () => {
  const response = await request('/pedidos', json({ cliente: 'Ana', itens: [] }));
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { erro: 'Lista de itens inválida' });
});

test('POST /pedidos rejeita itens repetidos', async () => {
  const response = await request('/pedidos', json({
    cliente: 'Ana',
    itens: ['item-1', 'item-1']
  }));
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { erro: 'Não é permitido repetir itens no pedido' });
});

test('POST /pedidos rejeita itens inválidos ou indisponíveis', async (context) => {
  context.mock.method(Cardapio, 'find', async () => []);

  const response = await request('/pedidos', json({ cliente: 'Ana', itens: ['item-1'] }));
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { erro: 'Algum item é inválido ou indisponível' });
});

test('GET /pedidos lista pedidos com os itens preenchidos', async (context) => {
  const pedidos = [{ cliente: 'Ana', itens: [{ nome: 'Brasa Clássico' }] }];
  context.mock.method(Pedido, 'find', () => ({
    populate: async () => pedidos
  }));

  const response = await request('/pedidos');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), pedidos);
});

test('GET /pedidos retorna 500 quando a consulta falha', async (context) => {
  context.mock.method(Pedido, 'find', () => {
    throw new Error('Falha de consulta');
  });

  const response = await request('/pedidos');
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { erro: 'Falha de consulta' });
});

test('PUT /pedidos/:id atualiza o status', async (context) => {
  const pedido = { _id: 'pedido-1', status: 'preparando' };
  const update = context.mock.method(Pedido, 'findByIdAndUpdate', async () => pedido);

  const response = await request('/pedidos/pedido-1', {
    ...json({ status: 'preparando' }),
    method: 'PUT'
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), pedido);
  assert.equal(update.mock.calls[0].arguments[0], 'pedido-1');
  assert.deepEqual(update.mock.calls[0].arguments[1], { status: 'preparando' });
  assert.deepEqual(update.mock.calls[0].arguments[2], { new: true });
});

test('PUT /pedidos/:id rejeita status inválido', async () => {
  const response = await request('/pedidos/pedido-1', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'desconhecido' })
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { erro: 'Status inválido' });
});

test('PUT /pedidos/:id retorna 404 para pedido inexistente', async (context) => {
  context.mock.method(Pedido, 'findByIdAndUpdate', async () => null);

  const response = await request('/pedidos/pedido-inexistente', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'entregue' })
  });

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { erro: 'Pedido não encontrado' });
});

test('POST /pedidos/whatsapp rejeita dados incompletos', async () => {
  const response = await request('/pedidos/whatsapp', json({
    nome: 'Ana',
    telefone: '123',
    endereco: '',
    itens: []
  }));

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { erro: 'Dados do pedido inválidos' });
});

test('POST /pedidos/whatsapp informa quando a integração não está configurada', async () => {
  const nomes = [
    'WHATSAPP_ACCESS_TOKEN',
    'WHATSAPP_PHONE_NUMBER_ID',
    'WHATSAPP_ORDER_RECIPIENT',
    'WHATSAPP_ORDER_TEMPLATE_NAME'
  ];
  const anteriores = Object.fromEntries(nomes.map((nome) => [nome, process.env[nome]]));
  nomes.forEach((nome) => delete process.env[nome]);

  try {
    const response = await request('/pedidos/whatsapp', json({
      nome: 'Ana',
      telefone: '5531999999999',
      endereco: 'Rua das Flores, 123',
      itens: [{ nome: 'Brasa Clássico', preco: 29.9, quantidade: 2 }]
    }));

    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      erro: 'Integração do WhatsApp não configurada no servidor'
    });
  } finally {
    nomes.forEach((nome) => {
      if (anteriores[nome] === undefined) delete process.env[nome];
      else process.env[nome] = anteriores[nome];
    });
  }
});

test('POST /pedidos/whatsapp envia template e calcula o total no servidor', async (context) => {
  const configuracao = {
    WHATSAPP_ACCESS_TOKEN: 'test-token',
    WHATSAPP_PHONE_NUMBER_ID: 'phone-id',
    WHATSAPP_ORDER_RECIPIENT: '5531997596719',
    WHATSAPP_ORDER_TEMPLATE_NAME: 'novo_pedido',
    WHATSAPP_ORDER_TEMPLATE_LANGUAGE: 'pt_BR',
    WHATSAPP_API_VERSION: 'v25.0'
  };
  const anteriores = Object.fromEntries(
    Object.keys(configuracao).map((nome) => [nome, process.env[nome]])
  );
  Object.assign(process.env, configuracao);

  const chamada = context.mock.method(globalThis, 'fetch', async () => (
    new Response(JSON.stringify({ messages: [{ id: 'wamid.test' }] }), { status: 200 })
  ));

  try {
    const response = await request('/pedidos/whatsapp', json({
      nome: ' Ana ',
      telefone: '(31) 99999-9999',
      endereco: ' Rua das Flores, 123 ',
      itens: [
        { nome: 'Brasa Clássico', preco: 29.9, quantidade: 2 },
        { nome: 'Veggie da Horta', preco: 28.9, quantidade: 1 }
      ]
    }));

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      mensagem: 'Pedido enviado pelo WhatsApp',
      total: 88.7
    });
    assert.equal(chamada.mock.calls.length, 1);

    const [url, options] = chamada.mock.calls[0].arguments;
    assert.equal(url, 'https://graph.facebook.com/v25.0/phone-id/messages');
    assert.equal(options.headers.Authorization, 'Bearer test-token');

    const payload = JSON.parse(options.body);
    assert.equal(payload.to, '5531997596719');
    assert.equal(payload.template.name, 'novo_pedido');
    assert.deepEqual(
      payload.template.components[0].parameters.map(({ text }) => text),
      ['Ana', '31999999999', 'Rua das Flores, 123', '2x Brasa Clássico, 1x Veggie da Horta', 'R$ 88,70']
    );
  } finally {
    Object.keys(configuracao).forEach((nome) => {
      if (anteriores[nome] === undefined) delete process.env[nome];
      else process.env[nome] = anteriores[nome];
    });
  }
});

test('POST /pedidos/whatsapp explica quando o destinatário não está autorizado para testes', async (context) => {
  const configuracao = {
    WHATSAPP_ACCESS_TOKEN: 'test-token',
    WHATSAPP_PHONE_NUMBER_ID: 'phone-id',
    WHATSAPP_ORDER_RECIPIENT: '5531997596719',
    WHATSAPP_ORDER_TEMPLATE_NAME: 'novo_pedido'
  };
  const anteriores = Object.fromEntries(
    Object.keys(configuracao).map((nome) => [nome, process.env[nome]])
  );
  Object.assign(process.env, configuracao);
  context.mock.method(globalThis, 'fetch', async () => (
    new Response(JSON.stringify({
      error: { code: 131030, message: 'Recipient phone number not in allowed list' }
    }), { status: 400 })
  ));

  try {
    const response = await request('/pedidos/whatsapp', json({
      nome: 'Ana',
      telefone: '5531999999999',
      endereco: 'Rua das Flores, 123',
      itens: [{ nome: 'Brasa Clássico', preco: 29.9, quantidade: 1 }]
    }));

    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), {
      erro: 'Este destinatário não está autorizado no modo de teste da Meta. Adicione e verifique o número na lista de destinatários de teste.'
    });
  } finally {
    Object.keys(configuracao).forEach((nome) => {
      if (anteriores[nome] === undefined) delete process.env[nome];
      else process.env[nome] = anteriores[nome];
    });
  }
});

test('POST /pedidos/whatsapp explica quando o template não está aprovado', async (context) => {
  const configuracao = {
    WHATSAPP_ACCESS_TOKEN: 'test-token',
    WHATSAPP_PHONE_NUMBER_ID: 'phone-id',
    WHATSAPP_ORDER_RECIPIENT: '5531997596719',
    WHATSAPP_ORDER_TEMPLATE_NAME: 'novo_pedido'
  };
  const anteriores = Object.fromEntries(
    Object.keys(configuracao).map((nome) => [nome, process.env[nome]])
  );
  Object.assign(process.env, configuracao);
  context.mock.method(globalThis, 'fetch', async () => (
    new Response(JSON.stringify({
      error: { code: 132001, message: 'Template name does not exist in the translation' }
    }), { status: 400 })
  ));

  try {
    const response = await request('/pedidos/whatsapp', json({
      nome: 'Ana',
      telefone: '5531999999999',
      endereco: 'Rua das Flores, 123',
      itens: [{ nome: 'Brasa Clássico', preco: 29.9, quantidade: 1 }]
    }));

    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), {
      erro: 'O template configurado não está aprovado para este número e idioma. Confira o nome e o idioma de um template aprovado no WhatsApp Manager.'
    });
  } finally {
    Object.keys(configuracao).forEach((nome) => {
      if (anteriores[nome] === undefined) delete process.env[nome];
      else process.env[nome] = anteriores[nome];
    });
  }
});
