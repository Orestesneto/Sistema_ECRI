const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, '../sistema_ecri.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Erro ao conectar ao banco de dados:', err);
  } else {
    console.log('✅ Conectado ao banco de dados SQLite');
  }
});

const initDb = () => {
  db.serialize(() => {
    // Tabela de Usuários
    db.run(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        senha TEXT NOT NULL,
        nome_completo TEXT NOT NULL,
        nome_cracha TEXT NOT NULL,
        telefone TEXT NOT NULL,
        paroquia TEXT,
        cpf TEXT,
        data_nascimento TEXT,
        ano_encontro TEXT,
        toca_instrumento TEXT,
        instrumentos TEXT,
        canta TEXT,
        equipes_servidas TEXT,
        movimento_origem TEXT NOT NULL,
        foto_perfil LONGTEXT,
        restricao_medica TEXT,
        restricao_alimentar TEXT,
        restricao_medicacao TEXT,
        perfil TEXT NOT NULL DEFAULT 'equipista',
        status TEXT DEFAULT 'pendente',
        data_cadastro DATETIME DEFAULT CURRENT_TIMESTAMP,
        equipe TEXT
      )
    `);

    db.run(`ALTER TABLE usuarios ADD COLUMN cpf TEXT`, () => {});
    db.run(`ALTER TABLE usuarios ADD COLUMN data_nascimento TEXT`, () => {});
    db.run(`ALTER TABLE usuarios ADD COLUMN ano_encontro TEXT`, () => {});
    db.run(`ALTER TABLE usuarios ADD COLUMN toca_instrumento TEXT`, () => {});
    db.run(`ALTER TABLE usuarios ADD COLUMN instrumentos TEXT`, () => {});
    db.run(`ALTER TABLE usuarios ADD COLUMN canta TEXT`, () => {});
    db.run(`ALTER TABLE usuarios ADD COLUMN equipes_servidas TEXT`, () => {});
    db.run(`ALTER TABLE usuarios ADD COLUMN paroquia TEXT`, () => {});
    db.run(`ALTER TABLE pagamentos ADD COLUMN forma_pagamento TEXT`, () => {});
    db.run(`ALTER TABLE pagamentos ADD COLUMN mercado_pago_preference_id TEXT`, () => {});
    db.run(`ALTER TABLE pagamentos ADD COLUMN mercado_pago_init_point TEXT`, () => {});
    db.run(`ALTER TABLE pagamentos ADD COLUMN mercado_pago_sandbox_init_point TEXT`, () => {});
    db.run(`ALTER TABLE pagamentos ADD COLUMN referencia_externa TEXT`, () => {});
    db.run(`ALTER TABLE solicitacoes_blusa ADD COLUMN forma_pagamento TEXT`, () => {});
    db.run(`ALTER TABLE solicitacoes_blusa ADD COLUMN valor REAL`, () => {});

    db.run(`
      CREATE TABLE IF NOT EXISTS configuracoes (
        chave TEXT PRIMARY KEY,
        valor TEXT NOT NULL,
        data_atualizacao DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS tokens_confirmacao_utilizados (
        jti TEXT PRIMARY KEY,
        tipo_cadastro TEXT NOT NULL,
        participante_id INTEGER NOT NULL,
        data_utilizacao DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS links_encurtados (
        codigo TEXT PRIMARY KEY,
        destino TEXT NOT NULL,
        data_criacao DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Tabela de Pagamentos
    db.run(`
      CREATE TABLE IF NOT EXISTS pagamentos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario_id INTEGER NOT NULL,
        tipo TEXT NOT NULL,
        valor REAL NOT NULL,
        status TEXT DEFAULT 'pendente',
        data_solicitacao DATETIME DEFAULT CURRENT_TIMESTAMP,
        data_confirmacao DATETIME,
        forma_pagamento TEXT,
        mercado_pago_preference_id TEXT,
        mercado_pago_init_point TEXT,
        mercado_pago_sandbox_init_point TEXT,
        referencia_externa TEXT,
        confirmado_por INTEGER,
        FOREIGN KEY(usuario_id) REFERENCES usuarios(id)
      )
    `);
    db.run(`ALTER TABLE pagamentos ADD COLUMN mercado_pago_preference_id TEXT`, () => {});
    db.run(`ALTER TABLE pagamentos ADD COLUMN mercado_pago_init_point TEXT`, () => {});
    db.run(`ALTER TABLE pagamentos ADD COLUMN mercado_pago_sandbox_init_point TEXT`, () => {});
    db.run(`ALTER TABLE pagamentos ADD COLUMN referencia_externa TEXT`, () => {});

    // Tabela de Solicitações de Blusa
    db.run(`
      CREATE TABLE IF NOT EXISTS solicitacoes_blusa (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario_id INTEGER NOT NULL,
        tamanho TEXT NOT NULL,
        valor REAL,
        status TEXT DEFAULT 'pendente',
        data_solicitacao DATETIME DEFAULT CURRENT_TIMESTAMP,
        data_confirmacao DATETIME,
        forma_pagamento TEXT,
        confirmado_por INTEGER,
        FOREIGN KEY(usuario_id) REFERENCES usuarios(id)
      )
    `);

    // Tabela de Equipes
    db.run(`
      CREATE TABLE IF NOT EXISTS equipes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        descricao TEXT,
        data_criacao DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Tabela de Histórico de Ações
    db.run(`
      CREATE TABLE IF NOT EXISTS historico (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario_id INTEGER NOT NULL,
        acao TEXT NOT NULL,
        detalhes TEXT,
        data_acao DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(usuario_id) REFERENCES usuarios(id)
      )
    `);

    // Tabela de Reuniões
    db.run(`
      CREATE TABLE IF NOT EXISTS reunioes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        criada_por INTEGER NOT NULL,
        titulo TEXT NOT NULL,
        descricao TEXT,
        data_reuniao DATE NOT NULL,
        horario_inicio TIME NOT NULL,
        horario_fim TIME,
        local TEXT NOT NULL,
        status TEXT DEFAULT 'agendada',
        data_criacao DATETIME DEFAULT CURRENT_TIMESTAMP,
        data_atualizacao DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(criada_por) REFERENCES usuarios(id)
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS eventos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        descricao TEXT,
        data_evento DATE NOT NULL,
        local TEXT,
        criado_por INTEGER NOT NULL,
        data_criacao DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(criado_por) REFERENCES usuarios(id)
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS evento_usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        evento_id INTEGER NOT NULL,
        usuario_id INTEGER NOT NULL,
        papel_evento TEXT NOT NULL CHECK(papel_evento IN ('coordenador', 'equipista')),
        data_escala DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(evento_id, usuario_id),
        FOREIGN KEY(evento_id) REFERENCES eventos(id),
        FOREIGN KEY(usuario_id) REFERENCES usuarios(id)
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS pessoas_externas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome_completo TEXT NOT NULL,
        nome_cracha TEXT NOT NULL,
        telefone TEXT NOT NULL,
        paroquia TEXT,
        cpf TEXT,
        data_nascimento TEXT,
        ano_encontro TEXT,
        movimento_origem TEXT NOT NULL,
        foto_perfil LONGTEXT,
        restricao_medica TEXT,
        restricao_alimentar TEXT,
        restricao_medicacao TEXT,
        status TEXT DEFAULT 'pendente',
        equipe TEXT NOT NULL,
        criado_por INTEGER NOT NULL,
        data_cadastro DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(criado_por) REFERENCES usuarios(id)
      )
    `);

    db.run(`ALTER TABLE pessoas_externas ADD COLUMN restricao_medica TEXT`, () => {});
    db.run(`ALTER TABLE pessoas_externas ADD COLUMN restricao_alimentar TEXT`, () => {});
    db.run(`ALTER TABLE pessoas_externas ADD COLUMN restricao_medicacao TEXT`, () => {});
    db.run(`ALTER TABLE pessoas_externas ADD COLUMN cpf TEXT`, () => {});
    db.run(`ALTER TABLE pessoas_externas ADD COLUMN data_nascimento TEXT`, () => {});
    db.run(`ALTER TABLE pessoas_externas ADD COLUMN ano_encontro TEXT`, () => {});
    db.run(`ALTER TABLE pessoas_externas ADD COLUMN paroquia TEXT`, () => {});

    db.run(`
      CREATE TABLE IF NOT EXISTS presencas_reuniao (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        reuniao_id INTEGER NOT NULL,
        usuario_id INTEGER NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('presente', 'falta_justificada', 'falta')),
        observacao TEXT,
        registrada_por INTEGER NOT NULL,
        data_registro DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(reuniao_id, usuario_id),
        FOREIGN KEY(reuniao_id) REFERENCES reunioes(id),
        FOREIGN KEY(usuario_id) REFERENCES usuarios(id),
        FOREIGN KEY(registrada_por) REFERENCES usuarios(id)
      )
    `);

    console.log('✅ Tabelas do banco de dados criadas/verificadas');
  });
};

module.exports = {
  db,
  initDb,
  run: (sql, params = []) => {
    return new Promise((resolve, reject) => {
      db.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve(this);
      });
    });
  },
  get: (sql, params = []) => {
    return new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  },
  all: (sql, params = []) => {
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }
};
