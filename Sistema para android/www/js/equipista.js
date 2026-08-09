const API_URL = 'https://sistema-ecri.vercel.app/api';
const TAMANHO_MAXIMO_FOTO_MB = 3;
const TAMANHO_MAXIMO_FOTO_BYTES = TAMANHO_MAXIMO_FOTO_MB * 1024 * 1024;
const ABA_ATUAL_EQUIPISTA_KEY = 'equipistaAbaAtual';
const PERCENTUAL_TAXA_CARTAO = 0.08;
const PERCENTUAL_TAXA_PIX = 0.01;
let linkCheckoutCartaoAtual = '';
let ultimoResumoPixPagamento = null;
let pagamentoMonitoradoId = null;
let intervaloMonitoramentoPagamento = null;
let tentativasMonitoramentoPagamento = 0;
let valorBlusasPendentesPagamento = 0;
const TAXAS_POR_MOVIMENTO = {
    EC: 25,
    EJC: 25,
    ECC: 35,
    'JOVENS EJC CASADOS': 35,
    ECRI: 15
};
let movimentoOrigemUsuário = '';

// Verificar se está autenticado
if (!getToken()) {
    window.location.href = 'index.html';
}

// Carregar dados ao abrir a página
document.addEventListener('DOMContentLoaded', () => {
    const usuario = JSON.parse(localStorage.getItem('usuario'));
    document.getElementById('nomeUsuário').textContent = usuario.nome_completo;
    renderizarCamposExperiencia('camposExperienciaEquipista', 'equipista');
    configurarCampoParoquia('paroquia', 'campoOutraParoquia');
    configurarRestricaoSimNao('temRestricaoMedica', 'campoRestricaoMedica', 'restricaoMedica');
    configurarRestricaoSimNao('temRestricaoAlimentar', 'campoRestricaoAlimentar', 'restricaoAlimentar');
    configurarRestricaoSimNao('temRestricaoMedicacao', 'campoRestricaoMedicacao', 'restricaoMedicacao');
    configurarPersistenciaAbas(ABA_ATUAL_EQUIPISTA_KEY);
    
    carregarPerfil();
});

// Carregar perfil do equipista
async function carregarPerfil() {
    try {
        const usuarioLocal = JSON.parse(localStorage.getItem('usuario') || '{}');
        const [response, responseConfig] = await Promise.all([
            fetch(`${API_URL}/equipista/perfil`, { headers: getHeaders() }),
            fetch(`${API_URL}/equipista/configuracoes-dashboard`, { headers: getHeaders() })
        ]);
        
        const usuario = await response.json();
        const configuracoes = await responseConfig.json();
        const equipeUsuario = usuario.equipe || usuarioLocal.equipe || '';
        const revelacaoEquipesAconteceu = responseConfig.ok ? Boolean(configuracoes.reuniao_revelacao_equipes) : true;

        configurarAbasPorEquipe(equipeUsuario, revelacaoEquipesAconteceu, Number(usuario.lista_espera || 0) === 1);
        localStorage.setItem('usuario', JSON.stringify({
            ...usuarioLocal,
            equipe: equipeUsuario
        }));
        
        document.getElementById('email').value = usuario.email;
        document.getElementById('nomeCompleto').value = usuario.nome_completo;
        document.getElementById('nomeCracha').value = usuario.nome_cracha || '';
        document.getElementById('telefone').value = usuario.telefone;
        preencherParoquia('paroquia', 'outraParoquia', 'campoOutraParoquia', usuario.paroquia);
        movimentoOrigemUsuário = usuario.movimento_origem || '';
        marcarMovimentoOrigem('movimento', usuario.movimento_origem);
        document.getElementById('anoEncontro').value = usuario.ano_encontro || '';
        preencherRestricaoSimNao('temRestricaoMedica', 'campoRestricaoMedica', 'restricaoMedica', usuario.restricao_medica || '');
        preencherRestricaoSimNao('temRestricaoAlimentar', 'campoRestricaoAlimentar', 'restricaoAlimentar', usuario.restricao_alimentar || '');
        preencherRestricaoSimNao('temRestricaoMedicacao', 'campoRestricaoMedicacao', 'restricaoMedicacao', usuario.restricao_medicacao || '');
        carregarExperienciaPerfil('equipista', usuario);
        atualizarValorPagamento();
        
        if (usuario.foto_perfil) {
            document.getElementById('fotoPreview').src = usuario.foto_perfil;
            document.getElementById('fotoPreview').style.display = 'block';
        }

        if (usuarioEscalado(equipeUsuario) && revelacaoEquipesAconteceu) {
            carregarStatus();
        }
    } catch (err) {
        console.error(err);
    }
}

