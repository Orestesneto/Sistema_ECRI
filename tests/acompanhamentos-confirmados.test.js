const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.resolve(__dirname, '..');
const rota = fs.readFileSync(path.join(raiz, 'backend', 'routes', 'dirigentes.js'), 'utf8');

test('acompanhamento de faltas segue confirmados cadastrados e sem cadastro', () => {
  const inicio = rota.indexOf("router.get('/acompanhamento-faltas/equipes'");
  const fim = rota.indexOf("router.get('/pessoas-externas'", inicio);
  const trecho = rota.slice(inicio, fim);

  assert.match(trecho, /FROM usuarios[\s\S]*?status = 'confirmado'/);
  assert.match(trecho, /FROM pessoas_externas[\s\S]*?status = 'confirmado'/);
  assert.match(trecho, /presencas_reuniao_externos/);
  assert.match(trecho, /\.\.\.usuariosAtivos, \.\.\.externosConfirmados/);
});

test('acompanhamento de taxas inclui confirmados sem cadastro', () => {
  const inicio = rota.indexOf("router.get('/situacao'");
  const fim = rota.indexOf("router.get('/reunioes-proximos-dias'", inicio);
  const trecho = rota.slice(inicio, fim);

  assert.match(trecho, /const pagamentosExternos/);
  assert.match(trecho, /FROM pessoas_externas/);
  assert.match(trecho, /status = 'confirmado'/);
  assert.match(trecho, /pagamentosComFotoUrl\.push/);
});
