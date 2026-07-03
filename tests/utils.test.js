const test = require('node:test');
const assert = require('node:assert/strict');

const { apenasNumeros, cpfValido } = require('../backend/utils/cpf');
const {
  normalizarEquipe,
  equipeValida,
  equipeSemEquipe,
  statusRemoveDoEncontro,
  aplicarRegraSemEquipe
} = require('../backend/utils/equipes');
const {
  normalizarMovimentoOrigem,
  movimentoOrigemValido,
  movimentoOrigemCasal
} = require('../backend/utils/movimentoOrigem');
const { normalizarAnoEncontro, anoEncontroValido } = require('../backend/utils/anoEncontro');
const { normalizarParoquia, paroquiaValida } = require('../backend/utils/paroquia');
const { normalizarFotoPerfil, TAMANHO_MAXIMO_FOTO_SALVA_BYTES } = require('../backend/utils/foto');
const { normalizarExperienciaPerfil } = require('../backend/utils/experienciaPerfil');
const {
  normalizarTelefoneCelular,
  normalizarCampoTelefoneContato,
  validarTelefoneUnico
} = require('../backend/utils/telefone');

test('CPF: extrai apenas numeros e valida CPFs', () => {
  assert.equal(apenasNumeros('096.937.024-50'), '09693702450');
  assert.equal(cpfValido('529.982.247-25'), true);
  assert.equal(cpfValido('111.111.111-11'), false);
  assert.equal(cpfValido('123'), false);
});

test('Equipes: normaliza, valida e aplica regra de sem equipe', () => {
  assert.equal(normalizarEquipe(' coordenacao geral '), 'Coordenacao Geral');
  assert.equal(normalizarEquipe('RANGUINHO'), 'Ranguinho');
  assert.equal(equipeValida('Animadores'), true);
  assert.equal(equipeValida('Equipe inexistente'), false);
  assert.equal(equipeSemEquipe(' sem equipe '), true);
  assert.equal(statusRemoveDoEncontro('desistiu'), true);

  assert.deepEqual(aplicarRegraSemEquipe('Animadores', 'pendente'), {
    equipe: 'Animadores',
    status: 'pendente'
  });
  assert.deepEqual(aplicarRegraSemEquipe('Animadores', 'negou'), {
    equipe: 'SEM EQUIPE',
    status: 'negou'
  });
  assert.deepEqual(aplicarRegraSemEquipe('', 'pendente'), {
    equipe: 'SEM EQUIPE',
    status: 'pendente'
  });
});

test('Movimento de origem: normaliza, valida e identifica casais', () => {
  assert.equal(normalizarMovimentoOrigem(' ejc '), 'EJC');
  assert.equal(movimentoOrigemValido('Jovens EJC casados'), true);
  assert.equal(movimentoOrigemValido('ABC'), false);
  assert.equal(movimentoOrigemCasal('ECC'), true);
  assert.equal(movimentoOrigemCasal('JOVENS EJC CASADOS'), true);
  assert.equal(movimentoOrigemCasal('EJC'), false);
});

test('Ano de encontro: normaliza e valida limites', () => {
  const anoAtual = new Date().getFullYear();
  assert.equal(normalizarAnoEncontro('20a26xyz'), '2026');
  assert.equal(anoEncontroValido('1900'), true);
  assert.equal(anoEncontroValido(String(anoAtual)), true);
  assert.equal(anoEncontroValido('1899'), false);
  assert.equal(anoEncontroValido(String(anoAtual + 1)), false);
});

test('Paroquia: normaliza texto e exige valor preenchido', () => {
  assert.equal(normalizarParoquia(' Nossa Senhora da Guia '), 'NOSSA SENHORA DA GUIA');
  assert.equal(paroquiaValida('Sao Pedro'), true);
  assert.equal(paroquiaValida('   '), false);
});

test('Foto: valida obrigatoriedade, formato e tamanho', () => {
  const fotoPng = 'data:image/png;base64,AAAA';
  const fotoGrande = `data:image/jpeg;base64,${'A'.repeat((TAMANHO_MAXIMO_FOTO_SALVA_BYTES + 1) * 2)}`;

  assert.deepEqual(normalizarFotoPerfil(null), { fotoPerfil: null });
  assert.deepEqual(normalizarFotoPerfil(null, { obrigatoria: true }), { erro: 'Foto de perfil obrigatoria' });
  assert.deepEqual(normalizarFotoPerfil('texto'), { erro: 'Foto de perfil invalida' });
  assert.deepEqual(normalizarFotoPerfil('data:image/gif;base64,AAAA'), {
    erro: 'A foto deve ser JPG, JPEG, PNG ou WEBP apos a compressao'
  });
  assert.deepEqual(normalizarFotoPerfil(fotoPng), { fotoPerfil: fotoPng });
  assert.deepEqual(normalizarFotoPerfil(fotoGrande), { erro: 'A foto deve ter no maximo 300KB apos a compressao' });
});

test('Experiencia de perfil: normaliza sim/nao, instrumentos e equipes servidas', () => {
  assert.deepEqual(normalizarExperienciaPerfil({
    toca_instrumento: 'sim',
    instrumentos: ' violao ',
    canta: 'talvez',
    equipes_servidas: [' animadores ', '', 'ranguinho']
  }), {
    tocaInstrumento: 'sim',
    instrumentos: 'VIOLAO',
    canta: 'nao',
    equipesServidasJson: JSON.stringify(['ANIMADORES', 'RANGUINHO'])
  });

  assert.deepEqual(normalizarExperienciaPerfil({
    toca_instrumento: 'nao',
    instrumentos: 'bateria',
    canta: 'sim',
    equipes_servidas: '["escrita",""]'
  }), {
    tocaInstrumento: 'nao',
    instrumentos: '',
    canta: 'sim',
    equipesServidasJson: JSON.stringify(['ESCRITA'])
  });
});

test('Telefone: normaliza celular e campo de casal', () => {
  assert.equal(normalizarTelefoneCelular('(83) 8888-7777'), '83988887777');
  assert.equal(normalizarTelefoneCelular('999999999'), '999999999');
  assert.equal(normalizarCampoTelefoneContato('Esposa: 8388887777 | Marido: 83977776666'), 'Esposa: 83988887777 | Marido: 83977776666');
});

test('Telefone unico: bloqueia telefone repetido e permite ECC/ECRI', async () => {
  const database = {
    async all(sql) {
      if (sql.includes('FROM usuarios')) {
        return [
          { id: 1, nome_completo: 'Usuario EC', telefone: '83999999999', movimento_origem: 'EC', tipo: 'usuario' },
          { id: 2, nome_completo: 'Usuario ECC', telefone: '83888888888', movimento_origem: 'ECC', tipo: 'usuario' }
        ];
      }
      return [];
    }
  };

  assert.deepEqual(await validarTelefoneUnico(database, '999999999', 'EJC'), {
    valido: false,
    erro: 'Faltou o DDD'
  });
  assert.deepEqual(await validarTelefoneUnico(database, '83999999999', 'EJC'), {
    valido: false,
    erro: 'Telefone já cadastrado para Usuario EC'
  });
  assert.deepEqual(await validarTelefoneUnico(database, '83888888888', 'ECRI'), {
    valido: true
  });
  assert.deepEqual(await validarTelefoneUnico(database, '83777777777', 'EJC'), {
    valido: true
  });
});
