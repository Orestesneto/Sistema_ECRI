const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.resolve(__dirname, '..');
const tela = fs.readFileSync(path.join(raiz, 'frontend', 'js', 'coordenador.js'), 'utf8');
const rota = fs.readFileSync(path.join(raiz, 'backend', 'routes', 'coordenador.js'), 'utf8');

test('API retorna o total acumulado de faltas por usuario', () => {
  assert.match(rota, /SELECT COUNT\(\*\) AS total FROM presencas_reuniao/);
  assert.match(rota, /faltas_por_usuario: faltasPorUsuario/);
});

test('mensagem de falta informa o numero acumulado de faltas', () => {
  assert.match(tela, /data\.faltas_por_usuario \|\| \{\}/);
  assert.match(tela, /Mas atenção!/);
  assert.match(tela, /Você possui:/);
  assert.match(tela, /\$\{numeroFaltas\} faltas/);
});
