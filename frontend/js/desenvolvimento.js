const API_URL = 'http://localhost:5000/api';
const TOKEN_KEY = 'devToken';
const ABA_ATUAL_DEV_KEY = 'desenvolvimentoAbaAtual';

let carografoDevCache = [];
let equipesDevCache = [];
let blusasDevCache = [];

const EQUIPES_SERVIDAS_DEV = [
    'Apresentadores',
    'Circulos/ Arcos / Grupos',
    'ECRISHOP/ Mini box / bodega',
    'Bandinha',
    'Boa Ação / Boa Vontade / Bem estar',
    'Liturgia',
    'Secretaria / papelaria / Escrita',
    'Transito e Sociodrama / Teatro/ Teatrinho',
    'Anjos da Alegria',
    'Anjos da Guarda',
    'Ordem / vassourinha',
    'Lanchinho/ Papa Lanche',
    'Cozinha / Ranguinho',
    'Som e Iluminação',
    'Compras',
    'Recepção aos palestrantes',
    'Visitação e Externa/ Comunicação e Informação'
];

document.addEventListener('DOMContentLoaded', () => {
    configurarPersistenciaAbas(ABA_ATUAL_DEV_KEY);
    configurarCampoParoquia('editarDevParoquia', 'campoOutraParoquiaEditarDev');
    configurarFiltrosCarografoDev();
    validarSessaoDev();
});

