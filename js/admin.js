const { createApp, ref, computed, onMounted } = Vue;

import { 
    db, auth, 
    collection, getDocs, doc, updateDoc, deleteDoc, 
    onAuthStateChanged, signOut 
} from './firebase.js';

createApp({
    setup() {
        // --- VARIÁVEIS DE ESTADO ---
        const users = ref([]);
        const currentUser = ref(null);
        const searchTerm = ref('');
        
        // CONFIGURAÇÃO: Defina aqui o preço da sua assinatura para o cálculo do MRR
        const PRICE_PER_USER = 49.90; 

        // --- INICIALIZAÇÃO ---
        onMounted(() => {
            onAuthStateChanged(auth, async (u) => {
                if (u) {
                    // Aqui você poderia verificar se u.email == 'seuemail@admin.com' para segurança extra
                    currentUser.value = u;
                    fetchUsers();
                } else {
                    // Se não estiver logado, manda de volta para a tela de login
                    window.location.href = 'index.html';
                }
            });
        });

        // --- BUSCAR DADOS DO FIRESTORE ---
        const fetchUsers = async () => {
            try {
                const querySnapshot = await getDocs(collection(db, "users"));
                users.value = querySnapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
                // Ordena: Mais recentes primeiro
                users.value.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            } catch (error) {
                console.error(error);
                Swal.fire('Erro', 'Não foi possível carregar a lista de usuários.', 'error');
            }
        };

        // --- LÓGICA DE NEGÓCIO & CRM ---

        // 1. Salvar Nota (CRM) - Salva automaticamente quando sai do campo
        const saveNote = async (user) => {
            try {
                await updateDoc(doc(db, "users", user.id), { adminNotes: user.adminNotes });
                
                // Pequeno Toast no canto para confirmar sem interromper
                const Toast = Swal.mixin({
                    toast: true, position: 'top-end', showConfirmButton: false, timer: 1500, timerProgressBar: true
                });
                Toast.fire({ icon: 'success', title: 'Nota salva' });
            } catch (e) { 
                console.error(e);
            }
        };

        // 2. Cálculos de Trial (Dias Restantes)
        const getTrialDaysLeft = (user) => {
            if (!user.createdAt) return 0;
            const created = new Date(user.createdAt);
            const expires = new Date(created);
            expires.setDate(created.getDate() + 30); // 30 dias de teste
            const today = new Date();
            
            const diffTime = expires - today;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            return diffDays > 0 ? diffDays : 0;
        };

        const getTrialPercentage = (user) => {
            const daysLeft = getTrialDaysLeft(user);
            const perc = ((30 - daysLeft) / 30) * 100; // Porcentagem de tempo usado
            return Math.min(100, Math.max(0, perc));
        };

        const getTrialProgressColor = (user) => {
            const days = getTrialDaysLeft(user);
            if (days > 20) return 'bg-green-500'; // Seguro
            if (days > 10) return 'bg-yellow-500'; // Atenção
            return 'bg-red-500'; // Urgente/Acabando
        };

        // 3. Formatação de Tempo Relativo (Ex: "2 horas atrás")
        const timeSince = (dateStr) => {
            if (!dateStr) return 'Nunca';
            const date = new Date(dateStr);
            const seconds = Math.floor((new Date() - date) / 1000);
            
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

        // --- AÇÕES DO ADMIN ---

        const getWhatsappLink = (phone) => {
            if (!phone) return '#';
            const cleanPhone = phone.replace(/\D/g, ''); // Remove parenteses e traços
            // Se tiver 10 ou 11 digitos, adiciona o 55 (Brasil)
            const finalPhone = cleanPhone.length <= 11 ? '55' + cleanPhone : cleanPhone;
            return `https://wa.me/${finalPhone}?text=Olá! Sou do suporte do PartyPlanner e vi seu cadastro. Precisa de ajuda?`;
        };

        const toggleStatus = async (user) => {
            const newStatus = user.status === 'trial' ? 'active' : 'trial';
            const actionText = newStatus === 'active' ? 'ATIVAR Plano Pago' : 'Voltar para TRIAL';
            
            const result = await Swal.fire({
                title: 'Alterar Status?',
                text: `Deseja ${actionText} para este usuário?`,
                icon: 'question',
                showCancelButton: true,
                confirmButtonColor: '#8B5CF6',
                confirmButtonText: 'Sim, alterar'
            });

            if (result.isConfirmed) {
                try {
                    await updateDoc(doc(db, "users", user.id), { status: newStatus });
                    user.status = newStatus; // Atualiza na interface instantaneamente
                    Swal.fire('Sucesso', 'Status atualizado.', 'success');
                } catch (e) {
                    Swal.fire('Erro', 'Falha ao atualizar.', 'error');
                }
            }
        };

        const deleteUser = async (user) => {
            const result = await Swal.fire({
                title: 'Excluir Usuário?',
                text: "Isso removerá os dados do banco de dados. Essa ação não pode ser desfeita.",
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#ef4444',
                confirmButtonText: 'Sim, excluir'
            });

            if (result.isConfirmed) {
                try {
                    await deleteDoc(doc(db, "users", user.id));
                    users.value = users.value.filter(u => u.id !== user.id);
                    Swal.fire('Excluído!', 'Usuário removido da lista.', 'success');
                } catch (e) {
                    console.error(e);
                    Swal.fire('Erro', 'Falha ao excluir.', 'error');
                }
            }
        };

        const logout = async () => {
            await signOut(auth);
            window.location.href = 'index.html';
        };
        
        // --- FORMATADORES ---
        const formatDate = (iso) => iso ? new Date(iso).toLocaleDateString('pt-BR') : '-';
        const formatCurrency = (v) => new Intl.NumberFormat('pt-BR', {minimumFractionDigits: 2}).format(v);

        // --- COMPUTEDS (ESTATÍSTICAS) ---
        
        // Filtro da Tabela
        const filteredUsers = computed(() => {
            if (!searchTerm.value) return users.value;
            const term = searchTerm.value.toLowerCase();
            return users.value.filter(u => 
                (u.displayName && u.displayName.toLowerCase().includes(term)) || 
                (u.email && u.email.toLowerCase().includes(term)) ||
                (u.phone && u.phone.includes(term))
            );
        });

        // KPIs
        const activeCount = computed(() => users.value.filter(u => u.status === 'active').length);
        
        // MRR (Monthly Recurring Revenue) - Faturamento Mensal Estimado
        const mrr = computed(() => activeCount.value * PRICE_PER_USER);
        
        // Novos usuários cadastrados hoje
        const newUsersToday = computed(() => {
            const today = new Date().toISOString().split('T')[0];
            return users.value.filter(u => u.createdAt && u.createdAt.startsWith(today)).length;
        });
        
        // Trials que vão vencer em 5 dias ou menos
        const expiringTrials = computed(() => users.value.filter(u => u.status === 'trial' && getTrialDaysLeft(u) <= 5).length);
        
        // Usuários inativos (sem login há mais de 3 dias ou que nunca logaram após cadastro)
        const inactiveUsers = computed(() => {
            const threeDaysAgo = new Date(); 
            threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
            return users.value.filter(u => !u.lastLogin || new Date(u.lastLogin) < threeDaysAgo).length;
        });

        return {
            users, searchTerm, filteredUsers, 
            newUsersToday, activeCount, mrr, expiringTrials, inactiveUsers,
            getWhatsappLink, toggleStatus, deleteUser, logout, formatDate, formatCurrency,
            getTrialDaysLeft, getTrialPercentage, getTrialProgressColor, timeSince, saveNote
        };
    }
}).mount('#adminApp');