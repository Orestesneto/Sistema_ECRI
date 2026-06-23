const database = require('./config/database');

async function listarImagens() {
  try {
    console.log('\n═════════════════════════════════════════════════════════');
    console.log('📸 IMAGENS DE PERFIL DO BANCO DE DADOS');
    console.log('═════════════════════════════════════════════════════════\n');

    // Buscar todos os usuários
    const usuarios = await database.all(`
      SELECT id, email, nome_completo, nome_cracha, perfil, 
             CASE WHEN foto_perfil IS NOT NULL THEN 'SIM ✅' ELSE 'NÃO ❌' END as tem_foto,
             CASE WHEN foto_perfil IS NOT NULL THEN LENGTH(foto_perfil) ELSE 0 END as tamanho_bytes
      FROM usuarios
      ORDER BY id
    `);

    if (usuarios.length === 0) {
      console.log('Nenhum usuário encontrado');
      process.exit(0);
    }

    let totalComFoto = 0;
    let totalSemFoto = 0;
    let tamanhoTotal = 0;

    console.log('ID  | Nome Completo          | Email                    | Perfil           | Foto | Tamanho');
    console.log('─'.repeat(110));

    usuarios.forEach(u => {
      const comFoto = u.tem_foto === 'SIM ✅';
      if (comFoto) {
        totalComFoto++;
        tamanhoTotal += u.tamanho_bytes;
      } else {
        totalSemFoto++;
      }

      const tamanhoKB = comFoto ? (u.tamanho_bytes / 1024).toFixed(2) : '-';
      const tamanhoDisplay = comFoto ? `${tamanhoKB} KB` : '-';

      console.log(
        `${String(u.id).padEnd(3)} | ${u.nome_completo.padEnd(22)} | ${u.email.padEnd(24)} | ${u.perfil.padEnd(16)} | ${u.tem_foto.padEnd(4)} | ${tamanhoDisplay}`
      );
    });

    console.log('─'.repeat(110));
    console.log(`\n📊 RESUMO:`);
    console.log(`   Total de usuários: ${usuarios.length}`);
    console.log(`   Com foto: ${totalComFoto} ✅`);
    console.log(`   Sem foto: ${totalSemFoto} ❌`);
    console.log(`   Tamanho total de imagens: ${(tamanhoTotal / 1024 / 1024).toFixed(2)} MB`);
    console.log('\n💡 Para exportar as imagens, execute: node exportar-imagens.js');
    console.log('💡 Para acessar pelo SQLite, execute: sqlite3 sistema_ecri.db\n');

    process.exit(0);
  } catch (err) {
    console.error('❌ Erro:', err.message);
    process.exit(1);
  }
}

// Inicializar banco e listar
database.initDb();
setTimeout(listarImagens, 500);
