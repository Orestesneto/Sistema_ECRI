const API_URL = window.location.protocol === 'file:' ? 'http://localhost:5000/api' : window.location.origin + '/api';
const TAMANHO_MAXIMO_FOTO_MB = 3;
const TAMANHO_MAXIMO_FOTO_BYTES = TAMANHO_MAXIMO_FOTO_MB * 1024 * 1024;

const params = new URLSearchParams(window.location.search);
const token = params.get('token');
const modoDesistencia = window.location.pathname.includes('confirmacao-desistencia');
const statusDesistencia = ['negou', 'desistiu'].includes(params.get('status')) ? params.get('status') : 'desistiu';
let tipoCadastro = '';
let fotoPerfilAtualConfirmacao = '';

configurarValidacaoNativaConfirmacao();
document.addEventListener('DOMContentLoaded', carregarConfirmacao);
document.getElementById('confirmacaoMovimento')?.addEventListener('change', atualizarModoConfirmacao);
document.getElementById('confirmacaoNomeIndividual')?.addEventListener('input', atualizarNomeConfirmacao);
document.getElementById('confirmacaoNomeMarido')?.addEventListener('input', atualizarNomeConfirmacao);
document.getElementById('confirmacaoNomeEsposa')?.addEventListener('input', atualizarNomeConfirmacao);
document.getElementById('confirmacaoNomeCracha')?.addEventListener('input', atualizarCampoCrachaConfirmacao);
if (typeof configurarCampoTelefoneContato === 'function') {
    configurarCampoTelefoneContato('confirmacaoTelefone');
    configurarCampoTelefoneContato('confirmacaoTelefoneEsposa');
    configurarCampoTelefoneContato('confirmacaoTelefoneMarido');
}
configurarCampoParoquia('paroquiaConfirmacao', 'campoOutraParoquiaConfirmacao');
document.getElementById('confirmacaoInstrumentos')?.addEventListener('input', (e) => {
    e.target.value = paraCaixaAlta(e.target.value);
});
document.querySelectorAll('input[name="confirmacaoTocaInstrumento"]').forEach((radio) => {
    radio.addEventListener('change', atualizarCampoInstrumentosConfirmacao);
});
[
    ['confirmacaoTemRestricaoMedica', 'campoConfirmacaoRestricaoMedica', 'confirmacaoRestricaoMedica'],
    ['confirmacaoTemRestricaoAlimentar', 'campoConfirmacaoRestricaoAlimentar', 'confirmacaoRestricaoAlimentar'],
    ['confirmacaoTemRestricaoMedicacao', 'campoConfirmacaoRestricaoMedicacao', 'confirmacaoRestricaoMedicacao']
].forEach(([name, campoId, inputId]) => {
    document.querySelectorAll(`input[name="${name}"]`).forEach((radio) => {
        radio.addEventListener('change', () => atualizarCampoRestricaoConfirmacao(name, campoId, inputId));
    });
});

['confirmacaoCpf', 'confirmacaoDataNascimento', 'confirmacaoAnoEncontro'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', (e) => {
        e.target.value = somenteNumeros(e.target.value);
    });
});

document.getElementById('confirmacaoFoto')?.addEventListener('change', async (e) => {
    const arquivo = e.target.files[0];
    if (!arquivo) return;

    if (!fotoPerfilTipoAceito(arquivo) || arquivo.size > TAMANHO_MAXIMO_FOTO_BYTES) {
        mostrarAlerta(`A foto deve ser JPG, JPEG, PNG, HEIF ou WEBP e ter no máximo ${TAMANHO_MAXIMO_FOTO_MB}MB.`, 'warning');
        e.target.value = '';
        return;
    }

    let fotoBase64;
    try {
        fotoBase64 = await converterParaBase64(arquivo);
    } catch (err) {
        mostrarAlerta(err.message || 'Erro ao otimizar a foto', 'warning');
        e.target.value = '';
        return;
    }
    document.getElementById('fotoConfirmacao').innerHTML =
        `<img src="${fotoBase64}" alt="Foto" style="width:120px; height:120px; border-radius:50%; object-fit:cover;">`;
    fotoPerfilAtualConfirmacao = fotoBase64;
});

