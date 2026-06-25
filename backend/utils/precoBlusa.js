const VALOR_BLUSA_UNICA = 35;
const VALOR_BLUSA_MULTIPLA = 32.5;
const { obterConfiguracao } = require('./configuracoes');

function normalizarValorBlusa(valor, valorPadrao) {
  const texto = String(valor ?? '').trim().replace(/\s/g, '');
  const temVirgula = texto.includes(',');
  const temPonto = texto.includes('.');
  let textoNormalizado = texto;

  if (temVirgula && temPonto) {
    const ultimaVirgula = texto.lastIndexOf(',');
    const ultimoPonto = texto.lastIndexOf('.');
    const separadorDecimal = ultimaVirgula > ultimoPonto ? ',' : '.';
    const separadorMilhar = separadorDecimal === ',' ? '.' : ',';
    textoNormalizado = texto.split(separadorMilhar).join('').replace(separadorDecimal, '.');
  } else if (temVirgula) {
    textoNormalizado = texto.replace(',', '.');
  }

  const numero = Number(textoNormalizado);
  return Number.isFinite(numero) && numero > 0 ? numero : valorPadrao;
}

async function obterValoresBlusa(database) {
  const valorUnico = await obterConfiguracao(database, 'valor_blusa_unica', String(VALOR_BLUSA_UNICA));
  const valorMultipla = await obterConfiguracao(database, 'valor_blusa_multipla', String(VALOR_BLUSA_MULTIPLA));

  return {
    unica: normalizarValorBlusa(valorUnico, VALOR_BLUSA_UNICA),
    multipla: normalizarValorBlusa(valorMultipla, VALOR_BLUSA_MULTIPLA)
  };
}

async function recalcularValoresBlusasUsuario(database, usuarioId) {
  const blusas = await database.all(
    'SELECT id FROM solicitacoes_blusa WHERE usuario_id = ? ORDER BY id ASC',
    [usuarioId]
  );

  const valores = await obterValoresBlusa(database);
  const valor = blusas.length > 1 ? valores.multipla : valores.unica;
  await database.run(
    'UPDATE solicitacoes_blusa SET valor = ? WHERE usuario_id = ?',
    [valor, usuarioId]
  );

  return {
    quantidade: blusas.length,
    valor
  };
}

async function recalcularValoresBlusasTodosUsuarios(database) {
  const usuarios = await database.all(`
    SELECT usuario_id
    FROM solicitacoes_blusa
    GROUP BY usuario_id
  `);

  for (const usuario of usuarios) {
    await recalcularValoresBlusasUsuario(database, usuario.usuario_id);
  }

  return usuarios.length;
}

module.exports = {
  VALOR_BLUSA_UNICA,
  VALOR_BLUSA_MULTIPLA,
  obterValoresBlusa,
  normalizarValorBlusa,
  recalcularValoresBlusasTodosUsuarios,
  recalcularValoresBlusasUsuario
};
