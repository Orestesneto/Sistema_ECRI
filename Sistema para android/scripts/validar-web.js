const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const obrigatorios = [
  'www/index.html',
  'www/equipista.html',
  'www/coordenador.html',
  'www/dirigentes.html',
  'www/js/auth.js',
  'www/js/equipista.js',
  'www/js/coordenador.js',
  'www/js/dirigentes.js',
  'www/assets/logo-ecri.png'
];

const faltando = obrigatorios.filter(arquivo => !fs.existsSync(path.join(raiz, arquivo)));
if (faltando.length) {
  console.error(`Arquivos ausentes:\n${faltando.join('\n')}`);
  process.exit(1);
}

console.log('Arquivos web do Android conferidos.');
