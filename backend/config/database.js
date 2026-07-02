const path = require('path');
const bcrypt = require('bcryptjs');

const usingPostgres = Boolean(process.env.DATABASE_URL);
let sqlite = null;
let pgPool = null;
let initPromise = null;
let initializing = false;

if (usingPostgres) {
  const { Pool } = require('pg');
  pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes('sslmode=disable')
      ? false
      : { rejectUnauthorized: false }
  });
} else {
  const sqlite3 = require('sqlite3').verbose();
  const dbPath = process.env.DATABASE || (
    process.env.VERCEL
      ? path.join('/tmp', 'sistema_ecri.db')
      : path.join(__dirname, '../sistema_ecri.db')
  );

  sqlite = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error('Erro ao conectar ao banco de dados:', err);
    else console.log('Conectado ao banco de dados SQLite');
  });
}

function prepararSqlPostgres(sql, params = []) {
  let index = 0;
  let texto = sql
    .replace(/COLLATE NOCASE/gi, '')
    .replace(/INSERT\s+OR\s+IGNORE\s+INTO\s+tokens_confirmacao_utilizados/gi, 'INSERT INTO tokens_confirmacao_utilizados');

  texto = texto.replace(/\?/g, () => `$${++index}`);

  if (/^\s*INSERT\s+INTO\s+tokens_confirmacao_utilizados/i.test(texto) && !/ON\s+CONFLICT/i.test(texto)) {
    texto += ' ON CONFLICT (jti) DO NOTHING';
  }

  const tabelaSemId = /^\s*INSERT\s+INTO\s+(configuracoes|tokens_confirmacao_utilizados|links_encurtados)\b/i.test(texto);
  if (/^\s*INSERT\s+INTO/i.test(texto) && !tabelaSemId && !/RETURNING\b/i.test(texto) && !/ON\s+CONFLICT\s*\([^)]+\)\s*DO\s+UPDATE/i.test(texto)) {
    texto += ' RETURNING id';
  }

  return { texto, params };
}

async function queryPostgres(sql, params = []) {
  const { texto, params: valores } = prepararSqlPostgres(sql, params);
  return pgPool.query(texto, valores);
}

