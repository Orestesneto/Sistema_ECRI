const express = require('express');
const crypto = require('crypto');
const database = require('../config/database');
const { verificarToken, verificarPerfil } = require('../middleware/auth');
const { normalizarMovimentoOrigem, movimentoOrigemValido } = require('../utils/movimentoOrigem');
const { normalizarExperienciaPerfil } = require('../utils/experienciaPerfil');
const { normalizarAnoEncontro, anoEncontroValido } = require('../utils/anoEncontro');
const { registrarHistorico } = require('../utils/historico');
const { normalizarParoquia, paroquiaValida } = require('../utils/paroquia');
const { equipeSemEquipe } = require('../utils/equipes');
const { pedidosBlusaBloqueados } = require('../utils/configuracoes');
const { VALOR_BLUSA_UNICA, recalcularValoresBlusasUsuario } = require('../utils/precoBlusa');

const router = express.Router();
const TAXAS_POR_MOVIMENTO = {
  EC: 25,
  EJC: 25,
  ECC: 35,
  'JOVENS EJC CASADOS': 35,
  ECRI: 15
};
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

function obterBaseUrl(req) {
  return process.env.APP_BASE_URL || `${req.protocol}://${req.get('host')}`;
}

function montarTiposExcluidosMercadoPago(formaPagamento) {
  if (formaPagamento === 'pix') {
    return [
      { id: 'credit_card' },
      { id: 'debit_card' },
      { id: 'prepaid_card' },
      { id: 'ticket' }
    ];
  }

  if (formaPagamento === 'cartao_credito') {
    return [
      { id: 'bank_transfer' },
      { id: 'debit_card' },
      { id: 'prepaid_card' },
      { id: 'ticket' }
    ];
  }

  return [];
}

async function criarPreferenciaMercadoPago(req, { pagamentoId, usuario, tipo, valor, formaPagamento }) {
  const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  if (!accessToken) {
    const erro = new Error('Token do Mercado Pago não configurado');
    erro.statusCode = 503;
    throw erro;
  }

  const baseUrl = obterBaseUrl(req);
  const referenciaExterna = `ecri-${pagamentoId}-${crypto.randomUUID()}`;
  const preference = {
    external_reference: referenciaExterna,
    items: [
      {
        id: `pagamento-${pagamentoId}`,
        title: tipo === 'taxa' ? 'Taxa do encontro ECRI' : 'Pagamento ECRI',
        description: `Pagamento de ${usuario.nome_completo}`,
        quantity: 1,
        currency_id: 'BRL',
        unit_price: Number(valor)
      }
    ],
    payer: {
      name: usuario.nome_completo,
      email: usuario.email
    },
    payment_methods: {
      excluded_payment_types: montarTiposExcluidosMercadoPago(formaPagamento),
      installments: formaPagamento === 'cartao_credito' ? 12 : 1
    },
    back_urls: {
      success: `${baseUrl}/frontend/equipista.html`,
      pending: `${baseUrl}/frontend/equipista.html`,
      failure: `${baseUrl}/frontend/equipista.html`
    },
    auto_return: 'approved'
  };

  if (process.env.MERCADO_PAGO_NOTIFICATION_URL) {
    preference.notification_url = process.env.MERCADO_PAGO_NOTIFICATION_URL;
  }

  const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(preference)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const erro = new Error(data.message || data.error || 'Erro ao criar pagamento no Mercado Pago');
    erro.statusCode = response.status;
    erro.detalhes = data;
    throw erro;
  }

  return {
    preferenceId: data.id,
    initPoint: data.init_point,
    sandboxInitPoint: data.sandbox_init_point,
    referenciaExterna
  };
}

async function consultarPagamentoMercadoPago(paymentId) {
  const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  if (!accessToken) {
    const erro = new Error('Token do Mercado Pago não configurado');
    erro.statusCode = 503;
    throw erro;
  }

  const response = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const erro = new Error(data.message || data.error || 'Erro ao consultar pagamento no Mercado Pago');
    erro.statusCode = response.status;
    erro.detalhes = data;
    throw erro;
  }

  return data;
}

function formaPagamentoMercadoPago(payment) {
  if (payment.payment_type_id === 'bank_transfer' || payment.payment_method_id === 'pix') return 'pix';
  if (payment.payment_type_id === 'credit_card') return 'cartao_credito';
  return null;
}

