const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const database = require('../config/database');
const { normalizarMovimentoOrigem, movimentoOrigemValido, movimentoOrigemCasal } = require('../utils/movimentoOrigem');
const { apenasNumeros, cpfValido } = require('../utils/cpf');
const { normalizarAnoEncontro, anoEncontroValido } = require('../utils/anoEncontro');
const { registrarHistorico } = require('../utils/historico');
const { validarTelefoneUnico } = require('../utils/telefone');
const { normalizarParoquia, paroquiaValida } = require('../utils/paroquia');
const { normalizarFotoPerfil } = require('../utils/foto');

const router = express.Router();

function lerToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

function linkJaUtilizado(status) {
  return ['confirmado', 'negou', 'desistiu'].includes(status);
}

async function tokenConfirmacaoJaUtilizado(dadosToken) {
  if (!dadosToken.jti) return false;
  const token = await database.get(
    'SELECT jti FROM tokens_confirmacao_utilizados WHERE jti = ?',
    [dadosToken.jti]
  );
  return Boolean(token);
}

async function marcarTokenConfirmacaoUtilizado(dadosToken) {
  if (!dadosToken.jti) return;
  await database.run(
    `INSERT OR IGNORE INTO tokens_confirmacao_utilizados (jti, tipo_cadastro, participante_id)
     VALUES (?, ?, ?)`,
    [dadosToken.jti, dadosToken.tipo, dadosToken.id]
  );
}

router.get('/:token', async (req, res) => {
  try {
    const dadosToken = lerToken(req.params.token);
    const tabela = dadosToken.tipo === 'externo' ? 'pessoas_externas' : 'usuarios';

    if (!['externo', 'usuario'].includes(dadosToken.tipo)) {
      return res.status(400).json({ erro: 'Link inválido' });
    }

    const camposExtras = dadosToken.tipo === 'externo'
      ? ', cpf, data_nascimento, NULL AS toca_instrumento, NULL AS instrumentos, NULL AS canta, NULL AS equipes_servidas'
      : ', cpf, data_nascimento, toca_instrumento, instrumentos, canta, equipes_servidas';
    const participante = await database.get(
      `SELECT id, nome_completo, nome_cracha, telefone, movimento_origem, ano_encontro, foto_perfil,
              paroquia, restricao_medica, restricao_alimentar, restricao_medicacao, status, equipe
              ${camposExtras}
       FROM ${tabela}
       WHERE id = ?`,
      [dadosToken.id]
    );

    if (!participante) {
      return res.status(404).json({ erro: 'Participante não encontrado' });
    }

    if (await tokenConfirmacaoJaUtilizado(dadosToken)) {
      return res.status(403).json({ erro: 'Este link de confirmação já foi utilizado' });
    }

    if (!dadosToken.jti && linkJaUtilizado(participante.status)) {
      return res.status(403).json({ erro: 'Este link de confirmação já foi utilizado' });
    }

    res.json({ ...participante, tipo_cadastro: dadosToken.tipo });
  } catch (err) {
    res.status(401).json({ erro: 'Link inválido ou expirado' });
  }
});

