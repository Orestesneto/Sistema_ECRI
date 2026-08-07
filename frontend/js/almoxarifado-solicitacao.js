(function () {
    let itensDisponiveis = [];
    let minhasSolicitacoes = [];
    let itensSelecionados = [];

    document.addEventListener('DOMContentLoaded', () => {
        const form = document.getElementById('formSolicitacaoAlmoxarifado');
        if (!form) return;
        form.addEventListener('submit', enviarSolicitacao);
        document.getElementById('btnAdicionarItemSolicitacaoAlmox').addEventListener('click', adicionarItem);
        const hoje = new Date().toISOString().slice(0, 10);
        const retirada = document.getElementById('solicitacaoAlmoxDataRetirada');
        const devolucao = document.getElementById('solicitacaoAlmoxData');
        retirada.min = hoje;
        devolucao.min = hoje;
        retirada.addEventListener('change', () => {
            limparItensSelecionados();
            devolucao.min = retirada.value || hoje;
            if (devolucao.value && devolucao.value < retirada.value) devolucao.value = retirada.value;
            carregarItensPorPeriodo();
        });
        devolucao.addEventListener('change', () => {
            limparItensSelecionados();
            carregarItensPorPeriodo();
        });
        document.querySelector('[href="#solicitacaoAlmoxarifado"]')?.addEventListener('shown.bs.tab', carregarDados);
        renderizarItensSelecionados();
        carregarDados();
    });

    async function carregarDados() {
        try {
            const respostaSolicitacoes = await fetch(`${API_URL}/almoxarifado/minhas-solicitacoes`, { headers: getHeaders() });
            if (!respostaSolicitacoes.ok) throw new Error('Falha ao carregar dados');
            minhasSolicitacoes = await respostaSolicitacoes.json();
            await carregarItensPorPeriodo();
            renderizarSolicitacoes();
        } catch (err) {
            console.error(err);
            exibirMensagem('Erro ao carregar solicitações do almoxarifado', 'danger');
        }
    }

    async function carregarItensPorPeriodo() {
        const inicio = document.getElementById('solicitacaoAlmoxDataRetirada').value;
        const fim = document.getElementById('solicitacaoAlmoxData').value;
        if (!inicio || !fim || fim < inicio) {
            itensDisponiveis = [];
            renderizarItens();
            return;
        }
        try {
            const response = await fetch(`${API_URL}/almoxarifado/itens?inicio=${encodeURIComponent(inicio)}&fim=${encodeURIComponent(fim)}`, { headers: getHeaders() });
            if (!response.ok) throw new Error('Falha ao consultar disponibilidade');
            itensDisponiveis = (await response.json()).filter(item => Number(item.estoque_disponivel) > 0);
            renderizarItens();
        } catch (err) {
            console.error(err);
            exibirMensagem('Erro ao consultar itens disponíveis para o período', 'danger');
        }
    }

    function renderizarItens() {
        const select = document.getElementById('solicitacaoAlmoxItem');
        const valor = select.value;
        const datasPreenchidas = document.getElementById('solicitacaoAlmoxDataRetirada').value && document.getElementById('solicitacaoAlmoxData').value;
        select.disabled = !datasPreenchidas;
        select.innerHTML = `<option value="">${datasPreenchidas ? 'Selecione um item...' : 'Selecione as datas...'}</option>` + itensDisponiveis.filter(item =>
            !itensSelecionados.some(selecionado => selecionado.item_id === Number(item.id))
        ).map(item =>
            `<option value="${Number(item.id)}">${escapar(item.nome)} — ${Number(item.estoque_disponivel)} disponível(is)</option>`
        ).join('');
        if (itensDisponiveis.some(item => String(item.id) === valor)) select.value = valor;
    }

    function adicionarItem() {
        const itemId = Number(document.getElementById('solicitacaoAlmoxItem').value);
        const quantidade = Number(document.getElementById('solicitacaoAlmoxQuantidade').value);
        const item = itensDisponiveis.find(registro => Number(registro.id) === itemId);
        if (!item || !Number.isInteger(quantidade) || quantidade <= 0) {
            exibirMensagem('Selecione um item e informe uma quantidade válida', 'warning');
            return;
        }
        if (quantidade > Number(item.estoque_disponivel)) {
            exibirMensagem(`Há somente ${Number(item.estoque_disponivel)} unidade(s) disponível(is) nesse período`, 'warning');
            return;
        }
        itensSelecionados.push({ item_id: itemId, quantidade, nome: item.nome });
        document.getElementById('solicitacaoAlmoxItem').value = '';
        document.getElementById('solicitacaoAlmoxQuantidade').value = '1';
        renderizarItensSelecionados();
        renderizarItens();
    }

    function renderizarItensSelecionados() {
        const container = document.getElementById('itensSolicitacaoAlmoxarifado');
        container.innerHTML = itensSelecionados.length
            ? `<div class="border rounded p-2"><strong>Itens desta solicitação</strong>${itensSelecionados.map((item, indice) => `<div class="d-flex justify-content-between align-items-center border-top mt-2 pt-2"><span>${escapar(item.nome)} — <strong>${item.quantidade}</strong></span><button type="button" class="btn btn-sm btn-outline-danger btn-remover-item-solicitacao-almox" data-indice="${indice}">Remover</button></div>`).join('')}</div>`
            : '<div class="small text-muted">Adicione um ou mais itens à solicitação.</div>';
        container.querySelectorAll('.btn-remover-item-solicitacao-almox').forEach(botao => {
            botao.addEventListener('click', () => removerItem(Number(botao.dataset.indice)));
        });
    }

    function removerItem(indice) {
        itensSelecionados.splice(indice, 1);
        renderizarItensSelecionados();
        renderizarItens();
    }

    function limparItensSelecionados() {
        itensSelecionados = [];
        renderizarItensSelecionados();
    }

    function renderizarSolicitacoes() {
        const container = document.getElementById('minhasSolicitacoesAlmoxarifado');
        if (!minhasSolicitacoes.length) {
            container.innerHTML = '<div class="alert alert-info">Você ainda não possui solicitações.</div>';
            return;
        }
        const status = {
            solicitado: ['warning text-dark', 'Aguardando entrega'],
            entregue: ['primary', 'Entregue'],
            parcialmente_devolvido: ['info text-dark', 'Devolução parcial'],
            devolvido: ['success', 'Devolvido'],
            cancelado: ['secondary', 'Cancelado']
        };
        container.innerHTML = minhasSolicitacoes.map(protocolo => {
            const [cor, texto] = status[protocolo.status] || ['secondary', protocolo.status];
            const itens = (protocolo.itens || []).map(item => `${escapar(item.nome)}: ${Number(item.quantidade)}`).join(', ');
            const cancelar = protocolo.status === 'solicitado'
                ? `<button type="button" class="btn btn-sm btn-outline-danger btn-cancelar-solicitacao-almox" data-cancelar-solicitacao="${Number(protocolo.id)}">Cancelar</button>` : '';
            return `<div class="card mb-3"><div class="card-body">
                <div class="d-flex flex-wrap justify-content-between gap-2"><h5 class="mb-0">Solicitação #${Number(protocolo.id)}</h5><span class="badge bg-${cor}">${texto}</span></div>
                <p class="mb-1 mt-2"><strong>Item:</strong> ${itens}</p><p class="mb-1"><strong>Finalidade:</strong> ${escapar(protocolo.finalidade)}</p>
                <p class="small text-muted mb-2">Solicitada em ${formatarDataHora(protocolo.data_criacao)}${protocolo.data_prevista_retirada ? ` · Retirada: ${formatarData(protocolo.data_prevista_retirada)}` : ''}${protocolo.data_prevista_devolucao ? ` · Devolução: ${formatarData(protocolo.data_prevista_devolucao)}` : ''}</p>${cancelar}
            </div></div>`;
        }).join('');
        container.querySelectorAll('.btn-cancelar-solicitacao-almox').forEach(botao => {
            botao.addEventListener('click', () => cancelarSolicitacao(Number(botao.dataset.cancelarSolicitacao)));
        });
    }

    async function enviarSolicitacao(evento) {
        evento.preventDefault();
        if (!itensSelecionados.length) {
            exibirMensagem('Adicione ao menos um item à solicitação', 'warning');
            return;
        }
        const dados = {
            itens: itensSelecionados.map(({ item_id, quantidade }) => ({ item_id, quantidade })),
            finalidade: document.getElementById('solicitacaoAlmoxFinalidade').value.trim(),
            data_prevista_retirada: document.getElementById('solicitacaoAlmoxDataRetirada').value,
            data_prevista_devolucao: document.getElementById('solicitacaoAlmoxData').value,
            observacao: document.getElementById('solicitacaoAlmoxObservacao').value.trim()
        };
        const sucesso = await executar('/almoxarifado/solicitacoes', 'POST', dados);
        if (sucesso) {
            evento.target.reset();
            itensSelecionados = [];
            renderizarItensSelecionados();
            document.getElementById('solicitacaoAlmoxQuantidade').value = '1';
            await carregarDados();
        }
    }

    async function cancelarSolicitacao(id) {
        if (!confirm(`Deseja cancelar a solicitação #${id}?`)) return;
        if (await executar(`/almoxarifado/minhas-solicitacoes/${id}/cancelar`, 'PUT', {})) await carregarDados();
    }

    async function executar(caminho, metodo, dados) {
        try {
            const response = await fetch(`${API_URL}${caminho}`, { method: metodo, headers: getHeaders(), body: JSON.stringify(dados) });
            const resultado = await response.json().catch(() => ({}));
            if (!response.ok) {
                exibirMensagem(resultado.erro || 'Não foi possível concluir a solicitação', 'danger');
                return false;
            }
            exibirMensagem(resultado.mensagem || 'Solicitação registrada', 'success');
            return true;
        } catch (err) {
            console.error(err);
            exibirMensagem('Erro de comunicação com o almoxarifado', 'danger');
            return false;
        }
    }

    function exibirMensagem(mensagem, tipo) {
        const alertaId = document.getElementById('alertaEquipista') ? 'alertaEquipista' : 'alertaCoordenador';
        if (typeof mostrarAlerta === 'function') mostrarAlerta(alertaId, mensagem, tipo);
    }

    function escapar(valor) {
        const div = document.createElement('div');
        div.textContent = String(valor || '');
        return div.innerHTML;
    }

    function formatarData(valor) {
        const match = String(valor || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
        return match ? `${match[3]}/${match[2]}/${match[1]}` : '-';
    }

    function formatarDataHora(valor) {
        const data = new Date(valor);
        return Number.isNaN(data.getTime()) ? '-' : data.toLocaleString('pt-BR');
    }
})();
