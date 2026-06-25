const EQUIPES_SERVIDAS_OPCOES = [
    'APRESENTADORES',
    'CIRCULOS/ ARCOS / GRUPOS',
    'ECRISHOP/ MINI BOX / BODEGA',
    'BANDINHA',
    'BOA ACAO / BOA VONTADE / BEM ESTAR',
    'LIRTUGIA',
    'SECRETARIA / PAPELARIA / ESCRITA',
    'TRANSITO E SOCIODRAMA / TEATRO/ TEATRINHO',
    'ANJOS DA ALEGRIA',
    'ANJOS DA GUARDA',
    'ORDEM / VASSOURINHA',
    'LANCHINHO/ PAPA LANCHE',
    'COZINHA / RANGUINHO',
    'SOM E ILUMINACAO',
    'COMPRAS',
    'RECPCAO AOS PALESTRANTES',
    'VISITACAO E EXTERNA/ COMUNICACAO E INFORMACAO'
];

function renderizarCamposExperiencia(containerId, prefixo) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const checkboxes = EQUIPES_SERVIDAS_OPCOES.map((opcao, index) => {
        const id = `${prefixo}EquipeServida${index}`;
        return `
            <div class="col-sm-6">
                <div class="form-check">
                    <input class="form-check-input" type="checkbox" name="${prefixo}EquipesServidas" id="${id}" value="${opcao}">
                    <label class="form-check-label" for="${id}">${opcao}</label>
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = `
        <hr>
        <h5>Experiencia nas equipes</h5>
        <div class="mb-3">
            <label class="form-label d-block">Você toca algum instrumento?</label>
            <div class="form-check form-check-inline">
                <input class="form-check-input" type="radio" name="${prefixo}TocaInstrumento" id="${prefixo}TocaInstrumentoSim" value="sim">
                <label class="form-check-label" for="${prefixo}TocaInstrumentoSim">Sim</label>
            </div>
            <div class="form-check form-check-inline">
                <input class="form-check-input" type="radio" name="${prefixo}TocaInstrumento" id="${prefixo}TocaInstrumentoNao" value="nao">
                <label class="form-check-label" for="${prefixo}TocaInstrumentoNao">Não</label>
            </div>
        </div>
        <div class="mb-3" id="${prefixo}CampoInstrumentos" style="display:none;">
            <label class="form-label" for="${prefixo}Instrumentos">Qual instrumentos?</label>
            <input type="text" class="form-control" id="${prefixo}Instrumentos">
        </div>
        <div class="mb-3">
            <label class="form-label d-block">Você canta?</label>
            <div class="form-check form-check-inline">
                <input class="form-check-input" type="radio" name="${prefixo}Canta" id="${prefixo}CantaSim" value="sim">
                <label class="form-check-label" for="${prefixo}CantaSim">Sim</label>
            </div>
            <div class="form-check form-check-inline">
                <input class="form-check-input" type="radio" name="${prefixo}Canta" id="${prefixo}CantaNao" value="nao">
                <label class="form-check-label" for="${prefixo}CantaNao">Não</label>
            </div>
        </div>
        <div class="mb-3">
            <label class="form-label d-block">Quais dessas equipes você já serviu?</label>
            <div class="row g-2">${checkboxes}</div>
        </div>
    `;

    configurarCamposExperiencia(prefixo);
}

function configurarCamposExperiencia(prefixo) {
    document.querySelectorAll(`input[name="${prefixo}TocaInstrumento"]`).forEach((radio) => {
        radio.addEventListener('change', () => atualizarCampoInstrumentosPerfil(prefixo));
    });

    document.getElementById(`${prefixo}Instrumentos`)?.addEventListener('input', (e) => {
        e.target.value = e.target.value.toLocaleUpperCase('pt-BR');
    });
}

function carregarExperienciaPerfil(prefixo, usuario) {
    const tocaInstrumento = usuario.toca_instrumento || 'nao';
    const canta = usuario.canta || 'nao';
    const equipes = normalizarEquipesServidasFrontend(usuario.equipes_servidas);

    const tocaRadio = document.querySelector(`input[name="${prefixo}TocaInstrumento"][value="${tocaInstrumento}"]`);
    const cantaRadio = document.querySelector(`input[name="${prefixo}Canta"][value="${canta}"]`);
    if (tocaRadio) tocaRadio.checked = true;
    if (cantaRadio) cantaRadio.checked = true;

    const instrumentosInput = document.getElementById(`${prefixo}Instrumentos`);
    if (instrumentosInput) instrumentosInput.value = usuario.instrumentos || '';

    document.querySelectorAll(`input[name="${prefixo}EquipesServidas"]`).forEach((checkbox) => {
        checkbox.checked = equipes.includes(checkbox.value);
    });

    atualizarCampoInstrumentosPerfil(prefixo);
}

function obterExperienciaPerfil(prefixo) {
    const tocaInstrumento = document.querySelector(`input[name="${prefixo}TocaInstrumento"]:checked`)?.value || 'nao';
    const canta = document.querySelector(`input[name="${prefixo}Canta"]:checked`)?.value || 'nao';
    const instrumentos = tocaInstrumento === 'sim'
        ? (document.getElementById(`${prefixo}Instrumentos`)?.value || '').toLocaleUpperCase('pt-BR')
        : '';
    const equipesServidas = Array.from(document.querySelectorAll(`input[name="${prefixo}EquipesServidas"]:checked`))
        .map((checkbox) => checkbox.value);

    return {
        toca_instrumento: tocaInstrumento,
        instrumentos,
        canta,
        equipes_servidas: equipesServidas
    };
}

function atualizarCampoInstrumentosPerfil(prefixo) {
    const tocaInstrumento = document.querySelector(`input[name="${prefixo}TocaInstrumento"]:checked`)?.value || 'nao';
    const campo = document.getElementById(`${prefixo}CampoInstrumentos`);
    const input = document.getElementById(`${prefixo}Instrumentos`);
    const mostrar = tocaInstrumento === 'sim';

    if (campo) campo.style.display = mostrar ? 'block' : 'none';
    if (input) {
        input.required = mostrar;
        if (!mostrar) input.value = '';
    }
}

function normalizarEquipesServidasFrontend(valor) {
    if (Array.isArray(valor)) return valor;

    if (typeof valor === 'string' && valor.trim()) {
        try {
            const lista = JSON.parse(valor);
            return Array.isArray(lista) ? lista : [];
        } catch (err) {
            return [];
        }
    }

    return [];
}