function usuarioEscalado(equipe) {
    const equipeNormalizada = String(equipe || '').trim().toLowerCase();
    return equipeNormalizada && equipeNormalizada !== 'sem equipe';
}

function configurarAbasPorEquipe(equipe, revelacaoEquipesAconteceu = true, listaEspera = false) {
    const escalado = usuarioEscalado(equipe);
    const abasLiberadas = escalado && revelacaoEquipesAconteceu && !listaEspera;
    document.getElementById('abaSolicitarBlusa')?.classList.toggle('d-none', !abasLiberadas);
    document.getElementById('abaPagamentoOnline')?.classList.toggle('d-none', !abasLiberadas);
    document.getElementById('abaStatus')?.classList.toggle('d-none', !abasLiberadas);
    document.getElementById('blusa')?.classList.toggle('d-none', !abasLiberadas);
    document.getElementById('pagamentoOnline')?.classList.toggle('d-none', !abasLiberadas);
    document.getElementById('status')?.classList.toggle('d-none', !abasLiberadas);

    if (!abasLiberadas) {
        const abaPerfil = document.querySelector('a[href="#meuPerfil"]');
        if (abaPerfil && window.bootstrap?.Tab) {
            bootstrap.Tab.getOrCreateInstance(abaPerfil).show();
        }
        localStorage.setItem(ABA_ATUAL_EQUIPISTA_KEY, 'meuPerfil');
        return;
    }

    abrirAbaPersistida(ABA_ATUAL_EQUIPISTA_KEY, 'meuPerfil');
}

// Atualizar perfil
document.getElementById('formPerfil')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const nomeCracha = document.getElementById('nomeCracha').value;
    const paroquia = obterParoquia('paroquia', 'outraParoquia');
    const movimento = obterMovimentoOrigem('movimento');
    const anoEncontro = somenteNumeros(document.getElementById('anoEncontro').value);
    const restricaoMedica = obterRestricaoSimNao('temRestricaoMedica', 'restricaoMedica', 'restrição médica');
    const restricaoAlimentar = obterRestricaoSimNao('temRestricaoAlimentar', 'restricaoAlimentar', 'restrição alimentar');
    const restricaoMedicacao = obterRestricaoSimNao('temRestricaoMedicacao', 'restricaoMedicacao', 'restrição à medicação');

    if (restricaoMedica.erro || restricaoAlimentar.erro || restricaoMedicacao.erro) {
        mostrarAlerta('alertaEquipista', restricaoMedica.erro || restricaoAlimentar.erro || restricaoMedicacao.erro, 'warning');
        return;
    }
    const fotoPerfil = document.getElementById('fotoPerfil').files[0];
    
    let fotoBase64 = null;

    if (!anoEncontroValido(anoEncontro)) {
        mostrarAlerta('alertaEquipista', 'Informe um ano do encontro válido', 'warning');
        return;
    }

    if (!paroquiaValida(paroquia)) {
        mostrarAlerta('alertaEquipista', 'Informe a paróquia à qual você pertence', 'warning');
        return;
    }
    
    if (fotoPerfil) {
        if (!fotoDentroDoLimite(fotoPerfil)) {
            mostrarAlerta('alertaEquipista', `A foto deve ser JPG, JPEG, PNG, HEIF ou WEBP e ter no máximo ${TAMANHO_MAXIMO_FOTO_MB}MB`, 'warning');
            return;
        }

        try {
            fotoBase64 = await converterParaBase64(fotoPerfil);
        } catch (err) {
            mostrarAlerta('alertaEquipista', err.message || 'Erro ao otimizar a foto', 'warning');
            return;
        }
        document.getElementById('fotoPreview').src = fotoBase64;
        document.getElementById('fotoPreview').style.display = 'block';
    }
    
    try {
        const response = await fetch(`${API_URL}/equipista/perfil`, {
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
                ...obterExperienciaPerfil('equipista')
            })
        });
        
        if (response.ok) {
            movimentoOrigemUsuário = movimento;
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

document.querySelectorAll('input[name="tipoPagamento"]').forEach((radio) => {
    radio.addEventListener('change', atualizarValorPagamento);
});
document.getElementById('anoEncontro')?.addEventListener('input', limitarCampoNumerico);
document.querySelectorAll('input[name="formaPagamentoOnline"]').forEach((radio) => {
    radio.addEventListener('change', atualizarAvisoTaxaCartao);
});
atualizarAvisoTaxaCartao();

function atualizarValorPagamento() {
    const tipo = obterTipoPagamentoSelecionado();
    const valorInput = document.getElementById('valorPagamento');

    if (tipo === 'taxa') {
        const valorTaxa = TAXAS_POR_MOVIMENTO[movimentoOrigemUsuário] || '';
        valorInput.value = valorTaxa;
        valorInput.readOnly = true;
        return;
    }

    if (tipo === 'blusa') {
        valorInput.value = valorBlusasPendentesPagamento || 0;
        valorInput.readOnly = true;
        return;
    }

    if (tipo === 'taxa_blusa') {
        const valorTaxa = Number(TAXAS_POR_MOVIMENTO[movimentoOrigemUsuário] || 0);
        valorInput.value = valorTaxa + Number(valorBlusasPendentesPagamento || 0);
        valorInput.readOnly = true;
        return;
    }

    valorInput.readOnly = true;
    valorInput.value = '';
}

function atualizarAvisoTaxaCartao() {
    const aviso = document.getElementById('avisoTaxaCartao');
    if (!aviso) return;

    const formaPagamento = document.querySelector('input[name="formaPagamentoOnline"]:checked')?.value || '';
    if (formaPagamento === 'cartao_credito') {
        aviso.textContent = 'Pagamentos por cartao de credito terao acrescimo de 8% referente a taxa da maquineta.';
        aviso.style.display = 'block';
        return;
    }

    if (formaPagamento === 'pix') {
        aviso.textContent = 'Pagamentos via PIX terao acrescimo de 1% referente a taxa da maquineta.';
        aviso.style.display = 'block';
        return;
    }

    aviso.style.display = 'none';
}

// Solicitar pagamento
document.getElementById('formPagamento')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const tipo = obterTipoPagamentoSelecionado();
    const valor = parseFloat(document.getElementById('valorPagamento').value);
    const formaPagamento = document.querySelector('input[name="formaPagamentoOnline"]:checked')?.value || '';

    await solicitarPagamentoEquipista(tipo, valor, formaPagamento);
});

