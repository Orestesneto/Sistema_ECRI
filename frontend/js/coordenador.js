const API_URL = 'http://localhost:5000/api';
const TAMANHO_MAXIMO_FOTO_MB = 15;
const TAMANHO_MAXIMO_FOTO_BYTES = TAMANHO_MAXIMO_FOTO_MB * 1024 * 1024;
let participantesEquipeCache = [];

if (!getToken()) {
    window.location.href = 'index.html';
}

document.addEventListener('DOMContentLoaded', () => {
    renderizarCamposExperiencia('camposExperienciaCoordenador', 'coordenador');
    document.getElementById('anoEncontroCoordenador')?.addEventListener('input', limitarCampoNumerico);
    carregarPerfilCoordenador();
    carregarPagamentos();
    carregarBlusas();
    carregarConfirmacoes();
    carregarReunioes();
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
        document.getElementById('equipeCoordenador').value = usuario.equipe || 'Nao escalado';
        marcarMovimentoOrigem('movimentoCoordenador', usuario.movimento_origem);
        document.getElementById('anoEncontroCoordenador').value = usuario.ano_encontro || '';
        document.getElementById('restricaoMedicaCoord').value = usuario.restricao_medica || '';
        document.getElementById('restricaoAlimentarCoord').value = usuario.restricao_alimentar || '';
        document.getElementById('restricaoMedicacaoCoord').value = usuario.restricao_medicacao || '';
        carregarExperienciaPerfil('coordenador', usuario);
        
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
    const movimento = obterMovimentoOrigem('movimentoCoordenador');
    const anoEncontro = somenteNumeros(document.getElementById('anoEncontroCoordenador').value);
    const restricaoMedica = document.getElementById('restricaoMedicaCoord').value;
    const restricaoAlimentar = document.getElementById('restricaoAlimentarCoord').value;
    const restricaoMedicacao = document.getElementById('restricaoMedicacaoCoord').value;
    const fotoPerfil = document.getElementById('fotoPerfilCoordenador').files[0];
    
    let fotoBase64 = obterFotoPerfilPreview('fotoPreviewCoordenador');

    if (!anoEncontroValido(anoEncontro)) {
        mostrarAlerta('alertaCoordenador', 'Informe um ano do encontro valido', 'warning');
        return;
    }
    
    if (fotoPerfil) {
        if (!fotoDentroDoLimite(fotoPerfil)) {
            mostrarAlerta('alertaCoordenador', `A foto deve ter no máximo ${TAMANHO_MAXIMO_FOTO_MB}MB`, 'warning');
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

// Atualizar restrições (dispara o formulário de perfil)
document.getElementById('formRestricoesCoord')?.addEventListener('submit', (e) => {
    e.preventDefault();
    document.getElementById('formPerfilCoordenador').dispatchEvent(new Event('submit'));
});

// Carregar pagamentos pendentes
async function carregarPagamentos() {
    try {
        const response = await fetch(`${API_URL}/coordenador/pagamentos-pendentes`, {
            headers: getHeaders()
        });
        
        const pagamentos = await response.json();
        
        let html = '<table class="table table-hover"><thead><tr><th>Foto</th><th>Usuário</th><th>Tipo</th><th>Valor</th><th>Data</th><th>Ação</th></tr></thead><tbody>';
        
        pagamentos.forEach(p => {
            const fotoHtml = p.foto_perfil 
                ? `<img src="${p.foto_perfil}" alt="Foto" style="width:40px; height:40px; border-radius:50%; object-fit:cover;">`
                : `<div style="width:40px; height:40px; border-radius:50%; background:#ccc; display:flex; align-items:center; justify-content:center;">-</div>`;
            
            html += `<tr>
                <td>${fotoHtml}</td>
                <td>${p.nome_completo}</td>
                <td>${p.tipo}</td>
                <td>R$ ${p.valor.toFixed(2)}</td>
                <td>${new Date(p.data_solicitacao).toLocaleDateString('pt-BR')}</td>
                <td><button class="btn btn-sm btn-success" onclick="confirmarPagamento(${p.id})">Confirmar</button></td>
            </tr>`;
        });
        
        html += '</tbody></table>';
        document.getElementById('tabelaPagamentos').innerHTML = html;
    } catch (err) {
        console.error(err);
    }
}

// Carregar solicitações de blusa
async function carregarBlusas() {
    try {
        const response = await fetch(`${API_URL}/coordenador/solicitacoes-blusa`, {
            headers: getHeaders()
        });
        
        const blusas = await response.json();
        
        let html = '<table class="table table-hover"><thead><tr><th>Foto</th><th>Usuário</th><th>Tamanho</th><th>Data</th><th>Status</th></tr></thead><tbody>';
        
        blusas.forEach(b => {
            const fotoHtml = b.foto_perfil 
                ? `<img src="${b.foto_perfil}" alt="Foto" style="width:40px; height:40px; border-radius:50%; object-fit:cover;">`
                : `<div style="width:40px; height:40px; border-radius:50%; background:#ccc; display:flex; align-items:center; justify-content:center;">-</div>`;
            
            const badge = b.status === 'confirmado' ? '<span class="badge bg-success">Confirmado</span>' : '<span class="badge bg-warning">Pendente</span>';
            html += `<tr>
                <td>${fotoHtml}</td>
                <td>${b.nome_completo}</td>
                <td>${b.tamanho}</td>
                <td>${new Date(b.data_solicitacao).toLocaleDateString('pt-BR')}</td>
                <td>${badge}</td>
            </tr>`;
        });
        
        html += '</tbody></table>';
        document.getElementById('tabelaBlusas').innerHTML = html;
    } catch (err) {
        console.error(err);
    }
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
                    <td>
                        <select class="form-select form-select-sm status-confirmacao" data-usuario-id="${usuario.id}" data-tipo-cadastro="${usuario.tipo_cadastro || 'usuario'}">
                            <option value="pendente" ${usuario.status === 'pendente' ? 'selected' : ''}>Pendente</option>
                            <option value="confirmado" ${usuario.status === 'confirmado' ? 'selected' : ''}>Confirmado</option>
                            <option value="negou" ${usuario.status === 'negou' ? 'selected' : ''}>Negou</option>
                            <option value="desistiu" ${usuario.status === 'desistiu' ? 'selected' : ''}>Desistiu</option>
                        </select>
                    </td>
                    <td>
                        <button type="button" class="btn btn-sm btn-success" onclick="enviarConfirmacaoWhatsApp(${usuario.id}, '${usuario.tipo_cadastro || 'usuario'}')">Confirmar participacao</button>
                    </td>
                </tr>
            `;
        }).join('');

        container.innerHTML = `
            <table class="table table-hover align-middle">
                <thead>
                    <tr>
                        <th>Foto</th>
                        <th>Usuario</th>
                        <th>Contato</th>
                        <th>Movimento</th>
                        <th>Equipe</th>
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

document.addEventListener('change', async (e) => {
    if (!e.target.classList.contains('status-confirmacao')) return;

    const usuarioId = e.target.dataset.usuarioId;
    const tipoCadastro = e.target.dataset.tipoCadastro || 'usuario';
    const status = e.target.value;

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
                <tr><th>Email</th><td>${escapeHtml(usuario.email || '-')}</td></tr>
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

function enviarConfirmacaoWhatsApp(usuarioId, tipoCadastro = 'usuario') {
    const usuario = participantesEquipeCache.find(item => Number(item.id) === Number(usuarioId) && (item.tipo_cadastro || 'usuario') === tipoCadastro);
    if (!usuario) return;

    const telefone = limparTelefoneWhatsApp(usuario.telefone || '');
    if (!telefone) {
        mostrarAlerta('alertaCoordenador', 'Telefone WhatsApp invalido para este participante.', 'warning');
        return;
    }

    const origem = window.location.origin === 'file://' ? 'http://localhost:5000' : window.location.origin;
    const linkConfirmacao = `${origem}/frontend/confirmacao.html?token=${encodeURIComponent(usuario.token_confirmacao)}`;
    const mensagem = `Olá ${usuario.nome_completo},
Ficamos muitos felizes pelo o seu sim!
Precisamos que você atualize seus dados em nosso sistema que está em fase de testes!
Por favor confirme seus dados no seguinte link!

${linkConfirmacao}`;
    window.open(`https://wa.me/55${telefone}?text=${encodeURIComponent(mensagem)}`, '_blank');
}

function limparTelefoneWhatsApp(telefone) {
    return String(telefone || '').replace(/\D/g, '').replace(/^55/, '');
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

// Confirmar pagamento
async function confirmarPagamento(pagamentoId) {
    try {
        const response = await fetch(`${API_URL}/coordenador/confirmar-pagamento/${pagamentoId}`, {
            method: 'PUT',
            headers: getHeaders()
        });
        
        if (response.ok) {
            mostrarAlerta('alertaCoordenador', 'Pagamento confirmado!', 'success');
            carregarPagamentos();
        }
    } catch (err) {
        mostrarAlerta('alertaCoordenador', 'Erro ao confirmar pagamento', 'danger');
        console.error(err);
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

// ===== FUNÇÕES DE REUNIÃO =====

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
            mostrarAlerta('alertaCoordenador', 'Reunião agendada com sucesso!', 'success');
            document.getElementById('formNovaReuniao').reset();
            carregarReunioes();
        }
    } catch (err) {
        mostrarAlerta('alertaCoordenador', 'Erro ao agendar reunião', 'danger');
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
            document.getElementById('listaReunioes').innerHTML = '<p class="text-muted">Nenhuma reunião agendada</p>';
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
                        <p class="card-text">${r.descricao || '<em>Sem descrição</em>'}</p>
                        <table class="table table-sm">
                            <tr>
                                <td><strong>Data:</strong> ${data}</td>
                                <td><strong>Horário:</strong> ${r.horario_inicio}${r.horario_fim ? ' - ' + r.horario_fim : ''}</td>
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
            container.innerHTML = '<div class="alert alert-info">Nenhum usuario escalado para a equipe desta chamada.</div>';
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
                    <input type="text" class="form-control form-control-sm presenca-observacao" data-reuniao-id="${reuniaoId}" data-usuario-id="${p.id}" value="${escapeHtml(p.observacao || '')}" placeholder="Observacao">
                </td>
            </tr>
        `).join('');

        container.innerHTML = `
            <h6>Chamada de presenca</h6>
            <div class="table-responsive">
                <table class="table table-sm align-middle">
                    <thead><tr><th>Foto</th><th>Usuario</th><th>Perfil</th><th>Equipe</th><th>Presenca</th><th>Observacao</th></tr></thead>
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
            mostrarAlerta('alertaCoordenador', 'Reunião atualizada com sucesso!', 'success');
            bootstrap.Modal.getInstance(document.getElementById('modalEditarReuniao')).hide();
            carregarReunioes();
        }
    } catch (err) {
        mostrarAlerta('alertaCoordenador', 'Erro ao atualizar reunião', 'danger');
        console.error(err);
    }
});

async function deletarReuniao(id) {
    if (!confirm('Tem certeza que deseja cancelar essa reunião?')) return;
    
    try {
        const response = await fetch(`${API_URL}/coordenador/reunioes/${id}`, {
            method: 'DELETE',
            headers: getHeaders()
        });
        
        if (response.ok) {
            mostrarAlerta('alertaCoordenador', 'Reunião cancelada com sucesso!', 'success');
            carregarReunioes();
        }
    } catch (err) {
        mostrarAlerta('alertaCoordenador', 'Erro ao cancelar reunião', 'danger');
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
