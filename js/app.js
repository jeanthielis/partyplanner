const { createApp, ref, computed, reactive, onMounted, watch } = Vue;

import { 
    db, auth, 
    collection, addDoc, onSnapshot, doc, updateDoc, deleteDoc, getDocs, query, where, setDoc, getDoc, 
    signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged,
    updateProfile 
} from './firebase.js';

createApp({
    setup() {
        // --- ESTADO GLOBAL ---
        const user = ref(null);
        const view = ref('dashboard');
        const isDark = ref(false);
        const authLoading = ref(false);
        const isRegistering = ref(false);
        const isGlobalLoading = ref(true);
        const authForm = reactive({ email: '', password: '', name: '' });
        
        const company = reactive({ fantasia: '', logo: '', cnpj: '', email: '', phone: '', rua: '', bairro: '', cidade: '', estado: '' });
        const dashboardMonth = ref(new Date().toISOString().slice(0, 7));
        const isLoadingDashboard = ref(false);
        
        const services = ref([]);
        const pendingAppointments = ref([]);
        const budgetList = ref([]); 
        const historyList = ref([]);
        const expensesList = ref([]);
        const dashboardData = reactive({ appointments: [], expenses: [] });
        const catalogClientsList = ref([]);
        const scheduleClientsList = ref([]);
        
        const clientCache = reactive({});
        const isExtractLoaded = ref(false);
        const expensesFilter = reactive({ start: '', end: '' });
        const agendaFilter = reactive({ start: '', end: '' });
        const clientSearchTerm = ref('');
        const isSelectingClient = ref(false);
        const catalogClientSearch = ref('');
        const appointmentViewMode = ref('list');
        const calendarCursor = ref(new Date());
        const selectedCalendarDate = ref(null);
        const registrationTab = ref('clients');
        const agendaTab = ref('pending');

        const showAppointmentModal = ref(false);
        const showClientModal = ref(false);
        const showServiceModal = ref(false);
        const showExpenseModal = ref(false);
        const showReceiptModal = ref(false);
        const isEditing = ref(false);
        const editingId = ref(null);
        const editingExpenseId = ref(null);
        const currentReceipt = ref(null);

        const newClient = reactive({ name: '', phone: '', cpf: '', email: '' });
        const newService = reactive({ description: '', price: '' });
        const newExpense = reactive({ description: '', value: '', date: new Date().toISOString().split('T')[0], category: 'outros' });
        const tempServiceSelect = ref('');
        const tempApp = reactive({ clientId: '', date: '', time: '', location: { bairro: '' }, details: { entryFee: 0, balloonColors: '' }, notes: '', selectedServices: [], checklist: [] });

        // --- PORTAL DO CLIENTE ---
        const loginMode = ref('provider'); 
        const clientAccessInput = ref('');
        const clientData = ref(null);
        const clientAppointments = ref([]);
        const showSignatureModal = ref(false);
        const signatureApp = ref(null);
        const targetProviderId = ref(null); 

        const expenseCategories = [
            { id: 'combustivel', label: 'Combustível', icon: 'fa-gas-pump' },
            { id: 'materiais', label: 'Materiais', icon: 'fa-box-open' },
            { id: 'equipe', label: 'Equipe', icon: 'fa-users' },
            { id: 'refeicao', label: 'Alimentação', icon: 'fa-utensils' },
            { id: 'marketing', label: 'Marketing', icon: 'fa-bullhorn' },
            { id: 'aluguel', label: 'Aluguel', icon: 'fa-house' },
            { id: 'outros', label: 'Outras', icon: 'fa-money-bill' }
        ];

        onMounted(async () => {
            const params = new URLSearchParams(window.location.search);
            if (params.get('acesso') === 'cliente') {
                loginMode.value = 'client';
                const providerUid = params.get('uid');
                if (providerUid) {
                    targetProviderId.value = providerUid;
                    try {
                        const providerDoc = await getDoc(doc(db, "users", providerUid));
                        if (providerDoc.exists() && providerDoc.data().companyConfig) {
                            Object.assign(company, providerDoc.data().companyConfig);
                        }
                    } catch (e) { console.error(e); }
                }
            }

            onAuthStateChanged(auth, async (u) => {
                user.value = u;
                if (u) {
                    await loadDashboardData();
                    syncData();
                    const uDoc = await getDoc(doc(db, "users", u.uid));
                    if (uDoc.exists() && uDoc.data().companyConfig) Object.assign(company, uDoc.data().companyConfig);
                }
                setTimeout(() => { isGlobalLoading.value = false; }, 800);
            });
        });

        // --- HELPERS ---
        const toNum = (v) => { if(!v) return 0; if(typeof v==='number') return v; const c=String(v).replace(',','.').replace(/[^0-9.-]/g,''); return parseFloat(c)||0; };
        const formatCurrency = (v) => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(toNum(v));
        const formatDate = (d) => { if(!d) return ''; try{return d.split('-').reverse().join('/');}catch(e){return d;} };
        const getDay = (d) => d?d.split('-')[2]:'';
        const getMonth = (d) => d?['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'][parseInt(d.split('-')[1])-1]:'';
        const statusText = (s) => s === 'budget' ? 'Orçamento' : (s==='concluded'?'Concluído':(s==='cancelled'?'Cancelado':'Pendente'));
        const getClientName = (id) => clientCache[id]?.name || 'Cliente';
        const getCategoryIcon = (id) => expenseCategories.find(c=>c.id===id)?.icon || 'fa-tag';
        const maskPhone = (v) => { if(!v) return ""; v=v.replace(/\D/g,"").replace(/^(\d{2})(\d)/g,"($1) $2").replace(/(\d)(\d{4})$/,"$1-$2"); return v; };
        const maskCPF = (v) => { if(!v) return ""; v=v.replace(/\D/g,"").replace(/(\d{3})(\d)/,"$1.$2").replace(/(\d{3})(\d)/,"$1.$2").replace(/(\d{3})(\d{1,2})$/,"$1-$2"); return v; };

        // --- COMPUTED ---
        const totalServices = computed(() => tempApp.selectedServices.reduce((s,i) => s + toNum(i.price), 0));
        const finalBalance = computed(() => totalServices.value - toNum(tempApp.details.entryFee));
        const financeData = computed(() => {
            const rev = dashboardData.appointments.reduce((acc, a) => acc + toNum(a.totalServices), 0);
            const exp = dashboardData.expenses.reduce((acc, e) => acc + toNum(e.value), 0);
            return { revenue: rev, expenses: exp, profit: rev - exp };
        });
        const kpiPendingReceivables = computed(() => dashboardData.appointments.filter(a => a.status === 'pending').reduce((acc, a) => acc + toNum(a.finalBalance), 0));
        const next7DaysApps = computed(() => {
            const today = new Date().toISOString().split('T')[0];
            return pendingAppointments.value.filter(a => a.date >= today).sort((a,b) => a.date.localeCompare(b.date)).slice(0,6);
        });

        // --- DATA SYNC ---
        const sanitizeApp = (d) => {
            const data = d.data ? d.data() : d;
            return { id: d.id || data.id, ...data, selectedServices: data.selectedServices || [], details: data.details || {entryFee:0, balloonColors:''}, checklist: data.checklist || [] };
        };

        const loadDashboardData = async () => {
            if (!user.value) return;
            isLoadingDashboard.value = true;
            const [y, m] = dashboardMonth.value.split('-');
            const qApps = query(collection(db, "appointments"), where("userId", "==", user.value.uid), where("date", ">=", `${y}-${m}-01`), where("date", "<=", `${y}-${m}-31`));
            const qExp = query(collection(db, "expenses"), where("userId", "==", user.value.uid), where("date", ">=", `${y}-${m}-01`), where("date", "<=", `${y}-${m}-31`));
            const [sA, sE] = await Promise.all([getDocs(qApps), getDocs(qExp)]);
            dashboardData.appointments = sA.docs.map(sanitizeApp).filter(a => a.status !== 'cancelled' && a.status !== 'budget');
            dashboardData.expenses = sE.docs.map(d => ({id: d.id, ...d.data()}));
            dashboardData.appointments.forEach(a => fetchClientToCache(a.clientId));
            isLoadingDashboard.value = false;
        };

        const syncData = () => {
            onSnapshot(query(collection(db, "services"), where("userId", "==", user.value.uid)), s => services.value = s.docs.map(d => ({id: d.id, ...d.data()})));
            onSnapshot(query(collection(db, "appointments"), where("userId", "==", user.value.uid), where("status", "==", "pending")), s => {
                pendingAppointments.value = s.docs.map(sanitizeApp);
                pendingAppointments.value.forEach(a => fetchClientToCache(a.clientId));
            });
            onSnapshot(query(collection(db, "appointments"), where("userId", "==", user.value.uid), where("status", "==", "budget")), s => {
                budgetList.value = s.docs.map(sanitizeApp);
                budgetList.value.forEach(a => fetchClientToCache(a.clientId));
            });
        };

        const fetchClientToCache = async (id) => { if(id && !clientCache[id]) { const s = await getDoc(doc(db, "clients", id)); if(s.exists()) clientCache[id] = s.data(); } };

        // --- ACTIONS ---
        const handleClientAccess = async () => {
            authLoading.value = true;
            try {
                const term = clientAccessInput.value.trim();
                let qConstraints = [];
                if (targetProviderId.value) qConstraints.push(where("userId", "==", targetProviderId.value));
                
                let q = query(collection(db, "clients"), where("cpf", "==", term), ...qConstraints);
                let snap = await getDocs(q);
                if (snap.empty) { q = query(collection(db, "clients"), where("email", "==", term), ...qConstraints); snap = await getDocs(q); }
                if (snap.empty) throw new Error();

                const clientDoc = snap.docs[0];
                clientData.value = { id: clientDoc.id, ...clientDoc.data() };
                
                let appQ = query(collection(db, "appointments"), where("clientId", "==", clientDoc.id));
                if (targetProviderId.value) appQ = query(collection(db, "appointments"), where("clientId", "==", clientDoc.id), where("userId", "==", targetProviderId.value));
                
                const snapApps = await getDocs(appQ);
                clientAppointments.value = snapApps.docs.map(sanitizeApp).filter(a => a.status !== 'cancelled').sort((a,b) => b.date.localeCompare(a.date));
                view.value = 'client-portal';
            } catch (e) { Swal.fire('Erro', 'Dados não encontrados.', 'error'); }
            finally { authLoading.value = false; }
        };

        const clientApproveBudget = async (app) => {
            const { isConfirmed } = await Swal.fire({ title: 'Aprovar Orçamento?', text: 'A data será reservada e você poderá enviar o comprovante.', icon: 'question', showCancelButton: true, confirmButtonText: 'Aprovar' });
            if (isConfirmed) {
                authLoading.value = true;
                await updateDoc(doc(db, "appointments", app.id), { status: 'pending', isNewUpdate: true, updatedAt: new Date().toISOString() });
                app.status = 'pending';
                authLoading.value = false;
                Swal.fire('Sucesso!', 'Aprovado. Agora anexe o comprovante do sinal.', 'success');
            }
        };

        const uploadPaymentProof = async (app, event) => {
            const file = event.target.files[0];
            if (!file) return;
            authLoading.value = true;
            const reader = new FileReader();
            reader.onload = async (e) => {
                const base64 = e.target.result;
                await updateDoc(doc(db, "appointments", app.id), { paymentProof: base64, isNewUpdate: true });
                app.paymentProof = base64;
                authLoading.value = false;
                Swal.fire('Enviado!', 'Comprovante recebido.', 'success');
            };
            reader.readAsDataURL(file);
        };

        const copyClientLink = () => {
            const url = `${window.location.origin}${window.location.pathname}?acesso=cliente&uid=${user.value.uid}`;
            navigator.clipboard.writeText(url).then(() => Swal.fire('Copiado!', 'Link da sua área de cliente copiado.', 'success'));
        };

        const saveAppointment = async () => {
            const data = { ...tempApp, totalServices: totalServices.value, finalBalance: finalBalance.value, userId: user.value.uid, status: 'pending', isNewUpdate: false };
            if (isEditing.value) await updateDoc(doc(db, "appointments", editingId.value), data);
            else await addDoc(collection(db, "appointments"), data);
            showAppointmentModal.value = false; loadDashboardData();
        };

        const showReceipt = (app) => { 
            currentReceipt.value = sanitizeApp(app); 
            showReceiptModal.value = true; 
            if(app.isNewUpdate) updateDoc(doc(db, "appointments", app.id), { isNewUpdate: false });
        };

        const handleAuth = async () => {
            authLoading.value = true;
            try {
                if (isRegistering.value) {
                    const res = await createUserWithEmailAndPassword(auth, authForm.email, authForm.password);
                    await setDoc(doc(db, "users", res.user.uid), { companyConfig: { fantasia: authForm.name, email: authForm.email } });
                } else { await signInWithEmailAndPassword(auth, authForm.email, authForm.password); }
            } catch (e) { Swal.fire('Erro', 'Falha na autenticação.', 'error'); }
            finally { authLoading.value = false; }
        };

        return {
            user, view, isDark, authForm, authLoading, isRegistering, handleAuth, isGlobalLoading,
            dashboardMonth, financeData, next7DaysApps, kpiPendingReceivables,
            pendingAppointments, budgetList, services, showAppointmentModal, tempApp, isEditing,
            saveAppointment, showReceipt, currentReceipt, showReceiptModal, 
            loginMode, clientAccessInput, handleClientAccess, clientData, clientAppointments,
            clientApproveBudget, uploadPaymentProof, copyClientLink,
            company, formatCurrency, formatDate, getDay, getMonth, statusText, getClientName, maskPhone, maskCPF,
            logout: () => { signOut(auth); window.location.reload(); },
            toggleDarkMode: () => { isDark.value = !isDark.value; document.documentElement.classList.toggle('dark'); },
            startNewSchedule: () => { isEditing.value = false; Object.assign(tempApp, {clientId:'', date:'', time:'', location:{bairro:''}, details:{entryFee:0}, selectedServices:[]}); showAppointmentModal.value = true; }
        };
    }
}).mount('#app');
