const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(raiz, 'frontend', 'coordenador.html'), 'utf8');
const js = fs.readFileSync(path.join(raiz, 'frontend', 'js', 'coordenador.js'), 'utf8');
const rotaEquipista = fs.readFileSync(path.join(raiz, 'backend', 'routes', 'equipista.js'), 'utf8');

test('coordenador ECRI visualiza somente as cinco abas permitidas', () => {
  assert.match(js, /function configurarAcessoCoordenadorEcri/);
  for (const aba of ['#meuPerfil', '#pagamentoProprio', '#solicitarMinhaBlusa', '#confirmacoes', '#reunioes']) {
    assert.ok(js.includes(aba), `Aba permitida ausente: ${aba}`);
  }
  assert.match(js, /item\.style\.display = 'none'/);
});

test('coordenador ECRI pode solicitar a propria blusa', () => {
  assert.match(html, /href="#solicitarMinhaBlusa">Solicitar minha blusa/);
  assert.match(html, /id="formSolicitarMinhaBlusa"/);
  assert.match(js, /formSolicitarMinhaBlusa/);
  assert.match(js, /\/equipista\/solicitar-blusa/);
  assert.match(rotaEquipista, /verificarPerfil\(\['equipista', 'coordenador'\]\)/);
  assert.match(rotaEquipista, /normalizarMovimentoOrigem\(usuario\.movimento_origem\) !== 'ECRI'/);
});
