const bcrypt = require('bcryptjs');
const database = require('./config/database');

async function migrarExternosConfirmados() {
  await database.initDb();

  const externos = await database.all(`
    SELECT *
    FROM pessoas_externas
    WHERE status IN ('confirmado', 'negou', 'desistiu')
      AND cpf IS NOT NULL
      AND cpf <> ''
      AND data_nascimento IS NOT NULL
      AND data_nascimento <> ''
  `);

  let migrados = 0;
  let ignorados = 0;

  for (const externo of externos) {
    const cpf = String(externo.cpf || '').replace(/\D/g, '');
    const dataNascimento = String(externo.data_nascimento || '').replace(/\D/g, '');

    if (cpf.length !== 11 || dataNascimento.length !== 8) {
      ignorados += 1;
      continue;
    }

    const existente = await database.get('SELECT id FROM usuarios WHERE cpf = ?', [cpf]);
    if (existente) {
      await database.run('DELETE FROM pessoas_externas WHERE id = ?', [externo.id]);
      ignorados += 1;
      continue;
    }

    const senhaHash = await bcrypt.hash(dataNascimento, 10);
    const emailTemporario = `${cpf}@sem-cadastro.ecri.local`;

    await database.run(
      `INSERT INTO usuarios (
        email, senha, nome_completo, nome_cracha, telefone, cpf, data_nascimento,
        movimento_origem, foto_perfil, restricao_medica, restricao_alimentar,
        restricao_medicacao, perfil, status, equipe
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        emailTemporario,
        senhaHash,
        externo.nome_completo,
        externo.nome_cracha || externo.nome_completo,
        externo.telefone,
        cpf,
        dataNascimento,
        externo.movimento_origem,
        externo.foto_perfil,
        externo.restricao_medica || '',
        externo.restricao_alimentar || '',
        externo.restricao_medicacao || '',
        'equipista',
        externo.status,
        externo.equipe
      ]
    );

    await database.run('DELETE FROM pessoas_externas WHERE id = ?', [externo.id]);
    migrados += 1;
  }

  console.log(`Migrados: ${migrados}`);
  console.log(`Ignorados: ${ignorados}`);
}

migrarExternosConfirmados()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
