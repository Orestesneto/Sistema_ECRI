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
const { processarFotoPerfil } = require('../utils/foto');
const { apenasNumeros, cpfValido } = require('../utils/cpf');
const { obterConfiguracao, salvarConfiguracao } = require('../utils/configuracoes');
const { criarNotificacoesParaUsuarios } = require('../utils/notificacoes');

const router = express.Router();
const TAXAS_POR_MOVIMENTO = {
  EC: 25,
  EJC: 25,
  ECC: 35,
  'JOVENS EJC CASADOS': 35,
  ECRI: 15
};
const MOTIVOS_IMPEDIMENTO_SERVIR = [
  'Separação do casal',
  'Não faz parte dos movimentos',
  'Não tem casamento na Igreja',
  'Outros'
];

function obterTokenRequisicao(req) {
  return req.headers.authorization?.split(' ')[1] || '';
}

function montarUrlFotoPerfil(req, tipo, id, temFoto) {
  if (!temFoto) return '';
  const token = encodeURIComponent(obterTokenRequisicao(req));
  return `/api/fotos/${tipo}/${Number(id)}?token=${token}`;
}

function trocarFotoPorUrl(req, tipo) {
  return (item) => {
    const temFoto = Number(item.tem_foto_perfil || 0) > 0;
    const { tem_foto_perfil, ...restante } = item;
    return {
      ...restante,
      foto_perfil: montarUrlFotoPerfil(req, tipo, item.id, temFoto)
    };
  };
}

async function sincronizarBlusasComPagamentosOnline() {
  await database.run(
    `UPDATE solicitacoes_blusa AS sb
     SET status = 'pendente',
     data_confirmacao = NULL,
     forma_pagamento = NULL,
     confirmado_por = NULL
     WHERE sb.status = 'confirmado'
       AND sb.confirmado_por IS NULL
       AND sb.forma_pagamento IN ('pix', 'cartao_credito')
       AND EXISTS (
         SELECT 1
         FROM pagamentos p
         WHERE p.id = (
           SELECT p2.id
           FROM pagamentos p2
           WHERE p2.usuario_id = sb.usuario_id
             AND p2.tipo = 'blusa'
             AND p2.status IN ('confirmado', 'ressarcido', 'estornado')
             AND p2.data_solicitacao >= sb.data_solicitacao
           ORDER BY p2.data_solicitacao DESC, p2.id DESC
           LIMIT 1
         )
           AND p.status IN ('ressarcido', 'estornado')
       )`
  );

  await database.run(
    `UPDATE solicitacoes_blusa AS sb
     SET status = 'confirmado',
         data_confirmacao = CURRENT_TIMESTAMP,
         forma_pagamento = (
           SELECT p.forma_pagamento
           FROM pagamentos p
           WHERE p.id = (
             SELECT p2.id
             FROM pagamentos p2
             WHERE p2.usuario_id = sb.usuario_id
               AND p2.tipo = 'blusa'
               AND p2.status IN ('confirmado', 'ressarcido', 'estornado')
               AND p2.data_solicitacao >= sb.data_solicitacao
             ORDER BY p2.data_solicitacao DESC, p2.id DESC
             LIMIT 1
           )
         ),
         confirmado_por = NULL
     WHERE sb.status = 'pendente'
       AND EXISTS (
         SELECT 1
         FROM pagamentos p
         WHERE p.id = (
           SELECT p2.id
           FROM pagamentos p2
           WHERE p2.usuario_id = sb.usuario_id
             AND p2.tipo = 'blusa'
             AND p2.status IN ('confirmado', 'ressarcido', 'estornado')
             AND p2.data_solicitacao >= sb.data_solicitacao
           ORDER BY p2.data_solicitacao DESC, p2.id DESC
           LIMIT 1
         )
           AND p.status = 'confirmado'
       )`
  );
}

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
    const idExcluido = Number(registro.usuario_id || 0);
    if (idExcluido) assinaturas.add(`id:${idExcluido}`);
  }
  return assinaturas;
}

function tentarParseJson(valor, fallback = {}) {
  try {
    return JSON.parse(valor || '{}');
  } catch (err) {
    return fallback;
  }
}

function placeholders(lista) {
  return lista.map(() => '?').join(', ');
}

async function obterNomesUsuariosPorId(ids) {
  const idsUnicos = [...new Set((ids || []).map(Number).filter(Boolean))];
  if (!idsUnicos.length) return new Map();

  const usuarios = await database.all(
    `SELECT id, nome_completo FROM usuarios WHERE id IN (${placeholders(idsUnicos)})`,
    idsUnicos
  );

  return new Map(usuarios.map(usuario => [Number(usuario.id), usuario.nome_completo || '']));
}

const ACOES_INCLUSAO_USUARIO = new Set([
  'usuario_registrado',
  'dirigente_criado_desenvolvimento',
  'participacao_confirmada'
]);

const ACOES_EDICAO_USUARIO = new Set([
  'perfil_editado_pela_dirigente',
  'perfil_editado_pela_area_exclusiva',
  'perfil_atualizado'
]);

function obterAtorHistorico(historico, detalhes, usarProprioUsuario = false) {
  const chaves = ['editado_por', 'alterado_por', 'incluido_por', 'criado_por', 'registrado_por', 'confirmado_por'];
  for (const chave of chaves) {
    const valor = detalhes[chave];
    if (valor !== undefined && valor !== null && valor !== '') {
      const id = Number(valor);
      return id ? { id, nome: '' } : { id: null, nome: String(valor) };
    }
  }
  return usarProprioUsuario
    ? { id: Number(historico.usuario_id) || null, nome: '' }
    : { id: null, nome: '' };
}

async function obterAuditoriaCadastroUsuarios(usuarioIds) {
  const ids = [...new Set((usuarioIds || []).map(Number).filter(Boolean))];
  if (!ids.length) return new Map();

  const historicos = await database.all(
    `SELECT id, usuario_id, acao, detalhes, data_acao
     FROM historico
     WHERE usuario_id IN (${placeholders(ids)})
     ORDER BY data_acao ASC, id ASC`,
    ids
  );
  const auditoria = new Map();
  const idsAtores = [];

  for (const historico of historicos) {
    const usuarioId = Number(historico.usuario_id);
    if (!usuarioId) continue;
    const info = auditoria.get(usuarioId) || {};
    const detalhes = tentarParseJson(historico.detalhes);

    if (ACOES_INCLUSAO_USUARIO.has(historico.acao) && !info.incluido_por_data) {
      const ator = obterAtorHistorico(
        historico,
        detalhes,
        historico.acao === 'usuario_registrado' || historico.acao === 'participacao_confirmada'
      );
      info.incluido_por_id = ator.id;
      info.incluido_por_nome = ator.nome;
      info.incluido_por_data = historico.data_acao || '';
      if (ator.id) idsAtores.push(ator.id);
    }

    if (ACOES_EDICAO_USUARIO.has(historico.acao)) {
      const ator = obterAtorHistorico(historico, detalhes, historico.acao === 'perfil_atualizado');
      info.ultima_edicao_por_id = ator.id;
      info.ultima_edicao_por_nome = ator.nome;
      info.ultima_edicao_data = historico.data_acao || '';
      if (ator.id) idsAtores.push(ator.id);
    }
    auditoria.set(usuarioId, info);
  }

  const nomes = await obterNomesUsuariosPorId(idsAtores);
  auditoria.forEach((info) => {
    if (info.incluido_por_id) info.incluido_por_nome = nomes.get(Number(info.incluido_por_id)) || info.incluido_por_nome || '';
    if (info.ultima_edicao_por_id) info.ultima_edicao_por_nome = nomes.get(Number(info.ultima_edicao_por_id)) || info.ultima_edicao_por_nome || '';
  });
  return auditoria;
}

