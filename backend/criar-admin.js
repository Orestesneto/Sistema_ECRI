const database = require('./config/database');
const bcrypt = require('bcryptjs');

async function criarAdmin() {
  try {
    // Hash da senha
    const senhaHash = await bcrypt.hash('123456', 10);
    const email = 'admin@teste.com';
    const nomeCracha = 'Admin';

    // Tentar atualizar primeiro
    await database.run(
      `UPDATE usuarios SET perfil = 'equipe_dirigente', status = 'confirmado' WHERE email = ?`,
      [email]
    );

    // Se não atualizou ninguém, criar novo usuário
    const usuarioExistente = await database.get('SELECT id FROM usuarios WHERE email = ?', [email]);
    if (!usuarioExistente) {
      await database.run(
        `INSERT INTO usuarios (email, senha, nome_completo, nome_cracha, telefone, movimento_origem, perfil, status) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [email, senhaHash, 'Admin Sistema', nomeCracha, '(11) 99999-9999', 'EC', 'equipe_dirigente', 'confirmado']
      );
    }

    console.log('✅ Usuário Equipe Dirigente criado/atualizado com sucesso!');
    console.log('📧 Email: admin@teste.com');
    console.log('🔑 Senha: 123456');
    console.log('\n🌐 Faça login em http://localhost:5000/frontend/index.html');
    process.exit(0);
  } catch (err) {
    console.error('❌ Erro ao criar usuário:', err.message);
    process.exit(1);
  }
}

// Inicializar banco e criar admin
database.initDb();
setTimeout(criarAdmin, 500);
