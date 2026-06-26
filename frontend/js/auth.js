const API_URL = window.location.protocol === 'file:' ? 'http://localhost:5000/api' : window.location.origin + '/api';
const TAMANHO_MAXIMO_FOTO_MB = 3;
const TAMANHO_MAXIMO_FOTO_BYTES = TAMANHO_MAXIMO_FOTO_MB * 1024 * 1024;

// Login
document.getElementById('formLogin')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const cpf = somenteNumeros(document.getElementById('cpfLogin').value);
    const data_nascimento = somenteNumeros(document.getElementById('dataNascimentoLogin').value);

    if (!cpfValido(cpf)) {
        mostrarAlerta('alertaLogin', 'Informe um CPF válido', 'warning');
        return;
    }

    if (data_nascimento.length !== 8) {
        mostrarAlerta('alertaLogin', 'Informe a data de nascimento com 8 números', 'warning');
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cpf, data_nascimento })
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
    const paroquia = obterParoquia('paroquiaRegistro', 'outraParoquiaRegistro');
    const movimentoSelecionado = document.querySelector('input[name="movimento"]:checked');
    const movimento_origem = movimentoSelecionado ? movimentoSelecionado.value : '';
    const isCasal = movimentoOrigemCasal(movimento_origem);
    const telefoneEsposa = document.getElementById('telefoneEsposa')?.value.trim() || '';
    const telefoneMarido = document.getElementById('telefoneMarido')?.value.trim() || '';
    const telefone = isCasal
        ? `Esposa: ${telefoneEsposa} | Marido: ${telefoneMarido}`
        : document.getElementById('telefone').value.trim();
    const ano_encontro = somenteNumeros(document.getElementById('anoEncontroRegistro').value);
    const toca_instrumento = document.querySelector('input[name="tocaInstrumento"]:checked')?.value || '';
    const instrumentos = toca_instrumento === 'sim'
        ? paraCaixaAlta(document.getElementById('instrumentosRegistro').value.trim())
        : '';
    const canta = document.querySelector('input[name="canta"]:checked')?.value || '';
    const equipes_servidas = Array.from(document.querySelectorAll('input[name="equipesServidas"]:checked'))
        .map((checkbox) => checkbox.value);

    const pendencias = [];

    if (!movimento_origem) pendencias.push('Selecione o movimento de origem.');
    if (!cpfValido(cpf)) pendencias.push('Informe um CPF válido com 11 números.');
    if (data_nascimento.length !== 8) pendencias.push('Informe a data de nascimento com 8 números, no formato DDMMAAAA.');
    if (isCasal && (!document.getElementById('nomeMarido').value.trim() || !document.getElementById('nomeEsposa').value.trim())) pendencias.push('Informe o nome do marido e o nome da esposa.');
    if (!isCasal && !nome_completo) pendencias.push('Informe o nome completo.');
    if (!nome_cracha) pendencias.push('Informe o nome para o crachá.');
    if (isCasal && (!telefoneEsposa || !telefoneMarido)) pendencias.push('Informe o WhatsApp da esposa e o WhatsApp do marido.');
    if (!isCasal && !telefone) pendencias.push('Informe o telefone WhatsApp.');
    if (!anoEncontroValido(ano_encontro)) pendencias.push('Informe um ano do encontro válido.');
    if (!paroquiaValida(paroquia)) pendencias.push('Informe a paróquia à qual você pertence.');
    if (!toca_instrumento) pendencias.push('Informe se você toca algum instrumento.');
    if (toca_instrumento === 'sim' && !instrumentos) pendencias.push('Informe quais instrumentos você toca.');
    if (!canta) pendencias.push('Informe se você canta.');
    if (!fotoPerfil) pendencias.push('Selecione uma foto de perfil.');
    if (fotoPerfil && !fotoDentroDoLimite(fotoPerfil)) pendencias.push(`A foto deve ser JPG, JPEG, PNG ou WEBP e ter no máximo ${TAMANHO_MAXIMO_FOTO_MB}MB.`);

    if (pendencias.length) {
        mostrarModalErroRegistro('Não foi possível criar o cadastro ainda. Confira os itens abaixo:', pendencias);
        return;
    }

    let foto_perfil;
    try {
        foto_perfil = await converterParaBase64(fotoPerfil);
    } catch (err) {
        mostrarModalErroRegistro(err.message || 'Erro ao carregar a foto.', ['Selecione outra imagem e tente novamente.']);
        return;
    }
    
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
                paroquia,
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
            document.getElementById('telefoneIndividualRegistro').style.display = 'block';
            document.getElementById('telefone').required = true;
            document.getElementById('telefoneEsposa').required = false;
            document.getElementById('telefoneMarido').required = false;
            document.getElementById('nomeCracha').readOnly = true;
            document.getElementById('campoInstrumentosRegistro').style.display = 'none';
            document.getElementById('instrumentosRegistro').required = false;
            document.getElementById('campoOutraParoquiaRegistro').style.display = 'none';
            document.getElementById('outraParoquiaRegistro').required = false;
            document.getElementById('fotoPreviewRegistro').src = '';
            document.getElementById('fotoPreviewRegistro').style.display = 'none';
            
            // Voltar para aba de login
            setTimeout(() => {
                document.querySelector('[href="#login"]').click();
            }, 1500);
        } else {
            mostrarModalErroRegistro(data.erro || 'Erro ao criar conta.', []);
        }
    } catch (err) {
        mostrarModalErroRegistro('Erro ao criar conta.', ['Verifique sua conexão e tente novamente.']);
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
configurarCampoParoquia('paroquiaRegistro', 'campoOutraParoquiaRegistro');
document.getElementById('instrumentosRegistro')?.addEventListener('input', (e) => {
    e.target.value = paraCaixaAlta(e.target.value);
});
document.querySelectorAll('input[name="tocaInstrumento"]').forEach((radio) => {
    radio.addEventListener('change', atualizarCampoInstrumentos);
});

function atualizarModoRegistro() {
    const movimento = document.querySelector('input[name="movimento"]:checked')?.value || '';
    const isCasal = movimentoOrigemCasal(movimento);
    const telefoneIndividual = document.getElementById('telefoneIndividualRegistro');
    const telefone = document.getElementById('telefone');
    const telefoneEsposa = document.getElementById('telefoneEsposa');
    const telefoneMarido = document.getElementById('telefoneMarido');

    document.getElementById('dadosIndividualRegistro').style.display = movimento && !isCasal ? 'block' : 'none';
    document.getElementById('dadosCasalRegistro').style.display = isCasal ? 'block' : 'none';
    document.getElementById('nomeCracha').readOnly = isCasal;
    telefoneIndividual.style.display = isCasal ? 'none' : 'block';
    telefone.required = !isCasal;
    telefoneEsposa.required = isCasal;
    telefoneMarido.required = isCasal;

    if (isCasal) {
        document.getElementById('nomeCompletoIndividual').value = '';
        telefone.value = '';
    } else if (movimento) {
        document.getElementById('nomeMarido').value = '';
        document.getElementById('nomeEsposa').value = '';
        telefoneEsposa.value = '';
        telefoneMarido.value = '';
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
        mostrarModalErroRegistro('A foto selecionada não pode ser usada.', [`A foto deve ser JPG, JPEG, PNG ou WEBP e ter no máximo ${TAMANHO_MAXIMO_FOTO_MB}MB.`]);
        e.target.value = '';
        preview.src = '';
        preview.style.display = 'none';
        return;
    }

    try {
        preview.src = await converterParaBase64(fotoPerfil);
    } catch (err) {
        mostrarModalErroRegistro(err.message || 'Erro ao carregar a foto.', ['Selecione outra imagem e tente novamente.']);
        e.target.value = '';
        preview.src = '';
        preview.style.display = 'none';
        return;
    }
    preview.style.display = 'block';
});

