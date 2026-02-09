const { createApp, ref, computed, reactive, onMounted, watch } = Vue;

import { 
    db, auth, 
    collection, addDoc, onSnapshot, doc, updateDoc, deleteDoc, getDocs, query, where, setDoc, getDoc, orderBy,
    signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged,
    updatePassword, reauthenticateWithCredential, EmailAuthProvider, updateProfile 
} from './firebase.js';

createApp({
    setup() {
        // --- ESTADOS GERAIS ---
        const user = ref(null);
        const userRole = ref('user');
        const userStatus = ref('trial');
        const daysRemaining = ref(30);
        const view = ref('dashboard');
        const catalogView = ref('company'); 
        const isDark = ref(false);
        const showLanding = ref(true);
        
        // --- AUTENTICAÇÃO ---
        const authLoading = ref(false);
        const isRegistering = ref(false); 
        const authForm = reactive({ email: '', password: '', name: '', phone: '' });

        // --- DASHBOARD (MENSAL) ---
        const dashboardMonth = ref(new Date().toISOString().slice(0, 7)); 
        const dashboardData = reactive({ appointments: [], expenses: [] });
        const isLoadingDashboard = ref(false);

        // --- CALENDÁRIO ---
        const appointmentViewMode = ref('list'); 
        const calendarCursor = ref(new Date()); 
        const selectedCalendarDate = ref(null); 

        // --- DADOS ---
        const services = ref([]); 
        const pendingAppointments = ref([]); 
        const historyList = ref([]); 
        const expensesList = ref([]); 
        const catalogClientsList = ref([]); 
        const scheduleClientsList = ref([]); 
        const clientCache = reactive({}); 

        // --- CATEGORIAS ---
        const expenseCategories = [
            { id: 'combustivel', label: 'Combustível / Transporte', icon: 'fa-gas-pump' },
            { id: 'materiais', label: 'Materiais / Decoração', icon: 'fa-box-open' },
            { id: 'equipe', label: 'Equipe / Diária', icon: 'fa-users' },
            { id: 'refeicao', label: 'Alimentação / Lanche', icon: 'fa-utensils' },
            { id: 'marketing', label: 'Marketing / Anúncios', icon: 'fa-bullhorn' },
            { id: 'aluguel', label: 'Aluguel / Espaço', icon: 'fa-house' },
            { id: 'outros', label: 'Outras Despesas', icon: 'fa-money-bill' }
        ];

        // --- FILTROS ---
        const currentTab = ref('pending'); 
        const historyFilter = reactive({ start: '', end: '' });
        const expensesFilter = reactive({ start: new Date().toISOString().split('T')[0], end: new Date().toISOString().split('T')[0], category: '' });
        const catalogClientSearch = ref('');
        const clientSearchTerm = ref(''); 
        const isLoadingHistory = ref(false);

        // --- FORMULÁRIOS ---
        const company = reactive({ fantasia: '', logo: '', cnpj: '', razao: '', cidade: '', rua: '', estado: '' });
        const tempApp = reactive({ clientId: '', date: '', time: '', location: { bairro: '', cidade: '', numero: '' }, details: { balloonColors: '', entryFee: 0 }, notes: '', selectedServices: [] });
        const tempServiceSelect = ref('');
        const newExpense = reactive({ description: '', value: '', date: new Date().toISOString().split('T')[0], category: '' });
        const showExpenseModal = ref(false); 
        const currentReceipt = ref(null);
        const selectedAppointment = ref(null);
        const detailTaskInput = ref(''); 
        const isEditing = ref(false);
        const editingId = ref(null);

        // --- UTILS MATEMÁTICOS ---
        const toNum = (val) => {
            if (!val) return 0;
            if (typeof val === 'number') return val;
            const clean = String(val).replace(',', '.').replace(/[^0-9.-]/g, '');
            return parseFloat(clean) || 0;
        };

        const sanitizeApp = (docSnapshot) => {
            const data = docSnapshot.data ? docSnapshot.data() : docSnapshot;
            return {
                id: docSnapshot.id || data.id,
                ...data,
                checklist: Array.isArray(data.checklist) ? data.checklist : [],
                selectedServices: Array.isArray(data.selectedServices) ? data.selectedServices : [],
                totalServices: toNum(data.totalServices),
                finalBalance: toNum(data.finalBalance),
                entryFee: toNum(data.entryFee)
            };
        };

        const sanitizeExpense = (docSnapshot) => {
            const data = docSnapshot.data ? docSnapshot.data() : docSnapshot;
            return { id: docSnapshot.id || data.id, ...data, value: toNum(data.value) };
        };

        // --- UTILS FORMATADORES ---
        const formatCurrency = (v) => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(toNum(v));
        const formatDate = (d) => d ? d.split('-').reverse().join('/') : '';
        const getDay = (d) => d ? d.split('-')[2] : '';
        const getMonth = (d) => ['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'][parseInt(d.split('-')[1])-1];
        const statusText = (s) => s === 'concluded' ? 'Concluída' : (s === 'cancelled' ? 'Cancelada' : 'Pendente');
        const statusClass = (s) => s === 'concluded' ? 'bg-green-100 text-green-600' : (s === 'cancelled' ? 'bg-red-100 text-red-600' : 'bg-yellow-100 text-yellow-600');
        const getCategoryIcon = (catId) => { const cat = expenseCategories.find(c => c.id === catId); return cat ? cat.icon : 'fa-money-bill'; };

        const fetchClientToCache = async (id) => { 
            if (clientCache[id] || !id) return; 
            try { 
                const docSnap = await getDoc(doc(db, "clients", id)); 
                if (docSnap.exists()) clientCache[id] = docSnap.data(); 
                else clientCache[id] = { name: 'Excluído', phone: '-' }; 
            } catch (e) { console.error(e); } 
        };

        // --- AUTH & SYNC ---
        onMounted(() => {
            onAuthStateChanged(auth, async (u) => {
                if (u) {
                    const userRef = doc(db, "users", u.uid);
                    const userDoc = await getDoc(userRef);
                    if (!userDoc.exists()) {
                         await setDoc(userRef, { email: u.email, displayName: u.displayName || 'Novo Usuário', role: 'user', status: 'trial', createdAt: new Date().toISOString(), companyConfig: { fantasia: u.displayName || 'Minha Empresa' } });
                    }
                    await updateDoc(userRef, { lastLogin: new Date().toISOString() });
                    const updatedDoc = await getDoc(userRef);
                    user.value = u;
                    const data = updatedDoc.data();
                    userRole.value = data.role || 'user';
                    userStatus.value = data.status || 'trial';
                    if(data.companyConfig) Object.assign(company, data.companyConfig);
                    syncData(); loadDashboardData(); 
                } else { user.value = null; }
            });
            if(localStorage.getItem('pp_dark') === 'true') { isDark.value = true; document.documentElement.classList.add('dark'); }
        });

        // --- DASHBOARD LOAD ---
        const loadDashboardData = async () => {
            if (!user.value) return;
            isLoadingDashboard.value = true;
            try {
                const [year, month] = dashboardMonth.value.split('-');
                const startStr = `${year}-${month}-01`;
                const lastDay = new Date(year, month, 0).getDate();
                const endStr = `${year}-${month}-${lastDay}`;
                const qApps = query(collection(db, "appointments"), where("userId", "==", user.value.uid), where("date", ">=", startStr), where("date", "<=", endStr));
                const qExp = query(collection(db, "expenses"), where("userId", "==", user.value.uid), where("date", ">=", startStr), where("date", "<=", endStr));
                const [snapApps, snapExp] = await Promise.all([getDocs(qApps), getDocs(qExp)]);
                dashboardData.appointments = snapApps.docs.map(sanitizeApp).filter(app => app.status !== 'cancelled');
                dashboardData.expenses = snapExp.docs.map(sanitizeExpense);
                expensesList.value = [...dashboardData.expenses].sort((a,b) => b.date.localeCompare(a.date));
            } catch (e) { console.error("Erro Dashboard:", e); } finally { isLoadingDashboard.value = false; }
        };
        watch(dashboardMonth, () => { loadDashboardData(); });

        const syncData = () => {
            const myId = user.value.uid; 
            onSnapshot(query(collection(db, "services"), where("userId", "==", myId)), (snap) => { services.value = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })); });
            onSnapshot(query(collection(db, "appointments"), where("userId", "==", myId), where("status", "==", "pending")), (snap) => { 
                pendingAppointments.value = snap.docs.map(sanitizeApp); 
                pendingAppointments.value.forEach(a => fetchClientToCache(a.clientId));
            });
        };

        // --- COMPUTEDS E KPIs ---
        const kpiRevenue = computed(() => dashboardData.appointments.reduce((acc, a) => acc + toNum(a.totalServices), 0));
        const kpiExpenses = computed(() => dashboardData.expenses.reduce((acc, e) => acc + toNum(e.value), 0));
        const kpiProfit = computed(() => kpiRevenue.value - kpiExpenses.value); 
        const kpiReceivables = computed(() => dashboardData.appointments.reduce((acc, a) => acc + toNum(a.finalBalance), 0));
        const financeData = computed(() => ({ revenue: kpiRevenue.value, expenses: kpiExpenses.value, profit: kpiProfit.value, receivables: kpiReceivables.value }));
        const financeSummary = computed(() => expensesList.value.reduce((acc, e) => acc + toNum(e.value), 0));
        const filteredExpensesList = computed(() => expensesList.value);

        const expensesByCategoryStats = computed(() => {
            if (!dashboardData.expenses.length) return [];
            return expenseCategories.map(cat => {
                const total = dashboardData.expenses.filter(e => e.category === cat.id).reduce((sum, e) => sum + toNum(e.value), 0);
                return { ...cat, total };
            }).filter(c => c.total > 0).sort((a,b) => b.total - a.total);
        });

        const statementList = computed(() => {
            const income = dashboardData.appointments.map(a => ({
                id: a.id, date: a.date, description: `Festa: ${clientCache[a.clientId]?.name || 'Cliente'}`, value: toNum(a.totalServices), type: 'income', icon: 'fa-circle-arrow-up', color: 'text-green-500'
            }));
            const expense = dashboardData.expenses.map(e => ({
                id: e.id, date: e.date, description: e.description, value: toNum(e.value), type: 'expense', icon: 'fa-circle-arrow-down', color: 'text-red-500'
            }));
            return [...income, ...expense].sort((a, b) => b.date.localeCompare(a.date));
        });

        // --- AÇÕES ---
        const handleChangePassword = async () => { 
            const html = '<input id="currentPass" type="password" class="swal2-input" placeholder="Senha Atual"><input id="newPass" type="password" class="swal2-input" placeholder="Nova Senha">'; 
            const { value: fv } = await Swal.fire({ title: 'Alterar Senha', html: html, showCancelButton: true, confirmButtonText: 'Alterar', preConfirm: () => { return [document.getElementById('currentPass').value, document.getElementById('newPass').value]; } }); 
            if (fv && fv[0] && fv[1]) { 
                try { 
                    const c = EmailAuthProvider.credential(user.value.email, fv[0]); 
                    await reauthenticateWithCredential(user.value, c); 
                    await updatePassword(user.value, fv[1]); 
                    Swal.fire('Sucesso!', 'Senha alterada.', 'success'); 
                } catch (error) { Swal.fire('Erro', 'Senha incorreta.', 'error'); } 
            } 
        };

        const logout = async () => { await signOut(auth); window.location.href = "index.html"; };
        const toggleDarkMode = () => { isDark.value = !isDark.value; document.documentElement.classList.toggle('dark'); localStorage.setItem('pp_dark', isDark.value); };

        return {
            user, userRole, userStatus, daysRemaining, authForm, authLoading, view, catalogView, isDark, showLanding,
            services, appointments: pendingAppointments, expensesList, catalogClientsList, company,
            tempApp, tempServiceSelect, newExpense, showExpenseModal, currentReceipt, isEditing, expenseCategories,
            financeData, financeSummary, filteredExpensesList, expensesByCategoryStats, statementList,
            handleChangePassword, logout, toggleDarkMode, // RECOLOCADO AQUI
            formatCurrency, formatDate, getDay, getMonth, statusText, statusClass, getCategoryIcon,
            dashboardMonth, loadDashboardData, isLoadingDashboard,
            startNewSchedule: () => { isEditing.value=false; editingId.value=null; Object.assign(tempApp, { clientId: '', date: '', time: '', location: { bairro: '', cidade: '', numero: '' }, details: { balloonColors: '', entryFee: 0 }, notes: '', selectedServices: [] }); view.value='schedule'; },
            editAppointment: (app) => { isEditing.value=true; editingId.value=app.id; Object.assign(tempApp, JSON.parse(JSON.stringify(app))); view.value='schedule'; },
            showReceipt: (app) => { currentReceipt.value = sanitizeApp(app); view.value = 'receipt'; },
            appointmentViewMode, calendarCursor, changeCalendarMonth: (off) => { const d = new Date(calendarCursor.value); d.setMonth(d.getMonth() + off); calendarCursor.value = d; }, 
            calendarGrid: computed(() => {
                const year = calendarCursor.value.getFullYear(); const month = calendarCursor.value.getMonth();
                const firstDay = new Date(year, month, 1).getDay(); const daysInMonth = new Date(year, month + 1, 0).getDate();
                const days = [];
                for (let i = 0; i < firstDay; i++) { days.push({ day: '', date: null, hasEvent: false }); }
                for (let i = 1; i <= daysInMonth; i++) {
                    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
                    const hasEvent = pendingAppointments.value.some(app => app.date === dateStr);
                    days.push({ day: i, date: dateStr, hasEvent });
                }
                return days;
            }),
            calendarTitle: computed(() => `${['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'][calendarCursor.value.getMonth()]} ${calendarCursor.value.getFullYear()}`),
            selectCalendarDay: (d) => { if (d.day) selectedCalendarDate.value = d.date; },
            selectedCalendarDate, 
            appointmentsOnSelectedDate: computed(() => pendingAppointments.value.filter(a => a.date === selectedCalendarDate.value)),
            pendingCount: computed(() => pendingAppointments.value.length),
            next7DaysApps: computed(() => { 
                const t = new Date(); t.setHours(0,0,0,0); const w = new Date(t); w.setDate(t.getDate() + 7); 
                return pendingAppointments.value.filter(a => { const d = new Date(a.date); return d >= t && d <= w; }).sort((a,b) => a.date.localeCompare(b.date));
            })
        };
    }
}).mount('#app');
