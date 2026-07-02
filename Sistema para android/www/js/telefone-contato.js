function normalizarTelefoneContato(valor) {
    const telefone = String(valor || '').replace(/\D/g, '');
    if (telefone.startsWith('9')) {
        return telefone.slice(0, 11);
    }
    if (telefone.length === 10) {
        return `${telefone.slice(0, 2)}9${telefone.slice(2)}`;
    }
    return telefone.slice(0, 11);
}

function telefoneContatoFaltouDdd(telefone) {
    return String(telefone || '').replace(/\D/g, '').startsWith('9');
}

function validarTelefoneContatoValor(valor, obrigatorio = false) {
    const telefone = normalizarTelefoneContato(valor);

    if (!telefone) {
        return {
            valido: !obrigatorio,
            telefone,
            erro: obrigatorio ? 'Informe o telefone WhatsApp.' : ''
        };
    }

    if (telefoneContatoFaltouDdd(telefone)) {
        return { valido: false, telefone, erro: 'Faltou o DDD' };
    }

    if (telefone.length !== 11) {
        return {
            valido: false,
            telefone,
            erro: 'Informe o telefone com DDD e 9 digitos. Exemplo: 83999999999.'
        };
    }

    return { valido: true, telefone, erro: '' };
}

function configurarCampoTelefoneContato(campoOuId) {
    const campo = typeof campoOuId === 'string'
        ? document.getElementById(campoOuId)
        : campoOuId;
    if (!campo) return;
    if (campo.dataset.telefoneContatoConfigurado === 'true') return;
    campo.dataset.telefoneContatoConfigurado = 'true';

    campo.setAttribute('inputmode', 'numeric');
    campo.setAttribute('maxlength', '11');
    campo.setAttribute('placeholder', '83999999999');

    campo.addEventListener('input', () => {
        campo.value = String(campo.value || '').replace(/\D/g, '').slice(0, 11);
    });

    campo.addEventListener('blur', () => validarSaidaCampoTelefoneContato(campo));
    campo.addEventListener('focusout', () => validarSaidaCampoTelefoneContato(campo));
    campo.addEventListener('change', () => validarSaidaCampoTelefoneContato(campo));
}

function validarSaidaCampoTelefoneContato(campo) {
    if (!campo || campo.type !== 'tel') return;

    campo.value = normalizarTelefoneContato(campo.value);

    if (telefoneContatoFaltouDdd(campo.value) && campo.dataset.telefoneUltimoAvisoDdd !== campo.value) {
        campo.dataset.telefoneUltimoAvisoDdd = campo.value;
        setTimeout(() => mostrarModalTelefoneContato('Faltou o DDD'), 80);
    } else if (!telefoneContatoFaltouDdd(campo.value)) {
        campo.dataset.telefoneUltimoAvisoDdd = '';
    }
}

function validarTelefoneContatoAtivoAoTocarFora(evento) {
    const campoAtivo = document.activeElement;
    if (!campoAtivo || campoAtivo.type !== 'tel') return;
    if (campoAtivo.contains(evento.target)) return;

    validarSaidaCampoTelefoneContato(campoAtivo);
}

function configurarTodosCamposTelefoneContato() {
    document.querySelectorAll('input[type="tel"]').forEach((campo) => {
        configurarCampoTelefoneContato(campo);
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        configurarTodosCamposTelefoneContato();
        configurarValidacaoTelefoneContatoAoTocarFora();
    });
} else {
    configurarTodosCamposTelefoneContato();
    configurarValidacaoTelefoneContatoAoTocarFora();
}

function configurarValidacaoTelefoneContatoAoTocarFora() {
    if (document.documentElement.dataset.telefoneContatoCliqueForaConfigurado === 'true') return;
    document.documentElement.dataset.telefoneContatoCliqueForaConfigurado = 'true';

    document.addEventListener('pointerdown', validarTelefoneContatoAtivoAoTocarFora, true);
    document.addEventListener('touchstart', validarTelefoneContatoAtivoAoTocarFora, true);
    document.addEventListener('mousedown', validarTelefoneContatoAtivoAoTocarFora, true);
}

function validarCampoTelefoneContato(campoId, opcoes = {}) {
    const campo = document.getElementById(campoId);
    if (!campo) return { valido: true, telefone: '', erro: '' };

    const resultado = validarTelefoneContatoValor(campo.value, Boolean(opcoes.obrigatorio));
    campo.value = resultado.telefone;

    if (!resultado.valido && opcoes.mostrarModal !== false) {
        mostrarModalTelefoneContato(resultado.erro);
        campo.focus();
    }

    return resultado;
}

function mostrarModalTelefoneContato(mensagem) {
    const modalExistente = document.getElementById('modalTelefoneContato');
    if (modalExistente) {
        modalExistente.remove();
    }

    const modalHtml = `
        <div class="modal fade" id="modalTelefoneContato" tabindex="-1" aria-hidden="true">
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title text-warning">${escapeHtmlTelefoneContato(mensagem)}</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>
                    </div>
                    <div class="modal-body">
                        <p class="mb-0">${escapeHtmlTelefoneContato(mensagem)}</p>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-primary" data-bs-dismiss="modal">OK</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const modalEl = document.getElementById('modalTelefoneContato');
    modalEl.addEventListener('hidden.bs.modal', () => modalEl.remove(), { once: true });

    if (window.bootstrap?.Modal) {
        new bootstrap.Modal(modalEl).show();
        return;
    }

    modalEl.remove();
    window.alert(mensagem);
}

function escapeHtmlTelefoneContato(valor) {
    return String(valor || '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    }[char]));
}
