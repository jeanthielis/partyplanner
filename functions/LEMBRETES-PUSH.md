# Lembretes de Evento — E-mail (véspera) + Push (dia)

Duas funcionalidades complementares foram adicionadas:

## A) E-mail na véspera — "Amanhã você tem X eventos"
Nova função agendada `tomorrowEventsReminder` roda **todo dia às 18h** (horário de Brasília) e envia, para cada decorador, os eventos marcados para o **dia seguinte**. Reaproveita o mesmo SMTP do relatório semanal — nenhuma config extra além do que você já fez.

Respeita opt-out: quem tiver `dailyReminderOptOut: true` no doc não recebe.

## B) Notificação push — "Tem evento hoje!"
Função agendada `todayEventsPush` roda **todo dia às 07:30** e envia uma notificação ao celular do decorador com eventos **naquele dia**. Ao tocar, abre o app.

### Configuração do Push (3 passos extras)

1. **Gerar a chave VAPID:**
   Firebase Console → Configurações do Projeto → **Cloud Messaging** → aba "Certificados push da Web" → **Gerar par de chaves**. Copie a chave pública.

2. **Colar a chave no app:**
   Em `js/app.js`, localize `const VAPID_KEY = 'COLE_SUA_CHAVE_VAPID_AQUI'` e cole a chave gerada.

3. **Publicar as funções:**
   ```bash
   cd functions && firebase deploy --only functions
   ```
   Isso publica `tomorrowEventsReminder`, `todayEventsPush` (e mantém as anteriores).

### Como o decorador ativa
Na aba **Empresa** do app, botão "Ativar notificações neste dispositivo". O navegador pede permissão; ao aceitar, o token do aparelho é salvo no Firestore (`fcmToken`) e as notificações passam a chegar.

> 📱 **Importante:** para receber notificações com o app fechado, o decorador deve **instalar o PWA na tela inicial** (Android: menu → "Adicionar à tela inicial"; iPhone: Safari → Compartilhar → "Adicionar à Tela de Início" — iOS 16.4+ suporta push em PWAs instalados).

### Arquivos envolvidos
- `firebase-messaging-sw.js` (raiz) — service worker exigido pelo FCM para push em segundo plano
- `sw.js` — handlers de push/clique também no SW principal
- `js/firebase.js` — inicialização do messaging
- `functions/index.js` — funções agendadas

## Custo
Ambas rodam 1x/dia por decorador. Dentro da cota gratuita do plano Blaze — praticamente R$ 0.
