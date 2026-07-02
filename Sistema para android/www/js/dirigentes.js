const API_URL = (window.SISTEMA_ECRI_CONFIG && window.SISTEMA_ECRI_CONFIG.apiUrl) || (window.location.protocol === 'file:' ? 'http://localhost:5000/api' : window.location.origin + '/api');
const TAMANHO_MAXIMO_FOTO_MB = 3;
const TAMANHO_MAXIMO_FOTO_BYTES = TAMANHO_MAXIMO_FOTO_MB * 1024 * 1024;
const ABA_INICIAL_DIRIGENTE_KEY = 'dirigentesAbaInicial';
const ABA_ATUAL_DIRIGENTE_KEY = 'dirigentesAbaAtual';
const ABAS_DIRIGENTE = ['relatorio', 'meuPerfil', 'usuarios', 'eventos', 'carografo', 'situacao', 'reunioes', 'acompanhamentoFaltas'];
const INTERVALO_ATUALIZACAO_CAROGRAFO_MS = 5000;
const INTERVALO_ATUALIZACAO_ABAS_DIRIGENTE_MS = 5000;
const ABAS_DIRIGENTE_TEMPO_REAL = ['relatorio', 'situacao', 'acompanhamentoFaltas'];
let usuariosCache = [];
let pessoasExternasCache = [];
let eventosCache = [];
let perfilDirigenteId = null;
let intervaloAtualizacaoCarografo = null;
let atualizacaoCarografoEmAndamento = false;
let intervaloAtualizacaoAbaDirigente = null;
let atualizacaoAbaDirigenteEmAndamento = false;
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
    perfilDirigenteId = obterUsuárioLogadoId();
    renderizarCamposExperiencia('camposExperienciaDirigente', 'dirigente');
    renderizarCamposExperiencia('camposExperienciaEditarUsuário', 'editarUsuário');
    configurarCampoParoquia('paroquiaDirigente', 'campoOutraParoquiaDirigente');
    configurarCampoParoquia('editarParoquia', 'campoOutraParoquiaEditar');
    configurarRestricaoSimNao('temRestricaoMedicaDirigente', 'campoRestricaoMedicaDirigente', 'restricaoMedicaDirigente');
    configurarRestricaoSimNao('temRestricaoAlimentarDirigente', 'campoRestricaoAlimentarDirigente', 'restricaoAlimentarDirigente');
    configurarRestricaoSimNao('temRestricaoMedicacaoDirigente', 'campoRestricaoMedicacaoDirigente', 'restricaoMedicacaoDirigente');
    configurarConfiguraçõesDirigente();
    configurarFormularioConfiguracoesEncontroDirigente();
    document.getElementById('anoEncontroDirigente')?.addEventListener('input', limitarCampoNumerico);
    document.getElementById('editarAnoEncontro')?.addEventListener('input', limitarCampoNumerico);
    configurarFiltrosUsuarios();
    configurarFiltrosCarografo();
    carregarOpcoesEquipe();
    carregarPerfilDirigente();
    carregarConfiguracoesEncontroDirigente();
    carregarRelatorio();
    carregarUsuários();
    carregarPessoasExternas();
    carregarEventos();
    carregarSituacao();
    carregarReunioes();
    carregarAcompanhamentoFaltas();
    configurarPersistenciaAbas(ABA_ATUAL_DIRIGENTE_KEY);
    aplicarAbaInicialDirigente();
    configurarAtualizacaoAbasDirigenteTempoReal();
    configurarAtualizacaoCarografoTempoReal();
});

function configurarConfiguraçõesDirigente() {
    const selectAbaInicial = document.getElementById('abaInicialDirigente');
    const formConfigurações = document.getElementById('formConfiguraçõesDirigente');

    if (selectAbaInicial) {
        selectAbaInicial.value = obterAbaInicialDirigente();
    }

    formConfigurações?.addEventListener('submit', (e) => {
        e.preventDefault();
        const abaInicial = selectAbaInicial?.value || 'relatorio';
        if (!ABAS_DIRIGENTE.includes(abaInicial)) return;

        localStorage.setItem(ABA_INICIAL_DIRIGENTE_KEY, abaInicial);
        abrirAbaDirigente(abaInicial);
        mostrarAlerta('alertaDirigentes', 'Configurações salvas com sucesso!', 'success');
    });
}

function obterAbaInicialDirigente() {
    const abaInicial = localStorage.getItem(ABA_INICIAL_DIRIGENTE_KEY);
    return ABAS_DIRIGENTE.includes(abaInicial) ? abaInicial : 'relatorio';
}

function aplicarAbaInicialDirigente() {
    abrirAbaPersistida(ABA_ATUAL_DIRIGENTE_KEY, obterAbaInicialDirigente());
}

function abrirAbaDirigente(idAba) {
    const linkAba = document.querySelector(`[data-bs-toggle="tab"][href="#${idAba}"]`);
    if (!linkAba) return;

    if (window.bootstrap?.Tab) {
        bootstrap.Tab.getOrCreateInstance(linkAba).show();
        return;
    }

    linkAba.click();
}

// Carregar perfil do dirigente
async function carregarPerfilDirigente() {
    try {
        const response = await fetch(`${API_URL}/dirigentes/meu-perfil`, {
            headers: getHeaders()
        });
        
        const usuario = await response.json();
        perfilDirigenteId = usuario.id || perfilDirigenteId;
        const paroquiaPerfil = usuario.paroquia || obterParoquiaPerfilDirigenteLocal(usuario.id);
        configurarIconeAreaExclusiva(usuario);
        
        document.getElementById('emailDirigente').value = usuario.email;
        document.getElementById('nomeCompletoDirigente').value = usuario.nome_completo;
        document.getElementById('nomeCrachaDirigente').value = usuario.nome_cracha || '';
        document.getElementById('telefoneDirigente').value = usuario.telefone;
        preencherParoquia('paroquiaDirigente', 'outraParoquiaDirigente', 'campoOutraParoquiaDirigente', paroquiaPerfil);
        if (usuario.paroquia) {
            salvarParoquiaPerfilDirigenteLocal(usuario.paroquia, usuario.id);
        }
        marcarMovimentoOrigem('movimentoDirigente', usuario.movimento_origem);
        document.getElementById('anoEncontroDirigente').value = usuario.ano_encontro || '';
        preencherRestricaoSimNao('temRestricaoMedicaDirigente', 'campoRestricaoMedicaDirigente', 'restricaoMedicaDirigente', usuario.restricao_medica || '');
        preencherRestricaoSimNao('temRestricaoAlimentarDirigente', 'campoRestricaoAlimentarDirigente', 'restricaoAlimentarDirigente', usuario.restricao_alimentar || '');
        preencherRestricaoSimNao('temRestricaoMedicacaoDirigente', 'campoRestricaoMedicacaoDirigente', 'restricaoMedicacaoDirigente', usuario.restricao_medicacao || '');
        carregarExperienciaPerfil('dirigente', usuario);
        
        if (usuario.foto_perfil) {
            document.getElementById('fotoPreviewDirigente').src = usuario.foto_perfil;
            document.getElementById('fotoPreviewDirigente').style.display = 'block';
        }
    } catch (err) {
        console.error(err);
    }
}

function configurarIconeAreaExclusiva(usuario) {
    const botao = document.getElementById('btnAreaExclusivaDirigente');
    if (!botao) return;

    const nome = normalizarTextoAcessoExclusivo(usuario?.nome_completo || usuario?.nome_cracha || '');
    const email = String(usuario?.email || '').trim().toLowerCase();
    const podeAcessar = nome.includes('ORESTES PEREIRA') || email === 'admin@teste.com';

    botao.style.display = podeAcessar ? 'inline-flex' : 'none';
}

function normalizarTextoAcessoExclusivo(valor) {
    return String(valor || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toUpperCase();
}

function configurarFormularioConfiguracoesEncontroDirigente() {
    document.getElementById('formConfiguracoesEncontroDirigente')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        await salvarConfiguracoesEncontroDirigente();
    });
}

async function carregarConfiguracoesEncontroDirigente() {
    try {
        const response = await fetch(`${API_URL}/dirigentes/configuracoes-encontro`, {
            headers: getHeaders()
        });
        const configuracoes = await response.json();

        if (!response.ok) {
            mostrarAlerta('alertaDirigentes', configuracoes.erro || 'Erro ao carregar configurações do encontro', 'danger');
            return;
        }

        const entregaPastas = document.getElementById('reuniaoEntregaPastasDirigente');
        const revelacaoEquipes = document.getElementById('reuniaoRevelacaoEquipesDirigente');
        const pararPedidosBlusa = document.getElementById('pararPedidosBlusaDirigente');

        if (entregaPastas) entregaPastas.checked = Boolean(configuracoes.reuniao_entrega_pastas);
        if (revelacaoEquipes) revelacaoEquipes.checked = Boolean(configuracoes.reuniao_revelacao_equipes);
        if (pararPedidosBlusa) pararPedidosBlusa.checked = Boolean(configuracoes.parar_pedidos_blusa);
    } catch (err) {
        mostrarAlerta('alertaDirigentes', 'Erro ao carregar configurações do encontro', 'danger');
        console.error(err);
    }
}

async function salvarConfiguracoesEncontroDirigente() {
    const body = {
        reuniao_entrega_pastas: document.getElementById('reuniaoEntregaPastasDirigente')?.checked || false,
        reuniao_revelacao_equipes: document.getElementById('reuniaoRevelacaoEquipesDirigente')?.checked || false,
        parar_pedidos_blusa: document.getElementById('pararPedidosBlusaDirigente')?.checked || false
    };

    try {
        const response = await fetch(`${API_URL}/dirigentes/configuracoes-encontro`, {
            method: 'PUT',
            headers: getHeaders(),
            body: JSON.stringify(body)
        });
        const data = await response.json();

        if (response.ok) {
            mostrarAlerta('alertaDirigentes', 'Configurações do encontro salvas com sucesso!', 'success');
            await carregarConfiguracoesEncontroDirigente();
        } else {
            mostrarAlerta('alertaDirigentes', data.erro || 'Erro ao salvar configurações do encontro', 'danger');
            await carregarConfiguracoesEncontroDirigente();
        }
    } catch (err) {
        mostrarAlerta('alertaDirigentes', 'Erro ao salvar configurações do encontro', 'danger');
        await carregarConfiguracoesEncontroDirigente();
        console.error(err);
    }
}

