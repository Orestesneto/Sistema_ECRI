# Sistema ECRI

Sistema web para gestao de equipes do ECRI, com cadastro de participantes, escalas, confirmacoes, pagamentos, blusas, reunioes, relatorios, carografo e acompanhamento de faltas.

## Visao Geral

O projeto tem backend em Node.js/Express e frontend estatico em HTML, CSS e JavaScript. Em ambiente local, pode usar SQLite. Em producao, pode usar PostgreSQL via `DATABASE_URL`.

Tambem existe uma versao Android gerada com Capacitor na pasta `Sistema para android/`.

## Perfis

- **Equipista**: cadastro, perfil, solicitacao de blusa, pagamento de taxa/blusa e acompanhamento de status.
- **Coordenador**: gestao da propria equipe, confirmacoes, pagamentos, blusas, reunioes, chamada, restricoes, carografo da Escrita e pagamento proprio.
- **Equipe dirigente**: gerenciamento geral de usuarios, pessoas sem cadastro, escalas, eventos, relatorios, situacao de pagamentos/blusas, carografo, reunioes e faltas.
- **Desenvolvimento**: area restrita para manutencao administrativa, logs, carografo geral, excluidos, configuracoes e manutencoes.

## Recursos Principais

- Login por CPF e data de nascimento.
- Cadastro com foto de perfil, paroquia, telefone, movimento de origem e experiencia.
- Cadastro e escala de pessoas sem cadastro.
- Links de confirmacao e desistencia.
- Links curtos em `/c/:codigo`.
- Relatorio geral com resumo por equipe.
- Carografo com filtros e atualizacao automatica.
- Acompanhamento de faltas e faltas justificadas.
- Pagamentos via Mercado Pago com PIX/cartao e webhook.
- Controle de blusas.
- Area de excluidos com registro de quem excluiu.
- Layout responsivo com cards para tabelas largas no celular.

## Stack

- Node.js
- Express
- SQLite local
- PostgreSQL em producao via `DATABASE_URL`
- Vercel
- JWT
- Bootstrap
- Mercado Pago
- Capacitor para Android

## Estrutura

```text
Sistema-ECRI/
  backend/
    config/
    middleware/
    routes/
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
    desenvolvimento.html
    confirmacao.html
    confirmacao-desistencia.html
  Sistema para android/
    android/
    www/
    capacitor.config.json
    package.json
  package.json
  vercel.json
  README.md
```

## Seguranca e Dados Sensiveis

Nao coloque dados reais no repositorio:

- CPF real
- telefone real
- senha real
- token do Mercado Pago
- `DATABASE_URL`
- `JWT_SECRET`
- arquivos `.env`
- dumps SQL com pessoas reais

Use sempre variaveis de ambiente para dados sensiveis.

## Variaveis de Ambiente

Exemplo local:

```env
PORT=5000
JWT_SECRET=troque-este-segredo
APP_BASE_URL=http://localhost:5000

DATABASE_URL=
DATABASE=

INITIAL_DIRIGENTE_CPF=11111111111
INITIAL_DIRIGENTE_SENHA=01012000
INITIAL_DIRIGENTE_DATA_NASCIMENTO=01012000
INITIAL_DIRIGENTE_EMAIL=admin@cpf.ecri.local
INITIAL_DIRIGENTE_NOME=ADMINISTRADOR DO SISTEMA
INITIAL_DIRIGENTE_CRACHA=ADMIN
INITIAL_DIRIGENTE_TELEFONE=(11) 99999-9999

DEV_USUARIO=usuario-dev
DEV_SENHA=senha-dev-forte

MERCADO_PAGO_ACCESS_TOKEN=
MERCADO_PAGO_NOTIFICATION_URL=
MERCADO_PAGO_PAYER_EMAIL=pagamentos@sistema-ecri.com.br
```

Notas:

- Se `DATABASE_URL` estiver preenchida, o sistema usa PostgreSQL.
- Se `DATABASE_URL` nao existir, o sistema usa SQLite.
- Em producao, configure as variaveis no painel da Vercel.
- `JWT_SECRET` deve ser forte em producao.
- O dirigente inicial e criado automaticamente se ainda nao existir usuario com o CPF configurado.

## Rodando Localmente

Instale as dependencias:

```bash
npm install
```

Inicie o servidor:

```bash
npm start
```

Acesse:

```text
http://localhost:5000/frontend/index.html
```

Paginas principais:

```text
http://localhost:5000/frontend/equipista.html
http://localhost:5000/frontend/coordenador.html
http://localhost:5000/frontend/dirigentes.html
http://localhost:5000/frontend/desenvolvimento.html
```

API:

```text
http://localhost:5000/api/health
```

## Login

O login usa:

- CPF com apenas numeros.
- Data de nascimento com 8 numeros, no formato `DDMMAAAA`.

Exemplo de desenvolvimento:

```text
CPF: 11111111111
Data de nascimento: 01012000
```

## Banco de Dados

O sistema cria e atualiza tabelas automaticamente ao iniciar.

Principais tabelas:

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
- `usuarios_excluidos`
- `configuracoes`

## Deploy na Vercel

O arquivo `vercel.json` roteia:

- `/api/*` para `backend/server.js`
- `/c/*` para `backend/server.js`
- `/frontend/*` para `frontend/*`
- demais rotas para arquivos estaticos em `frontend/`

Deploy de producao:

```bash
npx vercel --prod --yes
```

URL de producao:

```text
https://sistema-ecri.vercel.app
```

