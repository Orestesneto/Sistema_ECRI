(function iniciarNotificacoesApp() {
    const API_NOTIFICACOES = 'https://sistema-ecri.vercel.app/api';
    const INTERVALO_NOTIFICACOES_MS = 5000;
    const idsExibidos = new Set();
    let buscando = false;

    function obterTokenNotificacoes() {
        return localStorage.getItem('token');
    }

    function escapeHtmlNotificacao(valor) {
        return String(valor || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function obterContainerNotificacoes() {
        let container = document.getElementById('notificacoesAppContainer');
        if (container) return container;

        container = document.createElement('div');
        container.id = 'notificacoesAppContainer';
        container.className = 'toast-container position-fixed top-0 end-0 p-3';
        container.style.zIndex = '1080';
        document.body.appendChild(container);
        return container;
    }

    function mostrarToastNotificacao(notificacao) {
        const container = obterContainerNotificacoes();
        const toastEl = document.createElement('div');
        toastEl.className = 'toast align-items-stretch text-dark border-0 shadow';
        toastEl.setAttribute('role', 'alert');
        toastEl.setAttribute('aria-live', 'assertive');
        toastEl.setAttribute('aria-atomic', 'true');
        toastEl.innerHTML = `
            <div class="toast-header bg-primary text-white">
                <strong class="me-auto">${escapeHtmlNotificacao(notificacao.titulo)}</strong>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="toast" aria-label="Fechar"></button>
            </div>
            <div class="toast-body">${escapeHtmlNotificacao(notificacao.mensagem)}</div>
        `;
        container.appendChild(toastEl);

        if (window.bootstrap?.Toast) {
            const toast = new bootstrap.Toast(toastEl, { delay: 9000 });
            toastEl.addEventListener('hidden.bs.toast', () => toastEl.remove());
            toast.show();
        } else {
            setTimeout(() => toastEl.remove(), 9000);
        }
    }

    function mostrarNotificacaoNativa(notificacao) {
        if (!('Notification' in window) || Notification.permission !== 'granted') return;
        try {
            new Notification(notificacao.titulo, {
                body: notificacao.mensagem,
                tag: `ecri-${notificacao.id}`
            });
        } catch (err) {
            console.warn('Notificacao nativa indisponivel', err);
        }
    }

    async function marcarNotificacoesLidas(ids) {
        if (!ids.length) return;
        await fetch(`${API_NOTIFICACOES}/notificacoes/lidas`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${obterTokenNotificacoes()}`
            },
            body: JSON.stringify({ ids })
        }).catch(() => {});
    }

    async function registrarDispositivoPush(token) {
        if (!token || !obterTokenNotificacoes()) return;

        await fetch(`${API_NOTIFICACOES}/notificacoes/dispositivos`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${obterTokenNotificacoes()}`
            },
            body: JSON.stringify({
                token,
                plataforma: window.Capacitor?.getPlatform?.() || 'web'
            })
        }).catch(err => console.warn('Nao foi possivel registrar dispositivo push', err));
    }

    async function iniciarPushNativo() {
        const pushNativoAtivo = window.SISTEMA_ECRI_CONFIG?.enableNativePush === true;
        if (!pushNativoAtivo) return;

        const push = window.Capacitor?.Plugins?.PushNotifications;
        if (!push || !obterTokenNotificacoes()) return;

        try {
            let permissao = await push.checkPermissions();
            if (permissao.receive !== 'granted') {
                permissao = await push.requestPermissions();
            }

            if (permissao.receive !== 'granted') return;

            await push.addListener('registration', token => registrarDispositivoPush(token.value));
            await push.addListener('registrationError', erro => console.warn('Erro ao registrar push', erro));
            await push.addListener('pushNotificationReceived', notificacao => {
                mostrarToastNotificacao({
                    id: `push-${Date.now()}`,
                    titulo: notificacao.title || 'ECRI 2026',
                    mensagem: notificacao.body || ''
                });
            });

            if (typeof push.createChannel === 'function') {
                await push.createChannel({
                    id: 'ecri_notificacoes',
                    name: 'Notificações ECRI',
                    description: 'Avisos de reuniões e chamadas do ECRI 2026',
                    importance: 5,
                    visibility: 1,
                    sound: 'default'
                }).catch(() => {});
            }

            await push.register();
        } catch (err) {
            console.warn('Push nativo indisponivel', err);
        }
    }

    async function buscarNotificacoes() {
        const token = obterTokenNotificacoes();
        if (!token || buscando) return;

        buscando = true;
        try {
            const response = await fetch(`${API_NOTIFICACOES}/notificacoes?nao_lidas=1&limite=10`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) return;
            const notificacoes = await response.json();
            const novas = (Array.isArray(notificacoes) ? notificacoes : [])
                .sort((a, b) => Number(a.id) - Number(b.id))
                .filter(item => !idsExibidos.has(Number(item.id)));

            novas.forEach(notificacao => {
                idsExibidos.add(Number(notificacao.id));
                mostrarToastNotificacao(notificacao);
                mostrarNotificacaoNativa(notificacao);
            });

            await marcarNotificacoesLidas(novas.map(item => Number(item.id)));
        } finally {
            buscando = false;
        }
    }

    async function renovarSessaoLonga() {
        const token = obterTokenNotificacoes();
        if (!token || sessionStorage.getItem('sessaoLongaRenovada') === '1') return;

        try {
            const response = await fetch(`${API_NOTIFICACOES}/auth/renovar`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) return;

            const data = await response.json();
            if (data.token) localStorage.setItem('token', data.token);
            if (data.usuario) localStorage.setItem('usuario', JSON.stringify(data.usuario));
            sessionStorage.setItem('sessaoLongaRenovada', '1');
        } catch (err) {
            console.warn('Nao foi possivel renovar a sessao automaticamente', err);
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        if (!obterTokenNotificacoes()) return;
        renovarSessaoLonga();
        iniciarPushNativo();
        buscarNotificacoes();
        setInterval(buscarNotificacoes, INTERVALO_NOTIFICACOES_MS);
    });
})();