router.post('/mercado-pago/webhook', async (req, res) => {
  try {
    const tipo = req.body.type || req.body.topic || req.query.type || req.query.topic;
    const paymentId = req.body?.data?.id || req.query['data.id'] || req.query.id;

    if (tipo !== 'payment' || !paymentId) {
      return res.sendStatus(200);
    }

    const pagamentoMercadoPago = await consultarPagamentoMercadoPago(paymentId);
    const referenciaExterna = pagamentoMercadoPago.external_reference;

    if (!referenciaExterna) {
      return res.sendStatus(200);
    }

    const pagamentoLocal = await database.get(
      'SELECT id, usuario_id FROM pagamentos WHERE referencia_externa = ?',
      [referenciaExterna]
    );

    if (!pagamentoLocal) {
      return res.sendStatus(200);
    }

    if (pagamentoMercadoPago.status === 'approved') {
      await database.run(
        `UPDATE pagamentos
         SET status = 'confirmado', data_confirmacao = CURRENT_TIMESTAMP, forma_pagamento = COALESCE(?, forma_pagamento)
         WHERE id = ?`,
        [formaPagamentoMercadoPago(pagamentoMercadoPago), pagamentoLocal.id]
      );
      await registrarHistorico(pagamentoLocal.usuario_id, 'pagamento_confirmado_mercado_pago', {
        pagamento_id: pagamentoLocal.id,
        mercado_pago_payment_id: pagamentoMercadoPago.id,
        status: pagamentoMercadoPago.status
      });
    }

    res.sendStatus(200);
  } catch (err) {
    console.error(err);
    res.sendStatus(200);
  }
});

