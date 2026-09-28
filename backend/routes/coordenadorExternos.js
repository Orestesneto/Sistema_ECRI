const express = require('express');
const { verificarToken, verificarPerfil } = require('../middleware/auth');
const { equipeSemEquipe } = require('../utils/equipes');
const { pedidosBlusaBloqueados } = require('../utils/configuracoes');
const { obterValoresBlusa } = require('../utils/precoBlusa');
const { obterTaxasPorMovimento } = require('../utils/precoTaxa');
const { normalizarMovimentoOrigem } = require('../utils/movimentoOrigem');
const { recalcularBlusasExternas } = require('../utils/financeiroExternos');

async function listarFinanceiroExternos(database, equipe, tipo) {
  const tabela = tipo === 'blusa' ? 'solicitacoes_blusa_externos' : 'pagamentos_externos';
  const params = equipe === null ? [] : [equipe];
  const filtro = equipe === null ? '' : 'AND pe.equipe = ?';
  if (tipo === 'taxa') {
    const pessoas = await database.all(`SELECT id, movimento_origem FROM pessoas_externas pe
      WHERE COALESCE(lista_espera, 0) = 0 AND equipe IS NOT NULL AND UPPER(equipe) <> 'SEM EQUIPE'
      AND COALESCE(perfil, 'sem_cadastro') <> 'equipe_dirigente' ${filtro}`, params);
    const taxas = await obterTaxasPorMovimento(database);
    for (const pessoa of pessoas) {
      const valor = taxas[normalizarMovimentoOrigem(pessoa.movimento_origem)] || 0;
      if (valor > 0) await database.run(`INSERT INTO pagamentos_externos (pessoa_externa_id, valor)
        VALUES (?, ?) ON CONFLICT(pessoa_externa_id) DO NOTHING`, [pessoa.id, valor]);
    }
  }
  return database.all(`SELECT pe.id AS usuario_id, pe.id AS pessoa_externa_id, pe.nome_completo,
    pe.nome_cracha, pe.equipe, pe.movimento_origem, 'externo' AS tipo_cadastro,
    CASE WHEN pe.foto_perfil IS NOT NULL AND pe.foto_perfil <> '' THEN 1 ELSE 0 END AS tem_foto_perfil,
    -r.id AS id, r.valor, COALESCE(r.status, '${tipo === 'blusa' ? 'sem_solicitacao' : 'sem_pagamento'}') AS status,
    r.data_solicitacao, r.data_confirmacao, r.forma_pagamento, r.confirmado_por,
    confirmador.nome_completo AS confirmado_por_nome, confirmador.nome_cracha AS confirmado_por_cracha,
    CASE WHEN r.status = 'confirmado' THEN 'manual' ELSE NULL END AS origem_confirmacao,
    ${tipo === 'blusa' ? `r.tamanho, r.tamanho_atualizado_em, editor.nome_completo AS tamanho_atualizado_por_nome` : "'taxa' AS tipo, r.valor AS valor_confirmacao_manual"}
    FROM pessoas_externas pe
    LEFT JOIN ${tabela} r ON r.pessoa_externa_id = pe.id
    LEFT JOIN usuarios confirmador ON confirmador.id = r.confirmado_por
    ${tipo === 'blusa' ? 'LEFT JOIN usuarios editor ON editor.id = r.tamanho_atualizado_por' : ''}
    WHERE COALESCE(pe.lista_espera, 0) = 0 AND pe.equipe IS NOT NULL AND UPPER(pe.equipe) <> 'SEM EQUIPE'
    ${filtro} ORDER BY pe.nome_completo ASC, r.data_solicitacao DESC`, params);
}