document.getElementById('formLoginDev')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const usuario = document.getElementById('usuarioDev').value.trim();
    const senha = document.getElementById('senhaDev').value;

    try {
        const response = await fetch(`${API_URL}/desenvolvimento/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usuario, senha })
        });
        const data = await response.json();

        if (!response.ok) {
            mostrarAlertaDev(data.erro || 'Erro ao fazer login', 'danger');
            return;
        }

        sessionStorage.setItem(TOKEN_KEY, data.token);
        mostrarAreaDev(data.usuario);
    } catch (err) {
        mostrarAlertaDev('Erro ao conectar ao servidor', 'danger');
        console.error(err);
    }
});

document.getElementById('sairDev')?.addEventListener('click', () => {
    sessionStorage.removeItem(TOKEN_KEY);
    document.getElementById('cardAreaDev').style.display = 'none';
    document.getElementById('cardLoginDev').style.display = 'block';
});

document.getElementById('atualizarLogsDev')?.addEventListener('click', carregarLogsDev);
document.getElementById('atualizarBlusasDev')?.addEventListener('click', carregarBlusasDev);
document.getElementById('pararPedidosBlusaDev')?.addEventListener('change', salvarConfiguracoesDev);
document.getElementById('salvarValoresBlusaDev')?.addEventListener('click', salvarConfiguracoesDev);
document.getElementById('editarDevAnoEncontro')?.addEventListener('input', limitarCampoNumericoDev);

document.getElementById('formEditarUsuárioDev')?.addEventListener('submit', salvarEdicaoUsuárioDev);
document.getElementById('formEscalarDev')?.addEventListener('submit', salvarEscalaUsuárioDev);

async function validarSessaoDev() {
    const token = sessionStorage.getItem(TOKEN_KEY);
    if (!token) return;

    try {
        const response = await fetch(`${API_URL}/desenvolvimento/acesso`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const data = await response.json();

        if (response.ok) {
            mostrarAreaDev(data.usuario);
        } else {
            sessionStorage.removeItem(TOKEN_KEY);
        }
    } catch (err) {
        sessionStorage.removeItem(TOKEN_KEY);
    }
}

function mostrarAreaDev(usuario) {
    document.getElementById('cardLoginDev').style.display = 'none';
    document.getElementById('cardAreaDev').style.display = 'block';
    document.getElementById('usuarioDevLogado').textContent = `Usuário: ${usuario}`;
    document.getElementById('alertaDev').style.display = 'none';
    carregarEquipesDev();
    carregarLogsDev();
    carregarCarografoDev();
    carregarBlusasDev();
    carregarConfiguracoesDev();
    abrirAbaPersistida(ABA_ATUAL_DEV_KEY, 'painelLogsDev');
}

async function carregarLogsDev() {
    const token = sessionStorage.getItem(TOKEN_KEY);
    if (!token) return;

    try {
        const response = await fetch(`${API_URL}/desenvolvimento/logs`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const logs = await response.json();

        if (!response.ok) {
            mostrarAlertaDev(logs.erro || 'Erro ao carregar logs', 'danger');
            return;
        }

        renderizarLogsDev(logs);
    } catch (err) {
        mostrarAlertaDev('Erro ao carregar logs', 'danger');
        console.error(err);
    }
}

function renderizarLogsDev(logs) {
    const container = document.getElementById('listaLogsDev');

    if (!logs.length) {
        container.innerHTML = '<div class="alert alert-info mb-0">Nenhuma ação registrada ainda.</div>';
        return;
    }

    const linhas = logs.map(log => {
        const data = formatarDataHora(log.data_acao);
        const usuario = log.nome_completo || log.detalhes?.nome_completo || `ID ${log.usuario_id}`;
        const detalhes = formatarDetalhes(log.detalhes);

        return `
            <tr>
                <td>${escapeHtml(data)}</td>
                <td>${escapeHtml(usuario)}</td>
                <td>${escapeHtml(log.acao || '')}</td>
                <td>${escapeHtml(log.perfil || '-')}</td>
                <td>${escapeHtml(log.equipe || '-')}</td>
                <td>${escapeHtml(detalhes)}</td>
            </tr>
        `;
    }).join('');

    container.innerHTML = `
        <table class="table table-sm table-hover align-middle">
            <thead>
                <tr>
                    <th>Data e horario</th>
                    <th>Usuário</th>
                    <th>Acao</th>
                    <th>Perfil</th>
                    <th>Equipe</th>
                    <th>Detalhes</th>
                </tr>
            </thead>
            <tbody>${linhas}</tbody>
        </table>
    `;
}

async function carregarBlusasDev() {
    const token = sessionStorage.getItem(TOKEN_KEY);
    if (!token) return;

    try {
        const response = await fetch(`${API_URL}/desenvolvimento/blusas`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const blusas = await response.json();

        if (!response.ok) {
            mostrarAlertaDev(blusas.erro || 'Erro ao carregar blusas', 'danger');
            return;
        }

        blusasDevCache = blusas;
        renderizarResumoBlusasDev(blusasDevCache);
        renderizarBlusasDev(blusasDevCache);
    } catch (err) {
        mostrarAlertaDev('Erro ao carregar blusas', 'danger');
        console.error(err);
    }
}

function renderizarResumoBlusasDev(blusas) {
    const container = document.getElementById('resumoBlusasDev');
    if (!container) return;

    const totalCamisas = blusas.length;
    const totalPagas = blusas.filter(blusa => blusa.status === 'confirmado').length;
    const totalFaltaPagar = blusas.filter(blusa => blusa.status !== 'confirmado').length;
    const valorTotal = blusas.reduce((total, blusa) => total + Number(blusa.valor || 0), 0);
    const valorPago = blusas
        .filter(blusa => blusa.status === 'confirmado')
        .reduce((total, blusa) => total + Number(blusa.valor || 0), 0);
    const valorFaltaPagar = blusas
        .filter(blusa => blusa.status !== 'confirmado')
        .reduce((total, blusa) => total + Number(blusa.valor || 0), 0);
    const pedidosPorUsuario = blusas.reduce((acc, blusa) => {
        const usuarioId = blusa.usuario_id || blusa.email || blusa.nome_completo || 'sem_usuario';
        acc[usuarioId] = (acc[usuarioId] || 0) + 1;
        return acc;
    }, {});
    const faixasPreco = Object.values(pedidosPorUsuario).reduce((acc, quantidade) => {
        if (quantidade === 1) {
            acc.precoUnico += 1;
        } else {
            acc.precoMultiplo += quantidade;
        }
        return acc;
    }, { precoUnico: 0, precoMultiplo: 0 });
    const porTamanho = blusas.reduce((acc, blusa) => {
        const tamanho = blusa.tamanho || 'Sem tamanho';
        acc[tamanho] = (acc[tamanho] || 0) + 1;
        return acc;
    }, {});

    const linhasTamanho = Object.entries(porTamanho)
        .sort(([a], [b]) => a.localeCompare(b, 'pt-BR', { numeric: true }))
        .map(([tamanho, quantidade]) => `
            <tr>
                <td>${escapeHtml(tamanho)}</td>
                <td><strong>${quantidade}</strong></td>
            </tr>
        `).join('');

    container.innerHTML = `
        <div class="col-md-4 col-lg-3">
            <div class="resumo-blusas-total">
                <span>Total de camisas</span>
                <strong>${totalCamisas} / ${formatarMoedaDev(valorTotal)}</strong>
            </div>
        </div>
        <div class="col-md-4 col-lg-3">
            <div class="resumo-blusas-total">
                <span>Camisas pagas</span>
                <strong>${totalPagas} / ${formatarMoedaDev(valorPago)}</strong>
            </div>
        </div>
        <div class="col-md-4 col-lg-3">
            <div class="resumo-blusas-total">
                <span>Falta pagar</span>
                <strong>${totalFaltaPagar} / ${formatarMoedaDev(valorFaltaPagar)}</strong>
            </div>
        </div>
        <div class="col-md-6 col-lg-4">
            <div class="table-responsive resumo-blusas-tabela">
                <table class="table table-sm mb-0 align-middle">
                    <thead><tr><th>Faixa de preço</th><th>Quantidade</th></tr></thead>
                    <tbody>
                        <tr><td>Preço de 1 peça</td><td><strong>${faixasPreco.precoUnico}</strong></td></tr>
                        <tr><td>Preço a partir de 2 peças</td><td><strong>${faixasPreco.precoMultiplo}</strong></td></tr>
                    </tbody>
                </table>
            </div>
        </div>
        <div class="col-md-8 col-lg-5">
            <div class="table-responsive resumo-blusas-tabela">
                <table class="table table-sm mb-0 align-middle">
                    <thead><tr><th>Tamanho</th><th>Quantidade</th></tr></thead>
                    <tbody>${linhasTamanho || '<tr><td colspan="2">Nenhuma camisa solicitada.</td></tr>'}</tbody>
                </table>
            </div>
        </div>
    `;
}

function renderizarBlusasDev(blusas) {
    const container = document.getElementById('tabelaBlusasDev');
    if (!container) return;

    if (!blusas.length) {
        container.innerHTML = '<div class="alert alert-info mb-0">Nenhuma blusa solicitada.</div>';
        return;
    }

    const linhas = blusas.map((blusa) => {
        const fotoHtml = blusa.foto_perfil
            ? `<img src="${escapeHtml(blusa.foto_perfil)}" alt="Foto" style="width:38px; height:38px; border-radius:50%; object-fit:cover;">`
            : '<div style="width:38px; height:38px; border-radius:50%; background:#ddd; display:flex; align-items:center; justify-content:center;">-</div>';
        const status = obterStatusBadge(blusa.status);
        const baixa = blusa.status === 'confirmado'
            ? `${formatarFormaPagamentoDev(blusa.forma_pagamento)}<br><small>${formatarDataHoraDev(blusa.data_confirmacao)}</small>`
            : '-';
        return `
            <tr>
                <td>${fotoHtml}</td>
                <td><strong>${escapeHtml(blusa.nome_completo || '')}</strong><br><small>${escapeHtml(blusa.equipe || '-')}</small></td>
                <td>${escapeHtml(blusa.tamanho || '-')}</td>
                <td>${formatarMoedaDev(blusa.valor || 0)}</td>
                <td>${status}</td>
                <td>${baixa}</td>
                <td>${formatarDataHoraDev(blusa.data_solicitacao)}</td>
            </tr>
        `;
    }).join('');

    container.innerHTML = `
        <table class="table table-sm table-hover align-middle">
            <thead>
                <tr>
                    <th>Foto</th>
                    <th>Usuário</th>
                    <th>Tamanho</th>
                    <th>Valor</th>
                    <th>Status</th>
                    <th>Baixa</th>
                    <th>Solicitação</th>
                </tr>
            </thead>
            <tbody>${linhas}</tbody>
        </table>
    `;

}

async function carregarConfiguracoesDev() {
    const token = sessionStorage.getItem(TOKEN_KEY);
    if (!token) return;

    try {
        const response = await fetch(`${API_URL}/desenvolvimento/configuracoes`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const configuracoes = await response.json();

        if (!response.ok) {
            mostrarAlertaDev(configuracoes.erro || 'Erro ao carregar configurações', 'danger');
            return;
        }

        const checkbox = document.getElementById('pararPedidosBlusaDev');
        if (checkbox) checkbox.checked = Boolean(configuracoes.parar_pedidos_blusa);
        const valorUnico = document.getElementById('valorBlusaUnicaDev');
        const valorMultipla = document.getElementById('valorBlusaMultiplaDev');
        if (valorUnico) valorUnico.value = Number(configuracoes.valor_blusa_unica || 35).toFixed(2);
        if (valorMultipla) valorMultipla.value = Number(configuracoes.valor_blusa_multipla || 32.5).toFixed(2);
    } catch (err) {
        mostrarAlertaDev('Erro ao carregar configurações', 'danger');
        console.error(err);
    }
}

async function salvarConfiguracoesDev() {
    const token = sessionStorage.getItem(TOKEN_KEY);
    if (!token) return;

    const pararPedidosBlusa = document.getElementById('pararPedidosBlusaDev')?.checked || false;
    const valorBlusaUnica = obterValorMonetarioDev('valorBlusaUnicaDev');
    const valorBlusaMultipla = obterValorMonetarioDev('valorBlusaMultiplaDev');

    if (!Number.isFinite(valorBlusaUnica) || valorBlusaUnica <= 0 || !Number.isFinite(valorBlusaMultipla) || valorBlusaMultipla <= 0) {
        mostrarAlertaDev('Informe valores válidos para as blusas', 'warning');
        return;
    }

    try {
        const response = await fetch(`${API_URL}/desenvolvimento/configuracoes`, {
            method: 'PUT',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                parar_pedidos_blusa: pararPedidosBlusa,
                valor_blusa_unica: valorBlusaUnica,
                valor_blusa_multipla: valorBlusaMultipla
            })
        });
        const data = await response.json();

        if (response.ok) {
            mostrarAlertaDev('Configuração de blusas salva.', 'success');
            carregarConfiguracoesDev();
            carregarBlusasDev();
        } else {
            mostrarAlertaDev(data.erro || 'Erro ao salvar configurações', 'danger');
            carregarConfiguracoesDev();
        }
    } catch (err) {
        mostrarAlertaDev('Erro ao salvar configurações', 'danger');
        carregarConfiguracoesDev();
        console.error(err);
    }
}

function formatarFormaPagamentoDev(forma) {
    const mapa = {
        pix: 'PIX',
        dinheiro: 'Dinheiro'
    };
    return mapa[forma] || '-';
}

function formatarDataHoraDev(valor) {
    if (!valor) return '-';
    return new Date(valor).toLocaleString('pt-BR');
}

function formatarMoedaDev(valor) {
    return Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function obterValorMonetarioDev(elementId) {
    const valor = document.getElementById(elementId)?.value || '';
    return normalizarValorMonetarioDev(valor);
}

function normalizarValorMonetarioDev(valor) {
    const texto = String(valor || '').trim().replace(/\s/g, '');
    if (!texto) return NaN;

    const temVirgula = texto.includes(',');
    const temPonto = texto.includes('.');

    if (temVirgula && temPonto) {
        const ultimaVirgula = texto.lastIndexOf(',');
        const ultimoPonto = texto.lastIndexOf('.');
        const separadorDecimal = ultimaVirgula > ultimoPonto ? ',' : '.';
        const separadorMilhar = separadorDecimal === ',' ? '.' : ',';
        return Number(texto.replaceAll(separadorMilhar, '').replace(separadorDecimal, '.'));
    }

    if (temVirgula) {
        return Number(texto.replace(',', '.'));
    }

    return Number(texto);
}

async function carregarCarografoDev() {
    const token = sessionStorage.getItem(TOKEN_KEY);
    if (!token) return;

    try {
        const response = await fetch(`${API_URL}/desenvolvimento/carografo`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const usuarios = await response.json();

        if (!response.ok) {
            mostrarAlertaDev(usuarios.erro || 'Erro ao carregar carografo', 'danger');
            return;
        }

        carografoDevCache = usuarios;
        preencherFiltroEquipesCarografoDev();
        aplicarFiltrosCarografoDev();
    } catch (err) {
        mostrarAlertaDev('Erro ao carregar carografo', 'danger');
        console.error(err);
    }
}

async function carregarEquipesDev() {
    const token = sessionStorage.getItem(TOKEN_KEY);
    if (!token) return;

    try {
        const response = await fetch(`${API_URL}/desenvolvimento/equipes`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const equipes = await response.json();

        if (!response.ok) return;

        equipesDevCache = Array.isArray(equipes) ? equipes : [];
        preencherSelectEquipesDev();
    } catch (err) {
        console.error(err);
    }
}

function configurarFiltrosCarografoDev() {
    ['filtroCarografoDevEquipe', 'filtroCarografoDevMovimento', 'filtroCarografoDevMusical', 'filtroCarografoDevParoquia'].forEach((id) => {
        document.getElementById(id)?.addEventListener('change', aplicarFiltrosCarografoDev);
    });
    document.getElementById('filtroCarografoDevNome')?.addEventListener('input', aplicarFiltrosCarografoDev);

    document.getElementById('limparFiltrosCarografoDev')?.addEventListener('click', () => {
        document.getElementById('filtroCarografoDevNome').value = '';
        document.getElementById('filtroCarografoDevParoquia').value = '';
        document.getElementById('filtroCarografoDevEquipe').value = '';
        document.getElementById('filtroCarografoDevMovimento').value = '';
        document.getElementById('filtroCarografoDevMusical').value = '';
        aplicarFiltrosCarografoDev();
    });

    document.getElementById('baixarRelatorioCarografoDev')?.addEventListener('click', baixarRelatorioCarografoDevExcel);
}

function preencherFiltroEquipesCarografoDev() {
    const select = document.getElementById('filtroCarografoDevEquipe');
    if (!select) return;

    const valorAtual = select.value;
    const equipes = Array.from(new Set(carografoDevCache.map(usuario => usuario.equipe || 'SEM EQUIPE')))
        .sort((a, b) => {
            if (a === 'SEM EQUIPE') return -1;
            if (b === 'SEM EQUIPE') return 1;
            return a.localeCompare(b, 'pt-BR');
        });

    select.innerHTML = '<option value="">Todas</option>' + equipes
        .map(equipe => `<option value="${escapeHtml(equipe)}">${escapeHtml(equipe)}</option>`)
        .join('');

    if (equipes.includes(valorAtual)) {
        select.value = valorAtual;
    }
}

function preencherSelectEquipesDev() {
    const opcoes = equipesDevCache
        .map(equipe => `<option value="${escapeHtml(equipe)}">${escapeHtml(equipe)}</option>`)
        .join('');

    const editarEquipe = document.getElementById('editarDevEquipe');
    if (editarEquipe) {
        editarEquipe.innerHTML = '<option value="">SEM EQUIPE</option>' + opcoes;
    }

    const escalarEquipe = document.getElementById('escalarDevEquipe');
    if (escalarEquipe) {
        escalarEquipe.innerHTML = '<option value="">Manter equipe atual</option>' + opcoes;
    }
}

function aplicarFiltrosCarografoDev() {
    const termoBusca = normalizarTextoFiltroDev(document.getElementById('filtroCarografoDevNome')?.value || '');
    const telefoneBusca = normalizarTelefoneFiltroDev(document.getElementById('filtroCarografoDevNome')?.value || '');
    const paroquia = document.getElementById('filtroCarografoDevParoquia')?.value || '';
    const equipe = document.getElementById('filtroCarografoDevEquipe')?.value || '';
    const movimento = document.getElementById('filtroCarografoDevMovimento')?.value || '';
    const musical = document.getElementById('filtroCarografoDevMusical')?.value || '';

    const usuarios = carografoDevCache.filter((usuario) => {
        const toca = usuario.toca_instrumento === 'sim';
        const canta = usuario.canta === 'sim';
        const nomeUsuario = normalizarTextoFiltroDev(`${usuario.nome_completo || ''} ${usuario.nome_cracha || ''}`);
        const telefoneUsuario = normalizarTelefoneFiltroDev(usuario.telefone || '');

        if (termoBusca && !nomeUsuario.includes(termoBusca) && !(telefoneBusca && telefoneUsuario.includes(telefoneBusca))) return false;
        if (paroquia && !usuarioPertenceParoquiaFiltroDev(usuario, paroquia)) return false;
        if (equipe && (usuario.equipe || 'SEM EQUIPE') !== equipe) return false;
        if (movimento && usuario.movimento_origem !== movimento) return false;
        if (musical === 'canta' && !canta) return false;
        if (musical === 'toca' && !toca) return false;
        if (musical === 'canta_toca' && (!canta || !toca)) return false;
        if (musical === 'canta_ou_toca' && (!canta && !toca)) return false;

        return true;
    });

    renderizarCarografoDev(usuarios.sort(ordenarUsuarioCarografoDev));
}

function renderizarCarografoDev(usuarios) {
    const painel = document.getElementById('painelCarografoDev');
    if (!painel) return;

    if (!usuarios || usuarios.length === 0) {
        painel.innerHTML = '<div class="alert alert-info">Nenhum usuário encontrado.</div>';
        return;
    }

    painel.innerHTML = [...usuarios].sort(ordenarUsuarioCarografoDev).map(usuario => {
        const nome = escapeHtml(usuario.nome_completo || '');
        const movimentoOrigem = escapeHtml(usuario.movimento_origem || '-');
        const anoEncontro = escapeHtml(usuario.ano_encontro || '-');
        const telefone = escapeHtml(usuario.telefone || '-');
        const paroquiaValor = obterParoquiaUsuarioDev(usuario);
        const equipeAtual = escapeHtml(usuario.equipe || 'SEM EQUIPE');
        const statusBadge = obterStatusBadge(usuario.status);
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
            ? `<img src="${escapeHtml(usuario.foto_perfil)}" alt="Foto de ${nome}" class="carografo-foto" onclick="abrirModalResumoCarografoDev(${Number(usuario.id)})">`
            : `<div class="carografo-foto carografo-foto-placeholder" onclick="abrirModalResumoCarografoDev(${Number(usuario.id)})">-</div>`;
        const logoParoquia = obterLogoParoquiaDev(paroquiaValor);
        const logoParoquiaHtml = logoParoquia
            ? `<img src="${logoParoquia.src}" alt="${logoParoquia.alt}" class="carografo-paroquia-logo">`
            : '';
        const classesCard = [
            'carografo-item',
            destaqueMusical ? 'carografo-item-musical' : '',
            usuarioRemovidoDoEncontroDev(usuario) ? 'carografo-item-removido' : ''
        ].filter(Boolean).join(' ');

        return `
            <div class="${classesCard}">
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
                    <div class="carografo-status">${statusBadge}</div>
                </div>
            </div>
        `;
    }).join('');
}

function ordenarUsuarioCarografoDev(a, b) {
    const nomeA = a.nome_completo || a.nome_cracha || '';
    const nomeB = b.nome_completo || b.nome_cracha || '';
    return nomeA.localeCompare(nomeB, 'pt-BR', { sensitivity: 'base' });
}

function obterParoquiaUsuarioDev(usuario) {
    return usuario?.paroquia || '';
}

function usuarioSemEquipeDev(usuario) {
    return normalizarTextoFiltroDev(usuario?.equipe || '') === 'SEM EQUIPE';
}

function usuarioRemovidoDoEncontroDev(usuario) {
    return usuarioSemEquipeDev(usuario) && ['negou', 'desistiu'].includes(usuario?.status);
}

function usuarioPertenceParoquiaFiltroDev(usuario, filtro) {
    const paroquia = normalizarTextoFiltroDev(obterParoquiaUsuarioDev(usuario));
    const filtroNormalizado = normalizarTextoFiltroDev(filtro);
    const paroquiasPadrao = Array.isArray(window.PAROQUIAS_PADRAO) ? window.PAROQUIAS_PADRAO : ['NOSSA SENHORA DA GUIA', 'SAO PEDRO E SAO PAULO'];
    const paroquiasPadraoNormalizadas = paroquiasPadrao.map(normalizarTextoFiltroDev);

    if (filtroNormalizado === 'OUTRAS') {
        return paroquia && !paroquiasPadraoNormalizadas.includes(paroquia);
    }

    return paroquia === filtroNormalizado;
}

function obterLogoParoquiaDev(paroquia) {
    const paroquiaNormalizada = normalizarTextoFiltroDev(paroquia);

    if (paroquiaNormalizada === normalizarTextoFiltroDev('NOSSA SENHORA DA GUIA')) {
        return {
            src: 'assets/logo-nossa-senhora-guia.png',
            alt: 'Paróquia de Nossa Senhora da Guia'
        };
    }

    if (paroquiaNormalizada === normalizarTextoFiltroDev('SAO PEDRO E SAO PAULO')) {
        return {
            src: 'assets/logo-sao-pedro-sao-paulo.png',
            alt: 'Paróquia São Pedro e São Paulo'
        };
    }

    return null;
}

function normalizarTextoFiltroDev(valor) {
    return String(valor || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .trim();
}

function normalizarTelefoneFiltroDev(valor) {
    return String(valor || '').replace(/\D/g, '');
}

function abrirModalResumoCarografoDev(usuarioId) {
    const usuario = carografoDevCache.find(u => Number(u.id) === Number(usuarioId));
    if (!usuario) return;

    const modalEl = document.getElementById('modalResumoCarografoDev');
    const corpo = modalEl.querySelector('.modal-body');
    const equipesServidas = normalizarEquipesServidas(usuario.equipes_servidas);
    const equipesHtml = equipesServidas.length
        ? `<ul class="mb-0">${equipesServidas.map(equipe => `<li>${escapeHtml(equipe)}</li>`).join('')}</ul>`
        : '<span class="text-muted">Nenhuma informada</span>';
    const fotoHtml = usuario.foto_perfil
        ? `<img src="${escapeHtml(usuario.foto_perfil)}" alt="Foto de ${escapeHtml(usuario.nome_completo || '')}" class="mb-3" style="width:160px; height:160px; border-radius:50%; object-fit:cover; cursor:pointer;" title="Clique para ampliar" onclick="abrirModalFotoGrandeDev('${escapeJsAttr(usuario.foto_perfil)}')">`
        : '<div class="mx-auto mb-3" style="width:160px; height:160px; border-radius:50%; background:#ddd; display:flex; align-items:center; justify-content:center;">-</div>';

    corpo.innerHTML = `
        <div class="text-center">
            ${fotoHtml}
            <h5 class="mb-1">${escapeHtml(usuario.nome_completo || '-')}</h5>
            <p class="text-muted mb-3">${escapeHtml(usuario.nome_cracha || '')}</p>
        </div>
        <table class="table table-sm">
            <tbody>
                <tr><th>Telefone</th><td>${escapeHtml(usuario.telefone || '-')}</td></tr>
                <tr><th>Paróquia</th><td>${escapeHtml(obterParoquiaUsuarioDev(usuario) || '-')}</td></tr>
                <tr><th>Movimento</th><td>${escapeHtml(usuario.movimento_origem || '-')}</td></tr>
                <tr><th>Ano do encontro</th><td>${escapeHtml(usuario.ano_encontro || '-')}</td></tr>
                <tr><th>Equipe atual</th><td>${escapeHtml(usuario.equipe || '-')}</td></tr>
                <tr><th>Status</th><td>${obterStatusBadge(usuario.status)}</td></tr>
                <tr><th>Perfil</th><td>${escapeHtml(formatarPerfilAcesso(usuario.perfil))}</td></tr>
                <tr><th>Toca instrumento?</th><td>${formatarSimNao(usuario.toca_instrumento)}</td></tr>
                <tr><th>Instrumentos</th><td>${escapeHtml(usuario.instrumentos || '-')}</td></tr>
                <tr><th>Canta?</th><td>${formatarSimNao(usuario.canta)}</td></tr>
                <tr><th>Equipes que já serviu</th><td>${equipesHtml}</td></tr>
            </tbody>
        </table>
        <div class="d-flex justify-content-end gap-2 flex-wrap">
            <button type="button" class="btn btn-outline-dark" onclick="abrirHistóricoUsuárioDev(${Number(usuario.id)}, '${escapeJsAttr(usuario.nome_completo || '')}')">Histórico</button>
            <button type="button" class="btn btn-secondary" onclick="abrirModalEditarUsuárioDev(${Number(usuario.id)})">Editar</button>
            <button type="button" class="btn btn-primary" onclick="abrirModalEscalarDev(${Number(usuario.id)})">Escalar</button>
            <button type="button" class="btn btn-danger" onclick="excluirUsuárioDev(${Number(usuario.id)}, '${escapeJsAttr(usuario.nome_completo || '')}')">Excluir</button>
        </div>
    `;

    new bootstrap.Modal(modalEl).show();
}

function abrirModalEditarUsuárioDev(usuarioId) {
    const usuario = carografoDevCache.find(u => Number(u.id) === Number(usuarioId));
    if (!usuario) return;

    document.getElementById('editarDevUsuárioId').value = usuario.id;
    document.getElementById('editarDevNomeCompleto').value = usuario.nome_completo || '';
    document.getElementById('editarDevNomeCracha').value = usuario.nome_cracha || '';
    document.getElementById('editarDevTelefone').value = usuario.telefone || '';
    preencherParoquia('editarDevParoquia', 'outraParoquiaEditarDev', 'campoOutraParoquiaEditarDev', usuario.paroquia);
    document.getElementById('editarDevMovimento').value = usuario.movimento_origem || '';
    document.getElementById('editarDevAnoEncontro').value = usuario.ano_encontro || '';
    document.getElementById('editarDevEquipe').value = usuario.equipe || '';
    document.getElementById('editarDevStatus').value = usuario.status || 'pendente';
    document.getElementById('editarDevRestricaoMedica').value = usuario.restricao_medica || '';
    document.getElementById('editarDevRestricaoAlimentar').value = usuario.restricao_alimentar || '';
    document.getElementById('editarDevRestricaoMedicacao').value = usuario.restricao_medicacao || '';
    marcarRadioDev('editarDevTocaInstrumento', usuario.toca_instrumento || 'nao');
    document.getElementById('editarDevInstrumentos').value = usuario.instrumentos || '';
    marcarRadioDev('editarDevCanta', usuario.canta || 'nao');
    renderizarEquipesServidasDev(normalizarEquipesServidas(usuario.equipes_servidas));

    const resumo = bootstrap.Modal.getInstance(document.getElementById('modalResumoCarografoDev'));
    if (resumo) resumo.hide();

    setTimeout(() => {
        new bootstrap.Modal(document.getElementById('modalEditarUsuárioDev')).show();
    }, 250);
}

async function salvarEdicaoUsuárioDev(e) {
    e.preventDefault();

    const usuarioId = document.getElementById('editarDevUsuárioId').value;
    const anoEncontro = somenteNumerosDev(document.getElementById('editarDevAnoEncontro').value);
    const paroquia = obterParoquia('editarDevParoquia', 'outraParoquiaEditarDev');

    if (!anoEncontroValidoDev(anoEncontro)) {
        mostrarAlertaDev('Informe um ano do encontro válido', 'warning');
        return;
    }

    if (!paroquiaValida(paroquia)) {
        mostrarAlertaDev('Informe a paróquia à qual o usuário pertence', 'warning');
        return;
    }

    const body = {
        nome_cracha: document.getElementById('editarDevNomeCracha').value,
        telefone: document.getElementById('editarDevTelefone').value,
        paroquia,
        movimento_origem: document.getElementById('editarDevMovimento').value,
        ano_encontro: anoEncontro,
        equipe: document.getElementById('editarDevEquipe').value,
        status: document.getElementById('editarDevStatus').value,
        restricao_medica: document.getElementById('editarDevRestricaoMedica').value,
        restricao_alimentar: document.getElementById('editarDevRestricaoAlimentar').value,
        restricao_medicacao: document.getElementById('editarDevRestricaoMedicacao').value,
        toca_instrumento: obterRadioDev('editarDevTocaInstrumento') || 'nao',
        instrumentos: document.getElementById('editarDevInstrumentos').value,
        canta: obterRadioDev('editarDevCanta') || 'nao',
        equipes_servidas: obterEquipesServidasDev()
    };

    try {
        const response = await fetch(`${API_URL}/desenvolvimento/usuarios/${usuarioId}/perfil`, {
            method: 'PUT',
            headers: getHeadersDev(),
            body: JSON.stringify(body)
        });
        const data = await response.json();

        if (!response.ok) {
            mostrarAlertaDev(data.erro || 'Erro ao atualizar perfil', 'danger');
            return;
        }

        mostrarAlertaDev('Perfil atualizado com sucesso!', 'success');
        bootstrap.Modal.getInstance(document.getElementById('modalEditarUsuárioDev'))?.hide();
        await carregarCarografoDev();
        await carregarLogsDev();
    } catch (err) {
        mostrarAlertaDev('Erro ao atualizar perfil', 'danger');
        console.error(err);
    }
}

function abrirModalEscalarDev(usuarioId) {
    const usuario = carografoDevCache.find(u => Number(u.id) === Number(usuarioId));
    if (!usuario) return;

    document.getElementById('formEscalarDev').reset();
    document.getElementById('escalarDevUsuárioId').value = usuario.id;
    document.getElementById('escalarDevPerfil').value = '';
    document.getElementById('escalarDevEquipe').value = '';

    const resumo = bootstrap.Modal.getInstance(document.getElementById('modalResumoCarografoDev'));
    if (resumo) resumo.hide();

    setTimeout(() => {
        new bootstrap.Modal(document.getElementById('modalEscalarDev')).show();
    }, 250);
}

async function salvarEscalaUsuárioDev(e) {
    e.preventDefault();

    const usuarioId = document.getElementById('escalarDevUsuárioId').value;
    const perfil = document.getElementById('escalarDevPerfil').value;
    const equipe = document.getElementById('escalarDevEquipe').value;

    if (!perfil && !equipe) {
        mostrarAlertaDev('Selecione um perfil ou uma equipe para escalar.', 'warning');
        return;
    }

    try {
        const response = await fetch(`${API_URL}/desenvolvimento/escalar/${usuarioId}`, {
            method: 'PUT',
            headers: getHeadersDev(),
            body: JSON.stringify({ perfil, equipe })
        });
        const data = await response.json();

        if (!response.ok) {
            mostrarAlertaDev(data.erro || 'Erro ao escalar usuario', 'danger');
            return;
        }

        mostrarAlertaDev('Usuário escalado com sucesso!', 'success');
        bootstrap.Modal.getInstance(document.getElementById('modalEscalarDev'))?.hide();
        await carregarCarografoDev();
        await carregarLogsDev();
    } catch (err) {
        mostrarAlertaDev('Erro ao escalar usuario', 'danger');
        console.error(err);
    }
}

async function excluirUsuárioDev(usuarioId, nomeUsuário) {
    const confirmado = confirm(`Tem certeza que deseja excluir o usuario ${nomeUsuário}? Essa acao não pode ser desfeita.`);
    if (!confirmado) return;

    try {
        const response = await fetch(`${API_URL}/desenvolvimento/usuarios/${usuarioId}`, {
            method: 'DELETE',
            headers: getHeadersDev()
        });
        const data = await response.json();

        if (!response.ok) {
            mostrarAlertaDev(data.erro || 'Erro ao excluir usuario', 'danger');
            return;
        }

        mostrarAlertaDev('Usuário excluido com sucesso!', 'success');
        bootstrap.Modal.getInstance(document.getElementById('modalResumoCarografoDev'))?.hide();
        await carregarCarografoDev();
        await carregarLogsDev();
    } catch (err) {
        mostrarAlertaDev('Erro ao excluir usuario', 'danger');
        console.error(err);
    }
}

async function abrirHistóricoUsuárioDev(usuarioId, nomeUsuário) {
    const container = document.getElementById('conteudoHistóricoUsuárioDev');
    const modalEl = document.getElementById('modalHistóricoUsuárioDev');
    modalEl.querySelector('.modal-title').textContent = `Histórico de ${nomeUsuário || 'Usuário'}`;
    container.innerHTML = '<div class="alert alert-info mb-0">Carregando histórico...</div>';

    new bootstrap.Modal(modalEl).show();

    try {
        const response = await fetch(`${API_URL}/desenvolvimento/usuarios/${usuarioId}/logs`, {
            headers: { Authorization: `Bearer ${sessionStorage.getItem(TOKEN_KEY)}` }
        });
        const logs = await response.json();

        if (!response.ok) {
            container.innerHTML = `<div class="alert alert-danger mb-0">${escapeHtml(logs.erro || 'Erro ao carregar histórico')}</div>`;
            return;
        }

        renderizarHistóricoUsuárioDev(logs);
    } catch (err) {
        container.innerHTML = '<div class="alert alert-danger mb-0">Erro ao carregar histórico.</div>';
        console.error(err);
    }
}

function renderizarHistóricoUsuárioDev(logs) {
    const container = document.getElementById('conteudoHistóricoUsuárioDev');

    if (!logs.length) {
        container.innerHTML = '<div class="alert alert-info mb-0">Nenhum histórico encontrado para este usuario.</div>';
        return;
    }

    const linhas = logs.map((log) => {
        const detalhes = formatarDetalhes(log.detalhes);
        return `
            <tr>
                <td>${escapeHtml(formatarDataHora(log.data_acao))}</td>
                <td>${escapeHtml(log.responsavel || '-')}</td>
                <td>${escapeHtml(formatarAcaoHistórico(log.acao || ''))}</td>
                <td>${escapeHtml(detalhes || '-')}</td>
            </tr>
        `;
    }).join('');

    container.innerHTML = `
        <div class="table-responsive">
            <table class="table table-sm table-hover align-middle">
                <thead>
                    <tr>
                        <th>Data e horario</th>
                        <th>Quem fez</th>
                        <th>O que foi feito</th>
                        <th>Detalhes da mudanca</th>
                    </tr>
                </thead>
                <tbody>${linhas}</tbody>
            </table>
        </div>
    `;
}

function abrirModalFotoGrandeDev(fotoSrc) {
    const modalEl = document.getElementById('modalFotoGrandeDev');
    document.getElementById('fotoGrandeDevImagem').src = fotoSrc;
    new bootstrap.Modal(modalEl).show();
}

function baixarRelatorioCarografoDevExcel() {
    if (typeof XLSX === 'undefined') {
        mostrarAlertaDev('Biblioteca de Excel não carregada. Verifique a internet e tente novamente.', 'warning');
        return;
    }

    const usuarios = carografoDevCache.filter(usuario => usuario.status === 'confirmado' && !usuarioSemEquipeDev(usuario));
    if (!usuarios.length) {
        mostrarAlertaDev('Nenhum usuário confirmado para exportar.', 'warning');
        return;
    }

    const workbook = XLSX.utils.book_new();
    const equipes = Array.from(new Set(usuarios.map(usuario => usuario.equipe || 'SEM EQUIPE')))
        .sort((a, b) => {
            if (a === 'SEM EQUIPE') return -1;
            if (b === 'SEM EQUIPE') return 1;
            return a.localeCompare(b, 'pt-BR');
        });

    equipes.forEach((equipe) => {
        const linhas = usuarios
            .filter(usuario => (usuario.equipe || 'SEM EQUIPE') === equipe)
            .sort(ordenarPorPerfilRelatorio)
            .map(usuario => ({
                'Nome completo': usuario.nome_completo || '',
                'Nome do crachá': usuario.nome_cracha || '',
                'Paróquia': obterParoquiaUsuarioDev(usuario) || '',
                'Movimento de origem': usuario.movimento_origem || '',
                'Telefone para contato': usuario.telefone || '',
                'Perfil de acesso': formatarPerfilAcesso(usuario.perfil)
            }));

        const worksheet = XLSX.utils.json_to_sheet(linhas, {
            header: [
                'Nome completo',
                'Nome do crachá',
                'Paróquia',
                'Movimento de origem',
                'Telefone para contato',
                'Perfil de acesso'
            ]
        });
        worksheet['!cols'] = [
            { wch: 34 },
            { wch: 24 },
            { wch: 28 },
            { wch: 20 },
            { wch: 22 },
            { wch: 18 }
        ];

        XLSX.utils.book_append_sheet(workbook, worksheet, nomeAbaExcel(equipe, workbook.SheetNames));
    });

    const data = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(workbook, `relatorio-carografo-dev-${data}.xlsx`);
}

function ordenarPorPerfilRelatorio(a, b) {
    const prioridade = {
        coordenador: 0,
        equipista: 1,
        equipe_dirigente: 2,
        sem_cadastro: 3
    };
    const prioridadeA = prioridade[a.perfil] ?? 4;
    const prioridadeB = prioridade[b.perfil] ?? 4;

    if (prioridadeA !== prioridadeB) return prioridadeA - prioridadeB;
    return String(a.nome_completo || '').localeCompare(String(b.nome_completo || ''), 'pt-BR');
}

function formatarPerfilAcesso(perfil) {
    const mapa = {
        coordenador: 'Coordenador',
        equipista: 'Equipista',
        equipe_dirigente: 'Dirigente',
        sem_cadastro: 'Sem cadastro'
    };

    return mapa[perfil] || perfil || '';
}

function nomeAbaExcel(nome, existentes) {
    const base = String(nome || 'SEM EQUIPE')
        .replace(/[\\/?*[\]:]/g, ' ')
        .trim()
        .slice(0, 31) || 'SEM EQUIPE';
    let nomeFinal = base;
    let contador = 2;

    while (existentes.includes(nomeFinal)) {
        const sufixo = ` ${contador}`;
        nomeFinal = `${base.slice(0, 31 - sufixo.length)}${sufixo}`;
        contador += 1;
    }

    return nomeFinal;
}

function obterStatusBadge(status) {
    const mapa = {
        confirmado: '<span class="badge bg-success">Confirmado</span>',
        pendente: '<span class="badge bg-warning">Pendente</span>',
        negou: '<span class="badge bg-danger">Negou</span>',
        desistiu: '<span class="badge bg-secondary">Desistiu</span>'
    };

    return mapa[status] || `<span class="badge bg-secondary">${escapeHtml(status || '-')}</span>`;
}

function normalizarEquipesServidas(valor) {
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

function formatarSimNao(valor) {
    if (valor === 'sim') return 'Sim';
    if (valor === 'nao') return 'Não';
    return '-';
}

function renderizarEquipesServidasDev(selecionadas = []) {
    const container = document.getElementById('editarDevEquipesServidas');
    if (!container) return;
    const selecionadasNormalizadas = selecionadas.map(equipe => String(equipe || '').trim().toUpperCase());

    container.innerHTML = EQUIPES_SERVIDAS_DEV.map((equipe, index) => {
        const id = `editarDevEquipeServida${index}`;
        const checked = selecionadasNormalizadas.includes(equipe.toUpperCase()) ? 'checked' : '';
        return `
            <div class="col-md-6">
                <div class="form-check">
                    <input class="form-check-input editar-dev-equipe-servida" type="checkbox" id="${id}" value="${escapeHtml(equipe)}" ${checked}>
                    <label class="form-check-label" for="${id}">${escapeHtml(equipe)}</label>
                </div>
            </div>
        `;
    }).join('');
}

function obterEquipesServidasDev() {
    return Array.from(document.querySelectorAll('.editar-dev-equipe-servida:checked'))
        .map(input => input.value);
}

function marcarRadioDev(nome, valor) {
    document.querySelectorAll(`input[name="${nome}"]`).forEach((input) => {
        input.checked = input.value === valor;
    });
}

function obterRadioDev(nome) {
    return document.querySelector(`input[name="${nome}"]:checked`)?.value || '';
}

function getHeadersDev() {
    return {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionStorage.getItem(TOKEN_KEY)}`
    };
}

