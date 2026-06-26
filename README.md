# Sistema ECRI

Sistema web para gestao de equipes do ECRI, com cadastro de participantes, escalas, confirmacoes, pagamentos, blusas, reunioes, relatorios e acompanhamento de faltas.

## Visao Geral

O projeto tem backend em Node.js/Express e frontend estatico em HTML, CSS e JavaScript. Em desenvolvimento pode usar SQLite local; em producao deve usar PostgreSQL, atualmente preparado para Neon.

Perfis principais:

- Equipista: cadastro, perfil, solicitacao de blusa, pagamento de taxa/blusa e acompanhamento de status.
- Coordenador: gestao da propria equipe, confirmacoes, pagamentos, blusas, reunioes, chamada, restricoes e pagamento da propria taxa/blusa.
- Equipe dirigente: gerenciamento geral de usuarios, escalas, eventos, relatorios, situacao de pagamentos/blusas, carografo, reunioes e acompanhamento de faltas.
- Desenvolvimento: area restrita para manutencao administrativa.

## Stack

- Node.js
- Express
- PostgreSQL via Neon em producao
- SQLite como fallback local
- Vercel para deploy
- Mercado Pago para PIX e cartao de credito
- JWT para autenticacao
- Bootstrap no frontend

## Login

O login usa:

- CPF: apenas numeros
- Senha: data de nascimento com 8 numeros, no formato DDMMAAAA

Exemplo:

```text
CPF: 111111111
Senha/data de nascimento: 01012000
```

## Estrutura

```text
Sistema-ECRI/
  backend/
    config/
      database.js
    middleware/
      auth.js
    routes/
      auth.js
      equipista.js
      coordenador.js
      dirigentes.js
      confirmacao.js
      desenvolvimento.js
    utils/
    server.js
  frontend/
    assets/
    css/
    js/
    index.html
    equipista.html
    coordenador.html
    dirigentes.html
    confirmacao.html
    desenvolvimento.html
  vercel.json
  package.json
  README.md
```

## Variaveis de Ambiente

Crie um `.env` local com base em `backend/.env.example`.

```env
PORT=5000
JWT_SECRET=troque-este-segredo
APP_BASE_URL=http://localhost:5000

DATABASE_URL=postgresql://usuario:senha@host.neon.tech/database?sslmode=require

INITIAL_DIRIGENTE_CPF=111111111
INITIAL_DIRIGENTE_SENHA=01012000
INITIAL_DIRIGENTE_DATA_NASCIMENTO=01012000
INITIAL_DIRIGENTE_NOME=ORESTES PEREIRA DA SILVA NETO
INITIAL_DIRIGENTE_CRACHA=ORESTES
INITIAL_DIRIGENTE_TELEFONE=(11) 99999-9999

MERCADO_PAGO_ACCESS_TOKEN=APP_USR_seu_access_token
MERCADO_PAGO_NOTIFICATION_URL=https://seu-dominio.com/api/equipista/mercado-pago/webhook
```

Notas:

- Em producao, configure essas variaveis no painel da Vercel.
- Nao coloque tokens reais do Mercado Pago nem strings reais do banco no README ou em commits.
- Se `DATABASE_URL` existir, o sistema usa PostgreSQL. Sem `DATABASE_URL`, usa SQLite.
- O usuario dirigente inicial e criado automaticamente quando o banco e inicializado e ainda nao existe usuario com o CPF configurado.

## Rodando Localmente

Instale as dependencias:

```bash
npm install
```

Inicie o servidor:

```bash
npm start
```

Servidor local:

```text
http://localhost:5000
```

Principais paginas:

```text
http://localhost:5000/frontend/index.html
http://localhost:5000/frontend/equipista.html
http://localhost:5000/frontend/coordenador.html
http://localhost:5000/frontend/dirigentes.html
```

Tambem e possivel usar o backend diretamente em `http://localhost:5000/api`.

## Deploy na Vercel

O arquivo `vercel.json` direciona:

- `/api/*` para `backend/server.js`
- `/c/*` para o redirecionador de links curtos
- demais rotas para arquivos estaticos em `frontend/`

Deploy de producao:

```bash
npx vercel --prod --yes
```

URL de producao atual:

```text
https://sistema-ecri.vercel.app
```

## Banco de Dados

O sistema cria e atualiza as tabelas automaticamente ao iniciar. As principais tabelas incluem:

- `usuarios`
- `pessoas_externas`
- `pagamentos`
- `solicitacoes_blusa`
- `eventos`
- `evento_usuarios`
- `reunioes`
- `presencas_reuniao`
- `tokens_confirmacao_utilizados`
- `links_encurtados`
- `historico`
- `configuracoes`

Em producao, use Neon PostgreSQL com `DATABASE_URL`.