function obterTipoPagamentoSelecionado() {
    return document.querySelector('input[name="tipoPagamento"]:checked')?.value || 'taxa';
}

function atualizarDisponibilidadePagamentoBlusa() {
    const possuiBlusaPendente = Number(valorBlusasPendentesPagamento || 0) > 0;
    const radioTaxa = document.getElementById('tipoPagamentoTaxa');
    const radioBlusa = document.getElementById('tipoPagamentoBlusa');
    const radioTaxaBlusa = document.getElementById('tipoPagamentoTaxaBlusa');

    if (radioBlusa) radioBlusa.disabled = !possuiBlusaPendente;
    if (radioTaxaBlusa) radioTaxaBlusa.disabled = !possuiBlusaPendente;

    if (!possuiBlusaPendente && ['blusa', 'taxa_blusa'].includes(obterTipoPagamentoSelecionado())) {
        if (radioTaxa) radioTaxa.checked = true;
    }
    atualizarValorPagamento();
}

async function solicitarPagamentoEquipista(tipo, valor, formaPagamento) {
    if (formaPagamento === 'pix') {
        const continuar = confirm('O pagamento via PIX tera acrescimo de 1% referente a taxa da maquineta. Deseja continuar?');
        if (!continuar) return;
    }

    try {
        const response = await fetch(`${API_URL}/equipista/solicitar-pagamento`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ tipo, valor, forma_pagamento: formaPagamento })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            mostrarAlerta('alertaEquipista', data.ja_existia ? data.mensagem : 'Pagamento solicitado com sucesso!', data.ja_existia ? 'warning' : 'success');
            const linkPagamento = data.init_point || data.sandbox_init_point || '';
            if (data.id && !data.ja_existia) {
                iniciarMonitoramentoPagamento(data.id);
            }
            if (data.pix_qr_code) {
                renderizarPixPagamentoMercadoPago(data);
                abrirModalPix({
                    codigoPix: data.pix_qr_code,
                    qrCodeBase64: data.pix_qr_code_base64,
                    valorBase: data.valor_base,
                    acrescimoPix: data.acrescimo_pix,
                    valorFinal: data.valor_final || data.valor
                });
            } else {
                renderizarLinkPagamentoMercadoPago(linkPagamento);
            }
            if (linkPagamento && data.forma_pagamento === 'cartao_credito') {
                abrirModalCartao({
                    linkPagamento,
                    valorBase: data.valor_base,
                    acrescimoCartao: data.acrescimo_cartao,
                    valorFinal: data.valor_final || data.valor
                });
            }
            document.getElementById('formPagamento').reset();
            atualizarValorPagamento();
            atualizarAvisoTaxaCartao();
            carregarStatus();
        } else {
            mostrarAlerta('alertaEquipista', data.erro, 'danger');
        }
    } catch (err) {
            mostrarAlerta('alertaEquipista', 'Erro ao solicitar pagamento', 'danger');
            console.error(err);
        }
}