## Android

A versao Android fica em:

```text
Sistema para android/
```

Instale dependencias e sincronize:

```bash
cd "Sistema para android"
npm install
npm run sync
```

Abrir no Android Studio:

```bash
npm run open
```

Para gerar APK debug:

```bash
cd "Sistema para android/android"
./gradlew assembleDebug
```

No Windows PowerShell:

```powershell
cd "Sistema para android\android"
.\gradlew.bat assembleDebug
```

APK debug:

```text
Sistema para android/android/app/build/outputs/apk/debug/app-debug.apk
```

Para alterar a URL do servidor usada pelo app Android, edite:

```text
Sistema para android/www/js/config.js
```

Depois rode:

```bash
cd "Sistema para android"
npm run sync
```

## Pagamentos

A integracao com Mercado Pago permite:

- PIX com QR Code e codigo copia e cola.
- Cartao de credito com acrescimo configurado no frontend.
- Webhook para reconhecer pagamento aprovado.
- Registro de pagamento ressarcido.
- Baixa de taxa/blusa conforme aprovacao.

Configure:

```env
MERCADO_PAGO_ACCESS_TOKEN=
MERCADO_PAGO_NOTIFICATION_URL=https://seu-dominio.com/api/equipista/mercado-pago/webhook
```

## Links de Confirmacao

Coordenadores e dirigentes podem gerar links de confirmacao para participantes cadastrados e pessoas sem cadastro.

Rota de confirmacao:

```text
/frontend/confirmacao.html?token=...
```

Rota de desistencia:

```text
/frontend/confirmacao-desistencia.html?token=...
```

Links curtos:

```text
/c/:codigo
```

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
- `GET /api/coordenador/carografo-escrita`
- `GET /api/coordenador/solicitacoes-blusa`
- `POST /api/coordenador/solicitacoes-blusa/:usuario_id`
- `PUT /api/coordenador/confirmar-blusa/:id`
- `GET /api/coordenador/pagamentos-pendentes`
- `PUT /api/coordenador/confirmar-pagamento/:id`
- `GET /api/coordenador/reunioes`
- `POST /api/coordenador/reunioes`
- `PUT /api/coordenador/reunioes/:id/presencas`

Equipe dirigente:

- `GET /api/dirigentes/meu-perfil`
- `PUT /api/dirigentes/meu-perfil`
- `GET /api/dirigentes/configuracoes-encontro`
- `PUT /api/dirigentes/configuracoes-encontro`
- `GET /api/dirigentes/usuarios`
- `GET /api/dirigentes/usuarios/:usuario_id`
- `PUT /api/dirigentes/usuarios/:usuario_id/perfil`
- `DELETE /api/dirigentes/usuarios/:usuario_id`
- `GET /api/dirigentes/pessoas-externas`
- `POST /api/dirigentes/pessoas-externas`
- `PUT /api/dirigentes/pessoas-externas/:pessoa_id`
- `PUT /api/dirigentes/pessoas-externas/:pessoa_id/equipe`
- `DELETE /api/dirigentes/pessoas-externas/:pessoa_id`
- `GET /api/dirigentes/relatorio/geral`
- `GET /api/dirigentes/situacao`
- `GET /api/dirigentes/acompanhamento-faltas/equipes`
- `GET /api/dirigentes/acompanhamento-faltas/equipes/:equipe`
- `GET /api/dirigentes/eventos`
- `POST /api/dirigentes/eventos`
- `PUT /api/dirigentes/eventos/:evento_id/escalacoes`
- `DELETE /api/dirigentes/eventos/:evento_id`

Confirmacao:

- `GET /api/confirmacao/:token`
- `PUT /api/confirmacao/:token`

Desenvolvimento:

- `POST /api/desenvolvimento/login`
- `GET /api/desenvolvimento/acesso`
- `GET /api/desenvolvimento/logs`
- `GET /api/desenvolvimento/carografo`
- `GET /api/desenvolvimento/usuarios-excluidos`
- `GET /api/desenvolvimento/blusas`
- `GET /api/desenvolvimento/configuracoes`
- `PUT /api/desenvolvimento/configuracoes`

Saude:

- `GET /api/health`

## Validacao

Checar sintaxe do backend:

```bash
node --check backend/server.js
node --check backend/routes/auth.js
node --check backend/routes/equipista.js
node --check backend/routes/coordenador.js
node --check backend/routes/dirigentes.js
node --check backend/routes/desenvolvimento.js
node --check backend/routes/confirmacao.js
```

Checar sintaxe do frontend:

```bash
node --check frontend/js/auth.js
node --check frontend/js/equipista.js
node --check frontend/js/coordenador.js
node --check frontend/js/dirigentes.js
node --check frontend/js/desenvolvimento.js
node --check frontend/js/confirmacao.js
node --check frontend/js/tabelas-responsivas.js
```

Validar assets Android:

```bash
cd "Sistema para android"
npm run build:web
```

## Troubleshooting

Reinstalar dependencias:

```bash
npm install
```

Limpar banco SQLite local:

```powershell
Remove-Item backend\sistema_ecri.db
npm start
```

Verificar producao:

```text
https://sistema-ecri.vercel.app/api/health
```

Busca util:

```bash
rg -n "CPF_REAL|TOKEN|DATABASE_URL|MERCADO_PAGO_ACCESS_TOKEN" .
```

## Licenca

Projeto interno do Sistema ECRI. Defina uma licenca antes de reutilizar em outro contexto.
