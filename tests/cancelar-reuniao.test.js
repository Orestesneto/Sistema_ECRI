const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.resolve(__dirname, '..');
const js = fs.readFileSync(path.join(raiz, 'frontend', 'js', 'coordenador.js'), 'utf8');
const rota = fs.readFileSync(path.join(raiz, 'backend', 'routes', 'coordenador.js'), 'utf8');

test('cancelamento de reuniao usa clique delegado e confirmacao visual', () => {
  assert.match(js, /btn-cancelar-reuniao/);
  assert.match(js, /abrirConfirmacaoCancelarReuniao/);
  assert.match(js, /btn-confirmar-cancelamento-reuniao/);
  assert.match(js, /method: 'DELETE'/);
  assert.match(js, /data\.erro \|\| 'Erro ao cancelar reunião'/);
});

test('API remove dependencias antes de excluir a reuniao', () => {
  const inicio = rota.indexOf("router.delete('/reunioes/:id'");
  const trecho = rota.slice(inicio, rota.indexOf('module.exports', inicio));
  const mensagens = trecho.indexOf('DELETE FROM mensagens_chamada_enviadas');
  const presencas = trecho.indexOf('DELETE FROM presencas_reuniao');
  const reuniao = trecho.indexOf('DELETE FROM reunioes');
  assert.ok(mensagens >= 0 && presencas > mensagens && reuniao > presencas);
  assert.match(trecho, /reuniao_cancelada/);
});
