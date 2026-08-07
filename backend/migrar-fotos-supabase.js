require('dotenv').config();

const database = require('./config/database');
const { processarFotoPerfil } = require('./utils/foto');

async function migrarTabela({ tabela, prefixo }) {
  const registros = await database.all(
    `SELECT id, foto_perfil FROM ${tabela} WHERE foto_perfil IS NOT NULL AND foto_perfil LIKE 'data:image/%'`
  );

  let migrados = 0;
  let falhas = 0;

  for (const registro of registros) {
    try {
      const resultado = await processarFotoPerfil(registro.foto_perfil, { obrigatoria: false, prefixo });
      if (resultado.fotoPerfil && resultado.fotoPerfil !== registro.foto_perfil) {
        await database.run(`UPDATE ${tabela} SET foto_perfil = ? WHERE id = ?`, [resultado.fotoPerfil, registro.id]);
        migrados += 1;
      }
    } catch (err) {
      falhas += 1;
      console.error(`Falha ao migrar ${tabela} ${registro.id}:`, err.message || err);
    }
  }

  return { tabela, encontrados: registros.length, migrados, falhas };
}

async function main() {
  await database.initDb();

  const resultados = [];
  resultados.push(await migrarTabela({ tabela: 'usuarios', prefixo: 'usuarios' }));
  resultados.push(await migrarTabela({ tabela: 'pessoas_externas', prefixo: 'externos' }));

  console.table(resultados);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    setTimeout(() => process.exit(process.exitCode || 0), 500);
  });
