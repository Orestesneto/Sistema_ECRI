const express = require('express');
const jwt = require('jsonwebtoken');
const database = require('../config/database');
const { ehUrlImagem } = require('../utils/supabaseStorage');

const router = express.Router();

function obterToken(req) {
  const bearer = req.headers.authorization?.split(' ')[1];
  return bearer || req.query.token || '';
}

function verificarAcessoFoto(req, res, next) {
  const token = obterToken(req);
  if (!token) return res.status(401).send('Token nao fornecido');

  try {
    req.usuario = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).send('Token invalido');
  }
}

function extrairImagemDataUrl(valor) {
  const texto = String(valor || '');
  const match = texto.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return null;

  return {
    tipo: match[1],
    buffer: Buffer.from(match[2], 'base64')
  };
}

router.get('/:tipo/:id', verificarAcessoFoto, async (req, res) => {
  try {
    const tipo = req.params.tipo;
    const id = Number(req.params.id);
    if (!['usuario', 'externo'].includes(tipo) || !id) {
      return res.status(400).send('Imagem invalida');
    }

    const tabela = tipo === 'externo' ? 'pessoas_externas' : 'usuarios';
    const row = await database.get(`SELECT foto_perfil FROM ${tabela} WHERE id = ?`, [id]);
    if (ehUrlImagem(row?.foto_perfil)) {
      res.setHeader('Cache-Control', 'private, max-age=300');
      return res.redirect(row.foto_perfil);
    }

    const imagem = extrairImagemDataUrl(row?.foto_perfil);
    if (!imagem) return res.status(404).send('Imagem nao encontrada');

    res.setHeader('Content-Type', imagem.tipo);
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.send(imagem.buffer);
  } catch (err) {
    console.error(err);
    res.status(500).send('Erro ao carregar imagem');
  }
});

module.exports = router;
