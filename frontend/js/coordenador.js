const API_URL = 'http://localhost:5000/api';
const TAMANHO_MAXIMO_FOTO_MB = 1;
const TAMANHO_MAXIMO_FOTO_BYTES = TAMANHO_MAXIMO_FOTO_MB * 1024 * 1024;
const ABA_ATUAL_COORDENADOR_KEY = 'coordenadorAbaAtual';
let participantesEquipeCache = [];
let alteracaoStatusPendente = null;
let pagamentosEquipeCache = [];
let pagamentoConfirmacaoPendente = null;
let blusasEquipeCache = [];
let blusaAdicionarPendente = null;
let blusaConfirmacaoPendente = null;
let pedidosBlusaBloqueadosCoordenador = false;
let carografoEscritaCache = [];
let restricoesAlimentaresCache = [];

if (!getToken()) {
    window.location.href = 'index.html';
}

document.addEventListener('DOMContentLoaded', () => {
    renderizarCamposExperiencia('camposExperienciaCoordenador', 'coordenador');
    configurarCampoParoquia('paroquiaCoordenador', 'campoOutraParoquiaCoordenador');
    document.getElementById('anoEncontroCoordenador')?.addEventListener('input', limitarCampoNumerico);
    configurarPersistenciaAbas(ABA_ATUAL_COORDENADOR_KEY);
    configurarFiltrosCarografoEscrita();
    carregarPerfilCoordenador();
    carregarPagamentos();
    carregarBlusas();
    carregarConfirmacoes();
    carregarReunioes();
    abrirAbaPersistida(ABA_ATUAL_COORDENADOR_KEY, 'meuPerfil');
});

document.addEventListener('click', (e) => {
    const botaoChamada = e.target.closest('.btn-abrir-chamada');
    if (botaoChamada) {
        abrirChamada(Number(botaoChamada.dataset.reuniaoId));
        return;
    }

    const botaoPerfil = e.target.closest('.btn-perfil-participante');
    if (botaoPerfil) {
        abrirModalPerfilParticipante(Number(botaoPerfil.dataset.usuarioId), botaoPerfil.dataset.tipoCadastro);
    }
});

// Carregar perfil do coordenador
async function carregarPerfilCoordenador() {
    try {
        const response = await fetch(`${API_URL}/coordenador/meu-perfil`, {
            headers: getHeaders()
        });
        
        const usuario = await response.json();
        
        document.getElementById('emailCoordenador').value = usuario.email;
        document.getElementById('nomeCompletoCoordenador').value = usuario.nome_completo;
        document.getElementById('nomeCrachaCoordenador').value = usuario.nome_cracha || '';
        document.getElementById('telefoneCoordenador').value = usuario.telefone;
        preencherParoquia('paroquiaCoordenador', 'outraParoquiaCoordenador', 'campoOutraParoquiaCoordenador', usuario.paroquia);
        document.getElementById('equipeCoordenador').value = usuario.equipe || 'NÃƒÆ’Ã‚Â£o escalado';
        marcarMovimentoOrigem('movimentoCoordenador', usuario.movimento_origem);
        document.getElementById('anoEncontroCoordenador').value = usuario.ano_encontro || '';
        document.getElementById('restricaoMedicaCoord').value = usuario.restricao_medica || '';
        document.getElementById('restricaoAlimentarCoord').value = usuario.restricao_alimentar || '';
        document.getElementById('restricaoMedicacaoCoord').value = usuario.restricao_medicacao || '';
        carregarExperienciaPerfil('coordenador', usuario);
        configurarAbaCarografoEscrita(usuario.equipe);
        configurarAbaRestricaoAlimentar(usuario.equipe);
        
        if (usuario.foto_perfil) {
            document.getElementById('fotoPreviewCoordenador').src = usuario.foto_perfil;
            document.getElementById('fotoPreviewCoordenador').style.display = 'block';
        }
    } catch (err) {
        console.error(err);
    }
}

// Atualizar perfil do coordenador
document.getElementById('formPerfilCoordenador')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const nomeCracha = document.getElementById('nomeCrachaCoordenador').value;
    const paroquia = obterParoquia('paroquiaCoordenador', 'outraParoquiaCoordenador');
    const movimento = obterMovimentoOrigem('movimentoCoordenador');
    const anoEncontro = somenteNumeros(document.getElementById('anoEncontroCoordenador').value);
    const restricaoMedica = document.getElementById('restricaoMedicaCoord').value;
    const restricaoAlimentar = document.getElementById('restricaoAlimentarCoord').value;
    const restricaoMedicacao = document.getElementById('restricaoMedicacaoCoord').value;
    const fotoPerfil = document.getElementById('fotoPerfilCoordenador').files[0];
    
    let fotoBase64 = obterFotoPerfilPreview('fotoPreviewCoordenador');

    if (!anoEncontroValido(anoEncontro)) {
        mostrarAlerta('alertaCoordenador', 'Informe um ano do encontro vÃƒÆ’Ã‚Â¡lido', 'warning');
        return;
    }

    if (!paroquiaValida(paroquia)) {
        mostrarAlerta('alertaCoordenador', 'Informe a parÃƒÆ’Ã‚Â³quia ÃƒÆ’Ã‚Â  qual vocÃƒÆ’Ã‚Âª pertence', 'warning');
        return;
    }
    
    if (fotoPerfil) {
        if (!fotoDentroDoLimite(fotoPerfil)) {
            mostrarAlerta('alertaCoordenador', `A foto deve ter no mÃƒÆ’Ã‚Â¡ximo ${TAMANHO_MAXIMO_FOTO_MB}MB`, 'warning');
            return;
        }

        fotoBase64 = await converterParaBase64(fotoPerfil);
        document.getElementById('fotoPreviewCoordenador').src = fotoBase64;
        document.getElementById('fotoPreviewCoordenador').style.display = 'block';
    }
    
    try {
        const response = await fetch(`${API_URL}/coordenador/meu-perfil`, {
            method: 'PUT',
            headers: getHeaders(),
            body: JSON.stringify({
                nome_cracha: nomeCracha,
                paroquia,
                movimento_origem: movimento,
                ano_encontro: anoEncontro,
                restricao_medica: restricaoMedica,
                restricao_alimentar: restricaoAlimentar,
                restricao_medicacao: restricaoMedicacao,
                foto_perfil: fotoBase64,
                ...obterExperienciaPerfil('coordenador')
            })
        });
        
        if (response.ok) {
            mostrarAlerta('alertaCoordenador', 'Perfil atualizado com sucesso!', 'success');
        } else {
            const mensagem = await lerErroResposta(response, 'Erro ao atualizar perfil');
            mostrarAlerta('alertaCoordenador', mensagem, 'danger');
        }
    } catch (err) {
        mostrarAlerta('alertaCoordenador', 'Erro ao atualizar perfil', 'danger');
        console.error(err);
    }
});

function configurarAbaCarografoEscrita(equipe) {
    const escrita = normalizarTextoFiltroCoordenador(equipe) === 'ESCRITA';
    document.getElementById('abaCarografoEscrita')?.classList.toggle('d-none', !escrita);
    document.getElementById('carografoEscrita')?.classList.toggle('d-none', !escrita);

    if (escrita) {
        carregarCarografoEscrita();
    } else if (localStorage.getItem(ABA_ATUAL_COORDENADOR_KEY) === 'carografoEscrita') {
        localStorage.setItem(ABA_ATUAL_COORDENADOR_KEY, 'meuPerfil');
        const abaPerfil = document.querySelector('a[href="#meuPerfil"]');
        if (abaPerfil && window.bootstrap?.Tab) {
            bootstrap.Tab.getOrCreateInstance(abaPerfil).show();
        }
    }
}

