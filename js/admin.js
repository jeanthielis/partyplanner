const { createApp, ref, computed, reactive, onMounted } = Vue;

// Importa as configurações do firebase existente
import { 
    db, auth, 
    collection, onSnapshot, doc, updateDoc, deleteDoc, setDoc, query, orderBy,
    signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged,
    sendPasswordResetEmail // Adicionado para resetar senha
} from './firebase.js';

// Importa funcoes para criar app secundário (truque para criar user sem deslogar)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js"; 
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// Configuração repetida apenas para a instância secundária
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

        // --- AUTH ADMIN ---
        onMounted(() => {
            onAuthStateChanged(auth, async (u) => {
                if (u) {
                    // Verifica se é REALMENTE admin lendo o token ou banco
                    // Aqui vamos confiar na leitura do banco users/uid
                    // (As regras de segurança do Firestore já impedem leitura se não for admin)
                    user.value = u;
                    loadUsers();
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
                // O redirecionamento/exibição é controlado pelo v-if no HTML
            } catch (error) {
                Swal.fire('Acesso Negado', 'Verifique suas credenciais.', 'error');
            } finally {
                authLoading.value = false;
            }
        };

        const logout = async () => {
            await signOut(auth);
        };

        // --- CARREGAR USUÁRIOS ---
        const loadUsers = () => {
            // Admin pode ler toda a coleção 'users'
            const q = query(collection(db, "users"), orderBy("createdAt", "desc"));
            onSnapshot(q, (snap) => {
                systemUsers.value = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            }, (error) => {
                console.error("Erro ao ler usuários:", error);
                Swal.fire("Erro", "Você não tem permissão de Admin ou as regras não foram publicadas.", "error");
            });
        };

        // --- COMPUTEDS (ESTATÍSTICAS) ---
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
            // Cálculo de MRR (Faturamento Recorrente Mensal Estimado)
            const mrr = active * 39.90; 
            return { total, active, trials, mrr };
        });

        // --- ACTIONS ---
        
        // 1. Criar Usuário (Técnica do App Secundário)
        const createClient = async () => {
            if(!newUserForm.email || !newUserForm.password) return Swal.fire('Atenção', 'Preencha email e senha', 'warning');
            
            authLoading.value = true;
            let secondaryApp = null;
            
            try {
                secondaryApp = initializeApp(firebaseConfig, "SecondaryApp");
                const secondaryAuth = getAuth(secondaryApp);
                
                const userCredential = await createUserWithEmailAndPassword(secondaryAuth, newUserForm.email, newUserForm.password);
                const newUid = userCredential.user.uid;

                // Salva no Firestore
                await setDoc(doc(db, "users", newUid), {
                    email: newUserForm.email,
                    role: 'user',
                    status: 'trial',
                    name: newUserForm.name || 'Cliente Novo',
                    createdAt: new Date().toISOString()
                });

                await signOut(secondaryAuth);
                newUserForm.email = ''; newUserForm.password = ''; newUserForm.name = '';
                Swal.fire('Sucesso', 'Cliente cadastrado com 30 dias grátis.', 'success');
                
            } catch (error) {
                let msg = error.message;
                if(error.code === 'auth/email-already-in-use') msg = 'Este email já está sendo usado.';
                Swal.fire('Erro', msg, 'error');
            } finally {
                if (secondaryApp) { /* cleanup */ }
                authLoading.value = false;
            }
        };

        // 2. Mudar Status (Ativar/Bloquear)
        const toggleStatus = async (u) => {
            const newStatus = u.status === 'active' ? 'trial' : 'active'; // Alterna entre Pago e Teste
            // Se quiser bloquear, poderia ser uma terceira opção, mas vamos simplificar
            await updateDoc(doc(db, "users", u.id), { status: newStatus });
            const msg = newStatus === 'active' ? 'Plano Ativado (Pago)' : 'Voltou para Teste Grátis';
            const icon = newStatus === 'active' ? 'success' : 'info';
            Swal.fire('Atualizado', msg, icon);
        };

        // 3. Resetar Senha
        const resetUserPassword = async (email) => {
            try {
                await sendPasswordResetEmail(auth, email);
                Swal.fire('Email Enviado', `Link de redefinição enviado para ${email}`, 'success');
            } catch (error) {
                Swal.fire('Erro', error.message, 'error');
            }
        };

        // 4. Deletar (Apenas do Banco)
        const deleteUser = async (uid) => {
            if((await Swal.fire({title:'Tem certeza?', text:'Isso remove o acesso do cliente.', icon:'warning', showCancelButton:true})).isConfirmed) {
                await deleteDoc(doc(db, "users", uid));
                Swal.fire('Deletado', 'Registro removido.', 'success');
            }
        };

        // --- HELPERS VISUAIS ---
        const getDaysRemaining = (dateStr) => {
            if (!dateStr) return 0;
            const created = new Date(dateStr);
            const now = new Date();
            const diffTime = Math.abs(now - created);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
            const left = 30 - diffDays;
            return left > 0 ? left : 0;
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
