# Sistema ECRI - Guia de Testes

## Usuários de Teste Pré-configurados

Após instalar as dependências e iniciar o servidor, você pode criar estes usuários de teste:

### 1. Equipista (Teste)
```
Email: equipista@teste.com
Senha: 123456
Nome: João Silva
Crachá: João
Telefone: (11) 98765-4321
Movimento: ECC
```

### 2. Coordenador (Teste)
```
Email: coordenador@teste.com
Senha: 123456
Nome: Maria Santos
Crachá: Maria
Telefone: (11) 97654-3210
Movimento: EJC
```

### 3. Equipe Dirigente (Teste)
```
Email: dirigente@teste.com
Senha: 123456
Nome: Pedro Costa
Crachá: Pedro
Telefone: (11) 96543-2109
Movimento: EC
```

## Roteiro de Testes Sugerido

### Teste 1: Cadastro e Login
1. Abra `frontend/index.html`
2. Clique em "Registro"
3. Preencha os dados de um novo equipista
4. Clique em "Criar Conta"
5. Volte para "Login" e entre com as credenciais criadas
6. Você será redirecionado para o dashboard do equipista

### Teste 2: Perfil do Equipista
1. Na aba "Meu Perfil", atualize o nome para o crachá
2. Faça upload de uma foto de perfil
3. Adicione restrições médicas/alimentares/medicação
4. Clique "Salvar"

### Teste 3: Solicitar Blusa e Pagamento
1. Na aba "Solicitar Blusa", escolha um tamanho e clique em "Solicitar"
2. Na aba "Pagamento", escolha tipo e valor, clique em "Solicitar Pagamento"
3. Na aba "Status", veja as solicitações

### Teste 4: Coordenador - Confirmar Pagamentos
1. Mude manualmente o perfil do usuário no banco para 'coordenador' OU
2. Use o Equipe Dirigente para escalar um usuário para coordenador
3. Faça login como coordenador
4. Vá para a aba "Pagamentos"
5. Clique em "Confirmar" para aprovar um pagamento

### Teste 5: Equipe Dirigente - Gerenciar Usuários
1. Para criar um usuário como dirigente, você precisa editar o banco de dados diretamente OU
2. Um coordenador/dirigente pode escalar alguém
3. Faça login como dirigente
4. Na aba "Gerenciar Usuários", veja todos os usuários
5. Clique em "Escalar" para promover alguém a coordenador ou atribuir a equipe

### Teste 6: Relatórios
1. Na aba "Relatório Geral", veja estatísticas gerais
2. Veja os gráficos de distribuição de perfis e status

## Script para Popular o Banco com Dados de Teste

Se desejar, você pode criar um script SQL para popular o banco. Abra um terminal no backend e execute:

```bash
node -e "
const db = require('better-sqlite3')('./sistema_ecri.db');
const bcrypt = require('bcryptjs');

// Adicione aqui comandos SQL para popular o banco
"
```

## Notas Importantes

- O banco de dados SQLite é criado automaticamente na primeira execução
- Todas as senhas são hasheadas com bcrypt
- Os tokens JWT expiram em 7 dias
- Você pode deletar `sistema_ecri.db` para resetar o banco

## Verificar Dados no Banco

Para ver os dados no banco de dados SQLite, você pode usar:

```bash
sqlite3 sistema_ecri.db
```

Exemplo de queries úteis:
```sql
SELECT * FROM usuarios;
SELECT * FROM pagamentos;
SELECT * FROM solicitacoes_blusa;
```
