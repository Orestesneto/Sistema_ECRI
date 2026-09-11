const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.resolve(__dirname, '..');
const rota = fs.readFileSync(path.join(raiz, 'backend', 'routes', 'coordenador.js'), 'utf8');
const frontend = fs.readFileSync(path.join(raiz, 'frontend', 'js', 'coordenador.js'), 'utf8');
const android = fs.readFileSync(path.join(raiz, 'Sistema para android', 'www', 'js', 'coordenador.js'), 'utf8');
const htmlFrontend = fs.readFileSync(path.join(raiz, 'frontend', 'coordenador.html'), 'utf8');
const htmlAndroid = fs.readFileSync(path.join(raiz, 'Sistema para android', 'www', 'coordenador.html'), 'utf8');

test('endpoint retorna somente usuarios que informaram restricao alimentar', () => {
  assert.match(rota, /restricao_alimentar IS NOT NULL/);
  assert.match(rota, /TRIM\(restricao_alimentar\) <> ''/);
  assert.match(rota, /LOWER\(TRIM\(restricao_alimentar\)\) NOT IN/);
});

test('interfaces web e Android descartam respostas sem restricao alimentar', () => {
  for (const codigo of [frontend, android]) {
    assert.match(codigo, /usuarios\.filter\(usuario => possuiRestricaoAlimentar\(usuario\.restricao_alimentar\)\)/);
    assert.match(codigo, /function possuiRestricaoAlimentar\(restricao\)/);
  }
});

test('listagem web exibe a foto de perfil quando ela estiver disponível', () => {
  assert.match(frontend, /renderizarFotoLazyCoordenador\(usuario, 46\)/);
  assert.match(frontend, /observarFotosLazyCoordenador\(container\)/);
});

test('foto da restricao pode ser ampliada em um modal no web e Android', () => {
  for (const codigo of [frontend, android]) {
    assert.match(codigo, /onclick="abrirFotoRestricao\(/);
    assert.match(codigo, /function abrirFotoRestricao\(usuarioId\)/);
    assert.match(codigo, /bootstrap\.Modal\.getOrCreateInstance\(modalEl\)\.show\(\)/);
  }
  for (const html of [htmlFrontend, htmlAndroid]) {
    assert.match(html, /id="modalFotoRestricao"/);
    assert.match(html, /id="imagemFotoRestricao"/);
  }
});

test('cada coordenador possui aba com restricoes apenas da propria equipe', () => {
  assert.match(rota, /router\.get\('\/restricoes-medicas'/);
  assert.match(rota, /const equipeCoordenador = normalizarEquipe\(coordenador\?\.equipe \|\| ''\)/);
  assert.match(rota, /UPPER\(TRIM\(equipe\)\) = UPPER\(TRIM\(\?\)\)/);
  assert.match(rota, /`, \[equipeCoordenador\]\)/);
  assert.match(rota, /restricao_medica IS NOT NULL/);
  assert.match(rota, /restricao_medicacao IS NOT NULL/);
  assert.match(rota, /restricao_alimentar IS NOT NULL/);

  for (const codigo of [frontend, android]) {
    assert.match(codigo, /function configurarAbaRestricoesMedicas\(equipe\)/);
    assert.match(codigo, /equipeNormalizada !== 'SEM EQUIPE'/);
    assert.match(codigo, /\/coordenador\/restricoes-medicas/);
    assert.match(codigo, /function renderizarRestricoesMedicas\(\)/);
    assert.match(codigo, /usuario\.restricao_alimentar/);
    assert.match(codigo, /<th>Restrição alimentar<\/th>/);
  }

  for (const html of [htmlFrontend, htmlAndroid]) {
    assert.match(html, /id="abaRestricoesMedicas"/);
    assert.match(html, /href="#restricoesMedicas">Restrições alimentar e médica</);
    assert.match(html, /id="tabelaRestricoesMedicas"/);
    assert.match(html, /id="abaRestricaoAlimentar"/);
    assert.match(html, /id="abaRestricoesMedicasGerais"/);
  }
});

test('Ranguinho e Boa Acao mantêm visoes gerais de todas as equipes', () => {
  assert.match(rota, /router\.get\('\/restricoes-medicas-gerais'/);
  assert.match(rota, /Acesso permitido apenas ao coordenador da Boa Ação/);
  assert.match(rota, /UPPER\(TRIM\(equipe\)\) <> 'SEM EQUIPE'/);

  for (const codigo of [frontend, android]) {
    assert.match(codigo, /configurarAbaRestricaoAlimentar\(usuario\.equipe\)/);
    assert.match(codigo, /function configurarAbaRestricoesMedicasGerais\(equipe\)/);
    assert.match(codigo, /normalizarTextoFiltroCoordenador\(equipe\) === 'BOA ACAO'/);
    assert.match(codigo, /\/coordenador\/restricoes-medicas-gerais/);
  }
});
