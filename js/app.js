const { createApp, ref, computed, reactive, onMounted, watch } = Vue;

import { 
    db, auth, 
    collection, addDoc, onSnapshot, doc, updateDoc, deleteDoc, getDocs, query, where, setDoc, getDoc, 
    signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged,
    updatePassword, reauthenticateWithCredential, EmailAuthProvider, updateProfile 
} from './firebase.js';

createApp({
    setup() {
        const user = ref(null);
        const view = ref('dashboard');
        const isDark = ref(false);
        const authLoading = ref(false);
        const isRegistering = ref(false);
        const authForm = reactive({ email: '', password: '', name: '' });
        const company = reactive({ fantasia: '', logo: '', cnpj: '' });
        
        const dashboardMonth = ref(new Date().toISOString().slice(0, 7));
        const dashboardData = reactive({ appointments: [], expenses: [] });
        const isLoadingDashboard = ref(false);
        const services = ref([]);
        const pendingAppointments = ref([]);
        const expensesList = ref([]); // Lista do extrato
        const isExtractLoaded = ref(false); // Controle se já filtrou
        
        const catalogClientsList = ref([]);
        const scheduleClientsList = ref([]);
        const clientCache = reactive({});

        const tempApp = reactive({ clientId: '', date: '', time: '', location: { bairro: '' }, details: { entryFee: 0 }, selectedServices: [], checklist: [] });
        const tempServiceSelect = ref('');
        const newExpense = reactive({ description: '', value: '', date: new Date().toISOString().split('T')[0], category: 'outros' });
        const expensesFilter = reactive({ start: '', end: '' });
        
        const showExpenseModal = ref(false);
        const currentReceipt = ref(null);
        const isEditing = ref(false);
        const editingId = ref(null);
        const clientSearchTerm = ref('');
        const catalogClientSearch = ref('');
        
        // Calendário
        const appointmentViewMode = ref('list');
        const calendarCursor = ref(new Date());
        const selectedCalendarDate = ref(null);

        const expenseCategories = [
            { id: 'combustivel', label: 'Combustível', icon: 'fa-gas-pump' },
            { id: 'materiais', label: 'Materiais', icon: 'fa-box-open' },
            { id: 'equipe', label: 'Equipe', icon: 'fa-users' },
            { id: 'outros', label: 'Outros', icon: 'fa-money-bill' }
        ];

        // --- UTILS ---
        const toNum = (val) => {
            if (!val) return 0;
            if (typeof val === 'number') return val;
            const clean = String(val).replace(',', '.').replace(/[^0-9.-]/g, '');
            return parseFloat(clean) || 0;
        };

        const formatCurrency = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(toNum(v));
        const formatDate = (d) => d ? d.split('-').reverse().join('/') : '';
        const getDay = (d) => d ? d.split('-')[2] : '';
        const getMonth = (d) => d ? ['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'][parseInt(d.split('-')[1])-1] : '';
        const statusText = (s) => s === 'concluded' ? 'Concluído' : 'Pendente';
        const getClientName = (id) => clientCache[id]?.name || '...';
        const getClientPhone = (id) => clientCache[id]?.phone || '';

        const fetchClientToCache = async (id) => {
            if (!id || clientCache[id]) return;
            try {
                const snap = await getDoc(doc(db, "clients", id));
                if (snap.exists()) clientCache[id] = snap.data();
                else clientCache[id] = { name: 'Excluído', phone: '-' };
            } catch (e) {}
        };

        const sanitizeApp = (docSnapshot) => {
            const data = docSnapshot.data ? docSnapshot.data() : docSnapshot;
            const safeServices = Array.isArray(data.selectedServices) ? data.selectedServices : [];
            let total = toNum(data.totalServices);
            if (total === 0 && safeServices.length > 0) total = safeServices.reduce((sum, item) => sum + toNum(item.price), 0);
            let entry = toNum(data.entryFee || data.details?.entryFee);
            let balance = toNum(data.finalBalance);
            if (balance === 0 && total > 0) balance = total - entry;

            return {
                id: docSnapshot.id || data.id, ...data,
                selectedServices: safeServices, totalServices: total, finalBalance: balance, entryFee: entry,
                checklist: data.checklist || []
            };
        };

        const sanitizeExpense = (docSnapshot) => {
            const data = docSnapshot.data ? docSnapshot.data() : docSnapshot;
            return { id: docSnapshot.id || data.id, ...data, value: toNum(data.value) };
        };

        onMounted(() => {
            onAuthStateChanged(auth, async (u) => {
                if (u) {
                    user.value = u;
                    const userDoc = await getDoc(doc(db, "users", u.uid));
                    if (userDoc.exists() && userDoc.data().companyConfig) Object.assign(company, userDoc.data().companyConfig);
                    loadDashboardData();
                    syncData();
                } else { user.value = null; }
            });
        });

        const loadDashboardData = async () => {
            if (!user.value) return;
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
            } catch (e) { console.error(e); }
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

        // --- COMPUTEDS ---
        const totalServices = computed(() => tempApp.selectedServices.reduce((s,i) => s + toNum(i.price), 0));
        const finalBalance = computed(() => totalServices.value - toNum(tempApp.details.entryFee));
        
        const kpiRevenue = computed(() => dashboardData.appointments.reduce((acc, a) => acc + toNum(a.totalServices), 0));
        const kpiExpenses = computed(() => dashboardData.expenses.reduce((acc, e) => acc + toNum(e.value), 0));
        const financeData = computed(() => ({
            revenue: kpiRevenue.value, expenses: kpiExpenses.value, profit: kpiRevenue.value - kpiExpenses.value,
            receivables: dashboardData.appointments.reduce((acc, a) => acc + toNum(a.finalBalance), 0)
        }));

        const next7DaysApps = computed(() => {
            const today = new Date(); today.setHours(0,0,0,0);
            const nextWeek = new Date(today); nextWeek.setDate(today.getDate() + 7);
            const todayStr = today.toISOString().split('T')[0];
            const nextWeekStr = nextWeek.toISOString().split('T')[0];
            return pendingAppointments.value.filter(a => a.date >= todayStr && a.date <= nextWeekStr).sort((a,b) => a.date.localeCompare(b.date));
        });

        // --- EXTRATO UNIFICADO (SÓ CARREGA NO FILTRO) ---
        const statementList = computed(() => {
            if (!isExtractLoaded.value) return []; // Começa vazio
            // Aqui unimos expensesList (despesas filtradas) com receitas filtradas
            const income = expensesList.value.filter(i => i.type === 'income'); 
            const expense = expensesList.value.filter(i => i.type === 'expense'); // Já vem do searchExpenses com type
            return [...income, ...expense].sort((a, b) => b.date.localeCompare(a.date));
        });
        
        const financeSummary = computed(() => statementList.value.reduce((acc, item) => {
            return item.type === 'income' ? acc + item.value : acc - item.value;
        }, 0));

        // --- BUSCA EXTRATO (O PULO DO GATO) ---
        const searchExpenses = async () => {
            if(!expensesFilter.start || !expensesFilter.end) return Swal.fire('Data', 'Selecione o período', 'info');
            
            // 1. Busca Despesas
            const qExp = query(collection(db, "expenses"), where("userId", "==", user.value.uid), where("date", ">=", expensesFilter.start), where("date", "<=", expensesFilter.end));
            const snapExp = await getDocs(qExp);
            const loadedExpenses = snapExp.docs.map(d => ({ ...sanitizeExpense(d), type: 'expense', icon: 'fa-arrow-down', color: 'text-red-500' }));

            // 2. Busca Receitas (Agendamentos) no mesmo período
            const qApp = query(collection(db, "appointments"), where("userId", "==", user.value.uid), where("date", ">=", expensesFilter.start), where("date", "<=", expensesFilter.end));
            const snapApp = await getDocs(qApp);
            const loadedIncome = snapApp.docs.map(d => {
                const app = sanitizeApp(d);
                return {
                    id: app.id, date: app.date, value: app.totalServices, description: `Receita: ${getClientName(app.clientId)}`,
                    type: 'income', icon: 'fa-arrow-up', color: 'text-green-500'
                };
            });

            expensesList.value = [...loadedExpenses, ...loadedIncome]; // Popula a lista mista
            isExtractLoaded.value = true; // Libera a visualização
        };

        // --- CONTRATO PROFISSIONAL ---
        const generateContractPDF = () => {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();
            const app = currentReceipt.value;
            const cli = clientCache[app.clientId] || {name: '________________', cpf: '___________'};
            
            // Cabeçalho
            doc.setFontSize(18); doc.setFont("helvetica", "bold");
            doc.text("CONTRATO DE PRESTAÇÃO DE SERVIÇOS", 105, 20, { align: "center" });
            
            doc.setFontSize(10); doc.setFont("helvetica", "normal");
            const contratada = `CONTRATADA: ${company.fantasia}, CNPJ: ${company.cnpj || '...'}, doravante denominada CONTRATADA.`;
            const contratante = `CONTRATANTE: ${cli.name}, Telefone: ${cli.phone}, doravante denominado(a) CONTRATANTE.`;
            
            doc.text(contratada, 20, 40);
            doc.text(contratante, 20, 50);

            doc.setFont("helvetica", "bold"); doc.text("1. DO OBJETO", 20, 65);
            doc.setFont("helvetica", "normal");
            doc.text(`Prestação de serviços de decoração/eventos para a data de ${formatDate(app.date)} às ${app.time}h.`, 20, 72);
            doc.text(`Local: ${app.location.bairro || 'A definir'}`, 20, 78);

            // Tabela Itens
            const body = app.selectedServices.map(s => [s.description, formatCurrency(s.price)]);
            doc.autoTable({
                startY: 85,
                head: [['Item / Serviço', 'Valor']],
                body: body,
                theme: 'grid',
                headStyles: { fillColor: [100, 100, 100] }
            });

            let finalY = doc.lastAutoTable.finalY + 10;

            doc.setFont("helvetica", "bold"); doc.text("2. VALORES E PAGAMENTO", 20, finalY);
            doc.setFont("helvetica", "normal");
            doc.text(`Valor Total: ${formatCurrency(app.totalServices)}`, 20, finalY + 7);
            doc.text(`Sinal Pago: ${formatCurrency(app.entryFee)}`, 20, finalY + 14);
            doc.text(`Restante a Pagar: ${formatCurrency(app.finalBalance)} (Até a data do evento)`, 20, finalY + 21);

            doc.setFont("helvetica", "bold"); doc.text("3. DISPOSIÇÕES GERAIS", 20, finalY + 35);
            doc.setFontSize(8);
            const clauses = [
                "3.1. Em caso de desistência por parte do CONTRATANTE em menos de 30 dias, o valor do sinal não será devolvido.",
                "3.2. A CONTRATADA não se responsabiliza por danos causados por terceiros no local do evento.",
                "3.3. O atraso no pagamento do restante pode acarretar na não realização do serviço."
            ];
            doc.text(clauses, 20, finalY + 42);

            // Assinaturas
            doc.line(20, 260, 90, 260); doc.line(110, 260, 190, 260);
            doc.text("CONTRATADA", 35, 265); doc.text("CONTRATANTE", 130, 265);
            
            doc.save(`Contrato_${cli.name.split(' ')[0]}.pdf`);
        };

        // --- Agenda View Toggle ---
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

        const filteredListAppointments = computed(() => {
            let list = pendingAppointments.value;
            if(clientSearchTerm.value) list = list.filter(a => getClientName(a.clientId).toLowerCase().includes(clientSearchTerm.value.toLowerCase()));
            return list.sort((a,b) => a.date.localeCompare(b.date));
        });

        // --- GENERICOS ---
        const handleAuth = async () => { /* Mesma lógica anterior... */ authLoading.value = true; try { if (isRegistering.value) { const c=await createUserWithEmailAndPassword(auth, authForm.email, authForm.password); await updateProfile(c.user,{displayName:authForm.name}); await setDoc(doc(db,"users",c.user.uid),{email:authForm.email}); } else { await signInWithEmailAndPassword(auth,authForm.email,authForm.password); } } catch(e){Swal.fire('Erro','Dados inválidos','error');} finally{authLoading.value=false;} };
        const saveAppointment = async () => { const appData = { ...JSON.parse(JSON.stringify(tempApp)), totalServices: totalServices.value, finalBalance: finalBalance.value, userId: user.value.uid, status: 'pending' }; if (isEditing.value) await updateDoc(doc(db, "appointments", editingId.value), appData); else await addDoc(collection(db, "appointments"), appData); loadDashboardData(); view.value = 'schedule'; Swal.fire('Salvo!', '', 'success'); };
        const addExpense = async () => { await addDoc(collection(db, "expenses"), { ...newExpense, value: toNum(newExpense.value), userId: user.value.uid }); showExpenseModal.value = false; Swal.fire('Salvo','','success'); };
        
        const filteredClientsSearch = computed(() => scheduleClientsList.value);
        watch(clientSearchTerm, async (val) => { if (val.length > 2) { const q = query(collection(db, "clients"), where("userId", "==", user.value.uid)); const snap = await getDocs(q); scheduleClientsList.value = snap.docs.map(d => ({id:d.id, ...d.data()})).filter(c => c.name.toLowerCase().includes(val.toLowerCase())); } });
        
        const searchCatalogClients = async () => { const q = query(collection(db, "clients"), where("userId", "==", user.value.uid)); const s = await getDocs(q); catalogClientsList.value = s.docs.map(d=>({id:d.id,...d.data()})).filter(c=>c.name.toLowerCase().includes(catalogClientSearch.value.toLowerCase())); };
        const openClientModal = async () => { const {value:v}=await Swal.fire({title:'Novo Cliente', html:'<input id="n" placeholder="Nome" class="swal2-input"><input id="p" placeholder="Tel" class="swal2-input">', preConfirm:()=>[document.getElementById('n').value,document.getElementById('p').value]}); if(v) await addDoc(collection(db,"clients"),{name:v[0],phone:v[1],userId:user.value.uid}); };
        const deleteClient = async(id)=>{if((await Swal.fire({title:'Apagar?',showCancelButton:true})).isConfirmed){await deleteDoc(doc(db,"clients",id)); searchCatalogClients();}};

        const downloadReceiptImage = () => { html2canvas(document.getElementById('receipt-capture-area')).then(c => { const l = document.createElement('a'); l.download = 'Recibo.png'; l.href = c.toDataURL(); l.click(); }); };
        const handleLogoUpload = (e) => { const f = e.target.files[0]; if(f){ const r=new FileReader(); r.onload=x=>{company.logo=x.target.result; updateDoc(doc(db,"users",user.value.uid),{companyConfig:company});}; r.readAsDataURL(f); }};
        const saveCompany = () => { updateDoc(doc(db, "users", user.value.uid), { companyConfig: company }); Swal.fire('Salvo', '', 'success'); };
        const handleChangePassword = async () => { Swal.fire('Info', 'Utilize o reset de senha na tela de login.', 'info'); };

        return {
            user, view, authForm, authLoading, isRegistering, handleAuth, logout: () => { signOut(auth); window.location.href="index.html"; },
            dashboardMonth, financeData, next7DaysApps, statementList, isExtractLoaded, financeSummary,
            expensesFilter, searchExpenses, showExpenseModal, newExpense, addExpense, expenseCategories,
            tempApp, tempServiceSelect, services, totalServices, finalBalance, isEditing, 
            clientSearchTerm, filteredClientsSearch, filteredListAppointments,
            startNewSchedule: () => { isEditing.value=false; Object.assign(tempApp, {clientId:'', date:'', time:'', location:{bairro:''}, details:{entryFee:0}, selectedServices:[], checklist:[]}); view.value='new_appointment'; },
            editAppointment: (app) => { isEditing.value=true; editingId.value=app.id; Object.assign(tempApp, JSON.parse(JSON.stringify(app))); view.value='new_appointment'; },
            saveAppointment, addServiceToApp: () => { if(tempServiceSelect.value) tempApp.selectedServices.push(tempServiceSelect.value); tempServiceSelect.value=''; },
            removeServiceFromApp: (i) => tempApp.selectedServices.splice(i,1),
            appointmentViewMode, calendarGrid, calendarTitle, changeCalendarMonth, selectCalendarDay, selectedCalendarDate, appointmentsOnSelectedDate,
            catalogClientsList, catalogClientSearch, searchCatalogClients, openClientModal, deleteClient,
            currentReceipt, showReceipt: (app) => { currentReceipt.value = sanitizeApp(app); view.value = 'receipt'; },
            company, handleLogoUpload, saveCompany, handleChangePassword, downloadReceiptImage, generateContractPDF,
            formatCurrency, formatDate, getDay, getMonth, statusText: s=>s==='concluded'?'Concluído':'Pendente', getClientName, getClientPhone
        };
    }
}).mount('#app');