async function carregarConfirmacao() {
    if (!token) {
        mostrarAlerta('Link de confirmação inválido.', 'danger');
        return;
    }

    try {
        const response = await fetch(`${API_URL}/confirmacao/${encodeURIComponent(token)}`);
        const participante = await response.json();

        if (!response.ok) {
            const tipo = response.status === 403 ? 'warning' : 'danger';
            mostrarAlerta(participante.erro || 'Erro ao carregar confirmação.', tipo);
            return;
        }

        document.getElementById('confirmacaoMovimento').value = participante.movimento_origem || '';
        preencherNomeConfirmacao(participante.nome_completo || '', participante.movimento_origem || '');
        preencherTelefoneConfirmacao(participante.telefone || '', participante.movimento_origem || '');
        document.getElementById('confirmacaoAnoEncontro').value = somenteNumeros(participante.ano_encontro || '');
        preencherRestricaoConfirmacao('confirmacaoTemRestricaoMedica', 'campoConfirmacaoRestricaoMedica', 'confirmacaoRestricaoMedica', participante.restricao_medica || '');
        preencherRestricaoConfirmacao('confirmacaoTemRestricaoAlimentar', 'campoConfirmacaoRestricaoAlimentar', 'confirmacaoRestricaoAlimentar', participante.restricao_alimentar || '');
        preencherRestricaoConfirmacao('confirmacaoTemRestricaoMedicacao', 'campoConfirmacaoRestricaoMedicacao', 'confirmacaoRestricaoMedicacao', participante.restricao_medicacao || '');
        document.getElementById('confirmacaoNomeCracha').value = participante.nome_cracha || participante.nome_completo || '';
        preencherParoquia('paroquiaConfirmacao', 'outraParoquiaConfirmacao', 'campoOutraParoquiaConfirmacao', participante.paroquia || '');
        marcarRadioConfirmacao('confirmacaoTocaInstrumento', participante.toca_instrumento || '');
        document.getElementById('confirmacaoInstrumentos').value = participante.instrumentos || '';
        marcarRadioConfirmacao('confirmacaoCanta', participante.canta || '');
        preencherEquipesServidasConfirmacao(participante.equipes_servidas);
        atualizarCampoInstrumentosConfirmacao();
        tipoCadastro = participante.tipo_cadastro || '';

        if (tipoCadastro === 'externo') {
            document.getElementById('dadosLoginSemCadastro').style.display = 'block';
            document.getElementById('confirmacaoCpf').required = true;
            document.getElementById('confirmacaoDataNascimento').required = true;
            document.getElementById('confirmacaoCpf').value = somenteNumeros(participante.cpf || '');
            document.getElementById('confirmacaoDataNascimento').value = somenteNumeros(participante.data_nascimento || '');
        }

        fotoPerfilAtualConfirmacao = participante.foto_perfil || '';
        document.getElementById('fotoConfirmacao').innerHTML = fotoPerfilAtualConfirmacao
            ? `<img src="${participante.foto_perfil}" alt="Foto" style="width:120px; height:120px; border-radius:50%; object-fit:cover;">`
            : '<div class="mx-auto" style="width:120px; height:120px; border-radius:50%; background:#ddd; display:flex; align-items:center; justify-content:center;">-</div>';

        document.getElementById('formConfirmacao').style.display = 'block';
        aplicarModoDesistenciaConfirmacao();
        atualizarModoConfirmacao();
    } catch (err) {
        mostrarAlerta('Erro ao carregar confirmação.', 'danger');
        console.error(err);
    }
}