function runSqlite(sql, params = []) {
  return new Promise((resolve, reject) => {
    sqlite.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function getSqlite(sql, params = []) {
  return new Promise((resolve, reject) => {
    sqlite.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function allSqlite(sql, params = []) {
  return new Promise((resolve, reject) => {
    sqlite.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function executar(sql, params = []) {
  if (usingPostgres) {
    const result = await queryPostgres(sql, params);
    return {
      lastID: result.rows?.[0]?.id,
      changes: result.rowCount
    };
  }

  return runSqlite(sql, params);
}

async function obter(sql, params = []) {
  if (usingPostgres) {
    const result = await queryPostgres(sql, params);
    return result.rows[0];
  }

  return getSqlite(sql, params);
}

async function listar(sql, params = []) {
  if (usingPostgres) {
    const result = await queryPostgres(sql, params);
    return result.rows;
  }

  return allSqlite(sql, params);
}

async function addColumnIfMissing(table, definition) {
  if (usingPostgres) {
    await executar(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${definition}`);
    return;
  }

  await executar(`ALTER TABLE ${table} ADD COLUMN ${definition}`).catch(() => {});
}

async function removerTaxasDuplicadasAtivas() {
  if (usingPostgres) {
    await pgPool.query(`
      DELETE FROM pagamentos
      WHERE tipo = 'taxa'
        AND status IN ('pendente', 'confirmado')
        AND id NOT IN (
          SELECT id
          FROM (
            SELECT DISTINCT ON (usuario_id) id
            FROM pagamentos
            WHERE tipo = 'taxa'
              AND status IN ('pendente', 'confirmado')
            ORDER BY usuario_id, CASE WHEN status = 'confirmado' THEN 0 ELSE 1 END, id ASC
          ) manter
        )
    `);
    return;
  }

  await executar(`
    DELETE FROM pagamentos
    WHERE tipo = 'taxa'
      AND status IN ('pendente', 'confirmado')
      AND id NOT IN (
        SELECT id
        FROM (
          SELECT p.id
          FROM pagamentos p
          WHERE p.tipo = 'taxa'
            AND p.status IN ('pendente', 'confirmado')
            AND p.id = (
              SELECT p2.id
              FROM pagamentos p2
              WHERE p2.usuario_id = p.usuario_id
                AND p2.tipo = 'taxa'
                AND p2.status IN ('pendente', 'confirmado')
              ORDER BY CASE WHEN p2.status = 'confirmado' THEN 0 ELSE 1 END, p2.id ASC
              LIMIT 1
            )
        )
      )
  `);
}

async function initPostgres() {
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      senha TEXT NOT NULL,
      nome_completo TEXT NOT NULL,
      nome_cracha TEXT NOT NULL,
      telefone TEXT NOT NULL,
      paroquia TEXT,
      cpf TEXT UNIQUE,
      data_nascimento TEXT,
      ano_encontro TEXT,
      toca_instrumento TEXT,
      instrumentos TEXT,
      canta TEXT,
      equipes_servidas TEXT,
      movimento_origem TEXT NOT NULL,
      foto_perfil TEXT,
      restricao_medica TEXT,
      restricao_alimentar TEXT,
      restricao_medicacao TEXT,
      perfil TEXT NOT NULL DEFAULT 'equipista',
      status TEXT DEFAULT 'pendente',
      data_cadastro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      equipe TEXT,
      pessoa_impedida_servir INTEGER DEFAULT 0,
      pessoa_impedida_motivos TEXT
    )
  `);

  await addColumnIfMissing('usuarios', 'cpf TEXT UNIQUE');
  await addColumnIfMissing('usuarios', 'data_nascimento TEXT');
  await addColumnIfMissing('usuarios', 'ano_encontro TEXT');
  await addColumnIfMissing('usuarios', 'toca_instrumento TEXT');
  await addColumnIfMissing('usuarios', 'instrumentos TEXT');
  await addColumnIfMissing('usuarios', 'canta TEXT');
  await addColumnIfMissing('usuarios', 'equipes_servidas TEXT');
  await addColumnIfMissing('usuarios', 'paroquia TEXT');
  await addColumnIfMissing('usuarios', 'pessoa_impedida_servir INTEGER DEFAULT 0');
  await addColumnIfMissing('usuarios', 'pessoa_impedida_motivos TEXT');
  await pgPool.query(`
    UPDATE usuarios u
    SET cpf = NULL
    WHERE cpf IS NOT NULL
      AND cpf <> ''
      AND id <> (
        SELECT MAX(u2.id)
        FROM usuarios u2
        WHERE u2.cpf = u.cpf
      )
  `);
  await pgPool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS usuarios_cpf_unico
    ON usuarios (cpf)
    WHERE cpf IS NOT NULL AND cpf <> ''
  `);

  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS configuracoes (
      chave TEXT PRIMARY KEY,
      valor TEXT NOT NULL,
      data_atualizacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS tokens_confirmacao_utilizados (
      jti TEXT PRIMARY KEY,
      tipo_cadastro TEXT NOT NULL,
      participante_id INTEGER NOT NULL,
      data_utilizacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS links_encurtados (
      codigo TEXT PRIMARY KEY,
      destino TEXT NOT NULL,
      data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS pagamentos (
      id SERIAL PRIMARY KEY,
      usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
      tipo TEXT NOT NULL,
      valor DOUBLE PRECISION NOT NULL,
      status TEXT DEFAULT 'pendente',
      data_solicitacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      data_confirmacao TIMESTAMP,
      forma_pagamento TEXT,
      mercado_pago_preference_id TEXT,
      mercado_pago_payment_id TEXT,
      mercado_pago_init_point TEXT,
      mercado_pago_sandbox_init_point TEXT,
      pix_qr_code TEXT,
      pix_qr_code_base64 TEXT,
      referencia_externa TEXT,
      confirmado_por INTEGER
    )
  `);
  await addColumnIfMissing('pagamentos', 'forma_pagamento TEXT');
  await addColumnIfMissing('pagamentos', 'mercado_pago_preference_id TEXT');
  await addColumnIfMissing('pagamentos', 'mercado_pago_payment_id TEXT');
  await addColumnIfMissing('pagamentos', 'mercado_pago_init_point TEXT');
  await addColumnIfMissing('pagamentos', 'mercado_pago_sandbox_init_point TEXT');
  await addColumnIfMissing('pagamentos', 'pix_qr_code TEXT');
  await addColumnIfMissing('pagamentos', 'pix_qr_code_base64 TEXT');
  await addColumnIfMissing('pagamentos', 'referencia_externa TEXT');
  await removerTaxasDuplicadasAtivas();

  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS solicitacoes_blusa (
      id SERIAL PRIMARY KEY,
      usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
      tamanho TEXT NOT NULL,
      valor DOUBLE PRECISION,
      status TEXT DEFAULT 'pendente',
      data_solicitacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      data_confirmacao TIMESTAMP,
      forma_pagamento TEXT,
      confirmado_por INTEGER
    )
  `);
  await addColumnIfMissing('solicitacoes_blusa', 'forma_pagamento TEXT');
  await addColumnIfMissing('solicitacoes_blusa', 'valor DOUBLE PRECISION');

  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS equipes (
      id SERIAL PRIMARY KEY,
      nome TEXT NOT NULL,
      descricao TEXT,
      data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS historico (
      id SERIAL PRIMARY KEY,
      usuario_id INTEGER NOT NULL,
      acao TEXT NOT NULL,
      detalhes TEXT,
      data_acao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS usuarios_excluidos (
      id SERIAL PRIMARY KEY,
      usuario_id INTEGER,
      dados TEXT NOT NULL,
      excluido_por TEXT,
      origem TEXT,
      data_exclusao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS reunioes (
      id SERIAL PRIMARY KEY,
      criada_por INTEGER NOT NULL REFERENCES usuarios(id),
      titulo TEXT NOT NULL,
      descricao TEXT,
      data_reuniao DATE NOT NULL,
      horario_inicio TIME NOT NULL,
      horario_fim TIME,
      local TEXT NOT NULL,
      status TEXT DEFAULT 'agendada',
      data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      data_atualizacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS eventos (
      id SERIAL PRIMARY KEY,
      nome TEXT NOT NULL,
      descricao TEXT,
      data_evento DATE NOT NULL,
      local TEXT,
      criado_por INTEGER NOT NULL REFERENCES usuarios(id),
      data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS evento_usuarios (
      id SERIAL PRIMARY KEY,
      evento_id INTEGER NOT NULL REFERENCES eventos(id),
      usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
      papel_evento TEXT NOT NULL CHECK(papel_evento IN ('coordenador', 'equipista')),
      data_escala TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(evento_id, usuario_id)
    )
  `);

  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS pessoas_externas (
      id SERIAL PRIMARY KEY,
      nome_completo TEXT NOT NULL,
      nome_cracha TEXT NOT NULL,
      telefone TEXT NOT NULL,
      paroquia TEXT,
      cpf TEXT,
      data_nascimento TEXT,
      ano_encontro TEXT,
      movimento_origem TEXT NOT NULL,
      foto_perfil TEXT,
      restricao_medica TEXT,
      restricao_alimentar TEXT,
      restricao_medicacao TEXT,
      status TEXT DEFAULT 'pendente',
      equipe TEXT NOT NULL,
      criado_por INTEGER NOT NULL REFERENCES usuarios(id),
      data_cadastro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await addColumnIfMissing('pessoas_externas', 'restricao_medica TEXT');
  await addColumnIfMissing('pessoas_externas', 'restricao_alimentar TEXT');
  await addColumnIfMissing('pessoas_externas', 'restricao_medicacao TEXT');
  await addColumnIfMissing('pessoas_externas', 'cpf TEXT');
  await addColumnIfMissing('pessoas_externas', 'data_nascimento TEXT');
  await addColumnIfMissing('pessoas_externas', 'ano_encontro TEXT');
  await addColumnIfMissing('pessoas_externas', 'paroquia TEXT');

  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS presencas_reuniao (
      id SERIAL PRIMARY KEY,
      reuniao_id INTEGER NOT NULL REFERENCES reunioes(id),
      usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
      status TEXT NOT NULL CHECK(status IN ('presente', 'falta_justificada', 'falta')),
      observacao TEXT,
      registrada_por INTEGER NOT NULL REFERENCES usuarios(id),
      data_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(reuniao_id, usuario_id)
    )
  `);

  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS mensagens_chamada_enviadas (
      id SERIAL PRIMARY KEY,
      reuniao_id INTEGER NOT NULL REFERENCES reunioes(id),
      usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
      tipo_mensagem TEXT NOT NULL,
      enviada_por INTEGER NOT NULL REFERENCES usuarios(id),
      data_envio TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(reuniao_id, usuario_id, tipo_mensagem)
    )
  `);

  await seedDirigenteInicial();
  console.log('Tabelas do banco PostgreSQL criadas/verificadas');
}

async function initSqlite() {
  await executar(`
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
      equipe TEXT,
      pessoa_impedida_servir INTEGER DEFAULT 0,
      pessoa_impedida_motivos TEXT
    )
  `);

  await addColumnIfMissing('usuarios', 'cpf TEXT');
  await addColumnIfMissing('usuarios', 'data_nascimento TEXT');
  await addColumnIfMissing('usuarios', 'ano_encontro TEXT');
  await addColumnIfMissing('usuarios', 'toca_instrumento TEXT');
  await addColumnIfMissing('usuarios', 'instrumentos TEXT');
  await addColumnIfMissing('usuarios', 'canta TEXT');
  await addColumnIfMissing('usuarios', 'equipes_servidas TEXT');
  await addColumnIfMissing('usuarios', 'paroquia TEXT');
  await addColumnIfMissing('usuarios', 'pessoa_impedida_servir INTEGER DEFAULT 0');
  await addColumnIfMissing('usuarios', 'pessoa_impedida_motivos TEXT');

  await executar(`CREATE TABLE IF NOT EXISTS configuracoes (chave TEXT PRIMARY KEY, valor TEXT NOT NULL, data_atualizacao DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  await executar(`CREATE TABLE IF NOT EXISTS tokens_confirmacao_utilizados (jti TEXT PRIMARY KEY, tipo_cadastro TEXT NOT NULL, participante_id INTEGER NOT NULL, data_utilizacao DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  await executar(`CREATE TABLE IF NOT EXISTS links_encurtados (codigo TEXT PRIMARY KEY, destino TEXT NOT NULL, data_criacao DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  await executar(`
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
      mercado_pago_payment_id TEXT,
      mercado_pago_init_point TEXT,
      mercado_pago_sandbox_init_point TEXT,
      pix_qr_code TEXT,
      pix_qr_code_base64 TEXT,
      referencia_externa TEXT,
      confirmado_por INTEGER,
      FOREIGN KEY(usuario_id) REFERENCES usuarios(id)
    )
  `);
  await addColumnIfMissing('pagamentos', 'forma_pagamento TEXT');
  await addColumnIfMissing('pagamentos', 'mercado_pago_preference_id TEXT');
  await addColumnIfMissing('pagamentos', 'mercado_pago_payment_id TEXT');
  await addColumnIfMissing('pagamentos', 'mercado_pago_init_point TEXT');
  await addColumnIfMissing('pagamentos', 'mercado_pago_sandbox_init_point TEXT');
  await addColumnIfMissing('pagamentos', 'pix_qr_code TEXT');
  await addColumnIfMissing('pagamentos', 'pix_qr_code_base64 TEXT');
  await addColumnIfMissing('pagamentos', 'referencia_externa TEXT');
  await removerTaxasDuplicadasAtivas();

  await executar(`
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
  await addColumnIfMissing('solicitacoes_blusa', 'forma_pagamento TEXT');
  await addColumnIfMissing('solicitacoes_blusa', 'valor REAL');

  await executar(`CREATE TABLE IF NOT EXISTS equipes (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, descricao TEXT, data_criacao DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  await executar(`CREATE TABLE IF NOT EXISTS historico (id INTEGER PRIMARY KEY AUTOINCREMENT, usuario_id INTEGER NOT NULL, acao TEXT NOT NULL, detalhes TEXT, data_acao DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(usuario_id) REFERENCES usuarios(id))`);
  await executar(`CREATE TABLE IF NOT EXISTS usuarios_excluidos (id INTEGER PRIMARY KEY AUTOINCREMENT, usuario_id INTEGER, dados TEXT NOT NULL, excluido_por TEXT, origem TEXT, data_exclusao DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  await executar(`
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
  await executar(`CREATE TABLE IF NOT EXISTS eventos (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, descricao TEXT, data_evento DATE NOT NULL, local TEXT, criado_por INTEGER NOT NULL, data_criacao DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(criado_por) REFERENCES usuarios(id))`);
  await executar(`CREATE TABLE IF NOT EXISTS evento_usuarios (id INTEGER PRIMARY KEY AUTOINCREMENT, evento_id INTEGER NOT NULL, usuario_id INTEGER NOT NULL, papel_evento TEXT NOT NULL CHECK(papel_evento IN ('coordenador', 'equipista')), data_escala DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE(evento_id, usuario_id), FOREIGN KEY(evento_id) REFERENCES eventos(id), FOREIGN KEY(usuario_id) REFERENCES usuarios(id))`);
  await executar(`
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
  await addColumnIfMissing('pessoas_externas', 'restricao_medica TEXT');
  await addColumnIfMissing('pessoas_externas', 'restricao_alimentar TEXT');
  await addColumnIfMissing('pessoas_externas', 'restricao_medicacao TEXT');
  await addColumnIfMissing('pessoas_externas', 'cpf TEXT');
  await addColumnIfMissing('pessoas_externas', 'data_nascimento TEXT');
  await addColumnIfMissing('pessoas_externas', 'ano_encontro TEXT');
  await addColumnIfMissing('pessoas_externas', 'paroquia TEXT');
  await executar(`CREATE TABLE IF NOT EXISTS presencas_reuniao (id INTEGER PRIMARY KEY AUTOINCREMENT, reuniao_id INTEGER NOT NULL, usuario_id INTEGER NOT NULL, status TEXT NOT NULL CHECK(status IN ('presente', 'falta_justificada', 'falta')), observacao TEXT, registrada_por INTEGER NOT NULL, data_registro DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE(reuniao_id, usuario_id), FOREIGN KEY(reuniao_id) REFERENCES reunioes(id), FOREIGN KEY(usuario_id) REFERENCES usuarios(id), FOREIGN KEY(registrada_por) REFERENCES usuarios(id))`);
  await executar(`CREATE TABLE IF NOT EXISTS mensagens_chamada_enviadas (id INTEGER PRIMARY KEY AUTOINCREMENT, reuniao_id INTEGER NOT NULL, usuario_id INTEGER NOT NULL, tipo_mensagem TEXT NOT NULL, enviada_por INTEGER NOT NULL, data_envio DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE(reuniao_id, usuario_id, tipo_mensagem), FOREIGN KEY(reuniao_id) REFERENCES reunioes(id), FOREIGN KEY(usuario_id) REFERENCES usuarios(id), FOREIGN KEY(enviada_por) REFERENCES usuarios(id))`);

  await seedDirigenteInicial();
  console.log('Tabelas do banco SQLite criadas/verificadas');
}

async function seedDirigenteInicial() {
  const cpf = String(process.env.INITIAL_DIRIGENTE_CPF || '11111111111').replace(/\D/g, '');
  const senha = String(process.env.INITIAL_DIRIGENTE_SENHA || '01012000').trim();
  const email = String(process.env.INITIAL_DIRIGENTE_EMAIL || `${cpf}@cpf.ecri.local`).trim().toLowerCase();
  const nomeCompleto = String(process.env.INITIAL_DIRIGENTE_NOME || 'ADMINISTRADOR DO SISTEMA').trim().toUpperCase();
  const nomeCracha = String(process.env.INITIAL_DIRIGENTE_CRACHA || 'ADMIN').trim().toUpperCase();
  const telefone = String(process.env.INITIAL_DIRIGENTE_TELEFONE || '(11) 99999-9999').trim();
  const dataNascimento = String(process.env.INITIAL_DIRIGENTE_DATA_NASCIMENTO || senha).replace(/\D/g, '');

  if (!cpf || !senha) return;

  const senhaHash = await bcrypt.hash(senha, 10);
  const usuario = await obter('SELECT id FROM usuarios WHERE cpf = ?', [cpf]);
  if (usuario) return;

  await executar(
    `INSERT INTO usuarios (
      email, senha, nome_completo, nome_cracha, telefone, paroquia, cpf, data_nascimento,
      ano_encontro, toca_instrumento, instrumentos, canta, equipes_servidas,
      movimento_origem, perfil, status, equipe
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      email,
      senhaHash,
      nomeCompleto,
      nomeCracha,
      telefone,
      'SAO PEDRO E SAO PAULO',
      cpf,
      dataNascimento,
      '2026',
      'nao',
      '',
      'nao',
      JSON.stringify([]),
      'ECRI',
      'equipe_dirigente',
      'confirmado',
      'EQUIPE DIRIGENTE'
    ]
  );
}

const initDb = () => {
  if (!initPromise) {
    initializing = true;
    initPromise = (usingPostgres ? initPostgres() : initSqlite())
      .finally(() => {
        initializing = false;
      });
  }

  return initPromise;
};

async function ensureReady() {
  if (!initPromise) initDb();
  await initPromise;
}

module.exports = {
  db: sqlite || pgPool,
  initDb,
  run: async (sql, params = []) => {
    await ensureReady();
    return executar(sql, params);
  },
  get: async (sql, params = []) => {
    await ensureReady();
    return obter(sql, params);
  },
  all: async (sql, params = []) => {
    await ensureReady();
    return listar(sql, params);
  }
};
