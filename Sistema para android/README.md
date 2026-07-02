# Sistema ECRI para Android

Esta pasta contem uma versao Android do Sistema ECRI usando Capacitor. O app empacota o frontend atual em `www/` e consome o backend publicado em:

```text
https://sistema-ecri.vercel.app
```

## Requisitos

- Node.js instalado
- Android Studio instalado
- JDK configurado pelo Android Studio

## Instalar dependencias

```bash
npm install
```

## Gerar/atualizar o projeto Android

```bash
npm run sync
```

## Abrir no Android Studio

```bash
npm run open
```

Depois, no Android Studio, use **Run** para instalar no celular/emulador ou **Build > Generate Signed Bundle / APK** para gerar o APK assinado.

## Alterar URL do servidor

Edite:

```text
www/js/config.js
```

Troque `APP_BASE_URL` pela URL desejada e rode novamente:

```bash
npm run sync
```

## Observacoes

- O backend Node/Express nao roda dentro do Android. O aplicativo Android usa o backend online.
- Para testar contra o servidor local, o celular precisa acessar o IP da maquina na mesma rede, por exemplo `http://192.168.0.10:5000`.
- Como o app usa camera/galeria por campos de arquivo do navegador, a captura de foto depende do WebView do Android.