async function obterAuditoriaEscalasUsuarios(usuarioIds) {
  const ids = [...new Set((usuarioIds || []).map(Number).filter(Boolean))];
  if (!ids.length) return new Map();

  const historicos = await database.all(
    `SELECT usuario_id, detalhes, data_acao
     FROM historico
     WHERE acao = 'equipe_alterada'
       AND usuario_id IN (${placeholders(ids)})
     ORDER BY data_acao DESC, id DESC`,
    ids
  );
  const actorIds = [];
  const auditoria = new Map();

  for (const historico of historicos) {
    const usuarioId = Number(historico.usuario_id);
    if (!usuarioId || auditoria.has(usuarioId)) continue;

    const detalhes = tentarParseJson(historico.detalhes);
    const alteradoPor = Number(detalhes.alterado_por);
    auditoria.set(usuarioId, {
      adicionado_por_id: alteradoPor || null,
      adicionado_por_data: historico.data_acao || ''
    });
    if (alteradoPor) actorIds.push(alteradoPor);
  }

  const nomes = await obterNomesUsuariosPorId(actorIds);
  auditoria.forEach((info) => {
    info.adicionado_por_nome = nomes.get(Number(info.adicionado_por_id)) || '';
  });

  return auditoria;
}

async function obterAuditoriaEscalasPessoasExternas(pessoaIds) {
  const ids = new Set((pessoaIds || []).map(Number).filter(Boolean));
  if (!ids.size) return new Map();

  const historicos = await database.all(
    `SELECT h.usuario_id, h.detalhes, h.data_acao, u.nome_completo AS adicionado_por_nome
     FROM historico h
     LEFT JOIN usuarios u ON u.id = h.usuario_id
     WHERE h.acao IN ('pessoa_sem_cadastro_escalada', 'pessoa_sem_cadastro_adicionada', 'pessoa_sem_cadastro_editada')
     ORDER BY h.data_acao DESC, h.id DESC`
  );
  const auditoria = new Map();

  for (const historico of historicos) {
    const detalhes = tentarParseJson(historico.detalhes);
    const pessoaId = Number(detalhes.pessoa_id);
    if (!ids.has(pessoaId)) continue;

    const info = auditoria.get(pessoaId) || {};
    if (historico.acao === 'pessoa_sem_cadastro_editada' && !info.ultima_edicao_data) {
      info.ultima_edicao_por_id = Number(historico.usuario_id) || null;
      info.ultima_edicao_por_nome = historico.adicionado_por_nome || '';
      info.ultima_edicao_data = historico.data_acao || '';
    } else if (!info.adicionado_por_data) {
      info.adicionado_por_id = Number(historico.usuario_id) || null;
      info.adicionado_por_nome = historico.adicionado_por_nome || '';
      info.adicionado_por_data = historico.data_acao || '';
    }
    auditoria.set(pessoaId, info);
  }

  return auditoria;
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

    const fotoValidada = await processarFotoPerfil(foto_perfil, { prefixo: 'usuarios' });
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
             paroquia, restricao_medica, restricao_alimentar, restricao_medicacao, perfil, status, equipe, evento_id, lista_espera, pessoa_impedida_servir, pessoa_impedida_motivos,
             CASE WHEN foto_perfil IS NOT NULL AND foto_perfil <> '' THEN 1 ELSE 0 END AS tem_foto_perfil,
             toca_instrumento, instrumentos, canta, equipes_servidas
      FROM usuarios
      ORDER BY data_cadastro DESC
    `);
    const excluidos = await database.all('SELECT usuario_id, dados FROM usuarios_excluidos');
    const assinaturasExcluidas = montarAssinaturasExcluidos(excluidos);
    const usuariosAtivos = usuarios.filter(usuario => {
      const assinaturasUsuario = montarAssinaturasUsuarioExclusao(usuario);
      return !assinaturasUsuario.some(assinatura => assinaturasExcluidas.has(assinatura));
    });
    const auditoriaEscalas = await obterAuditoriaEscalasUsuarios(usuariosAtivos.map(usuario => usuario.id));
    const auditoriaCadastros = await obterAuditoriaCadastroUsuarios(usuariosAtivos.map(usuario => usuario.id));
    const usuariosComAuditoria = usuariosAtivos
      .map(trocarFotoPorUrl(req, 'usuario'))
      .map(usuario => ({
        ...usuario,
        ...(auditoriaCadastros.get(Number(usuario.id)) || {}),
        ...(auditoriaEscalas.get(Number(usuario.id)) || {})
      }));

    res.json(usuariosComAuditoria);
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
             paroquia, restricao_medica, restricao_alimentar, restricao_medicacao, perfil, status, equipe, evento_id, lista_espera, pessoa_impedida_servir, pessoa_impedida_motivos, foto_perfil,
             toca_instrumento, instrumentos, canta, equipes_servidas
      FROM usuarios
      WHERE id = ?
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

    const auditoria = await obterAuditoriaCadastroUsuarios([usuario.id]);
    res.json({ ...usuario, ...(auditoria.get(Number(usuario.id)) || {}) });
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
             paroquia, restricao_medica, restricao_alimentar, restricao_medicacao, perfil, status, equipe, evento_id, pessoa_impedida_servir, pessoa_impedida_motivos, foto_perfil,
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

router.put('/usuarios/:usuario_id/lista-espera', verificarToken, verificarPerfil(['equipe_dirigente']), async (req, res) => {
  try {
    const usuarioId = Number(req.params.usuario_id);
    const listaEspera = req.body.lista_espera ? 1 : 0;
    if (!usuarioId) return res.status(400).json({ erro: 'Usuário inválido' });

    const usuario = await database.get('SELECT id FROM usuarios WHERE id = ?', [usuarioId]);
    if (!usuario) return res.status(404).json({ erro: 'Usuário não encontrado' });

    await database.run('UPDATE usuarios SET lista_espera = ? WHERE id = ?', [listaEspera, usuarioId]);
    await registrarHistorico(usuarioId, 'lista_espera_atualizada', {
      editado_por: req.usuario.id,
      lista_espera: Boolean(listaEspera)
    });
    res.json({ mensagem: 'Lista de espera atualizada', lista_espera: listaEspera });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao atualizar lista de espera' });
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
      SELECT id, cpf, nome_completo, nome_cracha, email, telefone,
             CASE WHEN foto_perfil IS NOT NULL AND foto_perfil <> '' THEN 1 ELSE 0 END AS tem_foto_perfil,
             perfil, status, equipe,
             COALESCE((SELECT COUNT(*) FROM presencas_reuniao pr WHERE pr.usuario_id = usuarios.id AND pr.status = 'presente'), 0) AS total_presencas,
             COALESCE((SELECT COUNT(*) FROM presencas_reuniao pr WHERE pr.usuario_id = usuarios.id AND pr.status = 'falta_justificada'), 0) AS total_faltas_justificadas,
             COALESCE((SELECT COUNT(*) FROM presencas_reuniao pr WHERE pr.usuario_id = usuarios.id AND pr.status = 'falta'), 0) AS total_faltas
      FROM usuarios
      WHERE equipe = ?
      ORDER BY nome_completo ASC
    `, [equipe]);
    const excluidos = await database.all('SELECT usuario_id, dados FROM usuarios_excluidos');
    const assinaturasExcluidos = montarAssinaturasExcluidos(excluidos);
    const usuariosAtivos = usuarios
      .filter(usuario => !montarAssinaturasUsuarioExclusao(usuario)
        .some(assinatura => assinaturasExcluidos.has(assinatura)))
      .map(trocarFotoPorUrl(req, 'usuario'));

    res.json({ equipe, usuarios: usuariosAtivos });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao carregar faltas da equipe' });
  }
});

