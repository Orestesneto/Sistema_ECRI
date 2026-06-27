function configurarRestricaoSimNao(name, campoId, inputId) {
    document.querySelectorAll(`input[name="${name}"]`).forEach((radio) => {
        radio.addEventListener('change', () => atualizarRestricaoSimNao(name, campoId, inputId));
    });
    atualizarRestricaoSimNao(name, campoId, inputId);
}

function atualizarRestricaoSimNao(name, campoId, inputId) {
    const resposta = document.querySelector(`input[name="${name}"]:checked`)?.value || '';
    const campo = document.getElementById(campoId);
    const input = document.getElementById(inputId);
    if (!campo || !input) return;

    const deveMostrar = resposta === 'sim';
    campo.style.display = deveMostrar ? 'block' : 'none';
    input.required = deveMostrar;

    if (!deveMostrar) {
        input.value = '';
    }
}

function preencherRestricaoSimNao(name, campoId, inputId, valor) {
    const texto = String(valor || '').trim();
    const valorBaixo = texto.toLocaleLowerCase('pt-BR');
    const temRestricao = Boolean(texto) && valorBaixo !== 'não' && valorBaixo !== 'nao';
    const radio = document.querySelector(`input[name="${name}"][value="${temRestricao ? 'sim' : 'nao'}"]`);
    if (radio) radio.checked = true;

    const input = document.getElementById(inputId);
    if (input) input.value = temRestricao ? texto : '';
    atualizarRestricaoSimNao(name, campoId, inputId);
}

function obterRestricaoSimNao(name, inputId, rotulo) {
    const resposta = document.querySelector(`input[name="${name}"]:checked`)?.value || '';
    const input = document.getElementById(inputId);
    const texto = String(input?.value || '').trim();

    if (!resposta) {
        return { erro: `Informe se possui ${rotulo}.` };
    }

    if (resposta === 'sim' && !texto) {
        return { erro: `Descreva qual é a ${rotulo}.` };
    }

    return { valor: resposta === 'sim' ? texto : 'Não' };
}
