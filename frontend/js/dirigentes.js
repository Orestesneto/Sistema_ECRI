const API_URL = 'http://localhost:5000/api';
const TAMANHO_MAXIMO_FOTO_MB = 15;
const TAMANHO_MAXIMO_FOTO_BYTES = TAMANHO_MAXIMO_FOTO_MB * 1024 * 1024;
let chartPerfis = null;
let chartStatus = null;
let usuariosCache = [];
let pessoasExternasCache = [];
let eventosCache = [];
const EQUIPES_FIXAS = [
    'SEM EQUIPE',
    'Animadores',
    'Anjos da Alegria',
    'Anjos da Guarda',
    'Arco Iris',
    'Bandinha',
    'Boa Acao',
    'Coordenacao Geral',
    'ECRI SHOP',
    'Escrita',
    'Missa e Oracao',
    'Papa Lanche',
    'Pombo Correio',
    'Ranguinho',
    'Som e Iluminacao',
    'Teatrinho',
    'Vassourinha'
];

if (!getToken()) {
    window.location.href = 'index.html';
}

document.addEventListener('DOMContentLoaded', () => {
    renderizarCamposExperiencia('camposExperienciaDirigente', 'dirigente');
    renderizarCamposExperiencia('camposExperienciaEditarUsuario', 'editarUsuario');
    document.getElementById('anoEncontroDirigente')?.addEventListener('input', limitarCampoNumerico);
    document.getElementById('pessoaExternaAnoEncontro')?.addEventListener('input', limitarCampoNumerico);
    document.getElementById('editarAnoEncontro')?.addEventListener('input', limitarCampoNumerico);
    configurarFiltrosCarografo();
    carregarOpcoesEquipe();
    carregarPerfilDirigente();
    carregarRelatorio();
    carregarUsuarios();
    carregarPessoasExternas();
    carregarEventos();
    carregarSituacao();
    carregarReunioes();
});

// Carregar perfil do dirigente
async function carregarPerfilDirigente() {
    try {
        const response = await fetch(`${API_URL}/dirigentes/meu-perfil`, {
            headers: getHeaders()
        });
        
        const usuario = await response.json();
        
        document.getElementById('emailDirigente').value = usuario.email;
        document.getElementById('nomeCompletoDirigente').value = usuario.nome_completo;
        document.getElementById('nomeCrachaDirigente').value = usuario.nome_cracha || '';
        document.getElementById('telefoneDirigente').value = usuario.telefone;
        marcarMovimentoOrigem('movimentoDirigente', usuario.movimento_origem);
        document.getElementById('anoEncontroDirigente').value = usuario.ano_encontro || '';
        document.getElementById('restricaoMedicaDir').value = usuario.restricao_medica || '';
        document.getElementById('restricaoAlimentarDir').value = usuario.restricao_alimentar || '';
        document.getElementById('restricaoMedicacaoDir').value = usuario.restricao_medicacao || '';
        carregarExperienciaPerfil('dirigente', usuario);
        
        if (usuario.foto_perfil) {
            document.getElementById('fotoPreviewDirigente').src = usuario.foto_perfil;
            document.getElementById('fotoPreviewDirigente').style.display = 'block';
        }
    } catch (err) {
        console.error(err);
    }
}

// Atualizar perfil do dirigente
document.getElementById('formPerfilDirigente')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const nomeCracha = document.getElementById('nomeCrachaDirigente').value;
    const movimento = obterMovimentoOrigem('movimentoDirigente');
    const anoEncontro = somenteNumeros(document.getElementById('anoEncontroDirigente').value);
    const restricaoMedica = document.getElementById('restricaoMedicaDir').value;
    const restricaoAlimentar = document.getElementById('restricaoAlimentarDir').value;
    const restricaoMedicacao = document.getElementById('restricaoMedicacaoDir').value;
    const fotoPerfil = document.getElementById('fotoPerfilDirigente').files[0];
    
    let fotoBase64 = obterFotoPerfilPreview('fotoPreviewDirigente');

    if (!anoEncontroValido(anoEncontro)) {
        mostrarAlerta('alertaDirigentes', 'Informe um ano do encontro valido', 'warning');
        return;
    }
    
    if (fotoPerfil) {
        if (!fotoDentroDoLimite(fotoPerfil)) {
            mostrarAlerta('alertaDirigentes', `A foto deve ter no máximo ${TAMANHO_MAXIMO_FOTO_MB}MB`, 'warning');
            return;
        }

        fotoBase64 = await converterParaBase64(fotoPerfil);
        document.getElementById('fotoPreviewDirigente').src = fotoBase64;
        document.getElementById('fotoPreviewDirigente').style.display = 'block';
    }
    
    try {
        const response = await fetch(`${API_URL}/dirigentes/meu-perfil`, {
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
                ...obterExperienciaPerfil('dirigente')
            })
        });
        
        if (response.ok) {
            mostrarAlerta('alertaDirigentes', 'Perfil atualizado com sucesso!', 'success');
            carregarUsuarios();
            carregarConfirmacoes();
            carregarRelatorio();
        } else {
            const mensagem = await lerErroResposta(response, 'Erro ao atualizar perfil');
            mostrarAlerta('alertaDirigentes', mensagem, 'danger');
        }
    } catch (err) {
        mostrarAlerta('alertaDirigentes', 'Erro ao atualizar perfil', 'danger');
        console.error(err);
    }
});

// Atualizar restrições (dispara o formulário de perfil)
document.getElementById('formRestricoesDir')?.addEventListener('submit', (e) => {
    e.preventDefault();
    document.getElementById('formPerfilDirigente').dispatchEvent(new Event('submit'));
});

