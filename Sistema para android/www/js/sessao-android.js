(function limparSessaoAndroidAntiga() {
    const VERSAO_SESSAO_ANDROID = '20260702-recriado';
    const CHAVE_VERSAO_SESSAO_ANDROID = 'versaoSessaoAndroid';

    const token = localStorage.getItem('token');
    const versaoAtual = localStorage.getItem(CHAVE_VERSAO_SESSAO_ANDROID);

    if (token && versaoAtual !== VERSAO_SESSAO_ANDROID) {
        localStorage.removeItem('token');
        localStorage.removeItem('usuario');
        localStorage.removeItem('loginEm');
        localStorage.setItem(CHAVE_VERSAO_SESSAO_ANDROID, VERSAO_SESSAO_ANDROID);
        window.location.href = 'index.html';
        return;
    }

    if (!versaoAtual) {
        localStorage.setItem(CHAVE_VERSAO_SESSAO_ANDROID, VERSAO_SESSAO_ANDROID);
    }
})();
