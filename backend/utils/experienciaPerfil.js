function normalizarOpcaoSimNao(valor) {
  return ['sim', 'nao'].includes(valor) ? valor : 'nao';
}

function normalizarEquipesServidas(valor) {
  if (Array.isArray(valor)) {
    return valor.map(item => String(item || '').trim().toUpperCase()).filter(Boolean);
  }

  if (typeof valor === 'string' && valor.trim()) {
    try {
      const lista = JSON.parse(valor);
      return Array.isArray(lista)
        ? lista.map(item => String(item || '').trim().toUpperCase()).filter(Boolean)
        : [];
    } catch (err) {
      return [];
    }
  }

  return [];
}

function normalizarExperienciaPerfil(body) {
  const tocaInstrumento = normalizarOpcaoSimNao(body.toca_instrumento);
  const canta = normalizarOpcaoSimNao(body.canta);
  const instrumentos = tocaInstrumento === 'sim'
    ? String(body.instrumentos || '').trim().toUpperCase()
    : '';
  const equipesServidas = normalizarEquipesServidas(body.equipes_servidas);

  return {
    tocaInstrumento,
    instrumentos,
    canta,
    equipesServidasJson: JSON.stringify(equipesServidas)
  };
}

module.exports = {
  normalizarExperienciaPerfil
};
