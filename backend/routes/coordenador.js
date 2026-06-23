const express = require('express');
const jwt = require('jsonwebtoken');
const database = require('../config/database');
const { verificarToken, verificarPerfil } = require('../middleware/auth');
const { normalizarMovimentoOrigem, movimentoOrigemValido } = require('../utils/movimentoOrigem');
const { normalizarExperienciaPerfil } = require('../utils/experienciaPerfil');
const { normalizarAnoEncontro, anoEncontroValido } = require('../utils/anoEncontro');
const { registrarHistorico } = require('../utils/historico');

const router = express.Router();

// Obter dados do próprio perfil
router.get('/meu-perfil', verificarToken, verificarPerfil(['coordenador', 'equipe_dirigente']), async (req, res) => {
  try {
    const usuario = await database.get(
      `SELECT id, email, nome_completo, nome_cracha, telefone, movimento_origem, ano_encontro,
              restricao_medica, restricao_alimentar, restricao_medicacao, foto_perfil,
              perfil, status, equipe, toca_instrumento, instrumentos, canta, equipes_servidas
       FROM usuarios WHERE id = ?`,
      [req.usuario.id]
    );
    
    res.json(usuario);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao obter perfil' });
  }
});

// Atualizar próprio perfil
router.put('/meu-perfil', verificarToken, verificarPerfil(['coordenador', 'equipe_dirigente']), async (req, res) => {
  try {
    const { nome_cracha, restricao_medica, restricao_alimentar, restricao_medicacao, foto_perfil, movimento_origem, ano_encontro } = req.body;
    const usuario_id = req.usuario.id;
    const experiencia = normalizarExperienciaPerfil(req.body);

    if (!movimentoOrigemValido(movimento_origem)) {
      return res.status(400).json({ erro: 'Movimento de origem invalido' });
    }

    if (!anoEncontroValido(ano_encontro)) {
      return res.status(400).json({ erro: 'Ano do encontro invalido' });
    }

    const movimentoOrigem = normalizarMovimentoOrigem(movimento_origem);
    const anoEncontro = normalizarAnoEncontro(ano_encontro);

    const fotoPerfil = typeof foto_perfil === 'string' && foto_perfil.startsWith('data:image/')
      ? foto_perfil
      : null;

    await database.run(
      `UPDATE usuarios
       SET nome_cracha = ?, restricao_medica = ?, restricao_alimentar = ?, restricao_medicacao = ?,
           foto_perfil = COALESCE(?, foto_perfil), movimento_origem = ?, ano_encontro = ?, toca_instrumento = ?,
           instrumentos = ?, canta = ?, equipes_servidas = ?
       WHERE id = ?`,
      [
        nome_cracha,
        restricao_medica,
        restricao_alimentar,
        restricao_medicacao,
        fotoPerfil,
        movimentoOrigem,
        anoEncontro,
        experiencia.tocaInstrumento,
        experiencia.instrumentos,
        experiencia.canta,
        experiencia.equipesServidasJson,
        usuario_id
      ]
    );
    await registrarHistorico(usuario_id, 'perfil_atualizado', { origem: 'coordenador' });

    res.json({ mensagem: 'Perfil atualizado com sucesso' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao atualizar perfil' });
  }
});

// Confirmar pagamento de taxa
router.put('/confirmar-pagamento/:id', verificarToken, verificarPerfil(['coordenador', 'equipe_dirigente']), async (req, res) => {
  try {
    const pagamento_id = req.params.id;
    const usuario_id = req.usuario.id;

    await database.run(
      `UPDATE pagamentos SET status = 'confirmado', data_confirmacao = CURRENT_TIMESTAMP, confirmado_por = ? WHERE id = ?`,
      [usuario_id, pagamento_id]
    );
    await registrarHistorico(usuario_id, 'pagamento_confirmado', { pagamento_id });

    res.json({ mensagem: 'Pagamento confirmado com sucesso' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao confirmar pagamento' });
  }
});

// Confirmar que quer servir
router.put('/confirmar-servico/:usuario_id', verificarToken, verificarPerfil(['coordenador', 'equipe_dirigente']), async (req, res) => {
  try {
    const usuario_id = req.params.usuario_id;

    await database.run(
      `UPDATE usuarios SET status = 'confirmado' WHERE id = ?`,
      [usuario_id]
    );
    await registrarHistorico(usuario_id, 'participacao_confirmada', { confirmada_por: req.usuario.id });

    res.json({ mensagem: 'Confirmação registrada com sucesso' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao confirmar' });
  }
});

// Obter lista de solicitações de blusa
router.get('/participantes-equipe', verificarToken, verificarPerfil(['coordenador', 'equipe_dirigente']), async (req, res) => {
  try {
    const coordenador = await database.get('SELECT equipe FROM usuarios WHERE id = ?', [req.usuario.id]);
    const filtrarPorEquipe = req.usuario.perfil !== 'equipe_dirigente';

    if (filtrarPorEquipe && !coordenador?.equipe) {
      return res.json([]);
    }

    const filtroEquipeSql = filtrarPorEquipe ? 'WHERE equipe = ?' : '';
    const filtroEquipeParams = filtrarPorEquipe ? [coordenador.equipe] : [];

    const usuarios = await database.all(`
      SELECT id, nome_completo, nome_cracha, email, telefone, movimento_origem, foto_perfil,
             restricao_medica, restricao_alimentar, restricao_medicacao, perfil, status, equipe,
             'usuario' AS tipo_cadastro
      FROM usuarios
      ${filtroEquipeSql}
      ORDER BY nome_completo ASC
    `, filtroEquipeParams);

    const externos = await database.all(`
      SELECT id, nome_completo, nome_cracha, '' AS email, telefone, movimento_origem, foto_perfil,
             restricao_medica, restricao_alimentar, restricao_medicacao, 'sem_cadastro' AS perfil, status, equipe,
             'externo' AS tipo_cadastro
      FROM pessoas_externas
      ${filtroEquipeSql}
      ORDER BY nome_completo ASC
    `, filtroEquipeParams);

    const participantes = [...usuarios, ...externos]
      .sort((a, b) => String(a.nome_completo || '').localeCompare(String(b.nome_completo || '')))
      .map(participante => ({
        ...participante,
        token_confirmacao: jwt.sign(
          { id: participante.id, tipo: participante.tipo_cadastro },
          process.env.JWT_SECRET,
          { expiresIn: '30d' }
        )
      }));

    res.json(participantes);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao obter participantes da equipe' });
  }
});

router.put('/participantes/:usuario_id/status', verificarToken, verificarPerfil(['coordenador', 'equipe_dirigente']), async (req, res) => {
  try {
    const usuario_id = Number(req.params.usuario_id);
    const { status, tipo_cadastro } = req.body;
    const statusPermitidos = ['pendente', 'confirmado', 'negou', 'desistiu'];

    if (!usuario_id || !statusPermitidos.includes(status)) {
      return res.status(400).json({ erro: 'Status invalido' });
    }

    const coordenador = await database.get('SELECT equipe FROM usuarios WHERE id = ?', [req.usuario.id]);
    const filtrarPorEquipe = req.usuario.perfil !== 'equipe_dirigente';

    if (filtrarPorEquipe && !coordenador?.equipe) {
      return res.status(400).json({ erro: 'Coordenador sem equipe escalada' });
    }

    const tabela = tipo_cadastro === 'externo' ? 'pessoas_externas' : 'usuarios';

    const participante = await database.get(
      `SELECT id FROM ${tabela} WHERE id = ? ${filtrarPorEquipe ? 'AND equipe = ?' : ''}`,
      filtrarPorEquipe ? [usuario_id, coordenador.equipe] : [usuario_id]
    );

    if (!participante) {
      return res.status(403).json({ erro: 'Usuario nao pertence a equipe do coordenador' });
    }

    await database.run(`UPDATE ${tabela} SET status = ? WHERE id = ?`, [status, usuario_id]);

    res.json({ mensagem: 'Status atualizado com sucesso' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao atualizar status' });
  }
});

router.get('/solicitacoes-blusa', verificarToken, verificarPerfil(['coordenador', 'equipe_dirigente']), async (req, res) => {
  try {
    const solicitacoes = await database.all(`
      SELECT sb.id, sb.tamanho, sb.status, sb.data_solicitacao,
             u.id as usuario_id, u.nome_completo, u.email, u.nome_cracha, u.foto_perfil
      FROM solicitacoes_blusa sb
      JOIN usuarios u ON sb.usuario_id = u.id
      ORDER BY sb.data_solicitacao DESC
    `);

    res.json(solicitacoes);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao obter solicitações' });
  }
});

// Obter lista de pagamentos pendentes
router.get('/pagamentos-pendentes', verificarToken, verificarPerfil(['coordenador', 'equipe_dirigente']), async (req, res) => {
  try {
    const pagamentos = await database.all(`
      SELECT p.id, p.tipo, p.valor, p.status, p.data_solicitacao,
             u.id as usuario_id, u.nome_completo, u.email, u.foto_perfil
      FROM pagamentos p
      JOIN usuarios u ON p.usuario_id = u.id
      WHERE p.status = 'pendente'
      ORDER BY p.data_solicitacao DESC
    `);

    res.json(pagamentos);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao obter pagamentos' });
  }
});

// ===== ROTAS DE REUNIÕES =====

// Criar nova reunião
router.post('/reunioes', verificarToken, verificarPerfil(['coordenador', 'equipe_dirigente']), async (req, res) => {
  try {
    const { titulo, descricao, data_reuniao, horario_inicio, horario_fim, local } = req.body;
    const criada_por = req.usuario.id;

    if (!titulo || !data_reuniao || !horario_inicio || !local) {
      return res.status(400).json({ erro: 'Campos obrigatórios: título, data, horário e local' });
    }

    const resultado = await database.run(
      `INSERT INTO reunioes (criada_por, titulo, descricao, data_reuniao, horario_inicio, horario_fim, local) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [criada_por, titulo, descricao || '', data_reuniao, horario_inicio, horario_fim || '', local]
    );

    res.status(201).json({
      mensagem: 'Reunião agendada com sucesso',
      id: resultado.lastID
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao criar reunião' });
  }
});

// Listar reuniões do coordenador
router.get('/reunioes', verificarToken, verificarPerfil(['coordenador', 'equipe_dirigente']), async (req, res) => {
  try {
    const usuario_id = req.usuario.id;

    const reunioes = await database.all(
      `SELECT * FROM reunioes WHERE criada_por = ? ORDER BY data_reuniao DESC, horario_inicio DESC`,
      [usuario_id]
    );

    res.json(reunioes);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao obter reuniões' });
  }
});

router.get('/reunioes/:id/presencas', verificarToken, verificarPerfil(['coordenador', 'equipe_dirigente']), async (req, res) => {
  try {
    const reuniao_id = req.params.id;
    const usuario_id = req.usuario.id;

    const reuniao = await database.get('SELECT criada_por FROM reunioes WHERE id = ?', [reuniao_id]);
    if (!reuniao) {
      return res.status(404).json({ erro: 'Reuniao nao encontrada' });
    }

    if (req.usuario.perfil !== 'equipe_dirigente' && Number(reuniao.criada_por) !== Number(usuario_id)) {
      return res.status(403).json({ erro: 'Voce nao tem permissao para acessar esta chamada' });
    }

    const coordenador = await database.get('SELECT equipe FROM usuarios WHERE id = ?', [reuniao.criada_por]);

    if (!coordenador?.equipe) {
      return res.json([]);
    }

    const escalados = await database.all(`
      SELECT u.id, u.nome_completo, u.nome_cracha, u.email, u.telefone, u.perfil, u.equipe, u.foto_perfil,
             pr.status, pr.observacao
      FROM usuarios u
      LEFT JOIN presencas_reuniao pr ON pr.usuario_id = u.id AND pr.reuniao_id = ?
      WHERE u.equipe = ?
      ORDER BY u.nome_completo ASC
    `, [reuniao_id, coordenador.equipe]);

    res.json(escalados.map(escalado => ({
      ...escalado,
      status: escalado.status || 'presente',
      observacao: escalado.observacao || ''
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao obter chamada' });
  }
});

router.put('/reunioes/:id/presencas', verificarToken, verificarPerfil(['coordenador', 'equipe_dirigente']), async (req, res) => {
  try {
    const reuniao_id = req.params.id;
    const usuario_id = req.usuario.id;
    const { presencas } = req.body;

    const reuniao = await database.get('SELECT criada_por FROM reunioes WHERE id = ?', [reuniao_id]);
    if (!reuniao) {
      return res.status(404).json({ erro: 'Reuniao nao encontrada' });
    }

    if (req.usuario.perfil !== 'equipe_dirigente' && Number(reuniao.criada_por) !== Number(usuario_id)) {
      return res.status(403).json({ erro: 'Voce nao tem permissao para salvar esta chamada' });
    }

    if (!Array.isArray(presencas)) {
      return res.status(400).json({ erro: 'Presencas invalidas' });
    }

    const coordenador = await database.get('SELECT equipe FROM usuarios WHERE id = ?', [reuniao.criada_por]);
    if (!coordenador?.equipe) {
      return res.status(400).json({ erro: 'Coordenador sem equipe escalada' });
    }

    await database.run('DELETE FROM presencas_reuniao WHERE reuniao_id = ?', [reuniao_id]);

    for (const presenca of presencas) {
      const equipista_id = Number(presenca.usuario_id);
      const status = presenca.status;
      const observacao = presenca.observacao || '';

      if (!equipista_id || !['presente', 'falta_justificada', 'falta'].includes(status)) {
        return res.status(400).json({ erro: 'Presenca invalida' });
      }

      const usuarioEscalado = await database.get(
        'SELECT id FROM usuarios WHERE id = ? AND equipe = ?',
        [equipista_id, coordenador.equipe]
      );

      if (!usuarioEscalado) {
        return res.status(400).json({ erro: 'Usuario nao pertence a equipe escalada desta chamada' });
      }

      await database.run(
        `INSERT INTO presencas_reuniao (reuniao_id, usuario_id, status, observacao, registrada_por)
         VALUES (?, ?, ?, ?, ?)`,
        [reuniao_id, equipista_id, status, observacao, usuario_id]
      );
    }

    await registrarHistorico(usuario_id, 'chamada_salva', { reuniao_id, total_registros: presencas.length });
    res.json({ mensagem: 'Chamada salva com sucesso' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao salvar chamada' });
  }
});

// Atualizar reunião
router.put('/reunioes/:id', verificarToken, verificarPerfil(['coordenador', 'equipe_dirigente']), async (req, res) => {
  try {
    const reunion_id = req.params.id;
    const usuario_id = req.usuario.id;
    const { titulo, descricao, data_reuniao, horario_inicio, horario_fim, local, status } = req.body;

    // Verificar se é o criador
    const reuniao = await database.get('SELECT criada_por FROM reunioes WHERE id = ?', [reunion_id]);
    if (!reuniao || reuniao.criada_por !== usuario_id) {
      return res.status(403).json({ erro: 'Você não tem permissão para editar esta reunião' });
    }

    await database.run(
      `UPDATE reunioes SET titulo = ?, descricao = ?, data_reuniao = ?, horario_inicio = ?, horario_fim = ?, local = ?, status = ?, data_atualizacao = CURRENT_TIMESTAMP WHERE id = ?`,
      [titulo, descricao || '', data_reuniao, horario_inicio, horario_fim || '', local, status || 'agendada', reunion_id]
    );

    res.json({ mensagem: 'Reunião atualizada com sucesso' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao atualizar reunião' });
  }
});

// Deletar reunião
router.delete('/reunioes/:id', verificarToken, verificarPerfil(['coordenador', 'equipe_dirigente']), async (req, res) => {
  try {
    const reunion_id = req.params.id;
    const usuario_id = req.usuario.id;

    // Verificar se é o criador
    const reuniao = await database.get('SELECT criada_por FROM reunioes WHERE id = ?', [reunion_id]);
    if (!reuniao || reuniao.criada_por !== usuario_id) {
      return res.status(403).json({ erro: 'Você não tem permissão para deletar esta reunião' });
    }

    await database.run('DELETE FROM presencas_reuniao WHERE reuniao_id = ?', [reunion_id]);
    await database.run('DELETE FROM reunioes WHERE id = ?', [reunion_id]);
    res.json({ mensagem: 'Reunião cancelada com sucesso' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao deletar reunião' });
  }
});

module.exports = router;