// Atualizar perfil do equipista
router.put('/perfil', verificarToken, verificarPerfil(['equipista']), async (req, res) => {
  try {
    const { nome_cracha, paroquia, restricao_medica, restricao_alimentar, restricao_medicacao, foto_perfil, movimento_origem, ano_encontro } = req.body;
    const usuario_id = req.usuario.id;
    const experiencia = normalizarExperienciaPerfil(req.body);

    if (!movimentoOrigemValido(movimento_origem)) {
      return res.status(400).json({ erro: 'Movimento de origem inválido' });
    }

    if (!anoEncontroValido(ano_encontro)) {
      return res.status(400).json({ erro: 'Ano do encontro inválido' });
    }

    if (!paroquiaValida(paroquia)) {
      return res.status(400).json({ erro: 'Paróquia inválida' });
    }

    const movimentoOrigem = normalizarMovimentoOrigem(movimento_origem);
    const anoEncontro = normalizarAnoEncontro(ano_encontro);
    const paroquiaNormalizada = normalizarParoquia(paroquia);

    const fotoPerfil = typeof foto_perfil === 'string' && foto_perfil.startsWith('data:image/')
      ? foto_perfil
      : null;

    await database.run(
      `UPDATE usuarios
       SET nome_cracha = ?, restricao_medica = ?, restricao_alimentar = ?, restricao_medicacao = ?,
           foto_perfil = COALESCE(?, foto_perfil), movimento_origem = ?, ano_encontro = ?, paroquia = ?, toca_instrumento = ?,
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
        paroquiaNormalizada,
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
              paroquia, restricao_medica, restricao_alimentar, restricao_medicacao, foto_perfil, status,
              equipe, toca_instrumento, instrumentos, canta, equipes_servidas
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

    if (await pedidosBlusaBloqueados(database)) {
      return res.status(403).json({ erro: 'Pedidos de blusa estão encerrados' });
    }

    if (!tamanho) {
      return res.status(400).json({ erro: 'Tamanho é obrigatório' });
    }

    if (!TAMANHOS_BLUSA.includes(tamanho)) {
      return res.status(400).json({ erro: 'Tamanho de blusa inválido' });
    }

    const usuario = await database.get(
      'SELECT equipe FROM usuarios WHERE id = ?',
      [usuario_id]
    );

    if (!usuario?.equipe || String(usuario.equipe).trim().toLowerCase() === 'sem equipe') {
      return res.status(403).json({ erro: 'Solicitação de blusa disponível apenas para usuários escalados' });
    }

    if (tipo === 'taxa') {
      const pagamentoExistente = await database.get(
        `SELECT id, valor, status, mercado_pago_preference_id, mercado_pago_init_point, mercado_pago_sandbox_init_point
         FROM pagamentos
         WHERE usuario_id = ? AND tipo = 'taxa' AND status IN ('pendente', 'confirmado')
         ORDER BY CASE WHEN status = 'confirmado' THEN 0 ELSE 1 END, id ASC
         LIMIT 1`,
        [usuario_id]
      );

      if (pagamentoExistente) {
        return res.status(200).json({
          mensagem: pagamentoExistente.status === 'confirmado'
            ? 'Taxa já confirmada'
            : 'Já existe uma cobrança de taxa para este usuário',
          id: pagamentoExistente.id,
          valor: pagamentoExistente.valor,
          status: pagamentoExistente.status,
          preference_id: pagamentoExistente.mercado_pago_preference_id,
          init_point: pagamentoExistente.mercado_pago_init_point,
          sandbox_init_point: pagamentoExistente.mercado_pago_sandbox_init_point,
          ja_existia: true
        });
      }
    }

    const resultado = await database.run(
      `INSERT INTO solicitacoes_blusa (usuario_id, tamanho, valor) VALUES (?, ?, ?)`,
      [usuario_id, tamanho, VALOR_BLUSA_UNICA]
    );
    const preco = await recalcularValoresBlusasUsuario(database, usuario_id);
    await registrarHistorico(usuario_id, 'blusa_solicitada', {
      tamanho,
      solicitacao_id: resultado.lastID,
      valor: preco.valor,
      quantidade_blusas: preco.quantidade
    });

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
    const { tipo, valor, forma_pagamento } = req.body;
    const usuario_id = req.usuario.id;
    const formasPermitidas = ['pix', 'cartao_credito'];

    if (!tipo || (tipo !== 'taxa' && !valor)) {
      return res.status(400).json({ erro: 'Tipo e valor são obrigatórios' });
    }

    if (!formasPermitidas.includes(forma_pagamento)) {
      return res.status(400).json({ erro: 'Escolha PIX ou Cartão de Crédito' });
    }

    const usuario = await database.get(
      'SELECT email, nome_completo, movimento_origem, equipe FROM usuarios WHERE id = ?',
      [usuario_id]
    );

    if (!usuario?.equipe || equipeSemEquipe(usuario.equipe)) {
      return res.status(201).json({
        mensagem: 'Usuário sem equipe escalada não possui taxa',
        id: null,
        valor: 0
      });
    }

    const movimentoOrigem = normalizarMovimentoOrigem(usuario?.movimento_origem);
    const valorPagamento = tipo === 'taxa'
      ? TAXAS_POR_MOVIMENTO[movimentoOrigem]
      : Number(valor);

    if (!valorPagamento || valorPagamento <= 0) {
      return res.status(400).json({ erro: 'Valor inválido' });
    }

    const resultado = await database.run(
      `INSERT INTO pagamentos (usuario_id, tipo, valor, forma_pagamento) VALUES (?, ?, ?, ?)`,
      [usuario_id, tipo, valorPagamento, forma_pagamento || null]
    );
    let preferencia;
    try {
      preferencia = await criarPreferenciaMercadoPago(req, {
        pagamentoId: resultado.lastID,
        usuario,
        tipo,
        valor: valorPagamento,
        formaPagamento: forma_pagamento
      });
    } catch (err) {
      await database.run('DELETE FROM pagamentos WHERE id = ?', [resultado.lastID]);
      throw err;
    }

    await database.run(
      `UPDATE pagamentos
       SET mercado_pago_preference_id = ?, mercado_pago_init_point = ?, mercado_pago_sandbox_init_point = ?, referencia_externa = ?
       WHERE id = ?`,
      [
        preferencia.preferenceId,
        preferencia.initPoint,
        preferencia.sandboxInitPoint,
        preferencia.referenciaExterna,
        resultado.lastID
      ]
    );
    await registrarHistorico(usuario_id, 'pagamento_solicitado', {
      tipo,
      valor: valorPagamento,
      forma_pagamento: forma_pagamento || null,
      pagamento_id: resultado.lastID,
      mercado_pago_preference_id: preferencia.preferenceId
    });

    res.status(201).json({ 
      mensagem: 'Pagamento solicitado com sucesso',
      id: resultado.lastID,
      preference_id: preferencia.preferenceId,
      init_point: preferencia.initPoint,
      sandbox_init_point: preferencia.sandboxInitPoint
    });
  } catch (err) {
    console.error(err);
    res.status(err.statusCode || 500).json({ erro: err.message || 'Erro ao solicitar pagamento' });
  }
});

// Obter status de pagamentos e blusas
router.get('/status', verificarToken, verificarPerfil(['equipista']), async (req, res) => {
  try {
    const usuario_id = req.usuario.id;
    const usuario = await database.get('SELECT equipe FROM usuarios WHERE id = ?', [usuario_id]);

    if (!usuario?.equipe || equipeSemEquipe(usuario.equipe)) {
      return res.json({ pagamentos: [], blusas: [] });
    }

    const pagamentos = await database.all(
      `SELECT id, tipo, valor, status, data_solicitacao, data_confirmacao, forma_pagamento,
              mercado_pago_preference_id, mercado_pago_init_point, mercado_pago_sandbox_init_point
       FROM pagamentos
       WHERE usuario_id = ?
       ORDER BY data_solicitacao DESC`,
      [usuario_id]
    );

    const blusas = await database.all(
      `SELECT id, tamanho, valor, status, data_solicitacao, data_confirmacao, forma_pagamento
       FROM solicitacoes_blusa
       WHERE usuario_id = ?
       ORDER BY data_solicitacao DESC`,
      [usuario_id]
    );

    const totalBlusas = blusas.reduce((total, blusa) => total + Number(blusa.valor || 0), 0);
    const totalBlusasPago = blusas
      .filter(blusa => blusa.status === 'confirmado')
      .reduce((total, blusa) => total + Number(blusa.valor || 0), 0);
    const totalBlusasPendente = blusas
      .filter(blusa => blusa.status !== 'confirmado')
      .reduce((total, blusa) => total + Number(blusa.valor || 0), 0);

    res.json({
      pagamentos,
      blusas,
      resumo_blusas: {
        total: totalBlusas,
        pago: totalBlusasPago,
        pendente: totalBlusasPendente
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao obter status' });
  }
});

module.exports = router;
