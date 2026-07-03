const express = require('express');
const bcrypt = require('bcryptjs');
const database = require('../config/database');
const { verificarToken, verificarPerfil } = require('../middleware/auth');
const { normalizarMovimentoOrigem, movimentoOrigemValido } = require('../utils/movimentoOrigem');
const { EQUIPES, normalizarEquipe, equipeValida, equipeSemEquipe, aplicarRegraSemEquipe } = require('../utils/equipes');
const { normalizarExperienciaPerfil } = require('../utils/experienciaPerfil');
const { normalizarAnoEncontro, anoEncontroValido } = require('../utils/anoEncontro');
const { registrarHistorico } = require('../utils/historico');
const { validarTelefoneUnico, normalizarTelefoneCelular, normalizarCampoTelefoneContato } = require('../utils/telefone');
const { normalizarParoquia, paroquiaValida } = require('../utils/paroquia');
const { normalizarFotoPerfil } = require('../utils/foto');
const { apenasNumeros, cpfValido } = require('../utils/cpf');
const { obterConfiguracao, salvarConfiguracao } = require('../utils/configuracoes');
const { criarNotificacoesParaUsuarios } = require('../utils/notificacoes');

const router = express.Router();
const MOTIVOS_IMPEDIMENTO_SERVIR = [
  'Separação do casal',
  'Não faz parte dos movimentos',
  'Não tem casamento na Igreja',
  'Outros'
];

async function obterUsuariosRelacionadosParaExclusao(usuario) {
  const cpf = usuario?.cpf || '__cpf_inexistente__';
  const email = usuario?.email || '__email_inexistente__';
  const telefone = usuario?.telefone || '__telefone_inexistente__';

  return database.all(
    `SELECT *
     FROM usuarios
     WHERE id = ?
        OR (cpf IS NOT NULL AND cpf <> '' AND cpf = ?)
        OR (email IS NOT NULL AND email <> '' AND email = ?)
        OR (telefone IS NOT NULL AND telefone <> '' AND telefone = ?)`,
    [usuario.id, cpf, email, telefone]
  );
}

async function registrarUsuarioExcluidoSeNecessario(usuario, excluidoPor, origem) {
  const existente = await database.get(
    'SELECT id FROM usuarios_excluidos WHERE usuario_id = ? LIMIT 1',
    [usuario.id]
  );
  if (existente) return;

  await database.run(
    `INSERT INTO usuarios_excluidos (usuario_id, dados, excluido_por, origem)
     VALUES (?, ?, ?, ?)`,
    [usuario.id, JSON.stringify(usuario), excluidoPor, origem]
  );
}

async function apagarUsuarioAtivo(usuarioId) {
  await database.run('UPDATE pagamentos SET confirmado_por = NULL WHERE confirmado_por = ?', [usuarioId]);
  await database.run('UPDATE solicitacoes_blusa SET confirmado_por = NULL WHERE confirmado_por = ?', [usuarioId]);
  await database.run('DELETE FROM dispositivos_push WHERE usuario_id = ?', [usuarioId]);
  await database.run('DELETE FROM notificacoes WHERE usuario_id = ?', [usuarioId]);
  await database.run('DELETE FROM pagamentos WHERE usuario_id = ?', [usuarioId]);
  await database.run('DELETE FROM solicitacoes_blusa WHERE usuario_id = ?', [usuarioId]);
  await database.run('DELETE FROM mensagens_chamada_enviadas WHERE usuario_id = ? OR enviada_por = ?', [usuarioId, usuarioId]);
  await database.run('DELETE FROM presencas_reuniao WHERE usuario_id = ? OR registrada_por = ?', [usuarioId, usuarioId]);
  await database.run('DELETE FROM presencas_reuniao WHERE reuniao_id IN (SELECT id FROM reunioes WHERE criada_por = ?)', [usuarioId]);
  await database.run('DELETE FROM mensagens_chamada_enviadas WHERE reuniao_id IN (SELECT id FROM reunioes WHERE criada_por = ?)', [usuarioId]);
  await database.run('DELETE FROM reunioes WHERE criada_por = ?', [usuarioId]);
  await database.run('DELETE FROM evento_usuarios WHERE usuario_id = ?', [usuarioId]);
  await database.run('DELETE FROM evento_usuarios WHERE evento_id IN (SELECT id FROM eventos WHERE criado_por = ?)', [usuarioId]);
  await database.run('DELETE FROM eventos WHERE criado_por = ?', [usuarioId]);
  await database.run('DELETE FROM usuarios WHERE id = ?', [usuarioId]);
}

