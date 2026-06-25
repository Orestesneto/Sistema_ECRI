function normalizarParoquia(valor) {
  return String(valor || '').trim().toUpperCase();
}

function paroquiaValida(valor) {
  return normalizarParoquia(valor).length > 0;
}

module.exports = {
  normalizarParoquia,
  paroquiaValida
};
