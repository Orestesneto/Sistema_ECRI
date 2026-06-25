const { apenasNumeros } = require('./cpf');
const { normalizarMovimentoOrigem } = require('./movimentoOrigem');

function duplicidadePermitidaPorMovimento(movimentoA, movimentoB) {
  const movimentos = [normalizarMovimentoOrigem(movimentoA), normalizarMovimentoOrigem(movimentoB)].sort();
  return movimentos[0] === 'ECC' && movimentos[1] === 'ECRI';
}

async function validarTelefoneUnico(database, telefone, movimentoOrigem, opcoes = {}) {
  const telefoneNumeros = apenasNumeros(telefone);
  const movimentoNovo = normalizarMovimentoOrigem(movimentoOrigem);

  if (!telefoneNumeros) {
    return { valido: false, erro: 'Telefone inválido' };
  }

  const usuarios = await database.all(`
    SELECT id, nome_completo, telefone, movimento_origem, 'usuario' AS tipo
    FROM usuarios
  `);
  const externos = await database.all(`
    SELECT id, nome_completo, telefone, movimento_origem, 'externo' AS tipo
    FROM pessoas_externas
  `);

  const conflitos = [...usuarios, ...externos].filter((registro) => {
    if (registro.tipo === 'usuario' && Number(opcoes.ignorarUsuarioId) === Number(registro.id)) {
      return false;
    }

    if (registro.tipo === 'externo' && Number(opcoes.ignorarPessoaExternaId) === Number(registro.id)) {
      return false;
    }

    return apenasNumeros(registro.telefone) === telefoneNumeros;
  });

  if (!conflitos.length) {
    return { valido: true };
  }

  const conflitoBloqueado = conflitos.find((registro) => (
    !duplicidadePermitidaPorMovimento(movimentoNovo, registro.movimento_origem)
  ));

  if (conflitoBloqueado) {
    return {
      valido: false,
      erro: `Telefone já cadastrado para ${conflitoBloqueado.nome_completo || 'outro usuario'}`
    };
  }

  return { valido: true };
}

module.exports = {
  validarTelefoneUnico
};
