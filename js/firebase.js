import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getFirestore, enableIndexedDbPersistence } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";

// COLE AQUI AS SUAS CREDENCIAIS DO FIREBASE
const firebaseConfig = {
  apiKey: "AIzaSyAhHRcZwrzD36oEFaeQzD1Fd-685YRAxBA",
  authDomain: "partyplanner-3f352.firebaseapp.com",
  projectId: "partyplanner-3f352",
  storageBucket: "partyplanner-3f352.firebasestorage.app",
  messagingSenderId: "748641483081",
  appId: "1:748641483081:web:dec19c31c9e58d9040c298",
  measurementId: "G-YVYD6MEXC1"
};

// Inicializa os serviços
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// OTIMIZAÇÃO PWA: Ativar suporte offline nativo do Firestore
enableIndexedDbPersistence(db).catch((err) => {
    if (err.code == 'failed-precondition') {
        console.warn("Modo offline: Múltiplas abas abertas. A persistência só funciona em uma aba por vez.");
    } else if (err.code == 'unimplemented') {
        console.warn("Modo offline: O navegador atual não suporta persistência local.");
    }
});

export { app, db, auth };
