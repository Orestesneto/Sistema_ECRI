const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.resolve(__dirname, '..');
const ler = arquivo => fs.readFileSync(path.join(raiz, arquivo), 'utf8');

test('modal de acompanhamento de taxas e camisas renderiza foto do usuário', () => {
  const script = ler('frontend/js/dirigentes.js');
  const inicio = script.indexOf('function renderizarFotoPequenaSituacao');
  const fim = script.indexOf('function renderizarBaixaSituacao', inicio);
  const funcao = script.slice(inicio, fim);

  assert.match(funcao, /item\?\.foto_perfil/);
  assert.match(funcao, /<img src=/);
  assert.match(funcao, /abrirModalFotoGrande/);
  assert.match(funcao, /tratarErroFotoDirigente/);
});

test('tabelas do coordenador usam as fotos retornadas pela API', () => {
  const script = ler('frontend/js/coordenador.js');
  assert.match(script, /const fotoHtml = renderizarFotoLazyCoordenador\(p, 40\)/);
  assert.match(script, /const fotoHtml = renderizarFotoLazyCoordenador\(b, 40\)/);
  assert.match(script, /observarFotosLazyCoordenador\(containerPagamentos\)/);
  assert.match(script, /observarFotosLazyCoordenador\(containerBlusas\)/);
});
