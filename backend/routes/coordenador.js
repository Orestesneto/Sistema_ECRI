const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const database = require('../config/database');
const { verificarToken, verificarPerfil } = require('../middleware/auth');
const { normalizarMovimentoOrigem, movimentoOrigemValido } = require('../utils/movimentoOrigem');
const { normalizarExperienciaPerfil } = require('../utils/experienciaPerfil');
const { normalizarAnoEncontro, anoEncontroValido } = require('../utils/anoEncontro');
const { registrarHistorico } = require('../utils/historico');
const { normalizarParoquia, paroquiaValida } = require('../utils/paroquia');
const { aplicarRegraSemEquipe, equipeSemEquipe, normalizarEquipe } = require('../utils/equipes');
const { obterConfiguracao, pedidosBlusaBloqueados } = require('../utils/configuracoes');
const { VALOR_BLUSA_UNICA, recalcularValoresBlusasUsuario } = require('../utils/precoBlusa');
const { normalizarFotoPerfil } = require('../utils/foto');
const { criarNotificacao, criarNotificacoesParaEquipe } = require('../utils/notificacoes');

const router = express.Router();
const TAXAS_POR_MOVIMENTO = {
  EC: 25,
  EJC: 25,
  ECC: 35,
  'JOVENS EJC CASADOS': 35,
  ECRI: 15
};

const EQUIPES_MENSAGEM_WHATSAPP = [
  { equipe: 'Arco Iris', titulo: '🌈🌈 Arco-Íris 🌈🌈' }, { equipe: 'Animadores', titulo: '🎤🎤 Animadores 🎤🎤' },
  { equipe: 'Anjos da Alegria', titulo: '🤡🎉👼🏼 Anjos da Alegria 🤡🎉👼🏼' }, { equipe: 'Anjos da Guarda', titulo: '😇👼🏼 Anjo da Guarda 😇👼🏼' },
  { equipe: 'Bandinha', titulo: '🪗🥁🔊🎻 Bandinha 🪗🥁🔊🎻' }, { equipe: 'Boa Acao', titulo: '🥛🚽 💊 Boa Ação 🥛🚽 💊' },
  { equipe: 'ECRI SHOP', titulo: '🛍️💸🤑 ECRI SHOP 🛍️💸🤑' }, { equipe: 'Escrita', titulo: '🖨️💻✍🏼 Escrita 🖨️💻✍🏼' },
  { equipe: 'Missa e Oracao', titulo: '📿🙏🏼⛪ Missa e Oração 📿🙏🏼⛪' }, { equipe: 'Papa Lanche', titulo: '🍪🥠🍟 Papa Lanche 🍪🥠🍟' },
  { equipe: 'Pombo Correio', titulo: '📬📮🕊️ Pombo Correio 📬📮🕊️' }, { equipe: 'Ranguinho', titulo: '🍴🍽️🥣 Ranguinho 🍴🍽️🥣' },
  { equipe: 'Som e Iluminacao', titulo: '💡🔦🔊🎤 Som e Iluminação 💡🔦🔊🎤' }, { equipe: 'Teatrinho', titulo: '🎭🎭🎭 Teatrinho 🎭🎭🎭' },
  { equipe: 'Vassourinha', titulo: '🚽🧹🪠🚾 Vassourinha 🚽🧹🪠🚾' }
];

function montarMensagemWhatsAppReunioes(reunioes) {
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date()).reduce((resultado, parte) => ({ ...resultado, [parte.type]: parte.value }), {});
  const dataAtual = `${partes.year}-${partes.month}-${partes.day}`;
  const horaAtual = `${partes.hour}:${partes.minute}`;
  const futuras = reunioes.filter(reuniao => {
    const data = String(reuniao.data_reuniao || '').slice(0, 10);
    const hora = String(reuniao.horario_inicio || '').slice(0, 5);
    return data > dataAtual || (data === dataAtual && hora >= horaAtual);
  }).sort((a, b) => `${a.data_reuniao} ${a.horario_inicio}`.localeCompare(`${b.data_reuniao} ${b.horario_inicio}`));

  return EQUIPES_MENSAGEM_WHATSAPP.map(({ equipe, titulo }) => {
    const detalhes = futuras.filter(reuniao => normalizarEquipe(reuniao.equipe) === equipe).map(reuniao => {
      const [ano, mes, dia] = String(reuniao.data_reuniao || '').slice(0, 10).split('-');
      return `Dia: ${dia}/${mes}/${ano}\nHora: ${String(reuniao.horario_inicio || '').slice(0, 5)}\nLocal: ${reuniao.local || ''}`;
    }).join('\n\n');
    return `${titulo}\n${detalhes || 'Dia: \nHora: \nLocal: '}`;
  }).join('\n\n');
}

function gerarTokenConfirmacao(participante) {
  return jwt.sign(
    {
      id: participante.id,
      tipo: participante.tipo_cadastro,
      jti: crypto.randomUUID()
    },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );
}

function obterBaseUrl(req) {
  return process.env.APP_BASE_URL || `${req.protocol}://${req.get('host')}`;
}

function usuarioPodeGerenciarReuniao(req, reuniao) {
  if (req.usuario.perfil === 'equipe_dirigente') return true;
  return Number(reuniao.criada_por) === Number(req.usuario.id);
}

