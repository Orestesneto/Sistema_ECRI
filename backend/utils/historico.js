const database = require('../config/database');

async function registrarHistorico(usuarioId, acao, detalhes = {}) {
  try {
    await database.run(
      'INSERT INTO historico (usuario_id, acao, detalhes) VALUES (?, ?, ?)',
      [usuarioId || 0, acao, JSON.stringify(detalhes)]
    );
  } catch (err) {
    console.error('Erro ao registrar historico:', err.message);
  }
}

module.exports = {
  registrarHistorico
};
