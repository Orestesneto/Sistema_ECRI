const FOTO_PERFIL_TIPOS_ACEITOS = ['image/jpeg', 'image/png', 'image/webp'];
const FOTO_PERFIL_EXTENSOES_ACEITAS = ['jpg', 'jpeg', 'png', 'webp'];
const FOTO_PERFIL_UPLOAD_MAX_BYTES = 3 * 1024 * 1024;
const FOTO_PERFIL_SALVA_MAX_BYTES = 700 * 1024;
const FOTO_PERFIL_DIMENSAO_MAXIMA = 1200;

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
        throw new Error('A foto deve ser JPG, JPEG, PNG ou WEBP.');
    }

    if (!fotoPerfilDentroDoLimiteUpload(arquivo)) {
        throw new Error('A foto deve ter no máximo 3MB.');
    }

    const imagem = await carregarImagemFotoPerfil(arquivo);
    const { largura, altura } = calcularDimensoesFotoPerfil(imagem.width, imagem.height);
    const canvas = document.createElement('canvas');
    canvas.width = largura;
    canvas.height = altura;

    const contexto = canvas.getContext('2d');
    contexto.drawImage(imagem, 0, 0, largura, altura);

    const qualidades = [0.86, 0.78, 0.7, 0.62, 0.54, 0.46, 0.38, 0.3];
    for (const qualidade of qualidades) {
        const dataUrl = canvas.toDataURL('image/webp', qualidade);
        if (dataUrl.startsWith('data:image/webp') && fotoPerfilTamanhoBase64Bytes(dataUrl) <= FOTO_PERFIL_SALVA_MAX_BYTES) {
            return dataUrl;
        }
    }

    return reduzirDimensoesFotoPerfil(canvas);
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
            reject(new Error('Não foi possível ler a imagem selecionada.'));
        };
        imagem.src = url;
    });
}

function calcularDimensoesFotoPerfil(larguraOriginal, alturaOriginal, limite = FOTO_PERFIL_DIMENSAO_MAXIMA) {
    const maiorLado = Math.max(larguraOriginal, alturaOriginal);
    if (maiorLado <= limite) {
        return { largura: larguraOriginal, altura: alturaOriginal };
    }

    const escala = limite / maiorLado;
    return {
        largura: Math.max(1, Math.round(larguraOriginal * escala)),
        altura: Math.max(1, Math.round(alturaOriginal * escala))
    };
}

function reduzirDimensoesFotoPerfil(canvasOriginal) {
    let largura = canvasOriginal.width;
    let altura = canvasOriginal.height;

    for (let tentativa = 0; tentativa < 8; tentativa += 1) {
        largura = Math.max(240, Math.round(largura * 0.82));
        altura = Math.max(240, Math.round(altura * 0.82));

        const canvas = document.createElement('canvas');
        canvas.width = largura;
        canvas.height = altura;
        canvas.getContext('2d').drawImage(canvasOriginal, 0, 0, largura, altura);

        const dataUrl = canvas.toDataURL('image/webp', 0.72);
        if (dataUrl.startsWith('data:image/webp') && fotoPerfilTamanhoBase64Bytes(dataUrl) <= FOTO_PERFIL_SALVA_MAX_BYTES) {
            return dataUrl;
        }
    }

    throw new Error('Não foi possível compactar a foto para até 700KB. Selecione outra imagem.');
}
