# API da Hamburgueria

API REST para o cardápio e os pedidos da hamburgueria, feita com Node.js, Express e MongoDB. Também inclui uma página web de cardápio e pode encaminhar pedidos pela WhatsApp Cloud API.

## Requisitos

- Node.js 20.12 ou superior
- MongoDB local ou uma instância acessível pela aplicação
- npm

## Instalação e execução

```bash
npm install
cp .env.example .env
```

Configure `MONGO_URI` no arquivo `.env` se sua conexão MongoDB for diferente do valor local padrão. Inicie a API com:

```bash
node Api.js
```

A API fica disponível em `http://localhost:3000` por padrão. A porta pode ser alterada pela variável `PORT`. A página do cardápio é servida em `/`.

## Endpoints

### Cardápio

| Método | Caminho | Descrição |
| --- | --- | --- |
| `GET` | `/cardapio` | Lista os itens do cardápio. |
| `POST` | `/cardapio` | Adiciona um item. |
| `PUT` | `/cardapio/:id` | Atualiza um item. |
| `DELETE` | `/cardapio/:id` | Remove um item. |

Exemplo de corpo para criar um item:

```json
{
  "nome": "Hambúrguer clássico",
  "preco": 29.9,
  "categoria": "Hambúrguer",
  "disponivel": true
}
```

### Pedidos

| Método | Caminho | Descrição |
| --- | --- | --- |
| `POST` | `/pedidos` | Cria um pedido a partir de IDs de itens disponíveis no cardápio. |
| `GET` | `/pedidos` | Lista pedidos com os itens preenchidos. |
| `PUT` | `/pedidos/:id` | Atualiza o status de um pedido. |
| `POST` | `/pedidos/whatsapp` | Envia os dados do pedido pela WhatsApp Cloud API. |

Exemplo de corpo para criar um pedido:

```json
{
  "cliente": "Maria",
  "itens": ["ID_DO_ITEM_NO_CARDAPIO"]
}
```

O total é calculado no servidor usando os preços do cardápio. Os status aceitos são `pendente`, `preparando`, `entregue` e `cancelado`.

O endpoint `POST /pedidos/whatsapp` espera nome, telefone, endereço e itens com quantidade e preço. Consulte [`WHATSAPP-SETUP.md`](./WHATSAPP-SETUP.md) para configurar a integração com a Meta. Nunca coloque tokens ou credenciais no HTML ou no repositório; mantenha os segredos em `.env` local ou nas variáveis seguras do ambiente de produção.

## Testes

```bash
npm test
```

Os testes automatizados usam respostas simuladas para as dependências externas; eles não enviam mensagens reais pela WhatsApp Cloud API.
