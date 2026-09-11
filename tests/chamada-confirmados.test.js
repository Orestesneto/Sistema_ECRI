const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.resolve(__dirname, '..');
const rota = fs.readFileSync(path.join(raiz, 'backend', 'routes', 'coordenador.js'), 'utf8');

test('chamada lista somente usuarios confirmados da equipe', () => {
  const inicio = rota.indexOf("router.get('/reunioes/:id/presencas'");
  const fim = rota.indexOf("router.put('/reunioes/:id/presencas'", inicio);
  const trecho = rota.slice(inicio, fim);

  assert.match(trecho, /WHERE u\.equipe = \?\s+AND u\.status = 'confirmado'/);
  assert.match(trecho, /FROM pessoas_externas pe/);
  assert.match(trecho, /AND pe\.status = 'confirmado'/);
  assert.match(trecho, /id: -Number\(externo\.id\)/);
});

test('salvamento da chamada aceita somente usuarios confirmados da equipe', () => {
  const inicio = rota.indexOf("router.put('/reunioes/:id/presencas'");
  const fim = rota.indexOf("router.post('/reunioes/:id/mensagens-chamada", inicio);
  const trecho = rota.slice(inicio, fim);

  assert.match(trecho, /externo \? 'pessoas_externas' : 'usuarios'/);
  assert.match(trecho, /externo \? 'presencas_reuniao_externos' : 'presencas_reuniao'/);
});

test('banco cria estruturas de chamada para participantes sem cadastro', () => {
  const banco = fs.readFileSync(path.join(raiz, 'backend', 'config', 'database.js'), 'utf8');
  assert.match(banco, /CREATE TABLE IF NOT EXISTS presencas_reuniao_externos/);
  assert.match(banco, /CREATE TABLE IF NOT EXISTS mensagens_chamada_externos_enviadas/);
});
