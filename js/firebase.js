// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";

import { 
    getFirestore, collection, addDoc, getDocs, onSnapshot, 
    doc, updateDoc, deleteDoc, query, where, setDoc, getDoc, orderBy 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// --- ATENÇÃO AQUI EMBAIXO ---
// Adicionei 'sendPasswordResetEmail' na lista
import { 
    getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, 
    signOut, onAuthStateChanged, updatePassword, reauthenticateWithCredential, 
    EmailAuthProvider, updateProfile, sendPasswordResetEmail 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// Your web app's Firebase configuration
// ⚠️ MANTENHA SUAS CHAVES AQUI (Não copie este bloco vazio por cima das suas chaves!)
export const firebaseConfig = {
    apiKey: "AIzaSyAhHRcZwrzD36oEFaeQzD1Fd-685YRAxBA",
    authDomain: "partyplanner-3f352.firebaseapp.com",
    projectId: "partyplanner-3f352",
    storageBucket: "partyplanner-3f352.firebasestorage.app",
    messagingSenderId: "748641483081",
    appId: "1:748641483081:web:dec19c31c9e58d9040c298",
    measurementId: "G-YVYD6MEXC1"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Exportar tudo para o app.js usar
export { 
    db, auth, 
    collection, addDoc, onSnapshot, doc, updateDoc, deleteDoc, getDocs, query, where, setDoc, getDoc, orderBy,
    signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged,
    updatePassword, reauthenticateWithCredential, EmailAuthProvider, updateProfile, sendPasswordResetEmail // <--- ADICIONEI AQUI NO FINAL
};
