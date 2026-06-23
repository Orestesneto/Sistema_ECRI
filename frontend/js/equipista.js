const API_URL = 'http://localhost:5000/api';
const TAMANHO_MAXIMO_FOTO_MB = 15;
const TAMANHO_MAXIMO_FOTO_BYTES = TAMANHO_MAXIMO_FOTO_MB * 1024 * 1024;
const TAXAS_POR_MOVIMENTO = {
    EC: 25,
    EJC: 25,
    ECC: 35,
    'JOVENS EJC CASADOS': 35,
    ECRI: 15
};
let movimentoOrigemUsuario = '';

// Verificar se está autenticado
if (!getToken()) {
    window.location.href = 'index.html';
}

// Carregar dados ao abrir a página
document.addEventListener('DOMContentLoaded', () => {
    const usuario = JSON.parse(localStorage.getItem('usuario'));
    document.getElementById('nomeUsuario').textContent = usuario.nome_completo;
    renderizarCamposExperiencia('camposExperienciaEquipista', 'equipista');
    
    carregarPerfil();
    carregarStatus();
});

// Carregar perfil do equipista
async function carregarPerfil() {
    try {
        const response = await fetch(`${API_URL}/equipista/perfil`, {
            headers: getHeaders()
        });
        
        const usuario = await response.json();
        
        document.getElementById('email').value = usuario.email;
        document.getElementById('nomeCompleto').value = usuario.nome_completo;
        document.getElementById('nomeCracha').value = usuario.nome_cracha || '';
        document.getElementById('telefone').value = usuario.telefone;
        movimentoOrigemUsuario = usuario.movimento_origem || '';
        marcarMovimentoOrigem('movimento', usuario.movimento_origem);
        document.getElementById('anoEncontro').value = usuario.ano_encontro || '';
        document.getElementById('restricaoMedica').value = usuario.restricao_medica || '';
        document.getElementById('restricaoAlimentar').value = usuario.restricao_alimentar || '';
        document.getElementById('restricaoMedicacao').value = usuario.restricao_medicacao || '';
        carregarExperienciaPerfil('equipista', usuario);
        
        if (usuario.foto_perfil) {
            document.getElementById('fotoPreview').src = usuario.foto_perfil;
            document.getElementById('fotoPreview').style.display = 'block';
        }
    } catch (err) {
        console.error(err);
    }
}

// Atualizar perfil
document.getElementById('formPerfil')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const nomeCracha = document.getElementById('nomeCracha').value;
    const movimento = obterMovimentoOrigem('movimento');
    const anoEncontro = somenteNumeros(document.getElementById('anoEncontro').value);
    const restricaoMedica = document.getElementById('restricaoMedica').value;
    const restricaoAlimentar = document.getElementById('restricaoAlimentar').value;
    const restricaoMedicacao = document.getElementById('restricaoMedicacao').value;
    const fotoPerfil = document.getElementById('fotoPerfil').files[0];
    
    let fotoBase64 = obterFotoPerfilPreview('fotoPreview');

    if (!anoEncontroValido(anoEncontro)) {
        mostrarAlerta('alertaEquipista', 'Informe um ano do encontro valido', 'warning');
        return;
    }
    
    if (fotoPerfil) {
        if (!fotoDentroDoLimite(fotoPerfil)) {
            mostrarAlerta('alertaEquipista', `A foto deve ter no máximo ${TAMANHO_MAXIMO_FOTO_MB}MB`, 'warning');
            return;
        }

        fotoBase64 = await converterParaBase64(fotoPerfil);
        document.getElementById('fotoPreview').src = fotoBase64;
        document.getElementById('fotoPreview').style.display = 'block';
    }
    
    try {
        const response = await fetch(`${API_URL}/equipista/perfil`, {
            method: 'PUT',
            headers: getHeaders(),
            body: JSON.stringify({
                nome_cracha: nomeCracha,
                movimento_origem: movimento,
                ano_encontro: anoEncontro,
                restricao_medica: restricaoMedica,
                restricao_alimentar: restricaoAlimentar,
                restricao_medicacao: restricaoMedicacao,
                foto_perfil: fotoBase64,
                ...obterExperienciaPerfil('equipista')
            })
        });
        
        if (response.ok) {
            movimentoOrigemUsuario = movimento;
            mostrarAlerta('alertaEquipista', 'Perfil atualizado com sucesso!', 'success');
        } else {
            const mensagem = await lerErroResposta(response, 'Erro ao atualizar perfil');
            mostrarAlerta('alertaEquipista', mensagem, 'danger');
        }
    } catch (err) {
        mostrarAlerta('alertaEquipista', 'Erro ao atualizar perfil', 'danger');
        console.error(err);
    }
});

// Remover o handler do formRestricoes pois agora tudo é feito em formPerfil
document.getElementById('formRestricoes')?.addEventListener('submit', (e) => {
    e.preventDefault();
    document.getElementById('formPerfil').dispatchEvent(new Event('submit'));
});

