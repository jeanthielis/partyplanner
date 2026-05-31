// 1. Registro do Service Worker e Atualizações
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').then((registration) => {
            console.log('PWA: Service Worker registrado com sucesso.', registration.scope);
            
            // Monitora atualizações no código
            registration.addEventListener('updatefound', () => {
                const newWorker = registration.installing;
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        // Mostra um aviso ao usuário pedindo para recarregar a página
                        if (confirm('Uma nova versão do PartyPlanner está disponível! Deseja atualizar agora?')) {
                            window.location.reload();
                        }
                    }
                });
            });
        }).catch((error) => {
            console.error('PWA: Falha ao registrar o Service Worker.', error);
        });
    });
}

// 2. Lógica para Instalação Customizada (Add to Home Screen)
let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
    // Previne que o navegador mostre o prompt padrão automaticamente (para mobile)
    e.preventDefault();
    // Guarda o evento para ser usado quando o usuário clicar no botão
    deferredPrompt = e;
    
    // Procura um botão no seu HTML com o ID 'btn-instala-app' e o torna visível
    const installBtn = document.getElementById('btn-instala-app');
    if (installBtn) {
        installBtn.style.display = 'block'; 
        
        installBtn.addEventListener('click', async () => {
            if (deferredPrompt) {
                // Mostra o prompt oficial de instalação
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                console.log(`PWA: Escolha de instalação do usuário: ${outcome}`);
                
                // Limpa o prompt e esconde o botão após a ação
                deferredPrompt = null;
                installBtn.style.display = 'none'; 
            }
        });
    }
});