// Carregar relatório geral
async function carregarRelatorio() {
    try {
        const response = await fetch(`${API_URL}/dirigentes/relatorio/geral`, {
            headers: getHeaders()
        });
        
        const data = await response.json();
        
        document.getElementById('totalUsuarios').textContent = data.stats.totalUsuarios;
        document.getElementById('confirmados').textContent = data.stats.confirmados;
        document.getElementById('pendentes').textContent = data.stats.pendentes;
        document.getElementById('coordenadores').textContent = data.stats.coordenadores;
        document.getElementById('totalEscaladosEquipes').textContent = data.stats.totalEscaladosEquipes || 0;
        document.getElementById('totalPonderadoEquipes').textContent = data.stats.totalPonderadoEquipes || 0;
        renderizarResumoEquipes(data.equipesResumo || []);
        
        // Gráfico de Perfis
        const ctxPerfis = document.getElementById('graficoPerfis').getContext('2d');
        if (chartPerfis) chartPerfis.destroy();
        chartPerfis = new Chart(ctxPerfis, {
            type: 'doughnut',
            data: {
                labels: ['Equipistas', 'Coordenadores', 'Dirigentes'],
                datasets: [{
                    data: [data.stats.equipistas, data.stats.coordenadores, data.stats.dirigentes],
                    backgroundColor: ['#0d6efd', '#198754', '#fd7e14']
                }]
            }
        });
        
        // Gráfico de Status
        const ctxStatus = document.getElementById('graficoStatus').getContext('2d');
        if (chartStatus) chartStatus.destroy();
        chartStatus = new Chart(ctxStatus, {
            type: 'bar',
            data: {
                labels: ['Confirmados', 'Pendentes'],
                datasets: [{
                    label: 'Quantidade',
                    data: [data.stats.confirmados, data.stats.pendentes],
                    backgroundColor: ['#198754', '#ffc107']
                }]
            },
            options: {
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        });
    } catch (err) {
        console.error(err);
    }
}

// Carregar usuários para gerenciamento
function renderizarResumoEquipes(equipesResumo) {
    const container = document.getElementById('tabelaResumoEquipes');
    if (!container) return;

    if (!equipesResumo.length) {
        container.innerHTML = '<div class="alert alert-info">Nenhuma pessoa escalada em equipes.</div>';
        return;
    }

    const linhas = equipesResumo.map(item => `
        <tr>
            <td><strong>${escapeHtml(item.equipe)}</strong></td>
            <td>${Number(item.quantidadePessoas || 0)}</td>
            <td>${Number(item.ejc || 0)}</td>
            <td>${Number(item.ec || 0)}</td>
            <td>${Number(item.ecc || 0)}</td>
            <td>${Number(item.jovensEjcCasados || 0)}</td>
            <td>${Number(item.ecri || 0)}</td>
            <td><strong>${Number(item.totalPonderado || 0)}</strong></td>
        </tr>
    `).join('');

    container.innerHTML = `
        <table class="table table-sm table-hover align-middle">
            <thead>
                <tr>
                    <th>Equipe</th>
                    <th>Pessoas escaladas</th>
                    <th>EJC</th>
                    <th>EC</th>
                    <th>ECC</th>
                    <th>Jovens EJC casados</th>
                    <th>ECRI</th>
                    <th>Total ponderado</th>
                </tr>
            </thead>
            <tbody>${linhas}</tbody>
        </table>
    `;
}

async function carregarUsuarios() {
    try {
        const response = await fetch(`${API_URL}/dirigentes/usuarios`, {
            headers: getHeaders()
        });
        
        const usuarios = await response.json();
        usuariosCache = usuarios;
        
        let html = '<table class="table table-hover"><thead><tr><th>Foto</th><th>Nome</th><th>Email</th><th>Perfil</th><th>Equipe</th><th>Status</th><th>Ação</th></tr></thead><tbody>';
        
        usuarios.forEach(u => {
            const fotoHtml = u.foto_perfil 
                ? `<img src="${u.foto_perfil}" alt="Foto" style="width:40px; height:40px; border-radius:50%; object-fit:cover;">`
                : `<div style="width:40px; height:40px; border-radius:50%; background:#ccc; display:flex; align-items:center; justify-content:center;">-</div>`;
            
            const perfilBadge = {
                'equipista': '<span class="badge bg-info">Equipista</span>',
                'coordenador': '<span class="badge bg-success">Coordenador</span>',
                'equipe_dirigente': '<span class="badge bg-danger">Dirigente</span>'
            }[u.perfil] || u.perfil;
            
            const statusBadge = u.status === 'confirmado' 
                ? '<span class="badge bg-success">Confirmado</span>' 
                : '<span class="badge bg-warning">Pendente</span>';
            
            html += `<tr>
                <td>${fotoHtml}</td>
                <td>${u.nome_completo}</td>
                <td>${u.email}</td>
                <td>${perfilBadge}</td>
                <td>${u.equipe || '-'}</td>
                <td>${statusBadge}</td>
                <td>
                    <button class="btn btn-sm btn-secondary" onclick="abrirModalEditarUsuario(${u.id})">Editar</button>
                    <button class="btn btn-sm btn-primary" onclick="abrirModalEscalar(${u.id})">Escalar</button>
                </td>
            </tr>`;
        });
        
        html += '</tbody></table>';
        document.getElementById('tabelaUsuarios').innerHTML = html;
        aplicarFiltrosCarografo();
        renderizarEventos();
    } catch (err) {
        console.error(err);
    }
}

async function excluirUsuario(usuarioId, nomeUsuario) {
    const confirmado = confirm(`Tem certeza que deseja excluir o usuario ${nomeUsuario}? Essa acao nao pode ser desfeita.`);
    if (!confirmado) return;

    try {
        const response = await fetch(`${API_URL}/dirigentes/usuarios/${usuarioId}`, {
            method: 'DELETE',
            headers: getHeaders()
        });

        if (response.ok) {
            mostrarAlerta('alertaDirigentes', 'Usuario excluido com sucesso!', 'success');
            carregarUsuarios();
            carregarEventos();
            carregarRelatorio();
            carregarSituacao();
            carregarReunioes();
        } else {
            const erro = await response.json();
            mostrarAlerta('alertaDirigentes', erro.erro || 'Erro ao excluir usuario', 'danger');
        }
    } catch (err) {
        mostrarAlerta('alertaDirigentes', 'Erro ao excluir usuario', 'danger');
        console.error(err);
    }
}

function abrirModalEditarUsuario(usuarioId) {
    const usuario = usuariosCache.find(u => Number(u.id) === Number(usuarioId));
    if (!usuario) return;

    document.getElementById('editarUsuarioId').value = usuario.id;
    document.getElementById('editarNomeCompleto').value = usuario.nome_completo || '';
    document.getElementById('editarNomeCracha').value = usuario.nome_cracha || '';
    document.getElementById('editarTelefone').value = usuario.telefone || '';
    document.getElementById('editarMovimento').value = usuario.movimento_origem || '';
    document.getElementById('editarAnoEncontro').value = usuario.ano_encontro || '';
    document.getElementById('editarEquipe').value = usuario.equipe || '';
    document.getElementById('editarStatus').value = usuario.status || 'pendente';
    document.getElementById('editarRestricaoMedica').value = usuario.restricao_medica || '';
    document.getElementById('editarRestricaoAlimentar').value = usuario.restricao_alimentar || '';
    document.getElementById('editarRestricaoMedicacao').value = usuario.restricao_medicacao || '';
    carregarExperienciaPerfil('editarUsuario', usuario);

    new bootstrap.Modal(document.getElementById('modalEditarUsuario')).show();
}

document.getElementById('formEditarUsuario')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const usuarioId = document.getElementById('editarUsuarioId').value;
    const anoEncontro = somenteNumeros(document.getElementById('editarAnoEncontro').value);

    if (!anoEncontroValido(anoEncontro)) {
        mostrarAlerta('alertaDirigentes', 'Informe um ano do encontro valido', 'warning');
        return;
    }

    const body = {
        nome_cracha: document.getElementById('editarNomeCracha').value,
        telefone: document.getElementById('editarTelefone').value,
        movimento_origem: document.getElementById('editarMovimento').value,
        ano_encontro: anoEncontro,
        equipe: document.getElementById('editarEquipe').value,
        status: document.getElementById('editarStatus').value,
        restricao_medica: document.getElementById('editarRestricaoMedica').value,
        restricao_alimentar: document.getElementById('editarRestricaoAlimentar').value,
        restricao_medicacao: document.getElementById('editarRestricaoMedicacao').value,
        ...obterExperienciaPerfil('editarUsuario')
    };

    try {
        const response = await fetch(`${API_URL}/dirigentes/usuarios/${usuarioId}/perfil`, {
            method: 'PUT',
            headers: getHeaders(),
            body: JSON.stringify(body)
        });

        if (response.ok) {
            mostrarAlerta('alertaDirigentes', 'Perfil atualizado com sucesso!', 'success');
            bootstrap.Modal.getInstance(document.getElementById('modalEditarUsuario')).hide();
            carregarUsuarios();
            carregarConfirmacoes();
            carregarRelatorio();
        } else {
            const erro = await response.json();
            mostrarAlerta('alertaDirigentes', erro.erro || 'Erro ao atualizar perfil', 'danger');
        }
    } catch (err) {
        mostrarAlerta('alertaDirigentes', 'Erro ao atualizar perfil', 'danger');
        console.error(err);
    }
});

