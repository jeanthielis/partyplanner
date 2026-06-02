// ============================================
// PWA Manager - PartyPlanner Pro
// ============================================

// 1. Registro do Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        // Usa path relativo para funcionar em qualquer subpasta/hospedagem
        navigator.serviceWorker.register('./sw.js', { scope: './' })
            .then((registration) => {
                console.log('PWA: Service Worker registrado.', registration.scope);

                // Monitora atualizações
                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            // Toast de atualização sem bloquear a UI com confirm()
                            const toast = document.createElement('div');
                            toast.id = 'pwa-update-toast';
                            toast.innerHTML = `
                                <span>🎉 Nova versão disponível!</span>
                                <button id="pwa-update-btn" style="margin-left:12px;background:#6366F1;color:#fff;border:none;padding:6px 14px;border-radius:8px;cursor:pointer;font-weight:600;">Atualizar</button>
                                <button id="pwa-dismiss-btn" style="margin-left:6px;background:transparent;color:#94a3b8;border:none;cursor:pointer;font-size:18px;line-height:1;">&times;</button>
                            `;
                            toast.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#1e293b;color:#e2e8f0;padding:14px 20px;border-radius:14px;box-shadow:0 8px 32px rgba(0,0,0,0.4);z-index:9999;display:flex;align-items:center;gap:4px;font-family:sans-serif;font-size:14px;border:1px solid #334155;';
                            document.body.appendChild(toast);

                            document.getElementById('pwa-update-btn').onclick = () => {
                                newWorker.postMessage({ type: 'SKIP_WAITING' });
                                window.location.reload();
                            };
                            document.getElementById('pwa-dismiss-btn').onclick = () => toast.remove();
                        }
                    });
                });
            })
            .catch((error) => {
                console.error('PWA: Falha ao registrar Service Worker.', error);
            });
    });
}

// 2. Lógica de instalação customizada (Add to Home Screen)
let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;

    // Mostra botão de instalação se existir no HTML
    const installBtn = document.getElementById('btn-instala-app');
    if (installBtn) {
        installBtn.style.display = 'flex';

        installBtn.addEventListener('click', async () => {
            if (deferredPrompt) {
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                console.log('PWA: Resultado da instalação:', outcome);
                deferredPrompt = null;
                installBtn.style.display = 'none';
            }
        });
    }
});

// Esconde o botão após instalação concluída
window.addEventListener('appinstalled', () => {
    console.log('PWA: App instalado com sucesso!');
    deferredPrompt = null;
    const installBtn = document.getElementById('btn-instala-app');
    if (installBtn) installBtn.style.display = 'none';
});
