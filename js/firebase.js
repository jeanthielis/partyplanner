import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { 
    getFirestore, 
    enableIndexedDbPersistence,
    collection, addDoc, getDocs, onSnapshot, doc, updateDoc, deleteDoc, query, where, setDoc, getDoc, orderBy, limit 
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { 
    getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile, signInAnonymously 
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { 
    getFunctions, httpsCallable 
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-functions.js";

// Configuração original restaurada
const firebaseConfig = {
  apiKey: "AIzaSyAhHRcZwrzD36oEFaeQzD1Fd-685YRAxBA",
  authDomain: "partyplanner-3f352.firebaseapp.com",
  projectId: "partyplanner-3f352",
  storageBucket: "partyplanner-3f352.firebasestorage.app",
  messagingSenderId: "748641483081",
  appId: "1:748641483081:web:dec19c31c9e58d9040c298",
  measurementId: "G-YVYD6MEXC1"
};

let app;
let db;
let auth;
let functions;

try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
    functions = getFunctions(app);

    // OTIMIZAÇÃO PWA: Ativar suporte offline nativo do Firestore
    enableIndexedDbPersistence(db).catch((err) => {
        if (err.code == 'failed-precondition') {
            console.warn("Modo offline: Múltiplas abas abertas. A persistência só funciona em uma aba por vez.");
        } else if (err.code == 'unimplemented') {
            console.warn("Modo offline: O navegador atual não suporta persistência local.");
        }
    });

} catch (e) {
    console.warn("Firebase já inicializado.");
}

export { 
    db, auth, functions, firebaseConfig,
    collection, addDoc, onSnapshot, doc, updateDoc, deleteDoc, getDocs, query, where, setDoc, getDoc, orderBy, limit,
    signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged,
    updateProfile, signInAnonymously,
    httpsCallable
};
