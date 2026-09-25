const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.resolve(__dirname, '..');
const ler = arquivo => fs.readFileSync(path.join(raiz, arquivo), 'utf8');

test('coordenador recebe apenas uma cobrança de taxa por participante', () => {
  const rota = ler('backend/routes/coordenador.js');
  const inicio = rota.indexOf("router.get('/pagamentos-pendentes'");
  const fim = rota.indexOf('// ===== ROTAS DE', inicio);
  const endpoint = rota.slice(inicio, fim);

  assert.match(endpoint, /LEFT JOIN pagamentos p ON p\.id = \(/);
  assert.match(endpoint, /p2\.tipo IN \('taxa', 'taxa_blusa'\)/);
  assert.match(endpoint, /WHEN p2\.status = 'pendente' THEN 0/);
  assert.match(endpoint, /CASE WHEN p2\.tipo = 'taxa_blusa' THEN 0 ELSE 1 END/);
  assert.match(endpoint, /LIMIT 1/);
});

test('taxa e taxa_blusa pertencem ao mesmo grupo de cobrança ativa', () => {
  const rota = ler('backend/routes/equipista.js');
  assert.match(rota, /tipo IN \('taxa', 'taxa_blusa'\) AND status IN \('pendente', 'confirmado'\)/);
  assert.match(rota, /cobrancaExistenteAbrangePedido/);
  assert.match(rota, /pagamentoExistente\.tipo === 'taxa_blusa'/);
});