function iniciarMonitoramentoPagamento(pagamentoId) {
    pagamentoMonitoradoId = Number(pagamentoId);
    tentativasMonitoramentoPagamento = 0;
    if (intervaloMonitoramentoPagamento) {
        clearInterval(intervaloMonitoramentoPagamento);
    }

    intervaloMonitoramentoPagamento = setInterval(verificarPagamentoMonitorado, 5000);
    setTimeout(verificarPagamentoMonitorado, 2000);
}

function pararMonitoramentoPagamento() {
    if (intervaloMonitoramentoPagamento) {
        clearInterval(intervaloMonitoramentoPagamento);
        intervaloMonitoramentoPagamento = null;
    }
    pagamentoMonitoradoId = null;
    tentativasMonitoramentoPagamento = 0;
}

async function verificarPagamentoMonitorado() {
    if (!pagamentoMonitoradoId) return;
    tentativasMonitoramentoPagamento += 1;

    try {
        const response = await fetch(`${API_URL}/equipista/status`, {
            headers: getHeaders()
        });
        const data = await response.json();

        if (!response.ok) return;

        const pagamento = (data.pagamentos || []).find((item) => Number(item.id) === Number(pagamentoMonitoradoId));
        if (pagamento?.status === 'confirmado') {
            pararMonitoramentoPagamento();
            carregarStatus();
            abrirModalPagamentoAprovado();
            return;
        }
    } catch (err) {
        console.error(err);
    }

    if (tentativasMonitoramentoPagamento >= 120) {
        pararMonitoramentoPagamento();
    }
}

function abrirModalPagamentoAprovado() {
    ['modalPagamentoPix', 'modalPagamentoCartao', 'modalCheckoutCartao'].forEach((id) => {
        const modal = bootstrap.Modal.getInstance(document.getElementById(id));
        if (modal) modal.hide();
    });

    new bootstrap.Modal(document.getElementById('modalPagamentoAprovado')).show();
}

function renderizarLinkPagamentoMercadoPago(linkPagamento) {
    const container = document.getElementById('resultadoPagamentoMercadoPago');
    if (!container) return;

    if (!linkPagamento) {
        container.innerHTML = '<div class="alert alert-warning mb-0">Pagamento criado, mas o link do Mercado Pago não foi retornado.</div>';
        return;
    }

    container.innerHTML = `
        <div class="alert alert-info mb-0">
            Pagamento criado no Mercado Pago.
            <button type="button" class="btn btn-sm btn-outline-primary ms-2" onclick="abrirModalCartaoCodificado('${encodeURIComponent(linkPagamento)}')">Pagar com o cartão</button>
        </div>
    `;
}

function abrirModalCartaoCodificado(linkPagamento, valorFinal = '', valorBase = '', acrescimoCartao = '') {
    abrirModalCartao({
        linkPagamento: decodeURIComponent(linkPagamento || ''),
        valorFinal: valorFinal ? Number(decodeURIComponent(valorFinal)) : undefined,
        valorBase: valorBase ? Number(decodeURIComponent(valorBase)) : undefined,
        acrescimoCartao: acrescimoCartao ? Number(decodeURIComponent(acrescimoCartao)) : undefined
    });
}

function abrirModalCartao({ linkPagamento, valorBase, acrescimoCartao, valorFinal }) {
    const modalEl = document.getElementById('modalPagamentoCartao');
    const botao = document.getElementById('botaoPagarCartao');
    if (!modalEl || !botao || !linkPagamento) return;

    const valores = normalizarValoresCartao(valorBase, acrescimoCartao, valorFinal);
    document.getElementById('cartaoValorBase').textContent = formatarMoedaEquipista(valores.valorBase);
    document.getElementById('cartaoTaxa').textContent = formatarMoedaEquipista(valores.acrescimoCartao);
    document.getElementById('cartaoValorFinal').textContent = formatarMoedaEquipista(valores.valorFinal);
    linkCheckoutCartaoAtual = linkPagamento;

    new bootstrap.Modal(modalEl).show();
}

