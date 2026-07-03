# Principais funcoes do Sistema ECRI

Este documento explica, em linguagem direta, as principais partes do projeto e o papel de cada uma dentro do sistema.

## Backend

### `backend/server.js`

Ponto de entrada do backend. Ele inicia o Express, configura CORS, JSON, arquivos estaticos, rotas da API e a conexao com o banco de dados.

Principais responsabilidades:

- Subir o servidor da aplicacao.
- Servir as paginas do frontend.
- Registrar as rotas `/api/auth`, `/api/equipista`, `/api/coordenador`, `/api/dirigentes`, `/api/desenvolvimento`, `/api/notificacoes` e `/c/:codigo`.
- Expor a rota de saude `/api/health`.

### `backend/config/database.js`

Camada central de banco de dados. Permite o sistema funcionar com SQLite localmente ou PostgreSQL em producao.

Principais responsabilidades:

- Detectar se deve usar `DATABASE_URL` com PostgreSQL ou SQLite local.
- Criar e atualizar tabelas automaticamente.
- Disponibilizar metodos de consulta, como `run`, `get` e `all`.
- Criar o dirigente inicial quando necessario.

### `backend/routes/auth.js`

Controla cadastro, login e renovacao de sessao.

Principais responsabilidades:

- Registrar novos usuarios.
- Validar CPF e data de nascimento no login.
- Gerar token JWT de acesso.
- Renovar a sessao do usuario logado.

### `backend/routes/equipista.js`

Atende as funcoes do usuario equipista e tambem alguns fluxos de pagamento usados por coordenadores.

Principais responsabilidades:

- Carregar e atualizar perfil do equipista.
- Solicitar blusa.
- Solicitar pagamento de taxa ou blusa.
- Integrar com Mercado Pago.
- Receber webhook de pagamento.
- Consultar status de pagamentos e blusas.

### `backend/routes/coordenador.js`

Controla a area do coordenador e parte das funcoes compartilhadas com equipe dirigente.

Principais responsabilidades:

- Carregar e atualizar perfil do coordenador.
- Listar participantes da equipe.
- Confirmar pagamentos e servicos.
- Gerar links de confirmacao e desistencia.
- Criar, editar e cancelar reunioes.
- Registrar chamada de presenca.
- Enviar notificacoes apenas para usuarios que tiveram alteracao na chamada.
- Bloquear chamada, edicao e cancelamento 24 horas apos a reuniao.

### `backend/routes/dirigentes.js`

Controla a area da equipe dirigente, que possui a visao geral do encontro.

Principais responsabilidades:

- Gerenciar usuarios cadastrados.
- Adicionar e escalar pessoas sem cadastro.
- Editar perfil, status, equipe e impedimentos.
- Excluir usuarios e guardar historico em `usuarios_excluidos`.
- Escalar usuarios para equipista, coordenador, dirigente ou equipe.
- Gerar relatorio geral.
- Carregar situacao de pagamentos e blusas.
- Controlar eventos.
- Acompanhar faltas por equipe.
- Enviar notificacoes personalizadas para usuarios com equipe.

### `backend/routes/desenvolvimento.js`

Area administrativa restrita para manutencao do sistema.

Principais responsabilidades:

- Login da area de desenvolvimento.
- Criar dirigente manualmente.
- Consultar logs e historico de usuarios.
- Ver carografo geral.
- Ver usuarios excluidos.
- Alterar configuracoes internas.
- Manter usuarios, equipes e pessoas externas.

### `backend/routes/notificacoes.js`

Controla as notificacoes exibidas para o usuario.

Principais responsabilidades:

- Listar notificacoes do usuario logado.
- Marcar notificacoes como lidas.
- Registrar token do dispositivo para push no Android.

### `backend/routes/confirmacao.js`

Controla os links de confirmacao e desistencia enviados aos participantes.

Principais responsabilidades:

- Ler token de confirmacao.
- Validar se o link ainda pode ser usado.
- Registrar confirmacao, desistencia ou negativa.
- Impedir reutilizacao indevida do mesmo link.

## Utilitarios do backend

### `backend/utils/notificacoes.js`

Centraliza a criacao de notificacoes.

Principais responsabilidades:

- Criar notificacao no banco.
- Enviar push para o dispositivo quando existir token registrado.
- Enviar notificacoes para varios usuarios ou uma equipe inteira.

### `backend/utils/pushFirebase.js`

Faz a integracao com Firebase Cloud Messaging.

Principais responsabilidades:

- Ler credenciais do Firebase por variavel de ambiente.
- Gerar token de acesso para a API do Firebase.
- Enviar notificacao push para dispositivos Android.
- Informar se a configuracao do Firebase esta ativa.

### `backend/utils/equipes.js`

Concentra as regras de nomes de equipes e status ligados a equipe.

