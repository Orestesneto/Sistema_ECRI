const API_URL = 'http://localhost:5000/api';
const TAMANHO_MAXIMO_FOTO_MB = 15;
const TAMANHO_MAXIMO_FOTO_BYTES = TAMANHO_MAXIMO_FOTO_MB * 1024 * 1024;

const params = new URLSearchParams(window.location.search);
const token = params.get('token');
let tipoCadastro = '';

document.addEventListener('DOMContentLoaded', carregarConfirmacao);

['confirmacaoCpf', 'confirmacaoDataNascimento', 'confirmacaoAnoEncontro'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', (e) => {
        e.target.value = somenteNumeros(e.target.value);
    });
});

document.getElementById('confirmacaoFoto')?.addEventListener('change', async (e) => {
    const arquivo = e.target.files[0];
    if (!arquivo) return;

    if (arquivo.size > TAMANHO_MAXIMO_FOTO_BYTES) {
        mostrarAlerta(`A foto deve ter no maximo ${TAMANHO_MAXIMO_FOTO_MB}MB.`, 'warning');
        e.target.value = '';
        return;
    }

    const fotoBase64 = await converterParaBase64(arquivo);
    document.getElementById('fotoConfirmacao').innerHTML =
        `<img src="${fotoBase64}" alt="Foto" style="width:120px; height:120px; border-radius:50%; object-fit:cover;">`;
});

async function carregarConfirmacao() {
    if (!token) {
        mostrarAlerta('Link de confirmacao invalido.', 'danger');
        return;
    }

    try {
        const response = await fetch(`${API_URL}/confirmacao/${encodeURIComponent(token)}`);
        const participante = await response.json();

        if (!response.ok) {
            const tipo = response.status === 403 ? 'warning' : 'danger';
            mostrarAlerta(participante.erro || 'Erro ao carregar confirmacao.', tipo);
            return;
        }

        document.getElementById('confirmacaoNome').value = participante.nome_completo || '';
        document.getElementById('confirmacaoTelefone').value = participante.telefone || '';
        document.getElementById('confirmacaoMovimento').value = participante.movimento_origem || '';
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
    } catch (err) {
        mostrarAlerta('Erro ao carregar confirmacao.', 'danger');
        console.error(err);
    }
}

document.getElementById('formConfirmacao')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const fotoArquivo = document.getElementById('confirmacaoFoto').files[0];
    if (!fotoArquivo) {
        mostrarAlerta('Envie uma foto de perfil para confirmar sua participacao.', 'warning');
        return;
    }

    if (fotoArquivo.size > TAMANHO_MAXIMO_FOTO_BYTES) {
        mostrarAlerta(`A foto deve ter no maximo ${TAMANHO_MAXIMO_FOTO_MB}MB.`, 'warning');
        return;
    }

    const fotoPerfil = await converterParaBase64(fotoArquivo);
    const cpf = somenteNumeros(document.getElementById('confirmacaoCpf')?.value || '');
    const dataNascimento = somenteNumeros(document.getElementById('confirmacaoDataNascimento')?.value || '');
    const anoEncontro = somenteNumeros(document.getElementById('confirmacaoAnoEncontro')?.value || '');

    if (tipoCadastro === 'externo' && (cpf.length !== 11 || dataNascimento.length !== 8)) {
        mostrarAlerta('CPF deve ter 11 numeros e data de nascimento deve ter 8 numeros.', 'warning');
        return;
    }

    if (tipoCadastro === 'externo' && !cpfValido(cpf)) {
        mostrarAlerta('Informe um CPF valido.', 'warning');
        return;
    }

    if (!anoEncontroValido(anoEncontro)) {
        mostrarAlerta('Informe um ano do encontro valido.', 'warning');
        return;
    }

    const body = {
        nome_completo: document.getElementById('confirmacaoNome').value,
        telefone: document.getElementById('confirmacaoTelefone').value,
        cpf,
        data_nascimento: dataNascimento,
        movimento_origem: document.getElementById('confirmacaoMovimento').value,
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
            mostrarAlerta('Confirmacao enviada com sucesso!', 'success');
            document.getElementById('formConfirmacao').style.display = 'none';
        } else {
            const tipo = response.status === 403 ? 'warning' : 'danger';
            mostrarAlerta(data.erro || 'Erro ao enviar confirmacao.', tipo);
        }
    } catch (err) {
        mostrarAlerta('Erro ao enviar confirmacao.', 'danger');
        console.error(err);
    }
});

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
