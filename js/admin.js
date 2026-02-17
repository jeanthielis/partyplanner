const { createApp, ref, computed, reactive, onMounted } = Vue;

import { 
    db, auth, firebaseConfig, 
    collection, onSnapshot, doc, updateDoc, deleteDoc, getDoc, setDoc, signOut, onAuthStateChanged 
} from './firebase.js';

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, updateProfile } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

createApp({
    setup() {
        const users = ref([]);
        const searchTerm = ref('');
        const filterStatus = ref('all'); // Novo filtro
        const currentUser = ref(null);
        const showCreateModal = ref(false);
        const loadingCreate = ref(false);
        const pricing = 49.90; // Atualizado para o plano mensal novo

        const newUser = reactive({ name: '', email: '', password: '', status: 'trial' });

        onMounted(() => {
            onAuthStateChanged(auth, async (u) => {
                if (u) {
                    const docSnap = await getDoc(doc(db, "users", u.uid));
                    // Verificação simples de admin (ajuste conforme sua regra de segurança)
                    if (docSnap.exists() && (docSnap.data().role === 'admin' || u.email === 'jeanthielis@gmail.com')) {
                        currentUser.value = u;
                        loadUsers();
                    } else {
                        // Se não for admin, redireciona (comentado para testes se necessário)
                        // window.location.href = "index.html";
                        loadUsers(); // Carrega mesmo assim para teste se a rule não estiver setada
                    }
                } else {
                    window.location.href = "index.html";
                }
            });
        });

        const loadUsers = () => {
            onSnapshot(collection(db, "users"), (snap) => {
                users.value = snap.docs.map(d => {
                    const data = d.data();
                    return {
                        id: d.id, ...data,
                        displayName: data.companyConfig?.fantasia || data.email?.split('@')[0] || 'Sem Nome',
                        phone: data.companyConfig?.phone || '',
                        status: data.status || 'trial',
                        createdAt: data.createdAt || new Date().toISOString(),
                        lastLogin: data.lastLogin || null,
                        adminNotes: data.adminNotes || ''
                    };
                });
            });
        };

        const registerUser = async () => {
            if (!newUser.name || !newUser.email || !newUser.password) return Swal.fire('Atenção', 'Preencha tudo', 'warning');
            loadingCreate.value = true;
            try {
                const secondaryApp = initializeApp(firebaseConfig, "SecondaryApp");
                const secondaryAuth = getAuth(secondaryApp);
                const cred = await createUserWithEmailAndPassword(secondaryAuth, newUser.email, newUser.password);
                await updateProfile(cred.user, { displayName: newUser.name });
                await setDoc(doc(db, "users", cred.user.uid), {
                    email: newUser.email, role: 'user', status: newUser.status, createdAt: new Date().toISOString(),
                    companyConfig: { fantasia: newUser.name, email: newUser.email }
                });
                await secondaryAuth.signOut();
                showCreateModal.value = false;
                Object.assign(newUser, { name: '', email: '', password: '', status: 'trial' });
                Swal.fire('Sucesso', 'Usuário criado.', 'success');
            } catch (error) {
                console.error(error);
                Swal.fire('Erro', error.message, 'error');
            } finally {
                loadingCreate.value = false;
            }
        };

        const toggleStatus = async (user) => {
            const newStatus = user.status === 'active' ? 'trial' : 'active';
            await updateDoc(doc(db, "users", user.id), { status: newStatus });
        };

        const saveNote = async (user) => {
            await updateDoc(doc(db, "users", user.id), { adminNotes: user.adminNotes });
        };
        
        const addQuickNote = (user, type) => {
            const date = new Date().toLocaleDateString('pt-BR');
            let text = '';
            if(type === 'zap') text = 'Entrei em contato via WhatsApp.';
            if(type === 'cobranca') text = 'Enviei cobrança/aviso de vencimento.';
            
            user.adminNotes = `[${date}] ${text}\n` + (user.adminNotes || '');
            saveNote(user);
        };

        const deleteUser = async (user) => {
            if ((await Swal.fire({ title: 'Excluir?', icon: 'warning', showCancelButton: true })).isConfirmed) {
                await deleteDoc(doc(db, "users", user.id));
            }
        };

        const logout = async () => { await signOut(auth); window.location.href = "index.html"; };

        // COMPUTEDS
        const filteredUsers = computed(() => {
            let list = users.value;
            
            // 1. Filtro de Status
            if (filterStatus.value === 'active') list = list.filter(u => u.status === 'active');
            else if (filterStatus.value === 'trial') list = list.filter(u => u.status === 'trial');
            else if (filterStatus.value === 'inactive') {
                 const limit = new Date(); limit.setDate(limit.getDate() - 3);
                 list = list.filter(u => u.lastLogin && new Date(u.lastLogin) < limit);
            }

            // 2. Busca
            if (searchTerm.value) {
                const lower = searchTerm.value.toLowerCase();
                list = list.filter(u => u.displayName.toLowerCase().includes(lower) || u.email.toLowerCase().includes(lower));
            }
            
            return list.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
        });

        const newUsersToday = computed(() => users.value.filter(u => u.createdAt && u.createdAt.startsWith(new Date().toISOString().split('T')[0])).length);
        const activeCount = computed(() => users.value.filter(u => u.status === 'active').length);
        const mrr = computed(() => activeCount.value * pricing);
        const expiringTrials = computed(() => users.value.filter(u => u.status === 'trial' && getTrialDaysLeft(u) >= 0 && getTrialDaysLeft(u) <= 5).length);
        const inactiveUsers = computed(() => { const limit = new Date(); limit.setDate(limit.getDate() - 3); return users.value.filter(u => u.lastLogin && new Date(u.lastLogin) < limit).length; });

        // HELPERS
        const formatCurrency = (val) => val.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
        const formatDate = (d) => d ? new Date(d).toLocaleDateString('pt-BR') : '-';
        const timeSince = (d) => {
            if (!d) return 'Nunca';
            const s = Math.floor((new Date() - new Date(d)) / 1000);
            if (s < 60) return "Agora";
            if (s < 3600) return Math.floor(s/60) + "m atrás";
            if (s < 86400) return Math.floor(s/3600) + "h atrás";
            return Math.floor(s/86400) + "d atrás";
        };
        const getWhatsappLink = (p) => p ? `https://wa.me/55${p.replace(/\D/g, '')}` : '#';
        const getTrialDaysLeft = (u) => {
            const end = new Date(u.createdAt); end.setDate(end.getDate() + 7);
            return Math.ceil((end - new Date()) / (1000 * 60 * 60 * 24));
        };
        const getTrialPercentage = (u) => Math.min(100, Math.max(0, ((7 - getTrialDaysLeft(u)) / 7) * 100));

        return {
            users, searchTerm, filterStatus, filteredUsers, currentUser, logout,
            newUsersToday, activeCount, mrr, expiringTrials, inactiveUsers,
            showCreateModal, newUser, registerUser, loadingCreate,
            toggleStatus, saveNote, addQuickNote, deleteUser,
            formatCurrency, formatDate, timeSince, getWhatsappLink, getTrialDaysLeft, getTrialPercentage
        };
    }
}).mount('#adminApp');
