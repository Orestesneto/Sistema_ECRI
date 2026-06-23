const database = require('./config/database');

async function atualizarPerfil() {
  try {
    console.log('Atualizando perfil de Orestes Pereira...\n');

    // Atualizar perfil
    const resultado = await database.run(
      `UPDATE usuarios SET perfil = 'equipe_dirigente' WHERE email = ?`,
      ['orestes.pereira@gmail.com']
    );

    // Verificar o resultado
    const usuario = await database.get(
      `SELECT id, nome_completo, email, perfil FROM usuarios WHERE email = ?`,
      ['orestes.pereira@gmail.com']
    );

    if (usuario) {
      console.log('✅ Perfil atualizado com sucesso!\n');
      console.log('📋 Detalhes do usuário:');
      console.log(`   ID: ${usuario.id}`);
      console.log(`   Nome: ${usuario.nome_completo}`);
      console.log(`   Email: ${usuario.email}`);
      console.log(`   Novo Perfil: ${usuario.perfil} 👑\n`);
      console.log('🔑 Você pode fazer login com:');
      console.log(`   Email: ${usuario.email}`);
      console.log(`   Senha: (a mesma que você tinha)\n`);
    } else {
      console.log('❌ Usuário não encontrado');
    }

    process.exit(0);
  } catch (err) {
    console.error('❌ Erro:', err.message);
    process.exit(1);
  }
}

// Inicializar banco e atualizar
database.initDb();
setTimeout(atualizarPerfil, 500);