function criarRouterFinanceiroExternos(database, tamanhos, registrarHistorico) {
  const router = express.Router();
  const autorizar = async (req, pessoaId) => {
    const coordenador = await database.get('SELECT perfil, equipe FROM usuarios WHERE id = ?', [req.usuario.id]);
    const pessoa = await database.get('SELECT id, equipe, perfil, lista_espera FROM pessoas_externas WHERE id = ?', [pessoaId]);
    if (!pessoa || coordenador?.perfil !== 'coordenador' || !coordenador.equipe || equipeSemEquipe(coordenador.equipe)
      || pessoa.equipe !== coordenador.equipe || Number(pessoa.lista_espera || 0)) {
      const erro = new Error('Apenas o coordenador da equipe pode gerenciar este participante');
      erro.status = 403;
      throw erro;
    }
    return pessoa;
  };
  const rota = (metodo, caminho, handler) => router[metodo](caminho, (req, res, next) => {
    if (Number(req.params.id) >= 0) return next('route');
    next();
  }, verificarToken, verificarPerfil(['coordenador']), async (req, res, next) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id >= 0) return next();
    try { await handler(req, res, -id); }
    catch (err) {
      if (!err.status) console.error(err);
      res.status(err.status || 500).json({ erro: err.status ? err.message : 'Erro ao salvar dados do participante sem cadastro' });
    }
  });
  const validarForma = req => {
    if (!['pix', 'dinheiro'].includes(req.body.forma_pagamento)) {
      const erro = new Error('Informe se recebeu via PIX ou em dinheiro');
      erro.status = 400;
      throw erro;
    }
  };
  const validarTamanho = async req => {
    if (await pedidosBlusaBloqueados(database)) {
      const erro = new Error('Pedidos de blusa estão encerrados'); erro.status = 403; throw erro;
    }
    if (!tamanhos.includes(req.body.tamanho)) {
      const erro = new Error('Tamanho de blusa inválido'); erro.status = 400; throw erro;
    }
  };
  const obterRegistro = async (req, tabela, id) => {
    const registro = await database.get(`SELECT * FROM ${tabela} WHERE id = ?`, [id]);
    if (!registro) { const erro = new Error('Registro não encontrado'); erro.status = 404; throw erro; }
    await autorizar(req, registro.pessoa_externa_id);
    return registro;
  };
  const auditar = (req, acao, pessoaId, detalhes) => registrarHistorico(req.usuario.id, acao, {
    ...detalhes, pessoa_externa_id: pessoaId, tipo_cadastro: 'externo', coordenador_id: req.usuario.id
  });

  rota('post', '/solicitacoes-blusa/:id', async (req, res, pessoaId) => {
    await autorizar(req, pessoaId);
    await validarTamanho(req);
    const valores = await obterValoresBlusa(database);
    const resultado = await database.run(`INSERT INTO solicitacoes_blusa_externos
      (pessoa_externa_id, tamanho, valor, tamanho_atualizado_por, tamanho_atualizado_em)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`, [pessoaId, req.body.tamanho, valores.unica, req.usuario.id]);
    await recalcularBlusasExternas(database, pessoaId);
    await auditar(req, 'blusa_solicitada_pelo_coordenador', pessoaId, { solicitacao_id: -resultado.lastID, tamanho: req.body.tamanho });
    res.status(201).json({ mensagem: 'Camisa adicionada', id: -resultado.lastID });
  });
  rota('put', '/solicitacoes-blusa/:id/tamanho', async (req, res, id) => {
    const registro = await obterRegistro(req, 'solicitacoes_blusa_externos', id);
    await validarTamanho(req);
    await database.run(`UPDATE solicitacoes_blusa_externos SET tamanho = ?, tamanho_atualizado_por = ?,
      tamanho_atualizado_em = CURRENT_TIMESTAMP WHERE id = ?`, [req.body.tamanho, req.usuario.id, id]);
    await auditar(req, 'tamanho_blusa_atualizado_pelo_coordenador', registro.pessoa_externa_id, { solicitacao_id: -id, tamanho: req.body.tamanho });
    res.json({ mensagem: 'Tamanho atualizado' });
  });
  rota('delete', '/solicitacoes-blusa/:id', async (req, res, id) => {
    const registro = await obterRegistro(req, 'solicitacoes_blusa_externos', id);
    if (registro.status === 'confirmado') return res.status(400).json({ erro: 'Não é possível excluir uma camisa paga' });
    await database.run('DELETE FROM solicitacoes_blusa_externos WHERE id = ?', [id]);
    await recalcularBlusasExternas(database, registro.pessoa_externa_id);
    await auditar(req, 'blusa_excluida_pelo_coordenador', registro.pessoa_externa_id, { solicitacao_id: -id });
    res.json({ mensagem: 'Camisa excluída' });
  });
  for (const [caminho, tabela, acao] of [
    ['/confirmar-blusa/:id', 'solicitacoes_blusa_externos', 'pagamento_blusa_confirmado'],
    ['/confirmar-pagamento/:id', 'pagamentos_externos', 'pagamento_confirmado']
  ]) rota('put', caminho, async (req, res, id) => {
    validarForma(req);
    const registro = await obterRegistro(req, tabela, id);
    if (registro.status === 'confirmado') return res.json({ mensagem: 'Pagamento já confirmado' });
    if (registro.status !== 'pendente') return res.status(400).json({ erro: 'Pagamento não está pendente' });
    const resultado = await database.run(`UPDATE ${tabela} SET status = 'confirmado', data_confirmacao = CURRENT_TIMESTAMP,
      confirmado_por = ?, forma_pagamento = ? WHERE id = ? AND status = 'pendente'`, [req.usuario.id, req.body.forma_pagamento, id]);
    if (resultado.changes) await auditar(req, acao, registro.pessoa_externa_id, { registro_id: -id, valor: registro.valor, forma_pagamento: req.body.forma_pagamento });
    res.json({ mensagem: 'Pagamento confirmado' });
  });
  return router;
}

module.exports = { criarRouterFinanceiroExternos, listarFinanceiroExternos };
