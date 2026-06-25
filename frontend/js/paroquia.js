const PAROQUIAS_PADRAO = [
    'NOSSA SENHORA DA GUIA',
    'SAO PEDRO E SAO PAULO'
];

function configurarCampoParoquia(name, campoOutraId) {
    const radios = document.querySelectorAll(`input[name="${name}"]`);
    radios.forEach((radio) => {
        radio.addEventListener('change', () => alternarCampoOutraParoquia(name, campoOutraId));
    });
    alternarCampoOutraParoquia(name, campoOutraId);
}

function alternarCampoOutraParoquia(name, campoOutraId) {
    const campoOutra = document.getElementById(campoOutraId);
    const selecionado = document.querySelector(`input[name="${name}"]:checked`);
    if (!campoOutra) return;

    const mostrarOutra = selecionado?.value === 'OUTRAS';
    campoOutra.style.display = mostrarOutra ? 'block' : 'none';
    const inputOutra = campoOutra.querySelector('input');
    if (inputOutra) {
        inputOutra.required = mostrarOutra;
        if (!mostrarOutra) inputOutra.value = '';
    }
}

function obterParoquia(name, outraId) {
    const selecionado = document.querySelector(`input[name="${name}"]:checked`);
    if (!selecionado) return '';

    if (selecionado.value === 'OUTRAS') {
        return paraCaixaAlta(document.getElementById(outraId)?.value.trim() || '');
    }

    return selecionado.value;
}

function preencherParoquia(name, outraId, campoOutraId, paroquia) {
    const valor = paraCaixaAlta(paroquia || '');
    const radio = Array.from(document.querySelectorAll(`input[name="${name}"]`))
        .find((item) => item.value === valor);

    if (radio) {
        radio.checked = true;
    } else if (valor) {
        const radioOutras = document.querySelector(`input[name="${name}"][value="OUTRAS"]`);
        if (radioOutras) radioOutras.checked = true;
        const inputOutra = document.getElementById(outraId);
        if (inputOutra) inputOutra.value = valor;
    }

    alternarCampoOutraParoquia(name, campoOutraId);
}

function paroquiaValida(paroquia) {
    const valor = paraCaixaAlta(paroquia || '');
    return PAROQUIAS_PADRAO.includes(valor) || valor.length > 0;
}

function paraCaixaAlta(valor) {
    return String(valor || '').toUpperCase();
}