async function carregarPessoasExternas() {
    const container = document.getElementById('tabelaPessoasExternas');
    if (!container) return;

    try {
        const response = await fetch(`${API_URL}/dirigentes/pessoas-externas`, {
            headers: getHeaders()
        });

        const pessoas = await response.json();
        pessoasExternasCache = Array.isArray(pessoas) ? pessoas : [];

        renderizarPessoasExternas();
        aplicarFiltrosCarografo();
    } catch (err) {
        container.innerHTML = '<div class="alert alert-danger">Erro ao carregar pessoas sem cadastro.</div>';
        console.error(err);
    }
}

function renderizarPessoasExternas() {
    const container = document.getElementById('tabelaPessoasExternas');
    if (!container) return;

    if (!pessoasExternasCache || pessoasExternasCache.length === 0) {
        container.innerHTML = '<div class="alert alert-info">Nenhuma pessoa sem cadastro adicionada.</div>';
        return;
    }

    const linhas = pessoasExternasCache.map(pessoa => {
        const fotoHtml = pessoa.foto_perfil
            ? `<img src="${pessoa.foto_perfil}" alt="Foto" style="width:40px; height:40px; border-radius:50%; object-fit:cover;">`
            : `<div style="width:40px; height:40px; border-radius:50%; background:#ccc; display:flex; align-items:center; justify-content:center;">-</div>`;

        return `
            <tr>
                <td>${fotoHtml}</td>
                <td>${escapeHtml(pessoa.nome_completo || '')}</td>
                <td>${escapeHtml(pessoa.telefone || '')}</td>
                <td>${escapeHtml(pessoa.movimento_origem || '-')}</td>
                <td>${escapeHtml(pessoa.equipe || '-')}</td>
                <td><button class="btn btn-sm btn-danger" onclick="excluirPessoaExterna(${pessoa.id}, '${escapeHtml(pessoa.nome_completo || '')}')">Excluir</button></td>
            </tr>
        `;
    }).join('');

    container.innerHTML = `
        <table class="table table-hover">
            <thead>
                <tr><th>Foto</th><th>Nome</th><th>Telefone</th><th>Movimento</th><th>Equipe</th><th>Acao</th></tr>
            </thead>
            <tbody>${linhas}</tbody>
        </table>
    `;
}

