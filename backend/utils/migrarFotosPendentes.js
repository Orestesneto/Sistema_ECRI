const database = require('../config/database');
const { processarFotoPerfil } = require('./foto');
const { ehUrlImagem, obterConfigSupabaseStorage } = require('./supabaseStorage');

let migracaoPromise = null;

async function migrarTabela(tabela, prefixo) {
  const registros = await database.all(
    `SELECT id, foto_perfil FROM ${tabela}
     WHERE foto_perfil IS NOT NULL AND foto_perfil LIKE 'data:image/%'`
  );
  let migrados = 0;
  for (const registro of registros) {
    const resultado = await processarFotoPerfil(registro.foto_perfil, { prefixo });
    if (!ehUrlImagem(resultado.fotoPerfil)) {
      throw new Error(`Upload da foto ${tabela} #${registro.id} nao retornou URL valida`);
    }
    const atualizacao = await database.run(
      `UPDATE ${tabela} SET foto_perfil = ? WHERE id = ? AND foto_perfil = ?`,
      [resultado.fotoPerfil, registro.id, registro.foto_perfil]
    );
    if (atualizacao.changes) migrados += 1;
  }
  return { tabela, encontrados: registros.length, migrados };
}

async function executarMigracaoFotosPendentes() {
  const config = obterConfigSupabaseStorage();
  if (!config.configurado) {
    console.warn('Migracao de fotos ignorada: Supabase Storage nao configurado');
    return [];
  }
  const resultados = [
    await migrarTabela('usuarios', 'usuarios'),
    await migrarTabela('pessoas_externas', 'externos')
  ];
  if (resultados.some(item => item.encontrados)) console.log('Migracao de fotos concluida:', resultados);
  return resultados;
}

function garantirMigracaoFotosPendentes() {
  if (!migracaoPromise) {
    migracaoPromise = database.initDb()
      .then(executarMigracaoFotosPendentes)
      .catch(err => {
        console.error('Erro ao migrar fotos Base64 pendentes:', err.message || err);
        return [];
      });
  }
  return migracaoPromise;
}

module.exports = { garantirMigracaoFotosPendentes };
