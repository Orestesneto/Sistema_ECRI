const API_URL = window.location.protocol === 'file:' ? 'http://localhost:5000/api' : window.location.origin + '/api';
const TAMANHO_MAXIMO_FOTO_MB = 2;
const TAMANHO_MAXIMO_FOTO_BYTES = TAMANHO_MAXIMO_FOTO_MB * 1024 * 1024;

const params = new URLSearchParams(window.location.search);
const token = params.get('token');
let tipoCadastro = '';

document.addEventListener('DOMContentLoaded', carregarConfirmacao);
document.getElementById('confirmacaoMovimento')?.addEventListener('change', atualizarModoConfirmacao);
document.getElementById('confirmacaoNomeIndividual')?.addEventListener('input', atualizarNomeConfirmacao);
document.getElementById('confirmacaoNomeMarido')?.addEventListener('input', atualizarNomeConfirmacao);
document.getElementById('confirmacaoNomeEsposa')?.addEventListener('input', atualizarNomeConfirmacao);

['confirmacaoCpf', 'confirmacaoDataNascimento', 'confirmacaoAnoEncontro'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', (e) => {
        e.target.value = somenteNumeros(e.target.value);
    });
});

document.getElementById('confirmacaoFoto')?.addEventListener('change', async (e) => {
    const arquivo = e.target.files[0];
    if (!arquivo) return;

    if (arquivo.size > TAMANHO_MAXIMO_FOTO_BYTES) {
        mostrarAlerta(`A foto deve ter no máximo ${TAMANHO_MAXIMO_FOTO_MB}MB.`, 'warning');
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
        document.getElementById('confirmacaoRestricaoMedica').value = participante.restricao_medica || '';
        document.getElementById('confirmacaoRestricaoAlimentar').value = participante.restricao_alimentar || '';
        document.getElementById('confirmacaoRestricaoMedicacao').value = participante.restricao_medicacao || '';
        tipoCadastro = participante.tipo_cadastro || '';

        if (tipoCadastro === 'externo') {
            document.getElementById('dadosLoginSemCadastro').style.display = 'block';
            document.getElementById('confirmacaoCpf').required = true;
            document.getElementById('confirmacaoDataNascimento').required = true;
            document.getElementById('confirmacaoCpf').value = somenteNumeros(participante.cpf || '');
            document.getElementById('confirmacaoDataNascimento').value = somenteNumeros(participante.data_nascimento || '');
        }

        document.getElementById('fotoConfirmacao').innerHTML = participante.foto_perfil
            ? `<img src="${participante.foto_perfil}" alt="Foto" style="width:120px; height:120px; border-radius:50%; object-fit:cover;">`
            : '<div class="mx-auto" style="width:120px; height:120px; border-radius:50%; background:#ddd; display:flex; align-items:center; justify-content:center;">-</div>';

        document.getElementById('formConfirmacao').style.display = 'block';
        atualizarModoConfirmacao();
    } catch (err) {
        mostrarAlerta('Erro ao carregar confirmação.', 'danger');
        console.error(err);
    }
}

document.getElementById('formConfirmacao')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const fotoArquivo = document.getElementById('confirmacaoFoto').files[0];
    if (!fotoArquivo) {
        mostrarAlerta('Envie uma foto de perfil para confirmar sua participação.', 'warning');
        return;
    }

    if (fotoArquivo.size > TAMANHO_MAXIMO_FOTO_BYTES) {
        mostrarAlerta(`A foto deve ter no máximo ${TAMANHO_MAXIMO_FOTO_MB}MB.`, 'warning');
        return;
    }

    let fotoPerfil;
    try {
        fotoPerfil = await converterParaBase64(fotoArquivo);
    } catch (err) {
        mostrarAlerta(err.message || 'Erro ao otimizar a foto', 'warning');
        return;
    }
    const cpf = somenteNumeros(document.getElementById('confirmacaoCpf')?.value || '');
    const dataNascimento = somenteNumeros(document.getElementById('confirmacaoDataNascimento')?.value || '');
    const anoEncontro = somenteNumeros(document.getElementById('confirmacaoAnoEncontro')?.value || '');
    const movimentoOrigem = document.getElementById('confirmacaoMovimento').value;
    const isCasal = movimentoOrigemCasal(movimentoOrigem);
    const telefoneEsposa = document.getElementById('confirmacaoTelefoneEsposa')?.value.trim() || '';
    const telefoneMarido = document.getElementById('confirmacaoTelefoneMarido')?.value.trim() || '';
    atualizarNomeConfirmacao();

    const nomeCompleto = document.getElementById('confirmacaoNome').value.trim();
    const telefone = isCasal
        ? `Esposa: ${telefoneEsposa} | Marido: ${telefoneMarido}`
        : document.getElementById('confirmacaoTelefone').value.trim();

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

    if (isCasal && (!telefoneEsposa || !telefoneMarido)) {
        mostrarAlerta('Informe o WhatsApp da esposa e o WhatsApp do marido.', 'warning');
        return;
    }

    if (!isCasal && !telefone) {
        mostrarAlerta('Informe o telefone WhatsApp.', 'warning');
        return;
    }

    const body = {
        nome_completo: nomeCompleto,
        telefone,
        cpf,
        data_nascimento: dataNascimento,
        movimento_origem: movimentoOrigem,
        ano_encontro: anoEncontro,
        restricao_medica: document.getElementById('confirmacaoRestricaoMedica').value,
        restricao_alimentar: document.getElementById('confirmacaoRestricaoAlimentar').value,
        restricao_medicacao: document.getElementById('confirmacaoRestricaoMedicacao').value,
        status: document.getElementById('confirmacaoStatus').value,
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
            mostrarAlerta('Confirmação enviada com sucesso!', 'success');
            document.getElementById('formConfirmacao').style.display = 'none';
        } else {
            const tipo = response.status === 403 ? 'warning' : 'danger';
            mostrarAlerta(data.erro || 'Erro ao enviar confirmação.', tipo);
        }
    } catch (err) {
        mostrarAlerta('Erro ao enviar confirmação.', 'danger');
        console.error(err);
    }
});

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
        document.getElementById('confirmacaoNome').value = nomeMarido && nomeEsposa ? `${nomeMarido} E ${nomeEsposa}` : '';
        return;
    }

    const nomeIndividual = paraCaixaAlta(document.getElementById('confirmacaoNomeIndividual')?.value || '');
    document.getElementById('confirmacaoNomeIndividual').value = nomeIndividual;
    document.getElementById('confirmacaoNome').value = nomeIndividual;
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
}

function converterParaBase64(arquivo) {
    return new Promise((resolve, reject) => {
        const leitor = new FileReader();
        leitor.onload = () => resolve(leitor.result);
        leitor.onerror = reject;
        leitor.readAsDataURL(arquivo);
    });
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