function configurarAbaRestricaoAlimentar(equipe) {
    const ranguinho = normalizarTextoFiltroCoordenador(equipe) === 'RANGUINHO';
    document.getElementById('abaRestricaoAlimentar')?.classList.toggle('d-none', !ranguinho);
    document.getElementById('restricaoAlimentar')?.classList.toggle('d-none', !ranguinho);

    if (ranguinho) {
        carregarRestricoesAlimentares();
    } else if (localStorage.getItem(ABA_ATUAL_COORDENADOR_KEY) === 'restricaoAlimentar') {
        localStorage.setItem(ABA_ATUAL_COORDENADOR_KEY, 'meuPerfil');
        const abaPerfil = document.querySelector('a[href="#meuPerfil"]');
        if (abaPerfil && window.bootstrap?.Tab) {
            bootstrap.Tab.getOrCreateInstance(abaPerfil).show();
        }
    }
}

async function carregarRestricoesAlimentares() {
    const container = document.getElementById('tabelaRestricaoAlimentar');
    if (!container) return;

    try {
        const response = await fetch(`${API_URL}/coordenador/restricoes-alimentares`, {
            headers: getHeaders()
        });
        const usuarios = await response.json();

        if (!response.ok) {
            container.innerHTML = `<div class="alert alert-danger">${escapeHtml(usuarios.erro || 'Erro ao carregar restrições alimentares.')}</div>`;
            return;
        }

        restricoesAlimentaresCache = Array.isArray(usuarios) ? usuarios : [];
        renderizarRestricoesAlimentares();
    } catch (err) {
        container.innerHTML = '<div class="alert alert-danger">Erro ao carregar restrições alimentares.</div>';
        console.error(err);
    }
}

function renderizarRestricoesAlimentares() {
    const container = document.getElementById('tabelaRestricaoAlimentar');
    if (!container) return;

    if (!restricoesAlimentaresCache.length) {
        container.innerHTML = '<div class="alert alert-info">Nenhum usuário confirmado com restrição alimentar.</div>';
        return;
    }

    const linhas = restricoesAlimentaresCache.map((usuario) => {
        const fotoHtml = usuario.foto_perfil
            ? `<img src="${usuario.foto_perfil}" alt="Foto de ${escapeHtml(usuario.nome_cracha || usuario.nome_completo || '')}" style="width:46px; height:46px; border-radius:50%; object-fit:cover;">`
            : '<div style="width:46px; height:46px; border-radius:50%; background:#ddd; display:flex; align-items:center; justify-content:center;">-</div>';

        return `
            <tr>
                <td>${fotoHtml}</td>
                <td>${escapeHtml(usuario.nome_cracha || usuario.nome_completo || '-')}</td>
                <td>${escapeHtml(usuario.restricao_alimentar || '-')}</td>
            </tr>
        `;
    }).join('');

    container.innerHTML = `
        <table class="table table-hover align-middle">
            <thead>
                <tr>
                    <th>Foto</th>
                    <th>Nome do crachá</th>
                    <th>Restrição alimentar</th>
                </tr>
            </thead>
            <tbody>${linhas}</tbody>
        </table>
    `;
}
// Atualizar restriÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Âµes (dispara o formulÃƒÆ’Ã‚Â¡rio de perfil)
document.getElementById('formRestricoesCoord')?.addEventListener('submit', (e) => {
    e.preventDefault();
    document.getElementById('formPerfilCoordenador').dispatchEvent(new Event('submit'));
});

// Carregar pagamentos da equipe
async function carregarPagamentos() {
    try {
        const response = await fetch(`${API_URL}/coordenador/pagamentos-pendentes`, {
            headers: getHeaders()
        });
        
        const data = await response.json();
        const pagamentos = Array.isArray(data) ? data : (data.pagamentos || []);
        const resumo = Array.isArray(data) ? { valorRecebido: 0, valorFaltaReceber: pagamentos.reduce((total, p) => total + Number(p.valor || 0), 0) } : (data.resumo || {});
        pagamentosEquipeCache = pagamentos;

        document.getElementById('valorRecebidoPagamentos').textContent = formatarMoeda(resumo.valorRecebido || 0);
        document.getElementById('valorFaltaReceberPagamentos').textContent = formatarMoeda(resumo.valorFaltaReceber || 0);
        
        let html = '<table class="table table-hover"><thead><tr><th>Foto</th><th>Usuário</th><th>Tipo</th><th>Valor</th><th>Status</th><th>Baixa</th><th>AÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o</th></tr></thead><tbody>';
        
        pagamentos.forEach(p => {
            const fotoHtml = p.foto_perfil 
                ? `<img src="${p.foto_perfil}" alt="Foto" style="width:40px; height:40px; border-radius:50%; object-fit:cover;">`
                : `<div style="width:40px; height:40px; border-radius:50%; background:#ccc; display:flex; align-items:center; justify-content:center;">-</div>`;
            const confirmado = p.status === 'confirmado';
            const statusHtml = confirmado ? '<span class="badge bg-success">Pago</span>' : '<span class="badge bg-warning text-dark">Pendente</span>';
            const baixaHtml = confirmado
                ? `${formatarFormaPagamento(p.forma_pagamento)}<br><small>${formatarDataHora(p.data_confirmacao)}</small>`
                : '-';
            const acaoHtml = confirmado
                ? '-'
                : `<button class="btn btn-sm btn-success" onclick="abrirModalConfirmarPagamento(${Number(p.id)})">Confirmar</button>`;
            
            html += `<tr>
                <td>${fotoHtml}</td>
                <td>${escapeHtml(p.nome_completo || '')}</td>
                <td>${escapeHtml(p.tipo || 'taxa')}</td>
                <td>${formatarMoeda(p.valor || 0)}</td>
                <td>${statusHtml}</td>
                <td>${baixaHtml}</td>
                <td>${acaoHtml}</td>
            </tr>`;
        });
        
        html += '</tbody></table>';
        document.getElementById('tabelaPagamentos').innerHTML = html;
    } catch (err) {
        console.error(err);
    }
}

async function carregarBlusas() {
    try {
        const [response, responseConfig] = await Promise.all([
            fetch(`${API_URL}/coordenador/solicitacoes-blusa`, { headers: getHeaders() }),
            fetch(`${API_URL}/coordenador/configuracoes-blusa`, { headers: getHeaders() })
        ]);
        
        const blusas = await response.json();
        const config = await responseConfig.json();
        blusasEquipeCache = Array.isArray(blusas) ? blusas : [];
        pedidosBlusaBloqueadosCoordenador = Boolean(config.pedidos_bloqueados);
        renderizarResumoBlusas(blusasEquipeCache);
        
        const valorPendentePorUsuario = blusasEquipeCache.reduce((acc, item) => {
            if (!item.id || item.status === 'confirmado') return acc;
            const usuarioId = Number(item.usuario_id);
            acc[usuarioId] = (acc[usuarioId] || 0) + Number(item.valor || 0);
            return acc;
        }, {});

        let html = '<table class="table table-hover"><thead><tr><th>Foto</th><th>Usuário</th><th>Tamanho</th><th>Valor</th><th>Status</th><th>Baixa</th><th>AÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o</th></tr></thead><tbody>';
        
        blusasEquipeCache.forEach(b => {
            const fotoHtml = b.foto_perfil 
                ? `<img src="${b.foto_perfil}" alt="Foto" style="width:40px; height:40px; border-radius:50%; object-fit:cover;">`
                : `<div style="width:40px; height:40px; border-radius:50%; background:#ccc; display:flex; align-items:center; justify-content:center;">-</div>`;
            const temSolicitacao = Boolean(b.id);
            const pago = b.status === 'confirmado';
            const badge = !temSolicitacao
                ? '<span class="badge bg-secondary">Sem camisa</span>'
                : pago
                    ? '<span class="badge bg-success">Pago</span>'
                    : '<span class="badge bg-warning text-dark">Pendente</span>';
            const baixaHtml = pago
                ? `${formatarFormaPagamento(b.forma_pagamento)}<br><small>${formatarDataHora(b.data_confirmacao)}</small>`
                : '-';
            const acaoHtml = renderizarAcoesBlusa(b, temSolicitacao, pago);
            const valorPendenteUsuario = valorPendentePorUsuario[Number(b.usuario_id)] || 0;
            const usuarioHtml = `
                ${escapeHtml(b.nome_completo || '')}
                ${valorPendenteUsuario > 0 ? `<br><small class="text-muted">A receber: ${formatarMoeda(valorPendenteUsuario)}</small>` : ''}
            `;

            html += `<tr>
                <td>${fotoHtml}</td>
                <td>${usuarioHtml}</td>
                <td>${escapeHtml(b.tamanho || '-')}</td>
                <td>${temSolicitacao ? formatarMoeda(b.valor || 0) : '-'}</td>
                <td>${badge}</td>
                <td>${baixaHtml}</td>
                <td>${acaoHtml}</td>
            </tr>`;
        });
        
        html += '</tbody></table>';
        document.getElementById('tabelaBlusas').innerHTML = html;
    } catch (err) {
        console.error(err);
    }
}