document.getElementById('botaoPagarCartao')?.addEventListener('click', () => {
    abrirModalCheckoutCartao(linkCheckoutCartaoAtual);
});

document.getElementById('modalCheckoutCartao')?.addEventListener('hidden.bs.modal', () => {
    const iframe = document.getElementById('iframeCheckoutCartao');
    if (iframe) iframe.removeAttribute('src');
});

function abrirModalCheckoutCartao(linkPagamento) {
    const modalResumoEl = document.getElementById('modalPagamentoCartao');
    const modalCheckoutEl = document.getElementById('modalCheckoutCartao');
    const iframe = document.getElementById('iframeCheckoutCartao');
    const linkExterno = document.getElementById('linkCheckoutCartaoExterno');
    if (!modalCheckoutEl || !iframe || !linkPagamento) return;

    const modalResumo = bootstrap.Modal.getInstance(modalResumoEl);
    if (modalResumo) modalResumo.hide();

    iframe.src = linkPagamento;
    if (linkExterno) linkExterno.href = linkPagamento;

    new bootstrap.Modal(modalCheckoutEl).show();
}

function normalizarValoresCartao(valorBase, acrescimoCartao, valorFinal) {
    const finalInformado = Number(valorFinal || 0);
    const baseInformada = Number(valorBase || 0);
    const taxaInformada = Number(acrescimoCartao || 0);

    if (baseInformada > 0 || taxaInformada > 0) {
        return {
            valorBase: baseInformada,
            acrescimoCartao: taxaInformada,
            valorFinal: finalInformado || baseInformada + taxaInformada
        };
    }

    if (finalInformado > 0) {
        const valorBaseCalculado = finalInformado / (1 + PERCENTUAL_TAXA_CARTAO);
        return {
            valorBase: valorBaseCalculado,
            acrescimoCartao: finalInformado - valorBaseCalculado,
            valorFinal: finalInformado
        };
    }

    return { valorBase: 0, acrescimoCartao: 0, valorFinal: 0 };
}

function renderizarPixPagamentoMercadoPago(pagamento) {
    const container = document.getElementById('resultadoPagamentoMercadoPago');
    if (!container) return;
    ultimoResumoPixPagamento = pagamento || null;

    container.innerHTML = `
        <div class="alert alert-info mb-0">
            PIX gerado no Mercado Pago.
            <button type="button" class="btn btn-sm btn-outline-primary ms-2" onclick="abrirModalPixCodificado('${encodeURIComponent(pagamento.pix_qr_code || '')}', '${encodeURIComponent(pagamento.pix_qr_code_base64 || '')}')">Ver código PIX</button>
        </div>
    `;
}

function abrirModalPixCodificado(codigoPix, qrCodeBase64 = '', valorFinal = '', valorBase = '', acrescimoPix = '') {
    const resumoAtual = ultimoResumoPixPagamento || {};
    abrirModalPix({
        codigoPix: decodeURIComponent(codigoPix || ''),
        qrCodeBase64: decodeURIComponent(qrCodeBase64 || ''),
        valorFinal: valorFinal ? Number(decodeURIComponent(valorFinal)) : Number(resumoAtual.valor_final || resumoAtual.valor || 0),
        valorBase: valorBase ? Number(decodeURIComponent(valorBase)) : Number(resumoAtual.valor_base || 0),
        acrescimoPix: acrescimoPix ? Number(decodeURIComponent(acrescimoPix)) : Number(resumoAtual.acrescimo_pix || 0)
    });
}

