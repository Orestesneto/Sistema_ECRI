const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.resolve(__dirname, '..');
const rota = fs.readFileSync(path.join(raiz, 'backend', 'routes', 'coordenador.js'), 'utf8');
const tela = fs.readFileSync(path.join(raiz, 'frontend', 'js', 'coordenador.js'), 'utf8');
const rotaDirigentes = fs.readFileSync(path.join(raiz, 'backend', 'routes', 'dirigentes.js'), 'utf8');
const telaDirigentes = fs.readFileSync(path.join(raiz, 'frontend', 'js', 'dirigentes.js'), 'utf8');

test('API de pagamentos identifica o usuario da baixa manual', () => {
  assert.match(rota, /confirmador\.nome_completo AS confirmado_por_nome/);
  assert.match(rota, /LEFT JOIN usuarios confirmador ON confirmador\.id = p\.confirmado_por/);
  assert.match(rota, /origem_confirmacao:[\s\S]*?'manual'[\s\S]*?'mercado_pago'/);
});

test('tabela evidencia baixa manual ou via Mercado Pago', () => {
  assert.match(tela, /formatarBaixaPagamentoCoordenador\(p\)/);
  assert.match(tela, /Baixa manual/);
  assert.match(tela, /Mercado Pago/);
  assert.match(tela, /confirmado_por_nome/);
});

test('modais da equipe dirigente identificam a origem e o responsavel pela baixa', () => {
  assert.match(rotaDirigentes, /confirmador\.nome_completo AS confirmado_por_nome/);
  assert.match(rotaDirigentes, /LEFT JOIN usuarios confirmador ON confirmador\.id = p\.confirmado_por/);
  assert.match(rotaDirigentes, /origem_confirmacao:[\s\S]*?'manual'[\s\S]*?'mercado_pago'/);
  assert.match(telaDirigentes, /Baixa manual/);
  assert.match(telaDirigentes, /Mercado Pago/);
  assert.match(telaDirigentes, /renderizarBaixaSituacao\(p/);
  assert.match(telaDirigentes, /renderizarBaixaSituacao\(b/);
});

test('dirigente pode desfazer somente baixas manuais', () => {
  assert.match(rotaDirigentes, /pagamentos\/:pagamento_id\/desfazer-baixa/);
  assert.match(rotaDirigentes, /camisas\/:solicitacao_id\/desfazer-baixa/);
  assert.match(rotaDirigentes, /status !== 'confirmado' \|\| !pagamento\.confirmado_por/);
  assert.match(rotaDirigentes, /status !== 'confirmado' \|\| !solicitacao\.confirmado_por/);
  assert.match(telaDirigentes, /Desfazer baixa manual/);
  assert.match(telaDirigentes, /desfazerBaixaManualSituacao/);
});
