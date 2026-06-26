const TAMANHO_MAXIMO_FOTO_SALVA_BYTES = 300 * 1024;
const TIPOS_FOTO_PERMITIDOS = ['image/jpeg', 'image/png', 'image/webp'];

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
    return { erro: 'Foto de perfil invalida' };
  }

  const separadorTipo = fotoPerfil.indexOf(';');
  const tipo = separadorTipo > 5 ? fotoPerfil.slice(5, separadorTipo).toLowerCase() : '';
  if (!TIPOS_FOTO_PERMITIDOS.includes(tipo)) {
    return { erro: 'A foto deve ser JPG, JPEG, PNG ou WEBP apos a compressao' };
  }

  if (tamanhoFotoBase64Bytes(fotoPerfil) > TAMANHO_MAXIMO_FOTO_SALVA_BYTES) {
    return { erro: 'A foto deve ter no maximo 300KB apos a compressao' };
  }

  return { fotoPerfil };
}

module.exports = {
  TAMANHO_MAXIMO_FOTO_SALVA_BYTES,
  TIPOS_FOTO_PERMITIDOS,
  normalizarFotoPerfil
};