function renderizarAcoesBlusa(blusa, temSolicitacao, pago) {
    if (pedidosBlusaBloqueadosCoordenador) {
        return temSolicitacao && !pago
            ? `<button class="btn btn-sm btn-success" onclick="abrirModalConfirmarPagamentoBlusa(${Number(blusa.id)})">Confirmar</button>`
            : '-';
    }

    if (!temSolicitacao) {
        return `<button class="btn btn-sm btn-primary" onclick="abrirModalAdicionarBlusa(${Number(blusa.usuario_id)})">Adicionar</button>`;
    }

    return `
        <button class="btn btn-sm btn-primary me-1" onclick="abrirModalAdicionarBlusa(${Number(blusa.usuario_id)})">Adicionar</button>
        ${pago ? '' : `<button class="btn btn-sm btn-success me-1" onclick="abrirModalConfirmarPagamentoBlusa(${Number(blusa.id)})">Confirmar</button>`}
        <button class="btn btn-sm btn-outline-danger" onclick="excluirSolicitacaoBlusa(${Number(blusa.id)})">Excluir</button>
    `;
}

function renderizarResumoBlusas(blusas) {
    const container = document.getElementById('resumoBlusas');
    if (!container) return;

    const pedidos = blusas.filter(item => item.id);
    const totalPedidos = pedidos.length;
    const valorPago = pedidos
        .filter(item => item.status === 'confirmado')
        .reduce((total, item) => total + Number(item.valor || 0), 0);
    const valorFaltaReceber = pedidos
        .filter(item => item.status !== 'confirmado')
        .reduce((total, item) => total + Number(item.valor || 0), 0);
    const porTamanho = pedidos.reduce((acc, item) => {
        const tamanho = item.tamanho || 'Sem tamanho';
        acc[tamanho] = (acc[tamanho] || 0) + 1;
        return acc;
    }, {});

    const linhas = Object.entries(porTamanho)
        .sort(([a], [b]) => a.localeCompare(b, 'pt-BR', { numeric: true }))
        .map(([tamanho, quantidade]) => `
            <tr>
                <td>${escapeHtml(tamanho)}</td>
                <td><strong>${quantidade}</strong></td>
            </tr>
        `).join('');

    container.innerHTML = `
        <div class="col-md-4 col-lg-2">
            <div class="resumo-blusas-total">
                <span>Total de pedidos</span>
                <strong>${totalPedidos}</strong>
            </div>
        </div>
        <div class="col-md-4 col-lg-2">
            <div class="resumo-blusas-total">
                <span>Total jÃƒÆ’Ã‚Â¡ pago</span>
                <strong>${formatarMoeda(valorPago)}</strong>
            </div>
        </div>
        <div class="col-md-4 col-lg-2">
            <div class="resumo-blusas-total">
                <span>Falta receber</span>
                <strong>${formatarMoeda(valorFaltaReceber)}</strong>
            </div>
        </div>
        <div class="col-md-8 col-lg-6">
            <div class="table-responsive resumo-blusas-tabela">
                <table class="table table-sm mb-0 align-middle">
                    <thead>
                        <tr><th>Tamanho</th><th>Quantidade</th></tr>
                    </thead>
                    <tbody>${linhas || '<tr><td colspan="2">Nenhuma camisa solicitada.</td></tr>'}</tbody>
                </table>
            </div>
        </div>
    `;
}

function abrirModalAdicionarBlusa(usuarioId) {
    const usuario = blusasEquipeCache.find(item => Number(item.usuario_id) === Number(usuarioId));
    if (!usuario) return;

    blusaAdicionarPendente = usuario;
    document.getElementById('textoAdicionarBlusa').textContent = `Adicionar camisa para ${usuario.nome_completo || ''}`;
    document.getElementById('tamanhoBlusaCoordenador').value = '';
    new bootstrap.Modal(document.getElementById('modalAdicionarBlusa')).show();
}

document.getElementById('btnSalvarBlusaCoordenador')?.addEventListener('click', async () => {
    if (!blusaAdicionarPendente) return;

    const tamanho = document.getElementById('tamanhoBlusaCoordenador').value;
    if (!tamanho) {
        mostrarAlerta('alertaCoordenador', 'Informe o tamanho da camisa', 'warning');
        return;
    }

    try {
        const response = await fetch(`${API_URL}/coordenador/solicitacoes-blusa/${blusaAdicionarPendente.usuario_id}`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ tamanho })
        });
        const data = await response.json().catch(() => ({}));

        if (response.ok) {
            mostrarAlerta('alertaCoordenador', 'Camisa adicionada com sucesso!', 'success');
            bootstrap.Modal.getInstance(document.getElementById('modalAdicionarBlusa'))?.hide();
            blusaAdicionarPendente = null;
            carregarBlusas();
        } else {
            mostrarAlerta('alertaCoordenador', data.erro || 'Erro ao adicionar camisa', 'danger');
        }
    } catch (err) {
        mostrarAlerta('alertaCoordenador', 'Erro ao adicionar camisa', 'danger');
        console.error(err);
    }
});

function abrirModalConfirmarPagamentoBlusa(solicitacaoId) {
    const blusa = blusasEquipeCache.find(item => Number(item.id) === Number(solicitacaoId));
    if (!blusa) return;

    blusaConfirmacaoPendente = blusa;
    document.querySelectorAll('input[name="formaPagamentoBlusa"]').forEach(input => {
        input.checked = false;
    });
    document.getElementById('textoConfirmarPagamentoBlusa').textContent =
        `Confirma o pagamento da camisa de ${blusa.nome_completo || ''}?`;
    new bootstrap.Modal(document.getElementById('modalConfirmarPagamentoBlusa')).show();
}

document.getElementById('btnSalvarConfirmacaoPagamentoBlusa')?.addEventListener('click', async () => {
    if (!blusaConfirmacaoPendente) return;

    const formaPagamento = document.querySelector('input[name="formaPagamentoBlusa"]:checked')?.value;
    if (!formaPagamento) {
        mostrarAlerta('alertaCoordenador', 'Informe se recebeu via PIX ou em dinheiro', 'warning');
        return;
    }

    try {
        const response = await fetch(`${API_URL}/coordenador/confirmar-blusa/${blusaConfirmacaoPendente.id}`, {
            method: 'PUT',
            headers: getHeaders(),
            body: JSON.stringify({ forma_pagamento: formaPagamento })
        });
        const data = await response.json().catch(() => ({}));

        if (response.ok) {
            mostrarAlerta('alertaCoordenador', 'Pagamento da camisa confirmado!', 'success');
            bootstrap.Modal.getInstance(document.getElementById('modalConfirmarPagamentoBlusa'))?.hide();
            blusaConfirmacaoPendente = null;
            carregarBlusas();
        } else {
            mostrarAlerta('alertaCoordenador', data.erro || 'Erro ao confirmar pagamento da camisa', 'danger');
        }
    } catch (err) {
        mostrarAlerta('alertaCoordenador', 'Erro ao confirmar pagamento da camisa', 'danger');
        console.error(err);
    }
});

