function apenasNumeros(valor) {
  return String(valor || '').replace(/\D/g, '');
}

function cpfValido(valor) {
  const cpf = apenasNumeros(valor);

  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) {
    return false;
  }

  const calcularDigito = (base) => {
    let soma = 0;
    for (let i = 0; i < base.length; i += 1) {
      soma += Number(base[i]) * (base.length + 1 - i);
    }

    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };

  const primeiroDigito = calcularDigito(cpf.slice(0, 9));
  const segundoDigito = calcularDigito(cpf.slice(0, 10));

  return cpf === `${cpf.slice(0, 9)}${primeiroDigito}${segundoDigito}`;
}

module.exports = {
  apenasNumeros,
  cpfValido
};
