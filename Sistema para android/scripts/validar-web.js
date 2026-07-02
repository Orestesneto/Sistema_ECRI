const fs = require('fs');
const path = require('path');

const webDir = path.join(__dirname, '..', 'www');
const requiredFiles = [
  'index.html',
  'equipista.html',
  'coordenador.html',
  'dirigentes.html',
  'confirmacao.html',
  'confirmacao-desistencia.html',
  'desenvolvimento.html',
  path.join('js', 'config.js')
];

for (const file of requiredFiles) {
  const fullPath = path.join(webDir, file);
  if (!fs.existsSync(fullPath)) {
    console.error(`Arquivo obrigatorio nao encontrado: ${file}`);
    process.exit(1);
  }
}

console.log('Arquivos web do Android conferidos.');
