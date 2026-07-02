const fs = require('fs');
const path = require('path');

const raiz = path.resolve(__dirname, '..');
const googleServicesPath = path.join(raiz, 'android', 'app', 'google-services.json');
const configPath = path.join(raiz, 'www', 'js', 'app-config.js');

const enableNativePush = fs.existsSync(googleServicesPath);

const conteudo = `window.SISTEMA_ECRI_CONFIG = {
    apiUrl: 'https://sistema-ecri.vercel.app/api',
    enableNativePush: ${enableNativePush}
};
`;

fs.writeFileSync(configPath, conteudo, 'utf8');

console.log(
  enableNativePush
    ? 'Push nativo Android ativado: google-services.json encontrado.'
    : 'Push nativo Android desativado: coloque android/app/google-services.json para ativar.'
);
