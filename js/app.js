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

        // --- FUNÇÃO DE LIMPEZA MATEMÁTICA (ESSENCIAL) ---
        // Converte qualquer coisa (texto com vírgula, nulo, undefined) para um número válido
        const safeFloat = (val) => {
            if (val === null || val === undefined) return 0;
            if (typeof val === 'number') return val;
            if (typeof val === 'string') {
                // Troca vírgula por ponto e remove caracteres não numéricos (exceto ponto e menos)
                const clean = val.replace(',', '.').replace(/[^0-9.-]/g, '');
                return parseFloat(clean) || 0;
            }
            return 0;
        };

        // --- VACINA DE DADOS ---
        const sanitizeApp = (docSnapshot) => {
            const data = docSnapshot.data ? docSnapshot.data() : docSnapshot;
            return {
                id: docSnapshot.id || data.id,
                ...data,
                checklist: Array.isArray(data.checklist) ? data.checklist : [],
                selectedServices: Array.isArray(data.selectedServices) ? data.selectedServices : [],
                // Usa safeFloat para garantir que os valores sejam números
                totalServices: safeFloat(data.totalServices),
                finalBalance: safeFloat(data.finalBalance),
                entryFee: safeFloat(data.entryFee)
            };
        };

        const sanitizeExpense = (docSnapshot) => {
            const data = docSnapshot.data ? docSnapshot.data() : docSnapshot;
            return {
                id: docSnapshot.id || data.id,
                ...data,
                // Garante que o valor da despesa seja numérico
                value: safeFloat(data.value)
            };
        };

        // --- UTILS ---
        const formatCurrency = (v) => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(safeFloat(v));
        const formatDate = (d) => {
            if (!d || typeof d !== 'string') return '';
            try { return d.split('-').reverse().join('/'); } catch (e) { return ''; }
        };
        const getDay = (d) => d ? d.split('-')[2] : '';
        const getMonth = (d) => ['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'][parseInt(d.split('-')[1])-1];
        const statusText = (s) => s === 'concluded' ? 'Concluída' : (s === 'cancelled' ? 'Cancelada' : 'Pendente');
        const statusClass = (s) => s === 'concluded' ? 'bg-green-100 text-green-600' : (s === 'cancelled' ? 'bg-red-100 text-red-600' : 'bg-yellow-100 text-yellow-600');
        const getCategoryIcon = (catId) => { const cat = expenseCategories.find(c => c.id === catId); return cat ? cat.icon : 'fa-money-bill'; };

        const resolveClientName = (id) => { if (!id) return '...'; if (clientCache[id]) return clientCache[id].name; fetchClientToCache(id); return 'Carregando...'; };
        const getClientName = (id) => resolveClientName(id);
        const getClientPhone = (id) => clientCache[id] ? clientCache[id].phone : '';
        const fetchClientToCache = async (id) => { if (clientCache[id] || !id) return; try { const docSnap = await getDoc(doc(db, "clients", id)); if (docSnap.exists()) clientCache[id] = docSnap.data(); else clientCache[id] = { name: 'Excluído', phone: '-' }; } catch (e) { console.error(e); } };

        watch([pendingAppointments, historyList], ([newPending, newHistory]) => { if(newPending) newPending.forEach(app => fetchClientToCache(app.clientId)); if(newHistory) newHistory.forEach(app => fetchClientToCache(app.clientId)); }, { deep: true });

        // --- AUTH & SYNC ---
        onMounted(() => {
            onAuthStateChanged(auth, async (u) => {
                if (u) {
                    const userRef = doc(db, "users", u.uid);
                    const userDoc = await getDoc(userRef);
                    if (!userDoc.exists()) {
                         await setDoc(userRef, {
                            email: u.email, displayName: u.displayName || 'Novo Usuário', role: 'user', status: 'trial', createdAt: new Date().toISOString(), companyConfig: { fantasia: u.displayName || 'Minha Empresa' }
                        });
                    }
                    await updateDoc(userRef, { lastLogin: new Date().toISOString() });
                    const updatedDoc = await getDoc(userRef);
                    user.value = u;
                    const data = updatedDoc.data();
                    userRole.value = data.role || 'user';
                    userStatus.value = data.status || 'trial';
                    
                    if (userRole.value !== 'admin' && userStatus.value !== 'active') {
                        const createdAt = new Date(data.createdAt || new Date());
                        const diffDays = Math.ceil(Math.abs(new Date() - createdAt) / (1000 * 60 * 60 * 24)); 
                        daysRemaining.value = 30 - diffDays;
                        if (daysRemaining.value <= 0) { view.value = 'expired_plan'; return; }
                    }
                    if(data.companyConfig) Object.assign(company, data.companyConfig);
                    syncData(); loadDashboardData(); 
                } else { user.value = null; }
            });
            if(localStorage.getItem('pp_dark') === 'true') { isDark.value = true; document.documentElement.classList.add('dark'); }
            const t = new Date(); const lm = new Date(); lm.setDate(t.getDate() - 30); historyFilter.end = t.toISOString().split('T')[0]; historyFilter.start = lm.toISOString().split('T')[0];
        });

        const handleAuth = async () => {
            if (!authForm.email || !authForm.password) return Swal.fire('Ops', 'Preencha email e senha', 'warning');
            authLoading.value = true;
            try {
                if (isRegistering.value) {
                    if (!authForm.name) return Swal.fire('Ops', 'Informe seu nome', 'warning');
                    const userCredential = await createUserWithEmailAndPassword(auth, authForm.email, authForm.password);
                    await updateProfile(userCredential.user, { displayName: authForm.name });
                    await setDoc(doc(db, "users", userCredential.user.uid), {
                        email: authForm.email, displayName: authForm.name, phone: authForm.phone, role: 'user', status: 'trial', createdAt: new Date().toISOString(), companyConfig: { fantasia: authForm.name }
                    });
                    Swal.fire({ icon: 'success', title: 'Bem-vinda!', text: 'Seu teste de 30 dias começou.', timer: 2000 });
                } else {
                    await signInWithEmailAndPassword(auth, authForm.email, authForm.password);
                }
            } catch (error) {
                console.error(error); Swal.fire('Erro', 'Verifique seus dados.', 'error');
            } finally { authLoading.value = false; }
        };

        const logout = async () => { await signOut(auth); window.location.href = "index.html"; };

        // --- DASHBOARD (CARREGAMENTO) ---
        const loadDashboardData = async () => {
            if (!user.value) return;
            isLoadingDashboard.value = true;
            try {
                if(!dashboardMonth.value) dashboardMonth.value = new Date().toISOString().slice(0, 7);
                const [year, month] = dashboardMonth.value.split('-');
                const startStr = `${year}-${month}-01`;
                const lastDay = new Date(year, month, 0).getDate();
                const endStr = `${year}-${month}-${lastDay}`;

                const qApps = query(collection(db, "appointments"), where("userId", "==", user.value.uid), where("date", ">=", startStr), where("date", "<=", endStr));
                const qExp = query(collection(db, "expenses"), where("userId", "==", user.value.uid), where("date", ">=", startStr), where("date", "<=", endStr));
                const [snapApps, snapExp] = await Promise.all([getDocs(qApps), getDocs(qExp)]);
                
                // Aplica a vacina nos agendamentos
                dashboardData.appointments = snapApps.docs.map(sanitizeApp).filter(app => app.status !== 'cancelled');
                
                // Aplica a vacina nas despesas
                const loadedExpenses = snapExp.docs.map(sanitizeExpense);
                dashboardData.expenses = loadedExpenses;
                expensesList.value = [...loadedExpenses].sort((a,b) => new Date(b.date) - new Date(a.date));

            } catch (e) { console.error(e); } finally { isLoadingDashboard.value = false; }
        };
        watch(dashboardMonth, () => { loadDashboardData(); });

        // --- CALENDÁRIO ---
        const changeCalendarMonth = (offset) => { const d = new Date(calendarCursor.value); d.setMonth(d.getMonth() + offset); calendarCursor.value = d; };
        const calendarGrid = computed(() => {
            const year = calendarCursor.value.getFullYear(); const month = calendarCursor.value.getMonth();
            const firstDay = new Date(year, month, 1).getDay(); const daysInMonth = new Date(year, month + 1, 0).getDate();
            const days = [];
            for (let i = 0; i < firstDay; i++) { days.push({ day: '', date: null, hasEvent: false }); }
            for (let i = 1; i <= daysInMonth; i++) {
                const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
                const hasEvent = pendingAppointments.value.some(app => app.date === dateStr && app.status !== 'cancelled');
                days.push({ day: i, date: dateStr, hasEvent: hasEvent });
            }
            return days;
        });
        const calendarTitle = computed(() => { const m = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']; return `${m[calendarCursor.value.getMonth()]} ${calendarCursor.value.getFullYear()}`; });
        const selectCalendarDay = (dayObj) => { if (!dayObj.day) return; selectedCalendarDate.value = dayObj.date; };
        const appointmentsOnSelectedDate = computed(() => { if (!selectedCalendarDate.value) return []; return pendingAppointments.value.filter(a => a.date === selectedCalendarDate.value); });

        // --- SYNC ---
        let unsubscribeListeners = []; 
        const syncData = () => {
            unsubscribeListeners.forEach(unsub => unsub()); unsubscribeListeners = [];
            const myId = user.value.uid; 
            unsubscribeListeners.push(onSnapshot(query(collection(db, "services"), where("userId", "==", myId)), (snap) => { services.value = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })); }));
            const qApps = query(collection(db, "appointments"), where("userId", "==", myId), where("status", "==", "pending"));
            unsubscribeListeners.push(onSnapshot(qApps, (snap) => { 
                pendingAppointments.value = snap.docs.map(sanitizeApp); 
                if(view.value === 'appointment_details' && selectedAppointment.value) {
                    const updated = pendingAppointments.value.find(a => a.id === selectedAppointment.value.id);
                    if(updated) selectedAppointment.value = updated;
                }
            }));
        };

        // --- ACTIONS ---
        const searchHistory = async () => {
            if(!historyFilter.start || !historyFilter.end) return Swal.fire('Atenção', 'Selecione as datas', 'warning');
            isLoadingHistory.value = true; historyList.value = [];
            try {
                const q = query(collection(db, "appointments"), where("userId", "==", user.value.uid));
                const snap = await getDocs(q);
                const allApps = snap.docs.map(sanitizeApp);
                historyList.value = allApps.filter(app => app.status === currentTab.value && app.date >= historyFilter.start && app.date <= historyFilter.end);
                if(historyList.value.length === 0) Swal.fire('Info', 'Nenhum registro encontrado.', 'info');
            } catch (error) { console.error(error); Swal.fire('Erro', 'Tente novamente.', 'error'); } finally { isLoadingHistory.value = false; }
        };

        const searchExpenses = async () => {
            if(!expensesFilter.start || !expensesFilter.end) return Swal.fire('Data', 'Selecione o período', 'info');
            try {
                const q = query(collection(db, "expenses"), where("userId", "==", user.value.uid));
                const snap = await getDocs(q);
                // Usa sanitizeExpense aqui também
                const allExpenses = snap.docs.map(sanitizeExpense);
                expensesList.value = allExpenses.filter(e => {
                    const dateOk = e.date >= expensesFilter.start && e.date <= expensesFilter.end;
                    const categoryOk = !expensesFilter.category || e.category === expensesFilter.category;
                    return dateOk && categoryOk;
                });
                expensesList.value.sort((a,b) => new Date(b.date) - new Date(a.date));
                if(expensesList.value.length === 0) Swal.fire('Vazio', 'Nenhuma despesa encontrada.', 'info');
            } catch(e) { console.error(e); }
        };

        // --- COMPUTEDS E CÁLCULOS (COM SAFEFLOAT) ---
        const filteredExpensesList = computed(() => expensesList.value || []);
        
        const financeSummary = computed(() => {
            return expensesList.value.reduce((acc, item) => acc + safeFloat(item.value), 0);
        });

        const expensesByCategoryStats = computed(() => {
            if (!dashboardData.expenses || dashboardData.expenses.length === 0) return [];
            return expenseCategories.map(cat => {
                const total = dashboardData.expenses
                    .filter(e => e.category === cat.id)
                    .reduce((sum, e) => sum + safeFloat(e.value), 0);
                return { ...cat, total };
            }).filter(c => c.total > 0).sort((a, b) => b.total - a.total);
        });

        const statementList = computed(() => {
            const income = (dashboardData.appointments || []).map(a => ({
                id: a.id,
                date: a.date,
                description: 'Receita: ' + (clientCache[a.clientId]?.name || 'Cliente'),
                value: safeFloat(a.totalServices),
                type: 'income',
                icon: 'fa-circle-arrow-up',
                color: 'text-green-500'
            }));
            const expense = (dashboardData.expenses || []).map(e => ({
                id: e.id,
                date: e.date,
                description: e.description || 'Despesa',
                value: safeFloat(e.value),
                type: 'expense',
                icon: 'fa-circle-arrow-down',
                color: 'text-red-500'
            }));
            return [...income, ...expense].sort((a, b) => new Date(b.date) - new Date(a.date));
        });

        // KPI COMPUTEDS (USANDO SAFEFLOAT)
        const kpiRevenue = computed(() => { 
            if (!dashboardData.appointments) return 0; 
            return dashboardData.appointments.reduce((acc, a) => acc + safeFloat(a.totalServices), 0); 
        });
        const kpiExpenses = computed(() => { 
            if (!dashboardData.expenses) return 0; 
            return dashboardData.expenses.reduce((acc, e) => acc + safeFloat(e.value), 0); 
        });
        const kpiProfit = computed(() => kpiRevenue.value - kpiExpenses.value); 
        const kpiReceivables = computed(() => { 
            if (!dashboardData.appointments) return 0; 
            return dashboardData.appointments.reduce((acc, a) => acc + safeFloat(a.finalBalance), 0); 
        });
        
        const financeData = computed(() => ({
            revenue: kpiRevenue.value,
            expenses: kpiExpenses.value,
            profit: kpiProfit.value,
            receivables: kpiReceivables.value
        }));

        const filteredListAppointments = computed(() => { 
            let list = currentTab.value === 'pending' ? pendingAppointments.value : historyList.value;
            if (!list) return [];
            return [...list].sort((a,b) => new Date(a.date) - new Date(b.date)); 
        });
        
        const pendingCount = computed(() => pendingAppointments.value ? pendingAppointments.value.length : 0);
        const next7DaysApps = computed(() => { 
            if (!pendingAppointments.value) return [];
            const t = new Date(); t.setHours(0,0,0,0); const w = new Date(t); w.setDate(t.getDate() + 7); 
            return pendingAppointments.value.filter(a => { if (!a || !a.date) return false; const d = new Date(a.date); return d >= t && d <= w; }).sort((a,b) => new Date(a.date) - new Date(b.date));
        });
        const totalServices = computed(() => { if (!tempApp.selectedServices) return 0; return tempApp.selectedServices.reduce((s,i) => s + safeFloat(i.price), 0); });
        const finalBalance = computed(() => { const entry = safeFloat(tempApp.details ? tempApp.details.entryFee : 0); return totalServices.value - entry; });
        const filteredClientsSearch = computed(() => scheduleClientsList.value);
        const checklistProgress = (app) => { if (!app || !app.checklist || !Array.isArray(app.checklist) || app.checklist.length === 0) return 0; const total = app.checklist.length; const done = app.checklist.filter(t => t && t.done).length; return Math.round((done / total) * 100); };

        // --- MODAIS E CRUD ---
        const saveAppointment = async () => {
            const total = tempApp.selectedServices.reduce((sum, i) => sum + safeFloat(i.price), 0);
            const entry = safeFloat(tempApp.details.entryFee);
            const appData = { ...JSON.parse(JSON.stringify(tempApp)), totalServices: total, entryFee: entry, finalBalance: total - entry, userId: user.value.uid };
            if(!appData.checklist) appData.checklist = [{text:'Separar Materiais', done:false}];
            if(isEditing.value && editingId.value) { await updateDoc(doc(db, "appointments", editingId.value), appData); Swal.fire({icon:'success', title:'Atualizado', timer:1000}); } 
            else { appData.status = 'pending'; await addDoc(collection(db, "appointments"), appData); Swal.fire({icon:'success', title:'Agendado!', timer:1000}); }
            if(appData.date.startsWith(dashboardMonth.value)) loadDashboardData();
            view.value = 'appointments_list'; currentTab.value = 'pending';
        };

        const changeStatus = async (app, status) => { 
            const action = status === 'concluded' ? 'Concluir' : 'Cancelar';
            const { isConfirmed } = await Swal.fire({ title: action + '?', text: 'Confirmar ação?', icon: 'question', showCancelButton: true });
            if(isConfirmed) {
                await updateDoc(doc(db, "appointments", app.id), { status: status });
                const idx = historyList.value.findIndex(x => x.id === app.id); if(idx !== -1) historyList.value.splice(idx, 1);
                loadDashboardData(); Swal.fire('Feito!', '', 'success');
            }
        };

        const updateAppInFirebase = async (app) => { await updateDoc(doc(db, "appointments", app.id), { checklist: app.checklist }); };
        const openDetails = (app) => { fetchClientToCache(app.clientId); const safeApp = JSON.parse(JSON.stringify(app)); if (!safeApp.checklist || !Array.isArray(safeApp.checklist)) safeApp.checklist = []; selectedAppointment.value = safeApp; detailTaskInput.value = ''; view.value = 'appointment_details'; };
        const saveTaskInDetail = async () => { if (!detailTaskInput.value.trim() || !selectedAppointment.value) return; const newTask = { text: detailTaskInput.value, done: false }; if (!selectedAppointment.value.checklist) selectedAppointment.value.checklist = []; selectedAppointment.value.checklist.push(newTask); await updateAppInFirebase(selectedAppointment.value); detailTaskInput.value = ''; };
        const toggleTaskDone = async (index) => { if (!selectedAppointment.value) return; selectedAppointment.value.checklist[index].done = !selectedAppointment.value.checklist[index].done; await updateAppInFirebase(selectedAppointment.value); };
        const deleteTaskInDetail = async (index) => { if (!selectedAppointment.value) return; selectedAppointment.value.checklist.splice(index, 1); await updateAppInFirebase(selectedAppointment.value); };

        const addExpense = async () => { 
            if(!newExpense.description || !newExpense.value) return Swal.fire('Ops', 'Preencha todos os campos', 'warning'); 
            if(!newExpense.category) newExpense.category = 'outros';
            // Garante que o valor salvo é número
            const expenseData = { ...newExpense, value: safeFloat(newExpense.value), userId: user.value.uid };
            const docRef = await addDoc(collection(db, "expenses"), expenseData); 
            expensesList.value.unshift({id: docRef.id, ...expenseData});
            if(newExpense.date.startsWith(dashboardMonth.value)) loadDashboardData();
            Object.assign(newExpense, {description: '', value: '', category: ''}); showExpenseModal.value = false; Swal.fire({icon:'success', title:'Salvo', timer:1000}); 
        };
        const deleteExpense = async (id) => { await deleteDoc(doc(db, "expenses", id)); expensesList.value = expensesList.value.filter(e => e.id !== id); loadDashboardData(); };
        
        const startNewSchedule = () => { isEditing.value=false; editingId.value=null; clientSearchTerm.value = ''; Object.assign(tempApp, { clientId: '', date: '', time: '', location: { bairro: '', cidade: '', numero: '' }, details: { balloonColors: '', entryFee: 0 }, notes: '', selectedServices: [] }); view.value='schedule'; };
        const editAppointment = (app) => { isEditing.value=true; editingId.value=app.id; clientSearchTerm.value = ''; fetchClientToCache(app.clientId); const dataToLoad = JSON.parse(JSON.stringify(app)); if(!dataToLoad.details) dataToLoad.details = { balloonColors: '', entryFee: 0 }; if(!dataToLoad.selectedServices) dataToLoad.selectedServices = []; Object.assign(tempApp, dataToLoad); view.value='schedule'; };
        const showReceipt = (app) => { 
            const safeApp = sanitizeApp(app);
            currentReceipt.value = safeApp; 
            fetchClientToCache(app.clientId); 
            view.value = 'receipt'; 
        };
        const selectClientFromSearch = (client) => { tempApp.clientId = client.id; clientSearchTerm.value = ''; clientCache[client.id] = client; };
        const clearClientSelection = () => { tempApp.clientId = ''; clientSearchTerm.value = ''; };
        
        const openClientModal = async (c) => { const n = c ? c.name : ''; const p = c ? c.phone : ''; const cpf = c ? c.cpf : ''; const html = `<input id="n" class="swal2-input" value="${n}" placeholder="Nome"><input id="p" class="swal2-input" value="${p}" placeholder="Telefone"><input id="cpf" class="swal2-input" value="${cpf}" placeholder="CPF">`; const { value: vals } = await Swal.fire({ title: c ? 'Editar' : 'Novo Cliente', html: html, showCancelButton: true, confirmButtonText: 'Salvar', didOpen: () => { const phoneInput = Swal.getPopup().querySelector('#p'); phoneInput.addEventListener('input', (e) => { let x = e.target.value.replace(/\D/g, '').match(/(\d{0,2})(\d{0,5})(\d{0,4})/); e.target.value = !x[2] ? x[1] : '(' + x[1] + ') ' + x[2] + (x[3] ? '-' + x[3] : ''); }); }, preConfirm: () => [ document.getElementById('n').value, document.getElementById('p').value, document.getElementById('cpf').value ] }); if (vals) { const d = { name: vals[0], phone: vals[1], cpf: vals[2], userId: user.value.uid }; if (c) await updateDoc(doc(db, "clients", c.id), d); else await addDoc(collection(db, "clients"), d); Swal.fire('Salvo', '', 'success'); } };
        const deleteClient = async (id) => { if ((await Swal.fire({ title: 'Excluir?', showCancelButton: true })).isConfirmed) { await deleteDoc(doc(db, "clients", id)); catalogClientsList.value = catalogClientsList.value.filter(x => x.id !== id); } };
        
        const openServiceModal = async (s) => { const d = s ? s.description : ''; const p = s ? s.price : ''; const html = `<input id="d" class="swal2-input" value="${d}" placeholder="Descrição"><input id="p" type="number" class="swal2-input" value="${p}" placeholder="Preço">`; const { value: v } = await Swal.fire({ title: s ? 'Editar' : 'Novo Serviço', html: html, showCancelButton: true, confirmButtonText: 'Salvar', preConfirm: () => [ document.getElementById('d').value, document.getElementById('p').value ] }); if (v) { const data = { description: v[0], price: safeFloat(v[1]), userId: user.value.uid }; if (s) await updateDoc(doc(db, "services", s.id), data); else await addDoc(collection(db, "services"), data); } };
        const deleteService = async (id) => { await deleteDoc(doc(db,"services",id)); };
        const downloadReceiptImage = () => { html2canvas(document.getElementById('receipt-capture-area'),{scale:2}).then(c=>{const l=document.createElement('a');l.download='Recibo.png';l.href=c.toDataURL();l.click();}); };
        
        const addServiceToApp = () => { if(tempServiceSelect.value) { tempApp.selectedServices.push({...tempServiceSelect.value}); tempServiceSelect.value = ''; } };
        const removeServiceFromApp = (i) => tempApp.selectedServices.splice(i,1);

        const generateContractPDF = () => { const { jsPDF } = window.jspdf; const doc = new jsPDF(); const app = currentReceipt.value; const cli = clientCache[app.clientId] || {name: '...', cpf: '...', phone: ''}; const primaryColor = [139, 92, 246]; const lightGray = [243, 244, 246]; const darkGray = [55, 65, 81]; const pageWidth = 210; const margin = 20; let y = 0; doc.setFillColor(...primaryColor); doc.rect(0, 0, pageWidth, 40, 'F'); if (company.logo) { try { doc.setFillColor(255, 255, 255); doc.circle(margin + 10, 20, 12, 'F'); doc.addImage(company.logo, 'JPEG', margin + 2, 12, 16, 16); } catch (e) {} } doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(22); doc.text("CONTRATO DE SERVIÇOS", 190, 20, { align: "right" }); doc.setFontSize(10); doc.setFont("helvetica", "normal"); doc.text("DECORAÇÃO E EVENTOS", 190, 26, { align: "right" }); doc.text("Doc. Nº " + app.id.slice(0, 6).toUpperCase(), 190, 32, { align: "right" }); y = 55; doc.setTextColor(...darkGray); doc.setFontSize(10); doc.setFont("helvetica", "bold"); doc.text("IDENTIFICAÇÃO DAS PARTES", margin, y); y += 5; doc.setDrawColor(200, 200, 200); doc.setFillColor(...lightGray); doc.roundedRect(margin, y, 80, 40, 3, 3, 'FD'); doc.setFontSize(9); doc.setTextColor(100, 100, 100); doc.text("CONTRATADA", margin + 5, y + 8); doc.setTextColor(0, 0, 0); doc.setFont("helvetica", "bold"); doc.text(company.fantasia || 'Sua Empresa', margin + 5, y + 15); doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.text("CNPJ: " + (company.cnpj || '...'), margin + 5, y + 22); doc.text((company.rua || '') + ', ' + (company.cidade || ''), margin + 5, y + 28); doc.setFillColor(255, 255, 255); doc.roundedRect(margin + 85, y, 85, 40, 3, 3, 'FD'); doc.setFontSize(9); doc.setTextColor(100, 100, 100); doc.text("CONTRATANTE", margin + 90, y + 8); doc.setTextColor(0, 0, 0); doc.setFont("helvetica", "bold"); doc.text(cli.name, margin + 90, y + 15); doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.text("CPF: " + (cli.cpf || 'Não informado'), margin + 90, y + 22); doc.text("Tel: " + (cli.phone || 'Não informado'), margin + 90, y + 28); y += 50; doc.setFontSize(10); doc.setFont("helvetica", "bold"); doc.setTextColor(...darkGray); doc.text("DETALHES DO EVENTO", margin, y); y += 2; doc.autoTable({ startY: y + 3, head: [], body: [['Data do Evento', formatDate(app.date)], ['Horário', app.time + ' horas'], ['Local', (app.location.bairro || '') + ' - ' + (app.location.cidade || '')], ['Endereço', (app.location.rua || '') + ', ' + (app.location.numero || '')]], theme: 'plain', styles: { fontSize: 9, cellPadding: 1 }, columnStyles: { 0: { fontStyle: 'bold', cellWidth: 40 }, 1: { cellWidth: 'auto' } }, margin: { left: margin } }); y = doc.lastAutoTable.finalY + 10; doc.setFontSize(10); doc.setFont("helvetica", "bold"); doc.text("ITENS CONTRATADOS & ESPECIFICAÇÕES", margin, y); let tableBody = app.selectedServices.map(s => [s.description, formatCurrency(s.price)]); if (app.details?.balloonColors) { tableBody.push([{ content: 'Cores dos Balões: ' + app.details.balloonColors, colSpan: 2, styles: { fontStyle: 'italic', textColor: [139, 92, 246] } }]); } if (app.notes) { tableBody.push([{ content: 'Obs: ' + app.notes, colSpan: 2, styles: { fontStyle: 'italic' } }]); } doc.autoTable({ startY: y + 3, head: [['Descrição do Serviço / Item', 'Valor']], body: tableBody, theme: 'striped', headStyles: { fillColor: primaryColor, textColor: [255, 255, 255], fontStyle: 'bold' }, styles: { fontSize: 9, cellPadding: 3 }, columnStyles: { 0: { cellWidth: 'auto' }, 1: { cellWidth: 40, halign: 'right' } }, margin: { left: margin, right: margin } }); y = doc.lastAutoTable.finalY + 10; const entry = app.entryFee || app.details?.entryFee || 0; const boxWidth = 70; const boxX = pageWidth - margin - boxWidth; doc.setFillColor(...lightGray); doc.rect(boxX, y, boxWidth, 26, 'F'); doc.setDrawColor(...primaryColor); doc.line(boxX, y, boxX, y + 26); doc.setFontSize(9); doc.setTextColor(100, 100, 100); doc.text("Valor Total:", boxX + 5, y + 7); doc.text("Sinal Pago:", boxX + 5, y + 14); doc.setFont("helvetica", "bold"); doc.setTextColor(...primaryColor); doc.text("A Pagar (Restante):", boxX + 5, y + 21); doc.setFont("helvetica", "normal"); doc.setTextColor(0,0,0); doc.text(formatCurrency(app.totalServices), boxX + boxWidth - 5, y + 7, { align: "right" }); doc.text(formatCurrency(entry), boxX + boxWidth - 5, y + 14, { align: "right" }); doc.setFont("helvetica", "bold"); doc.text(formatCurrency(app.finalBalance), boxX + boxWidth - 5, y + 21, { align: "right" }); y += 35; doc.setFontSize(8); doc.setTextColor(100, 100, 100); doc.setFont("helvetica", "normal"); const terms = "TERMOS GERAIS: O cancelamento deste contrato com menos de 30 dias de antecedência implica na retenção do sinal pago para cobertura de custos operacionais e reserva de data. O pagamento restante deve ser quitado integralmente até a data do evento."; doc.text(doc.splitTextToSize(terms, pageWidth - (margin * 2)), margin, y); y += 25; if (y > 250) { doc.addPage(); y = 40; } doc.setDrawColor(150, 150, 150); doc.setLineWidth(0.5); doc.setLineDash([2, 2], 0); doc.line(margin, y, margin + 70, y); doc.line(margin + 90, y, margin + 160, y); doc.setFontSize(8); doc.setTextColor(0, 0, 0); doc.setFont("helvetica", "bold"); doc.text("CONTRATADA", margin + 10, y + 5); doc.text("CONTRATANTE", margin + 100, y + 5); doc.setFont("helvetica", "normal"); doc.setTextColor(150, 150, 150); doc.text(new Date().toLocaleDateString('pt-BR'), margin, y + 15); doc.setFontSize(7); doc.text("Gerado digitalmente por PartyPlanner Pro", pageWidth / 2, 290, { align: "center" }); doc.save("Contrato_" + cli.name.split(' ')[0] + ".pdf"); };
        
        const handleLogoUpload = (e) => { const f = e.target.files[0]; if(f){ const r = new FileReader(); r.onload=x=>{ company.logo=x.target.result; saveCompany(); }; r.readAsDataURL(f); } };
        const saveCompany = async () => { localStorage.setItem('pp_company', JSON.stringify(company)); if(user.value) await updateDoc(doc(db,"users",user.value.uid), {companyConfig:company}); Swal.fire('Salvo','','success'); };
        const toggleDarkMode = () => { isDark.value = !isDark.value; if(isDark.value) document.documentElement.classList.add('dark'); else document.documentElement.classList.remove('dark'); localStorage.setItem('pp_dark', isDark.value); };
        
        const handleChangePassword = async () => { const html = '<input id="currentPass" type="password" class="swal2-input" placeholder="Senha Atual"><input id="newPass" type="password" class="swal2-input" placeholder="Nova Senha">'; const { value: fv } = await Swal.fire({ title: 'Alterar Senha', html: html, showCancelButton: true, confirmButtonText: 'Alterar', preConfirm: () => { return [document.getElementById('currentPass').value, document.getElementById('newPass').value]; } }); if (fv && fv[0] && fv[1]) { try { const c = EmailAuthProvider.credential(user.value.email, fv[0]); await reauthenticateWithCredential(user.value, c); await updatePassword(user.value, fv[1]); Swal.fire('Sucesso!', 'Senha alterada.', 'success'); } catch (error) { Swal.fire('Erro', 'Senha incorreta.', 'error'); } } };
        const searchCatalogClients = async () => { if(catalogClientSearch.value && catalogClientSearch.value.length < 3) return Swal.fire('Ops', 'Digite pelo menos 3 letras', 'info'); const term = (catalogClientSearch.value || '').toLowerCase(); const q = query(collection(db, "clients"), where("userId", "==", user.value.uid)); const snap = await getDocs(q); const all = snap.docs.map(d => ({id: d.id, ...d.data()})); catalogClientsList.value = all.filter(c => (c.name && c.name.toLowerCase().includes(term)) || (c.cpf && c.cpf.includes(term))); if(catalogClientsList.value.length===0) Swal.fire('Nada encontrado','','info'); };

        return {
            user, userRole, userStatus, daysRemaining, authForm, authLoading, view, catalogView, isDark, showLanding,
            services, appointments: pendingAppointments, expensesList, catalogClientsList, company,
            tempApp, tempServiceSelect, newExpense, showExpenseModal, currentReceipt, 
            isEditing, expenseCategories,
            kpiRevenue, kpiExpenses, kpiReceivables, kpiProfit, next7DaysApps, pendingCount,
            filteredListAppointments, totalServices, finalBalance,
            currentTab, historyFilter, searchHistory, isLoadingHistory, expensesFilter,
            handleAuth, isRegistering, logout, toggleDarkMode,
            startNewSchedule, editAppointment, saveAppointment, changeStatus, addExpense, deleteExpense, 
            openClientModal, deleteClient, openServiceModal, deleteService,
            checklistProgress, 
            addServiceToApp, removeServiceFromApp, 
            handleLogoUpload, saveCompany,
            showReceipt, downloadReceiptImage, generateContractPDF, 
            getClientName, getClientPhone, formatCurrency, formatDate, getDay, getMonth, statusText, statusClass, getCategoryIcon,
            clientSearchTerm, filteredClientsSearch, selectClientFromSearch, clearClientSelection,
            handleChangePassword, searchExpenses, searchCatalogClients, catalogClientSearch,
            selectedAppointment, detailTaskInput, openDetails, saveTaskInDetail, toggleTaskDone, deleteTaskInDetail,
            dashboardMonth, loadDashboardData, isLoadingDashboard,
            appointmentViewMode, calendarCursor, changeCalendarMonth, calendarGrid, calendarTitle, selectCalendarDay, selectedCalendarDate, appointmentsOnSelectedDate,
            filteredExpensesList, financeSummary, expensesByCategoryStats, statementList, financeData
        };
    }
}).mount('#app');
