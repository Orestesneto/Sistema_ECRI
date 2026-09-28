const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
process.env.DATABASE = ':memory:';
delete process.env.DATABASE_URL;
process.env.SKIP_DB_SEED = '1';
process.env.JWT_SECRET = 'segredo-apenas-para-teste-local';
const express = require('express');
const jwt = require('jsonwebtoken');
const database = require('../backend/config/database');
const { transferirFinanceiroExterno } = require('../backend/utils/financeiroExternos');
let servidor, base, coordenador, outroCoordenador, externo, foraEquipe, usuario;
const inserirUsuario = async (nome, equipe, perfil = 'coordenador') => (await database.run(`INSERT INTO usuarios
  (email, senha, nome_completo, nome_cracha, telefone, movimento_origem, equipe, perfil, status)
  VALUES (?, 'teste', ?, ?, '83999999999', 'ECC', ?, ?, 'confirmado')`, [`${nome}@teste.local`, nome, nome, equipe, perfil])).lastID;
const inserirExterno = async (nome, equipe) => (await database.run(`INSERT INTO pessoas_externas
  (nome_completo, nome_cracha, telefone, movimento_origem, equipe, status, criado_por) VALUES (?, ?, '83999999999', 'ECC', ?, 'pendente', ?)`, [nome, nome, equipe, coordenador])).lastID;
const api = async (caminho, metodo = 'GET', dados, ator = coordenador, perfil = 'coordenador') => {
  const token = jwt.sign({ id: ator, perfil }, process.env.JWT_SECRET);
  const res = await fetch(`${base}${caminho}`, { method: metodo,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: dados ? JSON.stringify(dados) : undefined });
  return { status: res.status, data: await res.json() };
};

before(async () => {
  await database.initDb();
  await database.run('PRAGMA foreign_keys = ON');
  coordenador = await inserirUsuario('Coordenador', 'Escrita');
  outroCoordenador = await inserirUsuario('Outro', 'Missa e Oracao');
  usuario = await inserirUsuario('Cadastrado', 'Escrita', 'equipista');
  externo = await inserirExterno('Sem cadastro', 'Escrita');
  foraEquipe = await inserirExterno('Outra equipe', 'Missa e Oracao');
  await database.run("INSERT INTO configuracoes (chave, valor) VALUES ('valor_blusa_unica', '40'), ('valor_blusa_multipla', '37'), ('valor_taxa_casal', '32')");
  const app = express();
  app.use(express.json());
  app.use('/api/coordenador', require('../backend/routes/coordenador'));
  app.use('/api/dirigentes', require('../backend/routes/dirigentes'));
  servidor = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  base = `http://127.0.0.1:${servidor.address().port}/api/coordenador`;
});
after(async () => {
  if (servidor) { servidor.closeAllConnections(); await new Promise(resolve => servidor.close(resolve)); }
  await new Promise((resolve, reject) => database.db.close(err => err ? reject(err) : resolve()));
});

test('externo pendente recebe taxa configurada, sem duplicação, e coordenador confirma a baixa', async () => {
  const lista = await api('/pagamentos-pendentes');
  assert.equal(lista.status, 200);
  const pagamento = lista.data.pagamentos.find(p => p.tipo_cadastro === 'externo');
  assert.equal(pagamento.usuario_id, externo);
  assert.ok(pagamento.id < 0);
  assert.equal(pagamento.valor, 32);
  assert.equal(pagamento.status, 'pendente');
  await api('/pagamentos-pendentes');
  assert.equal((await database.get('SELECT COUNT(*) AS total FROM pagamentos_externos')).total, 1);
  assert.equal((await api(`/confirmar-pagamento/${pagamento.id}`, 'PUT', { forma_pagamento: 'cartao' })).status, 400);
  assert.equal((await api(`/confirmar-pagamento/${pagamento.id}`, 'PUT', { forma_pagamento: 'pix' }, outroCoordenador)).status, 403);
  assert.equal((await api(`/confirmar-pagamento/${pagamento.id}`, 'PUT', { forma_pagamento: 'pix' })).status, 200);
  const confirmado = (await api('/pagamentos-pendentes')).data.pagamentos.find(p => p.id === pagamento.id);
  assert.equal(confirmado.status, 'confirmado');
  assert.equal(confirmado.confirmado_por, coordenador);
  assert.equal(confirmado.confirmado_por_nome, 'Coordenador');
  assert.ok(confirmado.data_confirmacao);
  assert.equal((await api(`/confirmar-pagamento/${pagamento.id}`, 'PUT', { forma_pagamento: 'dinheiro' })).status, 200);
  assert.equal((await database.get('SELECT forma_pagamento FROM pagamentos_externos WHERE id = ?', [-pagamento.id])).forma_pagamento, 'pix');
});

