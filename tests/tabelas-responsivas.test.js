const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('tabela de chamada usa apenas seu layout móvel específico', () => {
  for (const arquivo of [
    path.join(__dirname, '..', 'frontend', 'js', 'tabelas-responsivas.js'),
    path.join(__dirname, '..', 'Sistema para android', 'www', 'js', 'tabelas-responsivas.js')
  ]) {
    const codigo = fs.readFileSync(arquivo, 'utf8');
    assert.match(codigo, /tabela\.matches\('\.chamada-tabela'\)\) return/);
  }
});
