const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const codigo = fs.readFileSync(path.resolve(__dirname, '..', 'frontend', 'js', 'dirigentes.js'), 'utf8');

test('fotos do carografo tentam novamente e usam placeholder em falha definitiva', () => {
  assert.match(codigo, /onerror="tratarErroFotoDirigente\(this\)"/);
  assert.match(codigo, /function tratarErroFotoDirigente\(imagem\)/);
  assert.match(codigo, /imagem\.dataset\.tentativaFoto/);
  assert.match(codigo, /imagem\.replaceWith\(placeholder\)/);
});
