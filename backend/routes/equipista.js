const express = require('express');
const database = require('../config/database');
const { verificarToken, verificarPerfil } = require('../middleware/auth');
const { normalizarMovimentoOrigem, movimentoOrigemValido } = require('../utils/movimentoOrigem');
const { normalizarExperienciaPerfil } = require('../utils/experienciaPerfil');
const { normalizarAnoEncontro, anoEncontroValido } = require('../utils/anoEncontro');
const { registrarHistorico } = require('../utils/historico');

const router = express.Router();
const TAXAS_POR_MOVIMENTO = {
  EC: 25,
  EJC: 25,
  ECC: 35,
  'JOVENS EJC CASADOS': 35,
  ECRI: 15
};

// Atualizar perfil do equipista
router.put('/perfil', verificarToken, verificarPerfil(['equipista']), async (req, res) => {
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
    await registrarHistorico(usuario_id, 'perfil_atualizado', { origem: 'equipista' });

    res.json({ mensagem: 'Perfil atualizado com sucesso' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao atualizar perfil' });
  }
});

// Obter dados do perfil
router.get('/perfil', verificarToken, verificarPerfil(['equipista']), async (req, res) => {
  try {
    const usuario = await database.get(
      `SELECT id, email, nome_completo, nome_cracha, telefone, movimento_origem, ano_encontro,
              restricao_medica, restricao_alimentar, restricao_medicacao, foto_perfil, status,
              toca_instrumento, instrumentos, canta, equipes_servidas
       FROM usuarios WHERE id = ?`,
      [req.usuario.id]
    );
    
    res.json(usuario);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao obter perfil' });
  }
});

// Solicitar blusa
router.post('/solicitar-blusa', verificarToken, verificarPerfil(['equipista']), async (req, res) => {
  try {
    const { tamanho } = req.body;
    const usuario_id = req.usuario.id;

    if (!tamanho) {
      return res.status(400).json({ erro: 'Tamanho é obrigatório' });
    }

    const resultado = await database.run(
      `INSERT INTO solicitacoes_blusa (usuario_id, tamanho) VALUES (?, ?)`,
      [usuario_id, tamanho]
    );
    await registrarHistorico(usuario_id, 'blusa_solicitada', { tamanho, solicitacao_id: resultado.lastID });

    res.status(201).json({ 
      mensagem: 'Solicitação de blusa realizada com sucesso',
      id: resultado.lastID
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao solicitar blusa' });
  }
});

// Solicitar pagamento
router.post('/solicitar-pagamento', verificarToken, verificarPerfil(['equipista']), async (req, res) => {
  try {
    const { tipo, valor } = req.body;
    const usuario_id = req.usuario.id;

    if (!tipo || (tipo !== 'taxa' && !valor)) {
      return res.status(400).json({ erro: 'Tipo e valor são obrigatórios' });
    }

    const usuario = await database.get(
      'SELECT movimento_origem FROM usuarios WHERE id = ?',
      [usuario_id]
    );

    const movimentoOrigem = normalizarMovimentoOrigem(usuario?.movimento_origem);
    const valorPagamento = tipo === 'taxa'
      ? TAXAS_POR_MOVIMENTO[movimentoOrigem]
      : Number(valor);

    if (!valorPagamento || valorPagamento <= 0) {
      return res.status(400).json({ erro: 'Valor invalido' });
    }

    const resultado = await database.run(
      `INSERT INTO pagamentos (usuario_id, tipo, valor) VALUES (?, ?, ?)`,
      [usuario_id, tipo, valorPagamento]
    );
    await registrarHistorico(usuario_id, 'pagamento_solicitado', { tipo, valor: valorPagamento, pagamento_id: resultado.lastID });

    res.status(201).json({ 
      mensagem: 'Pagamento solicitado com sucesso',
      id: resultado.lastID
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao solicitar pagamento' });
  }
});

// Obter status de pagamentos e blusas
router.get('/status', verificarToken, verificarPerfil(['equipista']), async (req, res) => {
  try {
    const usuario_id = req.usuario.id;

    const pagamentos = await database.all(
      `SELECT id, tipo, valor, status, data_solicitacao FROM pagamentos WHERE usuario_id = ? ORDER BY data_solicitacao DESC`,
      [usuario_id]
    );

    const blusas = await database.all(
      `SELECT id, tamanho, status, data_solicitacao FROM solicitacoes_blusa WHERE usuario_id = ? ORDER BY data_solicitacao DESC`,
      [usuario_id]
    );

    res.json({ pagamentos, blusas });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao obter status' });
  }
});

module.exports = router;
