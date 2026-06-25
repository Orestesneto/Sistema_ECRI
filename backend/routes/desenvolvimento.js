const express = require('express');
const jwt = require('jsonwebtoken');
const database = require('../config/database');
const { normalizarMovimentoOrigem, movimentoOrigemValido } = require('../utils/movimentoOrigem');
const { EQUIPES, normalizarEquipe, equipeValida } = require('../utils/equipes');
const { normalizarExperienciaPerfil } = require('../utils/experienciaPerfil');
const { normalizarAnoEncontro, anoEncontroValido } = require('../utils/anoEncontro');
const { registrarHistorico } = require('../utils/historico');
const { validarTelefoneUnico } = require('../utils/telefone');
const { obterConfiguracao, salvarConfiguracao } = require('../utils/configuracoes');
const { normalizarParoquia, paroquiaValida } = require('../utils/paroquia');
const {
  VALOR_BLUSA_UNICA,
  VALOR_BLUSA_MULTIPLA,
  normalizarValorBlusa,
  obterValoresBlusa,
  recalcularValoresBlusasTodosUsuarios
} = require('../utils/precoBlusa');

const router = express.Router();

const DEV_USUARIO = 'orestes.pereira';
const DEV_SENHA = 'neto1991';

function verificarTokenDesenvolvimento(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  if (!token) {
    return res.status(401).json({ erro: 'Acesso nao autorizado' });
  }

  try {
    const dados = jwt.verify(token, process.env.JWT_SECRET);
    if (dados.tipo !== 'desenvolvimento') {
      return res.status(403).json({ erro: 'Acesso restrito a equipe de desenvolvimento' });
    }

    req.dev = dados;
    next();
  } catch (err) {
    return res.status(401).json({ erro: 'Sessao invalida ou expirada' });
  }
}

router.post('/login', (req, res) => {
  const { usuario, senha } = req.body;

  if (usuario !== DEV_USUARIO || senha !== DEV_SENHA) {
    return res.status(401).json({ erro: 'Usuario ou senha incorretos' });
  }

  const token = jwt.sign(
    { usuario: DEV_USUARIO, tipo: 'desenvolvimento' },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );

  res.json({
    mensagem: 'Login realizado com sucesso',
    token,
    usuario: DEV_USUARIO
  });
});

router.get('/acesso', verificarTokenDesenvolvimento, (req, res) => {
  res.json({
    mensagem: 'Area exclusiva liberada',
    usuario: req.dev.usuario
  });
});

