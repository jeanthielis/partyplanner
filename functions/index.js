/**
 * PartyPlanner Pro — Relatório Semanal de Eventos
 * ------------------------------------------------
 * Cloud Function agendada (Cloud Scheduler) que roda TODA SEGUNDA-FEIRA
 * às 07:00 (horário de São Paulo), monta o relatório dos próximos eventos
 * de cada decorador e envia por e-mail.
 *
 * Também expõe uma função "callable" (sendWeeklyReportNow) para o botão
 * "Enviar agora / testar" dentro do app.
 */

const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");

admin.initializeApp();
setGlobalOptions({ region: "southamerica-east1", maxInstances: 10 });

// Credenciais SMTP guardadas como Secrets (nunca no código).
// Defina com: firebase functions:secrets:set SMTP_USER  / SMTP_PASS
const SMTP_USER = defineSecret("SMTP_USER");
const SMTP_PASS = defineSecret("SMTP_PASS");

// ─── Helpers ────────────────────────────────────────────────────────
const db = admin.firestore();

function ymd(date) {
  return date.toISOString().slice(0, 10);
}

function formatDateBR(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function brl(v) {
  const n = Number(v) || 0;
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * Busca os eventos pendentes de um decorador nos próximos `days` dias.
 */
async function getUpcomingEvents(userId, days = 7) {
  const today = new Date();
  const end = new Date();
  end.setDate(today.getDate() + days);
  const todayStr = ymd(today);
  const endStr = ymd(end);

  // Filtro simples por userId + status (evita índice composto);
  // o intervalo de data é filtrado em memória.
  const snap = await db
    .collection("appointments")
    .where("userId", "==", userId)
    .where("status", "==", "pending")
    .get();

  const events = [];
  snap.forEach((doc) => {
    const a = doc.data();
    if (a.date && a.date >= todayStr && a.date <= endStr) {
      events.push({ id: doc.id, ...a });
    }
  });

  events.sort((x, y) => (x.date || "").localeCompare(y.date || ""));
  return events;
}

/**
 * Busca eventos pendentes de um decorador numa DATA específica (YYYY-MM-DD).
 */
async function getEventsOnDate(userId, dateStr) {
  const snap = await db
    .collection("appointments")
    .where("userId", "==", userId)
    .where("status", "==", "pending")
    .get();
  const events = [];
  snap.forEach((doc) => {
    const a = doc.data();
    if (a.date === dateStr) events.push({ id: doc.id, ...a });
  });
  return events;
}

/**
 * Resolve o nome do cliente a partir do clientId.
 */
async function getClientName(clientId) {
  if (!clientId) return "Cliente";
  try {
    const doc = await db.collection("clients").doc(clientId).get();
    return doc.exists ? doc.data().name || "Cliente" : "Cliente";
  } catch (e) {
    return "Cliente";
  }
}

/**
 * Monta o HTML do e-mail com a paleta da marca.
 */
async function buildEmailHtml(companyName, events) {
  const rows = await Promise.all(
    events.map(async (e) => {
      const cliente = await getClientName(e.clientId);
      const hora = (e.details && e.details.time) || e.time || "--:--";
      const local = (e.details && e.details.location) || e.location || "A definir";
      const saldo = Number(e.finalBalance) || 0;
      const saldoTag = saldo > 0
        ? `<span style="color:#b0402f;font-weight:600">${brl(saldo)} a receber</span>`
        : `<span style="color:#3f6e3a;font-weight:600">Quitado</span>`;
      return `
        <tr>
          <td style="padding:12px 10px;border-bottom:1px solid #e8e5db;">
            <strong style="color:#2d3a2c">${formatDateBR(e.date)}</strong><br>
            <span style="color:#96a190;font-size:12px">${hora}</span>
          </td>
          <td style="padding:12px 10px;border-bottom:1px solid #e8e5db;color:#2d3a2c">
            <strong>${cliente}</strong><br>
            <span style="color:#96a190;font-size:12px">${local}</span>
          </td>
          <td style="padding:12px 10px;border-bottom:1px solid #e8e5db;text-align:right;color:#2d3a2c">
            ${brl(e.totalServices)}<br>
            <span style="font-size:12px">${saldoTag}</span>
          </td>
        </tr>`;
    })
  );

  const totalReceita = events.reduce((acc, e) => acc + (Number(e.totalServices) || 0), 0);
  const totalReceber = events.reduce((acc, e) => acc + (Number(e.finalBalance) || 0), 0);

  return `
  <div style="font-family:Arial,Helvetica,sans-serif;background:#faf9f5;padding:24px;">
    <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid #e8e5db;">
      <div style="background:linear-gradient(135deg,#6b8a68,#55724f);padding:28px 24px;">
        <h1 style="margin:0;color:#ffffff;font-size:20px;">📅 Seus próximos eventos</h1>
        <p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:13px;">${companyName} · próximos 7 dias</p>
      </div>
      <div style="padding:24px;">
        <p style="color:#55614f;font-size:14px;margin:0 0 18px;">
          Bom dia! Aqui está o resumo dos eventos marcados para esta semana.
        </p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <thead>
            <tr>
              <th style="text-align:left;padding:0 10px 8px;color:#96a190;font-size:11px;text-transform:uppercase;">Data</th>
              <th style="text-align:left;padding:0 10px 8px;color:#96a190;font-size:11px;text-transform:uppercase;">Cliente / Local</th>
              <th style="text-align:right;padding:0 10px 8px;color:#96a190;font-size:11px;text-transform:uppercase;">Valor</th>
            </tr>
          </thead>
          <tbody>${rows.join("")}</tbody>
        </table>
        <div style="margin-top:20px;padding:16px;background:#eef2ec;border-radius:14px;">
          <table style="width:100%;font-size:14px;color:#2d3a2c;">
            <tr>
              <td>Eventos na semana</td>
              <td style="text-align:right;font-weight:700;">${events.length}</td>
            </tr>
            <tr>
              <td>Receita prevista</td>
              <td style="text-align:right;font-weight:700;">${brl(totalReceita)}</td>
            </tr>
            <tr>
              <td>Ainda a receber</td>
              <td style="text-align:right;font-weight:700;color:#b0402f;">${brl(totalReceber)}</td>
            </tr>
          </table>
        </div>
      </div>
      <div style="padding:16px 24px;border-top:1px solid #e8e5db;text-align:center;">
        <p style="margin:0;color:#96a190;font-size:11px;">
          PartyPlanner Pro · relatório automático semanal
        </p>
      </div>
    </div>
  </div>`;
}

/**
 * Processa e envia o relatório de todos os decoradores.
 * Retorna estatísticas do envio.
 */
async function processAndSend(transporter, fromLabel, onlyUserId = null) {
  let usersSnap;
  if (onlyUserId) {
    const one = await db.collection("users").doc(onlyUserId).get();
    usersSnap = { docs: one.exists ? [one] : [] };
  } else {
    usersSnap = await db.collection("users").get();
  }

  let sent = 0;
  let skipped = 0;

  for (const userDoc of usersSnap.docs) {
    const user = userDoc.data();
    const cfg = user.companyConfig || {};
    const email = cfg.email || user.email;
    const companyName = cfg.fantasia || "Sua Empresa";

    // Respeita a preferência do decorador (opt-out)
    if (user.weeklyReportOptOut === true) { skipped++; continue; }
    if (!email) { skipped++; continue; }

    const events = await getUpcomingEvents(userDoc.id, 7);
    if (events.length === 0) { skipped++; continue; } // nada a reportar

    const html = await buildEmailHtml(companyName, events);
    await transporter.sendMail({
      from: fromLabel,
      to: email,
      subject: `📅 Seus ${events.length} evento(s) desta semana — PartyPlanner`,
      html,
    });
    sent++;
  }

  return { sent, skipped, total: usersSnap.docs.length };
}

async function processTomorrowReminders(transporter, fromLabel, onlyUserId = null) {
  // Data de "amanhã" no fuso de São Paulo
  const now = new Date();
  const sp = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  sp.setDate(sp.getDate() + 1);
  const tomorrowStr = ymd(sp);

  let usersSnap;
  if (onlyUserId) {
    const one = await db.collection("users").doc(onlyUserId).get();
    usersSnap = { docs: one.exists ? [one] : [] };
  } else {
    usersSnap = await db.collection("users").get();
  }

  let sent = 0, skipped = 0;
  for (const userDoc of usersSnap.docs) {
    const user = userDoc.data();
    const cfg = user.companyConfig || {};
    const email = cfg.email || user.email;
    const companyName = cfg.fantasia || "Sua Empresa";
    if (user.dailyReminderOptOut === true) { skipped++; continue; }
    if (!email) { skipped++; continue; }

    const events = await getEventsOnDate(userDoc.id, tomorrowStr);
    if (events.length === 0) { skipped++; continue; }
    events.sort((a, b) => ((a.details?.time || a.time || "") .localeCompare(b.details?.time || b.time || "")));

    const html = await buildEmailHtml(companyName, events);
    await transporter.sendMail({
      from: fromLabel,
      to: email,
      subject: `⏰ Amanhã você tem ${events.length} evento(s) — PartyPlanner`,
      html: html.replace("próximos 7 dias", "eventos de amanhã").replace("os eventos marcados para esta semana", "os eventos marcados para amanhã"),
    });
    sent++;
  }
  return { sent, skipped, total: usersSnap.docs.length };
}

function makeTransporter() {
  // Gmail como exemplo; troque host/port para outro provedor SMTP se preferir.
  return nodemailer.createTransport({
    service: "gmail",
    auth: { user: SMTP_USER.value(), pass: SMTP_PASS.value() },
  });
}

// ─── 1) AGENDADA: toda segunda 07:00 (America/Sao_Paulo) ─────────────
exports.weeklyEventsReport = onSchedule(
  {
    schedule: "0 7 * * 1", // min hora * * dia-da-semana(1=segunda)
    timeZone: "America/Sao_Paulo",
    secrets: [SMTP_USER, SMTP_PASS],
  },
  async () => {
    const transporter = makeTransporter();
    const fromLabel = `PartyPlanner Pro <${SMTP_USER.value()}>`;
    const stats = await processAndSend(transporter, fromLabel);
    console.log("Relatório semanal enviado:", JSON.stringify(stats));
  }
);

// ─── 1b) AGENDADA: todo dia 18:00 — lembrete dos eventos de AMANHÃ ──
exports.tomorrowEventsReminder = onSchedule(
  {
    schedule: "0 18 * * *", // todo dia às 18h
    timeZone: "America/Sao_Paulo",
    secrets: [SMTP_USER, SMTP_PASS],
  },
  async () => {
    const transporter = makeTransporter();
    const fromLabel = `PartyPlanner Pro <${SMTP_USER.value()}>`;
    const stats = await processTomorrowReminders(transporter, fromLabel);
    console.log("Lembrete da véspera enviado:", JSON.stringify(stats));
  }
);

// ─── 1c) AGENDADA: todo dia 07:30 — PUSH "Tem evento hoje" ─────────
exports.todayEventsPush = onSchedule(
  {
    schedule: "30 7 * * *",
    timeZone: "America/Sao_Paulo",
  },
  async () => {
    const now = new Date();
    const sp = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    const todayStr = ymd(sp);

    const usersSnap = await db.collection("users").get();
    let sent = 0;
    for (const userDoc of usersSnap.docs) {
      const user = userDoc.data();
      if (user.pushEnabled !== true || !user.fcmToken) continue;

      const events = await getEventsOnDate(userDoc.id, todayStr);
      if (events.length === 0) continue;

      const body = events.length === 1
        ? "Você tem 1 evento hoje. Toque para ver os detalhes."
        : `Você tem ${events.length} eventos hoje. Toque para ver a agenda.`;

      try {
        await admin.messaging().send({
          token: user.fcmToken,
          notification: { title: "Tem evento hoje! 🎉", body },
          webpush: {
            fcmOptions: { link: "/app.html" },
            notification: { icon: "/icon-192.png" },
          },
        });
        sent++;
      } catch (e) {
        console.error("Push falhou para", userDoc.id, e.code || e.message);
        // Token inválido/expirado → limpa
        if (e.code === "messaging/registration-token-not-registered") {
          await db.collection("users").doc(userDoc.id).update({ fcmToken: admin.firestore.FieldValue.delete(), pushEnabled: false });
        }
      }
    }
    console.log("Push de hoje enviado:", sent);
  }
);

// ─── 2) CALLABLE: botão "Enviar agora" dentro do app ─────────────────
exports.sendWeeklyReportNow = onCall(
  { secrets: [SMTP_USER, SMTP_PASS] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Faça login para enviar o relatório.");
    }
    const uid = request.auth.uid;
    const transporter = makeTransporter();
    const fromLabel = `PartyPlanner Pro <${SMTP_USER.value()}>`;
    const stats = await processAndSend(transporter, fromLabel, uid);
    if (stats.sent === 0) {
      return { ok: false, message: "Nenhum evento nos próximos 7 dias para enviar." };
    }
    return { ok: true, message: "Relatório enviado para o seu e-mail!" };
  }
);