function normalizarIdentificadorExclusao(valor) {
  return String(valor || '').trim().toLowerCase();
}

function montarAssinaturasUsuarioExclusao(usuario) {
  return [
    `id:${Number(usuario?.id || 0) || ''}`,
    `cpf:${normalizarIdentificadorExclusao(usuario?.cpf)}`,
    `email:${normalizarIdentificadorExclusao(usuario?.email)}`,
    `telefone:${normalizarIdentificadorExclusao(usuario?.telefone)}`
  ].filter(item => !item.endsWith(':'));
}

function montarAssinaturasExcluidos(registros) {
  const assinaturas = new Set();
  for (const registro of registros || []) {
    let dados = {};
    try {
      dados = JSON.parse(registro.dados || '{}');
    } catch (err) {
      dados = {};
    }

    montarAssinaturasUsuarioExclusao({
      ...dados,
      id: registro.usuario_id || dados.id
    }).forEach(assinatura => assinaturas.add(assinatura));
  }
  return assinaturas;
}

// Obter dados do próprio perfil
router.get('/meu-perfil', verificarToken, verificarPerfil(['equipe_dirigente']), async (req, res) => {
  try {
    const usuario = await database.get(
      `SELECT id, email, nome_completo, nome_cracha, telefone, movimento_origem, ano_encontro,
              paroquia, restricao_medica, restricao_alimentar, restricao_medicacao, foto_perfil,
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
    const { nome_cracha, paroquia, restricao_medica, restricao_alimentar, restricao_medicacao, foto_perfil, ano_encontro } = req.body;
    const usuario_id = req.usuario.id;
    const experiencia = normalizarExperienciaPerfil(req.body);

    if (!anoEncontroValido(ano_encontro)) {
      return res.status(400).json({ erro: 'Ano do encontro inválido' });
    }

    if (!paroquiaValida(paroquia)) {
      return res.status(400).json({ erro: 'Paróquia inválida' });
    }
    const anoEncontro = normalizarAnoEncontro(ano_encontro);
    const paroquiaNormalizada = normalizarParoquia(paroquia);

    const fotoValidada = normalizarFotoPerfil(foto_perfil);
    if (fotoValidada.erro) {
      return res.status(400).json({ erro: fotoValidada.erro });
    }
    const fotoPerfil = fotoValidada.fotoPerfil;

    await database.run(
      `UPDATE usuarios
       SET nome_cracha = ?, restricao_medica = ?, restricao_alimentar = ?, restricao_medicacao = ?,
           foto_perfil = COALESCE(?, foto_perfil), ano_encontro = ?, paroquia = ?, toca_instrumento = ?,
           instrumentos = ?, canta = ?, equipes_servidas = ?,
           status = CASE WHEN status = 'contato_errado' THEN 'pendente' ELSE status END
       WHERE id = ?`,
      [
        nome_cracha,
        restricao_medica,
        restricao_alimentar,
        restricao_medicacao,
        fotoPerfil,
        anoEncontro,
        paroquiaNormalizada,
        experiencia.tocaInstrumento,
        experiencia.instrumentos,
        experiencia.canta,
        experiencia.equipesServidasJson,
        usuario_id
      ]
    );
    await registrarHistorico(usuario_id, 'perfil_atualizado', { origem: 'dirigente' });

    res.json({
      mensagem: 'Perfil atualizado com sucesso',
      paroquia: paroquiaNormalizada
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao atualizar perfil' });
  }
});

router.get('/configuracoes-encontro', verificarToken, verificarPerfil(['equipe_dirigente']), async (req, res) => {
  try {
    res.json({
      reuniao_entrega_pastas: (await obterConfiguracao(database, 'reuniao_entrega_pastas', 'false')) === 'true',
      reuniao_revelacao_equipes: (await obterConfiguracao(database, 'reuniao_revelacao_equipes', 'false')) === 'true',
      parar_pedidos_blusa: (await obterConfiguracao(database, 'parar_pedidos_blusa', 'false')) === 'true'
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao carregar configurações do encontro' });
  }
});

router.put('/configuracoes-encontro', verificarToken, verificarPerfil(['equipe_dirigente']), async (req, res) => {
  try {
    const reuniaoEntregaPastas = Boolean(req.body.reuniao_entrega_pastas);
    const reuniaoRevelacaoEquipes = Boolean(req.body.reuniao_revelacao_equipes);
    const pararPedidosBlusa = Boolean(req.body.parar_pedidos_blusa);

    await salvarConfiguracao(database, 'reuniao_entrega_pastas', reuniaoEntregaPastas ? 'true' : 'false');
    await salvarConfiguracao(database, 'reuniao_revelacao_equipes', reuniaoRevelacaoEquipes ? 'true' : 'false');
    await salvarConfiguracao(database, 'parar_pedidos_blusa', pararPedidosBlusa ? 'true' : 'false');

    await registrarHistorico(req.usuario.id, 'configuracoes_encontro_atualizadas', {
      reuniao_entrega_pastas: reuniaoEntregaPastas,
      reuniao_revelacao_equipes: reuniaoRevelacaoEquipes,
      parar_pedidos_blusa: pararPedidosBlusa
    });

    res.json({
      mensagem: 'Configurações salvas com sucesso',
      reuniao_entrega_pastas: reuniaoEntregaPastas,
      reuniao_revelacao_equipes: reuniaoRevelacaoEquipes,
      parar_pedidos_blusa: pararPedidosBlusa
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao salvar configurações do encontro' });
  }
});

router.post('/notificacoes/equipes', verificarToken, verificarPerfil(['equipe_dirigente']), async (req, res) => {
  try {
    const titulo = String(req.body?.titulo || '').trim();
    const mensagem = String(req.body?.mensagem || '').trim();

    if (!titulo || titulo.length < 3) {
      return res.status(400).json({ erro: 'Informe um título para a notificação' });
    }

    if (!mensagem || mensagem.length < 3) {
      return res.status(400).json({ erro: 'Informe a mensagem da notificação' });
    }

    if (titulo.length > 80) {
      return res.status(400).json({ erro: 'O título deve ter no máximo 80 caracteres' });
    }

    if (mensagem.length > 500) {
      return res.status(400).json({ erro: 'A mensagem deve ter no máximo 500 caracteres' });
    }

    const usuarios = await database.all(
      `SELECT id
       FROM usuarios
       WHERE equipe IS NOT NULL
         AND TRIM(equipe) <> ''
         AND UPPER(TRIM(equipe)) <> 'SEM EQUIPE'
         AND status NOT IN ('desistiu', 'negou', 'contato_errado')`
    );

    const usuarioIds = usuarios.map(usuario => Number(usuario.id)).filter(Boolean);
    const total = await criarNotificacoesParaUsuarios(usuarioIds, {
      titulo,
      mensagem,
      tipo: 'aviso_dirigente',
      referencia_tipo: 'notificacao_dirigente',
      referencia_id: req.usuario.id
    });

    await registrarHistorico(req.usuario.id, 'notificacao_dirigente_enviada', {
      titulo,
      total_destinatarios: total
    });

    res.json({
      mensagem: 'Notificação enviada com sucesso',
      total_destinatarios: total
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao enviar notificação' });
  }
});

// Obter todos os cadastros
router.get('/usuarios', verificarToken, verificarPerfil(['equipe_dirigente']), async (req, res) => {
  try {
    const usuarios = await database.all(`
      SELECT id, email, nome_completo, nome_cracha, telefone, cpf, data_nascimento, movimento_origem, ano_encontro,
             paroquia, restricao_medica, restricao_alimentar, restricao_medicacao, perfil, status, equipe, pessoa_impedida_servir, pessoa_impedida_motivos, foto_perfil,
             toca_instrumento, instrumentos, canta, equipes_servidas
      FROM usuarios
      WHERE NOT EXISTS (
        SELECT 1 FROM usuarios_excluidos ue WHERE ue.usuario_id = usuarios.id
      )
      ORDER BY data_cadastro DESC
    `);
    const excluidos = await database.all('SELECT usuario_id, dados FROM usuarios_excluidos');
    const assinaturasExcluidas = montarAssinaturasExcluidos(excluidos);
    const usuariosAtivos = usuarios.filter(usuario => {
      const assinaturasUsuario = montarAssinaturasUsuarioExclusao(usuario);
      return !assinaturasUsuario.some(assinatura => assinaturasExcluidas.has(assinatura));
    });

    res.json(usuariosAtivos);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao obter usuários' });
  }
});

router.get('/usuarios/:usuario_id', verificarToken, verificarPerfil(['equipe_dirigente']), async (req, res) => {
  try {
    const usuario_id = Number(req.params.usuario_id);
    if (!usuario_id) {
      return res.status(400).json({ erro: 'Usuário inválido' });
    }

    const usuario = await database.get(`
      SELECT id, email, nome_completo, nome_cracha, telefone, cpf, data_nascimento, movimento_origem, ano_encontro,
             paroquia, restricao_medica, restricao_alimentar, restricao_medicacao, perfil, status, equipe, pessoa_impedida_servir, pessoa_impedida_motivos, foto_perfil,
             toca_instrumento, instrumentos, canta, equipes_servidas
      FROM usuarios
      WHERE id = ?
        AND NOT EXISTS (
          SELECT 1 FROM usuarios_excluidos ue WHERE ue.usuario_id = usuarios.id
        )
    `, [usuario_id]);

    if (!usuario) {
      return res.status(404).json({ erro: 'Usuário não encontrado' });
    }

    const excluidos = await database.all('SELECT usuario_id, dados FROM usuarios_excluidos');
    const assinaturasExcluidas = montarAssinaturasExcluidos(excluidos);
    const usuarioExcluido = montarAssinaturasUsuarioExclusao(usuario)
      .some(assinatura => assinaturasExcluidas.has(assinatura));

    if (usuarioExcluido) {
      return res.status(404).json({ erro: 'Usuário não encontrado' });
    }

    res.json(usuario);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao obter usuário' });
  }
});

router.put('/usuarios/:usuario_id/perfil', verificarToken, verificarPerfil(['equipe_dirigente']), async (req, res) => {
  try {
    const usuario_id = Number(req.params.usuario_id);
    const {
      nome_completo,
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
    const nomeCompleto = String(nome_completo || '').trim().toUpperCase();
    const nomeCracha = String(nome_cracha || '').trim().toUpperCase();
    const cpfFoiEnviado = Object.prototype.hasOwnProperty.call(req.body, 'cpf');
    const dataNascimentoFoiEnviada = Object.prototype.hasOwnProperty.call(req.body, 'data_nascimento');

    if (!usuario_id) {
      return res.status(400).json({ erro: 'Usuário inválido' });
    }

    if (!nomeCompleto || !nomeCracha || !telefone || !paroquia || !movimentoOrigemValido(movimento_origem) || !anoEncontroValido(ano_encontro) || !statusPermitidos.includes(status)) {
      return res.status(400).json({ erro: 'Preencha nome, crachá, telefone, paróquia, movimento, ano e status válidos' });
    }

    const usuario = await database.get('SELECT id, cpf, data_nascimento, status FROM usuarios WHERE id = ?', [usuario_id]);
    if (!usuario) {
      return res.status(404).json({ erro: 'Usuário não encontrado' });
    }

    const cpfNumeros = cpfFoiEnviado ? apenasNumeros(cpf) : usuario.cpf;
    const dataNascimento = dataNascimentoFoiEnviada ? apenasNumeros(data_nascimento) : usuario.data_nascimento;

    if (cpfFoiEnviado && !cpfValido(cpfNumeros)) {
      return res.status(400).json({ erro: 'CPF inválido' });
    }

    if (dataNascimentoFoiEnviada && dataNascimento.length !== 8) {
      return res.status(400).json({ erro: 'Data de nascimento deve conter 8 números' });
    }

    if (cpfNumeros) {
      const cpfExistente = await database.get('SELECT id FROM usuarios WHERE cpf = ? AND id <> ?', [cpfNumeros, usuario_id]);
      if (cpfExistente) {
        return res.status(400).json({ erro: 'CPF já cadastrado em outro usuário' });
      }
    }

    const equipeNormalizada = equipe ? normalizarEquipe(equipe) : 'SEM EQUIPE';
    if (equipeNormalizada && !equipeValida(equipeNormalizada)) {
      return res.status(400).json({ erro: 'Equipe inválida' });
    }
    const statusFinal = usuario.status === 'contato_errado' ? 'pendente' : status;
    const regraEquipeStatus = aplicarRegraSemEquipe(equipeNormalizada, statusFinal);
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

    const senhaHash = dataNascimentoFoiEnviada && dataNascimento && dataNascimento !== usuario.data_nascimento
      ? await bcrypt.hash(dataNascimento, 10)
      : null;
    const emailInterno = cpfNumeros ? `${cpfNumeros}@cpf.ecri.local` : null;

    await database.run(
      `UPDATE usuarios
       SET email = COALESCE(?, email), senha = COALESCE(?, senha), nome_completo = ?, nome_cracha = ?, cpf = COALESCE(?, cpf), data_nascimento = COALESCE(?, data_nascimento),
           telefone = ?, paroquia = ?, movimento_origem = ?, ano_encontro = ?,
           restricao_medica = ?, restricao_alimentar = ?, restricao_medicacao = ?,
           status = ?, equipe = ?, toca_instrumento = ?, instrumentos = ?, canta = ?, equipes_servidas = ?
       WHERE id = ?`,
      [
        emailInterno,
        senhaHash,
        nomeCompleto,
        nomeCracha,
        cpfNumeros,
        dataNascimento,
        telefoneNormalizado,
        paroquiaNormalizada,
        movimentoOrigem,
        normalizarAnoEncontro(ano_encontro),
        restricao_medica || '',
        restricao_alimentar || '',
        restricao_medicacao || '',
        regraEquipeStatus.status,
        regraEquipeStatus.equipe,
        experiencia.tocaInstrumento,
        experiencia.instrumentos,
        experiencia.canta,
        experiencia.equipesServidasJson,
        usuario_id
      ]
    );
    await registrarHistorico(usuario_id, 'perfil_editado_pela_dirigente', {
      editado_por: req.usuario.id,
      equipe: regraEquipeStatus.equipe,
      status: regraEquipeStatus.status
    });

    const usuarioAtualizado = await database.get(`
      SELECT id, email, nome_completo, nome_cracha, telefone, cpf, data_nascimento, movimento_origem, ano_encontro,
             paroquia, restricao_medica, restricao_alimentar, restricao_medicacao, perfil, status, equipe, pessoa_impedida_servir, pessoa_impedida_motivos, foto_perfil,
             toca_instrumento, instrumentos, canta, equipes_servidas
      FROM usuarios
      WHERE id = ?
    `, [usuario_id]);

    res.json({
      mensagem: 'Perfil atualizado com sucesso',
      paroquia: paroquiaNormalizada,
      usuario: usuarioAtualizado
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao atualizar perfil do usuário' });
  }
});

router.put('/usuarios/:usuario_id/impedimento-servir', verificarToken, verificarPerfil(['equipe_dirigente']), async (req, res) => {
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

    if (!pessoaImpedidaServir) {
      return res.status(403).json({ erro: 'Somente a área exclusiva pode desmarcar este impedimento' });
    }

    const usuario = await database.get('SELECT id FROM usuarios WHERE id = ?', [usuario_id]);
    if (!usuario) {
      return res.status(404).json({ erro: 'Usuário não encontrado' });
    }

    const responsavel = await database.get('SELECT nome_completo, email FROM usuarios WHERE id = ?', [req.usuario.id]);
    const motivosComResponsavel = {
      ...motivos.dados,
      cadastrado_por_id: req.usuario.id,
      cadastrado_por_nome: responsavel?.nome_completo || responsavel?.email || `Usuario ID ${req.usuario.id}`
    };

    await database.run(
      'UPDATE usuarios SET pessoa_impedida_servir = ?, pessoa_impedida_motivos = ? WHERE id = ?',
      [pessoaImpedidaServir, JSON.stringify(motivosComResponsavel), usuario_id]
    );

    await registrarHistorico(usuario_id, 'impedimento_servir_atualizado', {
      editado_por: req.usuario.id,
      pessoa_impedida_servir: Boolean(pessoaImpedidaServir),
      pessoa_impedida_motivos: motivosComResponsavel
    });

    res.json({
      mensagem: 'Informação atualizada com sucesso',
      pessoa_impedida_servir: pessoaImpedidaServir,
      pessoa_impedida_motivos: JSON.stringify(motivosComResponsavel)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao atualizar impedimento para servir' });
  }
});

// Excluir outro usuario
router.delete('/usuarios/:usuario_id', verificarToken, verificarPerfil(['equipe_dirigente']), async (req, res) => {
  try {
    const usuario_id = Number(req.params.usuario_id);

    if (!usuario_id) {
      return res.status(400).json({ erro: 'Usuário inválido' });
    }

    if (usuario_id === req.usuario.id) {
      return res.status(400).json({ erro: 'Você não pode excluir o próprio usuário' });
    }

    const usuario = await database.get('SELECT * FROM usuarios WHERE id = ?', [usuario_id]);
    if (!usuario) {
      return res.status(404).json({ erro: 'Usuário não encontrado' });
    }

    const usuariosParaExcluir = await obterUsuariosRelacionadosParaExclusao(usuario);
    const idsParaExcluir = [...new Set(usuariosParaExcluir
      .map(item => Number(item.id))
      .filter(id => id && id !== Number(req.usuario.id)))];

    for (const item of usuariosParaExcluir) {
      if (!idsParaExcluir.includes(Number(item.id))) continue;
      await registrarUsuarioExcluidoSeNecessario(item, req.usuario.id, 'equipe_dirigente');
    }

    for (const idParaExcluir of idsParaExcluir) {
      await registrarHistorico(idParaExcluir, 'usuario_excluido', { excluido_por: req.usuario.id });
      await apagarUsuarioAtivo(idParaExcluir);
    }

    res.json({
      mensagem: 'Usuário excluído com sucesso',
      total_excluidos: idsParaExcluir.length
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao excluir usuário' });
  }
});

router.get('/equipes', verificarToken, verificarPerfil(['equipe_dirigente']), (req, res) => {
  res.json(EQUIPES);
});

router.get('/acompanhamento-faltas/equipes', verificarToken, verificarPerfil(['equipe_dirigente']), async (req, res) => {
  try {
    const equipesCadastradas = EQUIPES.filter(equipe => !equipeSemEquipe(equipe));
    const usuarios = await database.all(`
      SELECT id, cpf, email, telefone, equipe
      FROM usuarios
      WHERE equipe IS NOT NULL
        AND UPPER(TRIM(equipe)) <> 'SEM EQUIPE'
    `);
    const excluidos = await database.all('SELECT usuario_id, dados FROM usuarios_excluidos');
    const assinaturasExcluidos = montarAssinaturasExcluidos(excluidos);

    const totalPorEquipe = usuarios.reduce((acc, usuario) => {
      const usuarioExcluido = montarAssinaturasUsuarioExclusao(usuario)
        .some(assinatura => assinaturasExcluidos.has(assinatura));
      if (usuarioExcluido) return acc;

      const equipe = normalizarEquipe(usuario.equipe);
      acc[equipe] = (acc[equipe] || 0) + 1;
      return acc;
    }, {});

    res.json(equipesCadastradas.map(equipe => ({
      equipe,
      total_usuarios: totalPorEquipe[normalizarEquipe(equipe)] || 0
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao carregar acompanhamento de faltas' });
  }
});

router.get('/acompanhamento-faltas/equipes/:equipe', verificarToken, verificarPerfil(['equipe_dirigente']), async (req, res) => {
  try {
    const equipe = normalizarEquipe(req.params.equipe);
    if (!equipe || equipeSemEquipe(equipe) || !equipeValida(equipe)) {
      return res.status(400).json({ erro: 'Equipe inválida' });
    }

    const usuarios = await database.all(`
      SELECT id, cpf, nome_completo, nome_cracha, email, telefone, foto_perfil, perfil, status, equipe,
             COALESCE((SELECT COUNT(*) FROM presencas_reuniao pr WHERE pr.usuario_id = usuarios.id AND pr.status = 'presente'), 0) AS total_presencas,
             COALESCE((SELECT COUNT(*) FROM presencas_reuniao pr WHERE pr.usuario_id = usuarios.id AND pr.status = 'falta_justificada'), 0) AS total_faltas_justificadas,
             COALESCE((SELECT COUNT(*) FROM presencas_reuniao pr WHERE pr.usuario_id = usuarios.id AND pr.status = 'falta'), 0) AS total_faltas
      FROM usuarios
      WHERE equipe = ?
      ORDER BY nome_completo ASC
    `, [equipe]);
    const excluidos = await database.all('SELECT usuario_id, dados FROM usuarios_excluidos');
    const assinaturasExcluidos = montarAssinaturasExcluidos(excluidos);
    const usuariosAtivos = usuarios.filter(usuario => !montarAssinaturasUsuarioExclusao(usuario)
      .some(assinatura => assinaturasExcluidos.has(assinatura)));

    res.json({ equipe, usuarios: usuariosAtivos });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao carregar faltas da equipe' });
  }
});

router.get('/pessoas-externas', verificarToken, verificarPerfil(['equipe_dirigente']), async (req, res) => {
  try {
    const pessoas = await database.all(`
      SELECT id, nome_completo, nome_cracha, telefone, paroquia, movimento_origem, ano_encontro, foto_perfil, status, equipe, data_cadastro
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

    if (!nome_completo || !telefone || !movimento_origem || !equipe) {
      return res.status(400).json({ erro: 'Nome, telefone, movimento e equipe são obrigatórios' });
    }

    if (!movimentoOrigemValido(movimento_origem)) {
      return res.status(400).json({ erro: 'Movimento de origem inválido' });
    }

    const anoEncontroNormalizado = ano_encontro ? normalizarAnoEncontro(ano_encontro) : '';
    if (ano_encontro && !anoEncontroValido(ano_encontro)) {
      return res.status(400).json({ erro: 'Ano do encontro inválido' });
    }

    const equipeNormalizada = normalizarEquipe(equipe);
    if (!equipeValida(equipeNormalizada)) {
      return res.status(400).json({ erro: 'Equipe inválida' });
    }

    const movimentoOrigem = normalizarMovimentoOrigem(movimento_origem);
    const telefoneNormalizado = normalizarTelefoneCelular(telefone);
    const telefoneUnico = await validarTelefoneUnico(database, telefoneNormalizado, movimentoOrigem);
    if (!telefoneUnico.valido) {
      return res.status(400).json({ erro: telefoneUnico.erro });
    }

    const fotoValidada = normalizarFotoPerfil(foto_perfil);
    if (fotoValidada.erro) {
      return res.status(400).json({ erro: fotoValidada.erro });
    }
    const fotoPerfil = fotoValidada.fotoPerfil;

    const resultado = await database.run(
      `INSERT INTO pessoas_externas (nome_completo, nome_cracha, telefone, movimento_origem, ano_encontro, equipe, foto_perfil, criado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        String(nome_completo).trim().toUpperCase(),
        String(nome_completo).trim().toUpperCase(),
        telefoneNormalizado,
        movimentoOrigem,
        anoEncontroNormalizado,
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

    const pessoa = await database.get('SELECT * FROM pessoas_externas WHERE id = ?', [pessoa_id]);
    if (!pessoa) {
      return res.status(404).json({ erro: 'Pessoa sem cadastro não encontrada' });
    }

    await registrarPessoaExternaExcluida(pessoa, req.usuario.id, 'equipe_dirigente');
    await database.run('DELETE FROM pessoas_externas WHERE id = ?', [pessoa_id]);
    await registrarHistorico(req.usuario.id, 'pessoa_sem_cadastro_excluida', {
      excluido_por: req.usuario.id,
      pessoa_id,
      nome_completo: pessoa.nome_completo,
      equipe: pessoa.equipe
    });

    res.json({ mensagem: 'Pessoa removida da equipe com sucesso' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao remover pessoa sem cadastro' });
  }
});

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

router.put('/pessoas-externas/:pessoa_id', verificarToken, verificarPerfil(['equipe_dirigente']), async (req, res) => {
  try {
    const pessoa_id = Number(req.params.pessoa_id);
    const { nome_completo, telefone, movimento_origem } = req.body;

    if (!pessoa_id) {
      return res.status(400).json({ erro: 'Pessoa inválida' });
    }

    if (!nome_completo || !telefone || !movimento_origem) {
      return res.status(400).json({ erro: 'Nome completo, telefone e movimento são obrigatórios' });
    }

    if (!movimentoOrigemValido(movimento_origem)) {
      return res.status(400).json({ erro: 'Movimento de origem inválido' });
    }

    const pessoa = await database.get('SELECT id, status FROM pessoas_externas WHERE id = ?', [pessoa_id]);
    if (!pessoa) {
      return res.status(404).json({ erro: 'Pessoa sem cadastro não encontrada' });
    }

    const movimentoOrigem = normalizarMovimentoOrigem(movimento_origem);
    const telefoneNormalizado = normalizarTelefoneCelular(telefone);
    const telefoneUnico = await validarTelefoneUnico(database, telefoneNormalizado, movimentoOrigem, {
      ignorarPessoaExternaId: pessoa_id
    });
    if (!telefoneUnico.valido) {
      return res.status(400).json({ erro: telefoneUnico.erro });
    }

    const nomeNormalizado = String(nome_completo).trim().toUpperCase();
    const statusFinal = pessoa.status === 'contato_errado' ? 'pendente' : pessoa.status;
    await database.run(
      `UPDATE pessoas_externas
       SET nome_completo = ?, nome_cracha = ?, telefone = ?, movimento_origem = ?, status = COALESCE(?, status)
       WHERE id = ?`,
      [nomeNormalizado, nomeNormalizado, telefoneNormalizado, movimentoOrigem, statusFinal, pessoa_id]
    );

    await registrarHistorico(req.usuario.id, 'pessoa_sem_cadastro_editada', {
      pessoa_id,
      nome_completo: nomeNormalizado,
      movimento_origem: movimentoOrigem
    });

    res.json({ mensagem: 'Pessoa sem cadastro atualizada com sucesso' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao atualizar pessoa sem cadastro' });
  }
});

router.put('/pessoas-externas/:pessoa_id/equipe', verificarToken, verificarPerfil(['equipe_dirigente']), async (req, res) => {
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

    const pessoa = await database.get('SELECT id FROM pessoas_externas WHERE id = ?', [pessoa_id]);
    if (!pessoa) {
      return res.status(404).json({ erro: 'Pessoa sem cadastro não encontrada' });
    }

    await database.run(
      'UPDATE pessoas_externas SET equipe = ? WHERE id = ?',
      [equipeNormalizada, pessoa_id]
    );

    await registrarHistorico(req.usuario.id, 'pessoa_sem_cadastro_escalada', {
      pessoa_id,
      equipe: equipeNormalizada
    });

    res.json({ mensagem: 'Pessoa sem cadastro escalada para equipe' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao escalar pessoa sem cadastro' });
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
      return res.status(400).json({ erro: 'Evento inválido' });
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
      return res.status(400).json({ erro: 'Evento inválido' });
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
      return res.status(400).json({ erro: 'Equipe inválida' });
    }

    const statusAtual = await database.get('SELECT status FROM usuarios WHERE id = ?', [usuario_id]);
    const statusFinal = statusAtual?.status || 'pendente';

    await database.run(
      `UPDATE usuarios SET equipe = ?, status = ? WHERE id = ?`,
      [equipeNormalizada, statusFinal, usuario_id]
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
    if (equipeSemEquipe(equipe)) {
      return res.json({
        equipe: 'SEM EQUIPE',
        totalUsuarios: 0,
        usuariosConfirmados: 0,
        usuariosPendentes: 0,
        usuarios: []
      });
    }

    const usuarios = await database.all(`
      SELECT id, nome_completo, email, perfil, status FROM usuarios WHERE equipe = ? AND UPPER(equipe) <> 'SEM EQUIPE'
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
    const usuariosAtivos = usuarios.filter(u => u.equipe && !equipeSemEquipe(u.equipe));
    const usuariosEscalados = usuariosAtivos;
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
      totalUsuarios: usuariosAtivos.length,
      equipistas: usuariosAtivos.filter(u => u.perfil === 'equipista').length,
      coordenadores: usuariosAtivos.filter(u => u.perfil === 'coordenador').length,
      dirigentes: usuariosAtivos.filter(u => u.perfil === 'equipe_dirigente').length,
      confirmados: usuariosAtivos.filter(u => u.status === 'confirmado').length,
      pendentes: usuariosAtivos.filter(u => u.status === 'pendente').length,
      totalEscaladosEquipes: usuariosEscalados.length,
      totalPonderadoEquipes: equipesResumo.reduce((total, equipe) => total + equipe.totalPonderado, 0)
    };

    res.json({ stats, usuarios: usuariosAtivos, equipesResumo });
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
      WHERE u.equipe IS NOT NULL AND UPPER(u.equipe) <> 'SEM EQUIPE'
        AND NOT (p.tipo = 'taxa' AND u.perfil = 'equipe_dirigente')
      ORDER BY p.data_solicitacao DESC
    `);

    const blusas = await database.all(`
      SELECT sb.id, sb.tamanho, sb.status, sb.data_solicitacao,
             u.nome_completo, u.email, u.foto_perfil
      FROM solicitacoes_blusa sb
      JOIN usuarios u ON sb.usuario_id = u.id
      WHERE u.equipe IS NOT NULL AND UPPER(u.equipe) <> 'SEM EQUIPE'
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

module.exports = router;