function abrirModalPix({ codigoPix, qrCodeBase64 = '', valorBase, acrescimoPix, valorFinal }) {
    const campoCodigo = document.getElementById('pixCopiaCola');
    const imagem = document.getElementById('pixQrCodeImagem');
    const alerta = document.getElementById('alertaCopiaPix');

    if (!campoCodigo || !imagem) return;

    const valores = normalizarValoresPix(valorBase, acrescimoPix, valorFinal);
    document.getElementById('pixValorBase').textContent = formatarMoedaEquipista(valores.valorBase);
    document.getElementById('pixTaxa').textContent = formatarMoedaEquipista(valores.acrescimoPix);
    document.getElementById('pixValorFinal').textContent = formatarMoedaEquipista(valores.valorFinal);
    campoCodigo.value = codigoPix || '';
    alerta.style.display = 'none';

    if (qrCodeBase64) {
        imagem.src = `data:image/png;base64,${qrCodeBase64}`;
        imagem.style.display = 'inline-block';
    } else {
        imagem.removeAttribute('src');
        imagem.style.display = 'none';
    }

    const modal = new bootstrap.Modal(document.getElementById('modalPagamentoPix'));
    modal.show();
}

function normalizarValoresPix(valorBase, acrescimoPix, valorFinal) {
    const finalInformado = Number(valorFinal || 0);
    const baseInformada = Number(valorBase || 0);
    const taxaInformada = Number(acrescimoPix || 0);

    if (baseInformada > 0 || taxaInformada > 0) {
        return {
            valorBase: baseInformada,
            acrescimoPix: taxaInformada,
            valorFinal: finalInformado || baseInformada + taxaInformada
        };
    }

    if (finalInformado > 0) {
        const valorBaseCalculado = finalInformado / (1 + PERCENTUAL_TAXA_PIX);
        return {
            valorBase: valorBaseCalculado,
            acrescimoPix: finalInformado - valorBaseCalculado,
            valorFinal: finalInformado
        };
    }

    return { valorBase: 0, acrescimoPix: 0, valorFinal: 0 };
}

document.getElementById('botaoCopiarPix')?.addEventListener('click', async () => {
    const campoCodigo = document.getElementById('pixCopiaCola');
    const alerta = document.getElementById('alertaCopiaPix');
    const codigo = campoCodigo?.value || '';
    if (!codigo) return;

    try {
        await navigator.clipboard.writeText(codigo);
    } catch (err) {
        campoCodigo.select();
        document.execCommand('copy');
    }

    if (alerta) {
        alerta.style.display = 'block';
        setTimeout(() => { alerta.style.display = 'none'; }, 2500);
    }
});