document.getElementById('formPessoaExterna')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const body = {
        nome_completo: document.getElementById('pessoaExternaNome').value,
        telefone: document.getElementById('pessoaExternaTelefone').value,
        movimento_origem: document.getElementById('pessoaExternaMovimento').value,
        ano_encontro: somenteNumeros(document.getElementById('pessoaExternaAnoEncontro').value),
        equipe: document.getElementById('pessoaExternaEquipe').value
    };

    if (!anoEncontroValido(body.ano_encontro)) {
        mostrarAlerta('alertaDirigentes', 'Informe um ano do encontro valido', 'warning');
        return;
    }

    try {
        const response = await fetch(`${API_URL}/dirigentes/pessoas-externas`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(body)
        });

        if (response.ok) {
            mostrarAlerta('alertaDirigentes', 'Pessoa adicionada a equipe com sucesso!', 'success');
            document.getElementById('formPessoaExterna').reset();
            carregarPessoasExternas();
        } else {
            const erro = await response.json();
            mostrarAlerta('alertaDirigentes', erro.erro || 'Erro ao adicionar pessoa', 'danger');
        }
    } catch (err) {
        mostrarAlerta('alertaDirigentes', 'Erro ao adicionar pessoa', 'danger');
        console.error(err);
    }
});

async function excluirPessoaExterna(pessoaId, nomePessoa) {
    if (!confirm(`Tem certeza que deseja excluir ${nomePessoa}?`)) return;

    try {
        const response = await fetch(`${API_URL}/dirigentes/pessoas-externas/${pessoaId}`, {
            method: 'DELETE',
            headers: getHeaders()
        });

        if (response.ok) {
            mostrarAlerta('alertaDirigentes', 'Pessoa removida da equipe com sucesso!', 'success');
            carregarPessoasExternas();
        } else {
            const erro = await response.json();
            mostrarAlerta('alertaDirigentes', erro.erro || 'Erro ao remover pessoa', 'danger');
        }
    } catch (err) {
        mostrarAlerta('alertaDirigentes', 'Erro ao remover pessoa', 'danger');
        console.error(err);
    }
}

async function carregarEventos() {
    try {
        const response = await fetch(`${API_URL}/dirigentes/eventos`, {
            headers: getHeaders()
        });

        eventosCache = await response.json();
        renderizarEventos();
    } catch (err) {
        console.error(err);
    }
}

document.getElementById('formEvento')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const nome = document.getElementById('eventoNome').value;
    const data_evento = document.getElementById('eventoData').value;
    const local = document.getElementById('eventoLocal').value;
    const descricao = document.getElementById('eventoDescricao').value;

    try {
        const response = await fetch(`${API_URL}/dirigentes/eventos`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ nome, data_evento, local, descricao })
        });

        if (response.ok) {
            mostrarAlerta('alertaDirigentes', 'Evento criado com sucesso!', 'success');
            document.getElementById('formEvento').reset();
            carregarEventos();
        } else {
            const erro = await response.json();
            mostrarAlerta('alertaDirigentes', erro.erro || 'Erro ao criar evento', 'danger');
        }
    } catch (err) {
        mostrarAlerta('alertaDirigentes', 'Erro ao criar evento', 'danger');
        console.error(err);
    }
});

function carregarOpcoesEquipe() {
    const selectEquipe = document.getElementById('nomeEquipe');
    const selectPessoaExternaEquipe = document.getElementById('pessoaExternaEquipe');
    const filtroCarografoEquipe = document.getElementById('filtroCarografoEquipe');
    const editarEquipe = document.getElementById('editarEquipe');

    const opcoes = '<option value="">Selecione...</option>' + EQUIPES_FIXAS
        .map(equipe => `<option value="${escapeHtml(equipe)}">${escapeHtml(equipe)}</option>`)
        .join('');
    const opcoesFiltro = '<option value="">Todas</option>' + EQUIPES_FIXAS
        .map(equipe => `<option value="${escapeHtml(equipe)}">${escapeHtml(equipe)}</option>`)
        .join('');

    if (selectEquipe) {
        selectEquipe.innerHTML = opcoes;
    }

    if (selectPessoaExternaEquipe) {
        selectPessoaExternaEquipe.innerHTML = opcoes;
    }

    if (filtroCarografoEquipe) {
        filtroCarografoEquipe.innerHTML = opcoesFiltro;
    }

    if (editarEquipe) {
        editarEquipe.innerHTML = '<option value="">SEM EQUIPE</option>' + EQUIPES_FIXAS
            .map(equipe => `<option value="${escapeHtml(equipe)}">${escapeHtml(equipe)}</option>`)
            .join('');
    }
}