function converterParaBase64(arquivo) {
    return otimizarFotoPerfil(arquivo);
}

function fotoDentroDoLimite(arquivo) {
    return fotoPerfilTipoAceito(arquivo) && arquivo.size <= TAMANHO_MAXIMO_FOTO_BYTES;
}

function mostrarAlerta(elementId, mensagem, tipo) {
    const alerta = document.getElementById(elementId);
    alerta.className = `alert alert-${tipo}`;
    alerta.textContent = mensagem;
    alerta.style.display = 'block';
}

function mostrarModalErroRegistro(mensagem, itens = []) {
    const modalEl = document.getElementById('modalErroRegistro');
    const mensagemEl = document.getElementById('modalErroRegistroMensagem');
    const listaEl = document.getElementById('modalErroRegistroLista');

    if (!modalEl || !mensagemEl || !listaEl) {
        mostrarAlerta('alertaLogin', [mensagem, ...itens].filter(Boolean).join(' '), 'warning');
        return;
    }

    mensagemEl.textContent = mensagem;
    listaEl.innerHTML = itens.length
        ? itens.map((item) => `<li>${escapeHtml(item)}</li>`).join('')
        : '';
    listaEl.style.display = itens.length ? 'block' : 'none';

    new bootstrap.Modal(modalEl).show();
}

function escapeHtml(valor) {
    return String(valor || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
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
