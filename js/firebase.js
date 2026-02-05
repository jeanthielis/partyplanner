import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
// Adicionei getDocs, query, where, orderBy aqui na importação
import { getFirestore, collection, addDoc, onSnapshot, doc, updateDoc, deleteDoc, setDoc, getDocs, query, where, orderBy } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyAhHRcZwrzD36oEFaeQzD1Fd-685YRAxBA",
    authDomain: "partyplanner-3f352.firebaseapp.com",
    projectId: "partyplanner-3f352",
    storageBucket: "partyplanner-3f352.firebasestorage.app",
    messagingSenderId: "748641483081",
    appId: "1:748641483081:web:dec19c31c9e58d9040c298",
    measurementId: "G-YVYD6MEXC1"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Adicionei as novas funções na lista de exportação abaixo
export { 
    db, auth, 
    collection, addDoc, onSnapshot, doc, updateDoc, deleteDoc, setDoc, getDocs, query, where, orderBy,
    signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged 
};
