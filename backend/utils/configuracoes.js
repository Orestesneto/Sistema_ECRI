async function obterConfiguracao(database, chave, valorPadrao = '') {
  const registro = await database.get('SELECT valor FROM configuracoes WHERE chave = ?', [chave]);
  return registro ? registro.valor : valorPadrao;
}

async function salvarConfiguracao(database, chave, valor) {
  await database.run(
    `INSERT INTO configuracoes (chave, valor, data_atualizacao)
     VALUES (?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor, data_atualizacao = CURRENT_TIMESTAMP`,
    [chave, String(valor)]
  );
}

async function pedidosBlusaBloqueados(database) {
  return (await obterConfiguracao(database, 'parar_pedidos_blusa', 'false')) === 'true';
}

module.exports = {
  obterConfiguracao,
  salvarConfiguracao,
  pedidosBlusaBloqueados
};