function obterDataHoraReuniao(reuniao) {
  const data = String(reuniao?.data_reuniao || '').slice(0, 10);
  const hora = String(reuniao?.horario_inicio || '00:00').slice(0, 5);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || !/^\d{2}:\d{2}$/.test(hora)) {
    return null;
  }

  const dataHora = new Date(`${data}T${hora}:00-03:00`);
  return Number.isNaN(dataHora.getTime()) ? null : dataHora;
}

function prazoAcoesReuniaoEncerrado(reuniao, agora = new Date()) {
  const dataHora = obterDataHoraReuniao(reuniao);
  if (!dataHora) return false;

  return agora.getTime() >= dataHora.getTime() + (24 * 60 * 60 * 1000);
}

function respostaPrazoReuniaoEncerrado(res) {
  return res.status(403).json({
    erro: 'O prazo para chamada, edicao ou cancelamento desta reuniao encerrou 24 horas apos o horario da reuniao'
  });
}

function formatarDataReuniaoNotificacao(valor) {
  const partes = String(valor || '').slice(0, 10).split('-');
  if (partes.length === 3) return `${partes[2]}/${partes[1]}/${partes[0]}`;
  return String(valor || '');
}

function formatarHoraReuniaoNotificacao(valor) {
  return String(valor || '').slice(0, 5);
}

async function obterIdsMensagensChamadaPendentes(reuniaoId, candidatos, tipoMensagem) {
  const pendentes = [];

  for (const usuarioId of candidatos) {
    const enviada = await database.get(
      'SELECT id FROM mensagens_chamada_enviadas WHERE reuniao_id = ? AND usuario_id = ? AND tipo_mensagem = ?',
      [reuniaoId, usuarioId, tipoMensagem]
    );

    if (!enviada) pendentes.push(usuarioId);
  }

  return pendentes;
}

async function registrarMensagemChamadaEnviada(reuniaoId, usuarioId, tipoMensagem, enviadaPor) {
  const existente = await database.get(
    'SELECT id FROM mensagens_chamada_enviadas WHERE reuniao_id = ? AND usuario_id = ? AND tipo_mensagem = ?',
    [reuniaoId, usuarioId, tipoMensagem]
  );

  if (existente) return;

  await database.run(
    `INSERT INTO mensagens_chamada_enviadas (reuniao_id, usuario_id, tipo_mensagem, enviada_por)
     VALUES (?, ?, ?, ?)`,
    [reuniaoId, usuarioId, tipoMensagem, enviadaPor]
  );
}

async function gerarCodigoLinkCurto() {
  for (let tentativa = 0; tentativa < 6; tentativa += 1) {
    const codigo = crypto.randomBytes(4).toString('base64url');
    const existente = await database.get('SELECT codigo FROM links_encurtados WHERE codigo = ?', [codigo]);
    if (!existente) return codigo;
  }

  return crypto.randomUUID().replace(/-/g, '').slice(0, 12);
}

async function encurtarLinkConfirmacao(req, destino) {
  const codigo = await gerarCodigoLinkCurto();
  await database.run(
    'INSERT INTO links_encurtados (codigo, destino) VALUES (?, ?)',
    [codigo, destino]
  );
  return `${obterBaseUrl(req)}/c/${codigo}`;
}

async function gerarDadosConfirmacao(req, participante, opcoes = {}) {
  const token = gerarTokenConfirmacao(participante);
  const pagina = opcoes.pagina || 'confirmacao.html';
  const parametros = new URLSearchParams({ token });
  if (opcoes.status) {
    parametros.set('status', opcoes.status);
  }
  const linkCompleto = `${obterBaseUrl(req)}/frontend/${pagina}?${parametros.toString()}`;
  const linkCurto = await encurtarLinkConfirmacao(req, linkCompleto);

  return {
    token_confirmacao: token,
    link_confirmacao: linkCurto,
    link_confirmacao_completo: linkCompleto
  };
}
const TAMANHOS_BLUSA = [
  '8 Anos',
  '10 Anos',
  '12 Anos',
  '14 Anos (PP Babylook)',
  'P Babylook',
  'M Babylook',
  'G Babylook',
  'GG Babylook',
  'EXGG Babylook',
  'PP Unisex',
  'P Unisex',
  'M Unisex',
  'G Unisex',
  'GG Unisex',
  'EXGG Unisex',
  'XL Unisex'
];

