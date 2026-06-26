const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const database = require('../config/database');
const { normalizarMovimentoOrigem, movimentoOrigemValido, movimentoOrigemCasal } = require('../utils/movimentoOrigem');
const { apenasNumeros, cpfValido } = require('../utils/cpf');
const { normalizarAnoEncontro, anoEncontroValido } = require('../utils/anoEncontro');
const { registrarHistorico } = require('../utils/historico');
const { validarTelefoneUnico } = require('../utils/telefone');
const { normalizarParoquia, paroquiaValida } = require('../utils/paroquia');
const { normalizarFotoPerfil } = require('../utils/foto');

const router = express.Router();

// Registro de novo usuario (Equipista)
router.post('/registro', async (req, res) => {
  try {
    const {
      cpf,
      data_nascimento,
      nome_completo,
      nome_cracha,
      telefone,
      paroquia,
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

    if (!cpfNumeros || !dataNascimento || !nome_completo || !nome_cracha || !telefone || !paroquia || !movimento_origem || !ano_encontro || !foto_perfil || !toca_instrumento || !canta) {
      return res.status(400).json({ erro: 'Todos os campos são obrigatórios' });
    }

    if (!['sim', 'nao'].includes(toca_instrumento) || !['sim', 'nao'].includes(canta)) {
      return res.status(400).json({ erro: 'Informe sim ou não para instrumento e canto' });
    }

    if (!cpfValido(cpfNumeros)) {
      return res.status(400).json({ erro: 'CPF inválido' });
    }

    if (dataNascimento.length !== 8) {
      return res.status(400).json({ erro: 'Data de nascimento deve conter 8 números' });
    }

    if (!movimentoOrigemValido(movimento_origem)) {
      return res.status(400).json({ erro: 'Movimento de origem inválido' });
    }

    if (!anoEncontroValido(ano_encontro)) {
      return res.status(400).json({ erro: 'Ano do encontro inválido' });
    }

    const movimentoOrigem = normalizarMovimentoOrigem(movimento_origem);
    const anoEncontro = normalizarAnoEncontro(ano_encontro);
    const paroquiaNormalizada = normalizarParoquia(paroquia);
    const nomeCompleto = String(nome_completo).trim().toUpperCase();
    const nomeCracha = String(nome_cracha).trim().toUpperCase();
    const instrumentosNormalizados = toca_instrumento === 'sim'
      ? String(instrumentos || '').trim().toUpperCase()
      : '';
    const equipesServidas = Array.isArray(equipes_servidas)
      ? equipes_servidas.map(item => String(item || '').trim().toUpperCase()).filter(Boolean)
      : [];

    if (toca_instrumento === 'sim' && !instrumentosNormalizados) {
      return res.status(400).json({ erro: 'Informe quais instrumentos você toca' });
    }

    if (!paroquiaValida(paroquiaNormalizada)) {
      return res.status(400).json({ erro: 'Paróquia inválida' });
    }

    if (movimentoOrigemCasal(movimentoOrigem) && (!nomeCompleto.includes(' E ') || nomeCracha !== nomeCompleto)) {
      return res.status(400).json({ erro: 'Para ECC ou Jovens EJC casados, informe marido e esposa. O cracha deve ficar MARIDO E ESPOSA' });
    }

    const telefoneUnico = await validarTelefoneUnico(database, telefone, movimentoOrigem);
    if (!telefoneUnico.valido) {
      return res.status(400).json({ erro: telefoneUnico.erro });
    }

    const fotoValidada = normalizarFotoPerfil(foto_perfil, { obrigatoria: true });
    if (fotoValidada.erro) {
      return res.status(400).json({ erro: fotoValidada.erro });
    }
    const fotoPerfil = fotoValidada.fotoPerfil;

    const usuarioExistente = await database.get('SELECT id FROM usuarios WHERE cpf = ?', [cpfNumeros]);
    if (usuarioExistente) {
      return res.status(400).json({ erro: 'CPF já cadastrado' });
    }

    const emailInterno = `${cpfNumeros}@cpf.ecri.local`;
    const senhaHash = await bcrypt.hash(dataNascimento, 10);

    const resultado = await database.run(
      `INSERT INTO usuarios (
        email, senha, nome_completo, nome_cracha, telefone, paroquia, movimento_origem, ano_encontro,
        foto_perfil, perfil, cpf, data_nascimento, toca_instrumento,
        instrumentos, canta, equipes_servidas
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        emailInterno,
        senhaHash,
        nomeCompleto,
        nomeCracha,
        telefone,
        paroquiaNormalizada,
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
      mensagem: 'Usuário cadastrado com sucesso',
      usuario_id: resultado.lastID
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao registrar usuário' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { cpf, data_nascimento } = req.body;
    const cpfNumeros = apenasNumeros(cpf);
    const senhaInformada = apenasNumeros(data_nascimento);

    if (!cpfNumeros || !senhaInformada) {
      return res.status(400).json({ erro: 'CPF e data de nascimento sao obrigatorios' });
    }

    if (!cpfValido(cpfNumeros)) {
      return res.status(400).json({ erro: 'CPF inválido' });
    }

    const usuario = await database.get('SELECT * FROM usuarios WHERE cpf = ?', [cpfNumeros]);

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
        perfil: usuario.perfil,
        equipe: usuario.equipe || ''
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao fazer login' });
  }
});

module.exports = router;
