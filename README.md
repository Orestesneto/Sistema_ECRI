# Sistema ECRI - Gestão de Equipes

Um sistema web completo para gerenciar equipes com 3 perfis de acesso: Equipista, Coordenador e Equipe Dirigente.

## 📋 Funcionalidades por Perfil

### 👤 Equipista
- Realizar cadastro com dados completos
- Upload de foto de perfil
- Informar restrições médicas, alimentares e de medicação
- Solicitar blusa (com tamanho)
- Solicitar pagamento (taxa/blusa)
- Acompanhar status de pagamentos e blusas

### 👨‍💼 Coordenador
- Confirmar pagamentos de taxas
- Visualizar lista de solicitações de blusa
- Confirmar participação de equipistas

### 👑 Equipe Dirigente
- Acesso a todos os cadastros
- Escalar usuários para perfil de Coordenador
- Escalar usuários para equipes específicas
- Visualizar relatórios por equipe
- Ver situação geral de pagamentos e blusas
- Dashboard com gráficos e estatísticas

## 🛠️ Instalação e Uso

### Requisitos
- Node.js (v14+)
- npm

### 1. Instalar Dependências do Backend

```bash
cd backend
npm install
```

### 2. Configurar Variáveis de Ambiente

O arquivo `.env` já foi criado com configurações padrão:
```
PORT=5000
JWT_SECRET=sua_chave_secreta_muito_segura_aqui_123456789
DATABASE=./sistema_ecri.db
NODE_ENV=development
```

**Importante**: Altere `JWT_SECRET` para uma chave mais segura em produção!

### 3. Iniciar o Backend

```bash
npm start
```

Ou para modo desenvolvimento com auto-reload:
```bash
npm run dev
```

O servidor estará rodando em `http://localhost:5000`

### 4. Abrir o Frontend

Abra o arquivo `frontend/index.html` em seu navegador (ou use um servidor local como Live Server do VS Code).

## 📁 Estrutura do Projeto

```
Sistema-ECRI/
├── backend/
│   ├── config/
│   │   └── database.js         # Configuração do banco de dados
│   ├── middleware/
│   │   └── auth.js             # Autenticação e autorização
│   ├── routes/
│   │   ├── auth.js             # Login e registro
│   │   ├── equipista.js        # Rotas do equipista
│   │   ├── coordenador.js      # Rotas do coordenador
│   │   └── dirigentes.js       # Rotas da equipe dirigente
│   ├── package.json
│   ├── .env
│   └── server.js               # Arquivo principal
├── frontend/
│   ├── css/
│   │   └── style.css
│   ├── js/
│   │   ├── auth.js
│   │   ├── equipista.js
│   │   ├── coordenador.js
│   │   └── dirigentes.js
│   ├── index.html              # Página de login/registro
│   ├── equipista.html
│   ├── coordenador.html
│   └── dirigentes.html
└── README.md
```

## 🔐 Fluxo de Autenticação

1. Usuário faz login em `index.html`
2. Backend valida credenciais e retorna JWT token
3. Token é armazenado no localStorage
4. Usuário é redirecionado para seu dashboard baseado no perfil
5. Todas as requisições subsequentes incluem o token JWT

## 🗄️ Banco de Dados

O sistema usa **SQLite** com as seguintes tabelas:

- **usuarios**: Dados de todos os usuários
- **pagamentos**: Solicitações de pagamento
- **solicitacoes_blusa**: Solicitações de blusas
- **equipes**: Equipes cadastradas
- **historico**: Histórico de ações

## 📸 Upload de Fotos

As fotos de perfil são convertidas para Base64 e armazenadas diretamente no banco de dados. Máximo de 5MB por imagem.

## 🔧 Endpoints da API

### Autenticação
- `POST /api/auth/registro` - Registrar novo equipista
- `POST /api/auth/login` - Fazer login

### Equipista
- `GET /api/equipista/perfil` - Obter dados do perfil
- `PUT /api/equipista/perfil` - Atualizar perfil
- `POST /api/equipista/solicitar-blusa` - Solicitar blusa
- `POST /api/equipista/solicitar-pagamento` - Solicitar pagamento
- `GET /api/equipista/status` - Obter status

### Coordenador
- `GET /api/coordenador/pagamentos-pendentes` - Lista de pagamentos
- `GET /api/coordenador/solicitacoes-blusa` - Lista de blusas
- `PUT /api/coordenador/confirmar-pagamento/:id` - Confirmar pagamento

### Equipe Dirigente
- `GET /api/dirigentes/usuarios` - Listar todos os usuários
- `GET /api/dirigentes/relatorio/geral` - Relatório geral
- `GET /api/dirigentes/relatorio/equipe/:equipe` - Relatório por equipe
- `GET /api/dirigentes/situacao` - Situação geral
- `PUT /api/dirigentes/escalar-coordenador/:usuario_id` - Escalar para coordenador
- `PUT /api/dirigentes/escalar-equipe/:usuario_id` - Escalar para equipe

## 🚀 Melhorias Futuras

- [ ] Integração com serviço de pagamento (Stripe, PayPal)
- [ ] Upload de fotos em serviço cloud (AWS S3, Firebase)
- [ ] Notificações por email
- [ ] Sistema de permissões mais granular
- [ ] Exportação de relatórios em PDF
- [ ] Aplicativo mobile
- [ ] Autenticação com OAuth (Google, Facebook)

## 📝 Notas de Segurança

- ⚠️ Altere `JWT_SECRET` em produção
- ⚠️ Use HTTPS em produção
- ⚠️ Configure CORS adequadamente
- ⚠️ Valide todos os inputs no backend
- ⚠️ Implemente rate limiting

## 🆘 Troubleshooting

**Erro: "Cannot find module"**
```bash
npm install
```

**Banco de dados corrompido:**
```bash
rm sistema_ecri.db
npm start  # Recria o banco
```

**CORS erro:**
- Verificar se o backend está rodando em `http://localhost:5000`
- Verificar se o frontend está acessando pela URL correta

## 📧 Suporte

Para dúvidas ou problemas, entre em contato com o desenvolvedor.

---

**Desenvolvido com ❤️ para o Sistema ECRI**
