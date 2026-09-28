const { obterValoresBlusa } = require('./precoBlusa');

async function criarTabelasFinanceiroExternos(executar, postgres) {
  const id = postgres ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT';
  const data = postgres ? 'TIMESTAMP' : 'DATETIME';
  for (const [tabela, campos] of [
    ['pagamentos_externos', "tipo TEXT NOT NULL DEFAULT 'taxa', UNIQUE(pessoa_externa_id)"],
    ['solicitacoes_blusa_externos', `tamanho TEXT NOT NULL, tamanho_atualizado_por INTEGER, tamanho_atualizado_em ${data}`]
  ]) {
    await executar(`CREATE TABLE IF NOT EXISTS ${tabela} (
      id ${id},
      pessoa_externa_id INTEGER NOT NULL REFERENCES pessoas_externas(id),
      valor DOUBLE PRECISION NOT NULL,
      status TEXT NOT NULL DEFAULT 'pendente',
      data_solicitacao ${data} DEFAULT CURRENT_TIMESTAMP,
      data_confirmacao ${data},
      forma_pagamento TEXT,
      confirmado_por INTEGER,
      ${campos}
    )`);
  }
}

async function recalcularBlusasExternas(database, pessoaId) {
  const pedidos = await database.all("SELECT id FROM solicitacoes_blusa_externos WHERE pessoa_externa_id = ? AND status = 'pendente'", [pessoaId]);
  const valores = await obterValoresBlusa(database);
  const valor = pedidos.length > 1 ? valores.multipla : valores.unica;
  await database.run("UPDATE solicitacoes_blusa_externos SET valor = ? WHERE pessoa_externa_id = ? AND status = 'pendente'", [valor, pessoaId]);
  return { quantidade: pedidos.length, valor };
}

// Transferência atômica: ao cadastrar, a pessoa mantém pedidos, valores e baixas.
async function transferirFinanceiroExterno(database, pessoaId, usuarioId) {
  await database.transaction(async tx => {
    if (database.usingPostgres) await tx.run('SELECT id FROM pessoas_externas WHERE id = ? FOR UPDATE', [pessoaId]);
    await tx.run(`INSERT INTO pagamentos (usuario_id, tipo, valor, status, data_solicitacao, data_confirmacao, forma_pagamento, confirmado_por)
      SELECT ?, tipo, valor, status, data_solicitacao, data_confirmacao, forma_pagamento, confirmado_por
      FROM pagamentos_externos WHERE pessoa_externa_id = ?`, [usuarioId, pessoaId]);
    await tx.run(`INSERT INTO solicitacoes_blusa (usuario_id, tamanho, valor, status, data_solicitacao, data_confirmacao, forma_pagamento, confirmado_por, tamanho_atualizado_por, tamanho_atualizado_em)
      SELECT ?, tamanho, valor, status, data_solicitacao, data_confirmacao, forma_pagamento, confirmado_por, tamanho_atualizado_por, tamanho_atualizado_em
      FROM solicitacoes_blusa_externos WHERE pessoa_externa_id = ?`, [usuarioId, pessoaId]);
    await tx.run('DELETE FROM pagamentos_externos WHERE pessoa_externa_id = ?', [pessoaId]);
    await tx.run('DELETE FROM solicitacoes_blusa_externos WHERE pessoa_externa_id = ?', [pessoaId]);
  });
}

module.exports = { criarTabelasFinanceiroExternos, recalcularBlusasExternas, transferirFinanceiroExterno };
