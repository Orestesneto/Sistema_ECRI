const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.join(__dirname, '..');
const ler = (arquivo) => fs.readFileSync(path.join(raiz, arquivo), 'utf8');

test('mapeia ECRI como criança, EC/EJC como jovem e casais como casal', async () => {
  const { obterTaxasPorMovimento } = require('../backend/utils/precoTaxa');
  const valores = { valor_taxa_crianca: '15', valor_taxa_jovem: '25', valor_taxa_casal: '30' };
  const database = { get: async (_sql, [chave]) => ({ valor: valores[chave] }) };
  const taxas = await obterTaxasPorMovimento(database);
  assert.equal(taxas.ECRI, 15);
  assert.equal(taxas.EC, 25);
  assert.equal(taxas.EJC, 25);
  assert.equal(taxas.ECC, 30);
  assert.equal(taxas['JOVENS EJC CASADOS'], 30);
});

test('tela dirigente possui os quatro campos de preço na web e aplicativo', () => {
  for (const arquivo of ['frontend/dirigentes.html', 'Sistema para android/www/dirigentes.html']) {
    const html = ler(arquivo);
    for (const id of ['valorCamisaDirigente', 'valorTaxaCriancaDirigente', 'valorTaxaJovemDirigente', 'valorTaxaCasalDirigente']) {
      assert.match(html, new RegExp(`id="${id}"`));
    }
  }
});

test('novas cobranças consultam os preços configurados', () => {
  assert.match(ler('backend/routes/equipista.js'), /await obterTaxasPorMovimento\(database\)/);
  assert.match(ler('backend/routes/coordenador.js'), /await obterTaxasPorMovimento\(database\)/);
});
