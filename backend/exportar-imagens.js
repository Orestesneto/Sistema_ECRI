const database = require('./config/database');
const fs = require('fs');
const path = require('path');

async function exportarImagens() {
  try {
    console.log('📊 Buscando imagens do banco de dados...\n');

    // Buscar usuários com foto
    const usuarios = await database.all(`
      SELECT id, email, nome_completo, foto_perfil FROM usuarios WHERE foto_perfil IS NOT NULL
    `);

    if (usuarios.length === 0) {
      console.log('❌ Nenhuma imagem encontrada no banco de dados');
      process.exit(0);
    }

    // Criar pasta para exportar imagens
    const pastaExport = path.join(__dirname, '../imagens_exportadas');
    if (!fs.existsSync(pastaExport)) {
      fs.mkdirSync(pastaExport, { recursive: true });
    }

    console.log(`✅ ${usuarios.length} imagem(ns) encontrada(s)\n`);

    // Exportar cada imagem
    usuarios.forEach((usuario, index) => {
      if (usuario.foto_perfil && usuario.foto_perfil.startsWith('data:')) {
        // Base64 com prefixo data:image
        const base64Data = usuario.foto_perfil.split(',')[1];
        const buffer = Buffer.from(base64Data, 'base64');
        
        // Determinar extensão
        let ext = 'jpg';
        if (usuario.foto_perfil.includes('png')) ext = 'png';
        if (usuario.foto_perfil.includes('gif')) ext = 'gif';
        if (usuario.foto_perfil.includes('webp')) ext = 'webp';
        
        const nomeArquivo = `${usuario.id}_${usuario.email.split('@')[0]}.${ext}`;
        const caminhoArquivo = path.join(pastaExport, nomeArquivo);
        
        fs.writeFileSync(caminhoArquivo, buffer);
        console.log(`✅ ${index + 1}. ${usuario.nome_completo}`);
        console.log(`   📧 Email: ${usuario.email}`);
        console.log(`   📁 Arquivo: ${nomeArquivo}`);
        console.log(`   📏 Tamanho: ${(buffer.length / 1024).toFixed(2)} KB\n`);
      }
    });

    console.log(`\n✅ Todas as imagens foram exportadas em: ${pastaExport}`);
    process.exit(0);
  } catch (err) {
    console.error('❌ Erro:', err.message);
    process.exit(1);
  }
}

// Inicializar banco e exportar
database.initDb();
setTimeout(exportarImagens, 500);