function renderizarEventos() {
    const container = document.getElementById('listaEventos');
    if (!container) return;

    if (!eventosCache || eventosCache.length === 0) {
        container.innerHTML = '<div class="alert alert-info">Nenhum evento criado.</div>';
        return;
    }

    container.innerHTML = eventosCache.map(evento => {
        const escalados = evento.escalados || [];
        const totalCoordenadores = escalados.filter(e => e.papel_evento === 'coordenador').length;
        const totalEquipistas = escalados.filter(e => e.papel_evento === 'equipista').length;
        const usuariosHtml = usuariosCache.map(usuario => {
            const escala = escalados.find(e => Number(e.usuario_id) === Number(usuario.id));
            const checked = escala ? 'checked' : '';
            const papel = escala?.papel_evento || 'equipista';

            return `
                <tr>
                    <td><input class="form-check-input evento-usuario-check" type="checkbox" data-evento-id="${evento.id}" data-usuario-id="${usuario.id}" ${checked}></td>
                    <td>${escapeHtml(usuario.nome_completo || '')}</td>
                    <td>${escapeHtml(usuario.perfil || '')}</td>
                    <td>
                        <select class="form-select form-select-sm evento-usuario-papel" data-evento-id="${evento.id}" data-usuario-id="${usuario.id}">
                            <option value="equipista" ${papel === 'equipista' ? 'selected' : ''}>Equipista</option>
                            <option value="coordenador" ${papel === 'coordenador' ? 'selected' : ''}>Coordenador</option>
                        </select>
                    </td>
                </tr>
            `;
        }).join('');

        return `
            <div class="card mb-3">
                <div class="card-body">
                    <div class="d-flex justify-content-between align-items-start gap-3">
                        <div>
                            <h5 class="card-title mb-1">${escapeHtml(evento.nome)}</h5>
                            <p class="mb-1"><strong>Data:</strong> ${formatarData(evento.data_evento)} ${evento.local ? '<strong>Local:</strong> ' + escapeHtml(evento.local) : ''}</p>
                            <p class="mb-1">${escapeHtml(evento.descricao || '')}</p>
                            <small class="text-muted">${totalCoordenadores} coordenador(es), ${totalEquipistas} equipista(s)</small>
                        </div>
                        <button class="btn btn-sm btn-outline-danger" onclick="excluirEvento(${evento.id})">Excluir Evento</button>
                    </div>
                    <div class="table-responsive mt-3">
                        <table class="table table-sm align-middle">
                            <thead><tr><th>Escalar</th><th>Usuario</th><th>Perfil atual</th><th>Perfil no evento</th></tr></thead>
                            <tbody>${usuariosHtml}</tbody>
                        </table>
                    </div>
                    <button class="btn btn-primary btn-sm" onclick="salvarEscalacaoEvento(${evento.id})">Salvar escala do evento</button>
                </div>
            </div>
        `;
    }).join('');
}

async function salvarEscalacaoEvento(eventoId) {
    const checks = Array.from(document.querySelectorAll(`.evento-usuario-check[data-evento-id="${eventoId}"]:checked`));
    const escalacoes = checks.map(check => {
        const usuarioId = check.dataset.usuarioId;
        const select = document.querySelector(`.evento-usuario-papel[data-evento-id="${eventoId}"][data-usuario-id="${usuarioId}"]`);
        return {
            usuario_id: Number(usuarioId),
            papel_evento: select.value
        };
    });

    try {
        const response = await fetch(`${API_URL}/dirigentes/eventos/${eventoId}/escalacoes`, {
            method: 'PUT',
            headers: getHeaders(),
            body: JSON.stringify({ escalacoes })
        });

        if (response.ok) {
            mostrarAlerta('alertaDirigentes', 'Escala do evento salva com sucesso!', 'success');
            carregarEventos();
        } else {
            const erro = await response.json();
            mostrarAlerta('alertaDirigentes', erro.erro || 'Erro ao salvar escala do evento', 'danger');
        }
    } catch (err) {
        mostrarAlerta('alertaDirigentes', 'Erro ao salvar escala do evento', 'danger');
        console.error(err);
    }
}

async function excluirEvento(eventoId) {
    if (!confirm('Tem certeza que deseja excluir este evento?')) return;

    try {
        const response = await fetch(`${API_URL}/dirigentes/eventos/${eventoId}`, {
            method: 'DELETE',
            headers: getHeaders()
        });

        if (response.ok) {
            mostrarAlerta('alertaDirigentes', 'Evento excluido com sucesso!', 'success');
            carregarEventos();
        } else {
            const erro = await response.json();
            mostrarAlerta('alertaDirigentes', erro.erro || 'Erro ao excluir evento', 'danger');
        }
    } catch (err) {
        mostrarAlerta('alertaDirigentes', 'Erro ao excluir evento', 'danger');
        console.error(err);
    }
}