test('coordenador adiciona, altera, confirma e exclui camisas externas respeitando preços e equipe', async () => {
  assert.equal((await api(`/solicitacoes-blusa/-${foraEquipe}`, 'POST', { tamanho: 'P Unisex' })).status, 403);
  assert.equal((await api(`/solicitacoes-blusa/-${externo}`, 'POST', { tamanho: 'invalido' })).status, 400);
  assert.equal((await api(`/solicitacoes-blusa/-${externo}`, 'POST', { tamanho: 'P Unisex' }, usuario, 'equipista')).status, 403);
  const primeiro = await api(`/solicitacoes-blusa/-${externo}`, 'POST', { tamanho: 'P Unisex' });
  assert.equal(primeiro.status, 201);
  const segundo = await api(`/solicitacoes-blusa/-${externo}`, 'POST', { tamanho: 'M Unisex' });
  assert.equal(segundo.status, 201);
  const lista = (await api('/solicitacoes-blusa')).data.filter(b => b.tipo_cadastro === 'externo');
  assert.equal(lista.length, 2);
  assert.ok(lista.every(b => b.valor === 37 && b.id < 0));
  assert.equal((await api(`/solicitacoes-blusa/${primeiro.data.id}/tamanho`, 'PUT', { tamanho: 'G Unisex' })).status, 200);
  assert.equal((await api(`/confirmar-blusa/${primeiro.data.id}`, 'PUT', { forma_pagamento: 'dinheiro' })).status, 200);
  assert.equal((await api(`/solicitacoes-blusa/${primeiro.data.id}`, 'DELETE')).status, 400);
  assert.equal((await api(`/solicitacoes-blusa/${segundo.data.id}`, 'DELETE')).status, 200);
  const paga = await database.get('SELECT * FROM solicitacoes_blusa_externos WHERE id = ?', [-primeiro.data.id]);
  assert.equal(paga.tamanho, 'G Unisex');
  assert.equal(paga.valor, 37);
  assert.equal(paga.confirmado_por, coordenador);
  assert.equal((await api(`/solicitacoes-blusa/${usuario}`, 'POST', { tamanho: 'P Unisex' })).status, 201);
});

test('bloqueio de pedidos também vale para pessoas sem cadastro', async () => {
  await database.run("INSERT INTO configuracoes (chave, valor) VALUES ('parar_pedidos_blusa', 'true')");
  assert.equal((await api(`/solicitacoes-blusa/-${externo}`, 'POST', { tamanho: 'P Unisex' })).status, 403);
  await database.run("UPDATE configuracoes SET valor = 'false' WHERE chave = 'parar_pedidos_blusa'");
});

test('acompanhamento do dirigente mostra baixas externas e permite desfazê-las sem atingir cadastrados', async () => {
  const token = jwt.sign({ id: outroCoordenador, perfil: 'equipe_dirigente' }, process.env.JWT_SECRET);
  const url = base.replace('/coordenador', '/dirigentes');
  const response = await fetch(`${url}/situacao`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(response.status, 200);
  const situacao = await response.json();
  assert.match(JSON.stringify(situacao), /Sem cadastro/);
  const pagamento = await database.get('SELECT * FROM pagamentos_externos WHERE pessoa_externa_id = ?', [externo]);
  const desfazer = await fetch(`${url}/pagamentos/-${pagamento.id}/desfazer-baixa`, {
    method: 'PUT', headers: { Authorization: `Bearer ${token}` }
  });
  assert.equal(desfazer.status, 200);
  assert.equal((await database.get('SELECT status FROM pagamentos_externos WHERE id = ?', [pagamento.id])).status, 'pendente');
  assert.equal((await api(`/confirmar-pagamento/-${pagamento.id}`, 'PUT', { forma_pagamento: 'pix' })).status, 200);
});

test('cadastro posterior transfere pagamentos e camisas sem perder valores ou duplicar registros', async () => {
  const novo = await inserirUsuario('Novo cadastro', 'Escrita', 'equipista');
  await transferirFinanceiroExterno(database, externo, novo);
  await transferirFinanceiroExterno(database, externo, novo);
  const pagamentos = await database.all('SELECT * FROM pagamentos WHERE usuario_id = ?', [novo]);
  const camisas = await database.all('SELECT * FROM solicitacoes_blusa WHERE usuario_id = ?', [novo]);
  assert.equal(pagamentos.length, 1);
  assert.equal(pagamentos[0].valor, 32);
  assert.equal(pagamentos[0].status, 'confirmado');
  assert.equal(pagamentos[0].confirmado_por, coordenador);
  assert.equal(camisas.length, 1);
  assert.equal(camisas[0].valor, 37);
  assert.equal(camisas[0].tamanho, 'G Unisex');
  assert.equal(camisas[0].status, 'confirmado');
  await database.run('DELETE FROM pessoas_externas WHERE id = ?', [externo]);
});