// Carregar status de pagamentos e blusas
async function carregarStatus() {
    try {
        const response = await fetch(`${API_URL}/equipista/status`, {
            headers: getHeaders()
        });
        
        const data = await response.json();
        
        let htmlPagamentos = '<table class="table table-sm"><thead><tr><th>Tipo</th><th>Valor</th><th>Forma</th><th>Status</th><th>Ação</th></tr></thead><tbody>';
        data.pagamentos.forEach(p => {
            const badge = obterBadgeStatusPagamentoEquipista(p.status);
            const linkPagamento = p.mercado_pago_init_point || p.mercado_pago_sandbox_init_point || '';
            let acao = '-';
            if (p.status === 'pendente') {
                const botaoPix = p.forma_pagamento === 'pix' && p.pix_qr_code
                    ? `<button type="button" class="btn btn-sm btn-success" onclick="abrirModalPixCodificado('${encodeURIComponent(p.pix_qr_code || '')}', '${encodeURIComponent(p.pix_qr_code_base64 || '')}', '${encodeURIComponent(p.valor || '')}')">PIX</button>`
                    : `<button type="button" class="btn btn-sm btn-outline-success" onclick="pagarItemPendente('${escapeAttr(p.tipo)}', 'pix', ${Number(p.valor || 0)})">PIX</button>`;
                const botaoCartao = p.forma_pagamento === 'cartao_credito' && linkPagamento
                    ? `<button type="button" class="btn btn-sm btn-success" onclick="abrirModalCartaoCodificado('${encodeURIComponent(linkPagamento)}', '${encodeURIComponent(p.valor || '')}')">Cartão</button>`
                    : `<button type="button" class="btn btn-sm btn-outline-success" onclick="pagarItemPendente('${escapeAttr(p.tipo)}', 'cartao_credito', ${Number(p.valor || 0)})">Cartão</button>`;
                acao = `<div class="d-flex flex-wrap gap-1">${botaoPix}${botaoCartao}</div>`;
            }
            htmlPagamentos += `<tr><td>${p.tipo}</td><td>${formatarMoedaEquipista(p.valor)}</td><td>${formatarFormaPagamentoEquipista(p.forma_pagamento)}</td><td>${badge}</td><td>-</td></tr>`;
        });
        htmlPagamentos += '</tbody></table>';
        document.getElementById('listaPagamentos').innerHTML = htmlPagamentos;
        
        const resumoBlusas = data.resumo_blusas || {};
        valorBlusasPendentesPagamento = Number(resumoBlusas.pendente || 0);
        atualizarDisponibilidadePagamentoBlusa();
        const pagamentoBlusaPendente = (data.pagamentos || [])
            .find(p => p.tipo === 'blusa' && p.status === 'pendente') || null;
        const valorPendenteBlusas = Number(resumoBlusas.pendente || 0);
        let htmlBlusas = `
            <div class="row g-2 mb-2">
                <div class="col-md-4">
                    <div class="alert alert-light border mb-0 py-2"><strong>Total:</strong> ${formatarMoedaEquipista(resumoBlusas.total || 0)}</div>
                </div>
                <div class="col-md-4">
                    <div class="alert alert-success mb-0 py-2"><strong>Pago:</strong> ${formatarMoedaEquipista(resumoBlusas.pago || 0)}</div>
                </div>
                <div class="col-md-4">
                    <div class="alert alert-warning mb-0 py-2"><strong>A pagar:</strong> ${formatarMoedaEquipista(resumoBlusas.pendente || 0)}</div>
                </div>
            </div>
            <table class="table table-sm"><thead><tr><th>Tamanho</th><th>Valor</th><th>Status</th><th>Confirmação</th></tr></thead><tbody>
        `;
        htmlBlusas = htmlBlusas.replace('</tr></thead><tbody>', '<th>Ação</th></tr></thead><tbody>');
        const pedidosBlusaBloqueadosStatus = Boolean(data.configuracoes_blusa?.pedidos_bloqueados);
        data.blusas.forEach(b => {
            const badge = obterBadgeStatusPagamentoEquipista(b.status);
            htmlBlusas += `<tr><td>${renderizarCampoTamanhoBlusaStatus(b, pedidosBlusaBloqueadosStatus)}</td><td>${formatarMoedaEquipista(b.valor)}</td><td>${badge}</td><td>${obterTextoConfirmacaoBlusaEquipista(b)}</td><td>${renderizarAcaoBlusaStatus(b, pedidosBlusaBloqueadosStatus, pagamentoBlusaPendente, valorPendenteBlusas)}</td></tr>`;
        });
        htmlBlusas += '</tbody></table>';
        document.getElementById('listaBlusas').innerHTML = htmlBlusas;
    } catch (err) {
        console.error(err);
    }
}

function obterTamanhosBlusaEquipista() {
    return Array.from(document.querySelectorAll('#tamanho option'))
        .map(option => option.value)
        .filter(Boolean);
}

function renderizarAcaoBlusaStatus(blusa, bloqueado) {
    if (!blusa?.id) return '-';
    if (blusa.status === 'confirmado') return '-';
    if (bloqueado) return '<span class="text-muted small">Cancelamento encerrado</span>';

    return `<button type="button" class="btn btn-sm btn-outline-danger" onclick="cancelarPedidoBlusaStatus(${Number(blusa.id)})">Cancelar</button>`;
}

function renderizarCampoTamanhoBlusaStatus(blusa, bloqueado) {
    if (!blusa?.id) return escapeHtml(blusa?.tamanho || '-');
    const atualizadoPor = escapeHtml(blusa.tamanho_atualizado_por_nome || 'Sem registro');
    const atualizadoEm = blusa.tamanho_atualizado_em ? ` em ${escapeHtml(formatarDataHoraEquipista(blusa.tamanho_atualizado_em))}` : '';
    const textoAtualizacao = `<small class="text-muted d-block mt-1">Tamanho salvo por ${atualizadoPor}${atualizadoEm}</small>`;

    if (bloqueado) {
        return `
            <select class="form-select form-select-sm" disabled title="Pedidos de blusa encerrados">
                <option>${escapeHtml(blusa.tamanho || '-')}</option>
            </select>
            ${textoAtualizacao}
        `;
    }

    const opcoes = obterTamanhosBlusaEquipista().map(tamanho => `
        <option value="${escapeAttr(tamanho)}" ${tamanho === blusa.tamanho ? 'selected' : ''}>${escapeHtml(tamanho)}</option>
    `).join('');

    return `
        <select class="form-select form-select-sm" onchange="alterarTamanhoBlusaStatus(${Number(blusa.id)}, this.value, '${escapeAttr(blusa.tamanho || '')}')">
            ${opcoes}
        </select>
        ${textoAtualizacao}
    `;
}

