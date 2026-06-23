const API_URL = 'http://localhost:5000/api';
const TAMANHO_MAXIMO_FOTO_MB = 15;
const TAMANHO_MAXIMO_FOTO_BYTES = TAMANHO_MAXIMO_FOTO_MB * 1024 * 1024;

// Login
document.getElementById('formLogin')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const identificador = document.getElementById('cpfLogin').value.trim();
    const cpf = somenteNumeros(identificador);
    const data_nascimento = somenteNumeros(document.getElementById('dataNascimentoLogin').value);

    if (!identificador.includes('@') && !cpfValido(cpf)) {
        mostrarAlerta('alertaLogin', 'Informe um CPF valido', 'warning');
        return;
    }

    if (data_nascimento.length !== 8) {
        mostrarAlerta('alertaLogin', 'Informe a data de nascimento com 8 numeros', 'warning');
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(identificador.includes('@')
                ? { email: identificador, senha: data_nascimento }
                : { cpf, data_nascimento })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            localStorage.setItem('token', data.token);
            localStorage.setItem('usuario', JSON.stringify(data.usuario));
            
            // Redirecionar baseado no perfil
            if (data.usuario.perfil === 'equipista') {
                window.location.href = 'equipista.html';
            } else if (data.usuario.perfil === 'coordenador') {
                window.location.href = 'coordenador.html';
            } else if (data.usuario.perfil === 'equipe_dirigente') {
                window.location.href = 'dirigentes.html';
            }
        } else {
            mostrarAlerta('alertaLogin', data.erro, 'danger');
        }
    } catch (err) {
        mostrarAlerta('alertaLogin', 'Erro ao conectar ao servidor', 'danger');
        console.error(err);
    }
});

// Registro
document.getElementById('formRegistro')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const cpf = somenteNumeros(document.getElementById('cpfRegistro').value);
    const data_nascimento = somenteNumeros(document.getElementById('dataNascimentoRegistro').value);
    atualizarNomesRegistro();
    const nome_completo = document.getElementById('nomeCompleto').value;
    const nome_cracha = document.getElementById('nomeCracha').value;
    const fotoPerfil = document.getElementById('fotoPerfilRegistro').files[0];
    const telefone = document.getElementById('telefone').value;
    const movimentoSelecionado = document.querySelector('input[name="movimento"]:checked');
    const movimento_origem = movimentoSelecionado ? movimentoSelecionado.value : '';
    const ano_encontro = somenteNumeros(document.getElementById('anoEncontroRegistro').value);
    const toca_instrumento = document.querySelector('input[name="tocaInstrumento"]:checked')?.value || '';
    const instrumentos = toca_instrumento === 'sim'
        ? paraCaixaAlta(document.getElementById('instrumentosRegistro').value.trim())
        : '';
    const canta = document.querySelector('input[name="canta"]:checked')?.value || '';
    const equipes_servidas = Array.from(document.querySelectorAll('input[name="equipesServidas"]:checked'))
        .map((checkbox) => checkbox.value);

    if (!cpfValido(cpf)) {
        mostrarAlerta('alertaLogin', 'Informe um CPF valido', 'warning');
        return;
    }

    if (data_nascimento.length !== 8) {
        mostrarAlerta('alertaLogin', 'Informe a data de nascimento com 8 numeros', 'warning');
        return;
    }

    if (!nome_completo || !nome_cracha) {
        mostrarAlerta('alertaLogin', movimentoOrigemCasal(movimento_origem)
            ? 'Informe o nome do marido e o nome da esposa'
            : 'Informe o nome completo e o nome para o cracha', 'warning');
        return;
    }

    if (!anoEncontroValido(ano_encontro)) {
        mostrarAlerta('alertaLogin', 'Informe um ano do encontro valido', 'warning');
        return;
    }

    if (!toca_instrumento) {
        mostrarAlerta('alertaLogin', 'Informe se voce toca algum instrumento', 'warning');
        return;
    }

    if (toca_instrumento === 'sim' && !instrumentos) {
        mostrarAlerta('alertaLogin', 'Informe quais instrumentos voce toca', 'warning');
        return;
    }

    if (!canta) {
        mostrarAlerta('alertaLogin', 'Informe se voce canta', 'warning');
        return;
    }

    if (!fotoPerfil) {
        mostrarAlerta('alertaLogin', 'A foto de perfil e obrigatoria', 'warning');
        return;
    }

    if (!fotoDentroDoLimite(fotoPerfil)) {
        mostrarAlerta('alertaLogin', `A foto deve ter no maximo ${TAMANHO_MAXIMO_FOTO_MB}MB`, 'warning');
        return;
    }

    const foto_perfil = await converterParaBase64(fotoPerfil);
    
    try {
        const response = await fetch(`${API_URL}/auth/registro`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                cpf,
                data_nascimento,
                nome_completo,
                nome_cracha,
                telefone,
                movimento_origem,
                ano_encontro,
                foto_perfil,
                toca_instrumento,
                instrumentos,
                canta,
                equipes_servidas
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            mostrarAlerta('alertaLogin', 'Conta criada com sucesso! Faça login.', 'success');
            document.getElementById('formRegistro').reset();
            document.getElementById('dadosCasalRegistro').style.display = 'none';
            document.getElementById('dadosIndividualRegistro').style.display = 'none';
            document.getElementById('nomeCracha').readOnly = true;
            document.getElementById('campoInstrumentosRegistro').style.display = 'none';
            document.getElementById('instrumentosRegistro').required = false;
            document.getElementById('fotoPreviewRegistro').src = '';
            document.getElementById('fotoPreviewRegistro').style.display = 'none';
            
            // Voltar para aba de login
            setTimeout(() => {
                document.querySelector('[href="#login"]').click();
            }, 1500);
        } else {
            mostrarAlerta('alertaLogin', data.erro, 'danger');
        }
    } catch (err) {
        mostrarAlerta('alertaLogin', 'Erro ao criar conta', 'danger');
        console.error(err);
    }
});

