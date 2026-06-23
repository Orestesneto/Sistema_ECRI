const express = require('express');
const database = require('../config/database');
const { verificarToken, verificarPerfil } = require('../middleware/auth');
const { normalizarMovimentoOrigem, movimentoOrigemValido } = require('../utils/movimentoOrigem');
const { EQUIPES, normalizarEquipe, equipeValida } = require('../utils/equipes');
const { normalizarExperienciaPerfil } = require('../utils/experienciaPerfil');
const { normalizarAnoEncontro, anoEncontroValido } = require('../utils/anoEncontro');
const { registrarHistorico } = require('../utils/historico');
const { validarTelefoneUnico } = require('../utils/telefone');

const router = express.Router();
const TAMANHO_MAXIMO_FOTO_BYTES = 15 * 1024 * 1024;

// Obter dados do próprio perfil
router.get('/meu-perfil', verificarToken, verificarPerfil(['equipe_dirigente']), async (req, res) => {
  try {
    const usuario = await database.get(
      `SELECT id, email, nome_completo, nome_cracha, telefone, movimento_origem, ano_encontro,
              restricao_medica, restricao_alimentar, restricao_medicacao, foto_perfil,
              perfil, status, toca_instrumento, instrumentos, canta, equipes_servidas
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
router.put('/meu-perfil', verificarToken, verificarPerfil(['equipe_dirigente']), async (req, res) => {
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
    await registrarHistorico(usuario_id, 'perfil_atualizado', { origem: 'dirigente' });

    res.json({ mensagem: 'Perfil atualizado com sucesso' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao atualizar perfil' });
  }
});

// Obter todos os cadastros
router.get('/usuarios', verificarToken, verificarPerfil(['equipe_dirigente']), async (req, res) => {
  try {
    const usuarios = await database.all(`
      SELECT id, email, nome_completo, nome_cracha, telefone, movimento_origem, ano_encontro,
             restricao_medica, restricao_alimentar, restricao_medicacao, perfil, status, equipe, foto_perfil,
             toca_instrumento, instrumentos, canta, equipes_servidas
      FROM usuarios
      ORDER BY data_cadastro DESC
    `);

    res.json(usuarios);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao obter usuários' });
  }
});

router.put('/usuarios/:usuario_id/perfil', verificarToken, verificarPerfil(['equipe_dirigente']), async (req, res) => {
  try {
    const usuario_id = Number(req.params.usuario_id);
    const {
      nome_cracha,
      telefone,
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
      return res.status(400).json({ erro: 'Usuario invalido' });
    }

    if (!nome_cracha || !telefone || !movimentoOrigemValido(movimento_origem) || !anoEncontroValido(ano_encontro) || !statusPermitidos.includes(status)) {
      return res.status(400).json({ erro: 'Preencha cracha, telefone, movimento, ano e status validos' });
    }

    const usuario = await database.get('SELECT id FROM usuarios WHERE id = ?', [usuario_id]);
    if (!usuario) {
      return res.status(404).json({ erro: 'Usuario nao encontrado' });
    }

    const equipeNormalizada = equipe ? normalizarEquipe(equipe) : null;
    if (equipeNormalizada && !equipeValida(equipeNormalizada)) {
      return res.status(400).json({ erro: 'Equipe invalida' });
    }

    const movimentoOrigem = normalizarMovimentoOrigem(movimento_origem);
    const telefoneUnico = await validarTelefoneUnico(database, telefone, movimentoOrigem, {
      ignorarUsuarioId: usuario_id
    });
    if (!telefoneUnico.valido) {
      return res.status(400).json({ erro: telefoneUnico.erro });
    }

    await database.run(
      `UPDATE usuarios
       SET nome_cracha = ?, telefone = ?, movimento_origem = ?, ano_encontro = ?,
           restricao_medica = ?, restricao_alimentar = ?, restricao_medicacao = ?,
           status = ?, equipe = ?, toca_instrumento = ?, instrumentos = ?, canta = ?, equipes_servidas = ?
       WHERE id = ?`,
      [
        String(nome_cracha).trim().toUpperCase(),
        telefone,
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
    await registrarHistorico(usuario_id, 'perfil_editado_pela_dirigente', {
      editado_por: req.usuario.id,
      equipe: equipeNormalizada,
      status
    });

    res.json({ mensagem: 'Perfil atualizado com sucesso' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao atualizar perfil do usuario' });
  }
});

// Excluir outro usuario
router.delete('/usuarios/:usuario_id', verificarToken, verificarPerfil(['equipe_dirigente']), async (req, res) => {
  try {
    const usuario_id = Number(req.params.usuario_id);

    if (!usuario_id) {
      return res.status(400).json({ erro: 'Usuario invalido' });
    }

    if (usuario_id === req.usuario.id) {
      return res.status(400).json({ erro: 'Voce nao pode excluir o proprio usuario' });
    }

    const usuario = await database.get('SELECT id FROM usuarios WHERE id = ?', [usuario_id]);
    if (!usuario) {
      return res.status(404).json({ erro: 'Usuario nao encontrado' });
    }

    await database.run('UPDATE pagamentos SET confirmado_por = NULL WHERE confirmado_por = ?', [usuario_id]);
    await database.run('UPDATE solicitacoes_blusa SET confirmado_por = NULL WHERE confirmado_por = ?', [usuario_id]);
    await database.run('DELETE FROM pagamentos WHERE usuario_id = ?', [usuario_id]);
    await database.run('DELETE FROM solicitacoes_blusa WHERE usuario_id = ?', [usuario_id]);
    await database.run('DELETE FROM presencas_reuniao WHERE usuario_id = ? OR registrada_por = ?', [usuario_id, usuario_id]);
    await database.run('DELETE FROM presencas_reuniao WHERE reuniao_id IN (SELECT id FROM reunioes WHERE criada_por = ?)', [usuario_id]);
    await database.run('DELETE FROM reunioes WHERE criada_por = ?', [usuario_id]);
    await database.run('DELETE FROM evento_usuarios WHERE usuario_id = ?', [usuario_id]);
    await registrarHistorico(usuario_id, 'usuario_excluido', { excluido_por: req.usuario.id });
    await database.run('DELETE FROM usuarios WHERE id = ?', [usuario_id]);

    res.json({ mensagem: 'Usuario excluido com sucesso' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao excluir usuario' });
  }
});

router.get('/equipes', verificarToken, verificarPerfil(['equipe_dirigente']), (req, res) => {
  res.json(EQUIPES);
});

router.get('/pessoas-externas', verificarToken, verificarPerfil(['equipe_dirigente']), async (req, res) => {
  try {
    const pessoas = await database.all(`
      SELECT id, nome_completo, nome_cracha, telefone, movimento_origem, ano_encontro, foto_perfil, status, equipe, data_cadastro
      FROM pessoas_externas
      ORDER BY data_cadastro DESC
    `);

    res.json(pessoas);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao obter pessoas sem cadastro' });
  }
});

router.post('/pessoas-externas', verificarToken, verificarPerfil(['equipe_dirigente']), async (req, res) => {
  try {
    const { nome_completo, telefone, movimento_origem, ano_encontro, equipe, foto_perfil } = req.body;

    if (!nome_completo || !telefone || !movimento_origem || !ano_encontro || !equipe) {
      return res.status(400).json({ erro: 'Nome, telefone, movimento, ano do encontro e equipe sao obrigatorios' });
    }

    if (!movimentoOrigemValido(movimento_origem)) {
      return res.status(400).json({ erro: 'Movimento de origem invalido' });
    }

    if (!anoEncontroValido(ano_encontro)) {
      return res.status(400).json({ erro: 'Ano do encontro invalido' });
    }

    const equipeNormalizada = normalizarEquipe(equipe);
    if (!equipeValida(equipeNormalizada)) {
      return res.status(400).json({ erro: 'Equipe invalida' });
    }

    const movimentoOrigem = normalizarMovimentoOrigem(movimento_origem);
    const telefoneUnico = await validarTelefoneUnico(database, telefone, movimentoOrigem);
    if (!telefoneUnico.valido) {
      return res.status(400).json({ erro: telefoneUnico.erro });
    }

    const fotoPerfil = typeof foto_perfil === 'string' && foto_perfil.startsWith('data:image/')
      ? foto_perfil
      : null;

    if (fotoPerfil) {
      const fotoBase64 = fotoPerfil.split(',')[1] || '';
      const tamanhoFotoBytes = Math.ceil((fotoBase64.length * 3) / 4);
      if (tamanhoFotoBytes > TAMANHO_MAXIMO_FOTO_BYTES) {
        return res.status(400).json({ erro: 'A foto deve ter no maximo 15MB' });
      }
    }

    const resultado = await database.run(
      `INSERT INTO pessoas_externas (nome_completo, nome_cracha, telefone, movimento_origem, ano_encontro, equipe, foto_perfil, criado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        String(nome_completo).trim().toUpperCase(),
        String(nome_completo).trim().toUpperCase(),
        telefone,
        movimentoOrigem,
        normalizarAnoEncontro(ano_encontro),
        equipeNormalizada,
        fotoPerfil,
        req.usuario.id
      ]
    );
    await registrarHistorico(req.usuario.id, 'pessoa_sem_cadastro_adicionada', {
      pessoa_id: resultado.lastID,
      nome_completo: String(nome_completo).trim().toUpperCase(),
      equipe: equipeNormalizada
    });

    res.status(201).json({ mensagem: 'Pessoa adicionada a equipe com sucesso', id: resultado.lastID });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao adicionar pessoa sem cadastro' });
  }
});

