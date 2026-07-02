const crypto = require('crypto');
const https = require('https');
const database = require('../config/database');

let serviceAccountCache = null;
let accessTokenCache = null;

function base64Url(valor) {
  return Buffer.from(valor)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function carregarServiceAccount() {
  if (serviceAccountCache) return serviceAccountCache;

  if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
    const json = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8');
    serviceAccountCache = JSON.parse(json);
    return serviceAccountCache;
  }

  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    serviceAccountCache = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    return serviceAccountCache;
  }

  return null;
}

function requestJson(url, opcoes = {}, corpo = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, opcoes, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const texto = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try {
          json = texto ? JSON.parse(texto) : null;
        } catch (err) {
          return reject(new Error(`Resposta invalida: ${texto}`));
        }

        if (res.statusCode >= 200 && res.statusCode < 300) {
          return resolve(json);
        }

        const erro = new Error(json?.error?.message || texto || `HTTP ${res.statusCode}`);
        erro.statusCode = res.statusCode;
        erro.response = json;
        reject(erro);
      });
    });

    req.on('error', reject);
    if (corpo) req.write(corpo);
    req.end();
  });
}

async function obterAccessTokenFirebase(serviceAccount) {
  if (accessTokenCache && accessTokenCache.expiraEm > Date.now() + 60000) {
    return accessTokenCache.token;
  }

  const agora = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64Url(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: agora,
    exp: agora + 3600
  }));
  const unsignedJwt = `${header}.${payload}`;
  const assinatura = crypto
    .createSign('RSA-SHA256')
    .update(unsignedJwt)
    .sign(serviceAccount.private_key, 'base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  const assertion = `${unsignedJwt}.${assinatura}`;
  const corpo = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion
  }).toString();

  const resposta = await requestJson('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(corpo)
    }
  }, corpo);

  accessTokenCache = {
    token: resposta.access_token,
    expiraEm: Date.now() + Number(resposta.expires_in || 3600) * 1000
  };
  return accessTokenCache.token;
}

async function enviarMensagemFcm(serviceAccount, tokenDispositivo, notificacao) {
  const accessToken = await obterAccessTokenFirebase(serviceAccount);
  const corpo = JSON.stringify({
    message: {
      token: tokenDispositivo,
      notification: {
        title: String(notificacao.titulo || 'ECRI 2026'),
        body: String(notificacao.mensagem || '')
      },
      data: {
        tipo: String(notificacao.tipo || ''),
        referencia_tipo: String(notificacao.referencia_tipo || ''),
        referencia_id: String(notificacao.referencia_id || ''),
        notificacao_id: String(notificacao.id || '')
      },
      android: {
        priority: 'HIGH',
        notification: {
          channel_id: 'ecri_notificacoes',
          sound: 'default',
          visibility: 'PUBLIC',
          notification_priority: 'PRIORITY_HIGH',
          default_sound: true,
          default_vibrate_timings: true
        }
      }
    }
  });

  return requestJson(`https://fcm.googleapis.com/v1/projects/${serviceAccount.project_id}/messages:send`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(corpo)
    }
  }, corpo);
}

async function enviarPushParaUsuario(usuarioId, notificacao) {
  const serviceAccount = carregarServiceAccount();
  if (!serviceAccount?.project_id || !serviceAccount?.client_email || !serviceAccount?.private_key) {
    return 0;
  }

  const dispositivos = await database.all(
    'SELECT id, token FROM dispositivos_push WHERE usuario_id = ? AND COALESCE(ativo, 1) = 1',
    [usuarioId]
  );

  let enviados = 0;
  for (const dispositivo of dispositivos) {
    try {
      await enviarMensagemFcm(serviceAccount, dispositivo.token, notificacao);
      enviados += 1;
    } catch (err) {
      console.error('Erro ao enviar push FCM:', err.message || err);
      const status = err.statusCode;
      const statusFcm = err.response?.error?.status;
      if (status === 404 || statusFcm === 'NOT_FOUND' || statusFcm === 'INVALID_ARGUMENT') {
        await database.run('UPDATE dispositivos_push SET ativo = 0, data_atualizacao = CURRENT_TIMESTAMP WHERE id = ?', [dispositivo.id]);
      }
    }
  }

  return enviados;
}

function obterStatusPushFirebase() {
  const serviceAccount = carregarServiceAccount();
  return {
    configurado: Boolean(serviceAccount?.project_id && serviceAccount?.client_email && serviceAccount?.private_key),
    project_id: serviceAccount?.project_id || null
  };
}

module.exports = {
  enviarPushParaUsuario,
  obterStatusPushFirebase
};
