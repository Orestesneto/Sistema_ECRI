const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const database = require('../config/database');
const { normalizarMovimentoOrigem, movimentoOrigemValido, movimentoOrigemCasal } = require('../utils/movimentoOrigem');
const { apenasNumeros, cpfValido } = require('../utils/cpf');
const { normalizarAnoEncontro, anoEncontroValido } = require('../utils/anoEncontro');
const { registrarHistorico } = require('../utils/historico');
const { validarTelefoneUnico } = require('../utils/telefone');

const router = express.Router();
const TAMANHO_MAXIMO_FOTO_BYTES = 15 * 1024 * 1024;

// Registro de novo usuario (Equipista)
router.post('/registro', async (req, res) => {
  try {
    const {
      cpf,
      data_nascimento,
      nome_completo,
      nome_cracha,
      telefone,
      movimento_origem,
      ano_encontro,
      foto_perfil,
      toca_instrumento,
      instrumentos,
      canta,
      equipes_servidas
    } = req.body;
    const cpfNumeros = apenasNumeros(cpf);
    const dataNascimento = apenasNumeros(data_nascimento);

    if (!cpfNumeros || !dataNascimento || !nome_completo || !nome_cracha || !telefone || !movimento_origem || !ano_encontro || !foto_perfil || !toca_instrumento || !canta) {
      return res.status(400).json({ erro: 'Todos os campos sao obrigatorios' });
    }

    if (!['sim', 'nao'].includes(toca_instrumento) || !['sim', 'nao'].includes(canta)) {
      return res.status(400).json({ erro: 'Informe sim ou nao para instrumento e canto' });
    }

    if (!cpfValido(cpfNumeros)) {
      return res.status(400).json({ erro: 'CPF invalido' });
    }

    if (dataNascimento.length !== 8) {
      return res.status(400).json({ erro: 'Data de nascimento deve conter 8 numeros' });
    }

    if (!movimentoOrigemValido(movimento_origem)) {
      return res.status(400).json({ erro: 'Movimento de origem invalido' });
    }

    if (!anoEncontroValido(ano_encontro)) {
      return res.status(400).json({ erro: 'Ano do encontro invalido' });
    }

    const movimentoOrigem = normalizarMovimentoOrigem(movimento_origem);
    const anoEncontro = normalizarAnoEncontro(ano_encontro);
    const nomeCompleto = String(nome_completo).trim().toUpperCase();
    const nomeCracha = String(nome_cracha).trim().toUpperCase();
    const instrumentosNormalizados = toca_instrumento === 'sim'
      ? String(instrumentos || '').trim().toUpperCase()
      : '';
    const equipesServidas = Array.isArray(equipes_servidas)
      ? equipes_servidas.map(item => String(item || '').trim().toUpperCase()).filter(Boolean)
      : [];

    if (toca_instrumento === 'sim' && !instrumentosNormalizados) {
      return res.status(400).json({ erro: 'Informe quais instrumentos voce toca' });
    }

    if (movimentoOrigemCasal(movimentoOrigem) && (!nomeCompleto.includes(' E ') || nomeCracha !== nomeCompleto)) {
      return res.status(400).json({ erro: 'Para ECC ou Jovens EJC casados, informe marido e esposa. O cracha deve ficar MARIDO E ESPOSA' });
    }

    const telefoneUnico = await validarTelefoneUnico(database, telefone, movimentoOrigem);
    if (!telefoneUnico.valido) {
      return res.status(400).json({ erro: telefoneUnico.erro });
    }

    const fotoPerfil = typeof foto_perfil === 'string' && foto_perfil.startsWith('data:image/')
      ? foto_perfil
      : null;

    if (!fotoPerfil) {
      return res.status(400).json({ erro: 'Foto de perfil invalida' });
    }

    const fotoBase64 = fotoPerfil.split(',')[1] || '';
    const tamanhoFotoBytes = Math.ceil((fotoBase64.length * 3) / 4);
    if (tamanhoFotoBytes > TAMANHO_MAXIMO_FOTO_BYTES) {
      return res.status(400).json({ erro: 'A foto deve ter no maximo 15MB' });
    }

    const usuarioExistente = await database.get('SELECT id FROM usuarios WHERE cpf = ?', [cpfNumeros]);
    if (usuarioExistente) {
      return res.status(400).json({ erro: 'CPF ja cadastrado' });
    }

    const emailInterno = `${cpfNumeros}@cpf.ecri.local`;
    const senhaHash = await bcrypt.hash(dataNascimento, 10);

    const resultado = await database.run(
      `INSERT INTO usuarios (
        email, senha, nome_completo, nome_cracha, telefone, movimento_origem, ano_encontro,
        foto_perfil, perfil, cpf, data_nascimento, toca_instrumento,
        instrumentos, canta, equipes_servidas
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        emailInterno,
        senhaHash,
        nomeCompleto,
        nomeCracha,
        telefone,
        movimentoOrigem,
        anoEncontro,
        fotoPerfil,
        'equipista',
        cpfNumeros,
        dataNascimento,
        toca_instrumento,
        instrumentosNormalizados,
        canta,
        JSON.stringify(equipesServidas)
      ]
    );
    await registrarHistorico(resultado.lastID, 'usuario_registrado', {
      nome_completo: nomeCompleto,
      movimento_origem: movimentoOrigem
    });

    res.status(201).json({
      mensagem: 'Usuario cadastrado com sucesso',
      usuario_id: resultado.lastID
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao registrar usuario' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, senha, cpf, data_nascimento } = req.body;
    const identificador = String(cpf || email || '').trim();
    const senhaInformada = String(data_nascimento || senha || '').trim();
    const cpfNumeros = apenasNumeros(identificador);

    if (!identificador || !senhaInformada) {
      return res.status(400).json({ erro: 'CPF e data de nascimento sao obrigatorios' });
    }

    if (!identificador.includes('@') && !cpfValido(cpfNumeros)) {
      return res.status(400).json({ erro: 'CPF invalido' });
    }

    const usuario = identificador.includes('@')
      ? await database.get('SELECT * FROM usuarios WHERE email = ?', [identificador])
      : await database.get('SELECT * FROM usuarios WHERE cpf = ?', [cpfNumeros]);

    if (!usuario) {
      return res.status(401).json({ erro: 'CPF ou data de nascimento incorretos' });
    }

    const senhaValida = await bcrypt.compare(senhaInformada, usuario.senha);
    if (!senhaValida) {
      return res.status(401).json({ erro: 'CPF ou data de nascimento incorretos' });
    }

    const token = jwt.sign(
      { id: usuario.id, email: usuario.email, perfil: usuario.perfil },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      mensagem: 'Login realizado com sucesso',
      token,
      usuario: {
        id: usuario.id,
        email: usuario.email,
        nome_completo: usuario.nome_completo,
        perfil: usuario.perfil
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao fazer login' });
  }
});

module.exports = router;
