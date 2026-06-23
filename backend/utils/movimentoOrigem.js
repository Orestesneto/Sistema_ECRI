const MOVIMENTO_JOVENS_EJC_CASADOS = 'JOVENS EJC CASADOS';
const MOVIMENTOS_ORIGEM = ['EC', 'EJC', 'ECC', MOVIMENTO_JOVENS_EJC_CASADOS, 'ECRI'];

function normalizarMovimentoOrigem(movimentoOrigem) {
  if (typeof movimentoOrigem !== 'string') {
    return '';
  }

  return movimentoOrigem.trim().toUpperCase();
}

function movimentoOrigemValido(movimentoOrigem) {
  return MOVIMENTOS_ORIGEM.includes(normalizarMovimentoOrigem(movimentoOrigem));
}

function movimentoOrigemCasal(movimentoOrigem) {
  const movimento = normalizarMovimentoOrigem(movimentoOrigem);
  return movimento === 'ECC' || movimento === MOVIMENTO_JOVENS_EJC_CASADOS;
}

module.exports = {
  MOVIMENTO_JOVENS_EJC_CASADOS,
  MOVIMENTOS_ORIGEM,
  normalizarMovimentoOrigem,
  movimentoOrigemValido,
  movimentoOrigemCasal
};