async function excluirSolicitacaoBlusa(solicitacaoId) {
    if (!confirm('Tem certeza que deseja excluir esta solicitaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o de camisa?')) return;

    try {
        const response = await fetch(`${API_URL}/coordenador/solicitacoes-blusa/${solicitacaoId}`, {
            method: 'DELETE',
            headers: getHeaders()
        });
        const data = await response.json().catch(() => ({}));

        if (response.ok) {
            mostrarAlerta('alertaCoordenador', 'SolicitaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o de camisa excluÃƒÆ’Ã‚Â­da!', 'success');
            carregarBlusas();
        } else {
            mostrarAlerta('alertaCoordenador', data.erro || 'Erro ao excluir solicitaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o de camisa', 'danger');
        }
    } catch (err) {
        mostrarAlerta('alertaCoordenador', 'Erro ao excluir solicitaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o de camisa', 'danger');
        console.error(err);
    }
}

async function carregarCarografoEscrita() {
    const painel = document.getElementById('painelCarografoEscrita');
    if (!painel) return;

    try {
        const response = await fetch(`${API_URL}/coordenador/carografo-escrita`, {
            headers: getHeaders()
        });
        const usuarios = await response.json();

        if (!response.ok) {
            painel.innerHTML = `<div class="alert alert-danger">${escapeHtml(usuarios.erro || 'Erro ao carregar carógrafo')}</div>`;
            return;
        }

        carografoEscritaCache = Array.isArray(usuarios) ? usuarios : [];
        preencherFiltroEquipesCarografoEscrita();
        aplicarFiltrosCarografoEscrita();
    } catch (err) {
        painel.innerHTML = '<div class="alert alert-danger">Erro ao carregar carógrafo.</div>';
        console.error(err);
    }
}

function configurarFiltrosCarografoEscrita() {
    ['filtroCarografoEscritaParoquia', 'filtroCarografoEscritaEquipe', 'filtroCarografoEscritaMovimento', 'filtroCarografoEscritaMusical'].forEach((id) => {
        document.getElementById(id)?.addEventListener('change', aplicarFiltrosCarografoEscrita);
    });
    document.getElementById('filtroCarografoEscritaNome')?.addEventListener('input', aplicarFiltrosCarografoEscrita);
    document.getElementById('limparFiltrosCarografoEscrita')?.addEventListener('click', () => {
        document.getElementById('filtroCarografoEscritaNome').value = '';
        document.getElementById('filtroCarografoEscritaParoquia').value = '';
        document.getElementById('filtroCarografoEscritaEquipe').value = '';
        document.getElementById('filtroCarografoEscritaMovimento').value = '';
        document.getElementById('filtroCarografoEscritaMusical').value = '';
        aplicarFiltrosCarografoEscrita();
    });
    document.getElementById('baixarRelatorioCarografoEscrita')?.addEventListener('click', baixarRelatorioCarografoEscritaExcel);
}

function preencherFiltroEquipesCarografoEscrita() {
    const select = document.getElementById('filtroCarografoEscritaEquipe');
    if (!select) return;

    const valorAtual = select.value;
    const equipes = Array.from(new Set(carografoEscritaCache.map(usuario => usuario.equipe).filter(Boolean)))
        .sort((a, b) => a.localeCompare(b, 'pt-BR'));
    select.innerHTML = '<option value="">Todas</option>' + equipes
        .map(equipe => `<option value="${escapeHtml(equipe)}">${escapeHtml(equipe)}</option>`)
        .join('');

    if (equipes.includes(valorAtual)) {
        select.value = valorAtual;
    }
}

function aplicarFiltrosCarografoEscrita() {
    const termoBusca = normalizarTextoFiltroCoordenador(document.getElementById('filtroCarografoEscritaNome')?.value || '');
    const telefoneBusca = normalizarTelefoneFiltroCoordenador(document.getElementById('filtroCarografoEscritaNome')?.value || '');
    const paroquia = document.getElementById('filtroCarografoEscritaParoquia')?.value || '';
    const equipe = document.getElementById('filtroCarografoEscritaEquipe')?.value || '';
    const movimento = document.getElementById('filtroCarografoEscritaMovimento')?.value || '';
    const musical = document.getElementById('filtroCarografoEscritaMusical')?.value || '';

    const usuarios = carografoEscritaCache.filter((usuario) => {
        const toca = usuario.toca_instrumento === 'sim';
        const canta = usuario.canta === 'sim';
        const nomeUsuario = normalizarTextoFiltroCoordenador(`${usuario.nome_completo || ''} ${usuario.nome_cracha || ''}`);
        const telefoneUsuario = normalizarTelefoneFiltroCoordenador(usuario.telefone || '');

        if (termoBusca && !nomeUsuario.includes(termoBusca) && !(telefoneBusca && telefoneUsuario.includes(telefoneBusca))) return false;
        if (paroquia && !usuarioPertenceParoquiaFiltroCoordenador(usuario, paroquia)) return false;
        if (equipe && usuario.equipe !== equipe) return false;
        if (movimento && usuario.movimento_origem !== movimento) return false;
        if (musical === 'canta' && !canta) return false;
        if (musical === 'toca' && !toca) return false;
        if (musical === 'canta_toca' && (!canta || !toca)) return false;
        if (musical === 'canta_ou_toca' && (!canta && !toca)) return false;

        return true;
    });

    renderizarCarografoEscrita(usuarios);
}

function renderizarCarografoEscrita(usuarios) {
    const painel = document.getElementById('painelCarografoEscrita');
    if (!painel) return;

    if (!usuarios.length) {
        painel.innerHTML = '<div class="alert alert-info">Nenhum usuário encontrado.</div>';
        return;
    }

    painel.innerHTML = [...usuarios].sort(ordenarUsuarioCarografoCoordenador).map((usuario) => {
        const nome = escapeHtml(usuario.nome_completo || '');
        const movimentoOrigem = escapeHtml(usuario.movimento_origem || '-');
        const anoEncontro = escapeHtml(usuario.ano_encontro || '-');
        const telefone = escapeHtml(usuario.telefone || '-');
        const equipeAtual = escapeHtml(usuario.equipe || '-');
        const icones = [
            usuario.toca_instrumento === 'sim'
                ? '<span class="carografo-icone" title="Toca instrumento"><i class="fa-solid fa-guitar"></i></span>'
                : '',
            usuario.canta === 'sim'
                ? '<span class="carografo-icone" title="Canta"><i class="fa-solid fa-microphone"></i></span>'
                : ''
        ].join('');
        const destaqueMusical = usuario.toca_instrumento === 'sim' || usuario.canta === 'sim';
        const fotoHtml = usuario.foto_perfil
            ? `<img src="${escapeHtml(usuario.foto_perfil)}" alt="Foto de ${nome}" class="carografo-foto" onclick="abrirModalPerfilParticipante(${Number(usuario.id)}, 'usuario')">`
            : `<div class="carografo-foto carografo-foto-placeholder" onclick="abrirModalPerfilParticipante(${Number(usuario.id)}, 'usuario')">-</div>`;
        const logoParoquia = obterLogoParoquiaCoordenador(usuario.paroquia);
        const logoParoquiaHtml = logoParoquia
            ? `<img src="${logoParoquia.src}" alt="${logoParoquia.alt}" class="carografo-paroquia-logo">`
            : '';

        return `
            <div class="carografo-item ${destaqueMusical ? 'carografo-item-musical' : ''}">
                <div class="carografo-foto-coluna">
                    ${fotoHtml}
                    ${logoParoquiaHtml}
                </div>
                <div class="carografo-info">
                    <div class="carografo-topo">
                        <strong>${nome}</strong>
                        <div class="carografo-icones">${icones}</div>
                    </div>
                    <div class="carografo-linha">${movimentoOrigem} - ${anoEncontro}</div>
                    <div class="carografo-linha">${telefone}</div>
                    <div class="carografo-equipe">Equipe: ${equipeAtual}</div>
                    <div class="carografo-status">${obterStatusBadge(usuario.status)}</div>
                </div>
            </div>
        `;
    }).join('');
}