// Obter dados do próprio perfil
router.get('/meu-perfil', verificarToken, verificarPerfil(['coordenador', 'equipe_dirigente']), async (req, res) => {
  try {
    const usuario = await database.get(
      `SELECT id, email, nome_completo, nome_cracha, telefone, movimento_origem, ano_encontro,
              paroquia, restricao_medica, restricao_alimentar, restricao_medicacao, foto_perfil,
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
    await registrarHistorico(usuario_id, 'perfil_atualizado', { origem: 'coordenador' });

    res.json({ mensagem: 'Perfil atualizado com sucesso' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao atualizar perfil' });
  }
});

router.get('/restricoes-alimentares', verificarToken, verificarPerfil(['coordenador']), async (req, res) => {
  try {
    const coordenador = await database.get('SELECT equipe FROM usuarios WHERE id = ?', [req.usuario.id]);

    if (normalizarEquipe(coordenador?.equipe || '') !== 'Ranguinho') {
      return res.status(403).json({ erro: 'Acesso permitido apenas ao coordenador do Ranguinho' });
    }

    const usuarios = await database.all(`
      SELECT id, nome_completo, nome_cracha, foto_perfil, restricao_alimentar
      FROM usuarios
      WHERE status = 'confirmado'
        AND equipe IS NOT NULL
        AND UPPER(TRIM(equipe)) <> 'SEM EQUIPE'
      ORDER BY nome_cracha COLLATE NOCASE ASC, nome_completo COLLATE NOCASE ASC
    `);

    res.json(usuarios);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao carregar restrições alimentares' });
  }
});

// Confirmar pagamento de taxa
router.put('/confirmar-pagamento/:id', verificarToken, verificarPerfil(['coordenador', 'equipe_dirigente']), async (req, res) => {
  try {
    const pagamento_id = req.params.id;
    const usuario_id = req.usuario.id;
    const { forma_pagamento } = req.body;

    if (!['pix', 'dinheiro'].includes(forma_pagamento)) {
      return res.status(400).json({ erro: 'Informe se recebeu via PIX ou em dinheiro' });
    }

    const pagamento = await database.get(`
      SELECT p.id, p.tipo, u.equipe, u.perfil
      FROM pagamentos p
      JOIN usuarios u ON p.usuario_id = u.id
      WHERE p.id = ?
    `, [pagamento_id]);

    if (!pagamento || !pagamento.equipe || equipeSemEquipe(pagamento.equipe)) {
      return res.status(400).json({ erro: 'Usuário sem equipe não possui cobrança' });
    }

    if (pagamento.tipo === 'taxa' && pagamento.perfil === 'equipe_dirigente') {
      return res.status(400).json({ erro: 'Equipe dirigente não possui taxa de encontro' });
    }

    const coordenador = await database.get('SELECT perfil, equipe FROM usuarios WHERE id = ?', [usuario_id]);
    if (coordenador?.perfil !== 'coordenador' || !coordenador.equipe || coordenador.equipe !== pagamento.equipe) {
      return res.status(403).json({ erro: 'Apenas o coordenador da equipe pode confirmar este pagamento' });
    }

    await database.run(
      `UPDATE pagamentos
       SET status = 'confirmado', data_confirmacao = CURRENT_TIMESTAMP, confirmado_por = ?, forma_pagamento = ?
       WHERE id = ?`,
      [usuario_id, forma_pagamento, pagamento_id]
    );
    await registrarHistorico(usuario_id, 'pagamento_confirmado', { pagamento_id, forma_pagamento });

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
    const usuario = await database.get('SELECT equipe FROM usuarios WHERE id = ?', [usuario_id]);

    if (!usuario?.equipe || equipeSemEquipe(usuario.equipe)) {
      await database.run(`UPDATE usuarios SET status = 'pendente', equipe = 'SEM EQUIPE' WHERE id = ?`, [usuario_id]);
      return res.status(400).json({ erro: 'Usuário sem equipe deve permanecer pendente' });
    }

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

    if (filtrarPorEquipe && (!coordenador?.equipe || equipeSemEquipe(coordenador.equipe))) {
      return res.json([]);
    }

    const filtroEquipeSql = filtrarPorEquipe ? 'WHERE equipe = ?' : '';
    const filtroEquipeParams = filtrarPorEquipe ? [coordenador.equipe] : [];

    const usuarios = await database.all(`
      SELECT id, nome_completo, nome_cracha, email, telefone, movimento_origem, foto_perfil,
             restricao_medica, restricao_alimentar, restricao_medicacao, perfil, status, equipe,
             COALESCE((SELECT COUNT(*) FROM presencas_reuniao pr WHERE pr.usuario_id = usuarios.id AND pr.status = 'presente'), 0) AS total_presencas,
             COALESCE((SELECT COUNT(*) FROM presencas_reuniao pr WHERE pr.usuario_id = usuarios.id AND pr.status = 'falta_justificada'), 0) AS total_faltas_justificadas,
             COALESCE((SELECT COUNT(*) FROM presencas_reuniao pr WHERE pr.usuario_id = usuarios.id AND pr.status = 'falta'), 0) AS total_faltas,
             'usuario' AS tipo_cadastro
      FROM usuarios
      ${filtroEquipeSql}
      ORDER BY nome_completo ASC
    `, filtroEquipeParams);

    const externos = await database.all(`
      SELECT id, nome_completo, nome_cracha, '' AS email, telefone, movimento_origem, foto_perfil,
             restricao_medica, restricao_alimentar, restricao_medicacao, 'sem_cadastro' AS perfil, status, equipe,
             0 AS total_presencas,
             0 AS total_faltas_justificadas,
             0 AS total_faltas,
             'externo' AS tipo_cadastro
      FROM pessoas_externas
      ${filtroEquipeSql}
      ORDER BY nome_completo ASC
    `, filtroEquipeParams);

    const participantes = [...usuarios, ...externos]
      .sort((a, b) => String(a.nome_completo || '').localeCompare(String(b.nome_completo || '')))
      .map(participante => ({
        ...participante,
        token_confirmacao: gerarTokenConfirmacao(participante)
      }));

    res.json(participantes);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao obter participantes da equipe' });
  }
});

router.post('/participantes-equipe/:tipo/:id/token-confirmacao', verificarToken, verificarPerfil(['coordenador', 'equipe_dirigente']), async (req, res) => {
  try {
    const tipo = req.params.tipo;
    const id = Number(req.params.id);
    const finalidade = req.body?.finalidade || 'confirmacao';
    const statusDesistencia = ['negou', 'desistiu'].includes(req.body?.status) ? req.body.status : 'desistiu';

    if (!['confirmacao', 'desistencia'].includes(finalidade)) {
      return res.status(400).json({ erro: 'Finalidade invalida' });
    }

    if (!['usuario', 'externo'].includes(tipo) || !id) {
      return res.status(400).json({ erro: 'Participante inválido' });
    }

    const coordenador = await database.get('SELECT equipe FROM usuarios WHERE id = ?', [req.usuario.id]);
    const filtrarPorEquipe = req.usuario.perfil !== 'equipe_dirigente';
    const tabela = tipo === 'externo' ? 'pessoas_externas' : 'usuarios';
    const participante = await database.get(
      `SELECT id, nome_completo, telefone, equipe, '${tipo}' AS tipo_cadastro FROM ${tabela} WHERE id = ?`,
      [id]
    );

    if (!participante) {
      return res.status(404).json({ erro: 'Participante não encontrado' });
    }

    if (filtrarPorEquipe && participante.equipe !== coordenador?.equipe) {
      return res.status(403).json({ erro: 'Participante não pertence à sua equipe' });
    }

    res.json(await gerarDadosConfirmacao(req, participante, finalidade === 'desistencia'
      ? { pagina: 'confirmacao-desistencia.html', status: statusDesistencia }
      : {}
    ));
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao gerar link de confirmação' });
  }
});

router.get('/carografo-escrita', verificarToken, verificarPerfil(['coordenador']), async (req, res) => {
  try {
    const coordenador = await database.get('SELECT equipe FROM usuarios WHERE id = ?', [req.usuario.id]);

    if (!coordenador?.equipe || normalizarEquipe(coordenador.equipe) !== 'Escrita') {
      return res.status(403).json({ erro: 'Acesso permitido apenas ao coordenador da equipe Escrita' });
    }

    const usuarios = await database.all(`
      SELECT id, email, nome_completo, nome_cracha, telefone, paroquia, movimento_origem, ano_encontro,
             restricao_medica, restricao_alimentar, restricao_medicacao, perfil, status, equipe, foto_perfil,
             toca_instrumento, instrumentos, canta, equipes_servidas
      FROM usuarios
      WHERE status = 'confirmado'
        AND equipe IS NOT NULL
        AND UPPER(equipe) <> 'SEM EQUIPE'
      ORDER BY nome_completo ASC
    `);

    res.json(usuarios);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao carregar carógrafo' });
  }
});

router.put('/participantes/:usuario_id/status', verificarToken, verificarPerfil(['coordenador', 'equipe_dirigente']), async (req, res) => {
  try {
    const usuario_id = Number(req.params.usuario_id);
    const { status, tipo_cadastro } = req.body;
    const statusPermitidos = ['pendente', 'confirmado', 'contato_errado', 'negou', 'desistiu'];

    if (!usuario_id || !statusPermitidos.includes(status)) {
      return res.status(400).json({ erro: 'Status inválido' });
    }

    const coordenador = await database.get('SELECT equipe FROM usuarios WHERE id = ?', [req.usuario.id]);
    const filtrarPorEquipe = req.usuario.perfil !== 'equipe_dirigente';

    if (filtrarPorEquipe && (!coordenador?.equipe || equipeSemEquipe(coordenador.equipe))) {
      return res.status(400).json({ erro: 'Coordenador sem equipe escalada' });
    }

    const tabela = tipo_cadastro === 'externo' ? 'pessoas_externas' : 'usuarios';

    const participante = await database.get(
      `SELECT id, equipe FROM ${tabela} WHERE id = ? ${filtrarPorEquipe ? 'AND equipe = ?' : ''}`,
      filtrarPorEquipe ? [usuario_id, coordenador.equipe] : [usuario_id]
    );

    if (!participante) {
      return res.status(403).json({ erro: 'Usuário não pertence à equipe do coordenador' });
    }

    const regraEquipeStatus = aplicarRegraSemEquipe(participante.equipe, status);

    await database.run(
      `UPDATE ${tabela} SET status = ?, equipe = ? WHERE id = ?`,
      [regraEquipeStatus.status, regraEquipeStatus.equipe, usuario_id]
    );

    res.json({ mensagem: 'Status atualizado com sucesso' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao atualizar status' });
  }
});

router.get('/solicitacoes-blusa', verificarToken, verificarPerfil(['coordenador', 'equipe_dirigente']), async (req, res) => {
  try {
    const coordenador = await database.get('SELECT equipe FROM usuarios WHERE id = ?', [req.usuario.id]);
    const filtrarPorEquipe = req.usuario.perfil !== 'equipe_dirigente';

    if (filtrarPorEquipe && (!coordenador?.equipe || equipeSemEquipe(coordenador.equipe))) {
      return res.json([]);
    }

    const filtroEquipeSql = filtrarPorEquipe ? 'AND u.equipe = ?' : '';
    const filtroEquipeParams = filtrarPorEquipe ? [coordenador.equipe] : [];

    const solicitacoes = await database.all(`
      SELECT u.id as usuario_id, u.nome_completo, u.email, u.nome_cracha, u.foto_perfil, u.equipe,
             sb.id, sb.tamanho, sb.valor, sb.status, sb.data_solicitacao, sb.data_confirmacao, sb.forma_pagamento,
             sb.confirmado_por, confirmador.nome_completo AS confirmado_por_nome, confirmador.nome_cracha AS confirmado_por_cracha
      FROM usuarios u
      LEFT JOIN solicitacoes_blusa sb ON sb.usuario_id = u.id
      LEFT JOIN usuarios confirmador ON confirmador.id = sb.confirmado_por
      WHERE u.equipe IS NOT NULL
        AND UPPER(u.equipe) <> 'SEM EQUIPE'
        AND u.status = 'confirmado'
        ${filtroEquipeSql}
      ORDER BY u.nome_completo ASC, sb.data_solicitacao DESC
    `, filtroEquipeParams);

    res.json(solicitacoes.map(item => ({
      ...item,
      status: item.id ? item.status : 'sem_solicitacao'
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao obter solicitações' });
  }
});

router.get('/configuracoes-blusa', verificarToken, verificarPerfil(['coordenador', 'equipe_dirigente']), async (req, res) => {
  try {
    res.json({
      pedidos_bloqueados: await pedidosBlusaBloqueados(database)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao carregar configurações de blusa' });
  }
});

router.get('/configuracoes-dashboard', verificarToken, verificarPerfil(['coordenador', 'equipe_dirigente']), async (req, res) => {
  try {
    res.json({
      reuniao_entrega_pastas: (await obterConfiguracao(database, 'reuniao_entrega_pastas', 'false')) === 'true'
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao carregar configurações do dashboard' });
  }
});

router.post('/solicitacoes-blusa/:usuario_id', verificarToken, verificarPerfil(['coordenador']), async (req, res) => {
  try {
    const usuario_id = Number(req.params.usuario_id);
    const { tamanho } = req.body;

    if (await pedidosBlusaBloqueados(database)) {
      return res.status(403).json({ erro: 'Pedidos de blusa estão encerrados' });
    }

    if (!usuario_id || !TAMANHOS_BLUSA.includes(tamanho)) {
      return res.status(400).json({ erro: 'Tamanho de blusa inválido' });
    }

    const coordenador = await database.get('SELECT equipe FROM usuarios WHERE id = ?', [req.usuario.id]);
    const usuario = await database.get(
      `SELECT id, equipe, status FROM usuarios WHERE id = ?`,
      [usuario_id]
    );

    if (!coordenador?.equipe || equipeSemEquipe(coordenador.equipe) || !usuario || usuario.equipe !== coordenador.equipe || usuario.status !== 'confirmado') {
      return res.status(403).json({ erro: 'Apenas o coordenador da equipe pode adicionar camisa para usuários confirmados' });
    }

    const resultado = await database.run(
      `INSERT INTO solicitacoes_blusa (usuario_id, tamanho, valor) VALUES (?, ?, ?)`,
      [usuario_id, tamanho, VALOR_BLUSA_UNICA]
    );
    const preco = await recalcularValoresBlusasUsuario(database, usuario_id);
    await registrarHistorico(usuario_id, 'blusa_solicitada_pelo_coordenador', {
      tamanho,
      solicitacao_id: resultado.lastID,
      valor: preco.valor,
      quantidade_blusas: preco.quantidade,
      coordenador_id: req.usuario.id
    });

    res.status(201).json({ mensagem: 'Solicitação de camisa adicionada', id: resultado.lastID });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao adicionar solicitação de camisa' });
  }
});

router.delete('/solicitacoes-blusa/:id', verificarToken, verificarPerfil(['coordenador']), async (req, res) => {
  try {
    const solicitacao_id = Number(req.params.id);
    const coordenador = await database.get('SELECT equipe FROM usuarios WHERE id = ?', [req.usuario.id]);
    const solicitacao = await database.get(`
      SELECT sb.id, sb.usuario_id, u.equipe
      FROM solicitacoes_blusa sb
      JOIN usuarios u ON u.id = sb.usuario_id
      WHERE sb.id = ?
    `, [solicitacao_id]);

    if (!solicitacao || !coordenador?.equipe || solicitacao.equipe !== coordenador.equipe) {
      return res.status(403).json({ erro: 'Apenas o coordenador da equipe pode excluir esta solicitação' });
    }

    await database.run('DELETE FROM solicitacoes_blusa WHERE id = ?', [solicitacao_id]);
    await recalcularValoresBlusasUsuario(database, solicitacao.usuario_id);
    await registrarHistorico(solicitacao.usuario_id, 'blusa_excluida_pelo_coordenador', {
      solicitacao_id,
      coordenador_id: req.usuario.id
    });

    res.json({ mensagem: 'Solicitação de camisa excluída' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao excluir solicitação de camisa' });
  }
});

router.put('/confirmar-blusa/:id', verificarToken, verificarPerfil(['coordenador']), async (req, res) => {
  try {
    const solicitacao_id = Number(req.params.id);
    const { forma_pagamento } = req.body;

    if (!['pix', 'dinheiro'].includes(forma_pagamento)) {
      return res.status(400).json({ erro: 'Informe se recebeu via PIX ou em dinheiro' });
    }

    const coordenador = await database.get('SELECT equipe FROM usuarios WHERE id = ?', [req.usuario.id]);
    const solicitacao = await database.get(`
      SELECT sb.id, sb.usuario_id, u.equipe
      FROM solicitacoes_blusa sb
      JOIN usuarios u ON u.id = sb.usuario_id
      WHERE sb.id = ?
    `, [solicitacao_id]);

    if (!solicitacao || !coordenador?.equipe || solicitacao.equipe !== coordenador.equipe) {
      return res.status(403).json({ erro: 'Apenas o coordenador da equipe pode confirmar este pagamento' });
    }

    await database.run(
      `UPDATE solicitacoes_blusa
       SET status = 'confirmado', data_confirmacao = CURRENT_TIMESTAMP, confirmado_por = ?, forma_pagamento = ?
       WHERE id = ?`,
      [req.usuario.id, forma_pagamento, solicitacao_id]
    );
    await registrarHistorico(solicitacao.usuario_id, 'pagamento_blusa_confirmado', {
      solicitacao_id,
      forma_pagamento,
      coordenador_id: req.usuario.id
    });

    res.json({ mensagem: 'Pagamento da camisa confirmado' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao confirmar pagamento da camisa' });
  }
});

// Obter lista de pagamentos pendentes
router.get('/pagamentos-pendentes', verificarToken, verificarPerfil(['coordenador', 'equipe_dirigente']), async (req, res) => {
  try {
    const coordenador = await database.get('SELECT equipe FROM usuarios WHERE id = ?', [req.usuario.id]);
    const filtrarPorEquipe = req.usuario.perfil !== 'equipe_dirigente';

    if (filtrarPorEquipe && (!coordenador?.equipe || equipeSemEquipe(coordenador.equipe))) {
      return res.json({ resumo: { valorRecebido: 0, valorFaltaReceber: 0 }, pagamentos: [] });
    }

    const filtroEquipeSql = filtrarPorEquipe ? 'AND u.equipe = ?' : '';
    const filtroEquipeParams = filtrarPorEquipe ? [coordenador.equipe] : [];

    const usuarios = await database.all(`
      SELECT u.id AS usuario_id, u.nome_completo, u.email, u.foto_perfil, u.movimento_origem, u.equipe, u.perfil,
             p.id, p.tipo, p.valor, p.status, p.data_solicitacao, p.data_confirmacao, p.forma_pagamento
      FROM usuarios u
      LEFT JOIN pagamentos p ON p.usuario_id = u.id AND p.tipo = 'taxa'
      WHERE u.equipe IS NOT NULL
        AND UPPER(u.equipe) <> 'SEM EQUIPE'
        AND u.status = 'confirmado'
        AND u.perfil <> 'equipe_dirigente'
        ${filtroEquipeSql}
      ORDER BY u.nome_completo ASC
    `, filtroEquipeParams);

    const pagamentos = [];
    for (const usuario of usuarios) {
      const movimento = normalizarMovimentoOrigem(usuario.movimento_origem);
      const valorTaxa = TAXAS_POR_MOVIMENTO[movimento] || 0;
      let pagamento = usuario;

      if (!usuario.id && valorTaxa > 0) {
        const resultado = await database.run(
          `INSERT INTO pagamentos (usuario_id, tipo, valor) VALUES (?, 'taxa', ?)`,
          [usuario.usuario_id, valorTaxa]
        );
        pagamento = {
          ...usuario,
          id: resultado.lastID,
          tipo: 'taxa',
          valor: valorTaxa,
          status: 'pendente',
          data_solicitacao: new Date().toISOString(),
          data_confirmacao: null,
          forma_pagamento: null
        };
      }

      pagamentos.push({
        ...pagamento,
        tipo: pagamento.tipo || 'taxa',
        valor: Number(pagamento.valor || valorTaxa || 0),
        status: pagamento.status || 'pendente'
      });
    }

    const valorRecebido = pagamentos
      .filter(p => p.status === 'confirmado')
      .reduce((total, p) => total + Number(p.valor || 0), 0);
    const valorFaltaReceber = pagamentos
      .filter(p => p.status !== 'confirmado')
      .reduce((total, p) => total + Number(p.valor || 0), 0);

    res.json({
      resumo: { valorRecebido, valorFaltaReceber },
      pagamentos
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao obter pagamentos' });
  }
});

// ===== ROTAS DE REUNIÕES =====

// Criar nova reunião
router.post('/reunioes', verificarToken, verificarPerfil(['coordenador', 'equipe_dirigente']), async (req, res) => {
  try {
    const { data_reuniao, horario_inicio, local } = req.body;
    const titulo = 'Reunião';
    const descricao = '';
    const criada_por = req.usuario.id;

    if (!data_reuniao || !horario_inicio || !local) {
      return res.status(400).json({ erro: 'Campos obrigatórios: título, data, horário e local' });
    }

    const resultado = await database.run(
      `INSERT INTO reunioes (criada_por, titulo, descricao, data_reuniao, horario_inicio, horario_fim, local) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [criada_por, titulo, descricao || '', data_reuniao, horario_inicio, null, local]
    );

    const criador = await database.get('SELECT equipe FROM usuarios WHERE id = ?', [criada_por]);
    await criarNotificacoesParaEquipe(criador?.equipe, {
      titulo: 'Nova reunião agendada',
      mensagem: `${titulo} foi agendada para ${formatarDataReuniaoNotificacao(data_reuniao)} às ${formatarHoraReuniaoNotificacao(horario_inicio)} em ${local}.`,
      tipo: 'reuniao_agendada',
      referencia_tipo: 'reuniao',
      referencia_id: resultado.lastID
    }, { excluirIds: [criada_por] });

    const reunioes = await database.all(`
      SELECT r.data_reuniao, r.horario_inicio, r.local, u.equipe
      FROM reunioes r JOIN usuarios u ON u.id = r.criada_por
      WHERE COALESCE(r.status, 'agendada') = 'agendada'
    `);

    res.status(201).json({
      mensagem: 'Reunião agendada com sucesso',
      id: resultado.lastID,
      mensagem_whatsapp: montarMensagemWhatsAppReunioes(reunioes)
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

    res.json(reunioes.map(reuniao => ({
      ...reuniao,
      prazo_acoes_encerrado: prazoAcoesReuniaoEncerrado(reuniao)
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao obter reuniões' });
  }
});

router.get('/reunioes/:id/presencas', verificarToken, verificarPerfil(['coordenador', 'equipe_dirigente']), async (req, res) => {
  try {
    const reuniao_id = req.params.id;
    const usuario_id = req.usuario.id;

    const reuniao = await database.get('SELECT criada_por, titulo, data_reuniao, horario_inicio, local FROM reunioes WHERE id = ?', [reuniao_id]);
    if (!reuniao) {
      return res.status(404).json({ erro: 'Reuniao nao encontrada' });
    }

    if (!usuarioPodeGerenciarReuniao(req, reuniao)) {
      return res.status(403).json({ erro: 'Você não tem permissão para acessar esta chamada' });
    }

    if (prazoAcoesReuniaoEncerrado(reuniao)) {
      return respostaPrazoReuniaoEncerrado(res);
    }

    const coordenador = await database.get('SELECT equipe FROM usuarios WHERE id = ?', [reuniao.criada_por]);

    if (!coordenador?.equipe || equipeSemEquipe(coordenador.equipe)) {
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

    const reuniao = await database.get('SELECT criada_por, titulo, data_reuniao, horario_inicio FROM reunioes WHERE id = ?', [reuniao_id]);
    if (!reuniao) {
      return res.status(404).json({ erro: 'Reuniao nao encontrada' });
    }

    if (req.usuario.perfil !== 'equipe_dirigente' && Number(reuniao.criada_por) !== Number(usuario_id)) {
      return res.status(403).json({ erro: 'Você não tem permissão para salvar esta chamada' });
    }

    if (prazoAcoesReuniaoEncerrado(reuniao)) {
      return respostaPrazoReuniaoEncerrado(res);
    }

    if (!Array.isArray(presencas)) {
      return res.status(400).json({ erro: 'Presencas invalidas' });
    }

    const coordenador = await database.get('SELECT equipe FROM usuarios WHERE id = ?', [reuniao.criada_por]);
    if (!coordenador?.equipe || equipeSemEquipe(coordenador.equipe)) {
      return res.status(400).json({ erro: 'Coordenador sem equipe escalada' });
    }

    const presencasAnteriores = await database.all(
      'SELECT usuario_id, status FROM presencas_reuniao WHERE reuniao_id = ?',
      [reuniao_id]
    );
    const statusAnteriorPorUsuario = new Map(
      presencasAnteriores.map(item => [Number(item.usuario_id), item.status || 'presente'])
    );

    await database.run('DELETE FROM presencas_reuniao WHERE reuniao_id = ?', [reuniao_id]);

    const idsComFalta = [];
    const idsComFaltaJustificada = [];
    const idsComPresenca = [];

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
        return res.status(400).json({ erro: 'Usuário não pertence à equipe escalada desta chamada' });
      }

      await database.run(
        `INSERT INTO presencas_reuniao (reuniao_id, usuario_id, status, observacao, registrada_por)
         VALUES (?, ?, ?, ?, ?)`,
        [reuniao_id, equipista_id, status, observacao, usuario_id]
      );

      const statusAnterior = statusAnteriorPorUsuario.get(equipista_id) || 'presente';
      if (status === statusAnterior) continue;

      if (status === 'presente') idsComPresenca.push(equipista_id);
      if (status === 'falta') idsComFalta.push(equipista_id);
      if (status === 'falta_justificada') idsComFaltaJustificada.push(equipista_id);
    }

    const detalhesReuniao = `${reuniao.titulo || 'Reunião'} de ${formatarDataReuniaoNotificacao(reuniao.data_reuniao)} às ${formatarHoraReuniaoNotificacao(reuniao.horario_inicio)}`;
    for (const usuarioIdPresente of idsComPresenca) {
      await criarNotificacao(usuarioIdPresente, {
        titulo: 'Presença registrada',
        mensagem: `Sua presença foi registrada na chamada: ${detalhesReuniao}.`,
        tipo: 'chamada_presente',
        referencia_tipo: 'reuniao',
        referencia_id: reuniao_id
      });
    }
    for (const usuarioIdFaltaJustificada of idsComFaltaJustificada) {
      await criarNotificacao(usuarioIdFaltaJustificada, {
        titulo: 'Falta justificada',
        mensagem: `Sua falta foi justificada na chamada: ${detalhesReuniao}.`,
        tipo: 'chamada_falta_justificada',
        referencia_tipo: 'reuniao',
        referencia_id: reuniao_id
      });
    }
    for (const usuarioIdFalta of idsComFalta) {
      await criarNotificacao(usuarioIdFalta, {
        titulo: 'Falta registrada',
        mensagem: `Foi registrada falta para você na chamada: ${detalhesReuniao}.`,
        tipo: 'chamada_falta',
        referencia_tipo: 'reuniao',
        referencia_id: reuniao_id
      });
    }

    const mensagensPendentes = {
      falta: await obterIdsMensagensChamadaPendentes(reuniao_id, idsComFalta, 'falta'),
      falta_justificada: await obterIdsMensagensChamadaPendentes(reuniao_id, idsComFaltaJustificada, 'falta_justificada')
    };

    await registrarHistorico(usuario_id, 'chamada_salva', { reuniao_id, total_registros: presencas.length });
    res.json({ mensagem: 'Chamada salva com sucesso', mensagens_pendentes: mensagensPendentes });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao salvar chamada' });
  }
});

// Atualizar reunião
router.post('/reunioes/:id/mensagens-chamada/:usuarioId', verificarToken, verificarPerfil(['coordenador', 'equipe_dirigente']), async (req, res) => {
  try {
    const reuniao_id = Number(req.params.id);
    const participante_id = Number(req.params.usuarioId);
    const enviada_por = req.usuario.id;
    const { tipo_mensagem } = req.body || {};

    if (!reuniao_id || !participante_id || !['falta', 'falta_justificada'].includes(tipo_mensagem)) {
      return res.status(400).json({ erro: 'Mensagem invalida' });
    }

    const reuniao = await database.get('SELECT criada_por, data_reuniao, horario_inicio FROM reunioes WHERE id = ?', [reuniao_id]);
    if (!reuniao) {
      return res.status(404).json({ erro: 'Reuniao nao encontrada' });
    }

    if (!usuarioPodeGerenciarReuniao(req, reuniao)) {
      return res.status(403).json({ erro: 'Sem permissao para registrar esta mensagem' });
    }

    if (prazoAcoesReuniaoEncerrado(reuniao)) {
      return respostaPrazoReuniaoEncerrado(res);
    }

    const coordenador = await database.get('SELECT equipe FROM usuarios WHERE id = ?', [reuniao.criada_por]);
    const participante = await database.get(
      'SELECT id FROM usuarios WHERE id = ? AND equipe = ?',
      [participante_id, coordenador?.equipe || '']
    );

    if (!participante) {
      return res.status(400).json({ erro: 'Usuario nao pertence a equipe desta chamada' });
    }

    await registrarMensagemChamadaEnviada(reuniao_id, participante_id, tipo_mensagem, enviada_por);
    res.json({ mensagem: 'Mensagem registrada como enviada' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao registrar mensagem enviada' });
  }
});

router.put('/reunioes/:id', verificarToken, verificarPerfil(['coordenador', 'equipe_dirigente']), async (req, res) => {
  try {
    const reunion_id = req.params.id;
    const usuario_id = req.usuario.id;
    const { titulo, descricao, data_reuniao, horario_inicio, local, status } = req.body;

    // Verificar se é o criador
    const reuniao = await database.get('SELECT criada_por, data_reuniao, horario_inicio FROM reunioes WHERE id = ?', [reunion_id]);
    if (!reuniao || Number(reuniao.criada_por) !== Number(usuario_id)) {
      return res.status(403).json({ erro: 'Você não tem permissão para editar esta reunião' });
    }

    if (prazoAcoesReuniaoEncerrado(reuniao)) {
      return respostaPrazoReuniaoEncerrado(res);
    }

    await database.run(
      `UPDATE reunioes SET titulo = ?, descricao = ?, data_reuniao = ?, horario_inicio = ?, horario_fim = ?, local = ?, status = ?, data_atualizacao = CURRENT_TIMESTAMP WHERE id = ?`,
      [titulo, descricao || '', data_reuniao, horario_inicio, null, local, status || 'agendada', reunion_id]
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
    const reuniao = await database.get('SELECT criada_por, data_reuniao, horario_inicio FROM reunioes WHERE id = ?', [reunion_id]);
    if (!reuniao || Number(reuniao.criada_por) !== Number(usuario_id)) {
      return res.status(403).json({ erro: 'Você não tem permissão para deletar esta reunião' });
    }

    if (prazoAcoesReuniaoEncerrado(reuniao)) {
      return respostaPrazoReuniaoEncerrado(res);
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