## Pagamentos

A integracao com Mercado Pago permite:

- PIX com QR Code e codigo copia e cola em modal.
- Cartao de credito com acrescimo de 8%.
- Webhook para reconhecer pagamento aprovado.
- Webhook para marcar pagamento ressarcido.
- Baixa automatica de taxa/blusa quando o pagamento e aprovado.

Regras importantes:

- Taxa e blusa podem ser pagas uma unica vez por cobranca pendente.
- Blusas pendentes sao somadas no pagamento de blusa.
- Se uma blusa ja foi confirmada, os botoes de pagamento deixam de aparecer.
- O status mostra se a baixa foi via Mercado Pago ou via coordenador.

## Fotos

Fotos de perfil sao enviadas em Base64 e armazenadas no banco.

Limite atual:

```text
2MB por foto
```

## Links de Confirmacao

Coordenadores e dirigentes podem gerar links de confirmacao para participantes. O sistema tambem possui links curtos usando a rota:

```text
/c/:codigo
```

Esses links redirecionam para o destino salvo em `links_encurtados`.

## Principais Endpoints

Autenticacao:

- `POST /api/auth/registro`
- `POST /api/auth/login`

Equipista:

- `GET /api/equipista/perfil`
- `PUT /api/equipista/perfil`
- `POST /api/equipista/solicitar-blusa`
- `POST /api/equipista/solicitar-pagamento`
- `GET /api/equipista/status`
- `POST /api/equipista/mercado-pago/webhook`

Coordenador:

- `GET /api/coordenador/meu-perfil`
- `PUT /api/coordenador/meu-perfil`
- `GET /api/coordenador/participantes-equipe`
- `POST /api/coordenador/participantes-equipe/:tipo/:id/token-confirmacao`
- `GET /api/coordenador/solicitacoes-blusa`
- `POST /api/coordenador/solicitacoes-blusa/:usuario_id`
- `PUT /api/coordenador/confirmar-blusa/:id`
- `GET /api/coordenador/pagamentos-pendentes`
- `PUT /api/coordenador/confirmar-pagamento/:id`
- `GET /api/coordenador/reunioes`
- `POST /api/coordenador/reunioes`
- `GET /api/coordenador/reunioes/:id/presencas`
- `PUT /api/coordenador/reunioes/:id/presencas`

Equipe dirigente:

- `GET /api/dirigentes/meu-perfil`
- `PUT /api/dirigentes/meu-perfil`
- `GET /api/dirigentes/usuarios`
- `GET /api/dirigentes/usuarios/:usuario_id`
- `PUT /api/dirigentes/usuarios/:usuario_id/perfil`
- `DELETE /api/dirigentes/usuarios/:usuario_id`
- `GET /api/dirigentes/pessoas-externas`
- `POST /api/dirigentes/pessoas-externas`
- `PUT /api/dirigentes/pessoas-externas/:pessoa_id/equipe`
- `GET /api/dirigentes/relatorio/geral`
- `GET /api/dirigentes/relatorio/equipe/:equipe`
- `GET /api/dirigentes/situacao`
- `GET /api/dirigentes/acompanhamento-faltas/equipes`
- `GET /api/dirigentes/acompanhamento-faltas/equipes/:equipe`
- `GET /api/dirigentes/eventos`
- `POST /api/dirigentes/eventos`
- `PUT /api/dirigentes/eventos/:evento_id/escalacoes`

Confirmacao:

- `GET /api/confirmacao/:token`
- `PUT /api/confirmacao/:token`

Saude:

- `GET /api/health`

## Validacao Antes de Publicar

Comandos uteis:

```bash
node --check backend/server.js
node --check backend/routes/auth.js
node --check backend/routes/equipista.js
node --check backend/routes/coordenador.js
node --check backend/routes/dirigentes.js
node --check frontend/js/auth.js
node --check frontend/js/equipista.js
node --check frontend/js/coordenador.js
node --check frontend/js/dirigentes.js
```

## Observacoes de Seguranca

- Use um `JWT_SECRET` forte em producao.
- Nao exponha `DATABASE_URL` nem `MERCADO_PAGO_ACCESS_TOKEN`.
- Configure `MERCADO_PAGO_NOTIFICATION_URL` com a URL publica correta.
- Use sempre HTTPS em producao.
- Revise alteracoes em rotas administrativas antes de publicar.

## Troubleshooting

Erro de modulo ausente:

```bash
npm install
```

Banco local SQLite com problema:

```bash
Remove-Item backend/sistema_ecri.db
npm start
```

Verificar se a API esta online:

```text
https://sistema-ecri.vercel.app/api/health
```

## Autoria

Desenvolvido para o ECRI da Paroquia Nossa Senhora da Guia - Queimadas/PB.
