// Service Worker dedicado ao Firebase Cloud Messaging (push em segundo plano)
// O Firebase exige que este arquivo tenha exatamente este nome, na raiz do site.
importScripts("https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/9.22.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyAhHRcZwrzD36oEFaeQzD1Fd-685YRAxBA",
  authDomain: "partyplanner-3f352.firebaseapp.com",
  projectId: "partyplanner-3f352",
  storageBucket: "partyplanner-3f352.firebasestorage.app",
  messagingSenderId: "748641483081",
  appId: "1:748641483081:web:dec19c31c9e58d9040c298",
});

const messaging = firebase.messaging();

// Notificação recebida com o app fechado / em segundo plano
messaging.onBackgroundMessage((payload) => {
  const title = (payload.notification && payload.notification.title) || "Tem evento hoje! 🎉";
  const body = (payload.notification && payload.notification.body) || "Toque para ver seus eventos.";
  self.registration.showNotification(title, {
    body,
    icon: "./icon-192.png",
    badge: "./icon-192.png",
    vibrate: [100, 50, 100],
    data: { url: (payload.fcmOptions && payload.fcmOptions.link) || "./app.html" },
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "./app.html";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) { if (c.url.includes("app.html") && "focus" in c) return c.focus(); }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
