const API_URL_ACEITE = window.location.origin + '/api';
const codigoAceite = new URLSearchParams(window.location.search).get('codigo') || '';

document.addEventListener('DOMContentLoaded', carregarAceite);
document.getElementById('formAceiteAlmoxarifado')?.addEventListener('submit', assinarAceite);

async function carregarAceite() {
    if (!codigoAceite) return mostrarAlertaAceite('Link de recebimento inválido.', 'danger');
    try {
        const response = await fetch(`${API_URL_ACEITE}/almoxarifado/recebimento/${encodeURIComponent(codigoAceite)}`);
        const protocolo = await response.json();
        if (!response.ok) throw new Error(protocolo.erro || 'Não foi possível carregar o protocolo');
        renderizarAceite(protocolo);
    } catch (err) {
        document.getElementById('resumoAceite').innerHTML = '';
        mostrarAlertaAceite(err.message, 'danger');
    }
}

function renderizarAceite(protocolo) {
    const itens = (protocolo.itens || []).map(item => `
        <li class="list-group-item d-flex justify-content-between gap-3">
            <span>${escapeHtmlAceite(item.nome)}</span>
            <strong>${Number(item.quantidade)} ${escapeHtmlAceite(item.unidade)}</strong>
        </li>`).join('');
    document.getElementById('resumoAceite').innerHTML = `
        <div class="border rounded p-3">
            <h2 class="h5">Protocolo #${Number(protocolo.id)}</h2>
            <p class="mb-1"><strong>Solicitante:</strong> ${escapeHtmlAceite(protocolo.solicitante)}</p>
            <p class="mb-3"><strong>Finalidade:</strong> ${escapeHtmlAceite(protocolo.finalidade)}</p>
            <ul class="list-group">${itens}</ul>
        </div>`;
    if (protocolo.data_aceite) {
        mostrarAlertaAceite(`Recebimento já assinado por ${protocolo.assinado_por || protocolo.solicitante} em ${formatarDataAceite(protocolo.data_aceite)}.`, 'success');
        return;
    }
    document.getElementById('formAceiteAlmoxarifado').style.display = 'block';
}

async function assinarAceite(evento) {
    evento.preventDefault();
    const botao = document.getElementById('btnAssinarAceite');
    botao.disabled = true;
    botao.textContent = 'Confirmando login...';
    try {
        const loginResponse = await fetch(`${API_URL_ACEITE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                cpf: document.getElementById('cpfAceite').value.replace(/\D/g, ''),
                data_nascimento: document.getElementById('nascimentoAceite').value.replace(/\D/g, '')
            })
        });
        const login = await loginResponse.json();
        if (!loginResponse.ok) throw new Error(login.erro || 'Não foi possível confirmar seu login');

        botao.textContent = 'Registrando assinatura...';
        const response = await fetch(`${API_URL_ACEITE}/almoxarifado/recebimento/${encodeURIComponent(codigoAceite)}/assinar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${login.token}` },
            body: '{}'
        });
        const resultado = await response.json();
        if (!response.ok) throw new Error(resultado.erro || 'Não foi possível confirmar o recebimento');
        document.getElementById('formAceiteAlmoxarifado').style.display = 'none';
        mostrarAlertaAceite(resultado.mensagem, 'success');
        await carregarAceite();
    } catch (err) {
        mostrarAlertaAceite(err.message, 'danger');
    } finally {
        botao.disabled = false;
        botao.textContent = 'Assinar e confirmar recebimento';
    }
}

function mostrarAlertaAceite(mensagem, tipo) {
    const alerta = document.getElementById('alertaAceite');
    alerta.className = `alert alert-${tipo}`;
    alerta.textContent = mensagem;
    alerta.style.display = 'block';
}

function formatarDataAceite(valor) {
    const data = new Date(valor);
    return Number.isNaN(data.getTime()) ? String(valor) : data.toLocaleString('pt-BR');
}

function escapeHtmlAceite(valor) {
    const elemento = document.createElement('div');
    elemento.textContent = String(valor || '');
    return elemento.innerHTML;
}
