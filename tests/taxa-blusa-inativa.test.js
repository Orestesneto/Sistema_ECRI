const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.join(__dirname, '..');
const ler = (arquivo) => fs.readFileSync(path.join(raiz, arquivo), 'utf8');

test('opção Taxa + Blusa não aparece na web nem no aplicativo', () => {
  for (const arquivo of ['frontend/equipista.html', 'Sistema para android/www/equipista.html']) {
    const conteudo = ler(arquivo);
    assert.doesNotMatch(conteudo, /tipoPagamentoTaxaBlusa/);
    assert.doesNotMatch(conteudo, /Taxa \+ Blusa/);
  }
});

test('frontends não calculam nem selecionam pagamento combinado', () => {
  for (const arquivo of ['frontend/js/equipista.js', 'Sistema para android/www/js/equipista.js']) {
    const conteudo = ler(arquivo);
    assert.doesNotMatch(conteudo, /tipo === ['"]taxa_blusa['"]/);
    assert.doesNotMatch(conteudo, /radioTaxaBlusa/);
  }
});

test('API rejeita novas cobranças combinadas e ignora webhook das canceladas', () => {
  const rota = ler('backend/routes/equipista.js');
  assert.match(rota, /if \(tipo === 'taxa_blusa'\)[\s\S]*Taxa e blusa devem ser pagas separadamente/);
  assert.match(rota, /pagamentoLocal\.tipo === 'taxa_blusa' && pagamentoLocal\.status === 'cancelado'/);
});
