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
  return EQUIPES.find(item => item.toLowerCase() === equipeNormalizada.toLowerCase()) || equipeNormalizada;
}

function equipeValida(equipe) {
  const equipeNormalizada = normalizarEquipe(equipe);
  return EQUIPES.includes(equipeNormalizada);
}

module.exports = {
  EQUIPES,
  normalizarEquipe,
  equipeValida
};
