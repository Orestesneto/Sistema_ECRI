const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const database = require('../config/database');
const { normalizarMovimentoOrigem, movimentoOrigemValido } = require('../utils/movimentoOrigem');
const { EQUIPES, normalizarEquipe, equipeValida } = require('../utils/equipes');
const { normalizarExperienciaPerfil } = require('../utils/experienciaPerfil');
const { normalizarAnoEncontro, anoEncontroValido } = require('../utils/anoEncontro');
const { registrarHistorico } = require('../utils/historico');
const { validarTelefoneUnico, normalizarCampoTelefoneContato } = require('../utils/telefone');
const { obterConfiguracao, salvarConfiguracao } = require('../utils/configuracoes');
const { normalizarParoquia, paroquiaValida } = require('../utils/paroquia');
const { apenasNumeros, cpfValido } = require('../utils/cpf');
const {
  VALOR_BLUSA_UNICA,
  VALOR_BLUSA_MULTIPLA,
  normalizarValorBlusa,
  obterValoresBlusa,
  recalcularValoresBlusasTodosUsuarios
} = require('../utils/precoBlusa');

const router = express.Router();
const MOTIVOS_IMPEDIMENTO_SERVIR = [
  'Separação do casal',
  'Não faz parte dos movimentos',
  'Não tem casamento na Igreja',
  'Outros'
];

const DEV_USUARIO = process.env.DEV_USUARIO || (process.env.NODE_ENV === 'production' ? '' : 'orestes.pereira');
const DEV_SENHA = process.env.DEV_SENHA || (process.env.NODE_ENV === 'production' ? '' : 'neto1991');

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

  if (!DEV_USUARIO || !DEV_SENHA) {
    return res.status(503).json({ erro: 'Acesso de desenvolvimento nao configurado' });
  }

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

