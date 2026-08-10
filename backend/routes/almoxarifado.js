const express = require('express');
const database = require('../config/database');
const { verificarToken, verificarPerfil } = require('../middleware/auth');

const router = express.Router();
const autenticarUsuario = [verificarToken, verificarPerfil(['equipista', 'coordenador', 'equipe_dirigente'])];

router.get('/recebimento/:codigo', async (req, res) => {
  try {
    const protocolo = await database.get(`
      SELECT p.id, p.solicitante, p.equipe, p.finalidade, p.status, p.data_entrega,
             aa.data_aceite, u.nome_completo AS assinado_por
      FROM almoxarifado_aceites aa
      JOIN almoxarifado_protocolos p ON p.id = aa.protocolo_id
      LEFT JOIN usuarios u ON u.id = aa.usuario_id
      WHERE aa.codigo = ?
    `, [String(req.params.codigo || '')]);
    if (!protocolo) return res.status(404).json({ erro: 'Link de recebimento inválido' });
    const itens = await database.all(`
      SELECT i.nome, i.unidade, pi.quantidade
      FROM almoxarifado_protocolo_itens pi
      JOIN almoxarifado_itens i ON i.id = pi.item_id
      WHERE pi.protocolo_id = ? ORDER BY pi.id ASC
    `, [protocolo.id]);
    res.json({ ...protocolo, itens });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao carregar o recebimento' });
  }
});

