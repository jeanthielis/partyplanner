const { createApp, ref, computed, reactive, onMounted, watch } = Vue;

import { 
    db, auth, 
    collection, addDoc, onSnapshot, doc, updateDoc, deleteDoc, getDocs, query, where, setDoc, getDoc, 
    signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged,
    updatePassword, reauthenticateWithCredential, EmailAuthProvider, updateProfile 
} from './firebase.js';

createApp({
    setup() {
        // ============================================================
        // 1. ESTADO (REFS & REACTIVE)
        // ============================================================
        
        // -- Sistema e Auth --
        const user = ref(null);
        const view = ref('dashboard');
        const isDark = ref(false);
        const authLoading = ref(false);
        const isRegistering = ref(false);
        const isGlobalLoading = ref(true); // <--- NOVO: Estado de carregamento global
        const authForm = reactive({ email: '', password: '', name: '' });
        
        // -- Configurações e Dados Mestres --
        const company = reactive({ fantasia: '', logo: '', cnpj: '', email: '', phone: '', rua: '', bairro: '', cidade: '', estado: '' });
        const dashboardMonth = ref(new Date().toISOString().slice(0, 7));
        const isLoadingDashboard = ref(false);
        
        // -- Listas de Dados (Arrays) --
        const services = ref([]);
        const pendingAppointments = ref([]);
        const budgetList = ref([]); // <--- NOVO: Lista de Orçamentos
        const historyList = ref([]);
        const expensesList = ref([]);
        const dashboardData = reactive({ appointments: [], expenses: [] });
        const catalogClientsList = ref([]);
        const scheduleClientsList = ref([]);
        
        // -- Cache e Controles --
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

        // -- Modais e Edição --
        const showAppointmentModal = ref(false);
        const showClientModal = ref(false);
        const showServiceModal = ref(false);
        const showExpenseModal = ref(false);
        const showReceiptModal = ref(false);
        const isEditing = ref(false);
        const editingId = ref(null);
        const editingExpenseId = ref(null);
        const currentReceipt = ref(null);

        // -- Objetos Temporários (Formulários) --
        const newClient = reactive({ name: '', phone: '', cpf: '', email: '' });
        const newService = reactive({ description: '', price: '' });
        const newExpense = reactive({ description: '', value: '', date: new Date().toISOString().split('T')[0], category: 'outros' });
        const tempServiceSelect = ref('');
        const tempApp = reactive({ clientId: '', date: '', time: '', location: { bairro: '' }, details: { entryFee: 0, balloonColors: '' }, notes: '', selectedServices: [], checklist: [] });

        // -- Área do Cliente --
        const loginMode = ref('provider'); 
        const clientAccessInput = ref('');
        const clientData = ref(null);
        const clientAppointments = ref([]);
        const showSignatureModal = ref(false);
        const signatureApp = ref(null);

        // -- Constantes --
        const expenseCategories = [
            { id: 'combustivel', label: 'Combustível', icon: 'fa-gas-pump' },
            { id: 'materiais', label: 'Materiais', icon: 'fa-box-open' },
            { id: 'equipe', label: 'Equipe', icon: 'fa-users' },
            { id: 'refeicao', label: 'Alimentação', icon: 'fa-utensils' },
            { id: 'marketing', label: 'Marketing', icon: 'fa-bullhorn' },
            { id: 'aluguel', label: 'Aluguel', icon: 'fa-house' },
            { id: 'outros', label: 'Outras', icon: 'fa-money-bill' }
        ];

        // ============================================================
        // MONITORAMENTO DE AUTH E INICIALIZAÇÃO
        // ============================================================
        onMounted(() => {
            onAuthStateChanged(auth, async (u) => {
                user.value = u;
                
                if (u) {
                    await loadDashboardData();
                    syncData();
                    
                    try {
                        const uDoc = await getDoc(doc(db, "users", u.uid));
                        if (uDoc.exists() && uDoc.data().companyConfig) {
                            Object.assign(company, uDoc.data().companyConfig);
                        }
                    } catch (e) {
                        console.error("Erro ao carregar perfil:", e);
                    }
                }

                // NOVO: Remove a tela de carregamento após verificar auth
                setTimeout(() => {
                    isGlobalLoading.value = false;
                }, 800);
            });
        });

        // ============================================================
        // 2. FUNÇÕES AUXILIARES (PURE FUNCTIONS)
        // ============================================================
        const toNum = (v) => { if(!v) return 0; if(typeof v==='number') return v; const c=String(v).replace(',','.').replace(/[^0-9.-]/g,''); return parseFloat(c)||0; };
        const formatCurrency = (v) => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(toNum(v));
        const formatDate = (d) => { if(!d) return ''; try{return d.split('-').reverse().join('/');}catch(e){return d;} };
        const getDay = (d) => d?d.split('-')[2]:'';
        const getMonth = (d) => d?['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'][parseInt(d.split('-')[1])-1]:'';
        const statusText = (s) => {
            if (s === 'budget') return 'Orçamento';
            return s==='concluded'?'Concluído':(s==='cancelled'?'Cancelado':'Pendente');
        };
        const getClientName = (id) => clientCache[id]?.name || 'Cliente Excluído';
        const getCategoryIcon = (id) => expenseCategories.find(c=>c.id===id)?.icon || 'fa-tag';
        
        const maskPhone = (v) => { if(!v) return ""; v=v.replace(/\D/g,""); v=v.replace(/^(\d{2})(\d)/g,"($1) $2"); v=v.replace(/(\d)(\d{4})$/,"$1-$2"); return v; };
        const maskCPF = (v) => { if(!v) return ""; v=v.replace(/\D/g,""); v=v.replace(/(\d{3})(\d)/,"$1.$2"); v=v.replace(/(\d{3})(\d)/,"$1.$2"); v=v.replace(/(\d{3})(\d{1,2})$/,"$1-$2"); return v; };

        // ============================================================
        // 3. COMPUTED PROPERTIES
        // ============================================================
        
        const statementList = computed(() => { 
            if (!isExtractLoaded.value) return []; 
            return expensesList.value.sort((a, b) => b.date.localeCompare(a.date)); 
        });
        
        const financeSummary = computed(() => statementList.value.reduce((acc, item) => item.type === 'income' ? acc + item.value : acc - item.value, 0));

        const totalServices = computed(() => tempApp.selectedServices.reduce((s,i) => s + toNum(i.price), 0));
        const finalBalance = computed(() => totalServices.value - toNum(tempApp.details.entryFee));
        
        // NOVO: Filtramos 'budget' para não contar no financeiro ainda
        const kpiRevenue = computed(() => dashboardData.appointments
            .filter(a => a.status !== 'budget') 
            .reduce((acc, a) => acc + toNum(a.totalServices), 0)
        );
        const kpiExpenses = computed(() => dashboardData.expenses.reduce((acc, e) => acc + toNum(e.value), 0));
        
        const financeData = computed(() => ({ 
            revenue: kpiRevenue.value, 
            expenses: kpiExpenses.value, 
            profit: kpiRevenue.value - kpiExpenses.value 
        }));
        
        const totalAppointmentsCount = computed(() => dashboardData.appointments.filter(a => a.status !== 'budget').length);
        
        const kpiPendingReceivables = computed(() => dashboardData.appointments
            .filter(a => a.status === 'pending')
            .reduce((acc, a) => acc + toNum(a.finalBalance), 0)
        );
        
        const expensesByCategoryStats = computed(() => { 
            if (!dashboardData.expenses.length) return []; 
            return expenseCategories.map(cat => { 
                const total = dashboardData.expenses.filter(e => e.category === cat.id).reduce((sum, e) => sum + toNum(e.value), 0); 
                return { ...cat, total }; 
            }).filter(c => c.total > 0).sort((a, b) => b.total - a.total); 
        });
        const topExpenseCategory = computed(() => expensesByCategoryStats.value[0] || null);

        const next7DaysApps = computed(() => {
            const today = new Date(); today.setHours(0,0,0,0);
            const nextWeek = new Date(today); nextWeek.setDate(today.getDate() + 7);
            const todayStr = today.toISOString().split('T')[0];
            const nextWeekStr = nextWeek.toISOString().split('T')[0];
            return pendingAppointments.value.filter(a => a.date >= todayStr && a.date <= nextWeekStr).sort((a,b) => a.date.localeCompare(b.date));
        });

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
        const calendarTitle = computed(() => `${['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'][calendarCursor.value.getMonth()]} ${calendarCursor.value.getFullYear()}`);
        
        const filteredListAppointments = computed(() => { 
            let list = agendaTab.value === 'pending' ? pendingAppointments.value : historyList.value;
            if(clientSearchTerm.value) list = list.filter(a => getClientName(a.clientId).toLowerCase().includes(clientSearchTerm.value.toLowerCase())); 
            return list.sort((a,b) => a.date.localeCompare(b.date)); 
        });
        
        const filteredClientsSearch = computed(() => scheduleClientsList.value);

        // ============================================================
        // 4. FUNÇÕES DE DADOS E LÓGICA (ASYNC)
        // ============================================================

        const fetchClientToCache = async (id) => {
            if (!id || clientCache[id]) return;
            try { const s = await getDoc(doc(db, "clients", id)); if (s.exists()) clientCache[id] = s.data(); else clientCache[id] = { name: 'Excluído', phone: '-' }; } catch (e) {}
        };

        const sanitizeApp = (docSnapshot) => {
            const data = docSnapshot.data ? docSnapshot.data() : docSnapshot;
            const safeServices = Array.isArray(data.selectedServices) ? data.selectedServices : [];
            let total = toNum(data.totalServices);
            if (total === 0 && safeServices.length > 0) total = safeServices.reduce((sum, item) => sum + toNum(item.price), 0);
            let entry = toNum(data.entryFee || data.details?.entryFee);
            let balance = toNum(data.finalBalance);
            if (balance === 0 && total > 0) balance = total - entry;
            return { id: docSnapshot.id || data.id, ...data, selectedServices: safeServices, totalServices: total, finalBalance: balance, entryFee: entry, checklist: data.checklist || [], details: { ...(data.details || {}), balloonColors: data.details?.balloonColors || '' }, notes: data.notes || '', clientSignature: data.clientSignature || '' };
        };
        const sanitizeExpense = (d) => { const data=d.data?d.data():d; return {id:d.id||data.id,...data,value:toNum(data.value)}; };

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

        const syncData = () => {
            const myId = user.value.uid;
            
            // Serviços
            onSnapshot(query(collection(db, "services"), where("userId", "==", myId)), (snap) => services.value = snap.docs.map(d => ({ id: d.id, ...d.data() })));
            
            // Agendamentos Pendentes
            onSnapshot(query(collection(db, "appointments"), where("userId", "==", myId), where("status", "==", "pending")), (snap) => {
                pendingAppointments.value = snap.docs.map(sanitizeApp);
                pendingAppointments.value.forEach(a => fetchClientToCache(a.clientId));
            });

            // NOVO: Orçamentos
            onSnapshot(query(collection(db, "appointments"), where("userId", "==", myId), where("status", "==", "budget")), (snap) => {
                budgetList.value = snap.docs.map(sanitizeApp);
                budgetList.value.forEach(a => fetchClientToCache(a.clientId));
            });
        };

        const searchExpenses = async () => {
            if(!expensesFilter.start || !expensesFilter.end) return Swal.fire('Data', 'Selecione o período', 'info');
            const qExp = query(collection(db, "expenses"), where("userId", "==", user.value.uid), where("date", ">=", expensesFilter.start), where("date", "<=", expensesFilter.end));
            const snapExp = await getDocs(qExp);
            const loadedExpenses = snapExp.docs.map(d => ({ ...sanitizeExpense(d), type: 'expense', icon: 'fa-arrow-down', color: 'text-red-500' }));
            
            // NOVO: Filtrar orçamento aqui também
            const qApp = query(collection(db, "appointments"), where("userId", "==", user.value.uid), where("date", ">=", expensesFilter.start), where("date", "<=", expensesFilter.end));
            const snapApp = await getDocs(qApp);
            const loadedIncome = snapApp.docs
                .map(d => sanitizeApp(d))
                .filter(a => a.status !== 'budget') // Ignora orçamentos no extrato
                .map(app => { return { id: app.id, date: app.date, value: app.totalServices, description: `Receita: ${getClientName(app.clientId)}`, type: 'income', icon: 'fa-arrow-up', color: 'text-green-500' }; });
            
            expensesList.value = [...loadedExpenses, ...loadedIncome]; isExtractLoaded.value = true;
        };

        const searchHistory = async () => {
            if(!agendaFilter.start || !agendaFilter.end) return Swal.fire('Atenção', 'Selecione datas', 'warning');
            const q = query(collection(db, "appointments"), where("userId", "==", user.value.uid), where("status", "==", agendaTab.value), where("date", ">=", agendaFilter.start), where("date", "<=", agendaFilter.end));
            const snap = await getDocs(q);
            historyList.value = snap.docs.map(sanitizeApp);
            historyList.value.forEach(a => fetchClientToCache(a.clientId));
        };

        const searchCatalogClients = async () => { 
            const q = query(collection(db, "clients"), where("userId", "==", user.value.uid)); 
            const snap = await getDocs(q); 
            catalogClientsList.value = snap.docs.map(d => ({id: d.id, ...d.data()})).filter(c => c.name.toLowerCase().includes(catalogClientSearch.value.toLowerCase())); 
        };

        // --- Lógica de Login e Cliente ---
        const handleAuth = async () => {
            if (!authForm.email || !authForm.password) return Swal.fire('Atenção', 'Preencha todos os campos.', 'warning');
            authLoading.value = true;
            try {
                if (isRegistering.value) {
                    const userCredential = await createUserWithEmailAndPassword(auth, authForm.email, authForm.password);
                    const newUser = userCredential.user;
                    await updateProfile(newUser, { displayName: authForm.name });
                    await setDoc(doc(db, "users", newUser.uid), { email: authForm.email, role: 'user', createdAt: new Date().toISOString(), companyConfig: { fantasia: authForm.name || 'Minha Empresa', logo: '', cnpj: '', email: authForm.email, phone: '', rua: '', bairro: '', cidade: '', estado: '' } });
                    await Swal.fire({ title: 'Sucesso!', text: 'Conta criada com sucesso!', icon: 'success', timer: 2000, showConfirmButton: false });
                } else {
                    await signInWithEmailAndPassword(auth, authForm.email, authForm.password);
                    const Toast = Swal.mixin({ toast: true, position: 'top-end', showConfirmButton: false, timer: 3000, timerProgressBar: true });
                    Toast.fire({ icon: 'success', title: 'Login realizado com sucesso' });
                }
            } catch (error) {
                console.error("Erro Auth:", error.code);
                Swal.fire('Ops!', 'Erro ao entrar. Verifique seus dados.', 'error');
            } finally { authLoading.value = false; }
        };

        const handleClientAccess = async () => {
            if (!clientAccessInput.value) return Swal.fire('Erro', 'Digite CPF ou E-mail', 'warning');
            authLoading.value = true;
            try {
                const rawTerm = clientAccessInput.value.trim();
                const numericTerm = rawTerm.replace(/\D/g, '');
                let formattedCPF = rawTerm;
                if (numericTerm.length === 11) formattedCPF = numericTerm.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");

                let q = query(collection(db, "clients"), where("cpf", "==", rawTerm));
                let snap = await getDocs(q);
                if (snap.empty && numericTerm.length === 11) { q = query(collection(db, "clients"), where("cpf", "==", formattedCPF)); snap = await getDocs(q); }
                if (snap.empty) { q = query(collection(db, "clients"), where("email", "==", rawTerm)); snap = await getDocs(q); }

                if (snap.empty) throw new Error("Cadastro não encontrado.");

                const clientDoc = snap.docs[0];
                clientData.value = { id: clientDoc.id, ...clientDoc.data() };

                const qApps = query(collection(db, "appointments"), where("clientId", "==", clientDoc.id));
                const snapApps = await getDocs(qApps);
                
                const apps = snapApps.docs.map(sanitizeApp).filter(a => a.status !== 'cancelled' && a.status !== 'budget').sort((a,b) => b.date.localeCompare(a.date));
                clientAppointments.value = apps;

                if (apps.length > 0) {
                    const providerId = apps[0].userId;
                    const uDoc = await getDoc(doc(db, "users", providerId));
                    if (uDoc.exists() && uDoc.data().companyConfig) {
                        Object.assign(company, uDoc.data().companyConfig);
                        clientCache[clientDoc.id] = clientDoc.data();
                    }
                }
                view.value = 'client-portal';
            } catch (e) {
                console.error(e);
                if(e.code === 'permission-denied') Swal.fire('Configuração', 'Erro de permissão nas regras do banco.', 'error');
                else Swal.fire('Acesso Negado', 'Dados não encontrados.', 'error');
            } finally { authLoading.value = false; }
        };

        // --- CRUDs Principais ---
        const saveAppointment = async () => { 
            const appData = { ...JSON.parse(JSON.stringify(tempApp)), totalServices: totalServices.value, finalBalance: finalBalance.value, userId: user.value.uid, status: 'pending' }; 
            if(!appData.checklist.length) appData.checklist = [{text:'Materiais', done:false}]; 
            if (isEditing.value) await updateDoc(doc(db, "appointments", editingId.value), appData); 
            else await addDoc(collection(db, "appointments"), appData); 
            
            loadDashboardData(); showAppointmentModal.value = false; Swal.fire('Agendado!', '', 'success'); 
        };

        // NOVO: Função para salvar Orçamento
        const saveAsBudget = async () => {
            const appData = { 
                ...JSON.parse(JSON.stringify(tempApp)), 
                totalServices: totalServices.value, 
                finalBalance: finalBalance.value, 
                userId: user.value.uid, 
                status: 'budget' 
            }; 
            
            if(!appData.checklist.length) appData.checklist = [{text:'Materiais', done:false}];
            
            if (isEditing.value && editingId.value) {
                await updateDoc(doc(db, "appointments", editingId.value), appData);
            } else {
                await addDoc(collection(db, "appointments"), appData);
            }
            
            showAppointmentModal.value = false;
            Swal.fire('Orçamento Criado!', 'Você pode aprová-lo na aba Orçamentos.', 'success');
        };

        // NOVO: Aprovar Orçamento (Virar Venda)
        const approveBudget = async (app) => {
            const { isConfirmed } = await Swal.fire({
                title: 'Aprovar Orçamento?',
                text: 'Isso moverá o item para a Agenda e contará no Financeiro.',
                icon: 'question',
                showCancelButton: true,
                confirmButtonColor: '#4F46E5',
                confirmButtonText: 'Sim, Aprovar'
            });

            if (isConfirmed) {
                await updateDoc(doc(db, "appointments", app.id), { status: 'pending' });
                Swal.fire('Aprovado!', 'Evento agendado com sucesso.', 'success');
                view.value = 'schedule'; // Leva o usuário para a agenda
            }
        };

        const saveClient = async () => { if(!newClient.name) return; await addDoc(collection(db, "clients"), { name: newClient.name, phone: newClient.phone, cpf: newClient.cpf, email: newClient.email, userId: user.value.uid }); showClientModal.value = false; newClient.name = ''; newClient.phone = ''; newClient.cpf = ''; newClient.email = ''; if(view.value === 'registrations') searchCatalogClients(); Swal.fire('Salvo!', '', 'success'); };
        const saveService = async () => { if(!newService.description || !newService.price) return; await addDoc(collection(db, "services"), { description: newService.description, price: toNum(newService.price), userId: user.value.uid }); newService.description = ''; newService.price = ''; showServiceModal.value = false; };
        const saveExpenseLogic = async () => { const data = { ...newExpense, value: toNum(newExpense.value), userId: user.value.uid }; if (editingExpenseId.value) { await updateDoc(doc(db, "expenses", editingExpenseId.value), data); } else { await addDoc(collection(db, "expenses"), data); } showExpenseModal.value = false; Swal.fire('Salvo','','success'); if (expensesFilter.start && expensesFilter.end) searchExpenses(); loadDashboardData(); };
        const saveCompany = () => { updateDoc(doc(db, "users", user.value.uid), { companyConfig: company }); Swal.fire('Salvo', '', 'success'); };

        const deleteClient = async (id) => { if((await Swal.fire({title:'Excluir?',showCancelButton:true})).isConfirmed) { await deleteDoc(doc(db,"clients",id)); searchCatalogClients(); }};
        const deleteService = async (id) => { await deleteDoc(doc(db, "services", id)); };
        const deleteExpense = async (id) => { const { isConfirmed } = await Swal.fire({ title: 'Excluir?', text: 'Essa ação não pode ser desfeita.', icon: 'warning', showCancelButton: true, confirmButtonColor: '#d33' }); if (isConfirmed) { await deleteDoc(doc(db, "expenses", id)); if (expensesFilter.start && expensesFilter.end) searchExpenses(); loadDashboardData(); Swal.fire('Excluído!', '', 'success'); } };
        const changeStatus = async (app, status) => { const action = status === 'concluded' ? 'Concluir' : 'Cancelar'; const {isConfirmed} = await Swal.fire({title: action + '?', text: 'Deseja alterar o status?', icon:'question', showCancelButton:true}); if(isConfirmed) { await updateDoc(doc(db,"appointments",app.id), {status:status}); Swal.fire('Feito','','success'); loadDashboardData(); } };

        // --- Assinatura (Canvas) ---
        let canvasContext = null; let isDrawing = false;
        const openSignatureModal = (app) => { signatureApp.value = app; showSignatureModal.value = true; setTimeout(() => initCanvas(), 100); };
        const initCanvas = () => { const canvas = document.getElementById('signature-pad'); if(!canvas) return; const ratio = Math.max(window.devicePixelRatio || 1, 1); canvas.width = canvas.offsetWidth * ratio; canvas.height = canvas.offsetHeight * ratio; canvas.getContext("2d").scale(ratio, ratio); canvasContext = canvas.getContext('2d'); canvasContext.strokeStyle = "#000"; canvasContext.lineWidth = 2; canvas.addEventListener('mousedown', startDrawing); canvas.addEventListener('mousemove', draw); canvas.addEventListener('mouseup', stopDrawing); canvas.addEventListener('mouseout', stopDrawing); canvas.addEventListener('touchstart', (e) => { e.preventDefault(); startDrawing(e.touches[0]); }); canvas.addEventListener('touchmove', (e) => { e.preventDefault(); draw(e.touches[0]); }); canvas.addEventListener('touchend', (e) => { e.preventDefault(); stopDrawing(); }); };
        const getPos = (e) => { const canvas = document.getElementById('signature-pad'); const rect = canvas.getBoundingClientRect(); return { x: e.clientX - rect.left, y: e.clientY - rect.top }; };
        const startDrawing = (e) => { isDrawing = true; const pos = getPos(e); canvasContext.beginPath(); canvasContext.moveTo(pos.x, pos.y); };
        const draw = (e) => { if(!isDrawing) return; const pos = getPos(e); canvasContext.lineTo(pos.x, pos.y); canvasContext.stroke(); };
        const stopDrawing = () => { isDrawing = false; };
        const clearSignature = () => { const canvas = document.getElementById('signature-pad'); canvasContext.clearRect(0, 0, canvas.width, canvas.height); };
        const isCanvasBlank = (canvas) => !new Uint32Array(canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data.buffer).some(c=>c!==0);
        
        const saveSignature = async () => { 
            const canvas = document.getElementById('signature-pad'); 
            if (isCanvasBlank(canvas)) return Swal.fire('Ops', 'Assine antes de salvar.', 'warning'); 
            const dataUrl = canvas.toDataURL(); 
            authLoading.value = true; 
            try { 
                await updateDoc(doc(db, "appointments", signatureApp.value.id), { clientSignature: dataUrl }); 
                const idx = clientAppointments.value.findIndex(a => a.id === signatureApp.value.id); 
                if(idx !== -1) clientAppointments.value[idx].clientSignature = dataUrl; 
                showSignatureModal.value = false; 
                Swal.fire('Sucesso', 'Assinado!', 'success'); 
            } catch (e) { console.error(e); Swal.fire('Erro', 'Não foi possível salvar.', 'error'); } finally { authLoading.value = false; } 
        };

        // --- Geração de PDF e Outros ---
        const showReceipt = (app) => { currentReceipt.value = sanitizeApp(app); showReceiptModal.value = true; };
        const downloadClientReceipt = async (app) => { currentReceipt.value = app; if(!clientCache[app.clientId] && clientData.value) { clientCache[app.clientId] = clientData.value; } generateContractPDF(); };
        
        const generateContractPDF = () => { 
            const { jsPDF } = window.jspdf; const doc = new jsPDF(); const app = currentReceipt.value; const cli = clientCache[app.clientId] || {name:'...',cpf:'...', phone: '', email: ''};
            
            // Título dinâmico (Contrato ou Orçamento)
            let docTitle = "CONTRATO DE PRESTAÇÃO DE SERVIÇOS";
            if(app.status === 'budget') docTitle = "ORÇAMENTO";

            doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.text(company.fantasia.toUpperCase(), 105, 20, {align: "center"});
            doc.setFontSize(10); doc.setFont("helvetica", "normal"); let headerY = 26;
            if (company.cnpj) { doc.text(`CNPJ: ${company.cnpj}`, 105, headerY, {align: "center"}); headerY += 5; }
            doc.text(`${company.rua} - ${company.bairro}`, 105, headerY, {align: "center"}); headerY += 5; doc.text(`${company.cidade}/${company.estado} - Tel: ${company.phone}`, 105, headerY, {align: "center"});
            doc.line(20, headerY + 5, 190, headerY + 5); doc.setFontSize(14); doc.setFont("helvetica", "bold"); doc.text(docTitle, 105, headerY + 15, {align:"center"});
            let y = headerY + 25; doc.setFontSize(10); doc.setFont("helvetica", "bold"); doc.text("CONTRATANTE:", 20, y); y += 5; doc.setFont("helvetica", "normal"); doc.text(`Nome: ${cli.name} | CPF: ${cli.cpf || '-'}`, 20, y); y += 5; doc.text(`Tel: ${cli.phone} | E-mail: ${cli.email || '-'}`, 20, y);
            y += 10; doc.setFont("helvetica", "bold"); doc.text("EVENTO:", 20, y); y += 5; doc.setFont("helvetica", "normal"); doc.text(`Data: ${formatDate(app.date)} | Hora: ${app.time}`, 20, y); y += 5; doc.text(`Local: ${app.location.bairro}`, 20, y); if(app.details.balloonColors) { y += 5; doc.text(`Cores: ${app.details.balloonColors}`, 20, y); }
            y += 10; const body = app.selectedServices.map(s => [s.description, formatCurrency(s.price)]); doc.autoTable({ startY: y, head: [['Descrição', 'Valor']], body: body, theme: 'grid', headStyles: { fillColor: [60, 60, 60] }, margin: { left: 20, right: 20 } });
            y = doc.lastAutoTable.finalY + 10; doc.setFont("helvetica", "bold"); doc.text(`TOTAL: ${formatCurrency(app.totalServices)}`, 140, y, {align: "right"}); y += 5; doc.text(`SINAL: ${formatCurrency(app.entryFee)}`, 140, y, {align: "right"}); y += 5; doc.text(`RESTANTE: ${formatCurrency(app.finalBalance)}`, 140, y, {align: "right"});
            
            if (app.status !== 'budget') {
                y += 15; doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.text("CLÁUSULAS E CONDIÇÕES:", 20, y); y += 5; doc.setFont("helvetica", "normal");
                const clauses = [ "1. RESERVA: O pagamento do sinal garante a reserva da data.", "2. DESISTÊNCIA: Em caso de cancelamento com menos de 15 dias, o sinal não será devolvido.", "3. DANOS: O CONTRATANTE responsabiliza-se pela conservação dos materiais.", "4. PAGAMENTO: O restante deve ser pago até a data do evento.", "5. MONTAGEM: O local deve estar liberado no horário combinado." ];
                clauses.forEach(clause => { const lines = doc.splitTextToSize(clause, 170); doc.text(lines, 20, y); y += (lines.length * 4) + 2; if (y > 230) { doc.addPage(); y = 20; } });
                if (y > 230) { doc.addPage(); y = 40; } else { y += 20; }
                if (app.clientSignature) { doc.addImage(app.clientSignature, 'PNG', 115, y - 15, 60, 20); }
                doc.line(20, y, 90, y); doc.line(110, y, 180, y); doc.text("CONTRATADA", 55, y + 5, {align: "center"}); doc.text("CONTRATANTE", 145, y + 5, {align: "center"}); 
            } else {
                y += 20; doc.setFontSize(8); doc.text("* Este documento é apenas um orçamento e não garante a reserva da data.", 105, y, {align: "center"});
            }

            doc.save(`Doc_${cli.name.replace(/ /g, '_')}.pdf`);
        };

        // --- Helpers de Interface ---
        const startNewSchedule = () => { isEditing.value=false; Object.assign(tempApp, { clientId:'', date:'', time:'', location:{bairro:''}, details:{entryFee:0, balloonColors:''}, notes: '', selectedServices:[], checklist:[] }); clientSearchTerm.value = ''; showAppointmentModal.value=true; };
        const editAppointment = (app) => { isEditing.value=true; editingId.value=app.id; Object.assign(tempApp, JSON.parse(JSON.stringify(app))); clientSearchTerm.value = getClientName(app.clientId); showAppointmentModal.value=true; };
        const openNewExpense = () => { editingExpenseId.value = null; Object.assign(newExpense, { description: '', value: '', date: new Date().toISOString().split('T')[0], category: 'outros' }); showExpenseModal.value = true; };
        const openEditExpense = (expense) => { editingExpenseId.value = expense.id; Object.assign(newExpense, { description: expense.description, value: expense.value, date: expense.date, category: expense.category }); showExpenseModal.value = true; };
        const openClientModal = () => { showClientModal.value = true; };
        
        const logoutClient = () => { clientData.value = null; clientAppointments.value = []; clientAccessInput.value = ''; view.value = 'dashboard'; loginMode.value = 'provider'; };
        const logout = () => { signOut(auth); window.location.href="index.html"; };
        const downloadReceiptImage = () => { html2canvas(document.getElementById('receipt-capture-area')).then(c => { const l = document.createElement('a'); l.download = 'Recibo.png'; l.href = c.toDataURL(); l.click(); }); };
        const openWhatsApp = (app) => { const cli = clientCache[app.clientId]; if (!cli || !cli.phone) return Swal.fire('Erro', 'Cliente sem telefone cadastrado.', 'error'); const phoneClean = cli.phone.replace(/\D/g, ''); const msg = `Olá ${cli.name}, aqui é da ${company.fantasia}. Segue o comprovante do seu agendamento para o dia ${formatDate(app.date)}.`; window.open(`https://wa.me/55${phoneClean}?text=${encodeURIComponent(msg)}`, '_blank'); };
        const openWhatsAppSupport = () => { window.open('https://wa.me/?text=Preciso%20de%20ajuda%20com%20meu%20evento', '_blank'); };
        const handleLogoUpload = (e) => { const f = e.target.files[0]; if(f){ const r=new FileReader(); r.onload=x=>{company.logo=x.target.result; updateDoc(doc(db,"users",user.value.uid),{companyConfig:company});}; r.readAsDataURL(f); }};
        const toggleDarkMode = () => { isDark.value=!isDark.value; document.documentElement.classList.toggle('dark'); };
        const copyClientLink = () => { const url = `${window.location.origin}${window.location.pathname}?acesso=cliente`; navigator.clipboard.writeText(url).then(() => Swal.fire('Copiado!', 'Link copiado.', 'success')); };
        const changeCalendarMonth = (off) => { const d = new Date(calendarCursor.value); d.setMonth(d.getMonth() + off); calendarCursor.value = d; };
        const selectCalendarDay = (d) => { if(d.day) selectedCalendarDate.value = d.date; };
        
        const addServiceToApp = () => { if(tempServiceSelect.value) tempApp.selectedServices.push(tempServiceSelect.value); tempServiceSelect.value=''; };
        const removeServiceFromApp = (i) => tempApp.selectedServices.splice(i,1);

        // --- Watchers para Autocomplete ---
        watch(dashboardMonth, () => loadDashboardData());
        watch(clientSearchTerm, async (val) => { if (isSelectingClient.value) return; if (val && val.length > 2) { const q = query(collection(db, "clients"), where("userId", "==", user.value.uid)); const snap = await getDocs(q); scheduleClientsList.value = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(c => c.name.toLowerCase().includes(val.toLowerCase())); } else { scheduleClientsList.value = []; } });
        const selectClient = (client) => { isSelectingClient.value = true; tempApp.clientId = client.id; clientSearchTerm.value = client.name; scheduleClientsList.value = []; setTimeout(() => { isSelectingClient.value = false; }, 500); };

        return {
            user, view, isDark, authForm, authLoading, isRegistering, handleAuth, logout, isGlobalLoading,
            dashboardMonth, financeData, next7DaysApps, statementList, isExtractLoaded, financeSummary, expensesFilter, searchExpenses,
            showExpenseModal, newExpense, 
            addExpense: saveExpenseLogic, saveExpenseLogic, openNewExpense, openEditExpense, deleteExpense, editingExpenseId,
            startNewSchedule, editAppointment, saveAppointment, showAppointmentModal, showClientModal, showServiceModal, newService, saveService, deleteService,
            newClient, saveClient, 
            tempApp, tempServiceSelect, services, totalServices, finalBalance, isEditing, clientSearchTerm, filteredClientsSearch, selectClient,
            addServiceToApp, removeServiceFromApp,
            appointmentViewMode, calendarGrid, calendarTitle, changeCalendarMonth, selectCalendarDay, selectedCalendarDate, appointmentsOnSelectedDate, filteredListAppointments,
            catalogClientsList, catalogClientSearch, searchCatalogClients, openClientModal, deleteClient,
            currentReceipt, showReceipt, showReceiptModal,
            company, handleLogoUpload, saveCompany, downloadReceiptImage, 
            generateContractPDF, openWhatsApp, 
            formatCurrency, formatDate, getDay, getMonth, statusText, getClientName, 
            toggleDarkMode, expenseCategories, expensesByCategoryStats,
            agendaTab, agendaFilter, searchHistory, changeStatus,
            registrationTab,
            kpiPendingReceivables, totalAppointmentsCount, topExpenseCategory, getCategoryIcon,
            maskPhone, maskCPF,
            loginMode, clientAccessInput, handleClientAccess, clientData, clientAppointments, logoutClient, openWhatsAppSupport, downloadClientReceipt,
            showSignatureModal, openSignatureModal, clearSignature, saveSignature, copyClientLink,
            budgetList, saveAsBudget, approveBudget // NOVO: Exportar para o template
        };
    }
}).mount('#app');