// Atualizar perfil do dirigente
document.getElementById('formPerfilDirigente')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const nomeCracha = document.getElementById('nomeCrachaDirigente').value;
    const paroquia = obterParoquia('paroquiaDirigente', 'outraParoquiaDirigente');
    const movimento = obterMovimentoOrigem('movimentoDirigente');
    const anoEncontro = somenteNumeros(document.getElementById('anoEncontroDirigente').value);
    const restricaoMedica = obterRestricaoSimNao('temRestricaoMedicaDirigente', 'restricaoMedicaDirigente', 'restrição médica');
    const restricaoAlimentar = obterRestricaoSimNao('temRestricaoAlimentarDirigente', 'restricaoAlimentarDirigente', 'restrição alimentar');
    const restricaoMedicacao = obterRestricaoSimNao('temRestricaoMedicacaoDirigente', 'restricaoMedicacaoDirigente', 'restrição à medicação');
    const fotoPerfil = document.getElementById('fotoPerfilDirigente').files[0];
    
    let fotoBase64 = null;

    if (!anoEncontroValido(anoEncontro)) {
        mostrarAlerta('alertaDirigentes', 'Informe um ano do encontro válido', 'warning');
        return;
    }

    if (!paroquiaValida(paroquia)) {
        mostrarAlerta('alertaDirigentes', 'Informe a paróquia à qual você pertence', 'warning');
        return;
    }
    
    if (restricaoMedica.erro || restricaoAlimentar.erro || restricaoMedicacao.erro) {
        mostrarAlerta('alertaDirigentes', restricaoMedica.erro || restricaoAlimentar.erro || restricaoMedicacao.erro, 'warning');
        return;
    }

    if (fotoPerfil) {
        if (!fotoDentroDoLimite(fotoPerfil)) {
            mostrarAlerta('alertaDirigentes', `A foto deve ser JPG, JPEG, PNG, HEIF ou WEBP e ter no máximo ${TAMANHO_MAXIMO_FOTO_MB}MB`, 'warning');
            return;
        }

        try {
            fotoBase64 = await converterParaBase64(fotoPerfil);
        } catch (err) {
            mostrarAlerta('alertaDirigentes', err.message || 'Erro ao otimizar a foto', 'warning');
            return;
        }
        document.getElementById('fotoPreviewDirigente').src = fotoBase64;
        document.getElementById('fotoPreviewDirigente').style.display = 'block';
    }
    
    try {
        const response = await fetch(`${API_URL}/dirigentes/meu-perfil`, {
            method: 'PUT',
            headers: getHeaders(),
            body: JSON.stringify({
                nome_cracha: nomeCracha,
                paroquia,
                movimento_origem: movimento,
                ano_encontro: anoEncontro,
                restricao_medica: restricaoMedica.valor,
                restricao_alimentar: restricaoAlimentar.valor,
                restricao_medicacao: restricaoMedicacao.valor,
                foto_perfil: fotoBase64,
                ...obterExperienciaPerfil('dirigente')
            })
        });
        
        if (response.ok) {
            const data = await response.json();
            const paroquiaSalva = data.paroquia || paroquia;
            salvarParoquiaPerfilDirigenteLocal(paroquiaSalva);
            preencherParoquia('paroquiaDirigente', 'outraParoquiaDirigente', 'campoOutraParoquiaDirigente', paroquiaSalva);
            mostrarAlerta('alertaDirigentes', 'Perfil atualizado com sucesso!', 'success');
            await carregarPerfilDirigente();
            await carregarUsuários();
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

function chaveParóquiaPerfilDirigente(usuarioId = perfilDirigenteId) {
    return `dirigentesParóquiaPerfil:${usuarioId || 'atual'}`;
}

function salvarParoquiaPerfilDirigenteLocal(paroquia, usuarioId = perfilDirigenteId) {
    const valor = paraCaixaAlta(paroquia || '');
    if (valor) {
        localStorage.setItem(chaveParóquiaPerfilDirigente(usuarioId), valor);
    }
}

function obterParoquiaPerfilDirigenteLocal(usuarioId = perfilDirigenteId) {
    return localStorage.getItem(chaveParóquiaPerfilDirigente(usuarioId)) || '';
}

function chaveParóquiaUsuário(usuarioId) {
    return `dirigentesParóquiaUsuário:${usuarioId}`;
}

function salvarParoquiaUsuarioLocal(usuarioId, paroquia) {
    const valor = paraCaixaAlta(paroquia || '');
    if (usuarioId && valor) {
        localStorage.setItem(chaveParóquiaUsuário(usuarioId), valor);
    }
}

function obterParoquiaUsuarioLocal(usuarioId) {
    return usuarioId ? localStorage.getItem(chaveParóquiaUsuário(usuarioId)) || '' : '';
}

function obterUsuárioLogadoId() {
    try {
        const usuario = JSON.parse(localStorage.getItem('usuario') || '{}');
        return usuario.id || usuario.usuario_id || null;
    } catch (err) {
        return null;
    }
}

function aplicarFallbackParóquiaPessoa(pessoa) {
    if (!pessoa || pessoa.paroquia) {
        return pessoa;
    }

    const paroquiaLocal = obterParoquiaUsuarioLocal(pessoa.id)
        || (Number(pessoa.id) === Number(perfilDirigenteId) ? obterParoquiaPerfilDirigenteLocal(pessoa.id) : '');
    return paroquiaLocal ? { ...pessoa, paroquia: paroquiaLocal } : pessoa;
}

function obterParoquiaPessoa(pessoa) {
    if (!pessoa) return '';
    if (pessoa.paroquia) return pessoa.paroquia;
    const paroquiaUsuario = obterParoquiaUsuarioLocal(pessoa.id);
    if (paroquiaUsuario) return paroquiaUsuario;
    if (Number(pessoa.id) === Number(perfilDirigenteId)) {
        return obterParoquiaPerfilDirigenteLocal(pessoa.id);
    }
    return '';
}

// Atualizar restrições (dispara o formulário de perfil)
// Carregar relatório geral
async function carregarRelatorio() {
    try {
        const response = await fetch(`${API_URL}/dirigentes/relatorio/geral`, {
            headers: getHeaders()
        });
        
        const data = await response.json();
        
        document.getElementById('totalUsuários').textContent = data.stats.totalUsuários;
        document.getElementById('confirmados').textContent = data.stats.confirmados;
        document.getElementById('pendentes').textContent = data.stats.pendentes;
        document.getElementById('coordenadores').textContent = data.stats.coordenadores;
        document.getElementById('totalEscaladosEquipes').textContent = data.stats.totalEscaladosEquipes || 0;
        document.getElementById('totalPonderadoEquipes').textContent = data.stats.totalPonderadoEquipes || 0;
        renderizarResumoEquipes(data.equipesResumo || []);
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

    const totais = equipesResumo.reduce((acc, item) => {
        const casais = Number(item.ecc || 0) + Number(item.jovensEjcCasados || 0);
        acc.quantidadePessoas += Number(item.quantidadePessoas || 0);
        acc.ejc += Number(item.ejc || 0);
        acc.ec += Number(item.ec || 0);
        acc.casais += casais;
        acc.ecri += Number(item.ecri || 0);
        acc.totalPonderado += Number(item.totalPonderado || 0);
        return acc;
    }, {
        quantidadePessoas: 0,
        ejc: 0,
        ec: 0,
        casais: 0,
        ecri: 0,
        totalPonderado: 0
    });

    const linhas = equipesResumo.map(item => {
        const casais = Number(item.ecc || 0) + Number(item.jovensEjcCasados || 0);
        return `
            <tr>
                <td><strong>${escapeHtml(item.equipe)}</strong></td>
                <td>${Number(item.quantidadePessoas || 0)}</td>
                <td>${Number(item.ecri || 0)}</td>
                <td>${Number(item.ejc || 0)}</td>
                <td>${Number(item.ec || 0)}</td>
                <td>${casais}</td>
                <td><strong>${Number(item.totalPonderado || 0)}</strong></td>
            </tr>
        `;
    }).join('');

    container.innerHTML = `
        <table class="table table-sm table-hover align-middle">
            <thead>
                <tr>
                    <th>Equipe</th>
                    <th>Pessoas escaladas</th>
                    <th>ECRI</th>
                    <th>EJC</th>
                    <th>EC</th>
                    <th>Casais</th>
                    <th>Total ponderado</th>
                </tr>
            </thead>
            <tbody>${linhas}</tbody>
            <tfoot>
                <tr class="table-secondary">
                    <th>Total</th>
                    <th>${totais.quantidadePessoas}</th>
                    <th>${totais.ecri}</th>
                    <th>${totais.ejc}</th>
                    <th>${totais.ec}</th>
                    <th>${totais.casais}</th>
                    <th>${totais.totalPonderado}</th>
                </tr>
            </tfoot>
        </table>
    `;
}

async function carregarUsuários() {
    try {
        const response = await fetch(`${API_URL}/dirigentes/usuarios`, {
            headers: getHeaders()
        });
        
        const usuarios = await response.json();
        usuariosCache = usuarios
            .map(aplicarFallbackParóquiaPessoa)
            .sort(ordenarUsuarioPorNome);

        renderizarTabelaUsuarios();
        aplicarFiltrosCarografo();
        renderizarEventos();
        carregarAcompanhamentoFaltas();
    } catch (err) {
        console.error(err);
    }
}

function configurarFiltrosUsuarios() {
    document.getElementById('filtroUsuariosBusca')?.addEventListener('input', aplicarFiltroGerenciarUsuarios);
    document.getElementById('limparFiltrosUsuarios')?.addEventListener('click', () => {
        const filtroBusca = document.getElementById('filtroUsuariosBusca');
        if (filtroBusca) filtroBusca.value = '';
        aplicarFiltroGerenciarUsuarios();
    });
}

function aplicarFiltroGerenciarUsuarios() {
    renderizarTabelaUsuarios();
    renderizarPessoasExternas();
}

function renderizarTabelaUsuarios() {
    const container = document.getElementById('tabelaUsuários');
    if (!container) return;

    const busca = document.getElementById('filtroUsuariosBusca')?.value || '';
    const filtroNome = normalizarTextoFiltro(busca);
    const filtroTelefone = normalizarTelefoneFiltro(busca);
    const usuariosFiltrados = usuariosCache
        .filter((usuario) => {
            const nomeUsuario = normalizarTextoFiltro(`${usuario.nome_completo || ''} ${usuario.nome_cracha || ''}`);
            const telefoneUsuario = normalizarTelefoneFiltro(usuario.telefone || '');
            if (!filtroNome && !filtroTelefone) return true;
            if (filtroTelefone && telefoneUsuario.includes(filtroTelefone)) return true;
            if (filtroNome && nomeUsuario.includes(filtroNome)) return true;
            return false;
        })
        .sort(ordenarUsuarioPorNome);

    let html = '<table class="table table-hover tabela-usuarios-dirigentes"><thead><tr><th class="col-foto">Foto</th><th class="col-nome">Nome</th><th class="col-email">Email</th><th class="col-perfil">Perfil</th><th class="col-equipe">Equipe</th><th class="col-status">Status</th><th class="col-acao">Ação</th></tr></thead><tbody>';

    if (!usuariosFiltrados.length) {
        html += '<tr><td colspan="7" class="text-muted">Nenhum usuário encontrado.</td></tr>';
    }

    usuariosFiltrados.forEach(u => {
        const fotoHtml = u.foto_perfil
            ? `<img src="${escapeAttr(sanitizarImagemPerfil(u.foto_perfil))}" alt="Foto" title="Clique para ampliar" style="width:40px; height:40px; border-radius:50%; object-fit:cover; cursor:pointer;" onclick="abrirModalFotoGrande(this.src)">`
            : `<div style="width:40px; height:40px; border-radius:50%; background:#ccc; display:flex; align-items:center; justify-content:center;">-</div>`;

        const perfilBadge = {
            'equipista': '<span class="badge bg-info">Equipista</span>',
            'coordenador': '<span class="badge bg-success">Coordenador</span>',
            'equipe_dirigente': '<span class="badge bg-danger">Dirigente</span>'
        }[u.perfil] || escapeHtml(u.perfil || '-');

        const statusBadge = obterStatusBadge(u.status || 'pendente');

        html += `<tr>
            <td class="col-foto">${fotoHtml}</td>
            <td class="col-nome">${escapeHtml(u.nome_completo || '')}</td>
            <td class="col-email">${escapeHtml(u.email || '')}</td>
            <td class="col-perfil">${perfilBadge}</td>
            <td class="col-equipe">${escapeHtml(u.equipe || '-')}</td>
            <td class="col-status">${statusBadge}</td>
            <td class="col-acao">
                <button class="btn btn-sm btn-secondary" onclick="abrirModalEditarUsuário(${Number(u.id)})">Editar</button>
                <button class="btn btn-sm btn-primary" onclick="abrirModalEscalar(${Number(u.id)})">Escalar</button>
            </td>
        </tr>`;
    });

    html += '</tbody></table>';
    container.innerHTML = html;
}

function ordenarUsuarioPorNome(a, b) {
    const nomeA = a.nome_completo || a.nome_cracha || '';
    const nomeB = b.nome_completo || b.nome_cracha || '';
    return nomeA.localeCompare(nomeB, 'pt-BR', { sensitivity: 'base' });
}

async function excluirUsuário(usuarioId, nomeUsuário) {
    const confirmado = confirm(`Tem certeza que deseja excluir o usuario ${nomeUsuário}? Essa acao não pode ser desfeita.`);
    if (!confirmado) return;

    try {
        const response = await fetch(`${API_URL}/dirigentes/usuarios/${usuarioId}`, {
            method: 'DELETE',
            headers: getHeaders()
        });

        if (response.ok) {
            mostrarAlerta('alertaDirigentes', 'Usuário excluido com sucesso!', 'success');
            carregarUsuários();
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

async function abrirModalEditarUsuário(usuarioId) {
    let usuario = usuariosCache.find(u => Number(u.id) === Number(usuarioId));

    try {
        const response = await fetch(`${API_URL}/dirigentes/usuarios/${usuarioId}`, {
            headers: getHeaders()
        });
        const data = await response.json();

        if (!response.ok) {
            mostrarAlerta('alertaDirigentes', data.erro || 'Erro ao carregar dados do usuário', 'danger');
            return;
        }

        usuario = aplicarFallbackParóquiaPessoa(data);
        usuariosCache = usuariosCache.map(item => Number(item.id) === Number(usuario.id) ? usuario : item);
    } catch (err) {
        if (!usuario) {
            mostrarAlerta('alertaDirigentes', 'Erro ao carregar dados do usuário', 'danger');
            console.error(err);
            return;
        }
        console.error(err);
    }

    if (!usuario) return;

    document.getElementById('editarUsuárioId').value = usuario.id;
    document.getElementById('editarNomeCompleto').value = usuario.nome_completo || '';
    document.getElementById('editarNomeCracha').value = usuario.nome_cracha || '';
    preencherTelefonesEdicaoUsuario(usuario.telefone || '', usuario.movimento_origem || '');
    preencherParoquia('editarParoquia', 'outraParoquiaEditar', 'campoOutraParoquiaEditar', usuario.paroquia);
    document.getElementById('editarMovimento').value = usuario.movimento_origem || '';
    atualizarCamposTelefoneEdicaoUsuario();
    document.getElementById('editarAnoEncontro').value = usuario.ano_encontro || '';
    document.getElementById('editarEquipe').value = usuario.equipe || 'SEM EQUIPE';
    document.getElementById('editarStatus').value = usuario.status || 'pendente';
    document.getElementById('editarRestricaoMedica').value = usuario.restricao_medica || '';
    document.getElementById('editarRestricaoAlimentar').value = usuario.restricao_alimentar || '';
    document.getElementById('editarRestricaoMedicacao').value = usuario.restricao_medicacao || '';
    carregarExperienciaPerfil('editarUsuário', usuario);

    new bootstrap.Modal(document.getElementById('modalEditarUsuário')).show();
}

document.getElementById('formEditarUsuário')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const usuarioId = document.getElementById('editarUsuárioId').value;
    const anoEncontro = somenteNumeros(document.getElementById('editarAnoEncontro').value);
    const paroquia = obterParoquia('editarParoquia', 'outraParoquiaEditar');

    if (!anoEncontroValido(anoEncontro)) {
        mostrarAlerta('alertaDirigentes', 'Informe um ano do encontro válido', 'warning');
        return;
    }

    if (!paroquiaValida(paroquia)) {
        mostrarAlerta('alertaDirigentes', 'Informe a paróquia à qual o usuário pertence', 'warning');
        return;
    }

    const telefoneEdicao = obterTelefoneEdicaoUsuario();
    if (!telefoneEdicao.valido) return;

    const body = {
        nome_completo: document.getElementById('editarNomeCompleto').value,
        nome_cracha: document.getElementById('editarNomeCracha').value,
        telefone: telefoneEdicao.telefone,
        paroquia,
        movimento_origem: document.getElementById('editarMovimento').value,
        ano_encontro: anoEncontro,
        equipe: document.getElementById('editarEquipe').value,
        status: document.getElementById('editarStatus').value,
        restricao_medica: document.getElementById('editarRestricaoMedica').value,
        restricao_alimentar: document.getElementById('editarRestricaoAlimentar').value,
        restricao_medicacao: document.getElementById('editarRestricaoMedicacao').value,
        ...obterExperienciaPerfil('editarUsuário')
    };

    try {
        const response = await fetch(`${API_URL}/dirigentes/usuarios/${usuarioId}/perfil`, {
            method: 'PUT',
            headers: getHeaders(),
            body: JSON.stringify(body)
        });

        if (response.ok) {
            const data = await response.json();
            const usuarioAtualizado = data.usuario ? aplicarFallbackParóquiaPessoa(data.usuario) : null;
            const paroquiaSalva = usuarioAtualizado?.paroquia || data.paroquia || paroquia;
            salvarParoquiaUsuarioLocal(usuarioId, paroquiaSalva);
            usuariosCache = usuariosCache.map(usuario => Number(usuario.id) === Number(usuarioId)
                ? { ...usuario, ...body, ...(usuarioAtualizado || {}), paroquia: paroquiaSalva }
                : usuario);
            aplicarFiltrosCarografo();
            mostrarAlerta('alertaDirigentes', 'Perfil atualizado com sucesso!', 'success');
            bootstrap.Modal.getInstance(document.getElementById('modalEditarUsuário')).hide();
            await carregarUsuários();
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
        pessoasExternasCache = (Array.isArray(pessoas) ? pessoas : []).sort(ordenarUsuarioPorNome);

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

    const busca = document.getElementById('filtroUsuariosBusca')?.value || '';
    const filtroNome = normalizarTextoFiltro(busca);
    const filtroTelefone = normalizarTelefoneFiltro(busca);
    const pessoasFiltradas = pessoasExternasCache
        .filter((pessoa) => {
            const nomePessoa = normalizarTextoFiltro(`${pessoa.nome_completo || ''} ${pessoa.nome_cracha || ''}`);
            const telefonePessoa = normalizarTelefoneFiltro(pessoa.telefone || '');
            if (!filtroNome && !filtroTelefone) return true;
            if (filtroTelefone && telefonePessoa.includes(filtroTelefone)) return true;
            if (filtroNome && nomePessoa.includes(filtroNome)) return true;
            return false;
        })
        .sort(ordenarUsuarioPorNome);

    if (!pessoasFiltradas.length) {
        container.innerHTML = '<div class="alert alert-info">Nenhuma pessoa sem cadastro encontrada.</div>';
        return;
    }

    const linhas = pessoasFiltradas.map(pessoa => {
        const fotoHtml = pessoa.foto_perfil
            ? `<img src="${escapeAttr(sanitizarImagemPerfil(pessoa.foto_perfil))}" alt="Foto" title="Clique para ampliar" style="width:40px; height:40px; border-radius:50%; object-fit:cover; cursor:pointer;" onclick="abrirModalFotoGrande(this.src)">`
            : `<div style="width:40px; height:40px; border-radius:50%; background:#ccc; display:flex; align-items:center; justify-content:center;">-</div>`;
        const statusHtml = obterStatusBadge(pessoa.status || 'pendente');

        return `
            <tr>
                <td>${fotoHtml}</td>
                <td>
                    <div class="d-flex align-items-center gap-2 flex-wrap">
                        <span>${escapeHtml(pessoa.nome_completo || '')}</span>
                        <button type="button" class="btn btn-sm btn-outline-secondary" onclick="abrirModalEditarPessoaExterna(${Number(pessoa.id)})">Editar</button>
                    </div>
                </td>
                <td>${escapeHtml(pessoa.telefone || '')}</td>
                <td>${escapeHtml(pessoa.movimento_origem || '-')}</td>
                <td>${escapeHtml(pessoa.equipe || '-')}</td>
                <td>${statusHtml}</td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="abrirModalEscalar(${Number(pessoa.id)}, false, 'externo')">Escalar</button>
                    <button class="btn btn-sm btn-danger" onclick="excluirPessoaExterna(${pessoa.id}, '${escapeHtml(pessoa.nome_completo || '')}')">Excluir</button>
                </td>
            </tr>
        `;
    }).join('');

    container.innerHTML = `
        <table class="table table-hover">
            <thead>
                <tr><th>Foto</th><th>Nome</th><th>Telefone</th><th>Movimento</th><th>Equipe</th><th>Status</th><th>Ação</th></tr>
            </thead>
            <tbody>${linhas}</tbody>
        </table>
    `;
}

document.getElementById('formPessoaExterna')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const telefoneCampo = document.getElementById('pessoaExternaTelefone');
    const telefoneNormalizado = normalizarTelefonePessoaExterna(telefoneCampo.value);
    telefoneCampo.value = telefoneNormalizado;

    if (telefoneComecaComNoveSemDdd(telefoneNormalizado)) {
        mostrarModalMensagemDirigente('Faltou o DDD', 'Faltou o DDD', 'warning');
        telefoneCampo.focus();
        return;
    }

    if (telefoneNormalizado.length !== 11) {
        mostrarModalMensagemDirigente('Telefone invalido', 'Informe o telefone com DDD e 9 digitos. Exemplo: 83999999999.', 'warning');
        telefoneCampo.focus();
        return;
    }

    const body = {
        nome_completo: document.getElementById('pessoaExternaNome').value,
        telefone: telefoneNormalizado,
        movimento_origem: document.getElementById('pessoaExternaMovimento').value,
        equipe: document.getElementById('pessoaExternaEquipe').value
    };

    try {
        const response = await fetch(`${API_URL}/dirigentes/pessoas-externas`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(body)
        });

        if (response.ok) {
            mostrarModalMensagemDirigente('Contato salvo', 'Contato salvo com sucesso.', 'success');
            document.getElementById('formPessoaExterna').reset();
            carregarPessoasExternas();
        } else {
            const erro = await response.json();
            mostrarModalMensagemDirigente('Contato não salvo', formatarMensagemErroPessoaExterna(erro.erro), 'danger');
        }
    } catch (err) {
        mostrarModalMensagemDirigente('Contato não salvo', 'Erro ao adicionar pessoa.', 'danger');
        console.error(err);
    }
});

document.getElementById('editarMovimento')?.addEventListener('change', atualizarCamposTelefoneEdicaoUsuario);

function preencherTelefonesEdicaoUsuario(telefoneValor, movimento) {
    const telefoneTexto = String(telefoneValor || '');
    const telefoneIndividual = document.getElementById('editarTelefone');
    const telefoneEsposa = document.getElementById('editarTelefoneEsposa');
    const telefoneMarido = document.getElementById('editarTelefoneMarido');

    if (!telefoneIndividual || !telefoneEsposa || !telefoneMarido) return;

    telefoneIndividual.value = '';
    telefoneEsposa.value = '';
    telefoneMarido.value = '';

    if (movimentoOrigemCasalDirigente(movimento)) {
        telefoneEsposa.value = telefoneTexto.match(/Esposa:\s*([^|]+)/i)?.[1]?.trim() || '';
        telefoneMarido.value = telefoneTexto.match(/Marido:\s*(.+)$/i)?.[1]?.trim() || '';

        if (!telefoneEsposa.value && !telefoneMarido.value) {
            telefoneEsposa.value = telefoneTexto;
        }
        return;
    }

    telefoneIndividual.value = telefoneTexto;
}

function atualizarCamposTelefoneEdicaoUsuario() {
    const movimento = document.getElementById('editarMovimento')?.value || '';
    const isCasal = movimentoOrigemCasalDirigente(movimento);
    const campoIndividual = document.getElementById('campoEditarTelefoneIndividual');
    const campoEsposa = document.getElementById('campoEditarTelefoneEsposa');
    const campoMarido = document.getElementById('campoEditarTelefoneMarido');
    const telefone = document.getElementById('editarTelefone');
    const telefoneEsposa = document.getElementById('editarTelefoneEsposa');
    const telefoneMarido = document.getElementById('editarTelefoneMarido');

    if (!campoIndividual || !campoEsposa || !campoMarido || !telefone || !telefoneEsposa || !telefoneMarido) return;

    campoIndividual.style.display = isCasal ? 'none' : 'block';
    campoEsposa.style.display = isCasal ? 'block' : 'none';
    campoMarido.style.display = isCasal ? 'block' : 'none';
    telefone.required = !isCasal;
    telefoneEsposa.required = isCasal;
    telefoneMarido.required = isCasal;
}

function obterTelefoneEdicaoUsuario() {
    const movimento = document.getElementById('editarMovimento')?.value || '';
    const isCasal = movimentoOrigemCasalDirigente(movimento);

    if (!isCasal) {
        const telefoneValidacao = validarCampoTelefoneContato('editarTelefone', { obrigatorio: true });
        if (!telefoneValidacao.valido) {
            return { valido: false, telefone: '' };
        }
        return { valido: true, telefone: telefoneValidacao.telefone };
    }

    const esposaValidacao = validarCampoTelefoneContato('editarTelefoneEsposa', { obrigatorio: true });
    if (!esposaValidacao.valido) {
        return { valido: false, telefone: '' };
    }

    const maridoValidacao = validarCampoTelefoneContato('editarTelefoneMarido', { obrigatorio: true });
    if (!maridoValidacao.valido) {
        return { valido: false, telefone: '' };
    }

    return {
        valido: true,
        telefone: `Esposa: ${esposaValidacao.telefone} | Marido: ${maridoValidacao.telefone}`
    };
}

function movimentoOrigemCasalDirigente(movimento) {
    return movimento === 'ECC' || movimento === 'JOVENS EJC CASADOS';
}

function formatarMensagemErroPessoaExterna(mensagem) {
    const texto = mensagem || 'Erro ao adicionar pessoa.';
    const telefoneDuplicado = texto.match(/^Telefone já cadastrado para (.+)$/i);
    if (telefoneDuplicado) {
        return `O número informado já foi cadastrado e pertence a ${telefoneDuplicado[1]}.`;
    }
    return texto;
}

function normalizarTelefonePessoaExterna(valor) {
    const telefone = String(valor || '').replace(/\D/g, '');
    if (telefone.length === 10) {
        return `${telefone.slice(0, 2)}9${telefone.slice(2)}`;
    }
    return telefone.slice(0, 11);
}

function telefoneComecaComNoveSemDdd(telefone) {
    return String(telefone || '').startsWith('9') && String(telefone || '').length < 11;
}

configurarCampoTelefoneContato('pessoaExternaTelefone');
configurarCampoTelefoneContato('editarPessoaExternaTelefone');
configurarCampoTelefoneContato('editarTelefone');
configurarCampoTelefoneContato('editarTelefoneEsposa');
configurarCampoTelefoneContato('editarTelefoneMarido');

function mostrarModalMensagemDirigente(titulo, mensagem, tipo = 'info') {
    const modalExistente = document.getElementById('modalMensagemDirigente');
    if (modalExistente) {
        modalExistente.remove();
    }

    const classeTitulo = {
        success: 'text-success',
        danger: 'text-danger',
        warning: 'text-warning'
    }[tipo] || 'text-primary';

    const modalHtml = `
        <div class="modal fade" id="modalMensagemDirigente" tabindex="-1" aria-hidden="true">
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title ${classeTitulo}">${escapeHtml(titulo)}</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>
                    </div>
                    <div class="modal-body">
                        <p class="mb-0">${escapeHtml(mensagem)}</p>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-primary" data-bs-dismiss="modal">OK</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const modalEl = document.getElementById('modalMensagemDirigente');
    modalEl.addEventListener('hidden.bs.modal', () => modalEl.remove(), { once: true });
    new bootstrap.Modal(modalEl).show();
}

function abrirModalEditarPessoaExterna(pessoaId) {
    const pessoa = pessoasExternasCache.find(item => Number(item.id) === Number(pessoaId));
    if (!pessoa) return;

    document.getElementById('editarPessoaExternaId').value = pessoa.id;
    document.getElementById('editarPessoaExternaNome').value = pessoa.nome_completo || '';
    document.getElementById('editarPessoaExternaTelefone').value = pessoa.telefone || '';
    document.getElementById('editarPessoaExternaMovimento').value = pessoa.movimento_origem || '';

    new bootstrap.Modal(document.getElementById('modalEditarPessoaExterna')).show();
}

document.getElementById('formEditarPessoaExterna')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const pessoaId = document.getElementById('editarPessoaExternaId').value;
    const telefoneCampo = document.getElementById('editarPessoaExternaTelefone');
    const telefoneNormalizado = normalizarTelefonePessoaExterna(telefoneCampo.value);
    telefoneCampo.value = telefoneNormalizado;

    if (telefoneComecaComNoveSemDdd(telefoneNormalizado)) {
        mostrarModalMensagemDirigente('Faltou o DDD', 'Faltou o DDD', 'warning');
        telefoneCampo.focus();
        return;
    }

    if (telefoneNormalizado.length !== 11) {
        mostrarModalMensagemDirigente('Telefone invalido', 'Informe o telefone com DDD e 9 digitos. Exemplo: 83999999999.', 'warning');
        telefoneCampo.focus();
        return;
    }

    const body = {
        nome_completo: document.getElementById('editarPessoaExternaNome').value,
        telefone: telefoneNormalizado,
        movimento_origem: document.getElementById('editarPessoaExternaMovimento').value
    };

    try {
        const response = await fetch(`${API_URL}/dirigentes/pessoas-externas/${pessoaId}`, {
            method: 'PUT',
            headers: getHeaders(),
            body: JSON.stringify(body)
        });
        const data = await response.json();

        if (!response.ok) {
            mostrarAlerta('alertaDirigentes', data.erro || 'Erro ao atualizar pessoa sem cadastro', 'danger');
            return;
        }

        mostrarAlerta('alertaDirigentes', 'Pessoa sem cadastro atualizada com sucesso!', 'success');
        bootstrap.Modal.getInstance(document.getElementById('modalEditarPessoaExterna'))?.hide();
        await carregarPessoasExternas();
    } catch (err) {
        mostrarAlerta('alertaDirigentes', 'Erro ao atualizar pessoa sem cadastro', 'danger');
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
        editarEquipe.innerHTML = EQUIPES_FIXAS
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
                            <thead><tr><th>Escalar</th><th>Usuário</th><th>Perfil atual</th><th>Perfil no evento</th></tr></thead>
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

    const usuariosOrdenados = [...usuarios].sort(ordenarPessoaCarografo);

    painel.innerHTML = usuariosOrdenados.map(u => {
        const nome = escapeHtml(u.nome_completo || '');
        const movimentoOrigem = escapeHtml(u.movimento_origem || '-');
        const anoEncontro = escapeHtml(u.ano_encontro || '-');
        const telefone = escapeHtml(u.telefone || '-');
        const paroquiaValor = obterParoquiaPessoa(u);
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
        const tipoCadastroResumo = u.origem_cadastro === 'externo' ? 'externo' : 'usuario';
        const idResumo = Number(u.id);
        const fotoHtml = u.foto_perfil
            ? `<img src="${u.foto_perfil}" alt="Foto de ${nome}" class="carografo-foto">`
            : '<div class="carografo-foto carografo-foto-placeholder">-</div>';
        const logoParoquia = tipoCadastroResumo === 'externo' ? null : obterLogoParoquia(paroquiaValor);
        const logoParoquiaHtml = logoParoquia
            ? `<img src="${logoParoquia.src}" alt="${logoParoquia.alt}" class="carografo-paroquia-logo">`
            : '';
        const removidoDoEncontro = pessoaRemovidaDoEncontro(u);
        const pessoaImpedidaServir = Number(u.pessoa_impedida_servir || 0) === 1;
        const motivoImpedimentoCard = pessoaImpedidaServir
            ? `<div class="carografo-motivo-impedimento"><strong>Motivo:</strong> ${escapeHtml(formatarMotivoImpedimentoServirCard(u.pessoa_impedida_motivos))}</div>`
            : '';
        const coordenador = u.perfil === 'coordenador';
        const classesCard = [
            'carografo-item',
            destaqueMusical ? 'carografo-item-musical' : '',
            coordenador ? 'carografo-item-coordenador' : '',
            removidoDoEncontro ? 'carografo-item-removido' : '',
            pessoaImpedidaServir ? 'carografo-item-impedido' : ''
        ].filter(Boolean).join(' ');

        return `
            <div class="${classesCard}" role="button" tabindex="0" title="Clique para abrir o resumo" onclick="abrirModalResumoUsuário(${idResumo}, '${tipoCadastroResumo}')" onkeydown="if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); abrirModalResumoUsuário(${idResumo}, '${tipoCadastroResumo}'); }">
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
                    ${motivoImpedimentoCard}
                    <div class="carografo-status">${statusBadge}</div>
                </div>
            </div>
        `;
    }).join('');
}

function ordenarPessoaCarografo(a, b) {
    const nomeA = a.nome_completo || a.nome_cracha || '';
    const nomeB = b.nome_completo || b.nome_cracha || '';
    return nomeA.localeCompare(nomeB, 'pt-BR', { sensitivity: 'base' });
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

function pessoaSemEquipe(pessoa) {
    return normalizarTextoFiltro(pessoa?.equipe || '') === 'SEM EQUIPE';
}

function pessoaRemovidaDoEncontro(pessoa) {
    return pessoaSemEquipe(pessoa) && ['negou', 'desistiu'].includes(pessoa?.status);
}

function configurarFiltrosCarografo() {
    ['filtroCarografoEquipe', 'filtroCarografoMovimento', 'filtroCarografoMusical', 'filtroCarografoParoquia', 'filtroCarografoStatus'].forEach((id) => {
        document.getElementById(id)?.addEventListener('change', aplicarFiltrosCarografo);
    });
    document.getElementById('filtroCarografoNome')?.addEventListener('input', aplicarFiltrosCarografo);

    document.getElementById('limparFiltrosCarografo')?.addEventListener('click', () => {
        document.getElementById('filtroCarografoNome').value = '';
        document.getElementById('filtroCarografoParoquia').value = '';
        document.getElementById('filtroCarografoEquipe').value = '';
        document.getElementById('filtroCarografoMovimento').value = '';
        document.getElementById('filtroCarografoMusical').value = '';
        document.getElementById('filtroCarografoStatus').value = '';
        aplicarFiltrosCarografo();
    });

    document.getElementById('baixarRelatorioCarografo')?.addEventListener('click', () => abrirModalStatusDownloadCarografo('excel'));
    document.getElementById('baixarCarografoPdf')?.addEventListener('click', () => abrirModalStatusDownloadCarografo('pdf'));
    document.getElementById('btnConfirmarDownloadCarografo')?.addEventListener('click', confirmarDownloadCarografo);
}

function configurarAtualizacaoCarografoTempoReal() {
    document.querySelectorAll('[data-bs-toggle="tab"][href="#carografo"]').forEach((aba) => {
        aba.addEventListener('shown.bs.tab', () => {
            atualizarCarografoTempoReal();
            iniciarAtualizacaoCarografoTempoReal();
        });
    });

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            pararAtualizacaoCarografoTempoReal();
            return;
        }

        if (carografoEstaAberto()) {
            atualizarCarografoTempoReal();
            iniciarAtualizacaoCarografoTempoReal();
        }
    });

    if (carografoEstaAberto()) {
        iniciarAtualizacaoCarografoTempoReal();
    }
}

function configurarAtualizacaoAbasDirigenteTempoReal() {
    ABAS_DIRIGENTE_TEMPO_REAL.forEach((idAba) => {
        document.querySelectorAll(`[data-bs-toggle="tab"][href="#${idAba}"]`).forEach((aba) => {
            aba.addEventListener('shown.bs.tab', () => {
                atualizarAbaDirigenteTempoReal(idAba);
                iniciarAtualizacaoAbaDirigenteTempoReal();
            });
        });
    });

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            pararAtualizacaoAbaDirigenteTempoReal();
            return;
        }

        const idAba = obterAbaDirigenteTempoRealAberta();
        if (idAba) {
            atualizarAbaDirigenteTempoReal(idAba);
            iniciarAtualizacaoAbaDirigenteTempoReal();
        }
    });

    if (obterAbaDirigenteTempoRealAberta()) {
        iniciarAtualizacaoAbaDirigenteTempoReal();
    }
}

function obterAbaDirigenteTempoRealAberta() {
    return ABAS_DIRIGENTE_TEMPO_REAL.find((idAba) => {
        const aba = document.getElementById(idAba);
        return aba && aba.classList.contains('active') && aba.classList.contains('show');
    }) || '';
}

function iniciarAtualizacaoAbaDirigenteTempoReal() {
    if (intervaloAtualizacaoAbaDirigente || !obterAbaDirigenteTempoRealAberta() || document.hidden) return;

    intervaloAtualizacaoAbaDirigente = setInterval(() => {
        const idAba = obterAbaDirigenteTempoRealAberta();
        if (!idAba || document.hidden) {
            pararAtualizacaoAbaDirigenteTempoReal();
            return;
        }

        atualizarAbaDirigenteTempoReal(idAba);
    }, INTERVALO_ATUALIZACAO_ABAS_DIRIGENTE_MS);
}

function pararAtualizacaoAbaDirigenteTempoReal() {
    if (!intervaloAtualizacaoAbaDirigente) return;
    clearInterval(intervaloAtualizacaoAbaDirigente);
    intervaloAtualizacaoAbaDirigente = null;
}

async function atualizarAbaDirigenteTempoReal(idAba) {
    if (atualizacaoAbaDirigenteEmAndamento || document.hidden) return;

    atualizacaoAbaDirigenteEmAndamento = true;
    try {
        if (idAba === 'relatorio') {
            await carregarRelatorio();
        } else if (idAba === 'situacao') {
            await carregarSituacao();
        } else if (idAba === 'acompanhamentoFaltas') {
            await carregarAcompanhamentoFaltas();
        }
    } finally {
        atualizacaoAbaDirigenteEmAndamento = false;
    }
}

function carografoEstaAberto() {
    const aba = document.getElementById('carografo');
    return Boolean(aba && aba.classList.contains('active') && aba.classList.contains('show'));
}

function iniciarAtualizacaoCarografoTempoReal() {
    if (intervaloAtualizacaoCarografo || !carografoEstaAberto() || document.hidden) return;

    intervaloAtualizacaoCarografo = setInterval(() => {
        if (!carografoEstaAberto() || document.hidden) {
            pararAtualizacaoCarografoTempoReal();
            return;
        }

        atualizarCarografoTempoReal();
    }, INTERVALO_ATUALIZACAO_CAROGRAFO_MS);
}

function pararAtualizacaoCarografoTempoReal() {
    if (!intervaloAtualizacaoCarografo) return;
    clearInterval(intervaloAtualizacaoCarografo);
    intervaloAtualizacaoCarografo = null;
}

async function atualizarCarografoTempoReal() {
    if (atualizacaoCarografoEmAndamento || !carografoEstaAberto() || document.hidden) return;

    atualizacaoCarografoEmAndamento = true;
    try {
        const [responseUsuarios, responseExternos] = await Promise.all([
            fetch(`${API_URL}/dirigentes/usuarios`, { headers: getHeaders() }),
            fetch(`${API_URL}/dirigentes/pessoas-externas`, { headers: getHeaders() })
        ]);

        if (!responseUsuarios.ok || !responseExternos.ok) return;

        const [usuarios, pessoas] = await Promise.all([
            responseUsuarios.json(),
            responseExternos.json()
        ]);

        usuariosCache = (Array.isArray(usuarios) ? usuarios : [])
            .map(aplicarFallbackParóquiaPessoa)
            .sort(ordenarUsuarioPorNome);
        pessoasExternasCache = (Array.isArray(pessoas) ? pessoas : []).sort(ordenarUsuarioPorNome);

        aplicarFiltrosCarografo();
    } catch (err) {
        console.error('Erro ao atualizar carógrafo em tempo real', err);
    } finally {
        atualizacaoCarografoEmAndamento = false;
    }
}

let tipoDownloadCarografoPendente = null;

function abrirModalStatusDownloadCarografo(tipo) {
    tipoDownloadCarografoPendente = tipo;
    const statusConfirmado = document.getElementById('statusDownloadCarografoConfirmado');
    if (statusConfirmado) statusConfirmado.checked = true;
    bootstrap.Modal.getOrCreateInstance(document.getElementById('modalStatusDownloadCarografo')).show();
}

function confirmarDownloadCarografo() {
    const status = document.querySelector('input[name="statusDownloadCarografo"]:checked')?.value || 'confirmado';
    const tipo = tipoDownloadCarografoPendente;
    tipoDownloadCarografoPendente = null;
    bootstrap.Modal.getInstance(document.getElementById('modalStatusDownloadCarografo'))?.hide();

    if (tipo === 'excel') {
        baixarRelatorioCarografoExcel(status);
        return;
    }

    if (tipo === 'pdf') {
        baixarCarografoPdf(status);
    }
}

function aplicarFiltrosCarografo() {
    const termoBusca = normalizarTextoFiltro(document.getElementById('filtroCarografoNome')?.value || '');
    const telefoneBusca = normalizarTelefoneFiltro(document.getElementById('filtroCarografoNome')?.value || '');
    const paroquia = document.getElementById('filtroCarografoParoquia')?.value || '';
    const equipe = document.getElementById('filtroCarografoEquipe')?.value || '';
    const movimento = document.getElementById('filtroCarografoMovimento')?.value || '';
    const musical = document.getElementById('filtroCarografoMusical')?.value || '';
    const status = document.getElementById('filtroCarografoStatus')?.value || '';
    const todasPessoas = obterPessoasCarografo();
    const pessoas = todasPessoas.filter((pessoa) => {
        const toca = pessoa.toca_instrumento === 'sim';
        const canta = pessoa.canta === 'sim';
        const nomePessoa = normalizarTextoFiltro(`${pessoa.nome_completo || ''} ${pessoa.nome_cracha || ''}`);
        const telefonePessoa = normalizarTelefoneFiltro(pessoa.telefone || '');
        const statusPessoa = pessoa.status || 'pendente';

        if (termoBusca && !nomePessoa.includes(termoBusca) && !(telefoneBusca && telefonePessoa.includes(telefoneBusca))) return false;
        if (paroquia && !pessoaPertenceParoquiaFiltro(pessoa, paroquia)) return false;
        if (equipe && (pessoa.equipe || 'SEM EQUIPE') !== equipe) return false;
        if (movimento && pessoa.movimento_origem !== movimento) return false;
        if (status && statusPessoa !== status) return false;
        if (musical === 'canta' && !canta) return false;
        if (musical === 'toca' && !toca) return false;
        if (musical === 'canta_toca' && (!canta || !toca)) return false;
        if (musical === 'canta_ou_toca' && (!canta && !toca)) return false;

        return true;
    });

    atualizarTotalCarografo(pessoas.length, todasPessoas.length);
    renderizarCarografo(pessoas);
}

function atualizarTotalCarografo(totalFiltrado, totalGeral) {
    const painelTotal = document.getElementById('totalCarografo');
    if (!painelTotal) return;

    const existeFiltroAtivo = [
        document.getElementById('filtroCarografoNome')?.value || '',
        document.getElementById('filtroCarografoParoquia')?.value || '',
        document.getElementById('filtroCarografoEquipe')?.value || '',
        document.getElementById('filtroCarografoMovimento')?.value || '',
        document.getElementById('filtroCarografoMusical')?.value || '',
        document.getElementById('filtroCarografoStatus')?.value || ''
    ].some(valor => String(valor).trim());

    painelTotal.innerHTML = existeFiltroAtivo
        ? `Total exibido: <span>${totalFiltrado}</span> de <span>${totalGeral}</span> usuarios`
        : `Total de usuarios inseridos: <span>${totalGeral}</span>`;
}

function pessoaPertenceParoquiaFiltro(pessoa, filtro) {
    const paroquia = normalizarTextoFiltro(obterParoquiaPessoa(pessoa));
    const filtroNormalizado = normalizarTextoFiltro(filtro);
    const paroquiasPadraoNormalizadas = PAROQUIAS_PADRAO.map(normalizarTextoFiltro);

    if (filtroNormalizado === 'OUTRAS') {
        return paroquia && !paroquiasPadraoNormalizadas.includes(paroquia);
    }

    return paroquia === filtroNormalizado;
}

function pertenceNossaSenhoraDaGuia(paroquia) {
    return normalizarTextoFiltro(paroquia) === normalizarTextoFiltro('NOSSA SENHORA DA GUIA');
}

function pertenceSaoPedroESaoPaulo(paroquia) {
    return normalizarTextoFiltro(paroquia) === normalizarTextoFiltro('SAO PEDRO E SAO PAULO');
}

function obterLogoParoquia(paroquia) {
    if (pertenceNossaSenhoraDaGuia(paroquia)) {
        return {
            src: 'assets/logo-nossa-senhora-guia.png',
            alt: 'Paróquia de Nossa Senhora da Guia'
        };
    }

    if (pertenceSaoPedroESaoPaulo(paroquia)) {
        return {
            src: 'assets/logo-sao-pedro-sao-paulo.png',
            alt: 'Paróquia São Pedro e São Paulo'
        };
    }

    return null;
}

function normalizarTextoFiltro(valor) {
    return String(valor || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .trim();
}

function normalizarTelefoneFiltro(valor) {
    return String(valor || '').replace(/\D/g, '');
}

function obterPessoasDownloadCarografo(statusDownload) {
    const statusPermitidos = statusDownload === 'pendente'
        ? ['confirmado', 'pendente']
        : ['confirmado'];

    return obterPessoasCarografo().filter((pessoa) => {
        const statusPessoa = pessoa.status || 'pendente';
        return statusPermitidos.includes(statusPessoa) && !pessoaSemEquipe(pessoa);
    });
}

function obterTextoStatusDownloadCarografo(statusDownload) {
    return statusDownload === 'pendente' ? 'confirmados ou pendentes' : 'confirmados';
}

function baixarRelatorioCarografoExcel(statusDownload = 'confirmado') {
    if (typeof XLSX === 'undefined') {
        mostrarAlerta('alertaDirigentes', 'Biblioteca de Excel não carregada. Verifique a internet e tente novamente.', 'warning');
        return;
    }

    const pessoas = obterPessoasDownloadCarografo(statusDownload);
    if (!pessoas.length) {
        mostrarAlerta('alertaDirigentes', `Nenhum usuário ${obterTextoStatusDownloadCarografo(statusDownload)} para exportar.`, 'warning');
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
                'Nome do crachá': pessoa.nome_cracha || '',
                'Movimento de origem': pessoa.movimento_origem || '',
                'Telefone para contato': pessoa.telefone || '',
                'Perfil de acesso': formatarPerfilAcesso(pessoa.perfil)
            }));

        const worksheet = XLSX.utils.json_to_sheet(linhas, {
            header: [
                'Nome completo',
                'Nome do crachá',
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

function baixarCarografoPdf(statusDownload = 'confirmado') {
    const pessoas = obterPessoasDownloadCarografo(statusDownload);
    if (!pessoas.length) {
        mostrarAlerta('alertaDirigentes', `Nenhum usuario ${obterTextoStatusDownloadCarografo(statusDownload)} para exportar.`, 'warning');
        return;
    }

    const janela = window.open('', '_blank');
    if (!janela) {
        mostrarAlerta('alertaDirigentes', 'Permita pop-ups para gerar o PDF do carografo.', 'warning');
        return;
    }

    const equipes = Array.from(new Set(pessoas.map(pessoa => pessoa.equipe || 'SEM EQUIPE')))
        .sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
    const paginas = equipes.flatMap((equipe) => {
        const pessoasEquipe = pessoas
            .filter(pessoa => (pessoa.equipe || 'SEM EQUIPE') === equipe)
            .sort(ordenarPessoaCarografoPdf);

        return dividirEmBlocosCarografoPdf(pessoasEquipe, 16).map((grupo) => `
            <section class="pagina-equipe">
                <header>
                    <h1>${escapeHtml(equipe)}</h1>
                </header>
                <main class="grade-carografo">${grupo.map(renderizarCardCarografoPdf).join('')}</main>
            </section>
        `);
    }).join('');

    janela.document.open();
    janela.document.write(`<!doctype html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <title>Carografo</title>
    <style>
        * { box-sizing: border-box; }
        body {
            margin: 0;
            background: #eef1f5;
            color: #111827;
            font-family: Arial, Helvetica, sans-serif;
        }
        .barra-acoes {
            display: flex;
            justify-content: center;
            gap: 8px;
            padding: 12px;
            background: #ffffff;
            border-bottom: 1px solid #d6dde8;
            position: sticky;
            top: 0;
            z-index: 2;
        }
        .barra-acoes button {
            border: 0;
            border-radius: 6px;
            padding: 9px 14px;
            background: #1d4ed8;
            color: #ffffff;
            font-weight: 700;
            cursor: pointer;
        }
        .pagina-equipe {
            width: 210mm;
            min-height: 297mm;
            margin: 12px auto;
            padding: 10mm;
            background: #ffffff;
            page-break-after: always;
        }
        .pagina-equipe:last-child { page-break-after: auto; }
        header {
            text-align: center;
            margin-bottom: 7mm;
        }
        h1 {
            margin: 0;
            font-size: 22px;
            line-height: 1.2;
            text-transform: uppercase;
        }
        .grade-carografo {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            grid-auto-rows: 61mm;
            gap: 4mm;
            align-items: stretch;
        }
        .card-carografo {
            border: 1px solid #cfd6e3;
            border-radius: 6px;
            padding: 2.4mm;
            overflow: hidden;
            background-color: #dbeafe;
            break-inside: avoid;
            page-break-inside: avoid;
            text-align: center;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
        }
        .card-carografo-coordenador {
            background-color: #60a5fa;
            border-color: #2563eb;
        }
        .foto {
            width: 34mm;
            height: 34mm;
            object-fit: cover;
            border-radius: 6px;
            display: block;
            margin: 0 auto 2.4mm;
            background: #d1d5db;
        }
        .foto-placeholder {
            width: 34mm;
            height: 34mm;
            border-radius: 6px;
            margin: 0 auto 2.4mm;
            background: #d1d5db;
            color: #4b5563;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 18px;
            font-weight: 700;
        }
        .nome {
            min-height: 8mm;
            font-size: 13px;
            line-height: 1.15;
            font-weight: 700;
            text-transform: uppercase;
            overflow-wrap: anywhere;
        }
        .linha {
            margin-top: 1.8mm;
            font-size: 11.5px;
            line-height: 1.25;
            overflow-wrap: anywhere;
        }
        .contatos-casal {
            margin-top: 1.2mm;
            font-size: 10.8px;
            line-height: 1.15;
        }
        .movimento-origem {
            margin-top: 1.2mm;
            font-weight: 700;
        }
        @media print {
            body { background: #ffffff; }
            .barra-acoes { display: none; }
            .pagina-equipe {
                margin: 0;
                box-shadow: none;
                width: auto;
                min-height: auto;
            }
            @page { size: A4 portrait; margin: 0; }
        }
    </style>
</head>
<body>
    <div class="barra-acoes">
        <button type="button" onclick="window.print()">Baixar PDF</button>
    </div>
    ${paginas}
</body>
</html>`);
    janela.document.close();
    janela.focus();
    setTimeout(() => janela.print(), 700);
}

function renderizarCardCarografoPdf(pessoa) {
    const nomeCracha = pessoa.nome_cracha || pessoa.nome_completo || '-';
    const telefone = formatarTelefoneCarografoPdf(pessoa.telefone || '-');
    const movimento = pessoa.movimento_origem || '-';
    const classeCoordenador = pessoa.perfil === 'coordenador' ? ' card-carografo-coordenador' : '';
    const foto = pessoa.foto_perfil
        ? `<img class="foto" src="${escapeAttr(sanitizarImagemPerfil(pessoa.foto_perfil))}" alt="Foto de ${escapeAttr(nomeCracha)}">`
        : '<div class="foto-placeholder">-</div>';

    return `
        <article class="card-carografo${classeCoordenador}">
            ${foto}
            <div class="nome">${escapeHtml(nomeCracha)}</div>
            ${telefone}
            <div class="linha movimento-origem">${escapeHtml(movimento)}</div>
        </article>
    `;
}

function formatarTelefoneCarografoPdf(telefone) {
    const texto = String(telefone || '').trim();
    const esposa = texto.match(/Esposa:\s*([^|]+)/i)?.[1]?.trim() || '';
    const marido = texto.match(/Marido:\s*(.+)$/i)?.[1]?.trim() || '';

    if (esposa || marido) {
        const linhas = [
            marido ? `Marido: ${escapeHtml(formatarNumeroCarografoPdf(marido))}` : '',
            esposa ? `Esposa: ${escapeHtml(formatarNumeroCarografoPdf(esposa))}` : ''
        ].filter(Boolean);
        return `<div class="linha contatos-casal">${linhas.join('<br>')}</div>`;
    }

    return `<div class="linha">${escapeHtml(formatarNumeroCarografoPdf(texto) || '-')}</div>`;
}

function formatarNumeroCarografoPdf(telefone) {
    const numeros = String(telefone || '').replace(/\D/g, '').replace(/^55/, '');
    if (numeros.length === 11 && numeros.startsWith('83')) {
        const semDdd = numeros.slice(2);
        return `${semDdd.slice(0, 1)} ${semDdd.slice(1, 5)}-${semDdd.slice(5)}`;
    }

    return String(telefone || '').trim();
}

function dividirEmBlocosCarografoPdf(lista, tamanho) {
    const blocos = [];
    for (let indice = 0; indice < lista.length; indice += tamanho) {
        blocos.push(lista.slice(indice, indice + tamanho));
    }
    return blocos;
}

function ordenarPessoaCarografoPdf(a, b) {
    const prioridadeA = obterPrioridadeCarografoPdf(a);
    const prioridadeB = obterPrioridadeCarografoPdf(b);

    if (prioridadeA !== prioridadeB) return prioridadeA - prioridadeB;
    return String(a.nome_cracha || a.nome_completo || '').localeCompare(String(b.nome_cracha || b.nome_completo || ''), 'pt-BR', { sensitivity: 'base' });
}

function obterPrioridadeCarografoPdf(pessoa) {
    if (pessoa.perfil !== 'coordenador') return 10;

    const movimento = String(pessoa.movimento_origem || '').toUpperCase();
    if (movimento === 'EJC') return 0;
    if (movimento === 'ECC' || movimento === 'JOVENS EJC CASADOS') return 1;
    if (movimento === 'ECRI') return 2;
    return 3;
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

function escapeAttr(valor) {
    return escapeHtml(valor).replace(/`/g, '&#096;');
}

function sanitizarImagemPerfil(src) {
    return String(src || '').startsWith('data:image/') ? src : '';
}

function abrirModalResumoUsuário(usuarioId, tipoCadastro = 'usuario') {
    const usuario = tipoCadastro === 'externo'
        ? pessoasExternasCache.find(u => Number(u.id) === Number(usuarioId))
        : usuariosCache.find(u => Number(u.id) === Number(usuarioId));
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
    const pessoaImpedidaServir = Number(usuario.pessoa_impedida_servir || 0) === 1;
    const motivosImpedimentoHtml = renderizarMotivosImpedimentoServir(usuario.pessoa_impedida_motivos);

    titulo.textContent = 'Resumo do Usuário';
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
                <tr><th>Paróquia</th><td>${escapeHtml(obterParoquiaPessoa(usuario) || '-')}</td></tr>
                <tr><th>Movimento</th><td>${escapeHtml(usuario.movimento_origem || '-')}</td></tr>
                <tr><th>Ano do encontro</th><td>${escapeHtml(usuario.ano_encontro || '-')}</td></tr>
                <tr><th>Equipe atual</th><td>${escapeHtml(usuario.equipe || '-')}</td></tr>
                <tr><th>Toca instrumento?</th><td>${formatarSimNao(usuario.toca_instrumento)}</td></tr>
                <tr><th>Instrumentos</th><td>${escapeHtml(usuario.instrumentos || '-')}</td></tr>
                <tr><th>Canta?</th><td>${formatarSimNao(usuario.canta)}</td></tr>
                <tr><th>Equipes que já serviu</th><td>${equipesHtml}</td></tr>
            </tbody>
        </table>
        <div class="form-check mb-3">
            <input class="form-check-input" type="checkbox" id="pessoaImpedidaServirResumo" ${pessoaImpedidaServir ? 'checked disabled' : ''} onchange="atualizarPessoaImpedidaServir(${Number(usuario.id)}, this)">
            <label class="form-check-label" for="pessoaImpedidaServirResumo">Pessoa imperdida de servir no encontro</label>
        </div>
        <div id="motivosImpedimentoServirResumoInfo">${motivosImpedimentoHtml}</div>
        <div class="text-end">
            <button type="button" class="btn btn-primary" onclick="abrirModalEscalar(${Number(usuario.id)}, true, '${tipoCadastro}')">Escalar</button>
        </div>
    `;

    new bootstrap.Modal(modalEl).show();
}

async function atualizarPessoaImpedidaServir(usuarioId, checkbox) {
    const marcado = Boolean(checkbox.checked);
    if (!marcado) {
        checkbox.checked = true;
        mostrarAlerta('alertaDirigentes', 'Somente a área exclusiva pode desmarcar este impedimento.', 'warning');
        return;
    }

    if (marcado) {
        abrirModalMotivoImpedimentoServir(usuarioId, checkbox);
        return;
    }
}

function abrirModalMotivoImpedimentoServir(usuarioId, checkbox) {
    const usuario = usuariosCache.find(item => Number(item.id) === Number(usuarioId)) || {};
    const motivosSalvos = obterMotivosImpedimentoServir(usuario.pessoa_impedida_motivos);
    const modalEl = obterModalMotivoImpedimentoServir();
    const motivos = motivosSalvos.motivos || [];
    const outroMarcado = motivos.includes('Outros');

    modalEl.dataset.confirmado = 'false';
    modalEl.dataset.usuarioId = String(usuarioId);
    modalEl.querySelectorAll('input[name="motivoImpedimentoServir"]').forEach((input) => {
        input.checked = motivos.includes(input.value);
    });
    const outroInput = modalEl.querySelector('#outroMotivoImpedimentoServir');
    const outroCampo = modalEl.querySelector('#campoOutroMotivoImpedimentoServir');
    outroInput.value = motivosSalvos.outro || '';
    outroCampo.style.display = outroMarcado ? 'block' : 'none';

    modalEl.querySelector('#btnSalvarMotivoImpedimentoServir').onclick = () => confirmarMotivoImpedimentoServir(usuarioId, checkbox, modalEl);
    modalEl.addEventListener('hidden.bs.modal', () => {
        if (modalEl.dataset.confirmado !== 'true') {
            checkbox.checked = false;
        }
    }, { once: true });

    bootstrap.Modal.getOrCreateInstance(modalEl).show();
}

function obterModalMotivoImpedimentoServir() {
    let modalEl = document.getElementById('modalMotivoImpedimentoServir');
    if (modalEl) return modalEl;

    document.body.insertAdjacentHTML('beforeend', `
        <div class="modal fade" id="modalMotivoImpedimentoServir" tabindex="-1">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">Motivo do impedimento</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <p class="mb-3">Qual motivo dessa pessoa não poder mais servir nos encontros?</p>
                        <div class="form-check mb-2">
                            <input class="form-check-input" type="checkbox" name="motivoImpedimentoServir" id="motivoSeparacaoCasal" value="Separação do casal">
                            <label class="form-check-label" for="motivoSeparacaoCasal">Separação do casal</label>
                        </div>
                        <div class="form-check mb-2">
                            <input class="form-check-input" type="checkbox" name="motivoImpedimentoServir" id="motivoNaoMovimentos" value="Não faz parte dos movimentos">
                            <label class="form-check-label" for="motivoNaoMovimentos">Não faz parte dos movimentos</label>
                        </div>
                        <div class="form-check mb-2">
                            <input class="form-check-input" type="checkbox" name="motivoImpedimentoServir" id="motivoSemCasamentoIgreja" value="Não tem casamento na Igreja">
                            <label class="form-check-label" for="motivoSemCasamentoIgreja">Não tem casamento na Igreja</label>
                        </div>
                        <div class="form-check mb-3">
                            <input class="form-check-input" type="checkbox" name="motivoImpedimentoServir" id="motivoOutros" value="Outros">
                            <label class="form-check-label" for="motivoOutros">Outros.</label>
                        </div>
                        <div id="campoOutroMotivoImpedimentoServir" style="display:none;">
                            <label class="form-label" for="outroMotivoImpedimentoServir">Informe o motivo</label>
                            <textarea class="form-control" id="outroMotivoImpedimentoServir" rows="3"></textarea>
                        </div>
                        <div class="alert alert-warning mt-3 mb-0" id="alertaMotivoImpedimentoServir" style="display:none;"></div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button>
                        <button type="button" class="btn btn-primary" id="btnSalvarMotivoImpedimentoServir">Salvar</button>
                    </div>
                </div>
            </div>
        </div>
    `);

    modalEl = document.getElementById('modalMotivoImpedimentoServir');
    modalEl.querySelector('#motivoOutros').addEventListener('change', (e) => {
        modalEl.querySelector('#campoOutroMotivoImpedimentoServir').style.display = e.target.checked ? 'block' : 'none';
    });
    return modalEl;
}

async function confirmarMotivoImpedimentoServir(usuarioId, checkbox, modalEl) {
    const motivos = Array.from(modalEl.querySelectorAll('input[name="motivoImpedimentoServir"]:checked'))
        .map(input => input.value);
    const outro = modalEl.querySelector('#outroMotivoImpedimentoServir').value.trim();
    const alerta = modalEl.querySelector('#alertaMotivoImpedimentoServir');

    if (!motivos.length) {
        alerta.textContent = 'Selecione ao menos um motivo.';
        alerta.style.display = 'block';
        return;
    }

    if (motivos.includes('Outros') && !outro) {
        alerta.textContent = 'Informe o motivo em Outros.';
        alerta.style.display = 'block';
        return;
    }

    alerta.style.display = 'none';
    const sucesso = await salvarPessoaImpedidaServir(usuarioId, checkbox, {
        pessoa_impedida_servir: true,
        motivos_impedimento_servir: motivos,
        outro_motivo_impedimento_servir: outro
    });

    if (sucesso) {
        modalEl.dataset.confirmado = 'true';
        bootstrap.Modal.getInstance(modalEl)?.hide();
    }
}

async function salvarPessoaImpedidaServir(usuarioId, checkbox, payload) {
    const marcado = Boolean(payload.pessoa_impedida_servir);
    checkbox.disabled = true;

    try {
        const response = await fetch(`${API_URL}/dirigentes/usuarios/${usuarioId}/impedimento-servir`, {
            method: 'PUT',
            headers: getHeaders(),
            body: JSON.stringify(payload)
        });
        const data = await response.json();

        if (!response.ok) {
            checkbox.checked = !marcado;
            mostrarAlerta('alertaDirigentes', data.erro || 'Erro ao atualizar informação.', 'danger');
            return false;
        }

        usuariosCache = usuariosCache.map(usuario => Number(usuario.id) === Number(usuarioId)
            ? { ...usuario, pessoa_impedida_servir: data.pessoa_impedida_servir, pessoa_impedida_motivos: data.pessoa_impedida_motivos }
            : usuario);
        checkbox.checked = marcado;
        const info = document.getElementById('motivosImpedimentoServirResumoInfo');
        if (info) {
            info.innerHTML = renderizarMotivosImpedimentoServir(data.pessoa_impedida_motivos);
        }
        mostrarAlerta('alertaDirigentes', 'Informação atualizada com sucesso!', 'success');
        return true;
    } catch (err) {
        checkbox.checked = !marcado;
        mostrarAlerta('alertaDirigentes', 'Erro ao atualizar informação.', 'danger');
        console.error(err);
        return false;
    } finally {
        checkbox.disabled = marcado;
    }
}

function obterMotivosImpedimentoServir(valor) {
    if (!valor) return { motivos: [], outro: '' };
    if (typeof valor === 'object') {
        return {
            motivos: Array.isArray(valor.motivos) ? valor.motivos : [],
            outro: valor.outro || '',
            cadastrado_por_nome: valor.cadastrado_por_nome || ''
        };
    }

    try {
        const dados = JSON.parse(valor);
        return {
            motivos: Array.isArray(dados.motivos) ? dados.motivos : [],
            outro: dados.outro || '',
            cadastrado_por_nome: dados.cadastrado_por_nome || ''
        };
    } catch (err) {
        return { motivos: [], outro: '' };
    }
}

function renderizarMotivosImpedimentoServir(valor) {
    const dados = obterMotivosImpedimentoServir(valor);
    if (!dados.motivos.length && !dados.outro && !dados.cadastrado_por_nome) return '';

    const motivos = [...dados.motivos];
    if (dados.outro && motivos.includes('Outros')) {
        motivos[motivos.indexOf('Outros')] = `Outros: ${dados.outro}`;
    }

    return `
        <div class="border-top pt-2 mb-3 small">
            <div><strong>Motivo:</strong> ${escapeHtml(motivos.join(', ') || '-')}</div>
            <div><strong>Cadastrado por:</strong> ${escapeHtml(dados.cadastrado_por_nome || '-')}</div>
        </div>
    `;
}

function formatarMotivoImpedimentoServirCard(valor) {
    const dados = obterMotivosImpedimentoServir(valor);
    const motivos = [...dados.motivos];
    if (dados.outro && motivos.includes('Outros')) {
        motivos[motivos.indexOf('Outros')] = `Outros: ${dados.outro}`;
    }
    return motivos.join(', ') || '-';
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
    if (valor === 'nao') return 'Não';
    return '-';
}

function obterStatusBadge(status) {
    const mapa = {
        confirmado: '<span class="badge bg-success">Confirmado</span>',
        pendente: '<span class="badge bg-warning">Pendente</span>',
        ressarcido: '<span class="badge bg-secondary">Ressarcido</span>',
        cancelado: '<span class="badge bg-secondary">Cancelado</span>',
        contato_errado: '<span class="badge bg-dark">Contato errado</span>',
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
                ? `<img src="${escapeAttr(sanitizarImagemPerfil(p.foto_perfil))}" alt="Foto" class="foto-clickable" title="Clique para ampliar" style="width:30px; height:30px; border-radius:50%; object-fit:cover; cursor:pointer;" onclick="abrirModalFotoGrande(this.src)">`
                : `<div style="width:30px; height:30px; border-radius:50%; background:#ccc; display:flex; align-items:center; justify-content:center; font-size:10px;">-</div>`;
            
            const badge = obterStatusBadge(p.status);
            htmlPagamentos += `<tr><td>${fotoHtml}</td><td>${p.nome_completo}</td><td>${p.tipo}</td><td>R$ ${p.valor.toFixed(2)}</td><td>${badge}</td></tr>`;
        });
        htmlPagamentos += '</tbody></table>';
        document.getElementById('tabelaPagamentosSituacao').innerHTML = htmlPagamentos;
        
        // Tabela de blusas
        let htmlBlusas = '<table class="table table-sm"><thead><tr><th>Foto</th><th>Usuário</th><th>Tamanho</th><th>Status</th></tr></thead><tbody>';
        data.blusas.forEach(b => {
            const fotoHtml = b.foto_perfil 
                ? `<img src="${escapeAttr(sanitizarImagemPerfil(b.foto_perfil))}" alt="Foto" class="foto-clickable" title="Clique para ampliar" style="width:30px; height:30px; border-radius:50%; object-fit:cover; cursor:pointer;" onclick="abrirModalFotoGrande(this.src)">`
                : `<div style="width:30px; height:30px; border-radius:50%; background:#ccc; display:flex; align-items:center; justify-content:center; font-size:10px;">-</div>`;
            
            const badge = obterStatusBadge(b.status);
            htmlBlusas += `<tr><td>${fotoHtml}</td><td>${b.nome_completo}</td><td>${b.tamanho}</td><td>${badge}</td></tr>`;
        });
        htmlBlusas += '</tbody></table>';
        document.getElementById('tabelaBlusasSituacao').innerHTML = htmlBlusas;
    } catch (err) {
        console.error(err);
    }
}

// Abrir modal para escalar usuário ou pessoa sem cadastro
function abrirModalEscalar(usuarioId, fecharResumo = false, tipoCadastro = 'usuario') {
    if (fecharResumo) {
        const modalResumo = bootstrap.Modal.getInstance(document.getElementById('modalFoto'));
        if (modalResumo) {
            modalResumo.hide();
        }
    }

    // Resetar o formulário
    document.getElementById('formEscalar').reset();
    document.getElementById('usuarioIdEscalar').value = usuarioId;
    document.getElementById('tipoCadastroEscalar').value = tipoCadastro;
    document.getElementById('nomeEquipe').value = '';
    document.getElementById('nomeEquipe').required = false;
    document.getElementById('acaoEscalarDiv').style.display = 'block';
    document.getElementById('acaoEscalar').value = '';
    document.getElementById('equipeDiv').style.display = 'none';

    if (tipoCadastro === 'externo') {
        document.getElementById('acaoEscalarDiv').style.display = 'none';
        document.getElementById('acaoEscalar').value = 'equipe';
        document.getElementById('equipeDiv').style.display = 'block';
        document.getElementById('nomeEquipe').required = true;
    }
    
    setTimeout(() => {
        const modal = new bootstrap.Modal(document.getElementById('modalEscalar'));
        modal.show();
    }, fecharResumo ? 250 : 0);
}

// Salvar escalação
document.getElementById('formEscalar')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const usuarioId = document.getElementById('usuarioIdEscalar').value;
    const tipoCadastro = document.getElementById('tipoCadastroEscalar')?.value || 'usuario';
    const acao = tipoCadastro === 'externo' ? 'equipe' : document.getElementById('acaoEscalar').value;
    
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
            url = tipoCadastro === 'externo'
                ? `${API_URL}/dirigentes/pessoas-externas/${usuarioId}/equipe`
                : `${API_URL}/dirigentes/escalar-equipe/${usuarioId}`;
            body = { equipe: nomeEquipe };
        }
        
        const response = await fetch(url, {
            method: 'PUT',
            headers: getHeaders(),
            body: JSON.stringify(body)
        });
        
        if (response.ok) {
            mostrarAlerta('alertaDirigentes', tipoCadastro === 'externo' ? 'Pessoa sem cadastro escalada com sucesso!' : 'Usuário escalado com sucesso!', 'success');
            bootstrap.Modal.getInstance(document.getElementById('modalEscalar')).hide();
            await carregarUsuários();
            await carregarPessoasExternas();
            carregarRelatorio();
            carregarSituacao();
            carregarReunioes();
        } else {
            const erro = await response.json();
            mostrarAlerta('alertaDirigentes', erro.erro || 'Erro ao escalar usuário', 'danger');
        }
    } catch (err) {
        mostrarAlerta('alertaDirigentes', 'Erro ao escalar usuário', 'danger');
        console.error(err);
    }
});

document.getElementById('btnEnviarLinkConfirmacaoEscalar')?.addEventListener('click', enviarLinkConfirmacaoModalEscalar);
document.getElementById('btnConfirmarDestinatarioConfirmacao')?.addEventListener('click', enviarLinkConfirmacaoDestinatarioCasal);

let envioConfirmacaoCasalPendente = null;

async function enviarLinkConfirmacaoModalEscalar() {
    const participanteId = Number(document.getElementById('usuarioIdEscalar').value);
    const tipoCadastro = document.getElementById('tipoCadastroEscalar')?.value || 'usuario';
    const participante = obterParticipanteEscalar(participanteId, tipoCadastro);

    if (!participante) {
        mostrarAlerta('alertaDirigentes', 'Participante não encontrado para envio do link.', 'warning');
        return;
    }

    if (movimentoOrigemCasalDirigente(participante.movimento_origem || participante.movimento || '')) {
        abrirModalDestinatarioConfirmacaoCasal(participanteId, tipoCadastro, participante);
        return;
    }

    const telefone = limparTelefoneWhatsAppDirigente(participante.telefone || '');
    if (!telefone) {
        mostrarAlerta('alertaDirigentes', 'Telefone WhatsApp inválido para este participante.', 'warning');
        return;
    }

    await enviarLinkConfirmacaoParticipanteDirigente(participanteId, tipoCadastro, participante, telefone);
}

async function enviarLinkConfirmacaoDestinatarioCasal() {
    if (!envioConfirmacaoCasalPendente) return;

    const destinatario = document.querySelector('input[name="destinatarioConfirmacaoCasal"]:checked')?.value || '';
    const telefone = envioConfirmacaoCasalPendente.telefones?.[destinatario] || '';

    if (!telefone) {
        mostrarAlerta('alertaDirigentes', 'Escolha um telefone valido para enviar o link.', 'warning');
        return;
    }

    bootstrap.Modal.getInstance(document.getElementById('modalEscolherDestinatarioConfirmacao'))?.hide();

    const { participanteId, tipoCadastro, participante } = envioConfirmacaoCasalPendente;
    envioConfirmacaoCasalPendente = null;
    await enviarLinkConfirmacaoParticipanteDirigente(participanteId, tipoCadastro, participante, telefone);
}

async function enviarLinkConfirmacaoParticipanteDirigente(participanteId, tipoCadastro, participante, telefone) {
    const janelaWhatsApp = abrirJanelaWhatsAppPendenteDirigente();
    try {
        const response = await fetch(`${API_URL}/coordenador/participantes-equipe/${tipoCadastro}/${participanteId}/token-confirmacao`, {
            method: 'POST',
            headers: getHeaders()
        });
        const data = await response.json();

        if (!response.ok || !data.token_confirmacao) {
            fecharJanelaWhatsAppPendenteDirigente(janelaWhatsApp);
            mostrarAlerta('alertaDirigentes', data.erro || 'Erro ao gerar link de confirmação.', 'danger');
            return;
        }

        const origem = (window.SISTEMA_ECRI_CONFIG && window.SISTEMA_ECRI_CONFIG.appBaseUrl) || (window.location.protocol === 'file:' ? 'http://localhost:5000' : window.location.origin);
        const linkConfirmacao = data.link_confirmacao || `${origem}/frontend/confirmacao.html?token=${encodeURIComponent(data.token_confirmacao)}`;
        const mensagem = `Olá ${participante.nome_completo || participante.nome_cracha || ''},
Ficamos muito felizes pelo seu sim!
Precisamos que você atualize seus dados em nosso sistema.
Por favor, confirme seus dados no seguinte link:

${linkConfirmacao}`;

        abrirWhatsAppComJanelaDirigente(janelaWhatsApp, `https://wa.me/55${telefone}?text=${encodeURIComponent(mensagem)}`);
    } catch (err) {
        fecharJanelaWhatsAppPendenteDirigente(janelaWhatsApp);
        mostrarAlerta('alertaDirigentes', 'Erro ao gerar link de confirmação.', 'danger');
        console.error(err);
    }
}

function abrirModalDestinatarioConfirmacaoCasal(participanteId, tipoCadastro, participante) {
    const telefones = obterTelefonesCasalDirigente(participante.telefone || '');

    if (!telefones.esposa && !telefones.marido) {
        mostrarAlerta('alertaDirigentes', 'Telefone WhatsApp invalido para este participante.', 'warning');
        return;
    }

    envioConfirmacaoCasalPendente = { participanteId, tipoCadastro, participante, telefones };

    const radioEsposa = document.getElementById('destinatarioConfirmacaoEsposa');
    const radioMarido = document.getElementById('destinatarioConfirmacaoMarido');
    const textoEsposa = document.getElementById('telefoneConfirmacaoEsposaTexto');
    const textoMarido = document.getElementById('telefoneConfirmacaoMaridoTexto');

    if (radioEsposa) {
        radioEsposa.checked = Boolean(telefones.esposa);
        radioEsposa.disabled = !telefones.esposa;
    }

    if (radioMarido) {
        radioMarido.checked = !telefones.esposa && Boolean(telefones.marido);
        radioMarido.disabled = !telefones.marido;
    }

    if (textoEsposa) textoEsposa.textContent = telefones.esposa ? `(${telefones.esposa})` : '(sem telefone)';
    if (textoMarido) textoMarido.textContent = telefones.marido ? `(${telefones.marido})` : '(sem telefone)';

    bootstrap.Modal.getInstance(document.getElementById('modalEscalar'))?.hide();
    bootstrap.Modal.getOrCreateInstance(document.getElementById('modalEscolherDestinatarioConfirmacao')).show();
}

function abrirJanelaWhatsAppPendenteDirigente() {
    const janela = window.open('', '_blank');
    if (janela) {
        janela.document.write('<p style="font-family:Arial,sans-serif;padding:16px;">Abrindo WhatsApp...</p>');
    }
    return janela;
}

function abrirWhatsAppComJanelaDirigente(janela, url) {
    if (janela && !janela.closed) {
        janela.location.href = url;
        return;
    }

    window.location.href = url;
}

function fecharJanelaWhatsAppPendenteDirigente(janela) {
    if (janela && !janela.closed) {
        janela.close();
    }
}

function obterParticipanteEscalar(participanteId, tipoCadastro) {
    const lista = tipoCadastro === 'externo' ? pessoasExternasCache : usuariosCache;
    return lista.find(item => Number(item.id) === Number(participanteId));
}

function limparTelefoneWhatsAppDirigente(telefone) {
    const grupos = String(telefone || '').match(/\d{10,13}/g) || [];
    const numero = grupos[0] || String(telefone || '').replace(/\D/g, '');
    const numeroSemPais = numero.replace(/^55/, '');
    return /^\d{10,11}$/.test(numeroSemPais) ? numeroSemPais : '';
}

function obterTelefonesCasalDirigente(telefone) {
    const texto = String(telefone || '');
    const esposa = limparTelefoneWhatsAppDirigente(texto.match(/Esposa:\s*([^|]+)/i)?.[1] || '');
    const marido = limparTelefoneWhatsAppDirigente(texto.match(/Marido:\s*(.+)$/i)?.[1] || '');

    if (esposa || marido) {
        return { esposa, marido };
    }

    const grupos = texto.match(/\d{10,13}/g) || [];
    return {
        esposa: limparTelefoneWhatsAppDirigente(grupos[0] || ''),
        marido: limparTelefoneWhatsAppDirigente(grupos[1] || '')
    };
}

// Mostrar campo de equipe quando necessário
document.getElementById('acaoEscalar')?.addEventListener('change', (e) => {
    const equipeDiv = document.getElementById('equipeDiv');
    const nomeEquipe = document.getElementById('nomeEquipe');
    const mostrarEquipe = e.target.value === 'equipe';
    equipeDiv.style.display = mostrarEquipe ? 'block' : 'none';
    nomeEquipe.required = mostrarEquipe;
    if (!mostrarEquipe) {
        nomeEquipe.value = '';
    }
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
                ? `<img src="${escapeAttr(sanitizarImagemPerfil(r.foto_perfil))}" alt="Foto" title="Clique para ampliar" style="width:50px; height:50px; border-radius:50%; object-fit:cover; margin-right:10px; cursor:pointer;" onclick="abrirModalFotoGrande(this.src)">`
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

async function carregarAcompanhamentoFaltas() {
    const container = document.getElementById('listaEquipesFaltas');
    if (!container) return;

    try {
        const response = await fetch(`${API_URL}/dirigentes/acompanhamento-faltas/equipes`, {
            headers: getHeaders()
        });
        const equipes = await response.json();

        if (!response.ok) {
            container.innerHTML = `<div class="alert alert-danger">${escapeHtml(equipes.erro || 'Erro ao carregar equipes.')}</div>`;
            return;
        }

        if (!equipes.length) {
            container.innerHTML = '<div class="alert alert-info">Nenhuma equipe cadastrada.</div>';
            return;
        }

        const linhas = equipes.map(item => `
            <tr>
                <td><strong>${escapeHtml(item.equipe)}</strong></td>
                <td>${Number(item.total_usuarios || 0)}</td>
                <td>
                    <button type="button" class="btn btn-sm btn-primary" onclick="abrirAcompanhamentoFaltasEquipe('${escapeAttr(item.equipe)}')">
                        Acompanhar faltas
                    </button>
                </td>
            </tr>
        `).join('');

        container.innerHTML = `
            <table class="table table-hover align-middle">
                <thead>
                    <tr>
                        <th>Equipe</th>
                        <th>Usuários</th>
                        <th>Ação</th>
                    </tr>
                </thead>
                <tbody>${linhas}</tbody>
            </table>
        `;
    } catch (err) {
        console.error(err);
        container.innerHTML = '<div class="alert alert-danger">Erro ao carregar acompanhamento de faltas.</div>';
    }
}

async function abrirAcompanhamentoFaltasEquipe(equipe) {
    const modalEl = document.getElementById('modalAcompanhamentoFaltas');
    const titulo = document.getElementById('tituloModalAcompanhamentoFaltas');
    const conteudo = document.getElementById('conteudoModalAcompanhamentoFaltas');
    if (!modalEl || !titulo || !conteudo) return;

    const equipeNome = String(equipe || '');
    titulo.textContent = `Acompanhamento de Faltas - ${equipeNome}`;
    conteudo.innerHTML = '<div class="alert alert-info mb-0">Carregando usuários...</div>';
    new bootstrap.Modal(modalEl).show();

    try {
        const response = await fetch(`${API_URL}/dirigentes/acompanhamento-faltas/equipes/${encodeURIComponent(equipeNome)}`, {
            headers: getHeaders()
        });
        const data = await response.json();

        if (!response.ok) {
            conteudo.innerHTML = `<div class="alert alert-danger">${escapeHtml(data.erro || 'Erro ao carregar usuários da equipe.')}</div>`;
            return;
        }

        renderizarModalAcompanhamentoFaltas(data.equipe || equipeNome, data.usuarios || []);
    } catch (err) {
        console.error(err);
        conteudo.innerHTML = '<div class="alert alert-danger">Erro ao carregar usuários da equipe.</div>';
    }
}

function renderizarModalAcompanhamentoFaltas(equipe, usuarios) {
    const conteudo = document.getElementById('conteudoModalAcompanhamentoFaltas');
    if (!conteudo) return;

    if (!usuarios.length) {
        conteudo.innerHTML = `<div class="alert alert-info mb-0">Nenhum usuário encontrado na equipe ${escapeHtml(equipe)}.</div>`;
        return;
    }

    const totais = usuarios.reduce((acc, usuario) => {
        acc.presencas += Number(usuario.total_presencas || 0);
        acc.faltasJustificadas += Number(usuario.total_faltas_justificadas || 0);
        acc.faltas += Number(usuario.total_faltas || 0);
        return acc;
    }, { presencas: 0, faltasJustificadas: 0, faltas: 0 });

    const linhas = usuarios.map(usuario => {
        const fotoHtml = usuario.foto_perfil
            ? `<img src="${escapeAttr(sanitizarImagemPerfil(usuario.foto_perfil))}" alt="Foto de ${escapeAttr(usuario.nome_completo || '')}" title="Clique para ampliar" style="width:44px; height:44px; border-radius:50%; object-fit:cover; cursor:pointer;" onclick="abrirModalFotoGrande(this.src)">`
            : '<div style="width:44px; height:44px; border-radius:50%; background:#e9ecef; display:flex; align-items:center; justify-content:center;">-</div>';

        return `
            <tr>
                <td>${fotoHtml}</td>
                <td>
                    <strong>${escapeHtml(usuario.nome_cracha || usuario.nome_completo || '-')}</strong>
                    <br><small class="text-muted">${escapeHtml(usuario.nome_completo || '')}</small>
                </td>
                <td><span class="badge bg-success">${Number(usuario.total_presencas || 0)}</span></td>
                <td><span class="badge bg-warning text-dark">${Number(usuario.total_faltas_justificadas || 0)}</span></td>
                <td><span class="badge bg-danger">${Number(usuario.total_faltas || 0)}</span></td>
            </tr>
        `;
    }).join('');

    conteudo.innerHTML = `
        <div class="row g-2 mb-3">
            <div class="col-md-4">
                <div class="alert alert-success mb-0 py-2"><strong>Presenças:</strong> ${totais.presencas}</div>
            </div>
            <div class="col-md-4">
                <div class="alert alert-warning mb-0 py-2"><strong>Faltas justificadas:</strong> ${totais.faltasJustificadas}</div>
            </div>
            <div class="col-md-4">
                <div class="alert alert-danger mb-0 py-2"><strong>Faltas:</strong> ${totais.faltas}</div>
            </div>
        </div>
        <div class="table-responsive">
            <table class="table table-hover align-middle mb-0">
                <thead>
                    <tr>
                        <th>Foto</th>
                        <th>Usuário</th>
                        <th>Presenças</th>
                        <th>Faltas justificadas</th>
                        <th>Faltas</th>
                    </tr>
                </thead>
                <tbody>${linhas}</tbody>
            </table>
        </div>
    `;
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
    modalEl.querySelector('.modal-title').textContent = 'Foto do Usuário';
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
    return otimizarFotoPerfil(arquivo);
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
    return fotoPerfilTipoAceito(arquivo) && arquivo.size <= TAMANHO_MAXIMO_FOTO_BYTES;
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
