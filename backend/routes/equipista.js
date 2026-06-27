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
const { obterConfiguracao, pedidosBlusaBloqueados } = require('../utils/configuracoes');
const { VALOR_BLUSA_UNICA, recalcularValoresBlusasUsuario } = require('../utils/precoBlusa');
const { normalizarFotoPerfil } = require('../utils/foto');

const router = express.Router();
const TAXAS_POR_MOVIMENTO = {
  EC: 25,
  EJC: 25,
  ECC: 35,
  'JOVENS EJC CASADOS': 35,
  ECRI: 15
};
const PERCENTUAL_TAXA_CARTAO = 0.08;
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

function obterEmailPagadorMercadoPago(usuario) {
  const email = String(usuario?.email || '').trim();
  if (email && email.includes('@') && !email.endsWith('.local')) return email;
  return process.env.MERCADO_PAGO_PAYER_EMAIL || 'pagamentos@sistema-ecri.com.br';
}

function obterDescricaoItemPagamento(tipo) {
  if (tipo === 'taxa') return 'Taxa do encontro ECRI';
  if (tipo === 'blusa') return 'Blusas ECRI';
  return 'Pagamento ECRI';
}

function obterDescricaoPagamentoMercadoPago(usuario, tipo) {
  const item = obterDescricaoItemPagamento(tipo);
  const nome = String(usuario?.nome_completo || 'Usuário').trim();
  const cpf = String(usuario?.cpf || '').replace(/\D/g, '');
  return `${item} - pago por ${nome}${cpf ? ` - CPF ${cpf}` : ''}`;
}

function arredondarMoeda(valor) {
  return Math.round(Number(valor || 0) * 100) / 100;
}

function aplicarTaxaCartao(valor, formaPagamento) {
  const valorBase = arredondarMoeda(valor);
  if (formaPagamento !== 'cartao_credito') {
    return {
      valorBase,
      acrescimoCartao: 0,
      valorFinal: valorBase
    };
  }

  const acrescimoCartao = arredondarMoeda(valorBase * PERCENTUAL_TAXA_CARTAO);
  return {
    valorBase,
    acrescimoCartao,
    valorFinal: arredondarMoeda(valorBase + acrescimoCartao)
  };
}

