const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.resolve(__dirname, '..');
const ler = caminho => fs.readFileSync(path.join(raiz, caminho), 'utf8');

test('configuração de dirigentes persiste o bloqueio de novos cadastros', () => {
  const rota = ler('backend/routes/dirigentes.js');
  const tela = ler('frontend/dirigentes.html');
  const script = ler('frontend/js/dirigentes.js');

  assert.match(rota, /parar_novos_cadastros/);
  assert.match(tela, /Parar de receber novos cadastros/);
  assert.match(script, /parar_novos_cadastros/);
});

test('tela de credenciais oculta registro e servidor recusa cadastro bloqueado', () => {
  const rota = ler('backend/routes/auth.js');
  const script = ler('frontend/js/auth.js');

  assert.match(rota, /router\.get\('\/configuracoes-publicas'/);
  assert.match(rota, /novosCadastrosBloqueados[\s\S]*?status\(403\)/);
  assert.match(script, /a\[href="#registro"\][\s\S]*?classList\.add\('d-none'\)/);
});

test('versão Android acompanha o bloqueio de novos cadastros', () => {
  assert.match(ler('Sistema para android/www/dirigentes.html'), /Parar de receber novos cadastros/);
  assert.match(ler('Sistema para android/www/js/dirigentes.js'), /parar_novos_cadastros/);
  assert.match(ler('Sistema para android/www/js/auth.js'), /configuracoes-publicas/);
});
