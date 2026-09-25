const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const ler = caminho => fs.readFileSync(caminho, 'utf8');

test('dirigentes podem interromper pagamentos do Mercado Pago', () => {
  const rota = ler('backend/routes/dirigentes.js');
  const tela = ler('frontend/dirigentes.html');
  const script = ler('frontend/js/dirigentes.js');

  assert.match(tela, /Parar de receber pagamentos/);
  assert.match(script, /parar_pagamentos_mercado_pago/);
  assert.match(rota, /salvarConfiguracao\(database, 'parar_pagamentos_mercado_pago'/);
});

test('API impede novas cobrancas no Mercado Pago quando bloqueada', () => {
  const rota = ler('backend/routes/equipista.js');
  const configuracoes = ler('backend/utils/configuracoes.js');

  assert.match(configuracoes, /async function pagamentosMercadoPagoBloqueados/);
  assert.match(rota, /if \(await pagamentosMercadoPagoBloqueados\(database\)\)/);
  assert.match(rota, /status\(403\)/);
});

test('bloqueio aparece nas interfaces web e Android', () => {
  for (const caminho of [
    'frontend/js/equipista.js',
    'frontend/js/coordenador.js',
    'Sistema para android/www/js/equipista.js',
    'Sistema para android/www/js/coordenador.js'
  ]) {
    assert.match(ler(caminho), /pagamentosMercadoPagoBloqueados/);
  }
  assert.match(ler('Sistema para android/www/dirigentes.html'), /Parar de receber pagamentos/);
});