function renderizarCarografo(usuarios) {
    const painel = document.getElementById('painelCarografo');
    if (!painel) return;

    if (!usuarios || usuarios.length === 0) {
        painel.innerHTML = '<div class="alert alert-info">Nenhum usuário cadastrado.</div>';
        return;
    }

    painel.innerHTML = usuarios.map(u => {
        const nome = escapeHtml(u.nome_completo || '');
        const movimentoOrigem = escapeHtml(u.movimento_origem || '-');
        const anoEncontro = escapeHtml(u.ano_encontro || '-');
        const telefone = escapeHtml(u.telefone || '-');
        const equipeAtual = escapeHtml(u.equipe || 'SEM EQUIPE');
        const statusBadge = obterStatusBadge(u.status);
        const icones = [
            u.toca_instrumento === 'sim'
                ? '<span class="carografo-icone" title="Toca instrumento"><i class="fa-solid fa-guitar"></i></span>'
                : '',
            u.canta === 'sim'
                ? '<span class="carografo-icone" title="Canta"><i class="fa-solid fa-microphone"></i></span>'
                : ''
        ].join('');
        const destaqueMusical = u.toca_instrumento === 'sim' || u.canta === 'sim';
        const fotoHtml = u.foto_perfil
            ? `<img src="${u.foto_perfil}" alt="Foto de ${nome}" class="carografo-foto" onclick="abrirModalResumoUsuario(${Number(u.id)})">`
            : `<div class="carografo-foto carografo-foto-placeholder" onclick="abrirModalResumoUsuario(${Number(u.id)})">-</div>`;

        return `
            <div class="carografo-item ${destaqueMusical ? 'carografo-item-musical' : ''}">
                ${fotoHtml}
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

function obterPessoasCarografo() {
    return [
        ...usuariosCache,
        ...pessoasExternasCache.map(pessoa => ({
            ...pessoa,
            perfil: 'sem_cadastro',
            origem_cadastro: 'externo'
        }))
    ];
}

function configurarFiltrosCarografo() {
    ['filtroCarografoEquipe', 'filtroCarografoMovimento', 'filtroCarografoMusical'].forEach((id) => {
        document.getElementById(id)?.addEventListener('change', aplicarFiltrosCarografo);
    });

    document.getElementById('limparFiltrosCarografo')?.addEventListener('click', () => {
        document.getElementById('filtroCarografoEquipe').value = '';
        document.getElementById('filtroCarografoMovimento').value = '';
        document.getElementById('filtroCarografoMusical').value = '';
        aplicarFiltrosCarografo();
    });

    document.getElementById('baixarRelatorioCarografo')?.addEventListener('click', baixarRelatorioCarografoExcel);
}

function aplicarFiltrosCarografo() {
    const equipe = document.getElementById('filtroCarografoEquipe')?.value || '';
    const movimento = document.getElementById('filtroCarografoMovimento')?.value || '';
    const musical = document.getElementById('filtroCarografoMusical')?.value || '';
    const pessoas = obterPessoasCarografo().filter((pessoa) => {
        const toca = pessoa.toca_instrumento === 'sim';
        const canta = pessoa.canta === 'sim';

        if (equipe && (pessoa.equipe || 'SEM EQUIPE') !== equipe) return false;
        if (movimento && pessoa.movimento_origem !== movimento) return false;
        if (musical === 'canta' && !canta) return false;
        if (musical === 'toca' && !toca) return false;
        if (musical === 'canta_toca' && (!canta || !toca)) return false;
        if (musical === 'canta_ou_toca' && (!canta && !toca)) return false;

        return true;
    });

    renderizarCarografo(pessoas);
}

function baixarRelatorioCarografoExcel() {
    if (typeof XLSX === 'undefined') {
        mostrarAlerta('alertaDirigentes', 'Biblioteca de Excel nao carregada. Verifique a internet e tente novamente.', 'warning');
        return;
    }

    const pessoas = obterPessoasCarografo().filter(pessoa => pessoa.status === 'confirmado');
    if (!pessoas.length) {
        mostrarAlerta('alertaDirigentes', 'Nenhum usuario confirmado para exportar.', 'warning');
        return;
    }

    const workbook = XLSX.utils.book_new();
    const equipes = Array.from(new Set(pessoas.map(pessoa => pessoa.equipe || 'SEM EQUIPE')))
        .sort((a, b) => {
            if (a === 'SEM EQUIPE') return -1;
            if (b === 'SEM EQUIPE') return 1;
            return a.localeCompare(b, 'pt-BR');
        });

    equipes.forEach((equipe) => {
        const linhas = pessoas
            .filter(pessoa => (pessoa.equipe || 'SEM EQUIPE') === equipe)
            .sort(ordenarPorPerfilRelatorio)
            .map(pessoa => ({
                'Nome completo': pessoa.nome_completo || '',
                'Nome do cracha': pessoa.nome_cracha || '',
                'Movimento de origem': pessoa.movimento_origem || '',
                'Telefone para contato': pessoa.telefone || '',
                'Perfil de acesso': formatarPerfilAcesso(pessoa.perfil)
            }));

        const worksheet = XLSX.utils.json_to_sheet(linhas, {
            header: [
                'Nome completo',
                'Nome do cracha',
                'Movimento de origem',
                'Telefone para contato',
                'Perfil de acesso'
            ]
        });
        worksheet['!cols'] = [
            { wch: 34 },
            { wch: 24 },
            { wch: 20 },
            { wch: 22 },
            { wch: 18 }
        ];

        XLSX.utils.book_append_sheet(workbook, worksheet, nomeAbaExcel(equipe, workbook.SheetNames));
    });

    const data = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(workbook, `relatorio-carografo-${data}.xlsx`);
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

function escapeHtml(valor) {
    return String(valor)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function abrirModalResumoUsuario(usuarioId) {
    const usuario = usuariosCache.find(u => Number(u.id) === Number(usuarioId));
    if (!usuario) return;

    const modalEl = document.getElementById('modalFoto');
    const titulo = modalEl.querySelector('.modal-title');
    const corpo = modalEl.querySelector('.modal-body');
    const equipesServidas = normalizarEquipesServidas(usuario.equipes_servidas);
    const equipesHtml = equipesServidas.length
        ? `<ul class="mb-0">${equipesServidas.map(equipe => `<li>${escapeHtml(equipe)}</li>`).join('')}</ul>`
        : '<span class="text-muted">Nenhuma informada</span>';
    const fotoHtml = usuario.foto_perfil
        ? `<img src="${usuario.foto_perfil}" alt="Foto de ${escapeHtml(usuario.nome_completo || '')}" class="mb-3" style="width:160px; height:160px; border-radius:50%; object-fit:cover; cursor:pointer;" title="Clique para ampliar" onclick="abrirModalFotoGrande('${usuario.foto_perfil}')">`
        : '<div class="mx-auto mb-3" style="width:160px; height:160px; border-radius:50%; background:#ddd; display:flex; align-items:center; justify-content:center;">-</div>';

    titulo.textContent = 'Resumo do Usuario';
    corpo.className = 'modal-body';
    corpo.innerHTML = `
        <div class="text-center">
            ${fotoHtml}
            <h5 class="mb-1">${escapeHtml(usuario.nome_completo || '-')}</h5>
            <p class="text-muted mb-3">${escapeHtml(usuario.nome_cracha || '')}</p>
        </div>
        <table class="table table-sm">
            <tbody>
                <tr><th>Telefone</th><td>${escapeHtml(usuario.telefone || '-')}</td></tr>
                <tr><th>Movimento</th><td>${escapeHtml(usuario.movimento_origem || '-')}</td></tr>
                <tr><th>Ano do encontro</th><td>${escapeHtml(usuario.ano_encontro || '-')}</td></tr>
                <tr><th>Equipe atual</th><td>${escapeHtml(usuario.equipe || '-')}</td></tr>
                <tr><th>Toca instrumento?</th><td>${formatarSimNao(usuario.toca_instrumento)}</td></tr>
                <tr><th>Instrumentos</th><td>${escapeHtml(usuario.instrumentos || '-')}</td></tr>
                <tr><th>Canta?</th><td>${formatarSimNao(usuario.canta)}</td></tr>
                <tr><th>Equipes que ja serviu</th><td>${equipesHtml}</td></tr>
            </tbody>
        </table>
        <div class="text-end">
            <button type="button" class="btn btn-primary" onclick="abrirModalEscalar(${Number(usuario.id)}, true)">Escalar</button>
        </div>
    `;

    new bootstrap.Modal(modalEl).show();
}

function abrirModalFotoGrande(fotoSrc) {
    const modalEl = document.getElementById('modalFotoGrande');
    document.getElementById('fotoGrandeImagem').src = fotoSrc;
    new bootstrap.Modal(modalEl).show();
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
    if (valor === 'nao') return 'Nao';
    return '-';
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

// Carregar situação de pagamentos e blusas
async function carregarSituacao() {
    try {
        const response = await fetch(`${API_URL}/dirigentes/situacao`, {
            headers: getHeaders()
        });
        
        const data = await response.json();
        
        // Cards de situação
        let htmlCards = `
            <div class="row">
                <div class="col-md-3">
                    <div class="card text-white bg-warning">
                        <div class="card-body">
                            <h5>Pagamentos Pendentes</h5>
                            <h2>${data.stats.pagamentosPendentes}</h2>
                        </div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="card text-white bg-success">
                        <div class="card-body">
                            <h5>Pagamentos Confirmados</h5>
                            <h2>${data.stats.pagamentosConfirmados}</h2>
                        </div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="card text-white bg-info">
                        <div class="card-body">
                            <h5>Blusas Pendentes</h5>
                            <h2>${data.stats.blusasPendentes}</h2>
                        </div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="card text-white bg-primary">
                        <div class="card-body">
                            <h5>Blusas Confirmadas</h5>
                            <h2>${data.stats.blusasConfirmadas}</h2>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.getElementById('cardSituacao').innerHTML = htmlCards;
        
        // Tabela de pagamentos
        let htmlPagamentos = '<table class="table table-sm"><thead><tr><th>Foto</th><th>Usuário</th><th>Tipo</th><th>Valor</th><th>Status</th></tr></thead><tbody>';
        data.pagamentos.forEach(p => {
            const fotoHtml = p.foto_perfil 
                ? `<img src="${p.foto_perfil}" alt="Foto" class="foto-clickable" style="width:30px; height:30px; border-radius:50%; object-fit:cover; cursor:pointer;" onclick="abrirModalFoto(this.src)">`
                : `<div style="width:30px; height:30px; border-radius:50%; background:#ccc; display:flex; align-items:center; justify-content:center; font-size:10px;">-</div>`;
            
            const badge = p.status === 'confirmado' 
                ? '<span class="badge bg-success">Confirmado</span>' 
                : '<span class="badge bg-warning">Pendente</span>';
            htmlPagamentos += `<tr><td>${fotoHtml}</td><td>${p.nome_completo}</td><td>${p.tipo}</td><td>R$ ${p.valor.toFixed(2)}</td><td>${badge}</td></tr>`;
        });
        htmlPagamentos += '</tbody></table>';
        document.getElementById('tabelaPagamentosSituacao').innerHTML = htmlPagamentos;
        
        // Tabela de blusas
        let htmlBlusas = '<table class="table table-sm"><thead><tr><th>Foto</th><th>Usuário</th><th>Tamanho</th><th>Status</th></tr></thead><tbody>';
        data.blusas.forEach(b => {
            const fotoHtml = b.foto_perfil 
                ? `<img src="${b.foto_perfil}" alt="Foto" class="foto-clickable" style="width:30px; height:30px; border-radius:50%; object-fit:cover; cursor:pointer;" onclick="abrirModalFoto(this.src)">`
                : `<div style="width:30px; height:30px; border-radius:50%; background:#ccc; display:flex; align-items:center; justify-content:center; font-size:10px;">-</div>`;
            
            const badge = b.status === 'confirmado' 
                ? '<span class="badge bg-success">Confirmado</span>' 
                : '<span class="badge bg-warning">Pendente</span>';
            htmlBlusas += `<tr><td>${fotoHtml}</td><td>${b.nome_completo}</td><td>${b.tamanho}</td><td>${badge}</td></tr>`;
        });
        htmlBlusas += '</tbody></table>';
        document.getElementById('tabelaBlusasSituacao').innerHTML = htmlBlusas;
    } catch (err) {
        console.error(err);
    }
}

// Abrir modal para escalar usuário
function abrirModalEscalar(usuarioId, fecharResumo = false) {
    if (fecharResumo) {
        const modalResumo = bootstrap.Modal.getInstance(document.getElementById('modalFoto'));
        if (modalResumo) {
            modalResumo.hide();
        }
    }

    // Resetar o formulário
    document.getElementById('formEscalar').reset();
    document.getElementById('usuarioIdEscalar').value = usuarioId;
    document.getElementById('nomeEquipe').value = '';
    document.getElementById('acaoEscalarDiv').style.display = fecharResumo ? 'none' : 'block';
    document.getElementById('acaoEscalar').value = fecharResumo ? 'equipe' : '';
    document.getElementById('equipeDiv').style.display = fecharResumo ? 'block' : 'none';
    
    setTimeout(() => {
        const modal = new bootstrap.Modal(document.getElementById('modalEscalar'));
        modal.show();
    }, fecharResumo ? 250 : 0);
}

// Salvar escalação
document.getElementById('formEscalar')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const usuarioId = document.getElementById('usuarioIdEscalar').value;
    const acao = document.getElementById('acaoEscalar').value;
    
    if (!acao) {
        mostrarAlerta('alertaDirigentes', 'Selecione uma ação', 'warning');
        return;
    }

    try {
        let url, body;
        
        if (acao === 'equipista') {
            url = `${API_URL}/dirigentes/escalar-equipista/${usuarioId}`;
            body = {};
        } else if (acao === 'coordenador') {
            url = `${API_URL}/dirigentes/escalar-coordenador/${usuarioId}`;
            body = {};
        } else if (acao === 'equipe') {
            const nomeEquipe = document.getElementById('nomeEquipe').value;
            if (!nomeEquipe) {
                mostrarAlerta('alertaDirigentes', 'Informe o nome da equipe', 'warning');
                return;
            }
            url = `${API_URL}/dirigentes/escalar-equipe/${usuarioId}`;
            body = { equipe: nomeEquipe };
        }
        
        const response = await fetch(url, {
            method: 'PUT',
            headers: getHeaders(),
            body: JSON.stringify(body)
        });
        
        if (response.ok) {
            mostrarAlerta('alertaDirigentes', 'Usuário escalado com sucesso!', 'success');
            bootstrap.Modal.getInstance(document.getElementById('modalEscalar')).hide();
            carregarUsuarios();
        } else {
            const erro = await response.json();
            mostrarAlerta('alertaDirigentes', erro.erro || 'Erro ao escalar usuário', 'danger');
        }
    } catch (err) {
        mostrarAlerta('alertaDirigentes', 'Erro ao escalar usuário', 'danger');
        console.error(err);
    }
});