router.put('/:token', async (req, res) => {
  try {
    const dadosToken = lerToken(req.params.token);
    const tabela = dadosToken.tipo === 'externo' ? 'pessoas_externas' : 'usuarios';
    const {
      nome_completo,
      nome_cracha,
      telefone,
      paroquia,
      movimento_origem,
      ano_encontro,
      restricao_medica,
      restricao_alimentar,
      restricao_medicacao,
      toca_instrumento,
      instrumentos,
      canta,
      equipes_servidas,
      status,
      foto_perfil,
      cpf,
      data_nascimento
    } = req.body;
    const statusPermitidos = ['confirmado', 'negou', 'desistiu'];

    if (!['externo', 'usuario'].includes(dadosToken.tipo)) {
      return res.status(400).json({ erro: 'Link inválido' });
    }

    if (!nome_completo || !nome_cracha || !telefone || !paroquia || !toca_instrumento || !canta || !movimentoOrigemValido(movimento_origem) || !anoEncontroValido(ano_encontro) || !statusPermitidos.includes(status)) {
      return res.status(400).json({ erro: 'Preencha nome, crachá, telefone, paróquia, instrumento, canto, movimento, ano do encontro e status válidos' });
    }

    if (!['sim', 'nao'].includes(toca_instrumento) || !['sim', 'nao'].includes(canta)) {
      return res.status(400).json({ erro: 'Informe sim ou não para instrumento e canto' });
    }

    const nomeCompleto = String(nome_completo).trim().toUpperCase();
    const nomeCracha = String(nome_cracha).trim().toUpperCase();
    const movimentoOrigem = normalizarMovimentoOrigem(movimento_origem);
    const anoEncontro = normalizarAnoEncontro(ano_encontro);
    const paroquiaNormalizada = normalizarParoquia(paroquia);
    const instrumentosNormalizados = toca_instrumento === 'sim'
      ? String(instrumentos || '').trim().toUpperCase()
      : '';
    const equipesServidas = Array.isArray(equipes_servidas)
      ? equipes_servidas.map(item => String(item || '').trim().toUpperCase()).filter(Boolean)
      : [];
    const cpfNumeros = apenasNumeros(cpf);
    const nascimentoNumeros = apenasNumeros(data_nascimento);

    if (dadosToken.tipo === 'externo' && (cpfNumeros.length !== 11 || nascimentoNumeros.length !== 8)) {
      return res.status(400).json({ erro: 'CPF deve ter 11 numeros e data de nascimento deve ter 8 numeros' });
    }

    if (dadosToken.tipo === 'externo' && !cpfValido(cpfNumeros)) {
      return res.status(400).json({ erro: 'CPF inválido' });
    }

    if (!paroquiaValida(paroquiaNormalizada)) {
      return res.status(400).json({ erro: 'Paróquia inválida' });
    }

    if (toca_instrumento === 'sim' && !instrumentosNormalizados) {
      return res.status(400).json({ erro: 'Informe quais instrumentos você toca' });
    }

    if (movimentoOrigemCasal(movimentoOrigem) && (!nomeCompleto.includes(' E ') || nomeCracha !== nomeCompleto)) {
      return res.status(400).json({ erro: 'Para ECC ou Jovens EJC casados, informe marido e esposa. O cracha deve ficar MARIDO E ESPOSA' });
    }

    const participanteAtual = await database.get(`SELECT status, equipe FROM ${tabela} WHERE id = ?`, [dadosToken.id]);

    if (!participanteAtual) {
      return res.status(404).json({ erro: 'Participante não encontrado' });
    }

    if (await tokenConfirmacaoJaUtilizado(dadosToken)) {
      return res.status(403).json({ erro: 'Este link de confirmação já foi utilizado' });
    }

    if (!dadosToken.jti && linkJaUtilizado(participanteAtual.status)) {
      return res.status(403).json({ erro: 'Este link de confirmação já foi utilizado' });
    }

    const telefoneUnico = await validarTelefoneUnico(database, telefone, movimentoOrigem, {
      ignorarUsuarioId: dadosToken.tipo === 'usuario' ? dadosToken.id : null,
      ignorarPessoaExternaId: dadosToken.tipo === 'externo' ? dadosToken.id : null
    });
    if (!telefoneUnico.valido) {
      return res.status(400).json({ erro: telefoneUnico.erro });
    }

    const fotoValidada = normalizarFotoPerfil(foto_perfil, { obrigatoria: true });
    if (fotoValidada.erro) {
      return res.status(400).json({ erro: fotoValidada.erro });
    }
    const fotoPerfil = fotoValidada.fotoPerfil;

    if (dadosToken.tipo === 'externo') {
      const cpfExistente = await database.get('SELECT id FROM usuarios WHERE cpf = ?', [cpfNumeros]);
      if (cpfExistente) {
        return res.status(400).json({ erro: 'CPF já cadastrado' });
      }

      const senhaHash = await bcrypt.hash(nascimentoNumeros, 10);
      const emailTemporario = `${cpfNumeros}@sem-cadastro.ecri.local`;

      const resultadoUsuario = await database.run(
        `INSERT INTO usuarios (
          email, senha, nome_completo, nome_cracha, telefone, paroquia, cpf, data_nascimento,
          movimento_origem, ano_encontro, foto_perfil, restricao_medica, restricao_alimentar,
          restricao_medicacao, toca_instrumento, instrumentos, canta, equipes_servidas, perfil, status, equipe
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          emailTemporario,
          senhaHash,
          nomeCompleto,
          nomeCracha,
          telefone,
          paroquiaNormalizada,
          cpfNumeros,
          nascimentoNumeros,
          movimentoOrigem,
          anoEncontro,
          fotoPerfil,
          restricao_medica || '',
          restricao_alimentar || '',
          restricao_medicacao || '',
          toca_instrumento,
          instrumentosNormalizados,
          canta,
          JSON.stringify(equipesServidas),
          'equipista',
          status,
          participanteAtual.equipe
        ]
      );
      await registrarHistorico(resultadoUsuario.lastID, 'participacao_confirmada', {
        origem: 'link_externo',
        status
      });

      await database.run('DELETE FROM pessoas_externas WHERE id = ?', [dadosToken.id]);
    } else {
      await database.run(
        `UPDATE usuarios
         SET nome_completo = ?, nome_cracha = ?, telefone = ?, paroquia = ?, movimento_origem = ?,
             ano_encontro = ?, restricao_medica = ?, restricao_alimentar = ?, restricao_medicacao = ?,
             toca_instrumento = ?, instrumentos = ?, canta = ?, equipes_servidas = ?,
             status = ?, foto_perfil = ?
         WHERE id = ?`,
        [
          nomeCompleto,
          nomeCracha,
          telefone,
          paroquiaNormalizada,
          movimentoOrigem,
          anoEncontro,
          restricao_medica || '',
          restricao_alimentar || '',
          restricao_medicacao || '',
          toca_instrumento,
          instrumentosNormalizados,
          canta,
          JSON.stringify(equipesServidas),
          status,
          fotoPerfil,
          dadosToken.id
        ]
      );
      await registrarHistorico(dadosToken.id, 'participacao_confirmada', {
        origem: 'link_usuario',
        status
      });
    }

    await marcarTokenConfirmacaoUtilizado(dadosToken);

    res.json({ mensagem: 'Confirmação enviada com sucesso' });
  } catch (err) {
    res.status(401).json({ erro: 'Link inválido ou expirado' });
  }
});

module.exports = router;
