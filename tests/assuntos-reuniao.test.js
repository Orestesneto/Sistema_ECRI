const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(raiz, 'frontend', 'coordenador.html'), 'utf8');
const js = fs.readFileSync(path.join(raiz, 'frontend', 'js', 'coordenador.js'), 'utf8');
const rota = fs.readFileSync(path.join(raiz, 'backend', 'routes', 'coordenador.js'), 'utf8');

test('agendamento permite informar assuntos da reuniao', () => {
  assert.match(html, /for="descricaoReuniao">Assuntos da reunião/);
  assert.match(html, /id="descricaoReuniao"/);
  assert.match(js, /getElementById\('descricaoReuniao'\)\.value\.trim\(\)/);
  assert.match(js, /data_reuniao, horario_inicio, local, descricao/);
});

test('API salva os assuntos no campo de descricao', () => {
  assert.match(rota, /data_reuniao, horario_inicio, local, descricao/);
  assert.match(rota, /const assuntosReuniao = String\(descricao \|\| ''\)\.trim\(\)\.slice\(0, 1000\)/);
  assert.match(rota, /titulo, assuntosReuniao, data_reuniao/);
});