document.querySelectorAll('input[name="movimento"]').forEach((radio) => {
    radio.addEventListener('change', () => {
        atualizarModoRegistro();
    });
});

document.getElementById('nomeCompletoIndividual')?.addEventListener('input', atualizarNomesRegistro);
document.getElementById('nomeCracha')?.addEventListener('input', atualizarCampoMaiusculo);
document.getElementById('nomeEsposa')?.addEventListener('input', atualizarNomesRegistro);
document.getElementById('nomeMarido')?.addEventListener('input', atualizarNomesRegistro);
document.getElementById('cpfLogin')?.addEventListener('input', limitarCampoNumerico);
document.getElementById('dataNascimentoLogin')?.addEventListener('input', limitarCampoNumerico);
document.getElementById('cpfRegistro')?.addEventListener('input', limitarCampoNumerico);
document.getElementById('dataNascimentoRegistro')?.addEventListener('input', limitarCampoNumerico);
document.getElementById('anoEncontroRegistro')?.addEventListener('input', limitarCampoNumerico);
document.getElementById('instrumentosRegistro')?.addEventListener('input', (e) => {
    e.target.value = paraCaixaAlta(e.target.value);
});
document.querySelectorAll('input[name="tocaInstrumento"]').forEach((radio) => {
    radio.addEventListener('change', atualizarCampoInstrumentos);
});

function atualizarModoRegistro() {
    const movimento = document.querySelector('input[name="movimento"]:checked')?.value || '';
    const isCasal = movimentoOrigemCasal(movimento);

    document.getElementById('dadosIndividualRegistro').style.display = movimento && !isCasal ? 'block' : 'none';
    document.getElementById('dadosCasalRegistro').style.display = isCasal ? 'block' : 'none';
    document.getElementById('nomeCracha').readOnly = isCasal;

    if (isCasal) {
        document.getElementById('nomeCompletoIndividual').value = '';
    } else if (movimento) {
        document.getElementById('nomeMarido').value = '';
        document.getElementById('nomeEsposa').value = '';
        document.getElementById('nomeCracha').value = '';
    }

    atualizarNomesRegistro();
}

