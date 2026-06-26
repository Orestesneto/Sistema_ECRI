const FOTO_PERFIL_TIPOS_ACEITOS = ['image/jpeg', 'image/png', 'image/webp', 'image/heif', 'image/heic'];
const FOTO_PERFIL_EXTENSOES_ACEITAS = ['jpg', 'jpeg', 'png', 'webp', 'heif', 'heic'];
const FOTO_PERFIL_UPLOAD_MAX_BYTES = 3 * 1024 * 1024;
const FOTO_PERFIL_SALVA_MAX_BYTES = 800 * 1024;
const FOTO_PERFIL_DIMENSAO_FINAL = 500;

function fotoPerfilDentroDoLimiteUpload(arquivo) {
    return arquivo && arquivo.size <= FOTO_PERFIL_UPLOAD_MAX_BYTES;
}

function fotoPerfilTipoAceito(arquivo) {
    if (!arquivo) return false;
    const tipoAceito = FOTO_PERFIL_TIPOS_ACEITOS.includes(String(arquivo.type || '').toLowerCase());
    const extensao = String(arquivo.name || '').split('.').pop().toLowerCase();
    return tipoAceito || FOTO_PERFIL_EXTENSOES_ACEITAS.includes(extensao);
}

function fotoPerfilTamanhoBase64Bytes(dataUrl) {
    const base64 = String(dataUrl || '').split(',')[1] || '';
    return Math.ceil((base64.length * 3) / 4);
}

async function otimizarFotoPerfil(arquivo) {
    if (!fotoPerfilTipoAceito(arquivo)) {
        throw new Error('A foto deve ser JPG, JPEG, PNG, HEIF ou WEBP.');
    }

    if (!fotoPerfilDentroDoLimiteUpload(arquivo)) {
        throw new Error('A foto deve ter no maximo 3MB.');
    }

    const arquivoImagem = await prepararArquivoImagemFotoPerfil(arquivo);
    const imagem = await carregarImagemFotoPerfil(arquivoImagem);
    const canvas = criarCanvasFotoPerfilQuadrada(imagem);

    const fotoComprimida = comprimirCanvasFotoPerfil(canvas);
    if (fotoComprimida) {
        return fotoComprimida;
    }

    return reduzirDimensoesFotoPerfil(canvas);
}

function fotoPerfilEhHeif(arquivo) {
    const tipo = String(arquivo?.type || '').toLowerCase();
    const extensao = String(arquivo?.name || '').split('.').pop().toLowerCase();
    return tipo === 'image/heif' || tipo === 'image/heic' || extensao === 'heif' || extensao === 'heic';
}

async function prepararArquivoImagemFotoPerfil(arquivo) {
    if (!fotoPerfilEhHeif(arquivo)) {
        return arquivo;
    }

    if (typeof window === 'undefined' || typeof window.heic2any !== 'function') {
        throw new Error('Nao foi possivel converter a foto HEIF neste navegador. Tente enviar JPG, PNG ou WEBP.');
    }

    try {
        const convertido = await window.heic2any({
            blob: arquivo,
            toType: 'image/jpeg',
            quality: 0.92
        });
        return Array.isArray(convertido) ? convertido[0] : convertido;
    } catch (err) {
        throw new Error('Nao foi possivel converter a foto HEIF. Tente enviar outra imagem.');
    }
}

function carregarImagemFotoPerfil(arquivo) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(arquivo);
        const imagem = new Image();
        imagem.onload = () => {
            URL.revokeObjectURL(url);
            resolve(imagem);
        };
        imagem.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('Nao foi possivel ler a imagem selecionada.'));
        };
        imagem.src = url;
    });
}

function criarCanvasFotoPerfilQuadrada(imagem) {
    const canvas = document.createElement('canvas');
    canvas.width = FOTO_PERFIL_DIMENSAO_FINAL;
    canvas.height = FOTO_PERFIL_DIMENSAO_FINAL;

    const origemTamanho = Math.min(imagem.width, imagem.height);
    const origemX = Math.max(0, Math.round((imagem.width - origemTamanho) / 2));
    const origemY = Math.max(0, Math.round((imagem.height - origemTamanho) / 2));

    canvas.getContext('2d').drawImage(
        imagem,
        origemX,
        origemY,
        origemTamanho,
        origemTamanho,
        0,
        0,
        FOTO_PERFIL_DIMENSAO_FINAL,
        FOTO_PERFIL_DIMENSAO_FINAL
    );

    return canvas;
}

function comprimirCanvasFotoPerfil(canvas) {
    const formatos = [
        { tipo: 'image/webp', qualidades: [0.88, 0.82, 0.76, 0.7, 0.64, 0.58, 0.5, 0.42, 0.34] },
        { tipo: 'image/jpeg', qualidades: [0.86, 0.78, 0.7, 0.62, 0.54, 0.46, 0.38, 0.3, 0.22] }
    ];

    for (const formato of formatos) {
        const dataUrl = comprimirCanvasNoFormato(canvas, formato.tipo, formato.qualidades);
        if (dataUrl) {
            return dataUrl;
        }
    }

    return null;
}

function comprimirCanvasNoFormato(canvas, tipo, qualidades) {
    for (const qualidade of qualidades) {
        const dataUrl = canvas.toDataURL(tipo, qualidade);
        if (dataUrl.startsWith(`data:${tipo}`) && fotoPerfilTamanhoBase64Bytes(dataUrl) <= FOTO_PERFIL_SALVA_MAX_BYTES) {
            return dataUrl;
        }
    }

    return null;
}

function reduzirDimensoesFotoPerfil(canvasOriginal) {
    const canvas = document.createElement('canvas');
    canvas.width = FOTO_PERFIL_DIMENSAO_FINAL;
    canvas.height = FOTO_PERFIL_DIMENSAO_FINAL;
    canvas.getContext('2d').drawImage(canvasOriginal, 0, 0, FOTO_PERFIL_DIMENSAO_FINAL, FOTO_PERFIL_DIMENSAO_FINAL);

    const fotoComprimida = comprimirCanvasFotoPerfil(canvas);
    if (fotoComprimida) {
        return fotoComprimida;
    }

    throw new Error('Nao foi possivel compactar a foto para ate 800KB. Selecione outra imagem.');
}
