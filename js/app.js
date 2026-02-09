const { createApp, ref, computed, reactive, onMounted, watch } = Vue;

import { 
    db, auth, 
    collection, addDoc, onSnapshot, doc, updateDoc, deleteDoc, getDocs, query, where, setDoc, getDoc, 
    signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged,
    updatePassword, reauthenticateWithCredential, EmailAuthProvider, updateProfile 
} from './firebase.js';

createApp({
    setup() {
        // =================================================================
        // 1. ESTADOS E VARIÁVEIS
        // =================================================================
        const user = ref(null);
        const view = ref('dashboard'); // Começa no Dashboard
        const isDark = ref(false);
        const authLoading = ref(false);
        const isRegistering = ref(false);
        const authForm = reactive({ email: '', password: '', name: '' });
        
        // Dados Principais
        const dashboardMonth = ref(new Date().toISOString().slice(0, 7)); // YYYY-MM
        const dashboardData = reactive({ appointments: [], expenses: [] }); // Dados "brutos" do banco
        
        // Listas para as Telas
        const services = ref([]);
        const pendingAppointments = ref([]); // Lista da Agenda (Status pendente)
        const expensesList = ref([]); // Lista do Financeiro
        const catalogClientsList = ref([]); // Lista de Clientes
        const scheduleClientsList = ref([]); // Lista para busca no agendamento
        const clientCache = reactive({}); // Cache de nomes de clientes (ID -> Nome)

        // Formulários
        const company = reactive({ fantasia: '', logo: '', cnpj: '' });
        const tempApp = reactive({ clientId: '', date: '', time: '', location: { bairro: '' }, details: { entryFee: 0 }, selectedServices: [], checklist: [] });
        const newExpense = reactive({ description: '', value: '', date: new Date().toISOString().split('T')[0], category: 'outros' });
        const tempServiceSelect = ref('');
        
        // Controles de UI
        const showExpenseModal = ref(false);
        const currentReceipt = ref(null);
        const isEditing = ref(false);
        const editingId = ref(null);
        const clientSearchTerm = ref('');
        const catalogClientSearch = ref('');
        const calendarCursor = ref(new Date());
        const selectedCalendarDate = ref(null);

        // Categorias Fixas
        const expenseCategories = [
            { id: 'combustivel', label: 'Combustível', icon: 'fa-gas-pump' },
            { id: 'materiais', label: 'Materiais', icon: 'fa-box-open' },
            { id: 'equipe', label: 'Equipe', icon: 'fa-users' },
            { id: 'refeicao', label: 'Alimentação', icon: 'fa-utensils' },
            { id: 'marketing', label: 'Marketing', icon: 'fa-bullhorn' },
            { id: 'aluguel', label: 'Aluguel', icon: 'fa-house' },
            { id: 'outros', label: 'Outras', icon: 'fa-money-bill' }
        ];

        // =================================================================
        // 2. FUNÇÕES AUXILIARES (UTILS)
        // =================================================================
        
        // Converte qualquer coisa para número (Corrige o erro de KPI zerado)
        const toNum = (val) => {
            if (!val) return 0;
            if (typeof val === 'number') return val;
            // Remove R$, espaços e substitui vírgula por ponto
            let clean = String(val).replace('R$', '').trim().replace(/\./g, '').replace(',', '.');
            return parseFloat(clean) || 0;
        };

        const formatCurrency = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(toNum(v));
        const formatDate = (d) => {
            if (!d) return '';
            try { return d.split('-').reverse().join('/'); } catch (e) { return d; }
        };
        const getDay = (d) => d ? d.split('-')[2] : '';
        const getMonth = (d) => d ? ['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'][parseInt(d.split('-')[1])-1] : '';
        
        const getClientName = (id) => clientCache[id] ? clientCache[id].name : '...';

        // Busca nome do cliente no banco se não tiver no cache
        const fetchClientToCache = async (id) => {
            if (!id || clientCache[id]) return;
            try {
                const snap = await getDoc(doc(db, "clients", id));
                if (snap.exists()) clientCache[id] = snap.data();
                else clientCache[id] = { name: 'Desconhecido', phone: '-' };
            } catch (e) { console.error(e); }
        };

        // Limpa e padroniza o objeto de agendamento
        const sanitizeApp = (docSnapshot) => {
            const data = docSnapshot.data ? docSnapshot.data() : docSnapshot;
            const safeServices = Array.isArray(data.selectedServices) ? data.selectedServices : [];
            
            let total = toNum(data.totalServices);
            // Se total vier zerado, recalcula somando os serviços
            if (total === 0 && safeServices.length > 0) {
                total = safeServices.reduce((sum, item) => sum + toNum(item.price), 0);
            }
            
            let entry = toNum(data.entryFee || data.details?.entryFee);
            let balance = toNum(data.finalBalance);
            if (balance === 0 && total > 0) balance = total - entry;

            return {
                id: docSnapshot.id || data.id,
                ...data,
                selectedServices: safeServices,
                totalServices: total,
                finalBalance: balance,
                entryFee: entry,
                checklist: data.checklist || []
            };
        };

        const sanitizeExpense = (docSnapshot) => {
            const data = docSnapshot.data ? docSnapshot.data() : docSnapshot;
            return { id: docSnapshot.id || data.id, ...data, value: toNum(data.value) };
        };

        // =================================================================
        // 3. CARREGAMENTO DE DADOS (CORE)
        // =================================================================
        onMounted(() => {
            onAuthStateChanged(auth, async (u) => {
                if (u) {
                    user.value = u;
                    const userDoc = await getDoc(doc(db, "users", u.uid));
                    if (userDoc.exists() && userDoc.data().companyConfig) Object.assign(company, userDoc.data().companyConfig);
                    
                    // Inicia o sistema
                    loadDashboardData();
                    syncRealtimeData();
                } else { user.value = null; }
            });
            if (localStorage.getItem('pp_dark') === 'true') { isDark.value = true; document.documentElement.classList.add('dark'); }
        });

        // Carrega dados do mês para Dashboard e Financeiro
        const loadDashboardData = async () => {
            if (!user.value) return;
            try {
                const [year, month] = dashboardMonth.value.split('-');
                const startStr = `${year}-${month}-01`;
                // Pega o último dia do mês corretamente
                const lastDay = new Date(year, month, 0).getDate();
                const endStr = `${year}-${month}-${lastDay}`;

                // Busca Agendamentos do Mês
                const qApps = query(collection(db, "appointments"), where("userId", "==", user.value.uid), where("date", ">=", startStr), where("date", "<=", endStr));
                const snapApps = await getDocs(qApps);
                dashboardData.appointments = snapApps.docs.map(sanitizeApp).filter(a => a.status !== 'cancelled');

                // Busca Despesas do Mês
                const qExp = query(collection(db, "expenses"), where("userId", "==", user.value.uid), where("date", ">=", startStr), where("date", "<=", endStr));
                const snapExp = await getDocs(qExp);
                dashboardData.expenses = snapExp.docs.map(sanitizeExpense);

                // Preenche a lista do Financeiro
                expensesList.value = [...dashboardData.expenses].sort((a, b) => b.date.localeCompare(a.date));

                // Busca nomes dos clientes para exibir no Dashboard/Extrato
                dashboardData.appointments.forEach(a => fetchClientToCache(a.clientId));

            } catch (e) { console.error("Erro ao carregar dados:", e); }
        };
        
        watch(dashboardMonth, () => loadDashboardData());

        // Mantém Agenda e Serviços em tempo real
        const syncRealtimeData = () => {
            const myId = user.value.uid;
            
            // Serviços
            onSnapshot(query(collection(db, "services"), where("userId", "==", myId)), (snap) => {
                services.value = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            });

            // Agendamentos Pendentes (Para a tela de Agenda)
            onSnapshot(query(collection(db, "appointments"), where("userId", "==", myId), where("status", "==", "pending")), (snap) => {
                pendingAppointments.value = snap.docs.map(sanitizeApp);
                pendingAppointments.value.forEach(a => fetchClientToCache(a.clientId));
            });
        };

        // =================================================================
        // 4. CÁLCULOS (COMPUTEDS)
        // =================================================================
        
        // Totais do Formulário de Agendamento
        const totalServices = computed(() => tempApp.selectedServices.reduce((acc, i) => acc + toNum(i.price), 0));
        const finalBalance = computed(() => totalServices.value - toNum(tempApp.details.entryFee));

        // KPIs do Dashboard (Receita, Despesa, Lucro)
        const financeData = computed(() => {
            const revenue = dashboardData.appointments.reduce((acc, a) => acc + toNum(a.totalServices), 0);
            const expenses = dashboardData.expenses.reduce((acc, e) => acc + toNum(e.value), 0);
            const receivables = dashboardData.appointments.reduce((acc, a) => acc + toNum(a.finalBalance), 0);
            return {
                revenue,
                expenses,
                profit: revenue - expenses,
                receivables
            };
        });

        // Lista do Extrato (Junta Receitas e Despesas)
        const statementList = computed(() => {
            const income = dashboardData.appointments.map(a => ({
                id: a.id,
                date: a.date,
                description: `Receita: ${clientCache[a.clientId]?.name || 'Cliente'}`,
                value: toNum(a.totalServices),
                type: 'income',
                icon: 'fa-circle-arrow-up',
                color: 'text-green-500'
            }));

            const expense = dashboardData.expenses.map(e => ({
                id: e.id,
                date: e.date,
                description: e.description || 'Despesa',
                value: toNum(e.value),
                type: 'expense',
                icon: 'fa-circle-arrow-down',
                color: 'text-red-500'
            }));

            // Ordena do mais recente para o mais antigo
            return [...income, ...expense].sort((a, b) => b.date.localeCompare(a.date));
        });

        // Próximos 7 dias (Dashboard)
        const next7DaysApps = computed(() => {
            const today = new Date().toISOString().split('T')[0];
            const nextWeek = new Date();
            nextWeek.setDate(nextWeek.getDate() + 7);
            const nextWeekStr = nextWeek.toISOString().split('T')[0];

            return pendingAppointments.value
                .filter(a => a.date >= today && a.date <= nextWeekStr)
                .sort((a,b) => a.date.localeCompare(b.date));
        });

        // Filtro da Busca de Clientes (Agenda)
        const filteredClientsSearch = computed(() => scheduleClientsList.value);

        // =================================================================
        // 5. AÇÕES (FUNÇÕES DE BOTÕES)
        // =================================================================
        
        const saveAppointment = async () => {
            const total = totalServices.value;
            const entry = toNum(tempApp.details.entryFee);
            const appData = { ...JSON.parse(JSON.stringify(tempApp)), totalServices: total, entryFee: entry, finalBalance: total - entry, userId: user.value.uid, status: 'pending' };
            
            if(!appData.checklist.length) appData.checklist = [{text:'Separar Materiais', done:false}];
            
            if (isEditing.value && editingId.value) await updateDoc(doc(db, "appointments", editingId.value), appData);
            else await addDoc(collection(db, "appointments"), appData);
            
            loadDashboardData();
            view.value = 'dashboard';
            Swal.fire({icon: 'success', title: 'Salvo com sucesso!', timer: 1500, showConfirmButton: false});
        };

        const addExpense = async () => {
            const data = { ...newExpense, value: toNum(newExpense.value), userId: user.value.uid };
            await addDoc(collection(db, "expenses"), data);
            loadDashboardData();
            showExpenseModal.value = false;
            // Limpa form
            newExpense.description = ''; newExpense.value = '';
        };

        const deleteExpense = async (id) => {
            if((await Swal.fire({title:'Excluir?', showCancelButton:true})).isConfirmed) {
                await deleteDoc(doc(db, "expenses", id));
                loadDashboardData();
            }
        };

        // --- Clientes ---
        const searchCatalogClients = async () => {
            const q = query(collection(db, "clients"), where("userId", "==", user.value.uid));
            const snap = await getDocs(q);
            const term = catalogClientSearch.value.toLowerCase();
            catalogClientsList.value = snap.docs.map(d => ({id: d.id, ...d.data()}))
                .filter(c => c.name.toLowerCase().includes(term));
        };

        const openClientModal = async () => {
            const { value: vals } = await Swal.fire({ title: 'Novo Cliente', html: '<input id="n" placeholder="Nome" class="swal2-input"><input id="p" placeholder="Telefone" class="swal2-input">', preConfirm: () => [document.getElementById('n').value, document.getElementById('p').value] });
            if (vals) await addDoc(collection(db, "clients"), { name: vals[0], phone: vals[1], userId: user.value.uid });
        };

        const deleteClient = async (id) => {
            if((await Swal.fire({title:'Excluir?', showCancelButton:true})).isConfirmed) {
                await deleteDoc(doc(db,"clients",id));
                // Remove da lista visualmente
                catalogClientsList.value = catalogClientsList.value.filter(c => c.id !== id);
            }
        };

        // --- Agenda ---
        watch(clientSearchTerm, async (val) => {
            if (val && val.length > 2) {
                const q = query(collection(db, "clients"), where("userId", "==", user.value.uid));
                const snap = await getDocs(q);
                scheduleClientsList.value = snap.docs.map(d => ({ id: d.id, ...d.data() }))
                    .filter(c => c.name.toLowerCase().includes(val.toLowerCase()));
            } else { scheduleClientsList.value = []; }
        });

        // --- Outros ---
        const handleAuth = async () => {
            authLoading.value = true;
            try {
                if (isRegistering.value) {
                    const cred = await createUserWithEmailAndPassword(auth, authForm.email, authForm.password);
                    await updateProfile(cred.user, { displayName: authForm.name });
                    await setDoc(doc(db, "users", cred.user.uid), { email: authForm.email, displayName: authForm.name, role: 'user', createdAt: new Date().toISOString() });
                } else { await signInWithEmailAndPassword(auth, authForm.email, authForm.password); }
            } catch (e) { Swal.fire('Erro', 'Verifique email/senha', 'error'); } finally { authLoading.value = false; }
        };

        const generateContractPDF = () => { const doc = new window.jspdf.jsPDF(); doc.text(`Contrato - ${company.fantasia}`, 10, 10); doc.save("Contrato.pdf"); };
        const downloadReceiptImage = () => { html2canvas(document.getElementById('receipt-capture-area')).then(c => { const l = document.createElement('a'); l.download = 'Recibo.png'; l.href = c.toDataURL(); l.click(); }); };
        const saveCompany = () => { updateDoc(doc(db, "users", user.value.uid), { companyConfig: company }); Swal.fire('Salvo', '', 'success'); };
        const handleLogoUpload = (e) => { const f = e.target.files[0]; if(f){ const r=new FileReader(); r.onload=x=>{company.logo=x.target.result;}; r.readAsDataURL(f); }};
        const handleChangePassword = async () => { Swal.fire('Info', 'Use a redefinição por email na tela de login por enquanto.', 'info'); };

        // =================================================================
        // 6. RETORNO PARA O HTML
        // =================================================================
        return {
            user, view, isDark, authForm, authLoading, isRegistering, handleAuth, 
            logout: () => { signOut(auth); window.location.href="index.html"; },
            
            // Dados e Listas
            dashboardMonth, financeData, next7DaysApps, statementList,
            catalogClientsList, expensesList,
            
            // Funções de UI
            formatCurrency, formatDate, getDay, getMonth, statusText, statusClass, getCategoryIcon, getClientName,
            toggleDarkMode: () => { isDark.value=!isDark.value; document.documentElement.classList.toggle('dark'); },
            
            // Agenda / Novo Evento
            tempApp, tempServiceSelect, services, totalServices, finalBalance, isEditing, 
            clientSearchTerm, filteredClientsSearch,
            startNewSchedule: () => { isEditing.value=false; Object.assign(tempApp, {clientId:'', date:'', time:'', location:{bairro:''}, details:{entryFee:0}, selectedServices:[], checklist:[]}); view.value='schedule'; },
            editAppointment: (app) => { isEditing.value=true; editingId.value=app.id; Object.assign(tempApp, JSON.parse(JSON.stringify(app))); view.value='schedule'; },
            addServiceToApp: () => { if(tempServiceSelect.value) tempApp.selectedServices.push(tempServiceSelect.value); tempServiceSelect.value=''; },
            removeServiceFromApp: (i) => tempApp.selectedServices.splice(i,1),
            saveAppointment,

            // Financeiro
            showExpenseModal, newExpense, expenseCategories, addExpense, deleteExpense,

            // Clientes
            catalogClientSearch, searchCatalogClients, openClientModal, deleteClient,

            // Recibo / Configs
            currentReceipt, showReceipt: (app) => { currentReceipt.value = sanitizeApp(app); view.value = 'receipt'; },
            company, handleLogoUpload, saveCompany, handleChangePassword,
            generateContractPDF, downloadReceiptImage
        };
    }
}).mount('#app');