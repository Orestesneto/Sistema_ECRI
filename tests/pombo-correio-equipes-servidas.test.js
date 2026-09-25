const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.resolve(__dirname, '..');
const ler = caminho => fs.readFileSync(path.join(raiz, caminho), 'latin1');

test('Pombo Correio aparece nos formulários de experiência web', () => {
  for (const arquivo of ['frontend/index.html', 'frontend/confirmacao.html', 'frontend/confirmacao-desistencia.html']) {
    assert.match(ler(arquivo), /POMBO CORREIO \/ CORREIOS/);
    assert.match(ler(arquivo), /Pombo Correio \/ Correios/);
  }
  assert.match(ler('frontend/js/perfil-experiencia.js'), /POMBO CORREIO \/ CORREIOS/);
  assert.match(ler('frontend/js/desenvolvimento.js'), /Pombo Correio \/ Correios/);
});

test('Pombo Correio aparece nos formulários de experiência Android', () => {
  for (const arquivo of ['Sistema para android/www/index.html', 'Sistema para android/www/confirmacao.html', 'Sistema para android/www/confirmacao-desistencia.html']) {
    assert.match(ler(arquivo), /POMBO CORREIO \/ CORREIOS/);
    assert.match(ler(arquivo), /Pombo Correio \/ Correios/);
  }
  assert.match(ler('Sistema para android/www/js/perfil-experiencia.js'), /POMBO CORREIO \/ CORREIOS/);
  assert.match(ler('Sistema para android/www/js/desenvolvimento.js'), /Pombo Correio \/ Correios/);
});
