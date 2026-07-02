const express = require('express');
const database = require('../config/database');
const { verificarToken } = require('../middleware/auth');
const { criarNotificacao } = require('../utils/notificacoes');
const { obterStatusPushFirebase } = require('../utils/pushFirebase');

const router = express.Router();

router.get('/push/status', verificarToken, async (req, res) => {
  try {
    const dispositivosAtivos = await database.get(
      'SELECT COUNT(*) AS total FROM dispositivos_push WHERE usuario_id = ? AND COALESCE(ativo, 1) = 1',
      [req.usuario.id]
    );
    res.json({
      ...obterStatusPushFirebase(),
      dispositivos_ativos: Number(dispositivosAtivos?.total || 0)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao consultar status do push' });
  }
});

router.post('/push/teste', verificarToken, async (req, res) => {
  try {
    const titulo = String(req.body?.titulo || 'ECRI 2026').trim();
    const mensagem = String(req.body?.mensagem || 'Notificacao de teste enviada pelo Sistema ECRI.').trim();

    await criarNotificacao(req.usuario.id, {
      titulo,
      mensagem,
      tipo: 'teste_push',
      referencia_tipo: 'notificacao',
      referencia_id: null
    });

    res.json({ mensagem: 'Notificacao de teste criada' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao enviar notificacao de teste' });
  }
});

router.get('/', verificarToken, async (req, res) => {
  try {
    const usuarioId = req.usuario.id;
    const apenasNaoLidas = String(req.query.nao_lidas || '') === '1';
    const limite = Math.min(Number(req.query.limite || 20) || 20, 50);
    const filtro = apenasNaoLidas ? 'AND COALESCE(lida, 0) = 0' : '';

    const notificacoes = await database.all(
      `SELECT id, titulo, mensagem, tipo, referencia_tipo, referencia_id, lida, data_criacao
       FROM notificacoes
       WHERE usuario_id = ?
       ${filtro}
       ORDER BY id DESC
       LIMIT ?`,
      [usuarioId, limite]
    );

    res.json(notificacoes);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao carregar notificacoes' });
  }
});

router.put('/lidas', verificarToken, async (req, res) => {
  try {
    const usuarioId = req.usuario.id;
    const ids = Array.isArray(req.body?.ids)
      ? req.body.ids.map(Number).filter(Boolean)
      : [];

    if (!ids.length) {
      return res.json({ mensagem: 'Nenhuma notificacao para marcar' });
    }

    for (const id of ids) {
      await database.run(
        'UPDATE notificacoes SET lida = 1 WHERE id = ? AND usuario_id = ?',
        [id, usuarioId]
      );
    }

    res.json({ mensagem: 'Notificacoes marcadas como lidas' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao atualizar notificacoes' });
  }
});

router.post('/dispositivos', verificarToken, async (req, res) => {
  try {
    const usuarioId = req.usuario.id;
    const token = String(req.body?.token || '').trim();
    const plataforma = String(req.body?.plataforma || 'android').trim();

    if (!token) {
      return res.status(400).json({ erro: 'Token do dispositivo obrigatorio' });
    }

    const existente = await database.get('SELECT id FROM dispositivos_push WHERE token = ?', [token]);
    if (existente) {
      await database.run(
        `UPDATE dispositivos_push
         SET usuario_id = ?, plataforma = ?, ativo = 1, data_atualizacao = CURRENT_TIMESTAMP
         WHERE token = ?`,
        [usuarioId, plataforma, token]
      );
    } else {
      await database.run(
        'INSERT INTO dispositivos_push (usuario_id, token, plataforma, ativo) VALUES (?, ?, ?, 1)',
        [usuarioId, token, plataforma]
      );
    }

    res.json({ mensagem: 'Dispositivo registrado para notificacoes' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao registrar dispositivo' });
  }
});

module.exports = router;
