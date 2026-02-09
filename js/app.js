const { createApp, ref, computed, reactive, onMounted, watch } = Vue;

import { 
    db, auth, 
    collection, addDoc, onSnapshot, doc, updateDoc, deleteDoc, getDocs, query, where, setDoc, getDoc, orderBy,
    signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged,
    updatePassword, reauthenticateWithCredential, EmailAuthProvider 
} from './firebase.js';

createApp({
    setup() {
        // --- ESTADOS GERAIS ---
        const user = ref(null);
        const userRole = ref('user');
        const userStatus = ref('trial');
        const daysRemaining = ref(30);
        const authLoading = ref(false);
        const authForm = reactive({ email: '', password: '' });
        
        // --- ESTADOS DE REGISTRO (AUTO-CADASTRO) ---
        const isRegistering = ref(false);
        const registerForm = reactive({ 
            name: '', 
            phone: '', 
            email: '', 
            password: '', 
            confirmPassword: '' 
        });

        const view = ref('dashboard');
        const catalogView = ref('company'); 
        const isDark = ref(false);
        
        // --- DADOS DO DASHBOARD (MENSAL) ---
        const dashboardMonth = ref(new Date().toISOString().slice(0, 7)); // YYYY-MM
        const dashboardData = reactive({ appointments: [], expenses: [] });
        const isLoadingDashboard = ref(false);

        // --- CALENDÁRIO DA AGENDA ---
        const appointmentViewMode = ref('list');
        const calendarCursor = ref(new Date());
        const selectedCalendarDate = ref(null);

        // --- DADOS DAS LISTAS ---
        const services = ref([]); 
        const pendingAppointments = ref([]); 
        const historyList = ref([]); 
        const expensesList = ref([]); 
        const catalogClientsList = ref([]); 
        const scheduleClientsList = ref([]);
        
        // EXTRATO UNIFICADO
        const rawStatementData = ref([]); 
        const financeData = reactive({ incomes: [] }); 

        const clientCache = reactive({}); 
        const clients = ref([]); 

        // --- CATEGORIAS DE DESPESAS ---
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
        const expensesFilter = reactive({ 
            start: new Date().toISOString().split('T')[0], 
            end: new Date().toISOString().split('T')[0],
            category: '' 
        });
        const catalogClientSearch = ref('');
        const clientSearchTerm = ref(''); 
        const isLoadingHistory = ref(false);

        // --- FORMULÁRIOS ---
        const company = reactive({ fantasia: '', logo: '', cnpj: '', razao: '', cidade: '', rua: '', estado: '' });
        
        const tempApp = reactive({ 
            clientId: '', date: '', time: '', location: { bairro: '', cidade: '', numero: '' }, 
            details: { balloonColors: '', entryFee: 0 }, notes: '', selectedServices: [] 
        });
        const tempServiceSelect = ref('');
        const newExpense = reactive({ description: '', value: '', date: new Date().toISOString().split('T')[0], category: '' });
        const showExpenseModal = ref(false); 
        const currentReceipt = ref(null);
        const selectedAppointment = ref(null);
        const detailTaskInput = ref(''); 
        const isEditing = ref(false);
        const editingId = ref(null);
        const newTaskText = ref({});

        // --- UTILS ---
        const formatCurrency = (v) => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(v||0);
        const formatDate = (d) => d ? d.split('-').reverse().join('/') : '';
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

        // --- SYNC DATA (ESTAVA FALTANDO) ---
        let unsubscribeListeners = [];
        const syncData = () => {
            unsubscribeListeners.forEach(unsub => unsub()); unsubscribeListeners = [];
            const myId = user.value.uid; 
            
            // Sincroniza Serviços
            unsubscribeListeners.push(onSnapshot(query(collection(db, "services"), where("userId", "==", myId)), (snap) => { services.value = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })); }));
            
            // Sincroniza Agendamentos Pendentes
            const qApps = query(collection(db, "appointments"), where("userId", "==", myId), where("status", "==", "pending"));
            unsubscribeListeners.push(onSnapshot(qApps, (snap) => { 
                pendingAppointments.value = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })); 
                if(view.value === 'appointment_details' && selectedAppointment.value) {
                    const updated = pendingAppointments.value.find(a => a.id === selectedAppointment.value.id);
                    if(updated) selectedAppointment.value = updated;
                }
            }));
        };

        // --- AUTH ---
        onMounted(() => {
            onAuthStateChanged(auth, async (u) => {
                if (u) {
                    const userDoc = await getDoc(doc(db, "users", u.uid));
                    if (!userDoc.exists()) { await signOut(auth); user.value = null; Swal.fire({ icon: 'error', title: 'Acesso Revogado', text: 'Conta removida.' }); return; }
                    user.value = u;
                    const data = userDoc.data();
                    userRole.value = data.role || 'user';
                    userStatus.value = data.status || 'trial';
                    
                    // Lógica de Trial (30 dias)
                    const createdAt = new Date(data.createdAt || new Date());
                    const diffDays = Math.ceil(Math.abs(new Date() - createdAt) / (1000 * 60 * 60 * 24)); 
                    daysRemaining.value = 30 - diffDays;
                    
                    if (userRole.value !== 'admin' && userStatus.value !== 'active' && daysRemaining.value <= 0) { 
                        view.value = 'expired_plan'; return; 
                    }

                    if(data.companyConfig) Object.assign(company, data.companyConfig);
                    syncData(); loadDashboardData(); 
                } else { user.value = null; }
            });
            if(localStorage.getItem('pp_dark') === 'true') { isDark.value = true; document.documentElement.classList.add('dark'); }
        });

        const handleLogin = async () => { authLoading.value = true; try { await signInWithEmailAndPassword(auth, authForm.email, authForm.password); } catch (error) { Swal.fire('Erro', 'Dados incorretos', 'error'); } finally { authLoading.value = false; } };
        const logout = async () => { await signOut(auth); window.location.href = "index.html"; };

        // --- AUTO-CADASTRO ---
        const handleRegister = async () => {
            if (registerForm.password !== registerForm.confirmPassword) {
                return Swal.fire('Erro', 'As senhas não conferem.', 'warning');
            }
            if (registerForm.password.length < 6) {
                return Swal.fire('Erro', 'Senha muito curta (mínimo 6 caracteres).', 'warning');
            }
            
            authLoading.value = true;
            try {
                // 1. Criar Auth
                const { user: newUser } = await createUserWithEmailAndPassword(auth, registerForm.email, registerForm.password);
                
                // 2. Criar Documento no Firestore
                await setDoc(doc(db, "users", newUser.uid), {
                    displayName: registerForm.name,
                    phone: registerForm.phone,
                    email: registerForm.email,
                    role: 'user',
                    status: 'trial', // Inicia como TRIAL
                    createdAt: new Date().toISOString(),
                    companyConfig: { 
                        fantasia: registerForm.name, 
                        logo: '', cnpj: '', razao: '', cidade: '', rua: '', estado: '' 
                    }
                });

                Swal.fire({
                    icon: 'success',
                    title: 'Conta Criada!',
                    text: 'Aproveite seus 30 dias de teste grátis.',
                    timer: 2000
                });

            } catch (error) {
                console.error(error);
                if (error.code === 'auth/email-already-in-use') {
                    Swal.fire('Ops', 'Este email já possui cadastro.', 'error');
                } else {
                    Swal.fire('Erro', 'Não foi possível criar a conta. Tente novamente.', 'error');
                }
            } finally {
                authLoading.value = false;
            }
        };

        const applyPhoneMask = (e) => {
            let x = e.target.value.replace(/\D/g, '').match(/(\d{0,2})(\d{0,5})(\d{0,4})/);
            e.target.value = !x[2] ? x[1] : '(' + x[1] + ') ' + x[2] + (x[3] ? '-' + x[3] : '');
            registerForm.phone = e.target.value;
        };

        // --- DASHBOARD & EXTRATO UNIFICADO ---
        const loadDashboardData = async () => {
            if (!user.value) return;
            isLoadingDashboard.value = true;
            const [year, month] = dashboardMonth.value.split('-');
            const startStr = `${year}-${month}-01`;
            const lastDay = new Date(year, month, 0).getDate();
            const endStr = `${year}-${month}-${lastDay}`;
            try {
                const qApps = query(collection(db, "appointments"), where("userId", "==", user.value.uid), where("date", ">=", startStr), where("date", "<=", endStr));
                const qExp = query(collection(db, "expenses"), where("userId", "==", user.value.uid), where("date", ">=", startStr), where("date", "<=", endStr));
                const [snapApps, snapExp] = await Promise.all([getDocs(qApps), getDocs(qExp)]);
                dashboardData.appointments = snapApps.docs.map(d => ({id: d.id, ...d.data()})).filter(app => app.status !== 'cancelled');
                dashboardData.expenses = snapExp.docs.map(d => ({id: d.id, ...d.data()}));
            } catch (e) { console.error(e); } finally { isLoadingDashboard.value = false; }
        };
        watch(dashboardMonth, () => { loadDashboardData(); });

        const searchExpenses = async () => {
            if(!expensesFilter.start || !expensesFilter.end) return Swal.fire('Data', 'Selecione o período', 'info');
            try {
                // Busca unificada para o extrato
                const qExp = query(collection(db, "expenses"), where("userId", "==", user.value.uid));
                const snapExp = await getDocs(qExp);
                const filteredExp = snapExp.docs.map(d => ({id: d.id, ...d.data()})).filter(e => {
                    return e.date >= expensesFilter.start && e.date <= expensesFilter.end && (!expensesFilter.category || e.category === expensesFilter.category);
                });
                expensesList.value = filteredExp.sort((a,b) => new Date(b.date) - new Date(a.date));

                const qApp = query(collection(db, "appointments"), where("userId", "==", user.value.uid));
                const snapApp = await getDocs(qApp);
                const filteredApps = snapApp.docs.map(d => ({id: d.id, ...d.data()})).filter(a => {
                    return a.status !== 'cancelled' && a.date >= expensesFilter.start && a.date <= expensesFilter.end;
                });
                filteredApps.forEach(app => fetchClientToCache(app.clientId));
                financeData.incomes = filteredApps;

                const raw = [];
                filteredExp.forEach(e => raw.push({ source: 'expense', data: e }));
                filteredApps.forEach(a => raw.push({ source: 'app', data: a }));
                rawStatementData.value = raw;

                if(raw.length === 0) Swal.fire('Vazio', 'Nenhuma movimentação no período.', 'info');
            } catch(e) { console.error(e); }
        };

        // --- COMPUTEDS E OUTROS ---
        // (Lógica do Extrato Unificado)
        const statementList = computed(() => {
            return rawStatementData.value.map(item => {
                if(item.source === 'expense') {
                     return { uniqueId: 'exp_' + item.data.id, type: 'out', date: item.data.date, description: item.data.description, category: item.data.category, value: item.data.value };
                } else {
                     return { uniqueId: 'app_' + item.data.id, type: 'in', date: item.data.date, description: getClientName(item.data.clientId), category: 'Serviço', value: item.data.totalServices || 0 };
                }
            }).sort((a,b) => new Date(b.date) - new Date(a.date));
        });

        const financeSummary = computed(() => {
            const income = rawStatementData.value.filter(i => i.source === 'app').reduce((sum, i) => sum + (i.data.totalServices || 0), 0);
            const expense = rawStatementData.value.filter(i => i.source === 'expense').reduce((sum, i) => sum + (i.data.value || 0), 0);
            return { income, expense, balance: income - expense };
        });

        // --- CALENDÁRIO ---
        const changeCalendarMonth = (offset) => { const d = new Date(calendarCursor.value); d.setMonth(d.getMonth() + offset); calendarCursor.value = d; };
        const calendarGrid = computed(() => {
            const year = calendarCursor.value.getFullYear(), month = calendarCursor.value.getMonth();
            const firstDay = new Date(year, month, 1).getDay(), daysInMonth = new Date(year, month + 1, 0).getDate();
            const days = [];
            for (let i = 0; i < firstDay; i++) { days.push({ day: '', date: null, hasEvent: false }); }
            for (let i = 1; i <= daysInMonth; i++) {
                const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
                const hasEvent = pendingAppointments.value.some(app => app.date === dateStr && app.status !== 'cancelled');
                days.push({ day: i, date: dateStr, hasEvent: hasEvent });
            }
            return days;
        });
        const calendarTitle = computed(() => `${['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'][calendarCursor.value.getMonth()]} ${calendarCursor.value.getFullYear()}`);
        const selectCalendarDay = (dayObj) => { if (!dayObj.day) return; selectedCalendarDate.value = dayObj.date; };
        const appointmentsOnSelectedDate = computed(() => selectedCalendarDate.value ? pendingAppointments.value.filter(a => a.date === selectedCalendarDate.value) : []);

        // --- SEARCH E OUTROS ---
        const searchCatalogClients = async () => {
            if(catalogClientSearch.value.length < 3) return Swal.fire('Ops', 'Digite min. 3 letras', 'info');
            const term = catalogClientSearch.value.toLowerCase();
            const q = query(collection(db, "clients"), where("userId", "==", user.value.uid));
            const snap = await getDocs(q);
            catalogClientsList.value = snap.docs.map(d => ({id: d.id, ...d.data()})).filter(c => (c.name && c.name.toLowerCase().includes(term)) || (c.cpf && c.cpf.includes(term)));
            if(catalogClientsList.value.length === 0) Swal.fire('Nada encontrado', '', 'info');
        };

        const searchHistory = async () => {
            if(!historyFilter.start || !historyFilter.end) return Swal.fire('Datas', 'Selecione o intervalo', 'warning');
            isLoadingHistory.value = true; 
            const q = query(collection(db, "appointments"), where("userId", "==", user.value.uid));
            const snap = await getDocs(q);
            historyList.value = snap.docs.map(d => ({id: d.id, ...d.data()})).filter(app => app.status === currentTab.value && app.date >= historyFilter.start && app.date <= historyFilter.end);
            isLoadingHistory.value = false;
        };

        // --- FILTROS E ACTIONS ---
        const filteredListAppointments = computed(() => (currentTab.value === 'pending' ? pendingAppointments.value : historyList.value).sort((a,b) => new Date(a.date) - new Date(b.date)));
        const kpiReceivables = computed(() => dashboardData.appointments.reduce((acc, a) => acc + (a.finalBalance || 0), 0));
        const next7DaysApps = computed(() => { const t = new Date(); t.setHours(0,0,0,0); const w = new Date(t); w.setDate(t.getDate() + 7); return pendingAppointments.value.filter(a => new Date(a.date) >= t && new Date(a.date) <= w).sort((a,b) => new Date(a.date) - new Date(b.date)); });
        const totalServices = computed(() => tempApp.selectedServices.reduce((s,i) => s + i.price, 0));
        const finalBalance = computed(() => totalServices.value - (tempApp.details.entryFee || 0));
        const filteredClientsSearch = computed(() => scheduleClientsList.value);
        const filteredExpensesList = computed(() => expensesList.value || []);

        watch(clientSearchTerm, async (newVal) => {
            if(newVal.length >= 3) {
                const snap = await getDocs(query(collection(db, "clients"), where("userId", "==", user.value.uid)));
                scheduleClientsList.value = snap.docs.map(d => ({id: d.id, ...d.data()})).filter(c => (c.name && c.name.toLowerCase().includes(newVal.toLowerCase())));
            } else scheduleClientsList.value = [];
        });

        // --- ACTIONS CRUD ---
        const startNewSchedule = () => { isEditing.value=false; editingId.value=null; clientSearchTerm.value=''; Object.assign(tempApp, { clientId: '', date: '', time: '', location: { bairro: '', cidade: '', numero: '' }, details: { balloonColors: '', entryFee: 0 }, notes: '', selectedServices: [] }); view.value='schedule'; };
        const editAppointment = (app) => { isEditing.value=true; editingId.value=app.id; fetchClientToCache(app.clientId); Object.assign(tempApp, JSON.parse(JSON.stringify(app))); if(!tempApp.details) tempApp.details = { balloonColors: '', entryFee: 0 }; view.value='schedule'; };
        const saveAppointment = async () => {
            const total = tempApp.selectedServices.reduce((sum, i) => sum + i.price, 0);
            const appData = { ...JSON.parse(JSON.stringify(tempApp)), totalServices: total, entryFee: tempApp.details.entryFee, finalBalance: total - tempApp.details.entryFee, userId: user.value.uid };
            if(isEditing.value && editingId.value) { await updateDoc(doc(db, "appointments", editingId.value), appData); Swal.fire({icon:'success', timer:1000}); } 
            else { appData.status = 'pending'; appData.checklist = [{text:'Separar Materiais', done:false}]; await addDoc(collection(db, "appointments"), appData); Swal.fire({icon:'success', title:'Agendado!', timer:1000}); }
            if(appData.date.startsWith(dashboardMonth.value)) loadDashboardData();
            view.value = 'appointments_list'; currentTab.value = 'pending';
        };

        const changeStatus = async (app, status) => { 
            if((await Swal.fire({ title: 'Confirmar?', icon: 'question', showCancelButton: true })).isConfirmed) {
                await updateDoc(doc(db, "appointments", app.id), { status: status });
                const idx = historyList.value.findIndex(x => x.id === app.id); if(idx !== -1) historyList.value.splice(idx, 1);
                loadDashboardData(); Swal.fire('Feito!', '', 'success');
            }
        };

        const updateAppInFirebase = async (app) => { await updateDoc(doc(db, "appointments", app.id), { checklist: app.checklist }); };
        const openDetails = (app) => { fetchClientToCache(app.clientId); selectedAppointment.value = app; if (!selectedAppointment.value.checklist) selectedAppointment.value.checklist = []; detailTaskInput.value = ''; view.value = 'appointment_details'; };
        const saveTaskInDetail = async () => { if (!detailTaskInput.value.trim() || !selectedAppointment.value) return; selectedAppointment.value.checklist.push({ text: detailTaskInput.value, done: false }); await updateAppInFirebase(selectedAppointment.value); detailTaskInput.value = ''; };
        const toggleTaskDone = async (index) => { if (!selectedAppointment.value) return; selectedAppointment.value.checklist[index].done = !selectedAppointment.value.checklist[index].done; await updateAppInFirebase(selectedAppointment.value); };
        const deleteTaskInDetail = async (index) => { if (!selectedAppointment.value) return; selectedAppointment.value.checklist.splice(index, 1); await updateAppInFirebase(selectedAppointment.value); };

        const addExpense = async () => { if(!newExpense.description || !newExpense.value) return; if(!newExpense.category) newExpense.category='outros'; const docRef = await addDoc(collection(db, "expenses"), {...newExpense, userId: user.value.uid}); expensesList.value.unshift({id: docRef.id, ...newExpense}); if(newExpense.date.startsWith(dashboardMonth.value)) loadDashboardData(); showExpenseModal.value = false; Swal.fire({icon:'success', timer:1000}); };
        const deleteExpense = async (id) => { await deleteDoc(doc(db, "expenses", id)); expensesList.value = expensesList.value.filter(e => e.id !== id); loadDashboardData(); };

        const showReceipt = (app) => { currentReceipt.value = app; fetchClientToCache(app.clientId); view.value = 'receipt'; };
        const selectClientFromSearch = (client) => { tempApp.clientId = client.id; clientSearchTerm.value = ''; clientCache[client.id] = client; };
        const clearClientSelection = () => { tempApp.clientId = ''; clientSearchTerm.value = ''; };

        const openClientModal = async (c) => { 
            const html = `<input id="n" class="swal2-input" value="${c?.name||''}" placeholder="Nome"><input id="p" class="swal2-input" value="${c?.phone||''}" placeholder="Telefone"><input id="cpf" class="swal2-input" value="${c?.cpf||''}" placeholder="CPF">`;
            const { value: vals } = await Swal.fire({ title: c ? 'Editar' : 'Novo Cliente', html: html, showCancelButton: true, preConfirm: () => [ document.getElementById('n').value, document.getElementById('p').value, document.getElementById('cpf').value ] });
            if (vals) { const d = { name: vals[0], phone: vals[1], cpf: vals[2], userId: user.value.uid }; if (c) await updateDoc(doc(db, "clients", c.id), d); else await addDoc(collection(db, "clients"), d); Swal.fire('Salvo', '', 'success'); } 
        };
        const deleteClient = async (id) => { if ((await Swal.fire({ title: 'Excluir?', showCancelButton: true })).isConfirmed) { await deleteDoc(doc(db, "clients", id)); catalogClientsList.value = catalogClientsList.value.filter(x => x.id !== id); } };
        
        const openServiceModal = async (s) => { 
            const html = `<input id="d" class="swal2-input" value="${s?.description||''}" placeholder="Descrição"><input id="p" type="number" class="swal2-input" value="${s?.price||''}" placeholder="Preço">`;
            const { value: v } = await Swal.fire({ title: s ? 'Editar' : 'Novo', html: html, showCancelButton: true, preConfirm: () => [ document.getElementById('d').value, document.getElementById('p').value ] });
            if (v) { const data = { description: v[0], price: Number(v[1]), userId: user.value.uid }; if (s) await updateDoc(doc(db, "services", s.id), data); else await addDoc(collection(db, "services"), data); }
        };
        const deleteService = async (id) => { await deleteDoc(doc(db,"services",id)); };
        
        const addServiceToApp = () => { if (!tempServiceSelect.value) return; tempApp.selectedServices.push({ ...tempServiceSelect.value }); tempServiceSelect.value = ""; };
        const removeServiceFromApp = (index) => { tempApp.selectedServices.splice(index, 1); };
        const checklistProgress = (app) => { if (!app || !Array.isArray(app.checklist) || app.checklist.length === 0) return 0; return Math.round((app.checklist.filter(t => t.done).length / app.checklist.length) * 100); };

        const handleLogoUpload = (e) => { const f = e.target.files[0]; if(f){ const r = new FileReader(); r.onload=x=>{ company.logo=x.target.result; saveCompany(); }; r.readAsDataURL(f); } };
        const saveCompany = async () => { localStorage.setItem('pp_company', JSON.stringify(company)); if(user.value) await updateDoc(doc(db,"users",user.value.uid), {companyConfig:company}); Swal.fire('Salvo','','success'); };
        const downloadReceiptImage = () => { html2canvas(document.getElementById('receipt-capture-area'),{scale:2}).then(c=>{const l=document.createElement('a');l.download='Recibo.png';l.href=c.toDataURL();l.click();}); };
        
        // --- FUNÇÕES REINSERIDAS QUE FALTAVAM ---
        
        const toggleDarkMode = () => { 
            isDark.value = !isDark.value; 
            if(isDark.value) document.documentElement.classList.add('dark'); 
            else document.documentElement.classList.remove('dark'); 
            localStorage.setItem('pp_dark', isDark.value); 
        };

        const handleChangePassword = async () => {
            const html = '<input id="currentPass" type="password" class="swal2-input" placeholder="Senha Atual"><input id="newPass" type="password" class="swal2-input" placeholder="Nova Senha">';
            const { value: fv } = await Swal.fire({ title: 'Alterar Senha', html: html, showCancelButton: true, confirmButtonText: 'Alterar', preConfirm: () => { return [document.getElementById('currentPass').value, document.getElementById('newPass').value]; } });
            if (fv && fv[0] && fv[1]) {
                try { const c = EmailAuthProvider.credential(user.value.email, fv[0]); await reauthenticateWithCredential(user.value, c); await updatePassword(user.value, fv[1]); Swal.fire('Sucesso!', 'Senha alterada.', 'success'); } catch (error) { Swal.fire('Erro', 'Senha incorreta.', 'error'); }
            }
        };

        const generateContractPDF = () => { 
            const { jsPDF } = window.jspdf; const doc = new jsPDF(); const app = currentReceipt.value; const cli = clientCache[app.clientId] || {name: '...', cpf: '...', phone: ''}; 
            const primaryColor = [139, 92, 246]; const lightGray = [243, 244, 246]; const darkGray = [55, 65, 81]; const pageWidth = 210; const margin = 20; let y = 0; 
            doc.setFillColor(...primaryColor); doc.rect(0, 0, pageWidth, 40, 'F');
            if (company.logo) { try { doc.setFillColor(255, 255, 255); doc.circle(margin + 10, 20, 12, 'F'); doc.addImage(company.logo, 'JPEG', margin + 2, 12, 16, 16); } catch (e) {} }
            doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(22); doc.text("CONTRATO DE SERVIÇOS", 190, 20, { align: "right" }); 
            doc.setFontSize(10); doc.setFont("helvetica", "normal"); doc.text("DECORAÇÃO E EVENTOS", 190, 26, { align: "right" }); doc.text("Doc. Nº " + app.id.slice(0, 6).toUpperCase(), 190, 32, { align: "right" }); y = 55;
            doc.setTextColor(...darkGray); doc.setFontSize(10); doc.setFont("helvetica", "bold"); doc.text("IDENTIFICAÇÃO DAS PARTES", margin, y); y += 5;
            doc.setDrawColor(200, 200, 200); doc.setFillColor(...lightGray); doc.roundedRect(margin, y, 80, 40, 3, 3, 'FD');
            doc.setFontSize(9); doc.setTextColor(100, 100, 100); doc.text("CONTRATADA", margin + 5, y + 8);
            doc.setTextColor(0, 0, 0); doc.setFont("helvetica", "bold"); doc.text(company.fantasia || 'Sua Empresa', margin + 5, y + 15);
            doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.text("CNPJ: " + (company.cnpj || '...'), margin + 5, y + 22); doc.text((company.rua || '') + ', ' + (company.cidade || ''), margin + 5, y + 28);
            doc.setFillColor(255, 255, 255); doc.roundedRect(margin + 85, y, 85, 40, 3, 3, 'FD');
            doc.setFontSize(9); doc.setTextColor(100, 100, 100); doc.text("CONTRATANTE", margin + 90, y + 8);
            doc.setTextColor(0, 0, 0); doc.setFont("helvetica", "bold"); doc.text(cli.name, margin + 90, y + 15);
            doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.text("CPF: " + (cli.cpf || 'Não informado'), margin + 90, y + 22); doc.text("Tel: " + (cli.phone || 'Não informado'), margin + 90, y + 28); y += 50;
            doc.setFontSize(10); doc.setFont("helvetica", "bold"); doc.setTextColor(...darkGray); doc.text("DETALHES DO EVENTO", margin, y); y += 2;
            doc.autoTable({ startY: y + 3, head: [], body: [['Data do Evento', formatDate(app.date)], ['Horário', app.time + ' horas'], ['Local', (app.location.bairro || '') + ' - ' + (app.location.cidade || '')], ['Endereço', (app.location.rua || '') + ', ' + (app.location.numero || '')]], theme: 'plain', styles: { fontSize: 9, cellPadding: 1 }, columnStyles: { 0: { fontStyle: 'bold', cellWidth: 40 }, 1: { cellWidth: 'auto' } }, margin: { left: margin } });
            y = doc.lastAutoTable.finalY + 10;
            doc.setFontSize(10); doc.setFont("helvetica", "bold"); doc.text("ITENS CONTRATADOS & ESPECIFICAÇÕES", margin, y);
            let tableBody = app.selectedServices.map(s => [s.description, formatCurrency(s.price)]);
            if (app.details?.balloonColors) { tableBody.push([{ content: 'Cores dos Balões: ' + app.details.balloonColors, colSpan: 2, styles: { fontStyle: 'italic', textColor: [139, 92, 246] } }]); }
            if (app.notes) { tableBody.push([{ content: 'Obs: ' + app.notes, colSpan: 2, styles: { fontStyle: 'italic' } }]); }
            doc.autoTable({ startY: y + 3, head: [['Descrição do Serviço / Item', 'Valor']], body: tableBody, theme: 'striped', headStyles: { fillColor: primaryColor, textColor: [255, 255, 255], fontStyle: 'bold' }, styles: { fontSize: 9, cellPadding: 3 }, columnStyles: { 0: { cellWidth: 'auto' }, 1: { cellWidth: 40, halign: 'right' } }, margin: { left: margin, right: margin } });
            y = doc.lastAutoTable.finalY + 10;
            const entry = app.entryFee || app.details?.entryFee || 0; const boxWidth = 70; const boxX = pageWidth - margin - boxWidth;
            doc.setFillColor(...lightGray); doc.rect(boxX, y, boxWidth, 26, 'F'); doc.setDrawColor(...primaryColor); doc.line(boxX, y, boxX, y + 26); 
            doc.setFontSize(9); doc.setTextColor(100, 100, 100); doc.text("Valor Total:", boxX + 5, y + 7); doc.text("Sinal Pago:", boxX + 5, y + 14);
            doc.setFont("helvetica", "bold"); doc.setTextColor(...primaryColor); doc.text("A Pagar (Restante):", boxX + 5, y + 21);
            doc.setFont("helvetica", "normal"); doc.setTextColor(0,0,0); doc.text(formatCurrency(app.totalServices), boxX + boxWidth - 5, y + 7, { align: "right" }); doc.text(formatCurrency(entry), boxX + boxWidth - 5, y + 14, { align: "right" });
            doc.setFont("helvetica", "bold"); doc.text(formatCurrency(app.finalBalance), boxX + boxWidth - 5, y + 21, { align: "right" }); y += 35;
            doc.setFontSize(8); doc.setTextColor(100, 100, 100); doc.setFont("helvetica", "normal");
            const terms = "TERMOS GERAIS: O cancelamento deste contrato com menos de 30 dias de antecedência implica na retenção do sinal pago para cobertura de custos operacionais e reserva de data. O pagamento restante deve ser quitado integralmente até a data do evento.";
            doc.text(doc.splitTextToSize(terms, pageWidth - (margin * 2)), margin, y); y += 25;
            if (y > 250) { doc.addPage(); y = 40; }
            doc.setDrawColor(150, 150, 150); doc.setLineWidth(0.5); doc.setLineDash([2, 2], 0); doc.line(margin, y, margin + 70, y); doc.line(margin + 90, y, margin + 160, y);
            doc.setFontSize(8); doc.setTextColor(0, 0, 0); doc.setFont("helvetica", "bold"); doc.text("CONTRATADA", margin + 10, y + 5); doc.text("CONTRATANTE", margin + 100, y + 5);
            doc.setFont("helvetica", "normal"); doc.setTextColor(150, 150, 150); doc.text(new Date().toLocaleDateString('pt-BR'), margin, y + 15);
            doc.setFontSize(7); doc.text("Gerado digitalmente por PartyPlanner Pro", pageWidth / 2, 290, { align: "center" });
            doc.save("Contrato_" + cli.name.split(' ')[0] + ".pdf"); 
        };

        return {
            user, userRole, userStatus, daysRemaining, authForm, authLoading, view, catalogView, isDark, 
            services, appointments: pendingAppointments, expensesList, catalogClientsList, company,
            tempApp, tempServiceSelect, newExpense, showExpenseModal, currentReceipt, 
            isEditing, newTaskText, expenseCategories,
            filteredListAppointments, kpiReceivables, next7DaysApps,
            currentTab, historyFilter, searchHistory, isLoadingHistory, expensesFilter,
            handleLogin, logout, toggleDarkMode, handleRegister, isRegistering, registerForm, applyPhoneMask,
            startNewSchedule, editAppointment, saveAppointment, changeStatus, addExpense, deleteExpense, 
            openClientModal, deleteClient, openServiceModal, deleteService,
            checklistProgress, addServiceToApp, removeServiceFromApp,
            statementList, financeData, filteredExpensesList, financeSummary,
            handleLogoUpload, saveCompany, showReceipt, downloadReceiptImage, generateContractPDF, 
            getClientName, getClientPhone, formatCurrency, formatDate, getDay, getMonth, statusText, statusClass, getCategoryIcon,
            clientSearchTerm, filteredClientsSearch, selectClientFromSearch, clearClientSelection,
            handleChangePassword, searchExpenses, searchCatalogClients, catalogClientSearch,
            selectedAppointment, detailTaskInput, openDetails, saveTaskInDetail, toggleTaskDone, deleteTaskInDetail,
            dashboardMonth, loadDashboardData, isLoadingDashboard,
            appointmentViewMode, calendarCursor, changeCalendarMonth, calendarGrid, calendarTitle, selectCalendarDay, selectedCalendarDate, appointmentsOnSelectedDate
        };
    }
}).mount('#app');
