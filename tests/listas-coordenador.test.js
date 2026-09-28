const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const script = fs.readFileSync(path.join(__dirname, '../frontend/js/coordenador.js'), 'utf8');
const contexto = vm.createContext({});
vm.runInContext(script.slice(script.indexOf('function alinharRegistrosComParticipantes('), script.indexOf('async function carregarPagamentos(')), contexto);
const alinhar = (...args) => JSON.parse(JSON.stringify(contexto.alinharRegistrosComParticipantes(...args)));
const participantes = [
    { id: 1, tipo_cadastro: 'usuario', nome_completo: 'Ana', status: 'confirmado', foto_perfil: '/foto/usuario/1' },
    { id: 1, tipo_cadastro: 'externo', nome_completo: 'Bia', status: 'pendente', foto_perfil: '/foto/externo/1' },
    { id: 2, tipo_cadastro: 'usuario', nome_completo: 'Caio', status: 'pendente' }
];

test('pagamentos seguem todos os participantes e a ordem de confirmações, sem misturar IDs externos', () => {
    const linhas = alinhar(participantes, [
        { id: 42, usuario_id: 1, valor: 35, status: 'confirmado' },
        { id: 43, usuario_id: 99, valor: 100, status: 'pendente' }
    ], 'sem_pagamento');
    assert.deepEqual(linhas.map(p => p.nome_completo), ['Ana', 'Bia', 'Caio']);
    assert.equal(linhas[0].id, 42);
    assert.equal(linhas[0].valor, 35);
    assert.equal(linhas[1].id, null);
    assert.equal(linhas[1].usuario_id, -1);
    assert.equal(linhas[1].foto_perfil, '/foto/externo/1');
    assert.equal(linhas[2].status, 'sem_pagamento');
    assert.equal(linhas.reduce((total, p) => total + Number(p.valor || 0), 0), 35);
});

test('blusas preservam vários pedidos da mesma pessoa e incluem participantes sem pedido', () => {
    const linhas = alinhar(participantes, [
        { id: 20, usuario_id: 1, tamanho: 'P', valor: 35, status: 'confirmado' },
        { id: 21, usuario_id: 1, tamanho: 'M', valor: 35, status: 'pendente' }
    ], 'sem_solicitacao');
    assert.deepEqual(linhas.map(p => p.id), [20, 21, null, null]);
    assert.deepEqual(linhas.map(p => p.nome_completo), ['Ana', 'Ana', 'Bia', 'Caio']);
    assert.equal(linhas[3].status_participacao, 'pendente');
    assert.deepEqual(alinhar([], linhas, 'sem_solicitacao'), []);
});

test('participantes sem cadastro ou confirmação não recebem ação inválida de adicionar blusa', () => {
    vm.runInContext(script.slice(script.indexOf('function renderizarAcoesBlusa('), script.indexOf('function renderizarResumoBlusas(')), contexto);
    assert.match(contexto.renderizarAcoesBlusa({ tipo_cadastro: 'externo' }, false, false), /Aguardando cadastro/);
    assert.match(contexto.renderizarAcoesBlusa({ tipo_cadastro: 'usuario', status_participacao: 'pendente' }, false, false), /Aguardando confirmação/);
});
