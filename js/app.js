const { createApp, ref, computed, reactive, onMounted, watch } = Vue;

import { 
    db, auth, 
    collection, addDoc, onSnapshot, doc, updateDoc, deleteDoc, getDocs, query, where, setDoc, getDoc, 
    signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged,
    updatePassword, reauthenticateWithCredential, EmailAuthProvider, updateProfile 
} from './firebase.js';

createApp({
    setup() {
        // --- ESTADOS ---
        const user = ref(null);
        const view = ref('dashboard');
        const isDark = ref(false);
        const authLoading = ref(false);
        const isRegistering = ref(false);
        
        const authForm = reactive({ email: '', password: '', name: '' });
        const company = reactive({ fantasia: '', logo: '', cnpj: '' });
        
        // Dados
        const dashboardMonth = ref(new Date().toISOString().slice(0, 7));
        const dashboardData = reactive({ appointments: [], expenses: [] });
        const isLoadingDashboard = ref(false);
        const services = ref([]);
        const pendingAppointments = ref([]);
        const expensesList = ref([]);
        const catalogClientsList = ref([]);
        const scheduleClientsList = ref([]);
        const clientCache = reactive({});

        // Forms
        const tempApp = reactive({ clientId: '', date: '', time: '', location: { bairro: '' }, details: { entryFee: 0 }, selectedServices: [], checklist: [] });
        const tempServiceSelect = ref('');
        const newExpense = reactive({ description: '', value: '', date: new Date().toISOString().split('T')[0], category: 'outros' });
        const expensesFilter = reactive({ start: '', end: '' });
        
        // UI Controls
        const showExpenseModal = ref(false);
        const currentReceipt = ref(null);
        const isEditing = ref(false);
        const editingId = ref(null);
        const clientSearchTerm = ref('');
        const catalogClientSearch = ref('');
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
        const getClientName = (id) => clientCache[id]?.name || '...';

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

        // --- AUTH & LOAD ---
        onMounted(() => {
            onAuthStateChanged(auth, async (u) => {
                if (u) {
                    const userRef = doc(db, "users", u.uid);
                    const userDoc = await getDoc(userRef);
                    if (!userDoc.exists()) await setDoc(userRef, { email: u.email, role: 'user', createdAt: new Date().toISOString() });
                    if (userDoc.exists() && userDoc.data().companyConfig) Object.assign(company, userDoc.data().companyConfig);
                    user.value = u;
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
                expensesList.value = [...dashboardData.expenses].sort((a, b) => b.date.localeCompare(a.date));
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

        // --- COMPUTEDS (ESTRITA ORDEM) ---
        const filteredClientsSearch = computed(() => scheduleClientsList.value);
        
        const statementList = computed(() => {
            const income = dashboardData.appointments.map(a => ({
                id: a.id, date: a.date, description: `Receita: ${clientCache[a.clientId]?.name || 'Cliente'}`, value: toNum(a.totalServices), type: 'income', icon: 'fa-arrow-up', color: 'text-green-600'
            }));
            const expense = dashboardData.expenses.map(e => ({
                id: e.id, date: e.date, description: e.description, value: toNum(e.value), type: 'expense', icon: 'fa-arrow-down', color: 'text-red-500'
            }));
            return [...income, ...expense].sort((a, b) => b.date.localeCompare(a.date));
        });

        const financeData = computed(() => {
            const revenue = dashboardData.appointments.reduce((acc, a) => acc + toNum(a.totalServices), 0);
            const expenses = dashboardData.expenses.reduce((acc, e) => acc + toNum(e.value), 0);
            const receivables = dashboardData.appointments.reduce((acc, a) => acc + toNum(a.finalBalance), 0);
            return { revenue, expenses, profit: revenue - expenses, receivables };
        });

        const next7DaysApps = computed(() => {
            const today = new Date().toISOString().split('T')[0];
            return pendingAppointments.value.filter(a => a.date >= today).sort((a,b) => a.date.localeCompare(b.date)).slice(0, 5);
        });

        const totalServices = computed(() => tempApp.selectedServices.reduce((s,i) => s + toNum(i.price), 0));
        const finalBalance = computed(() => totalServices.value - toNum(tempApp.details.entryFee));

        // --- AÇÕES ---
        const handleAuth = async () => {
            authLoading.value = true;
            try {
                if (isRegistering.value) {
                    const cred = await createUserWithEmailAndPassword(auth, authForm.email, authForm.password);
                    await updateProfile(cred.user, { displayName: authForm.name });
                    await setDoc(doc(db, "users", cred.user.uid), { email: authForm.email, displayName: authForm.name, role: 'user', createdAt: new Date().toISOString() });
                } else { await signInWithEmailAndPassword(auth, authForm.email, authForm.password); }
            } catch (e) { Swal.fire('Erro', 'Verifique dados', 'error'); } finally { authLoading.value = false; }
        };

        const saveAppointment = async () => {
            const appData = { ...JSON.parse(JSON.stringify(tempApp)), totalServices: totalServices.value, finalBalance: finalBalance.value, userId: user.value.uid, status: 'pending' };
            if(!appData.checklist.length) appData.checklist = [{text:'Materiais', done:false}];
            if (isEditing.value) await updateDoc(doc(db, "appointments", editingId.value), appData);
            else await addDoc(collection(db, "appointments"), appData);
            loadDashboardData(); view.value = 'dashboard'; Swal.fire('Sucesso!', '', 'success');
        };

        const addExpense = async () => {
            await addDoc(collection(db, "expenses"), { ...newExpense, value: toNum(newExpense.value), userId: user.value.uid });
            loadDashboardData(); showExpenseModal.value = false; Swal.fire('Salvo!', '', 'success');
        };

        const deleteClient = async (id) => { if((await Swal.fire({title:'Excluir?',showCancelButton:true})).isConfirmed) { await deleteDoc(doc(db,"clients",id)); catalogClientsList.value = catalogClientsList.value.filter(c=>c.id!==id); }};
        const openClientModal = async () => { const {value:v} = await Swal.fire({title:'Novo Cliente', html:'<input id="n" placeholder="Nome" class="swal2-input"><input id="p" placeholder="Tel" class="swal2-input">', preConfirm:()=>[document.getElementById('n').value,document.getElementById('p').value]}); if(v) await addDoc(collection(db,"clients"),{name:v[0],phone:v[1],userId:user.value.uid}); };
        
        const searchCatalogClients = async () => {
            const q = query(collection(db, "clients"), where("userId", "==", user.value.uid));
            const snap = await getDocs(q);
            const term = catalogClientSearch.value.toLowerCase();
            catalogClientsList.value = snap.docs.map(d => ({id: d.id, ...d.data()})).filter(c => c.name.toLowerCase().includes(term));
        };

        const searchExpenses = async () => {
            if(!expensesFilter.start || !expensesFilter.end) return;
            const q = query(collection(db, "expenses"), where("userId", "==", user.value.uid), where("date", ">=", expensesFilter.start), where("date", "<=", expensesFilter.end));
            const snap = await getDocs(q);
            statementList.value = snap.docs.map(sanitizeExpense); // Isso filtra só despesas, o statementList é computed, então na vdd aqui atualizamos o expensesList
            // Ops, statementList é computed. Vamos atualizar o dashboardData.expenses para refletir o filtro
            dashboardData.expenses = snap.docs.map(sanitizeExpense);
        };

        watch(clientSearchTerm, async (val) => {
            if (val && val.length > 2) {
                const q = query(collection(db, "clients"), where("userId", "==", user.value.uid));
                const snap = await getDocs(q);
                scheduleClientsList.value = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(c => c.name.toLowerCase().includes(val.toLowerCase()));
            } else { scheduleClientsList.value = []; }
        });

        // Extras
        const downloadReceiptImage = () => { html2canvas(document.getElementById('receipt-capture-area')).then(c => { const l = document.createElement('a'); l.download = 'Recibo.png'; l.href = c.toDataURL(); l.click(); }); };
        const generateContractPDF = () => { const doc = new window.jspdf.jsPDF(); doc.text(`Contrato - ${company.fantasia}`, 10, 10); doc.save("Contrato.pdf"); };
        const handleLogoUpload = (e) => { const f = e.target.files[0]; if(f){ const r=new FileReader(); r.onload=x=>{company.logo=x.target.result; updateDoc(doc(db,"users",user.value.uid),{companyConfig:company});}; r.readAsDataURL(f); }};
        const saveCompany = () => { updateDoc(doc(db, "users", user.value.uid), { companyConfig: company }); Swal.fire('Salvo', '', 'success'); };
        const handleChangePassword = async () => { Swal.fire('Aviso', 'Use a opção de esqueci minha senha no login.', 'info'); };

        return {
            user, view, isDark, authForm, authLoading, isRegistering, handleAuth, logout: () => { signOut(auth); window.location.href="index.html"; },
            dashboardMonth, financeData, next7DaysApps, statementList, catalogClientsList, expensesList,
            showExpenseModal, newExpense, addExpense, deleteExpense: async(id)=>{await deleteDoc(doc(db,"expenses",id)); loadDashboardData();},
            tempApp, tempServiceSelect, services, totalServices, finalBalance, isEditing, clientSearchTerm, filteredClientsSearch,
            startNewSchedule: () => { isEditing.value=false; Object.assign(tempApp, {clientId:'', date:'', time:'', location:{bairro:''}, details:{entryFee:0}, selectedServices:[]}); view.value='schedule'; },
            editAppointment: (app) => { isEditing.value=true; editingId.value=app.id; Object.assign(tempApp, JSON.parse(JSON.stringify(app))); view.value='schedule'; },
            saveAppointment, addServiceToApp: () => { if(tempServiceSelect.value) tempApp.selectedServices.push(tempServiceSelect.value); tempServiceSelect.value=''; },
            removeServiceFromApp: (i) => tempApp.selectedServices.splice(i,1),
            searchCatalogClients, deleteClient, openClientModal, searchExpenses, expensesFilter,
            currentReceipt, showReceipt: (app) => { currentReceipt.value = sanitizeApp(app); view.value = 'receipt'; },
            company, handleLogoUpload, saveCompany, handleChangePassword, downloadReceiptImage, generateContractPDF,
            formatCurrency, formatDate, getClientName, getClientPhone: (id)=>clientCache[id]?.phone,
            toggleDarkMode: () => { isDark.value=!isDark.value; document.documentElement.classList.toggle('dark'); },
            expenseCategories
        };
    }
}).mount('#app');