router.get('/pessoas-externas', verificarToken, verificarPerfil(['equipe_dirigente']), async (req, res) => {
  try {
    const pessoas = await database.all(`
      SELECT id, nome_completo, nome_cracha, telefone, paroquia, movimento_origem, ano_encontro, observacao,
             CASE WHEN foto_perfil IS NOT NULL AND foto_perfil <> '' THEN 1 ELSE 0 END AS tem_foto_perfil,
             COALESCE(perfil, 'sem_cadastro') AS perfil, status, equipe, evento_id, lista_espera,
             pessoa_impedida_servir, pessoa_impedida_motivos, data_cadastro, criado_por
      FROM pessoas_externas
      ORDER BY data_cadastro DESC
    `);
    const auditoriaEscalas = await obterAuditoriaEscalasPessoasExternas(pessoas.map(pessoa => pessoa.id));
    const criadores = await obterNomesUsuariosPorId(pessoas.map(pessoa => pessoa.criado_por));
    const pessoasComAuditoria = pessoas.map(trocarFotoPorUrl(req, 'externo')).map(pessoa => {
      const auditoria = auditoriaEscalas.get(Number(pessoa.id));
      return {
        ...pessoa,
        adicionado_por_id: auditoria?.adicionado_por_id || pessoa.criado_por || null,
        adicionado_por_nome: auditoria?.adicionado_por_nome || criadores.get(Number(pessoa.criado_por)) || '',
        adicionado_por_data: auditoria?.adicionado_por_data || pessoa.data_cadastro || ''
      };
    });

    res.json(pessoasComAuditoria);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao obter pessoas sem cadastro' });
  }
});