router.get('/logs', verificarTokenDesenvolvimento, async (req, res) => {
  try {
    const logs = await database.all(`
      SELECT h.id, h.usuario_id, h.acao, h.detalhes, h.data_acao,
             u.nome_completo, u.email, u.perfil, u.equipe
      FROM historico h
      LEFT JOIN usuarios u ON u.id = h.usuario_id
      ORDER BY h.data_acao DESC, h.id DESC
      LIMIT 500
    `);

    res.json(logs.map(log => ({
      ...log,
      detalhes: parseDetalhes(log.detalhes)
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao carregar logs' });
  }
});

router.get('/usuarios/:usuario_id/logs', verificarTokenDesenvolvimento, async (req, res) => {
  try {
    const usuario_id = Number(req.params.usuario_id);

    if (!usuario_id) {
      return res.status(400).json({ erro: 'Usuário inválido' });
    }

    const logs = await database.all(`
      SELECT h.id, h.usuario_id, h.acao, h.detalhes, h.data_acao,
             u.nome_completo, u.email, u.perfil, u.equipe
      FROM historico h
      LEFT JOIN usuarios u ON u.id = h.usuario_id
      WHERE h.usuario_id = ?
      ORDER BY h.data_acao DESC, h.id DESC
      LIMIT 200
    `, [usuario_id]);

    res.json(await Promise.all(logs.map(async (log) => {
      const detalhes = parseDetalhes(log.detalhes);
      return {
        ...log,
        detalhes,
        responsavel: await identificarResponsavel(detalhes)
      };
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao carregar historico do usuario' });
  }
});

router.get('/carografo', verificarTokenDesenvolvimento, async (req, res) => {
  try {
    const usuarios = await database.all(`
      SELECT id, email, nome_completo, nome_cracha, telefone, movimento_origem, ano_encontro,
             paroquia, restricao_medica, restricao_alimentar, restricao_medicacao,
             perfil, status, equipe, foto_perfil, toca_instrumento, instrumentos, canta, equipes_servidas
      FROM usuarios
      ORDER BY nome_completo ASC
    `);

    res.json(usuarios);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao carregar carografo' });
  }
});

router.get('/blusas', verificarTokenDesenvolvimento, async (req, res) => {
  try {
    const blusas = await database.all(`
      SELECT sb.id, sb.usuario_id, sb.tamanho, sb.valor, sb.status, sb.data_solicitacao,
             sb.data_confirmacao, sb.forma_pagamento,
             u.nome_completo, u.nome_cracha, u.email, u.telefone, u.equipe, u.foto_perfil
      FROM solicitacoes_blusa sb
      JOIN usuarios u ON u.id = sb.usuario_id
      ORDER BY sb.data_solicitacao DESC, sb.id DESC
    `);

    res.json(blusas);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao carregar blusas' });
  }
});

router.get('/configuracoes', verificarTokenDesenvolvimento, async (req, res) => {
  try {
    const valoresBlusa = await obterValoresBlusa(database);
    res.json({
      parar_pedidos_blusa: (await obterConfiguracao(database, 'parar_pedidos_blusa', 'false')) === 'true',
      valor_blusa_unica: valoresBlusa.unica,
      valor_blusa_multipla: valoresBlusa.multipla
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao carregar configurações' });
  }
});

router.put('/configuracoes', verificarTokenDesenvolvimento, async (req, res) => {
  try {
    const pararPedidosBlusa = Boolean(req.body.parar_pedidos_blusa);
    const valorBlusaUnica = normalizarValorBlusa(req.body.valor_blusa_unica, VALOR_BLUSA_UNICA);
    const valorBlusaMultipla = normalizarValorBlusa(req.body.valor_blusa_multipla, VALOR_BLUSA_MULTIPLA);

    await salvarConfiguracao(database, 'parar_pedidos_blusa', pararPedidosBlusa ? 'true' : 'false');
    await salvarConfiguracao(database, 'valor_blusa_unica', String(valorBlusaUnica));
    await salvarConfiguracao(database, 'valor_blusa_multipla', String(valorBlusaMultipla));
    await recalcularValoresBlusasTodosUsuarios(database);

    res.json({
      mensagem: 'Configurações salvas com sucesso',
      parar_pedidos_blusa: pararPedidosBlusa,
      valor_blusa_unica: valorBlusaUnica,
      valor_blusa_multipla: valorBlusaMultipla
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao salvar configurações' });
  }
});

router.put('/blusas/:id/valor', verificarTokenDesenvolvimento, async (req, res) => {
  res.status(403).json({ erro: 'O valor da blusa é calculado automaticamente' });
});

router.get('/equipes', verificarTokenDesenvolvimento, (req, res) => {
  res.json(EQUIPES);
});

router.put('/usuarios/:usuario_id/perfil', verificarTokenDesenvolvimento, async (req, res) => {
  try {
    const usuario_id = Number(req.params.usuario_id);
    const {
      nome_cracha,
      telefone,
      paroquia,
      movimento_origem,
      ano_encontro,
      restricao_medica,
      restricao_alimentar,
      restricao_medicacao,
      status,
      equipe
    } = req.body;
    const statusPermitidos = ['pendente', 'confirmado', 'negou', 'desistiu'];
    const experiencia = normalizarExperienciaPerfil(req.body);

    if (!usuario_id) {
      return res.status(400).json({ erro: 'Usuário inválido' });
    }

    if (!nome_cracha || !telefone || !paroquia || !movimentoOrigemValido(movimento_origem) || !anoEncontroValido(ano_encontro) || !statusPermitidos.includes(status)) {
      return res.status(400).json({ erro: 'Preencha crachá, telefone, paróquia, movimento, ano e status válidos' });
    }

    const usuario = await database.get('SELECT id FROM usuarios WHERE id = ?', [usuario_id]);
    if (!usuario) {
      return res.status(404).json({ erro: 'Usuário não encontrado' });
    }

    const equipeNormalizada = equipe ? normalizarEquipe(equipe) : null;
    if (equipeNormalizada && !equipeValida(equipeNormalizada)) {
      return res.status(400).json({ erro: 'Equipe inválida' });
    }

    const movimentoOrigem = normalizarMovimentoOrigem(movimento_origem);
    const paroquiaNormalizada = normalizarParoquia(paroquia);
    if (!paroquiaValida(paroquiaNormalizada)) {
      return res.status(400).json({ erro: 'Paróquia inválida' });
    }
    const telefoneUnico = await validarTelefoneUnico(database, telefone, movimentoOrigem, {
      ignorarUsuarioId: usuario_id
    });
    if (!telefoneUnico.valido) {
      return res.status(400).json({ erro: telefoneUnico.erro });
    }

    await database.run(
      `UPDATE usuarios
       SET nome_cracha = ?, telefone = ?, paroquia = ?, movimento_origem = ?, ano_encontro = ?,
           restricao_medica = ?, restricao_alimentar = ?, restricao_medicacao = ?,
           status = ?, equipe = ?, toca_instrumento = ?, instrumentos = ?, canta = ?, equipes_servidas = ?
       WHERE id = ?`,
      [
        String(nome_cracha).trim().toUpperCase(),
        telefone,
        paroquiaNormalizada,
        movimentoOrigem,
        normalizarAnoEncontro(ano_encontro),
        restricao_medica || '',
        restricao_alimentar || '',
        restricao_medicacao || '',
        status,
        equipeNormalizada,
        experiencia.tocaInstrumento,
        experiencia.instrumentos,
        experiencia.canta,
        experiencia.equipesServidasJson,
        usuario_id
      ]
    );
    await registrarHistorico(usuario_id, 'perfil_editado_pela_area_exclusiva', {
      editado_por: req.dev.usuario,
      paroquia: paroquiaNormalizada,
      equipe: equipeNormalizada,
      status
    });

    res.json({ mensagem: 'Perfil atualizado com sucesso' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao atualizar perfil do usuário' });
  }
});

router.delete('/usuarios/:usuario_id', verificarTokenDesenvolvimento, async (req, res) => {
  try {
    const usuario_id = Number(req.params.usuario_id);

    if (!usuario_id) {
      return res.status(400).json({ erro: 'Usuário inválido' });
    }

    const usuario = await database.get('SELECT id FROM usuarios WHERE id = ?', [usuario_id]);
    if (!usuario) {
      return res.status(404).json({ erro: 'Usuário não encontrado' });
    }

    await database.run('UPDATE pagamentos SET confirmado_por = NULL WHERE confirmado_por = ?', [usuario_id]);
    await database.run('UPDATE solicitacoes_blusa SET confirmado_por = NULL WHERE confirmado_por = ?', [usuario_id]);
    await database.run('DELETE FROM pagamentos WHERE usuario_id = ?', [usuario_id]);
    await database.run('DELETE FROM solicitacoes_blusa WHERE usuario_id = ?', [usuario_id]);
    await database.run('DELETE FROM presencas_reuniao WHERE usuario_id = ? OR registrada_por = ?', [usuario_id, usuario_id]);
    await database.run('DELETE FROM presencas_reuniao WHERE reuniao_id IN (SELECT id FROM reunioes WHERE criada_por = ?)', [usuario_id]);
    await database.run('DELETE FROM reunioes WHERE criada_por = ?', [usuario_id]);
    await database.run('DELETE FROM evento_usuarios WHERE usuario_id = ?', [usuario_id]);
    await registrarHistorico(usuario_id, 'usuario_excluido_pela_area_exclusiva', { excluido_por: req.dev.usuario });
    await database.run('DELETE FROM usuarios WHERE id = ?', [usuario_id]);

    res.json({ mensagem: 'Usuário excluído com sucesso' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao excluir usuário' });
  }
});

router.put('/escalar/:usuario_id', verificarTokenDesenvolvimento, async (req, res) => {
  try {
    const usuario_id = Number(req.params.usuario_id);
    const { perfil, equipe } = req.body;
    const perfisPermitidos = ['equipista', 'coordenador', 'equipe_dirigente'];

    if (!usuario_id) {
      return res.status(400).json({ erro: 'Usuário inválido' });
    }

    if (perfil && !perfisPermitidos.includes(perfil)) {
      return res.status(400).json({ erro: 'Perfil inválido' });
    }

    const usuario = await database.get('SELECT id FROM usuarios WHERE id = ?', [usuario_id]);
    if (!usuario) {
      return res.status(404).json({ erro: 'Usuário não encontrado' });
    }

    const equipeNormalizada = equipe ? normalizarEquipe(equipe) : null;
    if (equipeNormalizada && !equipeValida(equipeNormalizada)) {
      return res.status(400).json({ erro: 'Equipe inválida' });
    }

    if (perfil && equipeNormalizada) {
      await database.run('UPDATE usuarios SET perfil = ?, equipe = ? WHERE id = ?', [perfil, equipeNormalizada, usuario_id]);
    } else if (perfil) {
      await database.run('UPDATE usuarios SET perfil = ? WHERE id = ?', [perfil, usuario_id]);
    } else if (equipeNormalizada) {
      await database.run('UPDATE usuarios SET equipe = ? WHERE id = ?', [equipeNormalizada, usuario_id]);
    } else {
      return res.status(400).json({ erro: 'Informe perfil ou equipe para escalar' });
    }

    await registrarHistorico(usuario_id, 'usuario_escalado_pela_area_exclusiva', {
      alterado_por: req.dev.usuario,
      perfil: perfil || null,
      equipe: equipeNormalizada
    });

    res.json({ mensagem: 'Usuario escalado com sucesso' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao escalar usuario' });
  }
});

function parseDetalhes(valor) {
  if (!valor) return {};

  try {
    return JSON.parse(valor);
  } catch (err) {
    return { texto: valor };
  }
}

async function identificarResponsavel(detalhes) {
  const chaves = ['alterado_por', 'editado_por', 'excluido_por', 'registrado_por', 'confirmado_por', 'criado_por'];
  const chave = chaves.find(nome => detalhes && detalhes[nome] !== undefined && detalhes[nome] !== null && detalhes[nome] !== '');

  if (!chave) return '-';

  const valor = detalhes[chave];
  if (typeof valor === 'number' || /^\d+$/.test(String(valor))) {
    const usuario = await database.get('SELECT nome_completo, email FROM usuarios WHERE id = ?', [Number(valor)]);
    return usuario?.nome_completo || usuario?.email || `Usuario ID ${valor}`;
  }

  return String(valor);
}

module.exports = router;
