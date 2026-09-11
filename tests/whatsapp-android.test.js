const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function carregarMontador(userAgent) {
  const arquivo = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'js', 'coordenador.js'), 'utf8');
  const inicio = arquivo.indexOf('function montarUrlAberturaWhatsApp');
  const fim = arquivo.indexOf('\nfunction fecharJanelaWhatsAppPendente', inicio);
  const contexto = {
    navigator: { userAgent },
    window: { location: { href: 'https://sistema-ecri.vercel.app/frontend/coordenador.html' } },
    URL,
    URLSearchParams
  };
  vm.createContext(contexto);
  vm.runInContext(`${arquivo.slice(inicio, fim)}; resultado = montarUrlAberturaWhatsApp;`, contexto);
  return contexto.resultado;
}

test('Chrome Android recebe esquema direto do WhatsApp com telefone e mensagem', () => {
  const montar = carregarMontador('Mozilla/5.0 (Linux; Android 14) Chrome/140 Mobile');
  const url = montar('https://wa.me/5583991053113?text=Ol%C3%A1%20Jos%C3%A9');
  assert.match(url, /^whatsapp:\/\/send\?/);
  assert.match(url, /phone=5583991053113/);
  assert.match(url, /text=Ol%/);
  assert.doesNotMatch(url, /api\.whatsapp\.com|browser_fallback_url/);
});

test('navegador que não é Android mantém a URL web', () => {
  const montar = carregarMontador('Mozilla/5.0 (Windows NT 10.0) Chrome/140');
  const original = 'https://wa.me/5583991053113?text=Teste';
  assert.equal(montar(original), original);
});

test('compartilhamento sem telefone abre o seletor de conversas no Android', () => {
  const montar = carregarMontador('Mozilla/5.0 (Linux; Android 14) Chrome/140 Mobile');
  const url = montar('https://wa.me/?text=Reuni%C3%A3o%20amanh%C3%A3');
  assert.match(url, /^intent:\/\/send\?/);
  assert.doesNotMatch(url, /phone=/);
  assert.match(url, /text=Reuni/);
});

test('reunião usa compartilhamento nativo e nunca exibe mensagem vazia', () => {
  const arquivo = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'js', 'coordenador.js'), 'utf8');
  assert.equal((arquivo.match(/navigator\.share\s*\(/g) || []).length, 1);
  assert.match(arquivo, /navigator\.share\(\{ text: mensagem \|\| '' \}\)/);
  assert.match(arquivo, /montarMensagemReuniaoIndividualWhatsApp\(data_reuniao, horario_inicio, local\)/);
  assert.match(arquivo, /Dia:.*Hora:.*Local:/s);
});

test('compartilhamento genérico fica isolado no botão de reunião', () => {
  const coordenador = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'js', 'coordenador.js'), 'utf8');
  const dirigentes = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'js', 'dirigentes.js'), 'utf8');
  const inicio = coordenador.indexOf('function abrirCompartilhamentoWhatsApp');
  const fim = coordenador.indexOf("document.getElementById('formNovaReuniao')", inicio);
  const foraDoAgendamento = coordenador.slice(0, inicio) + coordenador.slice(fim);

  assert.doesNotMatch(foraDoAgendamento, /navigator\.share\s*\(/);
  assert.doesNotMatch(dirigentes, /navigator\.share\s*\(/);
  assert.match(coordenador, /wa\.me\/55\$\{telefone\}/);
  assert.match(dirigentes, /wa\.me\/55\$\{telefone\}/);
});

test('confirmação dispara a abertura no mesmo gesto, sem aguardar fetch', () => {
  const arquivo = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'js', 'coordenador.js'), 'utf8');
  const inicio = arquivo.indexOf('function enviarConfirmacaoWhatsApp');
  const fim = arquivo.indexOf('\nasync function gerarUrlAtualizacaoDesistenciaWhatsApp', inicio);
  const funcao = arquivo.slice(inicio, fim);

  assert.ok(inicio >= 0);
  assert.doesNotMatch(funcao, /await\s+fetch|async function/);
  assert.match(funcao, /usuario\.token_confirmacao/);
  assert.match(funcao, /abrirWhatsAppComJanela\(null,/);
});

test('dirigente prepara o link antes e abre o WhatsApp no clique, sem aba vazia', () => {
  const arquivo = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'js', 'dirigentes.js'), 'utf8');
  const inicio = arquivo.indexOf('function enviarLinkConfirmacaoParticipanteDirigente');
  const fim = arquivo.indexOf('\nfunction abrirModalDestinatarioConfirmacaoCasal', inicio);
  const funcao = arquivo.slice(inicio, fim);

  assert.ok(inicio >= 0);
  assert.match(arquivo, /await prepararLinkConfirmacaoParticipanteDirigente/);
  assert.match(arquivo, /botao\.disabled = true/);
  assert.doesNotMatch(funcao, /fetch\s*\(|abrirJanelaWhatsAppPendenteDirigente/);
  assert.match(funcao, /participante\?\.link_confirmacao_whatsapp/);
  assert.match(funcao, /abrirWhatsAppComJanelaDirigente\(null,/);
});

test('todos os botões de mensagem usam os abridores Android padronizados', () => {
  const coordenador = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'js', 'coordenador.js'), 'utf8');
  const dirigentes = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'js', 'dirigentes.js'), 'utf8');

  assert.doesNotMatch(coordenador, /window\.open\(url,\s*['_"]blank/);
  assert.doesNotMatch(coordenador, /<a[^>]+href=[^>]+item\.url[^>]*>Enviar WhatsApp/);
  assert.match(coordenador, /Escolher contato no WhatsApp/);
  assert.match(coordenador, /abrirWhatsAppComJanela\(null, `https:\/\/wa\.me\/\?text=/);
  assert.match(dirigentes, /function montarUrlAberturaWhatsAppDirigente/);
  assert.match(dirigentes, /intent:\/\/send/);
  assert.match(dirigentes, /abrirWhatsAppComJanelaDirigente\(null,/);
});
