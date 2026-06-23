# 📸 Como Acessar o Banco de Dados de Imagens

O Sistema ECRI armazena as imagens de perfil dos usuários no banco de dados SQLite em formato **Base64**. Aqui estão as formas de acessar essas imagens:

## 🚀 Opção 1: Usar Scripts Node.js (Recomendado)

### 1️⃣ Listar Todas as Imagens

Veja quais usuários têm fotos e quanto espaço elas ocupam:

```bash
cd backend
node listar-imagens.js
```

Saída esperada:
```
═════════════════════════════════════════════════════════
📸 IMAGENS DE PERFIL DO BANCO DE DADOS
═════════════════════════════════════════════════════════

ID  | Nome Completo          | Email                    | Perfil           | Foto | Tamanho
─────────────────────────────────────────────────────────...
1   | Admin Sistema          | admin@teste.com          | equipe_dirigente | SIM ✅ | 150.50 KB
2   | João Silva             | equipista@teste.com      | equipista        | SIM ✅ | 200.75 KB
...

📊 RESUMO:
   Total de usuários: 5
   Com foto: 3 ✅
   Sem foto: 2 ❌
   Tamanho total de imagens: 2.45 MB
```

### 2️⃣ Exportar Imagens para Arquivos

Extrai todas as imagens do banco e salva como arquivos PNG/JPG:

```bash
cd backend
node exportar-imagens.js
```

As imagens serão salvas em: `Sistema-ECRI/imagens_exportadas/`

Exemplo:
```
✅ 1. Admin Sistema
   📧 Email: admin@teste.com
   📁 Arquivo: 1_admin.jpg
   📏 Tamanho: 150.50 KB

✅ 2. João Silva
   📧 Email: equipista@teste.com
   📁 Arquivo: 2_equipista.png
   📏 Tamanho: 200.75 KB
```

---

## 🗄️ Opção 2: Usar SQLite Diretamente

### Instalação do SQLite (se não tiver)

**Windows:**
```bash
choco install sqlite
```

Ou baixe em: https://www.sqlite.org/download.html

**Mac:**
```bash
brew install sqlite3
```

**Linux:**
```bash
sudo apt-get install sqlite3
```

### Acessar o Banco

```bash
cd backend
sqlite3 sistema_ecri.db
```

### Comandos Úteis no SQLite

**Ver todas as colunas da tabela usuarios:**
```sql
.schema usuarios
```

**Ver informações dos usuários com foto:**
```sql
SELECT id, email, nome_completo, 
       LENGTH(foto_perfil) as tamanho_bytes,
       SUBSTR(foto_perfil, 1, 50) as preview
FROM usuarios 
WHERE foto_perfil IS NOT NULL;
```

**Ver detalhes de um usuário específico:**
```sql
SELECT id, email, nome_completo, nome_cracha, perfil, 
       LENGTH(foto_perfil) as tamanho_foto
FROM usuarios 
WHERE id = 1;
```

**Contar quantos usuários têm foto:**
```sql
SELECT 
  COUNT(*) as total,
  SUM(CASE WHEN foto_perfil IS NOT NULL THEN 1 ELSE 0 END) as com_foto,
  SUM(CASE WHEN foto_perfil IS NULL THEN 1 ELSE 0 END) as sem_foto
FROM usuarios;
```

**Sair do SQLite:**
```sql
.quit
```

---

## 💾 Opção 3: Usar o SQLite Browser (Interface Gráfica)

Baixe o **DB Browser for SQLite** em: https://sqlitebrowser.org/

1. Abra o programa
2. Clique em "Open Database"
3. Selecione: `Sistema-ECRI/backend/sistema_ecri.db`
4. Navegue pela tabela `usuarios` na aba "Browse Data"
5. Você pode visualizar:
   - Nomes dos usuários
   - Emails
   - Tamanho das fotos (coluna `foto_perfil`)

---

## 📊 Estrutura da Tabela de Usuários

```sql
CREATE TABLE usuarios (
  id INTEGER PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  senha TEXT NOT NULL,
  nome_completo TEXT NOT NULL,
  nome_cracha TEXT NOT NULL,
  telefone TEXT NOT NULL,
  movimento_origem TEXT NOT NULL,
  foto_perfil LONGTEXT,              -- IMAGENS EM BASE64 AQUI
  restricao_medica TEXT,
  restricao_alimentar TEXT,
  restricao_medicacao TEXT,
  perfil TEXT NOT NULL DEFAULT 'equipista',
  status TEXT DEFAULT 'pendente',
  data_cadastro DATETIME DEFAULT CURRENT_TIMESTAMP,
  equipe TEXT
);
```

---

## 🔍 Formato das Imagens Armazenadas

As imagens são convertidas para **Base64** e armazenadas assim:

```
data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAoACgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlbaWmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigAooooAKKKKACiiigAooooAKKKKACiiigD/2Q==
```

Quando o usuário vê a imagem no frontend, o navegador automaticamente converte esse Base64 de volta para uma imagem.

---

## 🛠️ Gerenciamento de Imagens

### Limpar Todas as Imagens do Banco

```sql
UPDATE usuarios SET foto_perfil = NULL;
```

### Deletar Imagens de um Usuário Específico

```sql
UPDATE usuarios SET foto_perfil = NULL WHERE id = 1;
```

### Ver Tamanho Total de Imagens

```sql
SELECT 
  COUNT(*) as total_imagens,
  ROUND(SUM(LENGTH(foto_perfil)) / 1024.0 / 1024.0, 2) as tamanho_MB
FROM usuarios 
WHERE foto_perfil IS NOT NULL;
```

---

## 📝 Notas Importantes

- ⚠️ Imagens muito grandes podem deixar o banco lento
- 💾 Tamanho máximo recomendado: **5MB** por imagem
- 🔒 As imagens estão protegidas por autenticação JWT
- 📱 O formato Base64 é universal e funciona em todos os navegadores
- 🗑️ Se quiser limpar espaço, exporte as imagens e delete do banco

---

## 📞 Suporte

Se tiver problemas ao acessar as imagens, verifique:
- ✅ Servidor Node está rodando (`npm start`)
- ✅ Banco de dados existe em `backend/sistema_ecri.db`
- ✅ Tem permissão de leitura no arquivo do banco
- ✅ SQLite3 está instalado (se usar CLI)