function baixarRelatorioCarografoEscritaExcel() {
    if (typeof XLSX === 'undefined') {
        mostrarAlerta('alertaCoordenador', 'Biblioteca de Excel não carregada.', 'warning');
        return;
    }

    const usuarios = carografoEscritaCache
        .filter(usuario => usuario.status === 'confirmado' && !usuarioSemEquipeCoordenador(usuario))
        .sort(ordenarUsuarioCarografoCoordenador)
        .map(usuario => ({
            'Nome completo': usuario.nome_completo || '',
            'Nome do crachá': usuario.nome_cracha || '',
            'Paróquia': usuario.paroquia || '',
            'Movimento de origem': usuario.movimento_origem || '',
            'Ano do encontro': usuario.ano_encontro || '',
            'Telefone': usuario.telefone || '',
            'Equipe': usuario.equipe || '',
            'Toca instrumento': formatarSimNao(usuario.toca_instrumento),
            'Instrumentos': usuario.instrumentos || '',
            'Canta': formatarSimNao(usuario.canta)
        }));

    if (!usuarios.length) {
        mostrarAlerta('alertaCoordenador', 'Nenhum usuário confirmado para exportar.', 'warning');
        return;
    }

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(usuarios);
    worksheet['!cols'] = [
        { wch: 34 },
        { wch: 24 },
        { wch: 28 },
        { wch: 20 },
        { wch: 16 },
        { wch: 18 },
        { wch: 22 },
        { wch: 18 },
        { wch: 28 },
        { wch: 12 }
    ];
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Carografo');
    XLSX.writeFile(workbook, `carografo-escrita-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

async function carregarConfirmacoes() {
    const container = document.getElementById('tabelaConfirmacoes');
    if (!container) return;

    try {
        const response = await fetch(`${API_URL}/coordenador/participantes-equipe`, {
            headers: getHeaders()
        });

        const participantes = await response.json();
        participantesEquipeCache = Array.isArray(participantes) ? participantes : [];

        if (!response.ok) {
            container.innerHTML = `<div class="alert alert-danger">${escapeHtml(participantes.erro || 'Erro ao carregar participantes')}</div>`;
            return;
        }

        if (!participantes || participantes.length === 0) {
            container.innerHTML = '<div class="alert alert-info">Nenhum participante escalado para sua equipe.</div>';
            return;
        }

        const linhas = participantes.map(usuario => {
            const fotoHtml = usuario.foto_perfil
                ? `<img src="${usuario.foto_perfil}" alt="Foto" style="width:42px; height:42px; border-radius:50%; object-fit:cover;">`
                : '<div style="width:42px; height:42px; border-radius:50%; background:#ccc; display:flex; align-items:center; justify-content:center;">-</div>';
            const tipoCadastro = usuario.tipo_cadastro === 'externo'
                ? '<span class="badge bg-secondary">Sem cadastro</span>'
                : '<span class="badge bg-primary">Cadastrado</span>';
            const opcoesStatus = renderizarOpcoesStatusConfirmacao(usuario.status);
            const linkConfirmacao = renderizarAcaoLinkConfirmacao(usuario);

            return `
                <tr>
                    <td>
                        <button type="button" class="btn btn-link p-0 btn-perfil-participante" data-usuario-id="${usuario.id}" data-tipo-cadastro="${usuario.tipo_cadastro || 'usuario'}" title="Ver perfil">
                            ${fotoHtml}
                        </button>
                    </td>
                    <td>
                        <strong>${escapeHtml(usuario.nome_completo || '')}</strong><br>
                        <small class="text-muted">${escapeHtml(usuario.nome_cracha || '')}</small><br>
                        ${tipoCadastro}
                    </td>
                    <td>${escapeHtml(usuario.telefone || '-')}</td>
                    <td>${escapeHtml(usuario.movimento_origem || '-')}</td>
                    <td>${escapeHtml(usuario.equipe || '-')}</td>
                    <td><span class="badge bg-success">${Number(usuario.total_presencas || 0)}</span></td>
                    <td><span class="badge bg-warning text-dark">${Number(usuario.total_faltas_justificadas || 0)}</span></td>
                    <td><span class="badge bg-danger">${Number(usuario.total_faltas || 0)}</span></td>
                    <td>
                        <select class="form-select form-select-sm status-confirmacao" data-usuario-id="${usuario.id}" data-tipo-cadastro="${usuario.tipo_cadastro || 'usuario'}">
                            ${opcoesStatus}
                        </select>
                    </td>
                    <td>
                        ${linkConfirmacao}
                    </td>
                </tr>
            `;
        }).join('');

        container.innerHTML = `
            <table class="table table-hover align-middle">
                <thead>
                    <tr>
                        <th>Foto</th>
                        <th>Usuário</th>
                        <th>Contato</th>
                        <th>Movimento</th>
                        <th>Equipe</th>
                        <th>Presenças</th>
                        <th>Faltas justificadas</th>
                        <th>Faltas</th>
                        <th>Status</th>
                        <th>Link</th>
                    </tr>
                </thead>
                <tbody>${linhas}</tbody>
            </table>
        `;
    } catch (err) {
        container.innerHTML = '<div class="alert alert-danger">Erro ao carregar participantes.</div>';
        console.error(err);
    }
}

function renderizarOpcoesStatusConfirmacao(statusAtual) {
    const opcoes = statusAtual === 'confirmado'
        ? [
            ['confirmado', 'Confirmado'],
            ['desistiu', 'Desistiu']
        ]
        : [
            ['pendente', 'Pendente'],
            ['confirmado', 'Confirmado'],
            ['negou', 'Negou'],
            ['desistiu', 'Desistiu']
        ];

    return opcoes
        .map(([valor, label]) => `<option value="${valor}" ${statusAtual === valor ? 'selected' : ''}>${label}</option>`)
        .join('');
}

function renderizarAcaoLinkConfirmacao(usuario) {
    if (usuario.foto_perfil) return '-';
    return `<button type="button" class="btn btn-sm btn-success" onclick="enviarConfirmacaoWhatsApp(${Number(usuario.id)}, '${usuario.tipo_cadastro || 'usuario'}')">Confirmar participação</button>`;
}

document.addEventListener('change', async (e) => {
    if (!e.target.classList.contains('status-confirmacao')) return;

    const usuarioId = e.target.dataset.usuarioId;
    const tipoCadastro = e.target.dataset.tipoCadastro || 'usuario';
    const status = e.target.value;
    const statusAnterior = obterStatusParticipante(usuarioId, tipoCadastro);

    if (['negou', 'desistiu'].includes(status)) {
        e.target.value = statusAnterior || 'pendente';
        abrirModalConfirmarRemocaoEncontro({
            select: e.target,
            usuarioId,
            tipoCadastro,
            status,
            statusAnterior
        });
        return;
    }

    await atualizarStatusParticipante({ usuarioId, tipoCadastro, status });
});

async function atualizarStatusParticipante({ usuarioId, tipoCadastro = 'usuario', status }) {
    try {
        const response = await fetch(`${API_URL}/coordenador/participantes/${usuarioId}/status`, {
            method: 'PUT',
            headers: getHeaders(),
            body: JSON.stringify({ status, tipo_cadastro: tipoCadastro })
        });

        const data = await response.json();

        if (response.ok) {
            mostrarAlerta('alertaCoordenador', 'Status atualizado com sucesso!', 'success');
        } else {
            mostrarAlerta('alertaCoordenador', data.erro || 'Erro ao atualizar status', 'danger');
            carregarConfirmacoes();
        }
    } catch (err) {
        mostrarAlerta('alertaCoordenador', 'Erro ao atualizar status', 'danger');
        carregarConfirmacoes();
        console.error(err);
    }
}

function obterParticipanteConfirmacao(usuarioId, tipoCadastro = 'usuario') {
    return participantesEquipeCache.find(item =>
        Number(item.id) === Number(usuarioId)
        && (item.tipo_cadastro || 'usuario') === tipoCadastro
    );
}

function obterStatusParticipante(usuarioId, tipoCadastro = 'usuario') {
    return obterParticipanteConfirmacao(usuarioId, tipoCadastro)?.status || 'pendente';
}

function abrirModalConfirmarRemocaoEncontro(dados) {
    const participante = obterParticipanteConfirmacao(dados.usuarioId, dados.tipoCadastro);
    const nome = participante?.nome_completo || 'usuário';
    const texto = document.getElementById('textoConfirmarRemocaoEncontro');
    const modalEl = document.getElementById('modalConfirmarRemocaoEncontro');

    alteracaoStatusPendente = dados;
    if (texto) {
        texto.textContent = `Você confirma que ${nome} não quer servir no encontro? Após confirmar, não será possível voltar atrás.`;
    }

    new bootstrap.Modal(modalEl).show();
}

document.getElementById('btnConfirmarRemocaoEncontro')?.addEventListener('click', async () => {
    if (!alteracaoStatusPendente) return;

    const { select, usuarioId, tipoCadastro, status } = alteracaoStatusPendente;
    alteracaoStatusPendente = null;
    const modalEl = document.getElementById('modalConfirmarRemocaoEncontro');
    const modal = bootstrap.Modal.getInstance(modalEl);
    if (modal) modal.hide();

    if (select) {
        select.value = status;
    }

    await atualizarStatusParticipante({ usuarioId, tipoCadastro, status });
});

document.getElementById('modalConfirmarRemocaoEncontro')?.addEventListener('hidden.bs.modal', () => {
    if (!alteracaoStatusPendente) return;

    const { select, statusAnterior } = alteracaoStatusPendente;
    if (select) {
        select.value = statusAnterior || 'pendente';
    }
    alteracaoStatusPendente = null;
});

function abrirModalPerfilParticipante(usuarioId, tipoCadastro = 'usuario') {
    const usuario = participantesEquipeCache.find(item => Number(item.id) === Number(usuarioId) && (item.tipo_cadastro || 'usuario') === tipoCadastro);
    const modalEl = document.getElementById('modalPerfilParticipante');
    const conteudoEl = document.getElementById('conteudoPerfilParticipante');

    if (!usuario || !modalEl || !conteudoEl) return;

    const fotoHtml = usuario.foto_perfil
        ? `<img src="${usuario.foto_perfil}" alt="Foto de perfil" class="mb-3" style="width:140px; height:140px; border-radius:50%; object-fit:cover;">`
        : '<div class="mb-3 mx-auto" style="width:140px; height:140px; border-radius:50%; background:#ddd; display:flex; align-items:center; justify-content:center; font-size:32px;">-</div>';

    conteudoEl.innerHTML = `
        <div class="text-center">
            ${fotoHtml}
            <h5 class="mb-1">${escapeHtml(usuario.nome_completo || '')}</h5>
            <p class="text-muted mb-3">${escapeHtml(usuario.nome_cracha || '')}</p>
        </div>
        <table class="table table-sm">
            <tbody>
                <tr><th>Telefone</th><td>${escapeHtml(usuario.telefone || '-')}</td></tr>
                <tr><th>Movimento</th><td>${escapeHtml(usuario.movimento_origem || '-')}</td></tr>
                <tr><th>Perfil</th><td>${escapeHtml(usuario.perfil || '-')}</td></tr>
                <tr><th>Equipe</th><td>${escapeHtml(usuario.equipe || '-')}</td></tr>
                <tr><th>Status</th><td>${formatarStatusConfirmacao(usuario.status)}</td></tr>
            </tbody>
        </table>
    `;

    new bootstrap.Modal(modalEl).show();
}

async function enviarConfirmacaoWhatsApp(usuarioId, tipoCadastro = 'usuario') {
    const usuario = participantesEquipeCache.find(item => Number(item.id) === Number(usuarioId) && (item.tipo_cadastro || 'usuario') === tipoCadastro);
    if (!usuario) return;

    const telefone = limparTelefoneWhatsApp(usuario.telefone || '');
    if (!telefone) {
        mostrarAlerta('alertaCoordenador', 'Telefone WhatsApp inválido para este participante.', 'warning');
        return;
    }

    const origem = window.location.origin === 'file://' ? 'http://localhost:5000' : window.location.origin;
    let tokenConfirmacao = '';

    try {
        const response = await fetch(`${API_URL}/coordenador/participantes-equipe/${tipoCadastro}/${Number(usuarioId)}/token-confirmacao`, {
            method: 'POST',
            headers: getHeaders()
        });
        const data = await response.json();

        if (!response.ok || !data.token_confirmacao) {
            mostrarAlerta('alertaCoordenador', data.erro || 'Erro ao gerar link de confirmação.', 'danger');
            return;
        }

        tokenConfirmacao = data.token_confirmacao;
        usuario.token_confirmacao = tokenConfirmacao;
    } catch (err) {
        mostrarAlerta('alertaCoordenador', 'Erro ao gerar link de confirmação.', 'danger');
        console.error(err);
        return;
    }

    const linkConfirmacao = `${origem}/frontend/confirmacao.html?token=${encodeURIComponent(tokenConfirmacao)}`;
    const mensagem = `Olá ${usuario.nome_completo},
Ficamos muito felizes pelo seu sim!
Precisamos que você atualize seus dados em nosso sistema.
Por favor, confirme seus dados no seguinte link:

${linkConfirmacao}`;
    window.open(`https://wa.me/55${telefone}?text=${encodeURIComponent(mensagem)}`, '_blank');
}

function limparTelefoneWhatsApp(telefone) {
    const grupos = String(telefone || '').match(/\d{10,13}/g) || [];
    const numero = grupos[0] || String(telefone || '').replace(/\D/g, '');
    return numero.replace(/^55/, '');
}
function formatarStatusConfirmacao(status) {
    const mapa = {
        pendente: '<span class="badge bg-warning text-dark">Pendente</span>',
        confirmado: '<span class="badge bg-success">Confirmado</span>',
        negou: '<span class="badge bg-danger">Negou</span>',
        desistiu: '<span class="badge bg-secondary">Desistiu</span>'
    };

    return mapa[status] || escapeHtml(status || '-');
}

function abrirModalConfirmarPagamento(pagamentoId) {
    const pagamento = pagamentosEquipeCache.find(item => Number(item.id) === Number(pagamentoId));
    if (!pagamento) return;

    pagamentoConfirmacaoPendente = pagamento;
    document.querySelectorAll('input[name="formaPagamento"]').forEach(input => {
        input.checked = false;
    });
    document.getElementById('textoConfirmarPagamento').textContent =
        `Confirma o pagamento da taxa de ${pagamento.nome_completo || ''} no valor de ${formatarMoeda(pagamento.valor || 0)}?`;

    new bootstrap.Modal(document.getElementById('modalConfirmarPagamento')).show();
}

document.getElementById('btnSalvarConfirmacaoPagamento')?.addEventListener('click', async () => {
    if (!pagamentoConfirmacaoPendente) return;

    const formaPagamento = document.querySelector('input[name="formaPagamento"]:checked')?.value;
    if (!formaPagamento) {
        mostrarAlerta('alertaCoordenador', 'Informe se recebeu via PIX ou em dinheiro', 'warning');
        return;
    }

    try {
        const response = await fetch(`${API_URL}/coordenador/confirmar-pagamento/${pagamentoConfirmacaoPendente.id}`, {
            method: 'PUT',
            headers: getHeaders(),
            body: JSON.stringify({ forma_pagamento: formaPagamento })
        });
        const data = await response.json().catch(() => ({}));
        
        if (response.ok) {
            mostrarAlerta('alertaCoordenador', 'Pagamento confirmado!', 'success');
            bootstrap.Modal.getInstance(document.getElementById('modalConfirmarPagamento'))?.hide();
            pagamentoConfirmacaoPendente = null;
            carregarPagamentos();
        } else {
            mostrarAlerta('alertaCoordenador', data.erro || 'Erro ao confirmar pagamento', 'danger');
        }
    } catch (err) {
        mostrarAlerta('alertaCoordenador', 'Erro ao confirmar pagamento', 'danger');
        console.error(err);
    }
});

function formatarMoeda(valor) {
    return Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatarFormaPagamento(forma) {
    const mapa = {
        pix: 'PIX',
        dinheiro: 'Dinheiro'
    };
    return mapa[forma] || '-';
}

function formatarDataHora(valor) {
    if (!valor) return '-';
    return new Date(valor).toLocaleString('pt-BR');
}

function obterStatusBadge(status) {
    const mapa = {
        confirmado: '<span class="badge bg-success">Confirmado</span>',
        pendente: '<span class="badge bg-warning text-dark">Pendente</span>',
        negou: '<span class="badge bg-danger">Negou</span>',
        desistiu: '<span class="badge bg-secondary">Desistiu</span>'
    };
    return mapa[status] || `<span class="badge bg-light text-dark">${escapeHtml(status || '-')}</span>`;
}

function formatarSimNao(valor) {
    if (valor === 'sim') return 'Sim';
    if (valor === 'nao') return 'Não';
    return '-';
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

function escapeHtml(valor) {
    return String(valor || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function getToken() {
    return localStorage.getItem('token');
}

// ===== FUNÃƒÆ’Ã¢â‚¬Â¡ÃƒÆ’Ã¢â‚¬Â¢ES DE REUNIÃƒÆ’Ã†â€™O =====

document.getElementById('formNovaReuniao')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const titulo = document.getElementById('tituloReuniao').value;
    const descricao = document.getElementById('descricaoReuniao').value;
    const data_reuniao = document.getElementById('dataReuniao').value;
    const horario_inicio = document.getElementById('horarioInicio').value;
    const horario_fim = document.getElementById('horarioFim').value;
    const local = document.getElementById('localReuniao').value;
    
    try {
        const response = await fetch(`${API_URL}/coordenador/reunioes`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({
                titulo, descricao, data_reuniao, horario_inicio, horario_fim, local
            })
        });
        
        if (response.ok) {
            mostrarAlerta('alertaCoordenador', 'ReuniÃƒÆ’Ã‚Â£o agendada com sucesso!', 'success');
            document.getElementById('formNovaReuniao').reset();
            carregarReunioes();
        }
    } catch (err) {
        mostrarAlerta('alertaCoordenador', 'Erro ao agendar reuniÃƒÆ’Ã‚Â£o', 'danger');
        console.error(err);
    }
});

async function carregarReunioes() {
    try {
        const response = await fetch(`${API_URL}/coordenador/reunioes`, {
            headers: getHeaders()
        });
        
        const reunioes = await response.json();
        
        if (reunioes.length === 0) {
            document.getElementById('listaReunioes').innerHTML = '<p class="text-muted">Nenhuma reuniÃƒÆ’Ã‚Â£o agendada</p>';
            return;
        }
        
        let html = '';
        reunioes.forEach(r => {
            const data = new Date(r.data_reuniao).toLocaleDateString('pt-BR');
            const statusBadge = r.status === 'agendada' 
                ? '<span class="badge bg-info">Agendada</span>' 
                : `<span class="badge bg-success">${r.status}</span>`;
            
            html += `
                <div class="card mb-3">
                    <div class="card-body">
                        <h5 class="card-title">${r.titulo} ${statusBadge}</h5>
                        <p class="card-text">${r.descricao || '<em>Sem descriÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o</em>'}</p>
                        <table class="table table-sm">
                            <tr>
                                <td><strong>Data:</strong> ${data}</td>
                                <td><strong>HorÃƒÆ’Ã‚Â¡rio:</strong> ${r.horario_inicio}${r.horario_fim ? ' - ' + r.horario_fim : ''}</td>
                            </tr>
                            <tr>
                                <td colspan="2"><strong>Local:</strong> ${r.local}</td>
                            </tr>
                        </table>
                        <div class="btn-group" role="group">
                            <button class="btn btn-sm btn-primary" onclick="abrirModalEditar(${r.id}, '${r.titulo}', '${r.descricao}', '${r.data_reuniao}', '${r.horario_inicio}', '${r.horario_fim}', '${r.local}')">Editar</button>
                            <button type="button" class="btn btn-sm btn-success btn-abrir-chamada" data-reuniao-id="${r.id}">Chamada</button>
                            <button class="btn btn-sm btn-danger" onclick="deletarReuniao(${r.id})">Cancelar</button>
                        </div>
                        <div id="chamadaReuniao${r.id}" class="mt-3" style="display:none;"></div>
                    </div>
                </div>
            `;
        });
        
        document.getElementById('listaReunioes').innerHTML = html;
    } catch (err) {
        console.error(err);
    }
}

async function abrirChamada(reuniaoId) {
    const container = document.getElementById(`chamadaReuniao${reuniaoId}`);
    if (!container) return;

    if (container.style.display === 'block') {
        container.style.display = 'none';
        return;
    }

    container.innerHTML = '<div class="alert alert-info">Carregando chamada...</div>';
    container.style.display = 'block';

    try {
        const response = await fetch(`${API_URL}/coordenador/reunioes/${reuniaoId}/presencas`, {
            headers: getHeaders()
        });

        const presencas = await response.json();

        if (!response.ok) {
            container.innerHTML = `<div class="alert alert-danger">${escapeHtml(presencas.erro || 'Erro ao carregar chamada')}</div>`;
            mostrarAlerta('alertaCoordenador', presencas.erro || 'Erro ao carregar chamada', 'danger');
            return;
        }

        if (!presencas || presencas.length === 0) {
            container.innerHTML = '<div class="alert alert-info">Nenhum usuÃƒÆ’Ã‚Â¡rio escalado para a equipe desta chamada.</div>';
            container.style.display = 'block';
            return;
        }

        const linhas = presencas.map(p => `
            <tr>
                <td>${p.foto_perfil ? `<img src="${p.foto_perfil}" alt="Foto" style="width:32px; height:32px; border-radius:50%; object-fit:cover;">` : '-'}</td>
                <td>${escapeHtml(p.nome_completo || '')}</td>
                <td>${escapeHtml(p.perfil || '-')}</td>
                <td>${escapeHtml(p.equipe || '-')}</td>
                <td>
                    <select class="form-select form-select-sm presenca-status" data-reuniao-id="${reuniaoId}" data-usuario-id="${p.id}">
                        <option value="presente" ${p.status === 'presente' ? 'selected' : ''}>Presente</option>
                        <option value="falta_justificada" ${p.status === 'falta_justificada' ? 'selected' : ''}>Falta justificada</option>
                        <option value="falta" ${p.status === 'falta' ? 'selected' : ''}>Falta</option>
                    </select>
                </td>
                <td>
                    <input type="text" class="form-control form-control-sm presenca-observacao" data-reuniao-id="${reuniaoId}" data-usuario-id="${p.id}" value="${escapeHtml(p.observacao || '')}" placeholder="ObservaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o">
                </td>
            </tr>
        `).join('');

        container.innerHTML = `
            <h6>Chamada de presenca</h6>
            <div class="table-responsive">
                <table class="table table-sm align-middle">
                    <thead><tr><th>Foto</th><th>Usuário</th><th>Perfil</th><th>Equipe</th><th>PresenÃƒÆ’Ã‚Â§a</th><th>ObservaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o</th></tr></thead>
                    <tbody>${linhas}</tbody>
                </table>
            </div>
            <button class="btn btn-sm btn-primary" onclick="salvarChamada(${reuniaoId})">Salvar chamada</button>
        `;
        container.style.display = 'block';
    } catch (err) {
        container.innerHTML = '<div class="alert alert-danger">Erro ao carregar chamada. Verifique se o backend esta ligado e atualizado.</div>';
        mostrarAlerta('alertaCoordenador', 'Erro ao carregar chamada', 'danger');
        console.error(err);
    }
}

async function salvarChamada(reuniaoId) {
    const statusCampos = Array.from(document.querySelectorAll(`.presenca-status[data-reuniao-id="${reuniaoId}"]`));
    const presencas = statusCampos.map(campo => {
        const usuarioId = campo.dataset.usuarioId;
        const observacao = document.querySelector(`.presenca-observacao[data-reuniao-id="${reuniaoId}"][data-usuario-id="${usuarioId}"]`)?.value || '';

        return {
            usuario_id: Number(usuarioId),
            status: campo.value,
            observacao
        };
    });

    try {
        const response = await fetch(`${API_URL}/coordenador/reunioes/${reuniaoId}/presencas`, {
            method: 'PUT',
            headers: getHeaders(),
            body: JSON.stringify({ presencas })
        });

        const data = await response.json();

        if (response.ok) {
            mostrarAlerta('alertaCoordenador', 'Chamada salva com sucesso!', 'success');
        } else {
            mostrarAlerta('alertaCoordenador', data.erro || 'Erro ao salvar chamada', 'danger');
        }
    } catch (err) {
        mostrarAlerta('alertaCoordenador', 'Erro ao salvar chamada', 'danger');
        console.error(err);
    }
}

function abrirModalEditar(id, titulo, descricao, data, horarioInicio, horarioFim, local) {
    document.getElementById('reuniaoIdEditar').value = id;
    document.getElementById('tituloReuniao2').value = titulo;
    document.getElementById('descricaoReuniao2').value = descricao;
    document.getElementById('dataReuniao2').value = data;
    document.getElementById('horarioInicio2').value = horarioInicio;
    document.getElementById('horarioFim2').value = horarioFim;
    document.getElementById('localReuniao2').value = local;
    
    const modal = new bootstrap.Modal(document.getElementById('modalEditarReuniao'));
    modal.show();
}

document.getElementById('formEditarReuniao')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const id = document.getElementById('reuniaoIdEditar').value;
    const titulo = document.getElementById('tituloReuniao2').value;
    const descricao = document.getElementById('descricaoReuniao2').value;
    const data_reuniao = document.getElementById('dataReuniao2').value;
    const horario_inicio = document.getElementById('horarioInicio2').value;
    const horario_fim = document.getElementById('horarioFim2').value;
    const local = document.getElementById('localReuniao2').value;
    
    try {
        const response = await fetch(`${API_URL}/coordenador/reunioes/${id}`, {
            method: 'PUT',
            headers: getHeaders(),
            body: JSON.stringify({
                titulo, descricao, data_reuniao, horario_inicio, horario_fim, local
            })
        });
        
        if (response.ok) {
            mostrarAlerta('alertaCoordenador', 'ReuniÃƒÆ’Ã‚Â£o atualizada com sucesso!', 'success');
            bootstrap.Modal.getInstance(document.getElementById('modalEditarReuniao')).hide();
            carregarReunioes();
        }
    } catch (err) {
        mostrarAlerta('alertaCoordenador', 'Erro ao atualizar reuniÃƒÆ’Ã‚Â£o', 'danger');
        console.error(err);
    }
});

