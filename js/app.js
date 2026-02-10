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
        // 1. ESTADOS PRINCIPAIS
        // =================================================================
        const user = ref(null);
        const view = ref('dashboard');
        const isDark = ref(false);
        const authLoading = ref(false);
        const isRegistering = ref(false);
        const authForm = reactive({ email: '', password: '', name: '' });
        
        // Controle de Abas
        const registrationTab = ref('clients'); // Abas da tela Cadastros
        const agendaTab = ref('pending');       // Abas da tela Agenda

        // Dados
        const company = reactive({ fantasia: '', logo: '', cnpj: '', rua: '', cidade: '', estado: '' });
        const dashboardMonth = ref(new Date().toISOString().slice(0, 7));
        const dashboardData = reactive({ appointments: [], expenses: [] });
        const isLoadingDashboard = ref(false);
        
        // Listas de Dados
        const services = ref([]);
        const pendingAppointments = ref([]);
        const historyList = ref([]);
        const expensesList = ref([]); 
        const isExtractLoaded = ref(false);
        const catalogClientsList = ref([]);
        const scheduleClientsList = ref([]);
        const clientCache = reactive({});

        // Modais e Controles UI
        const showAppointmentModal = ref(false);
        const showServiceModal = ref(false);
        const showExpenseModal = ref(false);
        const isEditing = ref(false);
        const editingId = ref(null);
        const currentReceipt = ref(null);
        
        // Inputs de Busca e Filtro
        const clientSearchTerm = ref('');
        const catalogClientSearch = ref('');
        const expensesFilter = reactive({ start: '', end: '' });
        const agendaFilter = reactive({ start: '', end: '' });
        const appointmentViewMode = ref('list');
        const calendarCursor = ref(new Date());
        const selectedCalendarDate = ref(null);

        // Formulários
        const newService = reactive({ description: '', price: '' });
        const newExpense = reactive({ description: '', value: '', date: new Date().toISOString().split('T')[0], category: 'outros' });
        const tempServiceSelect = ref('');
        
        // Objeto de Agendamento (Com novos campos)
        const tempApp = reactive({ 
            clientId: '', 
            date: '', 
            time: '', 
            location: { bairro: '' }, 
            details: { entryFee: 0, balloonColors: '' }, // Novo campo
            notes: '', // Novo campo
            selectedServices: [], 
            checklist: [] 
        });

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
        const toNum = (val) => { if (!val) return 0; if (typeof val === 'number') return val; const clean = String(val).replace(',', '.').replace(/[^0-9.-]/g, ''); return parseFloat(clean) || 0; };
        const formatCurrency = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(toNum(v));
        const formatDate = (d) => { if (!d) return ''; try { return d.split('-').reverse().join('/'); } catch (e) { return d; } };
        const getDay = (d) => d ? d.split('-')[2] : '';
        const getMonth = (d) => d ? ['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'][parseInt(d.split('-')[1])-1] : '';
        const statusText = (s) => s === 'concluded' ? 'Concluído' : (s === 'cancelled' ? 'Cancelado' : 'Pendente');
        const getClientName = (id) => clientCache[id]?.name || '...';
        const getClientPhone = (id) => clientCache[id]?.phone || '';

        const fetchClientToCache = async (id) => {
            if (!id || clientCache[id]) return;
            try { const snap = await getDoc(doc(db, "clients", id)); if (snap.exists()) clientCache[id] = snap.data(); else clientCache[id] = { name: 'Excluído', phone: '-' }; } catch (e) {}
        };

        const sanitizeApp = (docSnapshot) => {
            const data = docSnapshot.data ? docSnapshot.data() : docSnapshot;
            const safeServices = Array.isArray(data.selectedServices) ? data.selectedServices : [];
            let total = toNum(data.totalServices);
            if (total === 0 && safeServices.length > 0) total = safeServices.reduce((sum, item) => sum + toNum(item.price), 0);
            let entry = toNum(data.entryFee || data.details?.entryFee);
            let balance = toNum(data.finalBalance);
            if (balance === 0 && total > 0) balance = total - entry;
            
            // Tratamento seguro para campos novos em registros antigos
            return { 
                id: docSnapshot.id || data.id, ...data, 
                selectedServices: safeServices, totalServices: total, finalBalance: balance, entryFee: entry, 
                checklist: data.checklist || [], 
                details: { ...(data.details || {}), balloonColors: data.details?.balloonColors || '' },
                notes: data.notes || ''
            };
        };

        const sanitizeExpense = (docSnapshot) => { const data = docSnapshot.data ? docSnapshot.data() : docSnapshot; return { id: docSnapshot.id || data.id, ...data, value: toNum(data.value) }; };

        // =================================================================
        // 3. CARREGAMENTO E SINCRONIZAÇÃO
        // =================================================================
        onMounted(() => {
            onAuthStateChanged(auth, async (u) => {
                if (u) {
                    user.value = u;
                    const userDoc = await getDoc(doc(db, "users", u.uid));
                    if (!userDoc.exists()) await setDoc(userRef, { email: u.email, role: 'user', createdAt: new Date().toISOString() });
                    if (userDoc.exists() && userDoc.data().companyConfig) Object.assign(company, userDoc.data().companyConfig);
                    loadDashboardData();
                    syncData();
                } else { user.value = null; }
            });
            if (localStorage.getItem('pp_dark') === 'true') { isDark.value = true; document.documentElement.classList.add('dark'); }
        });

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
                dashboardData.appointments = snapApps.docs.map(sanitizeApp).filter(a => a.status !== 'cancelled');
                dashboardData.expenses = snapExp.docs.map(sanitizeExpense);
                dashboardData.appointments.forEach(a => fetchClientToCache(a.clientId));
            } catch (e) { console.error(e); } finally { isLoadingDashboard.value = false; }
        };
        watch(dashboardMonth, () => loadDashboardData());

        const syncData = () => {
            const myId = user.value.uid;
            onSnapshot(query(collection(db, "services"), where("userId", "==", myId)), (snap) => services.value = snap.docs.map(d => ({ id: d.id, ...d.data() })));
            onSnapshot(query(collection(db, "appointments"), where("userId", "==", myId), where("status", "==", "pending")), (snap) => {
                pendingAppointments.value = snap.docs.map(sanitizeApp);
                pendingAppointments.value.forEach(a => fetchClientToCache(a.clientId));
            });
        };

        // =================================================================
        // 4. COMPUTEDS (CÁLCULOS)
        // =================================================================
        const totalServices = computed(() => tempApp.selectedServices.reduce((s,i) => s + toNum(i.price), 0));
        const finalBalance = computed(() => totalServices.value - toNum(tempApp.details.entryFee));
        
        const kpiRevenue = computed(() => dashboardData.appointments.reduce((acc, a) => acc + toNum(a.totalServices), 0));
        const kpiExpenses = computed(() => dashboardData.expenses.reduce((acc, e) => acc + toNum(e.value), 0));
        const financeData = computed(() => ({ revenue: kpiRevenue.value, expenses: kpiExpenses.value, profit: kpiRevenue.value - kpiExpenses.value, receivables: dashboardData.appointments.reduce((acc, a) => acc + toNum(a.finalBalance), 0) }));

        const next7DaysApps = computed(() => {
            const today = new Date(); today.setHours(0,0,0,0);
            const nextWeek = new Date(today); nextWeek.setDate(today.getDate() + 7);
            const todayStr = today.toISOString().split('T')[0];
            const nextWeekStr = nextWeek.toISOString().split('T')[0];
            return pendingAppointments.value.filter(a => a.date >= todayStr && a.date <= nextWeekStr).sort((a,b) => a.date.localeCompare(b.date));
        });

        // --- Extrato Financeiro ---
        const searchExpenses = async () => {
            if(!expensesFilter.start || !expensesFilter.end) return Swal.fire('Data', 'Selecione o período', 'info');
            const qExp = query(collection(db, "expenses"), where("userId", "==", user.value.uid), where("date", ">=", expensesFilter.start), where("date", "<=", expensesFilter.end));
            const snapExp = await getDocs(qExp);
            const loadedExpenses = snapExp.docs.map(d => ({ ...sanitizeExpense(d), type: 'expense', icon: 'fa-arrow-down', color: 'text-red-500' }));
            const qApp = query(collection(db, "appointments"), where("userId", "==", user.value.uid), where("date", ">=", expensesFilter.start), where("date", "<=", expensesFilter.end));
            const snapApp = await getDocs(qApp);
            const loadedIncome = snapApp.docs.map(d => { const app = sanitizeApp(d); return { id: app.id, date: app.date, value: app.totalServices, description: `Receita: ${getClientName(app.clientId)}`, type: 'income', icon: 'fa-arrow-up', color: 'text-green-500' }; });
            expensesList.value = [...loadedExpenses, ...loadedIncome]; 
            isExtractLoaded.value = true;
        };
        const statementList = computed(() => { if (!isExtractLoaded.value) return []; return expensesList.value.sort((a, b) => b.date.localeCompare(a.date)); });
        const financeSummary = computed(() => statementList.value.reduce((acc, item) => item.type === 'income' ? acc + item.value : acc - item.value, 0));

        // --- Calendário ---
        const calendarGrid = computed(() => {
            const year = calendarCursor.value.getFullYear(); const month = calendarCursor.value.getMonth();
            const firstDay = new Date(year, month, 1).getDay(); const daysInMonth = new Date(year, month + 1, 0).getDate();
            const days = [];
            for (let i = 0; i < firstDay; i++) days.push({ day: '', date: null });
            for (let i = 1; i <= daysInMonth; i++) {
                const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
                days.push({ day: i, date: dateStr, hasEvent: pendingAppointments.value.some(a => a.date === dateStr) });
            }
            return days;
        });
        const appointmentsOnSelectedDate = computed(() => pendingAppointments.value.filter(a => a.date === selectedCalendarDate.value));
        const selectCalendarDay = (d) => { if(d.day) selectedCalendarDate.value = d.date; };
        const changeCalendarMonth = (off) => { const d = new Date(calendarCursor.value); d.setMonth(d.getMonth() + off); calendarCursor.value = d; };
        const calendarTitle = computed(() => `${['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'][calendarCursor.value.getMonth()]} ${calendarCursor.value.getFullYear()}`);
        
        // --- Filtros Agenda ---
        const searchHistory = async () => {
            if(!agendaFilter.start || !agendaFilter.end) return Swal.fire('Atenção', 'Selecione datas', 'warning');
            const q = query(collection(db, "appointments"), where("userId", "==", user.value.uid), where("status", "==", agendaTab.value), where("date", ">=", agendaFilter.start), where("date", "<=", agendaFilter.end));
            const snap = await getDocs(q);
            historyList.value = snap.docs.map(sanitizeApp);
            historyList.value.forEach(a => fetchClientToCache(a.clientId));
        };
        const filteredListAppointments = computed(() => { 
            let list = agendaTab.value === 'pending' ? pendingAppointments.value : historyList.value;
            if(clientSearchTerm.value) list = list.filter(a => getClientName(a.clientId).toLowerCase().includes(clientSearchTerm.value.toLowerCase())); 
            return list.sort((a,b) => a.date.localeCompare(b.date)); 
        });

        // =================================================================
        // 5. AÇÕES (BOTÕES E LOGICA)
        // =================================================================
        const handleAuth = async () => { authLoading.value = true; try { if (isRegistering.value) { const c=await createUserWithEmailAndPassword(auth, authForm.email, authForm.password); await updateProfile(c.user,{displayName:authForm.name}); await setDoc(doc(db,"users",c.user.uid),{email:authForm.email}); } else { await signInWithEmailAndPassword(auth,authForm.email,authForm.password); } } catch(e){Swal.fire('Erro','Dados inválidos','error');} finally{authLoading.value=false;} };
        
        const saveAppointment = async () => {
            const appData = { ...JSON.parse(JSON.stringify(tempApp)), totalServices: totalServices.value, finalBalance: finalBalance.value, userId: user.value.uid, status: 'pending' };
            if(!appData.checklist.length) appData.checklist = [{text:'Materiais', done:false}];
            if (isEditing.value) await updateDoc(doc(db, "appointments", editingId.value), appData); else await addDoc(collection(db, "appointments"), appData);
            loadDashboardData(); showAppointmentModal.value = false; Swal.fire('Salvo!', '', 'success');
        };

        const changeStatus = async (app, status) => {
            const action = status === 'concluded' ? 'Concluir' : 'Cancelar';
            const {isConfirmed} = await Swal.fire({title: action + '?', text: 'Deseja alterar o status?', icon:'question', showCancelButton:true});
            if(isConfirmed) { await updateDoc(doc(db,"appointments",app.id), {status:status}); Swal.fire('Feito','','success'); }
        };

        const saveService = async () => { if(!newService.description || !newService.price) return; await addDoc(collection(db, "services"), { description: newService.description, price: toNum(newService.price), userId: user.value.uid }); newService.description = ''; newService.price = ''; };
        const deleteService = async (id) => { await deleteDoc(doc(db, "services", id)); };
        
        const addExpense = async () => { await addDoc(collection(db, "expenses"), { ...newExpense, value: toNum(newExpense.value), userId: user.value.uid }); showExpenseModal.value = false; Swal.fire('Salvo','','success'); };
        
        // Clientes
        const deleteClient = async (id) => { if((await Swal.fire({title:'Excluir?',showCancelButton:true})).isConfirmed) { await deleteDoc(doc(db,"clients",id)); searchCatalogClients(); }};
        const openClientModal = async () => { 
            const {value:v}=await Swal.fire({
                title:'Novo Cliente', 
                html:'<input id="n" placeholder="Nome" class="swal2-input"><input id="p" placeholder="Tel" class="swal2-input"><input id="cpf" placeholder="CPF" class="swal2-input">', 
                preConfirm:()=>[document.getElementById('n').value,document.getElementById('p').value,document.getElementById('cpf').value]
            }); 
            if(v) await addDoc(collection(db,"clients"),{name:v[0],phone:v[1],cpf:v[2],userId:user.value.uid}); 
        };
        const searchCatalogClients = async () => { const q = query(collection(db, "clients"), where("userId", "==", user.value.uid)); const snap = await getDocs(q); catalogClientsList.value = snap.docs.map(d => ({id: d.id, ...d.data()})).filter(c => c.name.toLowerCase().includes(catalogClientSearch.value.toLowerCase())); };
        watch(clientSearchTerm, async (val) => { if (val && val.length > 2) { const q = query(collection(db, "clients"), where("userId", "==", user.value.uid)); const snap = await getDocs(q); scheduleClientsList.value = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(c => c.name.toLowerCase().includes(val.toLowerCase())); } else { scheduleClientsList.value = []; } });
        const filteredClientsSearch = computed(() => scheduleClientsList.value);

        const expensesByCategoryStats = computed(() => { if (!dashboardData.expenses.length) return []; return expenseCategories.map(cat => { const total = dashboardData.expenses.filter(e => e.category === cat.id).reduce((sum, e) => sum + toNum(e.value), 0); return { ...cat, total }; }).filter(c => c.total > 0).sort((a, b) => b.total - a.total); });
        const downloadReceiptImage = () => { html2canvas(document.getElementById('receipt-capture-area')).then(c => { const l = document.createElement('a'); l.download = 'Recibo.png'; l.href = c.toDataURL(); l.click(); }); };
        
        // PDF Contrato Atualizado
        const generateContractPDF = () => { 
            const { jsPDF } = window.jspdf; const doc = new jsPDF(); const app = currentReceipt.value; const cli = clientCache[app.clientId] || {name:'...',cpf:'...'};
            doc.setFontSize(18); doc.text("CONTRATO DE PRESTAÇÃO DE SERVIÇOS", 105, 20, {align:"center"});
            doc.setFontSize(12); 
            doc.text(`CONTRATADA: ${company.fantasia}, CNPJ: ${company.cnpj || '...'}`, 20, 40);
            doc.text(`Endereço: ${company.rua || ''} - ${company.cidade || ''}/${company.estado || ''}`, 20, 46);
            doc.text(`CONTRATANTE: ${cli.name}, CPF: ${cli.cpf || '...'}`, 20, 56);
            doc.text(`Data do Evento: ${formatDate(app.date)} às ${app.time}`, 20, 70);
            doc.text(`Local: ${app.location.bairro}`, 20, 76);
            const body = app.selectedServices.map(s => [s.description, formatCurrency(s.price)]); doc.autoTable({startY: 85, head: [['Serviço', 'Valor']], body: body});
            let y = doc.lastAutoTable.finalY + 10; doc.text(`Total: ${formatCurrency(app.totalServices)}`, 20, y); doc.text(`Sinal: ${formatCurrency(app.entryFee)}`, 20, y+10); doc.text(`Restante: ${formatCurrency(app.finalBalance)}`, 20, y+20);
            if(app.details.balloonColors) doc.text(`Cores: ${app.details.balloonColors}`, 20, y+30); if(app.notes) doc.text(`Obs: ${app.notes}`, 20, y+36); doc.save("Contrato.pdf");
        };
        
        const handleLogoUpload = (e) => { const f = e.target.files[0]; if(f){ const r=new FileReader(); r.onload=x=>{company.logo=x.target.result; updateDoc(doc(db,"users",user.value.uid),{companyConfig:company});}; r.readAsDataURL(f); }};
        const saveCompany = () => { updateDoc(doc(db, "users", user.value.uid), { companyConfig: company }); Swal.fire('Salvo', '', 'success'); };
        const handleChangePassword = async () => { const html = '<input id="currentPass" type="password" class="swal2-input" placeholder="Senha Atual"><input id="newPass" type="password" class="swal2-input" placeholder="Nova Senha">'; const { value: fv } = await Swal.fire({ title: 'Alterar Senha', html: html, showCancelButton: true, confirmButtonText: 'Alterar', preConfirm: () => { return [document.getElementById('currentPass').value, document.getElementById('newPass').value]; } }); if (fv && fv[0] && fv[1]) { try { const c = EmailAuthProvider.credential(user.value.email, fv[0]); await reauthenticateWithCredential(user.value, c); await updatePassword(user.value, fv[1]); Swal.fire('Sucesso!', 'Senha alterada.', 'success'); } catch (error) { Swal.fire('Erro', 'Senha incorreta.', 'error'); } } };

        // =================================================================
        // 6. RETORNO PARA O HTML (TUDO QUE É USADO NO TEMPLATE)
        // =================================================================
        return {
            user, view, isDark, authForm, authLoading, isRegistering, handleAuth, logout: () => { signOut(auth); window.location.href="index.html"; },
            dashboardMonth, financeData, next7DaysApps, statementList, isExtractLoaded, financeSummary, expensesFilter, searchExpenses,
            showExpenseModal, newExpense, addExpense, deleteExpense: async(id)=>{await deleteDoc(doc(db,"expenses",id)); loadDashboardData();},
            showAppointmentModal, showServiceModal, newService, saveService, deleteService,
            tempApp, tempServiceSelect, services, totalServices, finalBalance, isEditing, clientSearchTerm, filteredClientsSearch,
            startNewSchedule: () => { isEditing.value=false; Object.assign(tempApp, {clientId:'', date:'', time:'', location:{bairro:''}, details:{entryFee:0, balloonColors:''}, notes: '', selectedServices:[], checklist:[]}); showAppointmentModal.value=true; },
            editAppointment: (app) => { isEditing.value=true; editingId.value=app.id; Object.assign(tempApp, JSON.parse(JSON.stringify(app))); showAppointmentModal.value=true; },
            saveAppointment, addServiceToApp: () => { if(tempServiceSelect.value) tempApp.selectedServices.push(tempServiceSelect.value); tempServiceSelect.value=''; },
            removeServiceFromApp: (i) => tempApp.selectedServices.splice(i,1),
            appointmentViewMode, calendarGrid, calendarTitle, changeCalendarMonth, selectCalendarDay, selectedCalendarDate, appointmentsOnSelectedDate, filteredListAppointments,
            catalogClientsList, catalogClientSearch, searchCatalogClients, openClientModal, deleteClient,
            currentReceipt, showReceipt: (app) => { currentReceipt.value = sanitizeApp(app); view.value = 'receipt'; },
            company, handleLogoUpload, saveCompany, handleChangePassword, downloadReceiptImage, generateContractPDF,
            formatCurrency, formatDate, getDay, getMonth, statusText, getClientName, getClientPhone,
            toggleDarkMode: () => { isDark.value=!isDark.value; document.documentElement.classList.toggle('dark'); },
            expenseCategories, expensesByCategoryStats,
            agendaTab, agendaFilter, searchHistory, changeStatus,
            registrationTab // CRUCIAL: Retornando o controle da aba de Cadastros
        };
    }
}).mount('#app');
