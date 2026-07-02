(function () {
    function normalizarTexto(texto) {
        return String(texto || '').replace(/\s+/g, ' ').trim();
    }

    function obterRotulosTabela(tabela) {
        const cabecalhos = Array.from(tabela.querySelectorAll('thead th'));
        if (cabecalhos.length) {
            return cabecalhos.map((th) => normalizarTexto(th.textContent));
        }

        const primeiraLinha = tabela.querySelector('tr');
        return primeiraLinha
            ? Array.from(primeiraLinha.children).map((celula) => normalizarTexto(celula.textContent))
            : [];
    }

    function prepararTabela(tabela) {
        if (!tabela || tabela.dataset.cardsMobilePreparada === 'true') return;
        const wrapper = tabela.closest('.table-responsive');
        if (!wrapper) return;

        const rotulos = obterRotulosTabela(tabela);
        if (!rotulos.length) return;

        tabela.classList.add('tabela-card-mobile');
        wrapper.classList.add('table-responsive-cards-mobile');
        Array.from(tabela.querySelectorAll('tbody tr')).forEach((linha) => {
            Array.from(linha.children).forEach((celula, indice) => {
                const rotulo = rotulos[indice] || '';
                if (rotulo) celula.setAttribute('data-label', rotulo);
            });
        });

        tabela.dataset.cardsMobilePreparada = 'true';
    }

    function prepararTabelas(contexto = document) {
        contexto.querySelectorAll?.('.table-responsive table').forEach(prepararTabela);
    }

    document.addEventListener('DOMContentLoaded', () => {
        prepararTabelas();

        const observer = new MutationObserver((mutacoes) => {
            mutacoes.forEach((mutacao) => {
                mutacao.addedNodes.forEach((node) => {
                    if (!(node instanceof Element)) return;

                    if (node.matches?.('.table-responsive table')) {
                        prepararTabela(node);
                    }
                    prepararTabelas(node);
                });
            });
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    });
})();
