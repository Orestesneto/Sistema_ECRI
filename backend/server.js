const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const database = require('./config/database');

dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Inicializar banco de dados
database.initDb();

// Rotas
const authRoutes = require('./routes/auth');
const equipistaRoutes = require('./routes/equipista');
const coordenadorRoutes = require('./routes/coordenador');
const dirigentesRoutes = require('./routes/dirigentes');
const confirmacaoRoutes = require('./routes/confirmacao');
const desenvolvimentoRoutes = require('./routes/desenvolvimento');
const notificacoesRoutes = require('./routes/notificacoes');

app.use('/frontend', express.static(path.join(__dirname, '../frontend')));

app.use('/api/auth', authRoutes);
app.use('/api/equipista', equipistaRoutes);
app.use('/api/coordenador', coordenadorRoutes);
app.use('/api/dirigentes', dirigentesRoutes);
app.use('/api/confirmacao', confirmacaoRoutes);
app.use('/api/desenvolvimento', desenvolvimentoRoutes);
app.use('/api/notificacoes', notificacoesRoutes);

app.get('/c/:codigo', async (req, res) => {
  try {
    const link = await database.get(
      'SELECT destino FROM links_encurtados WHERE codigo = ?',
      [req.params.codigo]
    );

    if (!link) {
      return res.status(404).send('Link não encontrado');
    }

    res.redirect(link.destino);
  } catch (err) {
    console.error(err);
    res.status(500).send('Erro ao abrir link');
  }
});

// Rota de teste
app.get('/api/health', async (req, res) => {
  try {
    const totalUsuarios = await database.get('SELECT COUNT(*) AS total FROM usuarios');
    res.json({
      message: 'Sistema ECRI esta funcionando!',
      database: database.usingPostgres ? 'postgres' : 'sqlite',
      usuarios: Number(totalUsuarios?.total || 0)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: 'Sistema ECRI esta com erro no banco de dados',
      database: database.usingPostgres ? 'postgres' : 'sqlite'
    });
  }
});

const PORT = process.env.PORT || 5000;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
  });
}

module.exports = app;
