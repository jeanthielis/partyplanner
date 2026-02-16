import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { 
    getFirestore, collection, addDoc, getDocs, onSnapshot, doc, updateDoc, deleteDoc, query, where, setDoc, getDoc 
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { 
    getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile, signInAnonymously 
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";

// SUAS CONFIGURAÇÕES DO FIREBASE (Mantenha as suas aqui)
const firebaseConfig = {
  apiKey: "AIzaSyAhHRcZwrzD36oEFaeQzD1Fd-685YRAxBA",
  authDomain: "partyplanner-3f352.firebaseapp.com",
  projectId: "partyplanner-3f352",
  storageBucket: "partyplanner-3f352.firebasestorage.app",
  messagingSenderId: "748641483081",
  appId: "1:748641483081:web:dec19c31c9e58d9040c298",
  measurementId: "G-YVYD6MEXC1"
};

// Inicializa (se não tiver config, vai dar erro, certifique-se de manter sua config)
let app;
let db;
let auth;

// Tenta reutilizar a instância se já existir
try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
} catch (e) {
    // Caso use variáveis globais ou carregamento diferente
    console.warn("Firebase já inicializado ou config pendente.");
}

export { 
    db, auth, 
    collection, addDoc, onSnapshot, doc, updateDoc, deleteDoc, getDocs, query, where, setDoc, getDoc, 
    signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged,
    updateProfile, signInAnonymously // <--- ADICIONADO AQUI
};
