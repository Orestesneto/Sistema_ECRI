const { apenasNumeros } = require('./cpf');
const { normalizarMovimentoOrigem } = require('./movimentoOrigem');

function duplicidadePermitidaPorMovimento(movimentoA, movimentoB) {
  const movimentos = [normalizarMovimentoOrigem(movimentoA), normalizarMovimentoOrigem(movimentoB)].sort();
  return movimentos[0] === 'ECC' && movimentos[1] === 'ECRI';
}

function normalizarTelefoneCelular(valor) {
  const telefone = apenasNumeros(valor);

  if (telefone.startsWith('9')) {
    return telefone;
  }

  if (telefone.length === 10) {
    return `${telefone.slice(0, 2)}9${telefone.slice(2)}`;
  }

  return telefone;
}

function extrairTelefonesContato(valor) {
  const texto = String(valor || '');
  const esposa = texto.match(/Esposa:\s*([^|]+)/i)?.[1]?.trim();
  const marido = texto.match(/Marido:\s*(.+)$/i)?.[1]?.trim();

  if (esposa || marido) {
    return [esposa, marido].filter(Boolean);
  }

  return [texto];
}

function normalizarCampoTelefoneContato(valor) {
  const texto = String(valor || '');
  const esposa = texto.match(/Esposa:\s*([^|]+)/i)?.[1]?.trim();
  const marido = texto.match(/Marido:\s*(.+)$/i)?.[1]?.trim();

  if (esposa || marido) {
    return `Esposa: ${normalizarTelefoneCelular(esposa)} | Marido: ${normalizarTelefoneCelular(marido)}`;
  }

  return normalizarTelefoneCelular(texto);
}

async function validarTelefoneUnico(database, telefone, movimentoOrigem, opcoes = {}) {
  const telefonesNumeros = extrairTelefonesContato(telefone).map(normalizarTelefoneCelular);
  const movimentoNovo = normalizarMovimentoOrigem(movimentoOrigem);

  for (const telefoneNumeros of telefonesNumeros) {
    if (telefoneNumeros.startsWith('9')) {
      return { valido: false, erro: 'Faltou o DDD' };
    }

    if (telefoneNumeros.length !== 11) {
      return { valido: false, erro: 'Informe o telefone com DDD e 9 dígitos. Exemplo: 83999999999' };
    }
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

    const telefonesRegistro = extrairTelefonesContato(registro.telefone).map(normalizarTelefoneCelular);
    return telefonesRegistro.some((telefoneRegistro) => telefonesNumeros.includes(telefoneRegistro));
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
  validarTelefoneUnico,
  normalizarTelefoneCelular,
  normalizarCampoTelefoneContato
};
