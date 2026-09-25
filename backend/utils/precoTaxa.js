const { obterConfiguracao } = require('./configuracoes');

const TAXAS_PADRAO = {
  crianca: 15,
  jovem: 25,
  casal: 30,
};

function normalizarPreco(valor, padrao) {
  const numero = Number(String(valor ?? '').trim().replace(',', '.'));
  return Number.isFinite(numero) && numero > 0 ? Math.round(numero * 100) / 100 : padrao;
}

async function obterPrecosTaxa(database) {
  return {
    crianca: normalizarPreco(await obterConfiguracao(database, 'valor_taxa_crianca', TAXAS_PADRAO.crianca), TAXAS_PADRAO.crianca),
    jovem: normalizarPreco(await obterConfiguracao(database, 'valor_taxa_jovem', TAXAS_PADRAO.jovem), TAXAS_PADRAO.jovem),
    casal: normalizarPreco(await obterConfiguracao(database, 'valor_taxa_casal', TAXAS_PADRAO.casal), TAXAS_PADRAO.casal)
  };
}

async function obterTaxasPorMovimento(database) {
  const precos = await obterPrecosTaxa(database);
  return {
    EC: precos.jovem,
    EJC: precos.jovem,
    ECC: precos.casal,
    'JOVENS EJC CASADOS': precos.casal,
    ECRI: precos.crianca
  };
}

module.exports = { TAXAS_PADRAO, normalizarPreco, obterPrecosTaxa, obterTaxasPorMovimento };
