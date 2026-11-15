# SRGOP no celular

O mesmo frontend React é distribuído como PWA pela Vercel e como aplicativo Android pelo Capacitor. Ambos usam a API existente e o MongoDB; o aplicativo nunca recebe credenciais do banco.

## PWA

Na Vercel: Root Directory `frontend`, build `npm run build`, saída `dist`. Configure `VITE_API_URL=https://srgop.onrender.com/api` e `VITE_SOCKET_URL=https://srgop.onrender.com` e faça um novo deploy. Abra o endereço HTTPS no Chrome Android e use Instalar aplicativo no menu ou no aviso da página. O aviso depende do suporte e dos critérios do navegador.

O service worker guarda somente arquivos estáticos da interface. Não guarda respostas da API, mapas, fotos nem registros operacionais. Sem conexão aparece um aviso; não há cadastro offline, fila de envio ou sincronização posterior. Na primeira visita é necessário estar online. Atualizações aguardam o botão Atualizar para evitar recarregar um formulário em preenchimento.

## Android

Identificador inicial: `br.com.srgop.app`. Projeto nativo: `frontend/android`. Requer Node compatível com Capacitor 8, Android Studio, JDK 21 ou compatível com o Gradle e SDK Android 36.

Crie `frontend/.env.android.local` (ignorado pelo Git):

```env
VITE_API_URL=https://srgop.onrender.com/api
VITE_SOCKET_URL=https://srgop.onrender.com
```

Dentro de `frontend`:

```powershell
npm ci
npm run android:sync
npm run android:open
```

O build Android bloqueia URLs ausentes, localhost e HTTP. O celular usa o backend remoto, e não o servidor local do computador. O service worker fica desativado no build Android: os arquivos vêm dentro do APK.

No Windows, `npm run android:apk` sincroniza e gera o APK de teste em `frontend/android/app/build/outputs/apk/debug/app-debug.apk`. Para Linux/macOS use `./gradlew assembleDebug` na pasta android após sincronizar. APK de teste não é publicação de produção. Para distribuição final, gere APK/AAB assinado no Android Studio e guarde a chave de assinatura fora do Git.

## Render e autenticação

No backend mantenha `MONGO_URI`, `JWT_SECRET`, `NODE_ENV=production` e `COOKIE_SAME_SITE=none`. Acrescente a origem Android à lista de origens exatas:

```env
CLIENT_URL=https://srgop.vercel.app,https://localhost
```

Substitua a URL da Vercel pela URL real. A origem local HTTPS é usada pelo WebView do Capacitor, não é o endereço da API. Essa lista serve ao CORS, CSRF e Socket.IO. O aplicativo permite cookies de terceiros para a sessão HttpOnly da API. Não exponha segredos nas variáveis VITE_.

## Validação em aparelho antes de distribuir

- Instalar o PWA e conferir nome/ícone e acesso por link direto a uma rota.
- Entrar com usuário de teste, fechar/reabrir e sair; testar expiração da sessão.
- Conferir que alterações aparecem no web e Android e que Socket.IO reconecta após perda de rede.
- Desconectar internet: verificar aviso e ausência de confirmação falsa de cadastro.
- Publicar uma nova versão web: confirmar aviso e atualização manual.
- No Android físico validar cookies, botão Voltar, GPS, câmera/anexos e downloads. Integrações nativas específicas ainda precisam de implementação e teste; não há notificações push nem localização contínua em segundo plano nesta etapa.

A URL informada para a API é `https://srgop.onrender.com`. A configuração local Android já aponta para ela. A consulta CORS à API confirmou autorização para `https://srgop.vercel.app` e `https://localhost`. Nenhum deploy foi feito automaticamente.

Neste computador, o Java do sistema é 25, incompatível com o Gradle 8.14.3 gerado pelo Capacitor. Um JDK 21 foi baixado apenas em `.runtime/android-tools/jdk21`, sem alterar o Java do sistema. O script `android:apk` usa esse JDK local quando disponível; em outro computador configure `JAVA_HOME` para um JDK compatível.

## Validação realizada

Build PWA concluído; manifesto, ícones e exclusão da API do cache verificados. Build Android concluído com `:app:assembleDebug`; assinatura do APK de teste e URL da API dentro do pacote verificadas. Auditoria npm das dependências de produção: zero vulnerabilidades reportadas. Ainda falta a validação funcional em um aparelho Android.

## Download pelo login

A página de login da web oferece o APK em `/downloads/srgop-android.apk`, incluído em `frontend/public/downloads`. O aviso de instalação do PWA só aparece em dispositivos móveis. O APK não entra no cache do PWA nem é incluído no pacote nativo. `npm run android:apk` atualiza a cópia pública após gerar um novo APK. Para disponibilizar o download, envie também o arquivo APK de `public/downloads` ao repositório e faça novo deploy na Vercel.
