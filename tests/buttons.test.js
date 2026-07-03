const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const FRONTEND_DIR = path.join(ROOT, 'frontend');

function listarArquivos(dir, extensoes) {
  const entradas = fs.readdirSync(dir, { withFileTypes: true });
  return entradas.flatMap((entrada) => {
    const caminho = path.join(dir, entrada.name);
    if (entrada.isDirectory()) return listarArquivos(caminho, extensoes);
    return extensoes.includes(path.extname(entrada.name)) ? [caminho] : [];
  });
}

function parseAttrs(tag) {
  const attrs = {};
  const regex = /([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let match;

  while ((match = regex.exec(tag))) {
    const nome = match[1].toLowerCase();
    if (nome === 'button' || nome === 'a') continue;
    attrs[nome] = match[2] ?? match[3] ?? match[4] ?? '';
  }

  return attrs;
}

function textoControle(conteudo, inicioTag) {
  const fechamento = conteudo.indexOf('>', inicioTag);
  if (fechamento === -1) return '';

  const fim = conteudo.indexOf('</', fechamento);
  if (fim === -1) return '';

  return conteudo
    .slice(fechamento + 1, fim)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\$\{[^}]+\}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extrairControles(arquivo) {
  const conteudo = fs.readFileSync(arquivo, 'utf8');
  const controles = [];
  const regex = /<(button|a)\b[^>]*>/gi;
  let match;

  while ((match = regex.exec(conteudo))) {
    const tag = match[0];
    const tipoTag = match[1].toLowerCase();
    const attrs = parseAttrs(tag);
    const classe = attrs.class || '';
    const ehBotao = tipoTag === 'button' || /\bbtn\b/.test(classe) || /\bbtn-/.test(classe);

    if (!ehBotao) continue;

    controles.push({
      arquivo: path.relative(ROOT, arquivo),
      tag,
      attrs,
      texto: textoControle(conteudo, match.index)
    });
  }

  return controles;
}

function idTemListener(js, id) {
  if (!id) return false;

  const idEscapado = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const padroes = [
    new RegExp(`getElementById\\(['"\`]${idEscapado}['"\`]\\)\\?\\.addEventListener\\(['"\`]click['"\`]`),
    new RegExp(`getElementById\\(['"\`]${idEscapado}['"\`]\\).*?addEventListener\\(['"\`]click['"\`]`, 's'),
    new RegExp(`#${idEscapado}['"\`]\\).*?addEventListener\\(['"\`]click['"\`]`, 's')
  ];

  return padroes.some((padrao) => padrao.test(js));
}

function classeTemDelegacao(js, classe) {
  if (!classe) return false;

  return classe
    .split(/\s+/)
    .filter(Boolean)
    .some((nomeClasse) => {
      const classeEscapada = nomeClasse.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`closest\\(['"\`]\\.${classeEscapada}['"\`]\\)`).test(js)
        || new RegExp(`querySelector(All)?\\(['"\`]\\.${classeEscapada}['"\`]\\)`).test(js);
    });
}

function controleTemAcao(controle, js) {
  const { attrs } = controle;
  const tipo = String(attrs.type || '').toLowerCase();
  const href = String(attrs.href || '');

  if (attrs.disabled !== undefined) return true;
  if (tipo === 'submit') return true;
  if (attrs.onclick) return true;
  if (attrs.href && href !== '#') return true;
  if (attrs['data-bs-dismiss']) return true;
  if (attrs['data-bs-toggle']) return true;
  if (attrs['data-bs-target']) return true;
  if (idTemListener(js, attrs.id)) return true;
  if (classeTemDelegacao(js, attrs.class)) return true;

  return false;
}

test('todos os botoes do frontend possuem uma acao rastreavel', () => {
  const arquivos = listarArquivos(FRONTEND_DIR, ['.html', '.js']);
  const js = arquivos
    .filter((arquivo) => path.extname(arquivo) === '.js')
    .map((arquivo) => fs.readFileSync(arquivo, 'utf8'))
    .join('\n');

  const controles = arquivos.flatMap(extrairControles);
  const semAcao = controles.filter((controle) => !controleTemAcao(controle, js));

  assert.ok(controles.length > 100, `Inventario encontrou apenas ${controles.length} botoes/links de botao.`);
  assert.deepEqual(
    semAcao.map((controle) => ({
      arquivo: controle.arquivo,
      id: controle.attrs.id || '',
      class: controle.attrs.class || '',
      texto: controle.texto,
      tag: controle.tag
    })),
    []
  );
});
