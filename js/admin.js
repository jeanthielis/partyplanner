const { createApp, ref, computed, onMounted } = Vue;

import { 
    db, auth, 
    collection, onSnapshot, doc, updateDoc, deleteDoc, getDoc, signOut, onAuthStateChanged 
} from './firebase.js';

createApp({
    setup() {
        const users = ref([]);
        const searchTerm = ref('');
        const currentUser = ref(null);
        const pricing = 97.00; // Valor da assinatura para cálculo de MRR

        // ============================================================
        // 1. CARREGAMENTO E SEGURANÇA
        // ============================================================
        onMounted(() => {
            onAuthStateChanged(auth, async (u) => {
                if (u) {
                    // Verifica se é ADMIN antes de carregar dados
                    const docSnap = await getDoc(doc(db, "users", u.uid));
                    if (docSnap.exists() && docSnap.data().role === 'admin') {
                        currentUser.value = u;
                        loadUsers();
                    } else {
                        Swal.fire('Acesso Negado', 'Você não tem permissão de administrador.', 'error')
                        .then(() => window.location.href = "index.html");
                    }
                } else {
                    window.location.href = "index.html";
                }
            });
        });

        const loadUsers = () => {
            // Escuta em tempo real a coleção de usuários
            onSnapshot(collection(db, "users"), (snap) => {
                users.value = snap.docs.map(d => {
                    const data = d.data();
                    return {
                        id: d.id,
                        ...data,
                        // Normaliza dados para evitar erros no template
                        displayName: data.companyConfig?.fantasia || data.email.split('@')[0],
                        phone: data.companyConfig?.phone || '',
                        status: data.status || 'trial',
                        createdAt: data.createdAt || new Date().toISOString(),
                        lastLogin: data.lastLogin || data.createdAt, // Fallback se nunca logou
                        adminNotes: data.adminNotes || ''
                    };
                });
            });
        };

        // ============================================================
        // 2. COMPUTEDS (KPIS E FILTROS)
        // ============================================================
        
        // Filtro da Tabela
        const filteredUsers = computed(() => {
            if (!searchTerm.value) return users.value.sort((a,b) => new Date(b.lastLogin) - new Date(a.lastLogin));
            const lower = searchTerm.value.toLowerCase();
            return users.value.filter(u => 
                u.displayName.toLowerCase().includes(lower) || 
                u.email.toLowerCase().includes(lower) ||
                u.phone.includes(lower)
            );
        });

        // KPIs
        const newUsersToday = computed(() => {
            const today = new Date().toISOString().split('T')[0];
            return users.value.filter(u => u.createdAt && u.createdAt.startsWith(today)).length;
        });

        const activeCount = computed(() => users.value.filter(u => u.status === 'active').length);
        
        const mrr = computed(() => activeCount.value * pricing);

        const expiringTrials = computed(() => {
            return users.value.filter(u => {
                if (u.status !== 'trial') return false;
                const days = getTrialDaysLeft(u);
                return days >= 0 && days <= 5;
            }).length;
        });

        const inactiveUsers = computed(() => {
            const limitDate = new Date();
            limitDate.setDate(limitDate.getDate() - 3); // 3 dias atrás
            return users.value.filter(u => new Date(u.lastLogin) < limitDate).length;
        });

        // ============================================================
        // 3. AÇÕES (MÉTODOS)
        // ============================================================

        const toggleStatus = async (user) => {
            const newStatus = user.status === 'active' ? 'trial' : 'active';
            const action = newStatus === 'active' ? 'Aprovar (PRO)' : 'Rebaixar para Trial';
            
            const { isConfirmed } = await Swal.fire({
                title: 'Alterar Plano?',
                text: `Deseja mudar o status de ${user.displayName} para ${action}?`,
                icon: 'question',
                showCancelButton: true,
                confirmButtonColor: '#8B5CF6'
            });

            if (isConfirmed) {
                await updateDoc(doc(db, "users", user.id), { status: newStatus });
                const Toast = Swal.mixin({ toast: true, position: 'top-end', showConfirmButton: false, timer: 3000 });
                Toast.fire({ icon: 'success', title: 'Status atualizado!' });
            }
        };

        const saveNote = async (user) => {
            // Salva automaticamente ao perder o foco ou mudar o texto (Autosave)
            try {
                await updateDoc(doc(db, "users", user.id), { adminNotes: user.adminNotes });
            } catch (e) { console.error("Erro ao salvar nota", e); }
        };

        const deleteUser = async (user) => {
            const { isConfirmed } = await Swal.fire({
                title: 'Tem certeza?',
                text: `Isso apagará permanentemente ${user.displayName} e todos os seus dados.`,
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#EF4444',
                confirmButtonText: 'Sim, excluir'
            });

            if (isConfirmed) {
                try {
                    // Nota: No Firebase Client-side, deletar subcoleções é complexo.
                    // Aqui deletamos apenas o registro do usuário para bloquear o acesso.
                    await deleteDoc(doc(db, "users", user.id));
                    Swal.fire('Excluído!', 'O usuário foi removido.', 'success');
                } catch (e) {
                    Swal.fire('Erro', 'Não foi possível excluir.', 'error');
                }
            }
        };

        const logout = async () => {
            await signOut(auth);
            window.location.href = "index.html";
        };

        // ============================================================
        // 4. HELPERS (FORMATAÇÃO)
        // ============================================================

        const formatCurrency = (val) => val.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
        
        const formatDate = (dateStr) => {
            if (!dateStr) return '-';
            return new Date(dateStr).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
        };

        const timeSince = (dateStr) => {
            if (!dateStr) return 'Nunca';
            const seconds = Math.floor((new Date() - new Date(dateStr)) / 1000);
            let interval = seconds / 31536000;
            if (interval > 1) return Math.floor(interval) + " anos atrás";
            interval = seconds / 2592000;
            if (interval > 1) return Math.floor(interval) + " meses atrás";
            interval = seconds / 86400;
            if (interval > 1) return Math.floor(interval) + " dias atrás";
            interval = seconds / 3600;
            if (interval > 1) return Math.floor(interval) + " h atrás";
            interval = seconds / 60;
            if (interval > 1) return Math.floor(interval) + " min atrás";
            return "Agora mesmo";
        };

        const getWhatsappLink = (phone) => {
            if (!phone) return '#';
            const clean = phone.replace(/\D/g, '');
            return `https://wa.me/55${clean}`;
        };

        // Lógica de Trial (Ex: 7 dias grátis a partir do cadastro)
        const getTrialDaysLeft = (user) => {
            const created = new Date(user.createdAt);
            const trialEnd = new Date(created);
            trialEnd.setDate(trialEnd.getDate() + 7); // 7 dias de trial
            const diffTime = trialEnd - new Date();
            return Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
        };

        const getTrialPercentage = (user) => {
            const totalDays = 7;
            const left = getTrialDaysLeft(user);
            if (left < 0) return 100; // Expirou
            const percentage = ((totalDays - left) / totalDays) * 100;
            return Math.min(100, Math.max(0, percentage));
        };

        const getTrialProgressColor = (user) => {
            const left = getTrialDaysLeft(user);
            if (left <= 2) return 'bg-red-500';
            if (left <= 4) return 'bg-yellow-500';
            return 'bg-green-500';
        };

        return {
            users, searchTerm, filteredUsers, logout,
            newUsersToday, activeCount, mrr, expiringTrials, inactiveUsers,
            formatCurrency, formatDate, timeSince, getWhatsappLink,
            toggleStatus, saveNote, deleteUser,
            getTrialDaysLeft, getTrialPercentage, getTrialProgressColor
        };
    }
}).mount('#adminApp');