function atualizarNomesRegistro() {
    const movimento = document.querySelector('input[name="movimento"]:checked')?.value || '';
    const isCasal = movimentoOrigemCasal(movimento);

    if (isCasal) {
        const nomeMarido = paraCaixaAlta(document.getElementById('nomeMarido')?.value || '');
        const nomeEsposa = paraCaixaAlta(document.getElementById('nomeEsposa')?.value || '');
        document.getElementById('nomeMarido').value = nomeMarido;
        document.getElementById('nomeEsposa').value = nomeEsposa;

        const nomeCasal = nomeMarido && nomeEsposa ? `${nomeMarido} E ${nomeEsposa}` : '';
        document.getElementById('nomeCompleto').value = nomeCasal;
        document.getElementById('nomeCracha').value = nomeCasal;
        return;
    }

    const nomeCompleto = paraCaixaAlta(document.getElementById('nomeCompletoIndividual')?.value || '');
    const nomeCracha = paraCaixaAlta(document.getElementById('nomeCracha')?.value || '');
    document.getElementById('nomeCompletoIndividual').value = nomeCompleto;
    document.getElementById('nomeCompleto').value = nomeCompleto;
    document.getElementById('nomeCracha').value = nomeCracha;
}

function movimentoOrigemCasal(movimento) {
    return movimento === 'ECC' || movimento === 'JOVENS EJC CASADOS';
}

function atualizarCampoInstrumentos() {
    const tocaInstrumento = document.querySelector('input[name="tocaInstrumento"]:checked')?.value || '';
    const campoInstrumentos = document.getElementById('campoInstrumentosRegistro');
    const inputInstrumentos = document.getElementById('instrumentosRegistro');
    const deveMostrar = tocaInstrumento === 'sim';

    campoInstrumentos.style.display = deveMostrar ? 'block' : 'none';
    inputInstrumentos.required = deveMostrar;

    if (!deveMostrar) {
        inputInstrumentos.value = '';
    }
}

function atualizarCampoMaiusculo(e) {
    e.target.value = paraCaixaAlta(e.target.value);
    atualizarNomesRegistro();
}

function paraCaixaAlta(valor) {
    return valor.toLocaleUpperCase('pt-BR');
}

function somenteNumeros(valor) {
    return String(valor || '').replace(/\D/g, '');
}

function limitarCampoNumerico(e) {
    e.target.value = somenteNumeros(e.target.value);
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

document.getElementById('fotoPerfilRegistro')?.addEventListener('change', async (e) => {
    const fotoPerfil = e.target.files[0];
    const preview = document.getElementById('fotoPreviewRegistro');

    if (!fotoPerfil) {
        preview.src = '';
        preview.style.display = 'none';
        return;
    }

    if (!fotoDentroDoLimite(fotoPerfil)) {
        mostrarAlerta('alertaLogin', `A foto deve ter no maximo ${TAMANHO_MAXIMO_FOTO_MB}MB`, 'warning');
        e.target.value = '';
        preview.src = '';
        preview.style.display = 'none';
        return;
    }

    preview.src = await converterParaBase64(fotoPerfil);
    preview.style.display = 'block';
});

function converterParaBase64(arquivo) {
    return new Promise((resolve, reject) => {
        const leitor = new FileReader();
        leitor.onload = () => resolve(leitor.result);
        leitor.onerror = reject;
        leitor.readAsDataURL(arquivo);
    });
}

function fotoDentroDoLimite(arquivo) {
    return arquivo.size <= TAMANHO_MAXIMO_FOTO_BYTES;
}

function mostrarAlerta(elementId, mensagem, tipo) {
    const alerta = document.getElementById(elementId);
    alerta.className = `alert alert-${tipo}`;
    alerta.textContent = mensagem;
    alerta.style.display = 'block';
}

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
    window.location.href = 'index.html';
}

function getToken() {
    return localStorage.getItem('token');
}

function getHeaders() {
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getToken()}`
    };
}