// Mostrar campo de equipe quando necessário
document.getElementById('acaoEscalar')?.addEventListener('change', (e) => {
    const equipeDiv = document.getElementById('equipeDiv');
    equipeDiv.style.display = e.target.value === 'equipe' ? 'block' : 'none';
});

// Carregar reuniões dos próximos 15 dias
async function carregarReunioes() {
    try {
        const response = await fetch(`${API_URL}/dirigentes/reunioes-proximos-dias`, {
            headers: getHeaders()
        });
        
        const reunioes = await response.json();
        const container = document.getElementById('containerReunioes');
        
        if (!reunioes || reunioes.length === 0) {
            container.innerHTML = '<div class="alert alert-info">Nenhuma reunião agendada para os próximos 15 dias.</div>';
            return;
        }
        
        let html = '<div class="row">';
        reunioes.forEach(r => {
            const fotoHtml = r.foto_perfil 
                ? `<img src="${r.foto_perfil}" alt="Foto" style="width:50px; height:50px; border-radius:50%; object-fit:cover; margin-right:10px;">`
                : `<div style="width:50px; height:50px; border-radius:50%; background:#ccc; display:flex; align-items:center; justify-content:center; margin-right:10px;">-</div>`;
            
            const statusBadge = {
                'agendada': '<span class="badge bg-info">Agendada</span>',
                'realizada': '<span class="badge bg-success">Realizada</span>',
                'cancelada': '<span class="badge bg-danger">Cancelada</span>'
            }[r.status] || r.status;
            
            const dataFormatada = new Date(r.data_reuniao).toLocaleDateString('pt-BR');
            
            html += `
                <div class="col-md-6 mb-3">
                    <div class="card">
                        <div class="card-body">
                            <div style="display: flex; align-items: flex-start;">
                                ${fotoHtml}
                                <div style="flex: 1;">
                                    <h5 class="card-title">${r.titulo} ${statusBadge}</h5>
                                    <p class="card-text"><small class="text-muted"><strong>Organizador:</strong> ${r.nome_completo}</small></p>
                                </div>
                            </div>
                            <hr>
                            <p class="card-text"><small><strong>Descrição:</strong> ${r.descricao || 'Sem descrição'}</small></p>
                            <p class="card-text"><small><strong>Data:</strong> ${dataFormatada}</small></p>
                            <p class="card-text"><small><strong>Horário:</strong> ${r.horario_inicio}${r.horario_fim ? ' - ' + r.horario_fim : ''}</small></p>
                            <p class="card-text"><small><strong>Local:</strong> ${r.local}</small></p>
                        </div>
                    </div>
                </div>
            `;
        });
        html += '</div>';
        container.innerHTML = html;
    } catch (err) {
        console.error(err);
        document.getElementById('containerReunioes').innerHTML = '<div class="alert alert-danger">Erro ao carregar reuniões.</div>';
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

function abrirModalFoto(fotoSrc) {
    const modalEl = document.getElementById('modalFoto');
    modalEl.querySelector('.modal-title').textContent = 'Foto do Usuario';
    const corpo = modalEl.querySelector('.modal-body');
    corpo.className = 'modal-body text-center';
    corpo.innerHTML = `<img id="fotoModalImagem" src="${fotoSrc}" alt="Foto" style="max-width: 100%; max-height: 500px; border-radius: 10px;">`;
    const modal = new bootstrap.Modal(modalEl);
    modal.show();
}

function formatarData(data) {
    if (!data) return '-';
    return new Date(`${data}T00:00:00`).toLocaleDateString('pt-BR');
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
