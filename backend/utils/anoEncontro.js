function normalizarAnoEncontro(valor) {
  return String(valor || '').replace(/\D/g, '').slice(0, 4);
}

function anoEncontroValido(valor) {
  const ano = normalizarAnoEncontro(valor);
  const anoAtual = new Date().getFullYear();

  return /^\d{4}$/.test(ano) && Number(ano) >= 1900 && Number(ano) <= anoAtual;
}

module.exports = {
  normalizarAnoEncontro,
  anoEncontroValido
};