document.getElementById('formConfirmacao')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const fotoArquivo = document.getElementById('confirmacaoFoto').files[0];
    let fotoPerfil = fotoPerfilAtualConfirmacao;

    if (fotoArquivo) {
        if (!fotoPerfilTipoAceito(fotoArquivo) || fotoArquivo.size > TAMANHO_MAXIMO_FOTO_BYTES) {
            mostrarAlerta(`A foto deve ser JPG, JPEG, PNG, HEIF ou WEBP e ter no maximo ${TAMANHO_MAXIMO_FOTO_MB}MB.`, 'warning');
            return;
        }

        try {
            fotoPerfil = await converterParaBase64(fotoArquivo);
            fotoPerfilAtualConfirmacao = fotoPerfil;
        } catch (err) {
            mostrarAlerta(err.message || 'Erro ao otimizar a foto', 'warning');
            return;
        }
    }

    if (!fotoPerfil) {
        mostrarAlerta('Envie uma foto de perfil para confirmar sua participacao.', 'warning');
        return;
    }
    const cpf = somenteNumeros(document.getElementById('confirmacaoCpf')?.value || '');
    const dataNascimento = somenteNumeros(document.getElementById('confirmacaoDataNascimento')?.value || '');
    const anoEncontro = somenteNumeros(document.getElementById('confirmacaoAnoEncontro')?.value || '');
    const movimentoOrigem = document.getElementById('confirmacaoMovimento').value;
    const isCasal = movimentoOrigemCasal(movimentoOrigem);
    const telefoneEsposaValidacao = validarTelefoneConfirmacaoValor(document.getElementById('confirmacaoTelefoneEsposa')?.value || '', isCasal);
    const telefoneMaridoValidacao = validarTelefoneConfirmacaoValor(document.getElementById('confirmacaoTelefoneMarido')?.value || '', isCasal);
    const telefoneIndividualValidacao = validarTelefoneConfirmacaoValor(document.getElementById('confirmacaoTelefone')?.value || '', !isCasal);
    const telefoneEsposa = telefoneEsposaValidacao.telefone;
    const telefoneMarido = telefoneMaridoValidacao.telefone;
    const telefoneIndividual = telefoneIndividualValidacao.telefone;
    if (document.getElementById('confirmacaoTelefoneEsposa')) document.getElementById('confirmacaoTelefoneEsposa').value = telefoneEsposa;
    if (document.getElementById('confirmacaoTelefoneMarido')) document.getElementById('confirmacaoTelefoneMarido').value = telefoneMarido;
    if (document.getElementById('confirmacaoTelefone')) document.getElementById('confirmacaoTelefone').value = telefoneIndividual;
    const nomeCracha = paraCaixaAlta(document.getElementById('confirmacaoNomeCracha').value.trim());
    const paroquia = obterParoquia('paroquiaConfirmacao', 'outraParoquiaConfirmacao');
    const tocaInstrumento = document.querySelector('input[name="confirmacaoTocaInstrumento"]:checked')?.value || '';
    const instrumentos = tocaInstrumento === 'sim'
        ? paraCaixaAlta(document.getElementById('confirmacaoInstrumentos').value.trim())
        : '';
    const canta = document.querySelector('input[name="confirmacaoCanta"]:checked')?.value || '';
    const equipesServidas = Array.from(document.querySelectorAll('input[name="confirmacaoEquipesServidas"]:checked'))
        .map((checkbox) => checkbox.value);
    atualizarNomeConfirmacao();

    const nomeCompleto = document.getElementById('confirmacaoNome').value.trim();
    const telefone = isCasal
        ? `Esposa: ${telefoneEsposa} | Marido: ${telefoneMarido}`
        : telefoneIndividual;

    if (tipoCadastro === 'externo' && (cpf.length !== 11 || dataNascimento.length !== 8)) {
        mostrarAlerta('CPF deve ter 11 números e data de nascimento deve ter 8 números.', 'warning');
        return;
    }

    if (tipoCadastro === 'externo' && !cpfValido(cpf)) {
        mostrarAlerta('Informe um CPF válido.', 'warning');
        return;
    }

    if (!anoEncontroValido(anoEncontro)) {
        mostrarAlerta('Informe um ano do encontro válido.', 'warning');
        return;
    }

    if (!nomeCompleto) {
        mostrarAlerta(isCasal ? 'Informe como o marido e a esposa gostam de ser chamados.' : 'Informe o nome completo.', 'warning');
        return;
    }

    if (!nomeCracha) {
        mostrarAlerta('Informe o nome para o crachá.', 'warning');
        return;
    }

    if (isCasal && (!telefoneEsposa || !telefoneMarido)) {
        mostrarAlerta('Informe o WhatsApp da esposa e o WhatsApp do marido.', 'warning');
        return;
    }

    if (isCasal && telefoneEsposa && !telefoneEsposaValidacao.valido) {
        mostrarErroTelefoneConfirmacao(`WhatsApp da esposa: ${telefoneEsposaValidacao.erro}`, 'confirmacaoTelefoneEsposa');
        return;
    }

    if (isCasal && telefoneMarido && !telefoneMaridoValidacao.valido) {
        mostrarErroTelefoneConfirmacao(`WhatsApp do marido: ${telefoneMaridoValidacao.erro}`, 'confirmacaoTelefoneMarido');
        return;
    }

    if (!isCasal && !telefone) {
        mostrarAlerta('Informe o telefone WhatsApp.', 'warning');
        return;
    }

    if (!isCasal && telefone && !telefoneIndividualValidacao.valido) {
        mostrarErroTelefoneConfirmacao(telefoneIndividualValidacao.erro, 'confirmacaoTelefone');
        return;
    }

    if (!paroquiaValida(paroquia)) {
        mostrarAlerta('Informe a paróquia à qual você pertence.', 'warning');
        return;
    }

    if (!tocaInstrumento) {
        mostrarAlerta('Informe se você toca algum instrumento.', 'warning');
        return;
    }

    if (tocaInstrumento === 'sim' && !instrumentos) {
        mostrarAlerta('Informe quais instrumentos você toca.', 'warning');
        return;
    }

    if (!canta) {
        mostrarAlerta('Informe se você canta.', 'warning');
        return;
    }

    const restricaoMedica = obterRestricaoConfirmacao('confirmacaoTemRestricaoMedica', 'confirmacaoRestricaoMedica', 'restrição médica');
    if (restricaoMedica.erro) {
        mostrarAlerta(restricaoMedica.erro, 'warning');
        return;
    }

    const restricaoAlimentar = obterRestricaoConfirmacao('confirmacaoTemRestricaoAlimentar', 'confirmacaoRestricaoAlimentar', 'restrição alimentar');
    if (restricaoAlimentar.erro) {
        mostrarAlerta(restricaoAlimentar.erro, 'warning');
        return;
    }

    const restricaoMedicacao = obterRestricaoConfirmacao('confirmacaoTemRestricaoMedicacao', 'confirmacaoRestricaoMedicacao', 'restrição à medicação');
    if (restricaoMedicacao.erro) {
        mostrarAlerta(restricaoMedicacao.erro, 'warning');
        return;
    }

    const body = {
        nome_completo: nomeCompleto,
        nome_cracha: nomeCracha,
        telefone,
        cpf,
        data_nascimento: dataNascimento,
        movimento_origem: movimentoOrigem,
        ano_encontro: anoEncontro,
        paroquia,
        restricao_medica: restricaoMedica.valor,
        restricao_alimentar: restricaoAlimentar.valor,
        restricao_medicacao: restricaoMedicacao.valor,
        toca_instrumento: tocaInstrumento,
        instrumentos,
        canta,
        equipes_servidas: equipesServidas,
        status: modoDesistencia ? statusDesistencia : document.getElementById('confirmacaoStatus').value,
        foto_perfil: fotoPerfil
    };

    try {
        const response = await fetch(`${API_URL}/confirmacao/${encodeURIComponent(token)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        const data = await response.json();

        if (response.ok) {
            mostrarAlerta(modoDesistencia ? 'Atualizacao de dados enviada com sucesso!' : 'Confirmacao enviada com sucesso!', 'success');
            document.getElementById('formConfirmacao').style.display = 'none';
        } else {
            if (erroTelefoneConfirmacao(data.erro)) {
                mostrarErroTelefoneConfirmacao(data.erro, isCasal ? 'confirmacaoTelefoneEsposa' : 'confirmacaoTelefone');
                return;
            }
            const tipo = response.status === 403 ? 'warning' : 'danger';
            mostrarAlerta(data.erro || 'Erro ao enviar confirmação.', tipo);
        }
    } catch (err) {
        mostrarAlerta('Erro ao enviar confirmação.', 'danger');
        console.error(err);
    }
});

function aplicarModoDesistenciaConfirmacao() {
    if (!modoDesistencia) return;

    const campoStatus = document.getElementById('campoConfirmacaoStatus');
    const status = document.getElementById('confirmacaoStatus');
    const botao = document.getElementById('btnEnviarConfirmacao');

    if (campoStatus) campoStatus.style.display = 'none';
    if (status) status.value = statusDesistencia;
    if (botao) botao.textContent = 'Enviar atualização de dados';
}

function atualizarModoConfirmacao() {
    const movimento = document.getElementById('confirmacaoMovimento')?.value || '';
    const isCasal = movimentoOrigemCasal(movimento);
    const dadosIndividual = document.getElementById('confirmacaoDadosIndividual');
    const dadosCasal = document.getElementById('confirmacaoDadosCasal');
    const telefoneIndividual = document.getElementById('confirmacaoTelefoneIndividual');
    const nomeIndividual = document.getElementById('confirmacaoNomeIndividual');
    const nomeMarido = document.getElementById('confirmacaoNomeMarido');
    const nomeEsposa = document.getElementById('confirmacaoNomeEsposa');
    const telefone = document.getElementById('confirmacaoTelefone');
    const telefoneEsposa = document.getElementById('confirmacaoTelefoneEsposa');
    const telefoneMarido = document.getElementById('confirmacaoTelefoneMarido');

    dadosIndividual.style.display = isCasal ? 'none' : 'block';
    telefoneIndividual.style.display = isCasal ? 'none' : 'block';
    dadosCasal.style.display = isCasal ? 'block' : 'none';

    nomeIndividual.required = !isCasal;
    telefone.required = !isCasal;
    nomeMarido.required = isCasal;
    nomeEsposa.required = isCasal;
    telefoneEsposa.required = isCasal;
    telefoneMarido.required = isCasal;
    document.getElementById('confirmacaoNomeCracha').readOnly = isCasal;

    atualizarNomeConfirmacao();
}

function atualizarNomeConfirmacao() {
    const movimento = document.getElementById('confirmacaoMovimento')?.value || '';
    const isCasal = movimentoOrigemCasal(movimento);

    if (isCasal) {
        const nomeMarido = paraCaixaAlta(document.getElementById('confirmacaoNomeMarido')?.value || '');
        const nomeEsposa = paraCaixaAlta(document.getElementById('confirmacaoNomeEsposa')?.value || '');
        document.getElementById('confirmacaoNomeMarido').value = nomeMarido;
        document.getElementById('confirmacaoNomeEsposa').value = nomeEsposa;
        const nomeCasal = nomeMarido && nomeEsposa ? `${nomeMarido} E ${nomeEsposa}` : '';
        document.getElementById('confirmacaoNome').value = nomeCasal;
        document.getElementById('confirmacaoNomeCracha').value = nomeCasal;
        return;
    }

    const nomeIndividual = paraCaixaAlta(document.getElementById('confirmacaoNomeIndividual')?.value || '');
    document.getElementById('confirmacaoNomeIndividual').value = nomeIndividual;
    document.getElementById('confirmacaoNome').value = nomeIndividual;
    document.getElementById('confirmacaoNomeCracha').value = paraCaixaAlta(document.getElementById('confirmacaoNomeCracha')?.value || '');
}

function preencherNomeConfirmacao(nome, movimento) {
    const nomeNormalizado = paraCaixaAlta(nome || '');

    if (movimentoOrigemCasal(movimento) && nomeNormalizado.includes(' E ')) {
        const partes = nomeNormalizado.split(' E ');
        document.getElementById('confirmacaoNomeMarido').value = partes.shift() || '';
        document.getElementById('confirmacaoNomeEsposa').value = partes.join(' E ') || '';
    } else {
        document.getElementById('confirmacaoNomeIndividual').value = nomeNormalizado;
    }

    document.getElementById('confirmacaoNome').value = nomeNormalizado;
}

function preencherTelefoneConfirmacao(telefone, movimento) {
    const telefoneTexto = String(telefone || '');

    if (movimentoOrigemCasal(movimento)) {
        const telefoneEsposa = telefoneTexto.match(/Esposa:\s*([^|]+)/i)?.[1]?.trim() || '';
        const telefoneMarido = telefoneTexto.match(/Marido:\s*(.+)$/i)?.[1]?.trim() || '';
        document.getElementById('confirmacaoTelefoneEsposa').value = telefoneEsposa;
        document.getElementById('confirmacaoTelefoneMarido').value = telefoneMarido;
    } else {
        document.getElementById('confirmacaoTelefone').value = telefoneTexto;
    }
}

function atualizarCampoCrachaConfirmacao(e) {
    e.target.value = paraCaixaAlta(e.target.value);
    atualizarNomeConfirmacao();
}

function atualizarCampoInstrumentosConfirmacao() {
    const tocaInstrumento = document.querySelector('input[name="confirmacaoTocaInstrumento"]:checked')?.value || '';
    const campoInstrumentos = document.getElementById('campoInstrumentosConfirmacao');
    const inputInstrumentos = document.getElementById('confirmacaoInstrumentos');
    const deveMostrar = tocaInstrumento === 'sim';

    campoInstrumentos.style.display = deveMostrar ? 'block' : 'none';
    inputInstrumentos.required = deveMostrar;

    if (!deveMostrar) {
        inputInstrumentos.value = '';
    }
}

function marcarRadioConfirmacao(name, valor) {
    const radio = document.querySelector(`input[name="${name}"][value="${String(valor || '').toLowerCase()}"]`);
    if (radio) radio.checked = true;
}

function preencherEquipesServidasConfirmacao(valor) {
    let equipes = [];
    try {
        equipes = Array.isArray(valor) ? valor : JSON.parse(valor || '[]');
    } catch (err) {
        equipes = [];
    }

    document.querySelectorAll('input[name="confirmacaoEquipesServidas"]').forEach((checkbox) => {
        checkbox.checked = equipes.includes(checkbox.value);
    });
}

function atualizarCampoRestricaoConfirmacao(name, campoId, inputId) {
    const resposta = document.querySelector(`input[name="${name}"]:checked`)?.value || '';
    const campo = document.getElementById(campoId);
    const input = document.getElementById(inputId);
    const deveMostrar = resposta === 'sim';

    campo.style.display = deveMostrar ? 'block' : 'none';
    input.required = deveMostrar;

    if (!deveMostrar) {
        input.value = '';
    }
}

function preencherRestricaoConfirmacao(name, campoId, inputId, valor) {
    const texto = String(valor || '').trim();
    const temRestricao = texto && texto.toLocaleLowerCase('pt-BR') !== 'não' && texto.toLocaleLowerCase('pt-BR') !== 'nao';
    const radio = document.querySelector(`input[name="${name}"][value="${temRestricao ? 'sim' : 'nao'}"]`);
    if (radio) radio.checked = true;
    document.getElementById(inputId).value = temRestricao ? texto : '';
    atualizarCampoRestricaoConfirmacao(name, campoId, inputId);
}

function obterRestricaoConfirmacao(name, inputId, rotulo) {
    const resposta = document.querySelector(`input[name="${name}"]:checked`)?.value || '';
    const texto = document.getElementById(inputId).value.trim();

    if (!resposta) {
        return { erro: `Informe se possui ${rotulo}.` };
    }

    if (resposta === 'sim' && !texto) {
        return { erro: `Descreva qual é a ${rotulo}.` };
    }

    return { valor: resposta === 'sim' ? texto : 'Não' };
}

function movimentoOrigemCasal(movimento) {
    return movimento === 'ECC' || movimento === 'JOVENS EJC CASADOS';
}

function paraCaixaAlta(valor) {
    return String(valor || '').toLocaleUpperCase('pt-BR');
}

function mostrarAlerta(mensagem, tipo) {
    const alerta = document.getElementById('alertaConfirmacao');
    alerta.className = `alert alert-${tipo} mt-3`;
    alerta.textContent = mensagem;
    alerta.style.display = 'block';
    alerta.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function configurarValidacaoNativaConfirmacao() {
    const form = document.getElementById('formConfirmacao');
    const foto = document.getElementById('confirmacaoFoto');

    if (form) {
        form.noValidate = true;
    }

    if (foto) {
        foto.required = false;
    }
}

function erroTelefoneConfirmacao(mensagem) {
    return /faltou o ddd|telefone com ddd|telefone/i.test(String(mensagem || ''));
}

function validarTelefoneConfirmacaoValor(valor, obrigatorio = false) {
    const telefoneCurtoNormalizado = normalizarTelefoneCurtoConfirmacao(valor);

    if (typeof validarTelefoneContatoValor === 'function') {
        return validarTelefoneContatoValor(telefoneCurtoNormalizado, obrigatorio);
    }

    const telefone = telefoneCurtoNormalizado;

    if (!telefone) {
        return {
            valido: !obrigatorio,
            telefone,
            erro: obrigatorio ? 'Informe o telefone WhatsApp.' : ''
        };
    }

    if (telefone.startsWith('9')) {
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

function normalizarTelefoneCurtoConfirmacao(valor) {
    const telefone = String(valor || '').replace(/\D/g, '').slice(0, 11);

    if (telefone.length === 8) {
        return `839${telefone}`;
    }

    if (telefone.length === 9) {
        return `83${telefone}`;
    }

    return telefone;
}

function mostrarErroTelefoneConfirmacao(mensagem, campoId) {
    const campo = document.getElementById(campoId);
    let modalExibido = false;

    if (typeof mostrarModalTelefoneContato === 'function') {
        try {
            mostrarModalTelefoneContato(mensagem);
            modalExibido = true;
        } catch (err) {
            console.warn('Erro ao abrir modal de telefone:', err);
        }
    }

    if (!modalExibido) {
        mostrarAlerta(mensagem, 'warning');
        window.alert(mensagem);
    }

    if (campo) {
        campo.focus();
    }
}

function converterParaBase64(arquivo) {
    return otimizarFotoPerfil(arquivo);
}

function somenteNumeros(valor) {
    return String(valor || '').replace(/\D/g, '');
}

function cpfValido(valor) {
    const cpf = somenteNumeros(valor);

    if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) {
        return false;
    }

    const calcularDigito = (base) => {
        let soma = 0;
        for (let i = 0; i < base.length; i += 1) {
            soma += Number(base[i]) * (base.length + 1 - i);
        }

        const resto = soma % 11;
        return resto < 2 ? 0 : 11 - resto;
    };

    const primeiroDigito = calcularDigito(cpf.slice(0, 9));
    const segundoDigito = calcularDigito(cpf.slice(0, 10));

    return cpf === `${cpf.slice(0, 9)}${primeiroDigito}${segundoDigito}`;
}

function anoEncontroValido(valor) {
    const ano = somenteNumeros(valor);
    const anoAtual = new Date().getFullYear();
    return /^\d{4}$/.test(ano) && Number(ano) >= 1900 && Number(ano) <= anoAtual;
}
