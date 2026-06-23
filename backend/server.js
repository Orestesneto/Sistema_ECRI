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

app.use('/frontend', express.static(path.join(__dirname, '../frontend')));

app.use('/api/auth', authRoutes);
app.use('/api/equipista', equipistaRoutes);
app.use('/api/coordenador', coordenadorRoutes);
app.use('/api/dirigentes', dirigentesRoutes);
app.use('/api/confirmacao', confirmacaoRoutes);
app.use('/api/desenvolvimento', desenvolvimentoRoutes);

// Rota de teste
app.get('/api/health', (req, res) => {
  res.json({ message: 'Sistema ECRI está funcionando!' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
});