// Solicitar blusa
document.getElementById('formBlusa')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const tamanho = document.getElementById('tamanho').value;
    
    try {
        const response = await fetch(`${API_URL}/equipista/solicitar-blusa`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ tamanho })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            mostrarAlerta('alertaEquipista', 'Blusa solicitada com sucesso!', 'success');
            document.getElementById('formBlusa').reset();
            carregarStatus();
        } else {
            mostrarAlerta('alertaEquipista', data.erro, 'danger');
        }
    } catch (err) {
        mostrarAlerta('alertaEquipista', 'Erro ao solicitar blusa', 'danger');
        console.error(err);
    }
});

document.getElementById('tipoPagamento')?.addEventListener('change', atualizarValorPagamento);
document.getElementById('anoEncontro')?.addEventListener('input', limitarCampoNumerico);

function atualizarValorPagamento() {
    const tipo = document.getElementById('tipoPagamento').value;
    const valorInput = document.getElementById('valorPagamento');

    if (tipo === 'taxa') {
        const valorTaxa = TAXAS_POR_MOVIMENTO[movimentoOrigemUsuario] || '';
        valorInput.value = valorTaxa;
        valorInput.readOnly = true;
        return;
    }

    valorInput.readOnly = false;
    valorInput.value = '';
}

// Solicitar pagamento
document.getElementById('formPagamento')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const tipo = document.getElementById('tipoPagamento').value;
    const valor = parseFloat(document.getElementById('valorPagamento').value);
    
    try {
        const response = await fetch(`${API_URL}/equipista/solicitar-pagamento`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ tipo, valor })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            mostrarAlerta('alertaEquipista', 'Pagamento solicitado com sucesso!', 'success');
            document.getElementById('formPagamento').reset();
            document.getElementById('valorPagamento').readOnly = false;
            carregarStatus();
        } else {
            mostrarAlerta('alertaEquipista', data.erro, 'danger');
        }
    } catch (err) {
        mostrarAlerta('alertaEquipista', 'Erro ao solicitar pagamento', 'danger');
        console.error(err);
    }
});

// Carregar status de pagamentos e blusas
async function carregarStatus() {
    try {
        const response = await fetch(`${API_URL}/equipista/status`, {
            headers: getHeaders()
        });
        
        const data = await response.json();
        
        // Renderizar pagamentos
        let htmlPagamentos = '<table class="table table-sm"><thead><tr><th>Tipo</th><th>Valor</th><th>Status</th></tr></thead><tbody>';
        data.pagamentos.forEach(p => {
            const badge = p.status === 'confirmado' ? '<span class="badge bg-success">Confirmado</span>' : '<span class="badge bg-warning">Pendente</span>';
            htmlPagamentos += `<tr><td>${p.tipo}</td><td>R$ ${p.valor.toFixed(2)}</td><td>${badge}</td></tr>`;
        });
        htmlPagamentos += '</tbody></table>';
        document.getElementById('listaPagamentos').innerHTML = htmlPagamentos;
        
        // Renderizar blusas
        let htmlBlusas = '<table class="table table-sm"><thead><tr><th>Tamanho</th><th>Status</th></tr></thead><tbody>';
        data.blusas.forEach(b => {
            const badge = b.status === 'confirmado' ? '<span class="badge bg-success">Confirmado</span>' : '<span class="badge bg-warning">Pendente</span>';
            htmlBlusas += `<tr><td>${b.tamanho}</td><td>${badge}</td></tr>`;
        });
        htmlBlusas += '</tbody></table>';
        document.getElementById('listaBlusas').innerHTML = htmlBlusas;
    } catch (err) {
        console.error(err);
    }
}

function converterParaBase64(arquivo) {
    return new Promise((resolve, reject) => {
        const leitor = new FileReader();
        leitor.onload = () => resolve(leitor.result);
        leitor.onerror = reject;
        leitor.readAsDataURL(arquivo);
    });
}

function marcarMovimentoOrigem(name, valor) {
    const opcao = document.querySelector(`input[name="${name}"][value="${valor || ''}"]`);
    if (opcao) {
        opcao.checked = true;
    }
}

function obterMovimentoOrigem(name) {
    const opcao = document.querySelector(`input[name="${name}"]:checked`);
    return opcao ? opcao.value : '';
}

function obterFotoPerfilPreview(id) {
    const src = document.getElementById(id).src || '';
    return src.startsWith('data:image/') ? src : '';
}

function fotoDentroDoLimite(arquivo) {
    return arquivo.size <= TAMANHO_MAXIMO_FOTO_BYTES;
}

function somenteNumeros(valor) {
    return String(valor || '').replace(/\D/g, '');
}

function limitarCampoNumerico(e) {
    e.target.value = somenteNumeros(e.target.value);
}

function anoEncontroValido(valor) {
    const ano = somenteNumeros(valor);
    const anoAtual = new Date().getFullYear();
    return /^\d{4}$/.test(ano) && Number(ano) >= 1900 && Number(ano) <= anoAtual;
}

async function lerErroResposta(response, mensagemPadrao) {
    try {
        const data = await response.json();
        return data.erro || mensagemPadrao;
    } catch (err) {
        return mensagemPadrao;
    }
}

function mostrarAlerta(elementId, mensagem, tipo) {
    const alerta = document.getElementById(elementId);
    alerta.className = `alert alert-${tipo}`;
    alerta.textContent = mensagem;
    alerta.style.display = 'block';
    
    setTimeout(() => {
        alerta.style.display = 'none';
    }, 5000);
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

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
    window.location.href = 'index.html';
}