router.delete('/pessoas-externas/:pessoa_id', verificarToken, verificarPerfil(['equipe_dirigente']), async (req, res) => {
  try {
    const pessoa_id = Number(req.params.pessoa_id);

    if (!pessoa_id) {
      return res.status(400).json({ erro: 'Pessoa invalida' });
    }

    await database.run('DELETE FROM pessoas_externas WHERE id = ?', [pessoa_id]);

    res.json({ mensagem: 'Pessoa removida da equipe com sucesso' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao remover pessoa sem cadastro' });
  }
});

router.get('/eventos', verificarToken, verificarPerfil(['equipe_dirigente']), async (req, res) => {
  try {
    const eventos = await database.all(`
      SELECT e.id, e.nome, e.descricao, e.data_evento, e.local, e.data_criacao,
             u.nome_completo AS criado_por_nome
      FROM eventos e
      JOIN usuarios u ON e.criado_por = u.id
      ORDER BY e.data_evento DESC, e.id DESC
    `);

    const escalas = await database.all(`
      SELECT eu.evento_id, eu.usuario_id, eu.papel_evento,
             u.nome_completo, u.nome_cracha, u.email, u.telefone, u.foto_perfil
      FROM evento_usuarios eu
      JOIN usuarios u ON eu.usuario_id = u.id
      ORDER BY u.nome_completo ASC
    `);

    const eventosComEscalas = eventos.map(evento => ({
      ...evento,
      escalados: escalas.filter(escala => escala.evento_id === evento.id)
    }));

    res.json(eventosComEscalas);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao obter eventos' });
  }
});

router.post('/eventos', verificarToken, verificarPerfil(['equipe_dirigente']), async (req, res) => {
  try {
    const { nome, descricao, data_evento, local } = req.body;

    if (!nome || !data_evento) {
      return res.status(400).json({ erro: 'Nome e data do evento sao obrigatorios' });
    }

    const resultado = await database.run(
      `INSERT INTO eventos (nome, descricao, data_evento, local, criado_por)
       VALUES (?, ?, ?, ?, ?)`,
      [nome, descricao || '', data_evento, local || '', req.usuario.id]
    );

    res.status(201).json({ mensagem: 'Evento criado com sucesso', evento_id: resultado.lastID });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao criar evento' });
  }
});

router.put('/eventos/:evento_id/escalacoes', verificarToken, verificarPerfil(['equipe_dirigente']), async (req, res) => {
  try {
    const evento_id = Number(req.params.evento_id);
    const { escalacoes } = req.body;

    if (!evento_id) {
      return res.status(400).json({ erro: 'Evento invalido' });
    }

    const evento = await database.get('SELECT id FROM eventos WHERE id = ?', [evento_id]);
    if (!evento) {
      return res.status(404).json({ erro: 'Evento nao encontrado' });
    }

    if (!Array.isArray(escalacoes)) {
      return res.status(400).json({ erro: 'Escalacoes invalidas' });
    }

    await database.run('DELETE FROM evento_usuarios WHERE evento_id = ?', [evento_id]);

    for (const escala of escalacoes) {
      const usuario_id = Number(escala.usuario_id);
      const papel_evento = escala.papel_evento;

      if (!usuario_id || !['coordenador', 'equipista'].includes(papel_evento)) {
        return res.status(400).json({ erro: 'Escalacao invalida' });
      }

      await database.run(
        `INSERT INTO evento_usuarios (evento_id, usuario_id, papel_evento)
         VALUES (?, ?, ?)`,
        [evento_id, usuario_id, papel_evento]
      );
    }

    res.json({ mensagem: 'Escalacao do evento atualizada com sucesso' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao atualizar escalacao do evento' });
  }
});

router.delete('/eventos/:evento_id', verificarToken, verificarPerfil(['equipe_dirigente']), async (req, res) => {
  try {
    const evento_id = Number(req.params.evento_id);

    if (!evento_id) {
      return res.status(400).json({ erro: 'Evento invalido' });
    }

    await database.run('DELETE FROM evento_usuarios WHERE evento_id = ?', [evento_id]);
    await database.run('DELETE FROM eventos WHERE id = ?', [evento_id]);

    res.json({ mensagem: 'Evento excluido com sucesso' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao excluir evento' });
  }
});

// Escalar usuário para coordenador
router.put('/escalar-coordenador/:usuario_id', verificarToken, verificarPerfil(['equipe_dirigente']), async (req, res) => {
  try {
    const usuario_id = req.params.usuario_id;

    await database.run(
      `UPDATE usuarios SET perfil = 'coordenador' WHERE id = ?`,
      [usuario_id]
    );
    await registrarHistorico(usuario_id, 'perfil_alterado', {
      novo_perfil: 'coordenador',
      alterado_por: req.usuario.id
    });

    res.json({ mensagem: 'Usuário escalado para coordenador' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao escalar usuário' });
  }
});

// Escalar usuário para Equipe Dirigente
router.put('/escalar-equipista/:usuario_id', verificarToken, verificarPerfil(['equipe_dirigente']), async (req, res) => {
  try {
    const usuario_id = req.params.usuario_id;

    await database.run(
      `UPDATE usuarios SET perfil = 'equipista' WHERE id = ?`,
      [usuario_id]
    );
    await registrarHistorico(usuario_id, 'perfil_alterado', {
      novo_perfil: 'equipista',
      alterado_por: req.usuario.id
    });

    res.json({ mensagem: 'Usuario escalado para equipista' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao escalar usuario' });
  }
});

router.put('/escalar-dirigente/:usuario_id', verificarToken, verificarPerfil(['equipe_dirigente']), async (req, res) => {
  try {
    const usuario_id = req.params.usuario_id;

    await database.run(
      `UPDATE usuarios SET perfil = 'equipe_dirigente' WHERE id = ?`,
      [usuario_id]
    );
    await registrarHistorico(usuario_id, 'perfil_alterado', {
      novo_perfil: 'equipe_dirigente',
      alterado_por: req.usuario.id
    });

    res.json({ mensagem: 'Usuário escalado para Equipe Dirigente' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao escalar usuário' });
  }
});

// Escalar usuário para equipe
router.put('/escalar-equipe/:usuario_id', verificarToken, verificarPerfil(['equipe_dirigente']), async (req, res) => {
  try {
    const usuario_id = req.params.usuario_id;
    const { equipe } = req.body;

    if (!equipe) {
      return res.status(400).json({ erro: 'Equipe é obrigatória' });
    }

    const equipeNormalizada = normalizarEquipe(equipe);
    if (!equipeValida(equipeNormalizada)) {
      return res.status(400).json({ erro: 'Equipe invalida' });
    }

    await database.run(
      `UPDATE usuarios SET equipe = ? WHERE id = ?`,
      [equipeNormalizada, usuario_id]
    );
    await registrarHistorico(usuario_id, 'equipe_alterada', {
      equipe: equipeNormalizada,
      alterado_por: req.usuario.id
    });

    res.json({ mensagem: 'Usuário escalado para equipe' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao escalar para equipe' });
  }
});

// Obter relatório por equipe
router.get('/relatorio/equipe/:equipe', verificarToken, verificarPerfil(['equipe_dirigente']), async (req, res) => {
  try {
    const equipe = req.params.equipe;

    const usuarios = await database.all(`
      SELECT id, nome_completo, email, perfil, status FROM usuarios WHERE equipe = ?
    `, [equipe]);

    const totalUsuarios = usuarios.length;
    const usuariosConfirmados = usuarios.filter(u => u.status === 'confirmado').length;
    const usuariosPendentes = usuarios.filter(u => u.status === 'pendente').length;

    res.json({
      equipe,
      totalUsuarios,
      usuariosConfirmados,
      usuariosPendentes,
      usuarios
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao gerar relatório' });
  }
});

// Obter relatório geral de todos os usuários
router.get('/relatorio/geral', verificarToken, verificarPerfil(['equipe_dirigente']), async (req, res) => {
  try {
    const usuarios = await database.all(`
      SELECT id, nome_completo, email, perfil, status, equipe, movimento_origem FROM usuarios
    `);
    const usuariosEscalados = usuarios.filter(u => u.equipe && u.equipe !== 'SEM EQUIPE');
    const equipesResumo = Object.values(usuariosEscalados.reduce((acc, usuario) => {
      const equipe = usuario.equipe;

      if (!acc[equipe]) {
        acc[equipe] = {
          equipe,
          ec: 0,
          ejc: 0,
          ecc: 0,
          jovensEjcCasados: 0,
          ecri: 0,
          quantidadePessoas: 0,
          totalPonderado: 0
        };
      }

      const movimento = normalizarMovimentoOrigem(usuario.movimento_origem);
      acc[equipe].quantidadePessoas += 1;

      if (movimento === 'EC') {
        acc[equipe].ec += 1;
        acc[equipe].totalPonderado += 1;
      } else if (movimento === 'EJC') {
        acc[equipe].ejc += 1;
        acc[equipe].totalPonderado += 1;
      } else if (movimento === 'ECC') {
        acc[equipe].ecc += 1;
        acc[equipe].totalPonderado += 2;
      } else if (movimento === 'JOVENS EJC CASADOS') {
        acc[equipe].jovensEjcCasados += 1;
        acc[equipe].totalPonderado += 2;
      } else if (movimento === 'ECRI') {
        acc[equipe].ecri += 1;
        acc[equipe].totalPonderado += 1;
      }

      return acc;
    }, {})).sort((a, b) => a.equipe.localeCompare(b.equipe, 'pt-BR'));

    const stats = {
      totalUsuarios: usuarios.length,
      equipistas: usuarios.filter(u => u.perfil === 'equipista').length,
      coordenadores: usuarios.filter(u => u.perfil === 'coordenador').length,
      dirigentes: usuarios.filter(u => u.perfil === 'equipe_dirigente').length,
      confirmados: usuarios.filter(u => u.status === 'confirmado').length,
      pendentes: usuarios.filter(u => u.status === 'pendente').length,
      totalEscaladosEquipes: usuariosEscalados.length,
      totalPonderadoEquipes: equipesResumo.reduce((total, equipe) => total + equipe.totalPonderado, 0)
    };

    res.json({ stats, usuarios, equipesResumo });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao gerar relatório' });
  }
});

// Visualizar situação de pagamentos e blusas
router.get('/situacao', verificarToken, verificarPerfil(['equipe_dirigente']), async (req, res) => {
  try {
    const pagamentos = await database.all(`
      SELECT p.id, p.tipo, p.valor, p.status, p.data_solicitacao,
             u.nome_completo, u.email, u.foto_perfil
      FROM pagamentos p
      JOIN usuarios u ON p.usuario_id = u.id
      ORDER BY p.data_solicitacao DESC
    `);

    const blusas = await database.all(`
      SELECT sb.id, sb.tamanho, sb.status, sb.data_solicitacao,
             u.nome_completo, u.email, u.foto_perfil
      FROM solicitacoes_blusa sb
      JOIN usuarios u ON sb.usuario_id = u.id
      ORDER BY sb.data_solicitacao DESC
    `);

    const stats = {
      pagamentosPendentes: pagamentos.filter(p => p.status === 'pendente').length,
      pagamentosConfirmados: pagamentos.filter(p => p.status === 'confirmado').length,
      blusasPendentes: blusas.filter(b => b.status === 'pendente').length,
      blusasConfirmadas: blusas.filter(b => b.status === 'confirmado').length
    };

    res.json({ stats, pagamentos, blusas });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao obter situação' });
  }
});

// Obter todas as reuniões dos próximos 15 dias
router.get('/reunioes-proximos-dias', verificarToken, verificarPerfil(['equipe_dirigente']), async (req, res) => {
  try {
    const hoje = new Date();
    const data_inicio = hoje.toISOString().split('T')[0];
    
    const data_fim = new Date();
    data_fim.setDate(data_fim.getDate() + 15);
    const data_fim_str = data_fim.toISOString().split('T')[0];

    const reunioes = await database.all(`
      SELECT r.id, r.titulo, r.descricao, r.data_reuniao, r.horario_inicio, r.horario_fim, 
             r.local, r.status, r.data_criacao,
             u.nome_completo, u.email, u.foto_perfil
      FROM reunioes r
      JOIN usuarios u ON r.criada_por = u.id
      WHERE r.data_reuniao BETWEEN ? AND ?
      ORDER BY r.data_reuniao ASC, r.horario_inicio ASC
    `, [data_inicio, data_fim_str]);

    res.json(reunioes);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao obter reuniões' });
  }
});

module.exports = router;
