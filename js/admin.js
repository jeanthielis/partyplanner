const { createApp, ref, computed, reactive, onMounted } = Vue;

import { 
    db, auth, 
    collection, onSnapshot, doc, updateDoc, deleteDoc, setDoc, query, orderBy, getDoc, // Adicionado getDoc
    signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged,
    sendPasswordResetEmail 
} from './firebase.js';

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js"; 
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyAhHRcZwrzD36oEFaeQzD1Fd-685YRAxBA",
    authDomain: "partyplanner-3f352.firebaseapp.com",
    projectId: "partyplanner-3f352",
    storageBucket: "partyplanner-3f352.firebasestorage.app",
    messagingSenderId: "748641483081",
    appId: "1:748641483081:web:dec19c31c9e58d9040c298",
    measurementId: "G-YVYD6MEXC1"
};

createApp({
    setup() {
        const user = ref(null);
        const authLoading = ref(false);
        const loginForm = reactive({ email: '', password: '' });
        const newUserForm = reactive({ email: '', password: '', name: '' });
        const systemUsers = ref([]);
        const searchTerm = ref('');

        // --- AUTH ADMIN BLINDADO ---
        onMounted(() => {
            onAuthStateChanged(auth, async (u) => {
                if (u) {
                    // CORREÇÃO DE SEGURANÇA: Verificar Role antes de liberar
                    try {
                        const userDoc = await getDoc(doc(db, "users", u.uid));
                        if (userDoc.exists() && userDoc.data().role === 'admin') {
                            // É Admin de verdade. Libera o acesso.
                            user.value = u;
                            loadUsers();
                        } else {
                            // É a Renatinha tentando entrar. Bloqueia!
                            await signOut(auth);
                            user.value = null;
                            Swal.fire('Acesso Negado', 'Esta área é restrita para administradores.', 'error');
                        }
                    } catch (error) {
                        console.error("Erro ao verificar admin:", error);
                        // Se der erro na leitura (regras de segurança), desloga também
                        await signOut(auth);
                    }
                } else {
                    user.value = null;
                    systemUsers.value = [];
                }
            });
        });

        const handleAdminLogin = async () => {
            authLoading.value = true;
            try {
                await signInWithEmailAndPassword(auth, loginForm.email, loginForm.password);
                // A verificação acontece no onAuthStateChanged acima
            } catch (error) {
                Swal.fire('Acesso Negado', 'Verifique suas credenciais.', 'error');
            } finally {
                authLoading.value = false;
            }
        };

        const logout = async () => {
            await signOut(auth);
            // Opcional: Redirecionar para home
            window.location.href = "index.html"; 
        };

        // --- CARREGAR USUÁRIOS ---
        const loadUsers = () => {
            const q = query(collection(db, "users"), orderBy("createdAt", "desc"));
            onSnapshot(q, (snap) => {
                systemUsers.value = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            }, (error) => {
                console.error("Erro de permissão:", error);
            });
        };

        const filteredUsers = computed(() => {
            return systemUsers.value.filter(u => 
                (u.name || '').toLowerCase().includes(searchTerm.value.toLowerCase()) || 
                (u.email || '').toLowerCase().includes(searchTerm.value.toLowerCase())
            );
        });

        const stats = computed(() => {
            const total = systemUsers.value.length;
            const active = systemUsers.value.filter(u => u.status === 'active').length;
            const trials = systemUsers.value.filter(u => u.status === 'trial').length;
            const mrr = active * 39.90; 
            return { total, active, trials, mrr };
        });

        const createClient = async () => {
            if(!newUserForm.email || !newUserForm.password) return Swal.fire('Atenção', 'Preencha email e senha', 'warning');
            authLoading.value = true;
            let secondaryApp = null;
            try {
                secondaryApp = initializeApp(firebaseConfig, "SecondaryApp");
                const secondaryAuth = getAuth(secondaryApp);
                const userCredential = await createUserWithEmailAndPassword(secondaryAuth, newUserForm.email, newUserForm.password);
                const newUid = userCredential.user.uid;
                await setDoc(doc(db, "users", newUid), {
                    email: newUserForm.email, role: 'user', status: 'trial', name: newUserForm.name || 'Cliente Novo', createdAt: new Date().toISOString()
                });
                await signOut(secondaryAuth);
                newUserForm.email = ''; newUserForm.password = ''; newUserForm.name = '';
                Swal.fire('Sucesso', 'Cliente cadastrado.', 'success');
            } catch (error) {
                Swal.fire('Erro', error.message, 'error');
            } finally {
                if (secondaryApp) deleteApp(secondaryApp).catch(()=>{});
                authLoading.value = false;
            }
        };

        const toggleStatus = async (u) => {
            const newStatus = u.status === 'active' ? 'trial' : 'active';
            await updateDoc(doc(db, "users", u.id), { status: newStatus });
            Swal.fire('Atualizado', `Status: ${newStatus}`, 'success');
        };

        const resetUserPassword = async (email) => {
            try { await sendPasswordResetEmail(auth, email); Swal.fire('Enviado', `Email para ${email}`, 'success'); } catch (e) { Swal.fire('Erro', e.message, 'error'); }
        };

        const deleteUser = async (uid) => {
            if((await Swal.fire({title:'Tem certeza?', icon:'warning', showCancelButton:true})).isConfirmed) { await deleteDoc(doc(db, "users", uid)); Swal.fire('Deletado', '', 'success'); }
        };

        const getDaysRemaining = (dateStr) => {
            if (!dateStr) return 0;
            const diff = Math.ceil(Math.abs(new Date() - new Date(dateStr)) / (1000 * 60 * 60 * 24)); 
            const left = 30 - diff; return left > 0 ? left : 0;
        };
        const formatDate = (d) => d ? new Date(d).toLocaleDateString('pt-BR') : '-';
        const formatMoney = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

        return {
            user, loginForm, newUserForm, authLoading, searchTerm,
            systemUsers, filteredUsers, stats,
            handleAdminLogin, logout, createClient, toggleStatus, resetUserPassword, deleteUser,
            getDaysRemaining, formatDate, formatMoney
        };
    }
}).mount('#admin-app');