router.post('/recebimento/:codigo/assinar', ...autenticarUsuario, async (req, res) => {
  try {
    const aceite = await database.get(`
      SELECT aa.protocolo_id, aa.data_aceite, p.solicitante_usuario_id, p.status
      FROM almoxarifado_aceites aa
      JOIN almoxarifado_protocolos p ON p.id = aa.protocolo_id
      WHERE aa.codigo = ?
    `, [String(req.params.codigo || '')]);
    if (!aceite) return res.status(404).json({ erro: 'Link de recebimento inválido' });
    if (Number(aceite.solicitante_usuario_id) !== Number(req.usuario.id)) {
      return res.status(403).json({ erro: 'Este recebimento só pode ser assinado pelo solicitante do protocolo' });
    }
    if (!['entregue', 'parcialmente_devolvido', 'devolvido'].includes(aceite.status)) {
      return res.status(400).json({ erro: 'A entrega ainda não foi registrada pelo almoxarifado' });
    }
    if (aceite.data_aceite) return res.json({ mensagem: 'Recebimento já confirmado', data_aceite: aceite.data_aceite });

    const ip = String(req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim().slice(0, 120);
    const navegador = String(req.headers['user-agent'] || '').slice(0, 500);
    const result = await database.run(`
      UPDATE almoxarifado_aceites
      SET usuario_id = ?, data_aceite = CURRENT_TIMESTAMP, ip_aceite = ?, navegador_aceite = ?
      WHERE protocolo_id = ? AND data_aceite IS NULL
    `, [req.usuario.id, ip, navegador, aceite.protocolo_id]);
    if (!result.changes) return res.status(409).json({ erro: 'O recebimento já foi confirmado' });
    res.json({ mensagem: `Recebimento do protocolo #${aceite.protocolo_id} confirmado com sucesso` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao confirmar o recebimento' });
  }
});

router.get('/itens', ...autenticarUsuario, async (req, res) => {
  try {
    const inicio = String(req.query.inicio || '').trim();
    const fim = String(req.query.fim || '').trim();
    const consultarPeriodo = /^\d{4}-\d{2}-\d{2}$/.test(inicio) && /^\d{4}-\d{2}-\d{2}$/.test(fim) && fim >= inicio;
    const itens = consultarPeriodo
      ? await database.all(`
          SELECT i.id, i.nome, i.unidade,
                 i.estoque_total - COALESCE((
                   SELECT SUM(pi.quantidade - pi.quantidade_devolvida)
                   FROM almoxarifado_protocolo_itens pi
                   JOIN almoxarifado_protocolos p ON p.id = pi.protocolo_id
                   WHERE pi.item_id = i.id
                     AND p.status IN ('solicitado', 'entregue', 'parcialmente_devolvido')
                     AND (p.data_prevista_retirada IS NULL OR p.data_prevista_retirada <= ?)
                     AND COALESCE(p.data_prevista_devolucao, '9999-12-31') >= ?
                 ), 0) AS estoque_disponivel
          FROM almoxarifado_itens i
          WHERE i.ativo = 1
          ORDER BY i.nome ASC
        `, [fim, inicio])
      : await database.all(`SELECT id, nome, unidade, estoque_disponivel FROM almoxarifado_itens WHERE ativo = 1 ORDER BY nome ASC`);
    res.json(itens);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao carregar itens disponíveis' });
  }
});

router.get('/minhas-solicitacoes', ...autenticarUsuario, async (req, res) => {
  try {
    const protocolos = await database.all(`
      SELECT id, solicitante, equipe, finalidade, data_prevista_devolucao,
             status, observacao, data_prevista_retirada, data_criacao, data_entrega, data_devolucao
      FROM almoxarifado_protocolos
      WHERE solicitante_usuario_id = ?
      ORDER BY id DESC
    `, [req.usuario.id]);
    const itens = await database.all(`
      SELECT pi.protocolo_id, pi.quantidade, i.nome, i.unidade
      FROM almoxarifado_protocolo_itens pi
      JOIN almoxarifado_itens i ON i.id = pi.item_id
      WHERE pi.protocolo_id IN (SELECT id FROM almoxarifado_protocolos WHERE solicitante_usuario_id = ?)
      ORDER BY pi.id ASC
    `, [req.usuario.id]);
    res.json(protocolos.map(protocolo => ({
      ...protocolo,
      itens: itens.filter(item => Number(item.protocolo_id) === Number(protocolo.id))
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao carregar suas solicitações' });
  }
});

router.post('/solicitacoes', ...autenticarUsuario, async (req, res) => {
  let protocoloId = null;
  try {
    const itensRecebidos = Array.isArray(req.body.itens)
      ? req.body.itens
      : [{ item_id: req.body.item_id, quantidade: req.body.quantidade }];
    const itensSolicitados = itensRecebidos.map(item => ({
      item_id: Number(item.item_id),
      quantidade: Number(item.quantidade)
    }));
    const finalidade = String(req.body.finalidade || 'Uso pela equipe').trim();
    const dataRetirada = String(req.body.data_prevista_retirada || '').trim();
    const dataPrevista = String(req.body.data_prevista_devolucao || '').trim() || null;
    const observacao = String(req.body.observacao || '').trim();
    if (!itensSolicitados.length || itensSolicitados.some(item => !item.item_id || !Number.isInteger(item.quantidade) || item.quantidade <= 0)) {
      return res.status(400).json({ erro: 'Adicione ao menos um item com quantidade válida' });
    }
    if (new Set(itensSolicitados.map(item => item.item_id)).size !== itensSolicitados.length) {
      return res.status(400).json({ erro: 'O mesmo item não pode aparecer duas vezes na solicitação' });
    }
    const hoje = new Date().toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dataRetirada) || dataRetirada < hoje || !dataPrevista || dataPrevista < dataRetirada) {
      return res.status(400).json({ erro: 'Informe um período válido para retirada e devolução' });
    }
    const usuario = await database.get('SELECT id, nome_completo, equipe FROM usuarios WHERE id = ?', [req.usuario.id]);
    if (!usuario) return res.status(404).json({ erro: 'Usuário não encontrado' });
    for (const solicitado of itensSolicitados) {
      const item = await database.get('SELECT id, nome, estoque_total FROM almoxarifado_itens WHERE id = ? AND ativo = 1', [solicitado.item_id]);
      if (!item) return res.status(404).json({ erro: 'Um dos itens selecionados não foi encontrado' });
      const reserva = await database.get(`
        SELECT COALESCE(SUM(pi.quantidade - pi.quantidade_devolvida), 0) AS total
        FROM almoxarifado_protocolo_itens pi
        JOIN almoxarifado_protocolos p ON p.id = pi.protocolo_id
        WHERE pi.item_id = ? AND p.status IN ('solicitado', 'entregue', 'parcialmente_devolvido')
          AND (p.data_prevista_retirada IS NULL OR p.data_prevista_retirada <= ?)
          AND COALESCE(p.data_prevista_devolucao, '9999-12-31') >= ?
      `, [solicitado.item_id, dataPrevista, dataRetirada]);
      const disponivelPeriodo = Number(item.estoque_total) - Number(reserva?.total || 0);
      if (solicitado.quantidade > disponivelPeriodo) {
        return res.status(400).json({ erro: `${item.nome}: há somente ${Math.max(0, disponivelPeriodo)} unidade(s) disponível(is) nesse período` });
      }
    }

    const result = await database.run(
      `INSERT INTO almoxarifado_protocolos
       (solicitante_usuario_id, solicitante, equipe, finalidade, data_prevista_retirada, data_prevista_devolucao, observacao, criado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [usuario.id, usuario.nome_completo, usuario.equipe || '', finalidade, dataRetirada, dataPrevista, observacao, usuario.id]
    );
    protocoloId = result.lastID;
    for (const item of itensSolicitados) {
      await database.run(
        'INSERT INTO almoxarifado_protocolo_itens (protocolo_id, item_id, quantidade) VALUES (?, ?, ?)',
        [protocoloId, item.item_id, item.quantidade]
      );
    }
    res.status(201).json({ id: protocoloId, mensagem: `Solicitação #${protocoloId} enviada ao almoxarifado` });
  } catch (err) {
    if (protocoloId) {
      await database.run('DELETE FROM almoxarifado_protocolo_itens WHERE protocolo_id = ?', [protocoloId]).catch(() => {});
      await database.run('DELETE FROM almoxarifado_protocolos WHERE id = ?', [protocoloId]).catch(() => {});
    }
    console.error(err);
    res.status(500).json({ erro: 'Erro ao enviar solicitação' });
  }
});

router.put('/minhas-solicitacoes/:id/cancelar', ...autenticarUsuario, async (req, res) => {
  try {
    const result = await database.run(
      `UPDATE almoxarifado_protocolos SET status = 'cancelado'
       WHERE id = ? AND solicitante_usuario_id = ? AND status = 'solicitado'`,
      [Number(req.params.id), req.usuario.id]
    );
    if (!result.changes) return res.status(400).json({ erro: 'Esta solicitação não pode ser cancelada' });
    res.json({ mensagem: 'Solicitação cancelada' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao cancelar solicitação' });
  }
});

module.exports = router;
