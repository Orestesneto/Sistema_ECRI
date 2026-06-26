const TAMANHO_MAXIMO_FOTO_SALVA_BYTES = 2 * 1024 * 1024;

function tamanhoFotoBase64Bytes(fotoPerfil) {
  const base64 = String(fotoPerfil || '').split(',')[1] || '';
  return Math.ceil((base64.length * 3) / 4);
}

function normalizarFotoPerfil(fotoPerfil, { obrigatoria = false } = {}) {
  if (!fotoPerfil) {
    return obrigatoria
      ? { erro: 'Foto de perfil obrigatoria' }
      : { fotoPerfil: null };
  }

  if (typeof fotoPerfil !== 'string' || !fotoPerfil.startsWith('data:image/')) {
    return { erro: 'Foto de perfil inválida' };
  }

  if (tamanhoFotoBase64Bytes(fotoPerfil) > TAMANHO_MAXIMO_FOTO_SALVA_BYTES) {
    return { erro: 'A foto deve ter no máximo 2MB' };
  }

  return { fotoPerfil };
}

module.exports = {
  TAMANHO_MAXIMO_FOTO_SALVA_BYTES,
  normalizarFotoPerfil
};
