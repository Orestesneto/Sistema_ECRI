const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.resolve(__dirname, '..');
const rota = fs.readFileSync(path.join(raiz, 'backend', 'routes', 'confirmacao.js'), 'utf8');
const tela = fs.readFileSync(path.join(raiz, 'frontend', 'js', 'confirmacao.js'), 'utf8');

test('link utilizado e reconhecido antes de procurar o registro temporario', () => {
  const inicioGet = rota.indexOf("router.get('/:token'");
  const fimGet = rota.indexOf("router.put('/:token'", inicioGet);
  const get = rota.slice(inicioGet, fimGet);
  assert.ok(get.indexOf('tokenConfirmacaoJaUtilizado') < get.indexOf('FROM ${tabela}'));
  assert.match(get, /confirmacao_concluida: true/);
});

test('reabertura mostra sucesso em vez de participante nao encontrado', () => {
  assert.match(tela, /participante\.confirmacao_concluida/);
  assert.match(tela, /dados e sua participação já foram atualizados com sucesso/);
  assert.match(tela, /formConfirmacao'\)\.style\.display = 'none'/);
});
