function obterAlvoAba(link) {
    const alvo = link?.getAttribute('href') || link?.getAttribute('data-bs-target') || '';
    return alvo.startsWith('#') ? alvo.slice(1) : '';
}

function abaVisivel(link) {
    if (!link) return false;
    const item = link.closest('.nav-item') || link;
    const alvo = obterAlvoAba(link);
    const painel = alvo ? document.getElementById(alvo) : null;
    return !item.classList.contains('d-none') && !link.classList.contains('d-none') && !painel?.classList.contains('d-none');
}

function configurarPersistenciaAbas(chaveStorage) {
    document.querySelectorAll('[data-bs-toggle="tab"]').forEach((link) => {
        link.addEventListener('shown.bs.tab', (event) => {
            const alvo = obterAlvoAba(event.target);
            if (alvo) localStorage.setItem(chaveStorage, alvo);
        });
    });
}

function abrirAbaPersistida(chaveStorage, abaPadrao) {
    const abaSalva = localStorage.getItem(chaveStorage) || abaPadrao;
    const link = document.querySelector(`[data-bs-toggle="tab"][href="#${abaSalva}"], [data-bs-toggle="tab"][data-bs-target="#${abaSalva}"]`);

    if (!abaVisivel(link)) {
        if (abaPadrao && abaSalva !== abaPadrao) {
            return abrirAbaPersistida(chaveStorage, abaPadrao);
        }
        return false;
    }

    if (window.bootstrap?.Tab) {
        bootstrap.Tab.getOrCreateInstance(link).show();
        return true;
    }

    link.click();
    return true;
}
