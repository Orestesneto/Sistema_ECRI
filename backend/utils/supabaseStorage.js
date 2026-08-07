const crypto = require('crypto');

const SUPABASE_URL_PADRAO = 'https://ulfwqizdqbjlxvrsgkan.supabase.co';
const BUCKET_PADRAO = 'sistema-ecri-imagens';

function obterConfigSupabaseStorage() {
  const url = String(process.env.SUPABASE_URL || SUPABASE_URL_PADRAO).replace(/\/+$/, '');
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_STORAGE_KEY || process.env.SUPABASE_ANON_KEY || '';
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || BUCKET_PADRAO;

  return { url, chave, bucket, configurado: Boolean(url && chave && bucket) };
}

function extrairDataUrlImagem(valor) {
  const match = String(valor || '').match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return null;

  return {
    contentType: match[1],
    buffer: Buffer.from(match[2], 'base64')
  };
}

function obterExtensao(contentType) {
  const mapa = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp'
  };
  return mapa[contentType] || 'jpg';
}

async function criarBucketSeNecessario(config) {
  const response = await fetch(`${config.url}/storage/v1/bucket`, {
    method: 'POST',
    headers: {
      apikey: config.chave,
      Authorization: `Bearer ${config.chave}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      id: config.bucket,
      name: config.bucket,
      public: true,
      file_size_limit: 524288,
      allowed_mime_types: ['image/jpeg', 'image/png', 'image/webp']
    })
  });

  if (!response.ok && response.status !== 409) {
    const texto = await response.text().catch(() => '');
    if (response.status === 400 && /Duplicate|already exists|resource already exists/i.test(texto)) {
      return;
    }
    throw new Error(`Erro ao criar bucket no Supabase: ${response.status} ${texto}`);
  }
}

async function enviarImagemSupabase(dataUrl, { prefixo = 'fotos' } = {}) {
  const config = obterConfigSupabaseStorage();
  if (!config.configurado) return { url: null, configurado: false };

  const imagem = extrairDataUrlImagem(dataUrl);
  if (!imagem) return { url: null, configurado: true };

  await criarBucketSeNecessario(config);

  const extensao = obterExtensao(imagem.contentType);
  const caminho = `${prefixo}/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${extensao}`;
  const uploadUrl = `${config.url}/storage/v1/object/${config.bucket}/${encodeURI(caminho)}`;

  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      apikey: config.chave,
      Authorization: `Bearer ${config.chave}`,
      'Content-Type': imagem.contentType,
      'Cache-Control': '31536000',
      'x-upsert': 'false'
    },
    body: imagem.buffer
  });

  if (!response.ok) {
    const texto = await response.text().catch(() => '');
    throw new Error(`Erro ao enviar imagem ao Supabase: ${response.status} ${texto}`);
  }

  return {
    url: `${config.url}/storage/v1/object/public/${config.bucket}/${encodeURI(caminho)}`,
    configurado: true
  };
}

function ehUrlImagem(valor) {
  return /^https?:\/\/.+/i.test(String(valor || ''));
}

module.exports = {
  enviarImagemSupabase,
  ehUrlImagem,
  obterConfigSupabaseStorage
};