router.post('/criar-dirigente', verificarTokenDesenvolvimento, async (req, res) => {
  try {
    const cpf = String(req.body.cpf || '11111111111').replace(/\D/g, '') || null;
    const email = String(req.body.email || `${cpf}@cpf.ecri.local`).trim().toLowerCase();
    const senha = String(req.body.senha || '01012000').trim();
    const nomeCompleto = String(req.body.nome_completo || 'ADMINISTRADOR DO SISTEMA').trim().toUpperCase();
    const nomeCracha = String(req.body.nome_cracha || 'ADMIN').trim().toUpperCase();
    const telefone = String(req.body.telefone || '(11) 99999-9999').trim();
    const dataNascimento = String(req.body.data_nascimento || senha).replace(/\D/g, '');

    if (!email || !senha || !nomeCompleto || !nomeCracha || !telefone) {
      return res.status(400).json({ erro: 'Email, senha, nome e telefone sao obrigatorios' });
    }

    const senhaHash = await bcrypt.hash(senha, 10);
    const usuarioExistente = await database.get('SELECT id FROM usuarios WHERE email = ?', [email]);

    if (usuarioExistente) {
      await database.run(
        `UPDATE usuarios
         SET senha = ?, nome_completo = ?, nome_cracha = ?, telefone = ?, cpf = COALESCE(?, cpf),
             data_nascimento = COALESCE(?, data_nascimento), movimento_origem = 'ECRI',
             perfil = 'equipe_dirigente', status = 'confirmado'
         WHERE email = ?`,
        [senhaHash, nomeCompleto, nomeCracha, telefone, cpf, dataNascimento || null, email]
      );

      return res.json({
        mensagem: 'Usuario dirigente atualizado com sucesso',
        email,
        perfil: 'equipe_dirigente'
      });
    }

    const resultado = await database.run(
      `INSERT INTO usuarios (
        email, senha, nome_completo, nome_cracha, telefone, paroquia, cpf, data_nascimento,
        ano_encontro, toca_instrumento, instrumentos, canta, equipes_servidas,
        movimento_origem, perfil, status, equipe
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        email,
        senhaHash,
        nomeCompleto,
        nomeCracha,
        telefone,
        'SAO PEDRO E SAO PAULO',
        cpf,
        dataNascimento || null,
        '2026',
        'nao',
        '',
        'nao',
        JSON.stringify([]),
        'ECRI',
        'equipe_dirigente',
        'confirmado',
        'EQUIPE DIRIGENTE'
      ]
    );

    await registrarHistorico(resultado.lastID, 'dirigente_criado_desenvolvimento', {
      email,
      nome_completo: nomeCompleto
    });

    res.status(201).json({
      mensagem: 'Usuario dirigente criado com sucesso',
      id: resultado.lastID,
      email,
      perfil: 'equipe_dirigente'
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao criar usuario dirigente' });
  }
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

router.get('/usuarios/:usuario_id/acoes', verificarTokenDesenvolvimento, async (req, res) => {
  try {
    const usuario_id = Number(req.params.usuario_id);

    if (!usuario_id) {
      return res.status(400).json({ erro: 'Usuário inválido' });
    }

    const usuario = await database.get('SELECT id, nome_completo, perfil FROM usuarios WHERE id = ?', [usuario_id]);
    if (!usuario) {
      return res.status(404).json({ erro: 'Usuário não encontrado' });
    }

    const logs = await database.all(`
      SELECT h.id, h.usuario_id, h.acao, h.detalhes, h.data_acao,
             u.nome_completo, u.email, u.perfil, u.equipe
      FROM historico h
      LEFT JOIN usuarios u ON u.id = h.usuario_id
      ORDER BY h.data_acao DESC, h.id DESC
      LIMIT 1000
    `);

    const acoes = logs
      .map(log => ({ ...log, detalhes: parseDetalhes(log.detalhes) }))
      .filter(log => autorHistoricoEhUsuario(log.detalhes, usuario_id))
      .slice(0, 300);

    res.json(await Promise.all(acoes.map(async (log) => ({
      ...log,
      responsavel: await identificarResponsavel(log.detalhes)
    }))));
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao carregar ações do usuário' });
  }
});

router.get('/carografo', verificarTokenDesenvolvimento, async (req, res) => {
  try {
    const usuarios = await database.all(`
      SELECT id, email, nome_completo, nome_cracha, telefone, cpf, data_nascimento, movimento_origem, ano_encontro,
             paroquia, restricao_medica, restricao_alimentar, restricao_medicacao,
             perfil, status, equipe, pessoa_impedida_servir, pessoa_impedida_motivos, foto_perfil, toca_instrumento, instrumentos, canta, equipes_servidas,
             'usuario' AS origem_cadastro
      FROM usuarios
      ORDER BY nome_completo ASC
    `);

    const pessoasExternas = await database.all(`
      SELECT id, NULL AS email, nome_completo, nome_cracha, telefone, NULL AS cpf, NULL AS data_nascimento,
             movimento_origem, ano_encontro, paroquia, NULL AS restricao_medica, NULL AS restricao_alimentar,
             NULL AS restricao_medicacao, 'sem_cadastro' AS perfil, status, equipe, 0 AS pessoa_impedida_servir,
             NULL AS pessoa_impedida_motivos, foto_perfil, 'nao' AS toca_instrumento, '' AS instrumentos,
             'nao' AS canta, NULL AS equipes_servidas, 'externo' AS origem_cadastro
      FROM pessoas_externas
    `);

    res.json([...usuarios, ...pessoasExternas].sort((a, b) =>
      String(a.nome_completo || '').localeCompare(String(b.nome_completo || ''), 'pt-BR', { sensitivity: 'base' })
    ));
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao carregar carografo' });
  }
});

router.get('/usuarios-excluidos', verificarTokenDesenvolvimento, async (req, res) => {
  try {
    const registros = await database.all(`
      SELECT id, usuario_id, dados, excluido_por, origem, data_exclusao
      FROM usuarios_excluidos
      ORDER BY data_exclusao DESC, id DESC
      LIMIT 1000
    `);

    const registrosFormatados = await Promise.all(registros.map(async (registro) => ({
      id: registro.id,
      usuario_id: registro.usuario_id,
      excluido_por: registro.excluido_por,
      excluido_por_nome: await identificarResponsavel({ excluido_por: registro.excluido_por }),
      origem: registro.origem,
      data_exclusao: registro.data_exclusao,
      ...parseDetalhes(registro.dados)
    })));

    res.json(registrosFormatados);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao carregar usuários excluídos' });
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
      cpf,
      data_nascimento,
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
    const statusPermitidos = ['pendente', 'confirmado', 'contato_errado', 'negou', 'desistiu'];
    const experiencia = normalizarExperienciaPerfil(req.body);
    const cpfNumeros = apenasNumeros(cpf);
    const dataNascimento = apenasNumeros(data_nascimento);

    if (!usuario_id) {
      return res.status(400).json({ erro: 'Usuário inválido' });
    }

    if (!nome_cracha || !cpfNumeros || !dataNascimento || !telefone || !paroquia || !movimentoOrigemValido(movimento_origem) || !anoEncontroValido(ano_encontro) || !statusPermitidos.includes(status)) {
      return res.status(400).json({ erro: 'Preencha crachá, CPF, data de nascimento, telefone, paróquia, movimento, ano e status válidos' });
    }

    if (!cpfValido(cpfNumeros)) {
      return res.status(400).json({ erro: 'CPF inválido' });
    }

    if (dataNascimento.length !== 8) {
      return res.status(400).json({ erro: 'Data de nascimento deve conter 8 números' });
    }

    const usuario = await database.get('SELECT id, data_nascimento, status FROM usuarios WHERE id = ?', [usuario_id]);
    if (!usuario) {
      return res.status(404).json({ erro: 'Usuário não encontrado' });
    }

    const cpfExistente = await database.get('SELECT id FROM usuarios WHERE cpf = ? AND id <> ?', [cpfNumeros, usuario_id]);
    if (cpfExistente) {
      return res.status(400).json({ erro: 'CPF já cadastrado em outro usuário' });
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
    const telefoneNormalizado = normalizarCampoTelefoneContato(telefone);
    const telefoneUnico = await validarTelefoneUnico(database, telefoneNormalizado, movimentoOrigem, {
      ignorarUsuarioId: usuario_id
    });
    if (!telefoneUnico.valido) {
      return res.status(400).json({ erro: telefoneUnico.erro });
    }

    const senhaHash = dataNascimento !== usuario.data_nascimento
      ? await bcrypt.hash(dataNascimento, 10)
      : null;
    const emailInterno = `${cpfNumeros}@cpf.ecri.local`;
    const statusFinal = usuario.status === 'contato_errado' ? 'pendente' : status;

    await database.run(
      `UPDATE usuarios
       SET email = ?, senha = COALESCE(?, senha), nome_cracha = ?, cpf = ?, data_nascimento = ?,
           telefone = ?, paroquia = ?, movimento_origem = ?, ano_encontro = ?,
           restricao_medica = ?, restricao_alimentar = ?, restricao_medicacao = ?,
           status = ?, equipe = ?, toca_instrumento = ?, instrumentos = ?, canta = ?, equipes_servidas = ?
       WHERE id = ?`,
      [
        emailInterno,
        senhaHash,
        String(nome_cracha).trim().toUpperCase(),
        cpfNumeros,
        dataNascimento,
        telefoneNormalizado,
        paroquiaNormalizada,
        movimentoOrigem,
        normalizarAnoEncontro(ano_encontro),
        restricao_medica || '',
        restricao_alimentar || '',
        restricao_medicacao || '',
        statusFinal,
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
      status: statusFinal
    });

    res.json({ mensagem: 'Perfil atualizado com sucesso' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao atualizar perfil do usuário' });
  }
});

router.put('/usuarios/:usuario_id/impedimento-servir', verificarTokenDesenvolvimento, async (req, res) => {
  try {
    const usuario_id = Number(req.params.usuario_id);
    const pessoaImpedidaServir = req.body.pessoa_impedida_servir ? 1 : 0;
    const motivos = pessoaImpedidaServir
      ? normalizarMotivosImpedimentoServir(req.body.motivos_impedimento_servir, req.body.outro_motivo_impedimento_servir)
      : null;

    if (!usuario_id) {
      return res.status(400).json({ erro: 'Usuário inválido' });
    }

    if (pessoaImpedidaServir && motivos.erro) {
      return res.status(400).json({ erro: motivos.erro });
    }

    const usuario = await database.get('SELECT id FROM usuarios WHERE id = ?', [usuario_id]);
    if (!usuario) {
      return res.status(404).json({ erro: 'Usuário não encontrado' });
    }

    const motivosComResponsavel = motivos
      ? {
          ...motivos.dados,
          cadastrado_por_nome: req.dev.usuario
        }
      : null;

    await database.run(
      'UPDATE usuarios SET pessoa_impedida_servir = ?, pessoa_impedida_motivos = ? WHERE id = ?',
      [pessoaImpedidaServir, motivosComResponsavel ? JSON.stringify(motivosComResponsavel) : null, usuario_id]
    );

    await registrarHistorico(usuario_id, 'impedimento_servir_atualizado_area_exclusiva', {
      editado_por: req.dev.usuario,
      pessoa_impedida_servir: Boolean(pessoaImpedidaServir),
      pessoa_impedida_motivos: motivosComResponsavel
    });

    res.json({
      mensagem: 'Informação atualizada com sucesso',
      pessoa_impedida_servir: pessoaImpedidaServir,
      pessoa_impedida_motivos: motivosComResponsavel ? JSON.stringify(motivosComResponsavel) : null
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao atualizar impedimento para servir' });
  }
});

router.delete('/usuarios/:usuario_id', verificarTokenDesenvolvimento, async (req, res) => {
  try {
    const usuario_id = Number(req.params.usuario_id);

    if (!usuario_id) {
      return res.status(400).json({ erro: 'Usuário inválido' });
    }

    const usuario = await database.get('SELECT * FROM usuarios WHERE id = ?', [usuario_id]);
    if (!usuario) {
      return res.status(404).json({ erro: 'Usuário não encontrado' });
    }

    await registrarUsuarioExcluido(usuario, req.dev.usuario, 'area_exclusiva');

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

router.put('/pessoas-externas/:pessoa_id/equipe', verificarTokenDesenvolvimento, async (req, res) => {
  try {
    const pessoa_id = Number(req.params.pessoa_id);
    const { equipe } = req.body;

    if (!pessoa_id) {
      return res.status(400).json({ erro: 'Pessoa inválida' });
    }

    if (!equipe) {
      return res.status(400).json({ erro: 'Equipe é obrigatória' });
    }

    const equipeNormalizada = normalizarEquipe(equipe);
    if (!equipeValida(equipeNormalizada)) {
      return res.status(400).json({ erro: 'Equipe inválida' });
    }

    const pessoa = await database.get('SELECT id, nome_completo FROM pessoas_externas WHERE id = ?', [pessoa_id]);
    if (!pessoa) {
      return res.status(404).json({ erro: 'Pessoa sem cadastro não encontrada' });
    }

    await database.run(
      'UPDATE pessoas_externas SET equipe = ? WHERE id = ?',
      [equipeNormalizada, pessoa_id]
    );

    await registrarHistorico(null, 'pessoa_sem_cadastro_escalada_area_exclusiva', {
      alterado_por: req.dev.usuario,
      pessoa_id,
      nome_completo: pessoa.nome_completo,
      equipe: equipeNormalizada
    });

    res.json({ mensagem: 'Pessoa sem cadastro escalada com sucesso' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao escalar pessoa sem cadastro' });
  }
});

router.delete('/pessoas-externas/:pessoa_id', verificarTokenDesenvolvimento, async (req, res) => {
  try {
    const pessoa_id = Number(req.params.pessoa_id);

    if (!pessoa_id) {
      return res.status(400).json({ erro: 'Pessoa inválida' });
    }

    const pessoa = await database.get('SELECT * FROM pessoas_externas WHERE id = ?', [pessoa_id]);
    if (!pessoa) {
      return res.status(404).json({ erro: 'Pessoa sem cadastro não encontrada' });
    }

    await registrarPessoaExternaExcluida(pessoa, req.dev.usuario, 'area_exclusiva');
    await database.run('DELETE FROM pessoas_externas WHERE id = ?', [pessoa_id]);

    await registrarHistorico(null, 'pessoa_sem_cadastro_excluida_area_exclusiva', {
      excluido_por: req.dev.usuario,
      pessoa_id,
      nome_completo: pessoa.nome_completo,
      equipe: pessoa.equipe
    });

    res.json({ mensagem: 'Pessoa sem cadastro excluída com sucesso' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao excluir pessoa sem cadastro' });
  }
});

function normalizarMotivosImpedimentoServir(motivosRecebidos, outroMotivoRecebido) {
  const motivos = Array.isArray(motivosRecebidos)
    ? motivosRecebidos.map(item => String(item || '').trim()).filter(Boolean)
    : [];
  const motivosValidos = motivos.filter(item => MOTIVOS_IMPEDIMENTO_SERVIR.includes(item));
  const motivosUnicos = Array.from(new Set(motivosValidos));
  const outroMotivo = String(outroMotivoRecebido || '').trim();

  if (!motivosUnicos.length) {
    return { erro: 'Selecione ao menos um motivo' };
  }

  if (motivosUnicos.includes('Outros') && !outroMotivo) {
    return { erro: 'Informe o motivo em Outros' };
  }

  return {
    dados: {
      motivos: motivosUnicos,
      outro: motivosUnicos.includes('Outros') ? outroMotivo : ''
    }
  };
}

function parseDetalhes(valor) {
  if (!valor) return {};

  try {
    return JSON.parse(valor);
  } catch (err) {
    return { texto: valor };
  }
}

function autorHistoricoEhUsuario(detalhes, usuarioId) {
  const chaves = ['alterado_por', 'editado_por', 'excluido_por', 'registrado_por', 'confirmado_por', 'criado_por'];
  return chaves.some((chave) => Number(detalhes?.[chave]) === Number(usuarioId));
}

async function registrarUsuarioExcluido(usuario, excluidoPor, origem) {
  await database.run(
    `INSERT INTO usuarios_excluidos (usuario_id, dados, excluido_por, origem)
     VALUES (?, ?, ?, ?)`,
    [
      usuario.id,
      JSON.stringify(usuario),
      excluidoPor || null,
      origem
    ]
  );
}

async function registrarPessoaExternaExcluida(pessoa, excluidoPor, origem) {
  await database.run(
    `INSERT INTO usuarios_excluidos (usuario_id, dados, excluido_por, origem)
     VALUES (?, ?, ?, ?)`,
    [
      null,
      JSON.stringify({
        ...pessoa,
        perfil: 'sem_cadastro',
        origem_cadastro: 'externo'
      }),
      excluidoPor || null,
      origem
    ]
  );
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
