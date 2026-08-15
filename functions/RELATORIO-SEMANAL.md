# Relatório Semanal de Eventos — Guia de Publicação

Esta funcionalidade envia, **toda segunda-feira às 07h (horário de Brasília)**, um e-mail para cada decorador com os eventos dos próximos 7 dias. Também há um botão "Enviar agora (testar)" na aba **Empresa** do app.

## Pré-requisitos
- Plano **Blaze** do Firebase (o agendador Cloud Scheduler exige; o custo em baixo volume é praticamente zero).
- Node.js 20+ e Firebase CLI (`npm install -g firebase-tools`).

## Passo a passo

### 1. Instalar dependências
```bash
cd functions
npm install
```

### 2. Configurar as credenciais de e-mail (SMTP)
O código usa Gmail como exemplo. Crie uma **Senha de app** na sua conta Google (Conta Google → Segurança → Verificação em duas etapas → Senhas de app) e registre os secrets:

```bash
firebase functions:secrets:set SMTP_USER
# cole seu endereço Gmail, ex: seuemail@gmail.com

firebase functions:secrets:set SMTP_PASS
# cole a senha de app de 16 caracteres
```

> Para outro provedor (SendGrid, Amazon SES, etc.), troque o bloco `nodemailer.createTransport` em `index.js` pelo host/port do provedor.

### 3. Publicar as funções
```bash
firebase deploy --only functions
```

Isso cria duas funções:
- `weeklyEventsReport` — agendada (segunda 07h), dispara sozinha.
- `sendWeeklyReportNow` — chamada pelo botão de teste dentro do app.

### 4. Verificar o agendamento
No Console do Google Cloud → **Cloud Scheduler**, deve aparecer um job apontando para `weeklyEventsReport` com o cron `0 7 * * 1` no fuso `America/Sao_Paulo`.

## Como funciona
- A cada segunda, a função percorre a coleção `users`, e para cada decorador busca os `appointments` com `status: pending` cuja `date` cai nos próximos 7 dias.
- Se não houver eventos, aquele decorador é **pulado** (não recebe e-mail vazio).
- Decoradores que desmarcaram a opção na aba Empresa têm `weeklyReportOptOut: true` e são ignorados.
- O e-mail traz uma tabela com data/hora, cliente/local, valor e saldo a receber, além de totais da semana.

## Ajustes rápidos
- **Mudar o dia/horário:** edite `schedule: "0 7 * * 1"` em `index.js` (formato cron; `1` = segunda).
- **Mudar a janela de dias:** o `getUpcomingEvents(userId, 7)` aceita outro número de dias.
- **Região:** está em `southamerica-east1` (São Paulo) para menor latência no Brasil.

## Custo estimado
Para dezenas de decoradores e um envio semanal, fica dentro da cota gratuita do Blaze (as primeiras 2 milhões de invocações/mês são gratuitas). O gasto real tende a R$ 0,00–0,05/mês.