async function deletarReuniao(id) {
    if (!confirm('Tem certeza que deseja cancelar essa reuniÃƒÆ’Ã‚Â£o?')) return;
    
    try {
        const response = await fetch(`${API_URL}/coordenador/reunioes/${id}`, {
            method: 'DELETE',
            headers: getHeaders()
        });
        
        if (response.ok) {
            mostrarAlerta('alertaCoordenador', 'ReuniÃƒÆ’Ã‚Â£o cancelada com sucesso!', 'success');
            carregarReunioes();
        }
    } catch (err) {
        mostrarAlerta('alertaCoordenador', 'Erro ao cancelar reuniÃƒÆ’Ã‚Â£o', 'danger');
        console.error(err);
    }
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

async function lerErroResposta(response, mensagemPadrao) {
    try {
        const data = await response.json();
        return data.erro || mensagemPadrao;
    } catch (err) {
        return mensagemPadrao;
    }
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

function ordenarUsuarioCarografoCoordenador(a, b) {
    const nomeA = a.nome_completo || a.nome_cracha || '';
    const nomeB = b.nome_completo || b.nome_cracha || '';
    return nomeA.localeCompare(nomeB, 'pt-BR', { sensitivity: 'base' });
}

function usuarioSemEquipeCoordenador(usuario) {
    return normalizarTextoFiltroCoordenador(usuario?.equipe || '') === 'SEM EQUIPE';
}

function usuarioPertenceParoquiaFiltroCoordenador(usuario, filtro) {
    const paroquia = normalizarTextoFiltroCoordenador(usuario?.paroquia || '');
    const filtroNormalizado = normalizarTextoFiltroCoordenador(filtro);
    const paroquiasPadrao = Array.isArray(window.PAROQUIAS_PADRAO) ? window.PAROQUIAS_PADRAO : ['NOSSA SENHORA DA GUIA', 'SAO PEDRO E SAO PAULO'];
    const paroquiasPadraoNormalizadas = paroquiasPadrao.map(normalizarTextoFiltroCoordenador);

    if (filtroNormalizado === 'OUTRAS') {
        return paroquia && !paroquiasPadraoNormalizadas.includes(paroquia);
    }

    return paroquia === filtroNormalizado;
}

function obterLogoParoquiaCoordenador(paroquia) {
    const paroquiaNormalizada = normalizarTextoFiltroCoordenador(paroquia);

    if (paroquiaNormalizada === normalizarTextoFiltroCoordenador('NOSSA SENHORA DA GUIA')) {
        return {
            src: 'assets/logo-nossa-senhora-guia.png',
            alt: 'Paróquia de Nossa Senhora da Guia'
        };
    }

    if (paroquiaNormalizada === normalizarTextoFiltroCoordenador('SAO PEDRO E SAO PAULO')) {
        return {
            src: 'assets/logo-sao-pedro-sao-paulo.png',
            alt: 'Paróquia São Pedro e São Paulo'
        };
    }

    return null;
}

function normalizarTextoFiltroCoordenador(valor) {
    return String(valor || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .trim();
}

function normalizarTelefoneFiltroCoordenador(valor) {
    return String(valor || '').replace(/\D/g, '');
}