function formatarPercentualCartao() {
  return `${Math.round(PERCENTUAL_TAXA_CARTAO * 100)}%`;
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
  const descricao = obterDescricaoPagamentoMercadoPago(usuario, tipo);
  const preference = {
    external_reference: referenciaExterna,
    items: [
      {
        id: `pagamento-${pagamentoId}`,
        title: obterDescricaoItemPagamento(tipo),
        description: descricao,
        quantity: 1,
        currency_id: 'BRL',
        unit_price: Number(valor)
      }
    ],
    payer: {
      name: usuario.nome_completo,
      email: obterEmailPagadorMercadoPago(usuario)
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

async function criarPagamentoPixMercadoPago(req, { pagamentoId, usuario, tipo, valor }) {
  const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  if (!accessToken) {
    const erro = new Error('Token do Mercado Pago não configurado');
    erro.statusCode = 503;
    throw erro;
  }

  const referenciaExterna = `ecri-${pagamentoId}-${crypto.randomUUID()}`;
  const payload = {
    transaction_amount: Number(valor),
    description: obterDescricaoPagamentoMercadoPago(usuario, tipo),
    payment_method_id: 'pix',
    external_reference: referenciaExterna,
    payer: {
      email: obterEmailPagadorMercadoPago(usuario),
      first_name: String(usuario.nome_completo || '').split(' ')[0] || 'Participante'
    }
  };

  if (process.env.MERCADO_PAGO_NOTIFICATION_URL) {
    payload.notification_url = process.env.MERCADO_PAGO_NOTIFICATION_URL;
  }

  const response = await fetch('https://api.mercadopago.com/v1/payments', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-Idempotency-Key': referenciaExterna
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const erro = new Error(data.message || data.error || 'Erro ao criar PIX no Mercado Pago');
    erro.statusCode = response.status;
    erro.detalhes = data;
    throw erro;
  }

  const transactionData = data.point_of_interaction?.transaction_data || {};
  if (!transactionData.qr_code) {
    const erro = new Error('Mercado Pago não retornou o código PIX copia e cola');
    erro.statusCode = 502;
    erro.detalhes = data;
    throw erro;
  }

  return {
    paymentId: data.id,
    referenciaExterna,
    qrCode: transactionData.qr_code,
    qrCodeBase64: transactionData.qr_code_base64 || null,
    ticketUrl: transactionData.ticket_url || null
  };
}

async function confirmarBlusasPendentes(usuarioId, formaPagamento, confirmadoPor = null) {
  await database.run(
    `UPDATE solicitacoes_blusa
     SET status = 'confirmado', data_confirmacao = CURRENT_TIMESTAMP, forma_pagamento = ?, confirmado_por = ?
     WHERE usuario_id = ? AND status = 'pendente'`,
    [formaPagamento, confirmadoPor, usuarioId]
  );
}

async function reabrirBlusasConfirmadasPorPagamentoOnline(usuarioId, formaPagamento) {
  await database.run(
    `UPDATE solicitacoes_blusa
     SET status = 'pendente', data_confirmacao = NULL, forma_pagamento = NULL, confirmado_por = NULL
     WHERE usuario_id = ?
       AND status = 'confirmado'
       AND (? IS NULL OR forma_pagamento = ?)`,
    [usuarioId, formaPagamento, formaPagamento]
  );
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

function pagamentoMercadoPagoRessarcido(payment) {
  const status = String(payment?.status || '').toLowerCase();
  const statusDetail = String(payment?.status_detail || '').toLowerCase();
  if (['refunded', 'charged_back'].includes(status)) return true;
  if (statusDetail === 'reimbursed') return true;

  const valorPagamento = Number(payment?.transaction_amount || 0);
  const reembolsos = Array.isArray(payment?.refunds) ? payment.refunds : [];
  if (!valorPagamento || !reembolsos.length) return false;

  const valorReembolsado = reembolsos
    .filter(refund => ['approved', 'refunded'].includes(String(refund.status || '').toLowerCase()))
    .reduce((total, refund) => total + Number(refund.amount || 0), 0);

  return valorReembolsado >= valorPagamento - 0.01;
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
      'SELECT id, usuario_id, tipo FROM pagamentos WHERE referencia_externa = ?',
      [referenciaExterna]
    );

    if (!pagamentoLocal) {
      return res.sendStatus(200);
    }

    const formaPagamento = formaPagamentoMercadoPago(pagamentoMercadoPago);

    if (pagamentoMercadoPagoRessarcido(pagamentoMercadoPago)) {
      await database.run(
        `UPDATE pagamentos
         SET status = 'ressarcido', forma_pagamento = COALESCE(?, forma_pagamento)
         WHERE id = ?`,
        [formaPagamento, pagamentoLocal.id]
      );

      if (pagamentoLocal.tipo === 'blusa') {
        await reabrirBlusasConfirmadasPorPagamentoOnline(pagamentoLocal.usuario_id, formaPagamento);
      }

      await registrarHistorico(pagamentoLocal.usuario_id, 'pagamento_ressarcido_mercado_pago', {
        pagamento_id: pagamentoLocal.id,
        mercado_pago_payment_id: pagamentoMercadoPago.id,
        status: pagamentoMercadoPago.status,
        status_detail: pagamentoMercadoPago.status_detail || null,
        tipo: pagamentoLocal.tipo
      });
    } else if (pagamentoMercadoPago.status === 'approved') {
      await database.run(
        `UPDATE pagamentos
         SET status = 'confirmado', data_confirmacao = CURRENT_TIMESTAMP, forma_pagamento = COALESCE(?, forma_pagamento)
         WHERE id = ?`,
        [formaPagamento, pagamentoLocal.id]
      );

      if (pagamentoLocal.tipo === 'blusa') {
        await confirmarBlusasPendentes(pagamentoLocal.usuario_id, formaPagamento, null);
      }

      await registrarHistorico(pagamentoLocal.usuario_id, 'pagamento_confirmado_mercado_pago', {
        pagamento_id: pagamentoLocal.id,
        mercado_pago_payment_id: pagamentoMercadoPago.id,
        status: pagamentoMercadoPago.status,
        tipo: pagamentoLocal.tipo
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

    const fotoValidada = normalizarFotoPerfil(foto_perfil);
    if (fotoValidada.erro) {
      return res.status(400).json({ erro: fotoValidada.erro });
    }
    const fotoPerfil = fotoValidada.fotoPerfil;

    await database.run(
      `UPDATE usuarios
       SET nome_cracha = ?, restricao_medica = ?, restricao_alimentar = ?, restricao_medicacao = ?,
           foto_perfil = COALESCE(?, foto_perfil), movimento_origem = ?, ano_encontro = ?, paroquia = ?, toca_instrumento = ?,
           instrumentos = ?, canta = ?, equipes_servidas = ?,
           status = CASE WHEN status = 'contato_errado' THEN 'pendente' ELSE status END
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

router.get('/configuracoes-dashboard', verificarToken, verificarPerfil(['equipista']), async (req, res) => {
  try {
    res.json({
      reuniao_revelacao_equipes: (await obterConfiguracao(database, 'reuniao_revelacao_equipes', 'false')) === 'true'
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao carregar configurações do dashboard' });
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
router.post('/solicitar-pagamento', verificarToken, verificarPerfil(['equipista', 'coordenador']), async (req, res) => {
  try {
    const { tipo, valor, forma_pagamento } = req.body;
    const usuario_id = req.usuario.id;
    const formasPermitidas = ['pix', 'cartao_credito'];

    if (!tipo || !['taxa', 'blusa'].includes(tipo)) {
      return res.status(400).json({ erro: 'Tipo inválido' });
    }

    if (!formasPermitidas.includes(forma_pagamento)) {
      return res.status(400).json({ erro: 'Escolha PIX ou Cartão de Crédito' });
    }

    const usuario = await database.get(
      'SELECT email, nome_completo, cpf, movimento_origem, equipe, perfil FROM usuarios WHERE id = ?',
      [usuario_id]
    );

    if (tipo === 'taxa' && usuario?.perfil === 'equipe_dirigente') {
      return res.status(200).json({
        mensagem: 'Equipe dirigente não possui taxa de encontro',
        id: null,
        valor: 0,
        status: 'isento'
      });
    }

    if (!usuario?.equipe || equipeSemEquipe(usuario.equipe)) {
      return res.status(201).json({
        mensagem: 'Usuário sem equipe escalada não possui taxa',
        id: null,
        valor: 0
      });
    }

    const movimentoOrigem = normalizarMovimentoOrigem(usuario?.movimento_origem);
    let valorPagamento = tipo === 'taxa'
      ? TAXAS_POR_MOVIMENTO[movimentoOrigem]
      : Number(valor);

    if (tipo === 'blusa') {
      const resumoBlusas = await database.get(
        `SELECT COALESCE(SUM(valor), 0) AS total
         FROM solicitacoes_blusa
         WHERE usuario_id = ? AND status = 'pendente'`,
        [usuario_id]
      );
      valorPagamento = Number(resumoBlusas?.total || 0);
    }

    if (!valorPagamento || valorPagamento <= 0) {
      return res.status(400).json({ erro: 'Valor inválido' });
    }

    const valoresPagamento = aplicarTaxaCartao(valorPagamento, forma_pagamento);
    valorPagamento = valoresPagamento.valorFinal;

    if (tipo === 'taxa' || tipo === 'blusa') {
      const pagamentoExistente = await database.get(
        `SELECT id, valor, status, forma_pagamento, mercado_pago_preference_id, mercado_pago_payment_id,
                mercado_pago_init_point, mercado_pago_sandbox_init_point, pix_qr_code, pix_qr_code_base64
         FROM pagamentos
         WHERE usuario_id = ?
           AND tipo = ?
           AND ((? = 'taxa' AND status IN ('pendente', 'confirmado')) OR (? = 'blusa' AND status = 'pendente'))
         ORDER BY CASE WHEN status = 'confirmado' THEN 0 ELSE 1 END, id ASC
         LIMIT 1`,
        [usuario_id, tipo, tipo, tipo]
      );

      if (pagamentoExistente) {
        const valorExistente = Number(pagamentoExistente.valor || 0);
        const valorMudou = Math.abs(valorExistente - valorPagamento) >= 0.01;
        if (
          pagamentoExistente.status === 'pendente'
          && (pagamentoExistente.forma_pagamento !== forma_pagamento || (tipo === 'blusa' && valorMudou))
        ) {
          await database.run('DELETE FROM pagamentos WHERE id = ?', [pagamentoExistente.id]);
        } else {
        return res.status(200).json({
          mensagem: pagamentoExistente.status === 'confirmado'
            ? 'Taxa já confirmada'
            : 'Já existe uma cobrança de taxa para este usuário',
          id: pagamentoExistente.id,
          valor: pagamentoExistente.valor,
          status: pagamentoExistente.status,
          preference_id: pagamentoExistente.mercado_pago_preference_id,
          payment_id: pagamentoExistente.mercado_pago_payment_id,
          init_point: pagamentoExistente.mercado_pago_init_point,
          sandbox_init_point: pagamentoExistente.mercado_pago_sandbox_init_point,
          pix_qr_code: pagamentoExistente.pix_qr_code,
          pix_qr_code_base64: pagamentoExistente.pix_qr_code_base64,
          forma_pagamento: pagamentoExistente.forma_pagamento,
          ja_existia: true
        });
        }
      }
    }

    const resultado = await database.run(
      `INSERT INTO pagamentos (usuario_id, tipo, valor, forma_pagamento) VALUES (?, ?, ?, ?)`,
      [usuario_id, tipo, valorPagamento, forma_pagamento || null]
    );
    let pagamentoMercadoPago;
    try {
      pagamentoMercadoPago = forma_pagamento === 'pix'
        ? await criarPagamentoPixMercadoPago(req, {
            pagamentoId: resultado.lastID,
            usuario,
            tipo,
            valor: valorPagamento
          })
        : await criarPreferenciaMercadoPago(req, {
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
       SET mercado_pago_preference_id = ?, mercado_pago_payment_id = ?, mercado_pago_init_point = ?,
           mercado_pago_sandbox_init_point = ?, pix_qr_code = ?, pix_qr_code_base64 = ?, referencia_externa = ?
       WHERE id = ?`,
      [
        pagamentoMercadoPago.preferenceId || null,
        pagamentoMercadoPago.paymentId || null,
        pagamentoMercadoPago.initPoint || pagamentoMercadoPago.ticketUrl || null,
        pagamentoMercadoPago.sandboxInitPoint || null,
        pagamentoMercadoPago.qrCode || null,
        pagamentoMercadoPago.qrCodeBase64 || null,
        pagamentoMercadoPago.referenciaExterna,
        resultado.lastID
      ]
    );
    await registrarHistorico(usuario_id, 'pagamento_solicitado', {
      tipo,
      valor: valorPagamento,
      forma_pagamento: forma_pagamento || null,
      pagamento_id: resultado.lastID,
      valor_base: valoresPagamento.valorBase,
      acrescimo_cartao: valoresPagamento.acrescimoCartao,
      mercado_pago_preference_id: pagamentoMercadoPago.preferenceId || null,
      mercado_pago_payment_id: pagamentoMercadoPago.paymentId || null
    });

    res.status(201).json({ 
      mensagem: 'Pagamento solicitado com sucesso',
      id: resultado.lastID,
      preference_id: pagamentoMercadoPago.preferenceId || null,
      payment_id: pagamentoMercadoPago.paymentId || null,
      init_point: pagamentoMercadoPago.initPoint || pagamentoMercadoPago.ticketUrl || null,
      sandbox_init_point: pagamentoMercadoPago.sandboxInitPoint || null,
      pix_qr_code: pagamentoMercadoPago.qrCode || null,
      pix_qr_code_base64: pagamentoMercadoPago.qrCodeBase64 || null,
      forma_pagamento,
      valor_base: valoresPagamento.valorBase,
      acrescimo_cartao: valoresPagamento.acrescimoCartao,
      valor_final: valoresPagamento.valorFinal,
      percentual_taxa_cartao: formatarPercentualCartao()
    });
  } catch (err) {
    console.error(err);
    res.status(err.statusCode || 500).json({ erro: err.message || 'Erro ao solicitar pagamento' });
  }
});

// Obter status de pagamentos e blusas
router.get('/status', verificarToken, verificarPerfil(['equipista', 'coordenador']), async (req, res) => {
  try {
    const usuario_id = req.usuario.id;
    const usuario = await database.get('SELECT equipe, perfil FROM usuarios WHERE id = ?', [usuario_id]);

    if (!usuario?.equipe || equipeSemEquipe(usuario.equipe)) {
      return res.json({ pagamentos: [], blusas: [] });
    }

    const pagamentos = await database.all(
      `SELECT id, tipo, valor, status, data_solicitacao, data_confirmacao, forma_pagamento,
              mercado_pago_preference_id, mercado_pago_payment_id, mercado_pago_init_point,
              mercado_pago_sandbox_init_point, pix_qr_code, pix_qr_code_base64
       FROM pagamentos
       WHERE usuario_id = ?
         AND NOT (? = 'equipe_dirigente' AND tipo = 'taxa')
       ORDER BY data_solicitacao DESC`,
      [usuario_id, usuario?.perfil || '']
    );

    const blusas = await database.all(
      `SELECT sb.id, sb.tamanho, sb.valor, sb.status, sb.data_solicitacao, sb.data_confirmacao,
              sb.forma_pagamento, sb.confirmado_por,
              confirmador.nome_completo AS confirmado_por_nome,
              confirmador.nome_cracha AS confirmado_por_cracha
       FROM solicitacoes_blusa sb
       LEFT JOIN usuarios confirmador ON confirmador.id = sb.confirmado_por
       WHERE sb.usuario_id = ?
       ORDER BY sb.data_solicitacao DESC`,
      [usuario_id]
    );

    const totalBlusas = blusas.reduce((total, blusa) => total + Number(blusa.valor || 0), 0);
    const totalBlusasPago = blusas
      .filter(blusa => blusa.status === 'confirmado')
      .reduce((total, blusa) => total + Number(blusa.valor || 0), 0);
    const totalBlusasPendente = blusas
      .filter(blusa => blusa.status !== 'confirmado')
      .reduce((total, blusa) => total + Number(blusa.valor || 0), 0);
    const pagamentosVisiveis = pagamentos
      .filter(pagamento => {
        return !(pagamento.tipo === 'blusa' && pagamento.status === 'pendente' && totalBlusasPendente <= 0);
      })
      .map(pagamento => {
        if (
          pagamento.tipo === 'blusa'
          && pagamento.status === 'pendente'
          && Math.abs(Number(pagamento.valor || 0) - totalBlusasPendente) >= 0.01
        ) {
          return {
            ...pagamento,
            valor: totalBlusasPendente,
            mercado_pago_preference_id: null,
            mercado_pago_payment_id: null,
            mercado_pago_init_point: null,
            mercado_pago_sandbox_init_point: null,
            pix_qr_code: null,
            pix_qr_code_base64: null
          };
        }

        return pagamento;
      });

    res.json({
      pagamentos: pagamentosVisiveis,
      blusas: blusas.map(blusa => ({
        ...blusa,
        origem_confirmacao: blusa.status === 'confirmado'
          ? (blusa.confirmado_por ? 'coordenador' : 'mercado_pago')
          : null
      })),
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