function somenteNumerosDev(valor) {
    return String(valor || '').replace(/\D/g, '');
}

function limitarCampoNumericoDev(e) {
    e.target.value = somenteNumerosDev(e.target.value);
}

function anoEncontroValidoDev(valor) {
    return /^\d{4}$/.test(String(valor || ''));
}

function formatarDataHora(valor) {
    if (!valor) return '-';
    return new Date(`${valor}Z`).toLocaleString('pt-BR');
}

function formatarDetalhes(detalhes) {
    if (!detalhes || typeof detalhes !== 'object') return '';
    return Object.entries(detalhes)
        .map(([chave, valor]) => `${chave}: ${valor}`)
        .join(' | ');
}

function formatarAcaoHistórico(acao) {
    const mapa = {
        perfil_atualizado: 'Perfil atualizado',
        perfil_editado_pela_dirigente: 'Perfil editado pela equipe dirigente',
        perfil_editado_pela_area_exclusiva: 'Perfil editado pela area exclusiva',
        perfil_alterado: 'Perfil de acesso alterado',
        equipe_alterada: 'Equipe alterada',
        usuario_escalado_pela_area_exclusiva: 'Usuário escalado pela area exclusiva',
        usuario_excluido: 'Usuário excluido',
        usuario_excluido_pela_area_exclusiva: 'Usuário excluido pela area exclusiva',
        cadastro_confirmado: 'Cadastro confirmado',
        participacao_confirmada: 'Participação confirmada',
        pessoa_sem_cadastro_convertida: 'Pessoa sem cadastro convertida'
    };

    return mapa[acao] || acao.replace(/_/g, ' ');
}

function escapeHtml(valor) {
    return String(valor ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function escapeJsAttr(valor) {
    return String(valor ?? '')
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r');
}

function mostrarAlertaDev(mensagem, tipo) {
    const alerta = document.getElementById('alertaDev');
    alerta.className = `alert alert-${tipo} mt-3`;
    alerta.textContent = mensagem;
    alerta.style.display = 'block';
}
