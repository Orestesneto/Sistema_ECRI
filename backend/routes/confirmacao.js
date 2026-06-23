const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const database = require('../config/database');
const { normalizarMovimentoOrigem, movimentoOrigemValido } = require('../utils/movimentoOrigem');
const { apenasNumeros, cpfValido } = require('../utils/cpf');
const { normalizarAnoEncontro, anoEncontroValido } = require('../utils/anoEncontro');
const { registrarHistorico } = require('../utils/historico');
const { validarTelefoneUnico } = require('../utils/telefone');

const router = express.Router();
const TAMANHO_MAXIMO_FOTO_BYTES = 15 * 1024 * 1024;

function lerToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

function linkJaUtilizado(status) {
  return ['confirmado', 'negou', 'desistiu'].includes(status);
}

router.get('/:token', async (req, res) => {
  try {
    const dadosToken = lerToken(req.params.token);
    const tabela = dadosToken.tipo === 'externo' ? 'pessoas_externas' : 'usuarios';

    if (!['externo', 'usuario'].includes(dadosToken.tipo)) {
      return res.status(400).json({ erro: 'Link invalido' });
    }

    const camposExternos = dadosToken.tipo === 'externo' ? ', cpf, data_nascimento' : '';
    const participante = await database.get(
      `SELECT id, nome_completo, nome_cracha, telefone, movimento_origem, ano_encontro, foto_perfil,
              restricao_medica, restricao_alimentar, restricao_medicacao, status, equipe
              ${camposExternos}
       FROM ${tabela}
       WHERE id = ?`,
      [dadosToken.id]
    );

    if (!participante) {
      return res.status(404).json({ erro: 'Participante nao encontrado' });
    }

    if (linkJaUtilizado(participante.status)) {
      return res.status(403).json({ erro: 'Este link de confirmacao ja foi utilizado' });
    }

    res.json({ ...participante, tipo_cadastro: dadosToken.tipo });
  } catch (err) {
    res.status(401).json({ erro: 'Link invalido ou expirado' });
  }
});

router.put('/:token', async (req, res) => {
  try {
    const dadosToken = lerToken(req.params.token);
    const tabela = dadosToken.tipo === 'externo' ? 'pessoas_externas' : 'usuarios';
    const { nome_completo, telefone, movimento_origem, ano_encontro, restricao_medica, restricao_alimentar, restricao_medicacao, status, foto_perfil, cpf, data_nascimento } = req.body;
    const statusPermitidos = ['confirmado', 'negou', 'desistiu'];

    if (!['externo', 'usuario'].includes(dadosToken.tipo)) {
      return res.status(400).json({ erro: 'Link invalido' });
    }

    if (!nome_completo || !telefone || !movimentoOrigemValido(movimento_origem) || !anoEncontroValido(ano_encontro) || !statusPermitidos.includes(status)) {
      return res.status(400).json({ erro: 'Preencha nome, telefone, movimento, ano do encontro e status validos' });
    }

    const nomeCompleto = String(nome_completo).trim().toUpperCase();
    const movimentoOrigem = normalizarMovimentoOrigem(movimento_origem);
    const anoEncontro = normalizarAnoEncontro(ano_encontro);
    const cpfNumeros = apenasNumeros(cpf);
    const nascimentoNumeros = apenasNumeros(data_nascimento);

    if (dadosToken.tipo === 'externo' && (cpfNumeros.length !== 11 || nascimentoNumeros.length !== 8)) {
      return res.status(400).json({ erro: 'CPF deve ter 11 numeros e data de nascimento deve ter 8 numeros' });
    }

    if (dadosToken.tipo === 'externo' && !cpfValido(cpfNumeros)) {
      return res.status(400).json({ erro: 'CPF invalido' });
    }

    const participanteAtual = await database.get(`SELECT status, equipe FROM ${tabela} WHERE id = ?`, [dadosToken.id]);

    if (!participanteAtual) {
      return res.status(404).json({ erro: 'Participante nao encontrado' });
    }

    if (linkJaUtilizado(participanteAtual.status)) {
      return res.status(403).json({ erro: 'Este link de confirmacao ja foi utilizado' });
    }

    const telefoneUnico = await validarTelefoneUnico(database, telefone, movimentoOrigem, {
      ignorarUsuarioId: dadosToken.tipo === 'usuario' ? dadosToken.id : null,
      ignorarPessoaExternaId: dadosToken.tipo === 'externo' ? dadosToken.id : null
    });
    if (!telefoneUnico.valido) {
      return res.status(400).json({ erro: telefoneUnico.erro });
    }

    const fotoPerfil = typeof foto_perfil === 'string' && foto_perfil.startsWith('data:image/')
      ? foto_perfil
      : null;

    if (!fotoPerfil) {
      return res.status(400).json({ erro: 'Foto de perfil obrigatoria' });
    }

    const fotoBase64 = fotoPerfil.split(',')[1] || '';
    const tamanhoFotoBytes = Math.ceil((fotoBase64.length * 3) / 4);
    if (tamanhoFotoBytes > TAMANHO_MAXIMO_FOTO_BYTES) {
      return res.status(400).json({ erro: 'A foto deve ter no maximo 15MB' });
    }

    if (dadosToken.tipo === 'externo') {
      const cpfExistente = await database.get('SELECT id FROM usuarios WHERE cpf = ?', [cpfNumeros]);
      if (cpfExistente) {
        return res.status(400).json({ erro: 'CPF ja cadastrado' });
      }

      const senhaHash = await bcrypt.hash(nascimentoNumeros, 10);
      const emailTemporario = `${cpfNumeros}@sem-cadastro.ecri.local`;

      const resultadoUsuario = await database.run(
        `INSERT INTO usuarios (
          email, senha, nome_completo, nome_cracha, telefone, cpf, data_nascimento,
          movimento_origem, ano_encontro, foto_perfil, restricao_medica, restricao_alimentar,
          restricao_medicacao, perfil, status, equipe
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          emailTemporario,
          senhaHash,
          nomeCompleto,
          nomeCompleto,
          telefone,
          cpfNumeros,
          nascimentoNumeros,
          movimentoOrigem,
          anoEncontro,
          fotoPerfil,
          restricao_medica || '',
          restricao_alimentar || '',
          restricao_medicacao || '',
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
         SET nome_completo = ?, nome_cracha = ?, telefone = ?, movimento_origem = ?,
             ano_encontro = ?, restricao_medica = ?, restricao_alimentar = ?, restricao_medicacao = ?, status = ?, foto_perfil = ?
         WHERE id = ?`,
        [
          nomeCompleto,
          nomeCompleto,
          telefone,
          movimentoOrigem,
          anoEncontro,
          restricao_medica || '',
          restricao_alimentar || '',
          restricao_medicacao || '',
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

    res.json({ mensagem: 'Confirmacao enviada com sucesso' });
  } catch (err) {
    res.status(401).json({ erro: 'Link invalido ou expirado' });
  }
});

module.exports = router;
