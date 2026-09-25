const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.resolve(__dirname, '..');
const ler = arquivo => fs.readFileSync(path.join(raiz, arquivo), 'utf8');

test('taxa padrão dos movimentos de casal é R$ 30 e aceita configuração', async () => {
  const { obterTaxasPorMovimento } = require('../backend/utils/precoTaxa');
  const padrao = await obterTaxasPorMovimento({ get: async () => undefined });
  assert.equal(padrao.ECC, 30);
  assert.equal(padrao['JOVENS EJC CASADOS'], 30);
  const configurado = await obterTaxasPorMovimento({
    get: async (_sql, [chave]) => chave === 'valor_taxa_casal' ? { valor: '42.50' } : undefined
  });
  assert.equal(configurado.ECC, 42.5);
  assert.equal(configurado['JOVENS EJC CASADOS'], 42.5);
  for (const arquivo of [
    'backend/routes/equipista.js',
    'backend/routes/coordenador.js',
    'backend/routes/dirigentes.js'
  ]) {
    const conteudo = ler(arquivo);
    assert.match(conteudo, /await obterTaxasPorMovimento\(database\)/);
    assert.doesNotMatch(conteudo, /ECC:\s*35/);
    assert.doesNotMatch(conteudo, /'JOVENS EJC CASADOS':\s*35/);
  }
});

test('taxa dos movimentos de casal é R$ 30 nas interfaces web e Android', () => {
  for (const arquivo of [
    'frontend/js/equipista.js',
    'Sistema para android/www/js/equipista.js'
  ]) {
    const conteudo = ler(arquivo);
    assert.match(conteudo, /ECC:\s*30/);
    assert.match(conteudo, /'JOVENS EJC CASADOS':\s*30/);
  }
});
