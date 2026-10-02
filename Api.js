// npm install express mongoose

const express = require('express');
const mongoose = require('mongoose');
const path = require('path');

const arquivoEnv = path.join(__dirname, '.env');
if (require('node:fs').existsSync(arquivoEnv)) {
  process.loadEnvFile(arquivoEnv);
}

const app = express();
app.use(express.json());

const mongoURI = process.env.MONGO_URI || 'mongodb://localhost:27017/hamburgueria';

function enviarPedidoWhatsApp({ nome, telefone, endereco, itens, total }) {
  const {
    WHATSAPP_ACCESS_TOKEN,
    WHATSAPP_PHONE_NUMBER_ID,
    WHATSAPP_ORDER_RECIPIENT,
    WHATSAPP_ORDER_TEMPLATE_NAME,
    WHATSAPP_ORDER_TEMPLATE_LANGUAGE = 'pt_BR',
    WHATSAPP_API_VERSION = 'v25.0'
  } = process.env;

  if (
    !WHATSAPP_ACCESS_TOKEN ||
    !WHATSAPP_PHONE_NUMBER_ID ||
    !WHATSAPP_ORDER_RECIPIENT ||
    !WHATSAPP_ORDER_TEMPLATE_NAME
  ) {
    throw new Error('Integração do WhatsApp não configurada no servidor');
  }

  const resumoItens = itens
    .map((item) => `${item.quantidade}x ${item.nome}`)
    .join(', ');
  const formatarMoeda = (valor) => Number(valor).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });

  return fetch(
    `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: WHATSAPP_ORDER_RECIPIENT,
        type: 'template',
        template: {
          name: WHATSAPP_ORDER_TEMPLATE_NAME,
          language: { code: WHATSAPP_ORDER_TEMPLATE_LANGUAGE },
          components: [{
            type: 'body',
            parameters: [nome, telefone, endereco, resumoItens, formatarMoeda(total)]
              .map((text) => ({ type: 'text', text }))
          }]
        }
      })
    }
  );
}

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'home.html'));
});

app.post('/pedidos/whatsapp', async (req, res) => {
  const { nome, telefone, endereco, itens } = req.body;
  const telefoneLimpo = typeof telefone === 'string' ? telefone.replace(/\D/g, '') : '';

  if (
    typeof nome !== 'string' || !nome.trim() ||
    telefoneLimpo.length < 8 || telefoneLimpo.length > 15 ||
    typeof endereco !== 'string' || !endereco.trim() ||
    !Array.isArray(itens) || itens.length === 0 ||
    itens.some((item) => (
      !item || typeof item !== 'object' ||
      typeof item.nome !== 'string' || !item.nome.trim() ||
      !Number.isInteger(item.quantidade) || item.quantidade < 1 ||
      typeof item.preco !== 'number' || !Number.isFinite(item.preco) || item.preco <= 0
    ))
  ) {
    return res.status(400).json({ erro: 'Dados do pedido inválidos' });
  }

  const total = Math.round(
    (itens.reduce((soma, item) => soma + item.preco * item.quantidade, 0) + Number.EPSILON) * 100
  ) / 100;
  try {
    const resposta = await enviarPedidoWhatsApp({
      nome: nome.trim(),
      telefone: telefoneLimpo,
      endereco: endereco.trim(),
      itens,
      total
    });

    if (!resposta.ok) {
      const detalhe = await resposta.text();
      let codigoErro;
      try {
        codigoErro = JSON.parse(detalhe).error?.code;
      } catch {
        codigoErro = undefined;
      }

      console.error(
        `Falha ao enviar pedido pela WhatsApp Cloud API (${resposta.status}, código ${codigoErro ?? 'desconhecido'})`
      );

      const mensagensPorCodigo = {
        131030: 'Este destinatário não está autorizado no modo de teste da Meta. Adicione e verifique o número na lista de destinatários de teste.',
        132001: 'O template configurado não está aprovado para este número e idioma. Confira o nome e o idioma de um template aprovado no WhatsApp Manager.',
        132000: 'Os parâmetros enviados não correspondem ao template aprovado. Confira a quantidade e a ordem das variáveis do corpo.'
      };
      const mensagem = mensagensPorCodigo[codigoErro]
        || 'A Meta não aceitou o envio. Confira o token, as permissões, o destinatário e o template do WhatsApp.';

      return res.status(502).json({ erro: mensagem });
    }

    res.json({ mensagem: 'Pedido enviado pelo WhatsApp', total });
  } catch (error) {
    console.error('Falha ao enviar pedido pelo WhatsApp:', error.message);
    const status = error.message === 'Integração do WhatsApp não configurada no servidor' ? 503 : 502;
    res.status(status).json({ erro: error.message });
  }
});

// Model do Cardápio
const CardapioSchema = new mongoose.Schema({
  nome: { type: String, required: true },
  preco: { type: Number, required: true },
  categoria: { type: String, required: true },
  disponivel: { type: Boolean, default: true }
}, { versionKey: false });

const Cardapio = mongoose.model('Cardapio', CardapioSchema);

// Model de Pedido
const PedidoSchema = new mongoose.Schema({
  cliente: { type: String, required: true },
  itens: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Cardapio', required: true }],
  total: { type: Number, required: true },
  status: {
    type: String,
    enum: ['pendente', 'preparando', 'entregue', 'cancelado'],
    default: 'pendente'
  }
}, { versionKey: false });

const Pedido = mongoose.model('Pedido', PedidoSchema);

// ------------------- ROTAS DO CARDÁPIO -------------------

// Listar cardápio
app.get('/cardapio', async (req, res) => {
  try {
    const itens = await Cardapio.find();
    res.json(itens);
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

// Adicionar item ao cardápio
app.post('/cardapio', async (req, res) => {
  try {
    const { nome, preco, categoria, disponivel } = req.body;

    if (!nome || !categoria || typeof preco !== 'number' || preco <= 0) {
      return res.status(400).json({ erro: 'Dados do cardápio inválidos' });
    }

    const novoItem = new Cardapio({ nome, preco, categoria, disponivel: disponivel ?? true });
    await novoItem.save();
    res.status(201).json(novoItem);
  } catch (error) {
    res.status(400).json({ erro: error.message });
  }
});

// Atualizar item do cardápio
app.put('/cardapio/:id', async (req, res) => {
  try {
    const item = await Cardapio.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!item) return res.status(404).json({ erro: 'Item não encontrado' });
    res.json(item);
  } catch (error) {
    res.status(400).json({ erro: error.message });
  }
});

// Remover item do cardápio
app.delete('/cardapio/:id', async (req, res) => {
  try {
    const item = await Cardapio.findByIdAndDelete(req.params.id);
    if (!item) return res.status(404).json({ erro: 'Item não encontrado' });
    res.json({ mensagem: 'Item removido com sucesso' });
  } catch (error) {
    res.status(400).json({ erro: error.message });
  }
});

// ------------------- ROTAS DE PEDIDOS -------------------

app.post('/pedidos', async (req, res) => {
  try {
    const { cliente, itens } = req.body;

    if (typeof cliente !== 'string' || !cliente.trim()) {
      return res.status(400).json({ erro: 'Nome do cliente inválido' });
    }

    if (!Array.isArray(itens) || itens.length === 0) {
      return res.status(400).json({ erro: 'Lista de itens inválida' });
    }

    const ids = itens.map((id) => String(id));
    if (new Set(ids).size !== ids.length) {
      return res.status(400).json({ erro: 'Não é permitido repetir itens no pedido' });
    }

    const itensValidados = await Cardapio.find({ _id: { $in: itens }, disponivel: true });
    if (itensValidados.length !== itens.length) {
      return res.status(400).json({ erro: 'Algum item é inválido ou indisponível' });
    }

    const total = itensValidados.reduce((acc, item) => acc + item.preco, 0);

    const novoPedido = new Pedido({
      cliente: cliente.trim(),
      itens,
      total
    });

    await novoPedido.save();
    res.status(201).json(novoPedido);
  } catch (error) {
    res.status(400).json({ erro: error.message });
  }
});

// Listar pedidos
app.get('/pedidos', async (req, res) => {
  try {
    const lista = await Pedido.find().populate('itens');
    res.json(lista);
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

// Atualizar status do pedido
app.put('/pedidos/:id', async (req, res) => {
  try {
    const statusPermitido = ['pendente', 'preparando', 'entregue', 'cancelado'];
    const novoStatus = req.body.status;

    if (!statusPermitido.includes(novoStatus)) {
      return res.status(400).json({ erro: 'Status inválido' });
    }

    const pedido = await Pedido.findByIdAndUpdate(
      req.params.id,
      { status: novoStatus },
      { new: true }
    );

    if (!pedido) return res.status(404).json({ erro: 'Pedido não encontrado' });
    res.json(pedido);
  } catch (error) {
    res.status(400).json({ erro: error.message });
  }
});

if (require.main === module) {
  mongoose.connect(mongoURI)
    .then(() => console.log('✅ MongoDB conectado'))
    .catch((error) => console.error('❌ Erro ao conectar no MongoDB:', error.message));

  const porta = process.env.PORT || 3000;
  app.listen(porta, () => {
    console.log(`🍔 API da hamburgueria com MongoDB rodando na porta ${porta}`);
  });
}

module.exports = { app, Cardapio, Pedido };