router.post('/pessoas-externas', verificarToken, verificarPerfil(['equipe_dirigente']), async (req, res) => {
  try {
    const { nome_completo, telefone, movimento_origem, ano_encontro, equipe, foto_perfil, observacao, lista_espera } = req.body;

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

    const fotoValidada = await processarFotoPerfil(foto_perfil, { prefixo: 'externos' });
    if (fotoValidada.erro) {
      return res.status(400).json({ erro: fotoValidada.erro });
    }
    const fotoPerfil = fotoValidada.fotoPerfil;

    const resultado = await database.run(
      `INSERT INTO pessoas_externas (nome_completo, nome_cracha, telefone, movimento_origem, ano_encontro, equipe, foto_perfil, criado_por, observacao, lista_espera)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        String(nome_completo).trim().toUpperCase(),
        String(nome_completo).trim().toUpperCase(),
        telefoneNormalizado,
        movimentoOrigem,
        anoEncontroNormalizado,
        equipeNormalizada,
        fotoPerfil,
        req.usuario.id,
        String(observacao || '').trim(),
        lista_espera ? 1 : 0
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
    const { nome_completo, telefone, movimento_origem, observacao } = req.body;

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
       SET nome_completo = ?, nome_cracha = ?, telefone = ?, movimento_origem = ?, observacao = COALESCE(?, observacao), status = COALESCE(?, status)
       WHERE id = ?`,
      [
        nomeNormalizado,
        nomeNormalizado,
        telefoneNormalizado,
        movimentoOrigem,
        Object.prototype.hasOwnProperty.call(req.body, 'observacao') ? String(observacao || '').trim() : null,
        statusFinal,
        pessoa_id
      ]
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

router.put('/pessoas-externas/:pessoa_id/perfil-coordenador', verificarToken, verificarPerfil(['equipe_dirigente']), async (req, res) => {
  try {
    const pessoa_id = Number(req.params.pessoa_id);
    const coordenador = Boolean(req.body?.coordenador);
    const novoPerfil = coordenador ? 'coordenador' : 'sem_cadastro';

    if (!pessoa_id) {
      return res.status(400).json({ erro: 'Pessoa inválida' });
    }

    const pessoa = await database.get('SELECT id FROM pessoas_externas WHERE id = ?', [pessoa_id]);
    if (!pessoa) {
      return res.status(404).json({ erro: 'Pessoa sem cadastro não encontrada' });
    }

    await database.run(
      'UPDATE pessoas_externas SET perfil = ? WHERE id = ?',
      [novoPerfil, pessoa_id]
    );

    await registrarHistorico(req.usuario.id, 'perfil_pessoa_sem_cadastro_alterado', {
      pessoa_id,
      novo_perfil: novoPerfil
    });

    res.json({
      mensagem: coordenador ? 'Pessoa marcada como coordenadora' : 'Pessoa removida como coordenadora',
      perfil: novoPerfil
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao atualizar perfil da pessoa sem cadastro' });
  }
});

router.put('/pessoas-externas/:pessoa_id/lista-espera', verificarToken, verificarPerfil(['equipe_dirigente']), async (req, res) => {
  try {
    const pessoaId = Number(req.params.pessoa_id);
    const listaEspera = req.body.lista_espera ? 1 : 0;
    if (!pessoaId) return res.status(400).json({ erro: 'Pessoa inválida' });

    const pessoa = await database.get('SELECT id FROM pessoas_externas WHERE id = ?', [pessoaId]);
    if (!pessoa) return res.status(404).json({ erro: 'Pessoa sem cadastro não encontrada' });

    await database.run('UPDATE pessoas_externas SET lista_espera = ? WHERE id = ?', [listaEspera, pessoaId]);
    await registrarHistorico(req.usuario.id, 'lista_espera_pessoa_sem_cadastro_atualizada', {
      pessoa_id: pessoaId,
      lista_espera: Boolean(listaEspera)
    });
    res.json({ mensagem: 'Lista de espera atualizada', lista_espera: listaEspera });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao atualizar lista de espera' });
  }
});

router.put('/pessoas-externas/:pessoa_id/impedimento-servir', verificarToken, verificarPerfil(['equipe_dirigente']), async (req, res) => {
  try {
    const pessoa_id = Number(req.params.pessoa_id);
    const pessoaImpedidaServir = req.body.pessoa_impedida_servir ? 1 : 0;
    const motivos = pessoaImpedidaServir
      ? normalizarMotivosImpedimentoServir(req.body.motivos_impedimento_servir, req.body.outro_motivo_impedimento_servir)
      : null;

    if (!pessoa_id) {
      return res.status(400).json({ erro: 'Pessoa inválida' });
    }

    if (pessoaImpedidaServir && motivos.erro) {
      return res.status(400).json({ erro: motivos.erro });
    }

    if (!pessoaImpedidaServir) {
      return res.status(403).json({ erro: 'Somente a área exclusiva pode desmarcar este impedimento' });
    }

    const pessoa = await database.get('SELECT id FROM pessoas_externas WHERE id = ?', [pessoa_id]);
    if (!pessoa) {
      return res.status(404).json({ erro: 'Pessoa sem cadastro não encontrada' });
    }

    const responsavel = await database.get('SELECT nome_completo, email FROM usuarios WHERE id = ?', [req.usuario.id]);
    const motivosComResponsavel = {
      ...motivos.dados,
      cadastrado_por_id: req.usuario.id,
      cadastrado_por_nome: responsavel?.nome_completo || responsavel?.email || `Usuario ID ${req.usuario.id}`
    };

    await database.run(
      'UPDATE pessoas_externas SET pessoa_impedida_servir = ?, pessoa_impedida_motivos = ? WHERE id = ?',
      [pessoaImpedidaServir, JSON.stringify(motivosComResponsavel), pessoa_id]
    );

    await registrarHistorico(req.usuario.id, 'impedimento_servir_pessoa_sem_cadastro_atualizado', {
      pessoa_id,
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

router.put('/pessoas-externas/:pessoa_id/equipe', verificarToken, verificarPerfil(['equipe_dirigente']), async (req, res) => {
  try {
    const pessoa_id = Number(req.params.pessoa_id);
    const { equipe, evento_id } = req.body;

    if (!pessoa_id) {
      return res.status(400).json({ erro: 'Pessoa inválida' });
    }

    if (!equipe) {
      return res.status(400).json({ erro: 'Equipe é obrigatória' });
    }

    const eventoId = Number(evento_id);
    if (!eventoId) {
      return res.status(400).json({ erro: 'Informe o evento antes de escalar para equipe' });
    }

    const evento = await database.get('SELECT id FROM eventos WHERE id = ?', [eventoId]);
    if (!evento) {
      return res.status(400).json({ erro: 'Evento inválido' });
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
      'UPDATE pessoas_externas SET equipe = ?, evento_id = ? WHERE id = ?',
      [equipeNormalizada, eventoId, pessoa_id]
    );

    await registrarHistorico(req.usuario.id, 'pessoa_sem_cadastro_escalada', {
      pessoa_id,
      equipe: equipeNormalizada,
      evento_id: eventoId
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
      SELECT e.id, e.nome, e.descricao, e.data_evento, e.data_termino, e.local, e.data_criacao,
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
    const { nome, data_evento, data_termino } = req.body;

    if (!nome || !data_evento || !data_termino) {
      return res.status(400).json({ erro: 'Nome, data e data de termino do evento sao obrigatorios' });
    }

    if (String(data_termino) < String(data_evento)) {
      return res.status(400).json({ erro: 'A data de termino nao pode ser anterior a data do evento' });
    }

    const resultado = await database.run(
      `INSERT INTO eventos (nome, descricao, data_evento, data_termino, local, criado_por)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [nome, '', data_evento, data_termino, '', req.usuario.id]
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
    const { equipe, evento_id } = req.body;

    if (!equipe) {
      return res.status(400).json({ erro: 'Equipe é obrigatória' });
    }

    const eventoId = Number(evento_id);
    if (!eventoId) {
      return res.status(400).json({ erro: 'Informe o evento antes de escalar para equipe' });
    }

    const evento = await database.get('SELECT id FROM eventos WHERE id = ?', [eventoId]);
    if (!evento) {
      return res.status(400).json({ erro: 'Evento inválido' });
    }

    const equipeNormalizada = normalizarEquipe(equipe);
    if (!equipeValida(equipeNormalizada)) {
      return res.status(400).json({ erro: 'Equipe inválida' });
    }

    const statusAtual = await database.get('SELECT status FROM usuarios WHERE id = ?', [usuario_id]);
    const statusFinal = statusAtual?.status || 'pendente';

    await database.run(
      `UPDATE usuarios SET equipe = ?, status = ?, evento_id = ? WHERE id = ?`,
      [equipeNormalizada, statusFinal, eventoId, usuario_id]
    );
    await registrarHistorico(usuario_id, 'equipe_alterada', {
      equipe: equipeNormalizada,
      evento_id: eventoId,
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
      SELECT id, cpf, nome_completo, email, telefone, perfil, status, equipe, movimento_origem, lista_espera FROM usuarios
    `);
    const pessoasExternas = await database.all(`
      SELECT id, nome_completo, telefone, COALESCE(perfil, 'sem_cadastro') AS perfil, status, equipe, movimento_origem, lista_espera
      FROM pessoas_externas
    `);
    const excluidos = await database.all('SELECT usuario_id, dados FROM usuarios_excluidos');
    const assinaturasExcluidos = montarAssinaturasExcluidos(excluidos);
    const usuariosAtivos = usuarios.filter(u => {
      const usuarioExcluido = montarAssinaturasUsuarioExclusao(u)
        .some(assinatura => assinaturasExcluidos.has(assinatura));
      return !usuarioExcluido && u.equipe && !equipeSemEquipe(u.equipe);
    });
    const pessoasExternasAtivas = pessoasExternas
      .filter(pessoa => pessoa.equipe && !equipeSemEquipe(pessoa.equipe))
      .map(pessoa => ({
        ...pessoa,
        cpf: '',
        email: '',
        perfil: pessoa.perfil || 'sem_cadastro',
        origem_cadastro: 'externo'
      }));
    const pessoasEscaladas = [
      ...usuariosAtivos.map(usuario => ({ ...usuario, origem_cadastro: 'usuario' })),
      ...pessoasExternasAtivas
    ];
    const pessoasContabilizadas = pessoasEscaladas.filter(pessoa => Number(pessoa.lista_espera || 0) !== 1);
    const equipesResumo = Object.values(pessoasContabilizadas.reduce((acc, usuario) => {
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
      totalUsuarios: pessoasEscaladas.length,
      equipistas: usuariosAtivos.filter(u => u.perfil === 'equipista').length,
      coordenadores: usuariosAtivos.filter(u => u.perfil === 'coordenador').length,
      dirigentes: usuariosAtivos.filter(u => u.perfil === 'equipe_dirigente').length,
      confirmados: pessoasEscaladas.filter(u => u.status === 'confirmado').length,
      pendentes: pessoasEscaladas.filter(u => u.status === 'pendente').length,
      totalEscaladosEquipes: pessoasContabilizadas.length,
      totalPonderadoEquipes: equipesResumo.reduce((total, equipe) => total + equipe.totalPonderado, 0)
    };

    res.json({ stats, usuarios: pessoasEscaladas, equipesResumo });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao gerar relatório' });
  }
});

// Visualizar situação de pagamentos e blusas
router.get('/situacao', verificarToken, verificarPerfil(['equipe_dirigente']), async (req, res) => {
  try {
    await sincronizarBlusasComPagamentosOnline();

    const pagamentos = await database.all(`
      SELECT u.id AS usuario_id, u.nome_completo, u.email, u.equipe, u.movimento_origem,
             CASE WHEN u.foto_perfil IS NOT NULL AND u.foto_perfil <> '' THEN 1 ELSE 0 END AS tem_foto_perfil,
             p.id AS pagamento_id, p.tipo, p.valor, p.status, p.data_solicitacao,
             p.data_confirmacao, p.forma_pagamento
      FROM usuarios u
      LEFT JOIN pagamentos p ON p.id = (
        SELECT p2.id
        FROM pagamentos p2
        WHERE p2.usuario_id = u.id AND p2.tipo = 'taxa'
        ORDER BY CASE WHEN p2.status = 'confirmado' THEN 0 WHEN p2.status = 'pendente' THEN 1 ELSE 2 END,
                 p2.data_solicitacao DESC,
                 p2.id DESC
        LIMIT 1
      )
      WHERE u.equipe IS NOT NULL AND UPPER(u.equipe) <> 'SEM EQUIPE'
        AND u.status = 'confirmado'
        AND u.perfil <> 'equipe_dirigente'
      ORDER BY u.equipe ASC, u.nome_completo ASC
    `);

    const blusas = await database.all(`
      SELECT u.id AS usuario_id, u.nome_completo, u.email, u.equipe,
             CASE WHEN u.foto_perfil IS NOT NULL AND u.foto_perfil <> '' THEN 1 ELSE 0 END AS tem_foto_perfil,
             sb.id AS solicitacao_id, sb.tamanho, sb.valor, sb.status, sb.data_solicitacao,
             sb.data_confirmacao, sb.forma_pagamento,
             confirmador.nome_completo AS confirmado_por_nome, confirmador.nome_cracha AS confirmado_por_cracha
      FROM usuarios u
      LEFT JOIN solicitacoes_blusa sb ON sb.usuario_id = u.id
      LEFT JOIN usuarios confirmador ON confirmador.id = sb.confirmado_por
      WHERE u.equipe IS NOT NULL AND UPPER(u.equipe) <> 'SEM EQUIPE'
        AND u.status = 'confirmado'
      ORDER BY u.equipe ASC, u.nome_completo ASC, sb.data_solicitacao DESC
    `);

    const pagamentosComFotoUrl = pagamentos.map((pagamento) => ({
      ...pagamento,
      id: pagamento.pagamento_id,
      tipo: pagamento.tipo || 'taxa',
      valor: Number(pagamento.valor || TAXAS_POR_MOVIMENTO[normalizarMovimentoOrigem(pagamento.movimento_origem)] || 0),
      status: pagamento.status || 'pendente',
      foto_perfil: montarUrlFotoPerfil(req, 'usuario', pagamento.usuario_id, pagamento.tem_foto_perfil)
    }));
    const blusasComFotoUrl = blusas.map((blusa) => ({
      ...blusa,
      id: blusa.solicitacao_id,
      status: blusa.solicitacao_id ? blusa.status : 'sem_solicitacao',
      foto_perfil: montarUrlFotoPerfil(req, 'usuario', blusa.usuario_id, blusa.tem_foto_perfil)
    }));

    const equipesMap = new Map();
    function obterEquipeSituacao(equipe) {
      if (!equipesMap.has(equipe)) {
        equipesMap.set(equipe, {
          equipe,
          taxas: [],
          camisas: []
        });
      }
      return equipesMap.get(equipe);
    }

    pagamentosComFotoUrl.forEach((pagamento) => {
      obterEquipeSituacao(pagamento.equipe).taxas.push(pagamento);
    });

    blusasComFotoUrl.forEach((blusa) => {
      obterEquipeSituacao(blusa.equipe).camisas.push(blusa);
    });

    const equipesSituacao = Array.from(equipesMap.values())
      .map((equipe) => ({
        ...equipe,
        resumoTaxas: {
          total: equipe.taxas.length,
          pendentes: equipe.taxas.filter(item => item.status === 'pendente').length,
          confirmadas: equipe.taxas.filter(item => item.status === 'confirmado').length
        },
        resumoCamisas: {
          total: equipe.camisas.length,
          pendentes: equipe.camisas.filter(item => item.status === 'pendente').length,
          confirmadas: equipe.camisas.filter(item => item.status === 'confirmado').length,
          semSolicitacao: equipe.camisas.filter(item => item.status === 'sem_solicitacao').length
        }
      }))
      .sort((a, b) => a.equipe.localeCompare(b.equipe, 'pt-BR'));

    const stats = {
      pagamentosPendentes: pagamentosComFotoUrl.filter(p => p.status === 'pendente').length,
      pagamentosConfirmados: pagamentosComFotoUrl.filter(p => p.status === 'confirmado').length,
      blusasPendentes: blusasComFotoUrl.filter(b => b.status === 'pendente').length,
      blusasConfirmadas: blusasComFotoUrl.filter(b => b.status === 'confirmado').length,
      blusasSemSolicitacao: blusasComFotoUrl.filter(b => b.status === 'sem_solicitacao').length
    };

    res.json({ stats, pagamentos: pagamentosComFotoUrl, blusas: blusasComFotoUrl, equipes: equipesSituacao });
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

// Controle de almoxarifado
router.get('/almoxarifado/itens', verificarToken, verificarPerfil(['equipe_dirigente']), async (req, res) => {
  try {
    const itens = await database.all(`
      SELECT id, nome, categoria, unidade, estoque_total, estoque_disponivel,
             estoque_minimo, observacao, ativo, data_criacao, data_atualizacao
      FROM almoxarifado_itens
      WHERE ativo = 1
      ORDER BY nome ASC
    `);
    res.json(itens);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao obter itens do almoxarifado' });
  }
});

router.post('/almoxarifado/itens', verificarToken, verificarPerfil(['equipe_dirigente']), async (req, res) => {
  try {
    const nome = String(req.body.nome || '').trim();
    const categoria = String(req.body.categoria || '').trim();
    const unidade = String(req.body.unidade || 'unidade').trim();
    const quantidade = Number(req.body.quantidade);
    const estoqueMinimo = Number(req.body.estoque_minimo || 0);
    const observacao = String(req.body.observacao || '').trim();

    if (!nome) return res.status(400).json({ erro: 'Informe o nome do item' });
    if (!Number.isInteger(quantidade) || quantidade < 0) return res.status(400).json({ erro: 'Informe uma quantidade válida' });
    if (!Number.isInteger(estoqueMinimo) || estoqueMinimo < 0) return res.status(400).json({ erro: 'Informe um estoque mínimo válido' });

    const result = await database.run(
      `INSERT INTO almoxarifado_itens
       (nome, categoria, unidade, estoque_total, estoque_disponivel, estoque_minimo, observacao, criado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [nome, categoria, unidade || 'unidade', quantidade, quantidade, estoqueMinimo, observacao, req.usuario.id]
    );
    res.status(201).json({ id: result.lastID, mensagem: 'Item cadastrado com sucesso' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao cadastrar item' });
  }
});

router.put('/almoxarifado/itens/:item_id/estoque', verificarToken, verificarPerfil(['equipe_dirigente']), async (req, res) => {
  try {
    const itemId = Number(req.params.item_id);
    const novoTotal = Number(req.body.estoque_total);
    const estoqueMinimo = Number(req.body.estoque_minimo || 0);
    if (!itemId || !Number.isInteger(novoTotal) || novoTotal < 0 || !Number.isInteger(estoqueMinimo) || estoqueMinimo < 0) {
      return res.status(400).json({ erro: 'Dados de estoque inválidos' });
    }

    const item = await database.get('SELECT estoque_total, estoque_disponivel FROM almoxarifado_itens WHERE id = ? AND ativo = 1', [itemId]);
    if (!item) return res.status(404).json({ erro: 'Item não encontrado' });
    const emprestado = Number(item.estoque_total) - Number(item.estoque_disponivel);
    if (novoTotal < emprestado) {
      return res.status(400).json({ erro: `Existem ${emprestado} unidade(s) emprestada(s); o total não pode ser menor que isso` });
    }

    await database.run(
      `UPDATE almoxarifado_itens
       SET estoque_total = ?, estoque_disponivel = ?, estoque_minimo = ?, data_atualizacao = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [novoTotal, novoTotal - emprestado, estoqueMinimo, itemId]
    );
    res.json({ mensagem: 'Estoque atualizado com sucesso' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao atualizar estoque' });
  }
});

router.get('/almoxarifado/itens/:item_id/historico', verificarToken, verificarPerfil(['equipe_dirigente']), async (req, res) => {
  try {
    const itemId = Number(req.params.item_id);
    const item = await database.get('SELECT id, nome FROM almoxarifado_itens WHERE id = ?', [itemId]);
    if (!item) return res.status(404).json({ erro: 'Item não encontrado' });

    const historico = await database.all(`
      SELECT p.id AS protocolo_id, p.solicitante, p.equipe, p.finalidade, p.status,
             p.data_criacao, p.data_prevista_retirada, p.data_prevista_devolucao, p.data_entrega, p.data_devolucao,
             pi.quantidade, pi.quantidade_devolvida,
             ue.nome_completo AS entregue_por_nome,
             ud.nome_completo AS devolvido_por_nome
      FROM almoxarifado_protocolo_itens pi
      JOIN almoxarifado_protocolos p ON p.id = pi.protocolo_id
      LEFT JOIN usuarios ue ON ue.id = p.entregue_por
      LEFT JOIN usuarios ud ON ud.id = p.devolvido_por
      WHERE pi.item_id = ?
      ORDER BY p.id DESC
    `, [itemId]);

    const devolucoes = await database.all(`
      SELECT d.protocolo_id, d.quantidade, d.data_devolucao,
             u.nome_completo AS devolvido_por_nome
      FROM almoxarifado_devolucoes d
      LEFT JOIN usuarios u ON u.id = d.devolvido_por
      WHERE d.item_id = ?
      ORDER BY d.id DESC
    `, [itemId]);

    res.json({ item, historico, devolucoes });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao consultar histórico do item' });
  }
});

router.get('/almoxarifado/protocolos', verificarToken, verificarPerfil(['equipe_dirigente']), async (req, res) => {
  try {
    const protocolos = await database.all(`
      SELECT p.*, u.nome_completo AS criado_por_nome,
             ue.nome_completo AS entregue_por_nome,
             ud.nome_completo AS devolvido_por_nome
      FROM almoxarifado_protocolos p
      LEFT JOIN usuarios u ON u.id = p.criado_por
      LEFT JOIN usuarios ue ON ue.id = p.entregue_por
      LEFT JOIN usuarios ud ON ud.id = p.devolvido_por
      ORDER BY p.id DESC
    `);
    const itens = await database.all(`
      SELECT pi.protocolo_id, pi.item_id, pi.quantidade, pi.quantidade_devolvida,
             i.nome, i.unidade
      FROM almoxarifado_protocolo_itens pi
      JOIN almoxarifado_itens i ON i.id = pi.item_id
      ORDER BY pi.id ASC
    `);
    res.json(protocolos.map(protocolo => ({
      ...protocolo,
      itens: itens.filter(item => Number(item.protocolo_id) === Number(protocolo.id))
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao obter protocolos' });
  }
});

router.post('/almoxarifado/protocolos', verificarToken, verificarPerfil(['equipe_dirigente']), async (req, res) => {
  let protocoloId = null;
  try {
    const solicitanteUsuarioId = Number(req.body.solicitante_usuario_id);
    const equipe = String(req.body.equipe || '').trim();
    const finalidade = String(req.body.finalidade || '').trim();
    const dataPrevista = String(req.body.data_prevista_devolucao || '').trim() || null;
    const observacao = String(req.body.observacao || '').trim();
    const itensRecebidos = Array.isArray(req.body.itens) ? req.body.itens : [];
    const itens = itensRecebidos.map(item => ({ item_id: Number(item.item_id), quantidade: Number(item.quantidade) }));

    if (!solicitanteUsuarioId || !finalidade) return res.status(400).json({ erro: 'Selecione o solicitante e informe a finalidade' });
    const usuarioSolicitante = await database.get('SELECT id, nome_completo FROM usuarios WHERE id = ?', [solicitanteUsuarioId]);
    if (!usuarioSolicitante) return res.status(400).json({ erro: 'O solicitante selecionado não foi encontrado' });
    if (!itens.length || itens.some(item => !item.item_id || !Number.isInteger(item.quantidade) || item.quantidade <= 0)) {
      return res.status(400).json({ erro: 'Adicione ao menos um item com quantidade válida' });
    }
    if (new Set(itens.map(item => item.item_id)).size !== itens.length) {
      return res.status(400).json({ erro: 'O mesmo item não pode ser adicionado duas vezes' });
    }
    for (const item of itens) {
      const cadastro = await database.get('SELECT id FROM almoxarifado_itens WHERE id = ? AND ativo = 1', [item.item_id]);
      if (!cadastro) return res.status(400).json({ erro: 'Um dos itens selecionados não está disponível no cadastro' });
    }

    const result = await database.run(
      `INSERT INTO almoxarifado_protocolos
       (solicitante_usuario_id, solicitante, equipe, finalidade, data_prevista_devolucao, observacao, criado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [solicitanteUsuarioId, usuarioSolicitante.nome_completo, equipe, finalidade, dataPrevista, observacao, req.usuario.id]
    );
    protocoloId = result.lastID;
    for (const item of itens) {
      await database.run(
        'INSERT INTO almoxarifado_protocolo_itens (protocolo_id, item_id, quantidade) VALUES (?, ?, ?)',
        [protocoloId, item.item_id, item.quantidade]
      );
    }
    res.status(201).json({ id: protocoloId, mensagem: `Protocolo #${protocoloId} criado com sucesso` });
  } catch (err) {
    if (protocoloId) {
      await database.run('DELETE FROM almoxarifado_protocolo_itens WHERE protocolo_id = ?', [protocoloId]).catch(() => {});
      await database.run('DELETE FROM almoxarifado_protocolos WHERE id = ?', [protocoloId]).catch(() => {});
    }
    console.error(err);
    res.status(500).json({ erro: 'Erro ao criar protocolo' });
  }
});

router.put('/almoxarifado/protocolos/:protocolo_id/itens', verificarToken, verificarPerfil(['equipe_dirigente']), async (req, res) => {
  try {
    const protocoloId = Number(req.params.protocolo_id);
    const protocolo = await database.get('SELECT id, status, data_prevista_retirada, data_prevista_devolucao FROM almoxarifado_protocolos WHERE id = ?', [protocoloId]);
    if (!protocolo) return res.status(404).json({ erro: 'Protocolo não encontrado' });
    if (protocolo.status !== 'solicitado') return res.status(400).json({ erro: 'Os itens só podem ser alterados antes da entrega' });
    const recebidos = Array.isArray(req.body.itens) ? req.body.itens : [];
    const itens = recebidos.map(item => ({ item_id: Number(item.item_id), quantidade: Number(item.quantidade) }));
    if (!itens.length || itens.some(item => !item.item_id || !Number.isInteger(item.quantidade) || item.quantidade <= 0)) {
      return res.status(400).json({ erro: 'O protocolo deve possuir ao menos um item com quantidade válida' });
    }
    if (new Set(itens.map(item => item.item_id)).size !== itens.length) return res.status(400).json({ erro: 'O mesmo item não pode aparecer duas vezes' });

    for (const solicitado of itens) {
      const item = await database.get('SELECT id, nome, estoque_total FROM almoxarifado_itens WHERE id = ? AND ativo = 1', [solicitado.item_id]);
      if (!item) return res.status(400).json({ erro: 'Um dos itens não está mais disponível no cadastro' });
      let reservadoPorOutros = 0;
      if (protocolo.data_prevista_retirada && protocolo.data_prevista_devolucao) {
        const reserva = await database.get(`
          SELECT COALESCE(SUM(pi.quantidade - pi.quantidade_devolvida), 0) AS total
          FROM almoxarifado_protocolo_itens pi
          JOIN almoxarifado_protocolos p ON p.id = pi.protocolo_id
          WHERE pi.item_id = ? AND p.id <> ?
            AND p.status IN ('solicitado', 'entregue', 'parcialmente_devolvido')
            AND (p.data_prevista_retirada IS NULL OR p.data_prevista_retirada <= ?)
            AND COALESCE(p.data_prevista_devolucao, '9999-12-31') >= ?
        `, [solicitado.item_id, protocoloId, protocolo.data_prevista_devolucao, protocolo.data_prevista_retirada]);
        reservadoPorOutros = Number(reserva?.total || 0);
      } else {
        const reserva = await database.get(`
          SELECT COALESCE(SUM(pi.quantidade - pi.quantidade_devolvida), 0) AS total
          FROM almoxarifado_protocolo_itens pi
          JOIN almoxarifado_protocolos p ON p.id = pi.protocolo_id
          WHERE pi.item_id = ? AND p.id <> ? AND p.status IN ('solicitado', 'entregue', 'parcialmente_devolvido')
        `, [solicitado.item_id, protocoloId]);
        reservadoPorOutros = Number(reserva?.total || 0);
      }
      const disponivel = Number(item.estoque_total) - reservadoPorOutros;
      if (solicitado.quantidade > disponivel) return res.status(400).json({ erro: `${item.nome}: há somente ${Math.max(0, disponivel)} unidade(s) disponível(is)` });
    }

    const antigos = await database.all('SELECT item_id, quantidade, quantidade_devolvida FROM almoxarifado_protocolo_itens WHERE protocolo_id = ?', [protocoloId]);
    try {
      await database.run('DELETE FROM almoxarifado_protocolo_itens WHERE protocolo_id = ?', [protocoloId]);
      for (const item of itens) {
        await database.run('INSERT INTO almoxarifado_protocolo_itens (protocolo_id, item_id, quantidade) VALUES (?, ?, ?)', [protocoloId, item.item_id, item.quantidade]);
      }
    } catch (err) {
      await database.run('DELETE FROM almoxarifado_protocolo_itens WHERE protocolo_id = ?', [protocoloId]).catch(() => {});
      for (const item of antigos) {
        await database.run('INSERT INTO almoxarifado_protocolo_itens (protocolo_id, item_id, quantidade, quantidade_devolvida) VALUES (?, ?, ?, ?)', [protocoloId, item.item_id, item.quantidade, item.quantidade_devolvida]).catch(() => {});
      }
      throw err;
    }
    res.json({ mensagem: `Itens do protocolo #${protocoloId} atualizados` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao atualizar itens do protocolo' });
  }
});

router.put('/almoxarifado/protocolos/:protocolo_id/entregar', verificarToken, verificarPerfil(['equipe_dirigente']), async (req, res) => {
  const atualizados = [];
  try {
    const protocoloId = Number(req.params.protocolo_id);
    const protocolo = await database.get('SELECT id, status FROM almoxarifado_protocolos WHERE id = ?', [protocoloId]);
    if (!protocolo) return res.status(404).json({ erro: 'Protocolo não encontrado' });
    if (protocolo.status !== 'solicitado') return res.status(400).json({ erro: 'Este protocolo não está aguardando entrega' });
    const itens = await database.all('SELECT item_id, quantidade FROM almoxarifado_protocolo_itens WHERE protocolo_id = ?', [protocoloId]);

    for (const item of itens) {
      const cadastro = await database.get('SELECT nome, estoque_disponivel FROM almoxarifado_itens WHERE id = ?', [item.item_id]);
      if (!cadastro || Number(cadastro.estoque_disponivel) < Number(item.quantidade)) {
        return res.status(400).json({ erro: `Estoque insuficiente para ${cadastro?.nome || 'um dos itens'}` });
      }
    }
    for (const item of itens) {
      const result = await database.run(
        'UPDATE almoxarifado_itens SET estoque_disponivel = estoque_disponivel - ?, data_atualizacao = CURRENT_TIMESTAMP WHERE id = ? AND estoque_disponivel >= ?',
        [item.quantidade, item.item_id, item.quantidade]
      );
      if (!result.changes) throw new Error('Estoque alterado durante a entrega');
      atualizados.push(item);
    }
    await database.run(
      `UPDATE almoxarifado_protocolos SET status = 'entregue', entregue_por = ?, data_entrega = CURRENT_TIMESTAMP WHERE id = ?`,
      [req.usuario.id, protocoloId]
    );
    res.json({ mensagem: `Entrega do protocolo #${protocoloId} registrada` });
  } catch (err) {
    for (const item of atualizados) {
      await database.run('UPDATE almoxarifado_itens SET estoque_disponivel = estoque_disponivel + ? WHERE id = ?', [item.quantidade, item.item_id]).catch(() => {});
    }
    console.error(err);
    res.status(500).json({ erro: 'Erro ao registrar entrega' });
  }
});

router.put('/almoxarifado/protocolos/:protocolo_id/devolver', verificarToken, verificarPerfil(['equipe_dirigente']), async (req, res) => {
  const movimentacoes = [];
  try {
    const protocoloId = Number(req.params.protocolo_id);
    const protocolo = await database.get('SELECT id, status FROM almoxarifado_protocolos WHERE id = ?', [protocoloId]);
    if (!protocolo) return res.status(404).json({ erro: 'Protocolo não encontrado' });
    if (!['entregue', 'parcialmente_devolvido'].includes(protocolo.status)) return res.status(400).json({ erro: 'Este protocolo não possui itens pendentes de devolução' });
    const itensProtocolo = await database.all('SELECT item_id, quantidade, quantidade_devolvida FROM almoxarifado_protocolo_itens WHERE protocolo_id = ?', [protocoloId]);
    const recebidos = Array.isArray(req.body.itens) ? req.body.itens.map(item => ({ item_id: Number(item.item_id), quantidade: Number(item.quantidade) })) : [];
    const devolucoes = recebidos.filter(item => Number.isInteger(item.quantidade) && item.quantidade > 0);
    if (!devolucoes.length) return res.status(400).json({ erro: 'Informe a quantidade devolvida de ao menos um item' });
    if (new Set(devolucoes.map(item => item.item_id)).size !== devolucoes.length) return res.status(400).json({ erro: 'Item duplicado na devolução' });
    for (const devolucao of devolucoes) {
      const item = itensProtocolo.find(registro => Number(registro.item_id) === devolucao.item_id);
      const pendente = item ? Number(item.quantidade) - Number(item.quantidade_devolvida || 0) : 0;
      if (!item || devolucao.quantidade > pendente) return res.status(400).json({ erro: 'Quantidade devolvida maior que a quantidade pendente' });
    }
    for (const devolucao of devolucoes) {
      await database.run('UPDATE almoxarifado_itens SET estoque_disponivel = estoque_disponivel + ?, data_atualizacao = CURRENT_TIMESTAMP WHERE id = ?', [devolucao.quantidade, devolucao.item_id]);
      await database.run('UPDATE almoxarifado_protocolo_itens SET quantidade_devolvida = quantidade_devolvida + ? WHERE protocolo_id = ? AND item_id = ?', [devolucao.quantidade, protocoloId, devolucao.item_id]);
      const registro = await database.run('INSERT INTO almoxarifado_devolucoes (protocolo_id, item_id, quantidade, devolvido_por) VALUES (?, ?, ?, ?)', [protocoloId, devolucao.item_id, devolucao.quantidade, req.usuario.id]);
      movimentacoes.push({ ...devolucao, registro_id: registro.lastID });
    }
    const restante = await database.get('SELECT COALESCE(SUM(quantidade - quantidade_devolvida), 0) AS total FROM almoxarifado_protocolo_itens WHERE protocolo_id = ?', [protocoloId]);
    const devolucaoCompleta = Number(restante?.total || 0) === 0;
    await database.run(
      `UPDATE almoxarifado_protocolos
       SET status = ?, devolvido_por = ?, data_devolucao = ?
       WHERE id = ?`,
      [devolucaoCompleta ? 'devolvido' : 'parcialmente_devolvido', req.usuario.id, devolucaoCompleta ? new Date().toISOString() : null, protocoloId]
    );
    res.json({ mensagem: devolucaoCompleta ? `Devolução completa do protocolo #${protocoloId} registrada` : `Devolução parcial do protocolo #${protocoloId} registrada` });
  } catch (err) {
    for (const movimento of movimentacoes.reverse()) {
      if (movimento.registro_id) await database.run('DELETE FROM almoxarifado_devolucoes WHERE id = ?', [movimento.registro_id]).catch(() => {});
      await database.run('UPDATE almoxarifado_protocolo_itens SET quantidade_devolvida = quantidade_devolvida - ? WHERE protocolo_id = ? AND item_id = ?', [movimento.quantidade, Number(req.params.protocolo_id), movimento.item_id]).catch(() => {});
      await database.run('UPDATE almoxarifado_itens SET estoque_disponivel = estoque_disponivel - ? WHERE id = ?', [movimento.quantidade, movimento.item_id]).catch(() => {});
    }
    console.error(err);
    res.status(500).json({ erro: 'Erro ao registrar devolução' });
  }
});

router.put('/almoxarifado/protocolos/:protocolo_id/cancelar', verificarToken, verificarPerfil(['equipe_dirigente']), async (req, res) => {
  try {
    const protocoloId = Number(req.params.protocolo_id);
    const result = await database.run(
      `UPDATE almoxarifado_protocolos SET status = 'cancelado' WHERE id = ? AND status = 'solicitado'`,
      [protocoloId]
    );
    if (!result.changes) return res.status(400).json({ erro: 'Somente protocolos solicitados podem ser cancelados' });
    res.json({ mensagem: `Protocolo #${protocoloId} cancelado` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao cancelar protocolo' });
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
