const EQUIPES = [
  'SEM EQUIPE',
  'Animadores',
  'Anjos da Alegria',
  'Anjos da Guarda',
  'Arco Iris',
  'Bandinha',
  'Boa Acao',
  'Coordenacao Geral',
  'ECRI SHOP',
  'Escrita',
  'Missa e Oracao',
  'Papa Lanche',
  'Pombo Correio',
  'Ranguinho',
  'Som e Iluminacao',
  'Teatrinho',
  'Vassourinha'
];

function normalizarEquipe(equipe) {
  if (typeof equipe !== 'string') {
    return '';
  }

  const equipeNormalizada = equipe.trim();
  const equipeComparacao = normalizarTextoComparacaoEquipe(equipeNormalizada);
  return EQUIPES.find(item => normalizarTextoComparacaoEquipe(item) === equipeComparacao) || equipeNormalizada;
}

function normalizarTextoComparacaoEquipe(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function equipeValida(equipe) {
  const equipeNormalizada = normalizarEquipe(equipe);
  return EQUIPES.includes(equipeNormalizada);
}

function equipeSemEquipe(equipe) {
  return normalizarEquipe(equipe) === 'SEM EQUIPE';
}

function statusRemoveDoEncontro(status) {
  return ['negou', 'desistiu'].includes(status);
}

function aplicarRegraSemEquipe(equipe, status) {
  if (statusRemoveDoEncontro(status)) {
    return {
      equipe: 'SEM EQUIPE',
      status
    };
  }

  const equipeNormalizada = equipe ? normalizarEquipe(equipe) : '';
  if (!equipeNormalizada || equipeSemEquipe(equipeNormalizada)) {
    return {
      equipe: 'SEM EQUIPE',
      status
    };
  }

  return {
    equipe: equipeNormalizada,
    status
  };
}

module.exports = {
  EQUIPES,
  normalizarEquipe,
  equipeValida,
  equipeSemEquipe,
  statusRemoveDoEncontro,
  aplicarRegraSemEquipe
};
