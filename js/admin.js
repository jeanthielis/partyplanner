const { createApp, ref, computed, reactive, onMounted } = Vue;

// Importar configurações e funções principais
import { 
    db, auth, firebaseConfig, // <--- IMPORTANTE: Importar o firebaseConfig
    collection, onSnapshot, doc, updateDoc, deleteDoc, getDoc, setDoc, signOut, onAuthStateChanged 
} from './firebase.js';

// Importar funções SDK diretas para a instância secundária
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, updateProfile } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

createApp({
    setup() {
        const users = ref([]);
        const searchTerm = ref('');
        const currentUser = ref(null);
        const showCreateModal = ref(false);
        const loadingCreate = ref(false);
        const pricing = 97.00;

        const newUser = reactive({ name: '', email: '', password: '', status: 'trial' });

        // ============================================================
        // 1. CARREGAMENTO E SEGURANÇA
        // ============================================================
        onMounted(() => {
            onAuthStateChanged(auth, async (u) => {
                if (u) {
                    const docSnap = await getDoc(doc(db, "users", u.uid));
                    if (docSnap.exists() && docSnap.data().role === 'admin') {
                        currentUser.value = u;
                        loadUsers();
                    } else {
                        Swal.fire('Acesso Negado', 'Área restrita a administradores.', 'error')
                        .then(() => window.location.href = "index.html");
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

        // ============================================================
        // 2. REGISTRAR NOVO USUÁRIO (SEM DESLOGAR ADMIN)
        // ============================================================
        const registerUser = async () => {
            if (!newUser.name || !newUser.email || !newUser.password) {
                return Swal.fire('Atenção', 'Preencha todos os campos', 'warning');
            }

            loadingCreate.value = true;

            try {
                // 1. Inicializar um App Secundário (Ghost App)
                // Isso permite criar um usuário sem afetar a sessão atual (Admin)
                const secondaryApp = initializeApp(firebaseConfig, "SecondaryApp");
                const secondaryAuth = getAuth(secondaryApp);

                // 2. Criar usuário na Auth secundária
                const cred = await createUserWithEmailAndPassword(secondaryAuth, newUser.email, newUser.password);
                const uid = cred.user.uid;

                // 3. Atualizar Profile na Auth secundária
                await updateProfile(cred.user, { displayName: newUser.name });

                // 4. Salvar no Firestore (Usando o DB principal do Admin, pois temos permissão)
                await setDoc(doc(db, "users", uid), {
                    email: newUser.email,
                    role: 'user',
                    status: newUser.status,
                    createdAt: new Date().toISOString(),
                    adminCreated: true, // Marcação interna
                    companyConfig: {
                        fantasia: newUser.name,
                        logo: '', cnpj: '', email: newUser.email, phone: '',
                        rua: '', bairro: '', cidade: '', estado: ''
                    }
                });

                // 5. Limpar App Secundário (logout forçado da sessão fantasma) e Resetar Form
                await secondaryAuth.signOut();
                // Não precisa 'deleteApp' no JS modules web simples, o garbage collector cuida, 
                // mas signOut garante que não haja conflito.

                showCreateModal.value = false;
                Object.assign(newUser, { name: '', email: '', password: '', status: 'trial' });

                Swal.fire({
                    title: 'Sucesso!',
                    text: `Usuário ${newUser.email} criado e ativo.`,
                    icon: 'success',
                    timer: 2000
                });

            } catch (error) {
                console.error(error);
                let msg = 'Erro ao criar usuário.';
                if (error.code === 'auth/email-already-in-use') msg = 'Este e-mail já está em uso.';
                if (error.code === 'auth/weak-password') msg = 'Senha muito fraca (mínimo 6 dígitos).';
                Swal.fire('Erro', msg, 'error');
            } finally {
                loadingCreate.value = false;
            }
        };

        // ============================================================
        // 3. AÇÕES DE GESTÃO
        // ============================================================
        const toggleStatus = async (user) => {
            const newStatus = user.status === 'active' ? 'trial' : 'active';
            await updateDoc(doc(db, "users", user.id), { status: newStatus });
            const Toast = Swal.mixin({ toast: true, position: 'top-end', showConfirmButton: false, timer: 3000 });
            Toast.fire({ icon: 'success', title: `Plano alterado para ${newStatus.toUpperCase()}` });
        };

        const saveNote = async (user) => {
            try { await updateDoc(doc(db, "users", user.id), { adminNotes: user.adminNotes }); } catch (e) {}
        };

        const deleteUser = async (user) => {
            if ((await Swal.fire({ title: 'Excluir?', text: 'Essa ação é irreversível.', icon: 'warning', showCancelButton: true, confirmButtonColor: '#d33' })).isConfirmed) {
                await deleteDoc(doc(db, "users", user.id));
                Swal.fire('Excluído!', '', 'success');
            }
        };

        const logout = async () => {
            await signOut(auth);
            window.location.href = "index.html";
        };

        // ============================================================
        // 4. COMPUTEDS E HELPERS
        // ============================================================
        const filteredUsers = computed(() => {
            if (!searchTerm.value) return users.value.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
            const lower = searchTerm.value.toLowerCase();
            return users.value.filter(u => u.displayName.toLowerCase().includes(lower) || u.email.toLowerCase().includes(lower));
        });

        const newUsersToday = computed(() => users.value.filter(u => u.createdAt && u.createdAt.startsWith(new Date().toISOString().split('T')[0])).length);
        const activeCount = computed(() => users.value.filter(u => u.status === 'active').length);
        const mrr = computed(() => activeCount.value * pricing);
        const expiringTrials = computed(() => users.value.filter(u => u.status === 'trial' && getTrialDaysLeft(u) >= 0 && getTrialDaysLeft(u) <= 5).length);
        const inactiveUsers = computed(() => {
            const limit = new Date(); limit.setDate(limit.getDate() - 3);
            return users.value.filter(u => u.lastLogin && new Date(u.lastLogin) < limit).length;
        });

        const formatCurrency = (val) => val.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
        const formatDate = (d) => d ? new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) : '-';
        const timeSince = (d) => {
            if (!d) return '-';
            const s = Math.floor((new Date() - new Date(d)) / 1000);
            if (s > 86400) return Math.floor(s/86400) + "d atrás";
            if (s > 3600) return Math.floor(s/3600) + "h atrás";
            return "Agora";
        };
        const getWhatsappLink = (p) => p ? `https://wa.me/55${p.replace(/\D/g, '')}` : '#';
        const getTrialDaysLeft = (u) => {
            const end = new Date(u.createdAt); end.setDate(end.getDate() + 7);
            return Math.ceil((end - new Date()) / (1000 * 60 * 60 * 24));
        };
        const getTrialPercentage = (u) => Math.min(100, Math.max(0, ((7 - getTrialDaysLeft(u)) / 7) * 100));
        const getTrialProgressColor = (u) => getTrialDaysLeft(u) <= 2 ? 'bg-red-500' : 'bg-green-500';

        return {
            users, searchTerm, filteredUsers, currentUser, logout,
            newUsersToday, activeCount, mrr, expiringTrials, inactiveUsers,
            showCreateModal, newUser, registerUser, loadingCreate, // Exports do Modal
            toggleStatus, saveNote, deleteUser,
            formatCurrency, formatDate, timeSince, getWhatsappLink, getTrialDaysLeft, getTrialPercentage, getTrialProgressColor
        };
    }
}).mount('#adminApp');
