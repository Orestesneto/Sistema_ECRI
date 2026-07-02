# Sistema ECRI Android

Versao Android do Sistema ECRI 2026 usando Capacitor.

## Comandos

```powershell
npm install
npm run build:web
npm run sync
cd android
.\gradlew.bat assembleDebug
```

APK debug:

```text
android\app\build\outputs\apk\debug\app-debug.apk
```

## Notificacoes na tela bloqueada

Para aparecer na central de notificacoes do Android com o app fechado, precisa configurar o Firebase Cloud Messaging.

1. Baixe o arquivo `google-services.json` no console do Firebase.
2. Coloque exatamente neste caminho:

```text
Sistema para android\android\app\google-services.json
```

3. No Vercel, configure uma destas variaveis com a conta de servico do Firebase:

```text
FIREBASE_SERVICE_ACCOUNT_BASE64
```

ou

```text
FIREBASE_SERVICE_ACCOUNT_JSON
```

Depois rode:

```powershell
npm run build:web
npm run sync
cd android
.\gradlew.bat assembleDebug
```

Sem o `google-services.json`, o app continua funcionando, mas o push nativo fica desligado para evitar travamento.
