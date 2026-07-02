const database = require('../config/database');
const { equipeSemEquipe } = require('./equipes');
const { enviarPushParaUsuario } = require('./pushFirebase');

async function criarNotificacao(usuarioId, dados) {
  if (!usuarioId || !dados?.titulo || !dados?.mensagem || !dados?.tipo) return null;

  const resultado = await database.run(
    `INSERT INTO notificacoes (usuario_id, titulo, mensagem, tipo, referencia_tipo, referencia_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      Number(usuarioId),
      String(dados.titulo),
      String(dados.mensagem),
      String(dados.tipo),
      dados.referencia_tipo || null,
      dados.referencia_id || null
    ]
  );

  enviarPushParaUsuario(usuarioId, {
    ...dados,
    id: resultado.lastID
  }).catch(err => console.error('Erro ao disparar push:', err));

  return resultado;
}

async function criarNotificacoesParaUsuarios(usuarioIds, dados) {
  const idsUnicos = [...new Set((usuarioIds || []).map(Number).filter(Boolean))];
  for (const usuarioId of idsUnicos) {
    await criarNotificacao(usuarioId, dados);
  }
  return idsUnicos.length;
}

async function criarNotificacoesParaEquipe(equipe, dados, opcoes = {}) {
  if (!equipe || equipeSemEquipe(equipe)) return 0;

  const excluirIds = new Set((opcoes.excluirIds || []).map(Number).filter(Boolean));
  const usuarios = await database.all(
    `SELECT id FROM usuarios
     WHERE equipe = ?
       AND status NOT IN ('desistiu', 'negou', 'contato_errado')`,
    [equipe]
  );
  const ids = usuarios.map(usuario => Number(usuario.id)).filter(id => !excluirIds.has(id));
  return criarNotificacoesParaUsuarios(ids, dados);
}

module.exports = {
  criarNotificacao,
  criarNotificacoesParaUsuarios,
  criarNotificacoesParaEquipe
};
