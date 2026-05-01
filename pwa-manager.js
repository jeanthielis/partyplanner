/**
 * PartyPlanner Pro - PWA Service Worker Manager
 * Gerencia o registro e atualização do Service Worker
 */

class ServiceWorkerManager {
  constructor(swPath = './sw.js') {
    this.swPath = swPath;
    this.isUpdateAvailable = false;
    this.registration = null;
    this.init();
  }

  /**
   * Inicializa o Service Worker
   */
  async init() {
    if (!('serviceWorker' in navigator)) {
      console.warn('[PWA] 📱 Service Workers não são suportados neste navegador');
      return;
    }

    try {
      this.registration = await navigator.serviceWorker.register(this.swPath, {
        scope: './'
      });

      console.log('[PWA] ✅ Service Worker registrado com sucesso');
      this.setupUpdateListener();
      this.logRegistrationInfo();
    } catch (error) {
      console.error('[PWA] ❌ Erro ao registrar Service Worker:', error);
    }
  }

  /**
   * Configura listener para detectar atualizações
   */
  setupUpdateListener() {
    if (!this.registration) return;

    // Verificar atualizações a cada 6 horas
    setInterval(() => {
      this.checkForUpdates();
    }, 6 * 60 * 60 * 1000);

    // Listener para quando uma nova versão for instalada
    this.registration.addEventListener('updatefound', () => {
      const newWorker = this.registration.installing;

      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'activated') {
          this.handleUpdateAvailable();
        }
      });
    });

    // Listener para mensagens do Service Worker
    navigator.serviceWorker.addEventListener('message', event => {
      this.handleSWMessage(event.data);
    });
  }

  /**
   * Verifica se há atualizações disponíveis
   */
  async checkForUpdates() {
    if (!this.registration) return;

    try {
      await this.registration.update();
      console.log('[PWA] 🔄 Verificação de atualizações concluída');
    } catch (error) {
      console.error('[PWA] ❌ Erro ao verificar atualizações:', error);
    }
  }

  /**
   * Manipula atualização disponível
   */
  handleUpdateAvailable() {
    this.isUpdateAvailable = true;
    console.log('[PWA] 🎉 Nova versão disponível!');

    // Mostrar notificação ao usuário
    this.showUpdateNotification();

    // Disparar evento customizado
    window.dispatchEvent(new CustomEvent('sw-update-available'));
  }

  /**
   * Mostra notificação de atualização (customizável)
   */
  showUpdateNotification() {
    // Verifica se o SweetAlert2 está disponível
    if (typeof Swal !== 'undefined') {
      Swal.fire({
        title: '🎉 Atualização Disponível',
        text: 'Uma nova versão do PartyPlanner Pro está disponível!',
        icon: 'info',
        confirmButtonText: 'Atualizar Agora',
        cancelButtonText: 'Depois',
        allowOutsideClick: false,
        showCancelButton: true,
        confirmButtonColor: '#6366F1'
      }).then(result => {
        if (result.isConfirmed) {
          this.skipWaiting();
        }
      });
    } else {
      // Fallback para notificação nativa
      if (confirm('Uma nova versão do PartyPlanner Pro está disponível. Deseja atualizar?')) {
        this.skipWaiting();
      }
    }
  }

  /**
   * Pula a espera e ativa o novo Service Worker
   */
  skipWaiting() {
    if (!this.registration || !this.registration.waiting) return;

    this.registration.waiting.postMessage({ type: 'SKIP_WAITING' });

    // Recarregar a página após a atualização
    window.addEventListener('controllerchange', () => {
      window.location.reload();
    });
  }

  /**
   * Manipula mensagens do Service Worker
   */
  handleSWMessage(data) {
    console.log('[PWA] 📨 Mensagem do SW:', data);

    switch (data.type) {
      case 'CACHE_UPDATED':
        console.log('[PWA] 💾 Cache atualizado');
        break;
      case 'OFFLINE_MODE':
        console.log('[PWA] 📴 Modo offline ativado');
        break;
      case 'ONLINE_MODE':
        console.log('[PWA] 🌐 Modo online ativado');
        break;
    }
  }

  /**
   * Log de informações de registro
   */
  logRegistrationInfo() {
    console.log('[PWA] 📊 Informações do Service Worker:');
    console.log('[PWA] - URL:', this.registration.scope);
    console.log('[PWA] - Atualizado em:', new Date(this.registration.updateViaCache));
  }

  /**
   * Limpa o cache (útil para debug)
   */
  async clearCache() {
    if (!this.registration) return;

    if (this.registration.active) {
      this.registration.active.postMessage({ type: 'CLEAR_CACHE' });
    }

    try {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map(name => caches.delete(name)));
      console.log('[PWA] 🗑️  Cache limpo com sucesso');
    } catch (error) {
      console.error('[PWA] ❌ Erro ao limpar cache:', error);
    }
  }

  /**
   * Obtém o tamanho do cache
   */
  async getCacheSize() {
    return new Promise((resolve) => {
      if ('storage' in navigator && 'estimate' in navigator.storage) {
        navigator.storage.estimate().then(estimate => {
          const size = (estimate.usage / 1024 / 1024).toFixed(2);
          const quota = (estimate.quota / 1024 / 1024).toFixed(2);
          resolve({ size, quota });
          console.log(`[PWA] 💾 Cache: ${size}MB / ${quota}MB`);
        });
      } else {
        resolve(null);
      }
    });
  }

  /**
   * Verifica status de conectividade
   */
  getOnlineStatus() {
    return navigator.onLine;
  }

  /**
   * Monitora mudanças de conectividade
   */
  onlineStatusListener() {
    window.addEventListener('online', () => {
      console.log('[PWA] 🌐 Conectado à internet');
      window.dispatchEvent(new CustomEvent('app-online'));
    });

    window.addEventListener('offline', () => {
      console.log('[PWA] 📴 Desconectado da internet');
      window.dispatchEvent(new CustomEvent('app-offline'));
    });
  }

  /**
   * Força sincronização em background
   */
  async syncData() {
    if (!this.registration || !('sync' in this.registration)) {
      console.warn('[PWA] Background Sync não é suportado');
      return;
    }

    try {
      await this.registration.sync.register('sync-events');
      await this.registration.sync.register('sync-clients');
      console.log('[PWA] ✅ Sincronização agendada');
    } catch (error) {
      console.error('[PWA] ❌ Erro ao agendar sincronização:', error);
    }
  }

  /**
   * Solicita permissão para notificações
   */
  async requestNotificationPermission() {
    if (!('Notification' in window)) {
      console.warn('[PWA] Notificações não são suportadas');
      return false;
    }

    if (Notification.permission === 'granted') {
      return true;
    }

    if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    }

    return false;
  }

  /**
   * Envia notificação
   */
  async sendNotification(title, options = {}) {
    if (!this.registration) return;

    const defaultOptions = {
      icon: './icon-192.png',
      badge: './icon-192.png',
      tag: 'partyplanner',
      ...options
    };

    try {
      await this.registration.showNotification(title, defaultOptions);
    } catch (error) {
      console.error('[PWA] ❌ Erro ao enviar notificação:', error);
    }
  }
}

// Auto-inicializar quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
  window.pwaManager = new ServiceWorkerManager('./sw.js');
  
  // Configurar listeners de conectividade
  window.pwaManager.onlineStatusListener();

  // Solicitar permissão de notificações
  window.pwaManager.requestNotificationPermission();
});

// Exportar para uso global
window.ServiceWorkerManager = ServiceWorkerManager;