async function alterarTamanhoBlusaStatus(solicitacaoId, tamanho, tamanhoAnterior) {
    if (!solicitacaoId || !tamanho || tamanho === tamanhoAnterior) return;

    try {
        const response = await fetch(`${API_URL}/equipista/solicitacoes-blusa/${solicitacaoId}/tamanho`, {
            method: 'PUT',
            headers: getHeaders(),
            body: JSON.stringify({ tamanho })
        });
        const data = await response.json().catch(() => ({}));

        if (response.ok) {
            mostrarAlerta('alertaEquipista', 'Tamanho da camisa atualizado.', 'success');
            carregarStatus();
        } else {
            mostrarAlerta('alertaEquipista', data.erro || 'Erro ao atualizar tamanho da camisa', 'danger');
            carregarStatus();
        }
    } catch (err) {
        mostrarAlerta('alertaEquipista', 'Erro ao atualizar tamanho da camisa', 'danger');
        console.error(err);
        carregarStatus();
    }
}

async function cancelarPedidoBlusaStatus(solicitacaoId) {
    if (!solicitacaoId) return;
    if (!confirm('Deseja cancelar este pedido de camisa?')) return;

    try {
        const response = await fetch(`${API_URL}/equipista/solicitacoes-blusa/${solicitacaoId}`, {
            method: 'DELETE',
            headers: getHeaders()
        });
        const data = await response.json().catch(() => ({}));

        if (response.ok) {
            mostrarAlerta('alertaEquipista', 'Pedido de camisa cancelado.', 'success');
            carregarStatus();
        } else {
            mostrarAlerta('alertaEquipista', data.erro || 'Erro ao cancelar pedido de camisa', 'danger');
            carregarStatus();
        }
    } catch (err) {
        mostrarAlerta('alertaEquipista', 'Erro ao cancelar pedido de camisa', 'danger');
        console.error(err);
        carregarStatus();
    }
}

async function pagarItemPendente(tipo, formaPagamento, valorAtual) {
    await solicitarPagamentoEquipista(tipo, Number(valorAtual || 0), formaPagamento);
}

function formatarMoedaEquipista(valor) {
    return Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatarFormaPagamentoEquipista(forma) {
    const mapa = {
        pix: 'PIX',
        cartao_credito: 'Cartão de Crédito',
        dinheiro: 'Dinheiro'
    };
    return mapa[forma] || '-';
}

function obterBadgeStatusPagamentoEquipista(status) {
    const mapa = {
        confirmado: '<span class="badge bg-success">Confirmado</span>',
        pendente: '<span class="badge bg-warning text-dark">Pendente</span>',
        ressarcido: '<span class="badge bg-secondary">Ressarcido</span>',
        estornado: '<span class="badge bg-secondary">Estornado</span>',
        cancelado: '<span class="badge bg-secondary">Cancelado</span>'
    };
    return mapa[status] || `<span class="badge bg-secondary">${escapeHtml(status || '-')}</span>`;
}

function obterTextoConfirmacaoBlusaEquipista(blusa) {
    if (!blusa || blusa.status !== 'confirmado') return '-';

    const detalhes = [];
    const confirmadoPor = blusa.confirmado_por_nome || blusa.confirmado_por_cracha;
    const origem = blusa.origem_confirmacao || (blusa.confirmado_por ? 'coordenador' : 'mercado_pago');

    if (origem === 'coordenador') {
        detalhes.push('<strong>Confirmado via coordenador</strong>');
        if (confirmadoPor) detalhes.push(`<small>Por ${escapeHtml(confirmadoPor)}</small>`);
    } else {
        detalhes.push('<strong>Confirmado via Mercado Pago</strong>');
        const forma = formatarFormaPagamentoEquipista(blusa.forma_pagamento);
        if (forma !== '-') detalhes.push(`<small>${escapeHtml(forma)}</small>`);
    }

    if (blusa.data_confirmacao) {
        detalhes.push(`<small>Em ${formatarDataHoraEquipista(blusa.data_confirmacao)}</small>`);
    }

    return `<div>${detalhes.join('<br>')}</div>`;
}

function formatarDataHoraEquipista(valor) {
    if (!valor) return '-';
    return new Date(valor).toLocaleString('pt-BR');
}

function escapeHtml(valor) {
    return String(valor || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function escapeAttr(valor) {
    return escapeHtml(valor).replace(/`/g, '&#096;');
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