Principais responsabilidades:

- Normalizar nome de equipe.
- Verificar se a equipe e valida.
- Identificar `SEM EQUIPE`.
- Aplicar regra para status que removem usuario do encontro.

### `backend/utils/historico.js`

Registra acoes importantes feitas no sistema.

Principais responsabilidades:

- Gravar no banco quem fez determinada acao.
- Guardar detalhes em formato JSON para auditoria.

## Frontend

### `frontend/js/auth.js`

Controla cadastro e login na tela inicial.

Principais responsabilidades:

- Validar formulario de cadastro.
- Enviar dados para `/api/auth/registro`.
- Fazer login em `/api/auth/login`.
- Guardar token e dados do usuario no navegador.
- Redirecionar o usuario para o painel correto conforme o perfil.

### `frontend/js/equipista.js`

Controla o painel do equipista.

Principais responsabilidades:

- Carregar dados do perfil.
- Atualizar informacoes pessoais.
- Solicitar blusa.
- Solicitar pagamento de taxa ou blusa.
- Mostrar PIX, QR Code ou checkout de cartao.
- Monitorar status do pagamento.
- Exibir status geral do usuario.

### `frontend/js/coordenador.js`

Controla o painel do coordenador.

Principais responsabilidades:

- Carregar participantes da equipe.
- Confirmar pagamentos e servicos.
- Gerar links de confirmacao.
- Gerenciar reunioes.
- Abrir e salvar chamada de presenca.
- Preparar mensagens de WhatsApp para faltas e faltas justificadas.
- Atualizar carografo e restricoes.

### `frontend/js/dirigentes.js`

Controla o painel da equipe dirigente.

Principais responsabilidades:

- Gerenciar usuarios cadastrados.
- Editar perfil, equipe, status e impedimentos.
- Adicionar e gerenciar pessoas sem cadastro.
- Escalar usuarios e pessoas externas.
- Renderizar relatorio geral.
- Renderizar carografo com filtros.
- Exportar carografo em Excel ou PDF.
- Gerenciar eventos.
- Acompanhar situacao de pagamentos e blusas.
- Acompanhar faltas por equipe.
- Enviar notificacoes personalizadas.
- Atualizar telas em tempo real quando necessario.

### `frontend/js/desenvolvimento.js`

Controla a area de desenvolvimento.

Principais responsabilidades:

- Autenticar acesso administrativo.
- Exibir logs e acoes dos usuarios.
- Listar carografo geral.
- Mostrar usuarios excluidos.
- Alterar configuracoes internas.
- Fazer manutencoes administrativas.

### `frontend/js/notificacoes.js`

Controla notificacoes no frontend.

Principais responsabilidades:

- Registrar o dispositivo para notificacoes push.
- Buscar notificacoes do usuario.
- Marcar notificacoes como lidas.
- Exibir contador visual de notificacoes.

### `frontend/js/tabelas-responsivas.js`

Transforma tabelas largas em formato mais legivel no celular.

Principais responsabilidades:

- Ler os titulos das colunas.
- Adicionar rotulos em cada celula.
- Facilitar a exibicao em cards no mobile via CSS.

## Android

### `Sistema para android/`

Versao mobile do sistema gerada com Capacitor.

Principais responsabilidades:

- Reaproveitar o frontend web dentro de um app Android.
- Manter o usuario logado no aplicativo.
- Registrar token de notificacao push.
- Exibir notificacoes mesmo com o app fechado, usando Firebase.
- Usar nome e icone proprios do app `ECRI 2026`.

## Fluxos principais do sistema

### Cadastro e login

O usuario se cadastra com CPF, data de nascimento, telefone, movimento, paroquia e dados pessoais. Depois entra no sistema usando CPF e data de nascimento.

### Escala de equipe

A equipe dirigente seleciona um usuario ou pessoa sem cadastro e define sua equipe. A partir disso, ele aparece em relatorios, carografo e acompanhamento de faltas.

### Confirmacao

Coordenadores e dirigentes podem gerar links de confirmacao. O participante acessa o link e confirma, desiste ou nega a participacao.

### Reunioes e chamadas

O coordenador agenda reunioes. Na chamada, registra presenca, falta ou falta justificada. O sistema notifica apenas quem teve alteracao no status da chamada.

### Pagamentos e blusas

Equipistas podem solicitar pagamento de taxa ou blusa. Coordenadores e dirigentes conseguem acompanhar pendencias e confirmar pagamentos quando necessario.

### Exclusoes

Quando um usuario e excluido, o sistema remove das areas ativas e registra os dados em `usuarios_excluidos`, guardando tambem quem fez a exclusao.

### Notificacoes

O sistema cria notificacoes internas e, quando existe token do dispositivo, envia push pelo Firebase para o aplicativo Android.
