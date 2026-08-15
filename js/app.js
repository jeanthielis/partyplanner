const { createApp, ref, computed, reactive, onMounted, watch } = Vue;

import { 
    db, auth, functions,
    collection, addDoc, onSnapshot, doc, updateDoc, deleteDoc, getDocs, query, where, setDoc, getDoc, orderBy, limit,
    signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged,
    httpsCallable
} from './firebase.js';

createApp({
    setup() {
        // ============================================================
        // 1. ESTADO GLOBAL
        // ============================================================
        const user = ref(null);
        const view = ref('dashboard');
        const isDark = ref(false);
        const authLoading = ref(false);
        const isRegistering = ref(false);
        const isGlobalLoading = ref(true);
        const authForm = reactive({ email: '', password: '', name: '' });
        
        // Empresa
        const company = reactive({ fantasia: '', logo: '', signature: '', cnpj: '', email: '', phone: '', rua: '', bairro: '', cidade: '', estado: '', emailjs_service_id: '', emailjs_template_id: '', emailjs_public_key: '', primaryColor: '#4F46E5', contractClauses: '', pixKey: '' });

        // Ranking de clientes
        const clientRankingData = ref([]);
        const clientRankingLoading = ref(false);

        // Comparativo mensal
        const monthlyChartData = ref([]);
        const monthlyChartLoading = ref(false);

        // Histórico do cliente
        const showClientHistoryModal = ref(false);
        const clientHistoryData = ref(null);
        const clientHistoryApps = ref([]);
        const clientHistoryLoading = ref(false);

        // Checklist
        const newChecklistItem = ref('');

        // Cor do tema
        const applyThemeColor = (color) => {
            if (!color) return;
            document.documentElement.style.setProperty('--brand-600', color);
            const r = parseInt(color.slice(1,3),16), g = parseInt(color.slice(3,5),16), b = parseInt(color.slice(5,7),16);
            document.documentElement.style.setProperty('--brand-500', `rgb(${Math.min(r+20,255)},${Math.min(g+20,255)},${Math.min(b+20,255)})`);
        };

        // Dados
        const dashboardMonth = ref(new Date().toISOString().slice(0, 7));
        const isLoadingDashboard = ref(false);
        const services = ref([]);
        const showServiceInfoModal = ref(false);
        const serviceInfo = ref(null);
        const openServiceInfo = (s) => { serviceInfo.value = s; showServiceInfoModal.value = true; };
        // Modais de picker (serviços) e balões/checklist — mantêm a tela de agendamento clean
        const showServicePickerModal = ref(false);
        const showBalloonModal = ref(false);
        const pendingAppointments = ref([]);
        const budgetList = ref([]); 
        const historyList = ref([]); 
        const expensesList = ref([]); 
        const dashboardData = reactive({ appointments: [], expenses: [] });
        const catalogClientsList = ref([]);
        const scheduleClientsList = ref([]);
        const clientCache = reactive({});
        const isExtractLoaded = ref(false); 
        
        // Estado Financeiro (Abas)
        const financeTab = ref('extract');

        // Filtros
        const dateNow = new Date();
        const firstDay = new Date(dateNow.getFullYear(), dateNow.getMonth(), 1).toISOString().split('T')[0];
        const today = dateNow.toISOString().split('T')[0];
        
        const expensesFilter = reactive({ start: firstDay, end: today });
        const agendaFilter = reactive({ start: firstDay, end: today });
        
        const clientSearchTerm = ref('');
        const isSelectingClient = ref(false);
        const selectedClientNameLock = ref('');
        const catalogClientSearch = ref('');
        const catalogClientsDisplayList = ref([]);
        const catalogSearched = ref(false);
        const clientFilter = reactive({ name: '', cpf: '', email: '', eventDateStart: '', eventDateEnd: '' });

        const serviceSearch = ref('');
        const serviceMaxPrice = ref('');
        const servicesDisplayList = ref([]);
        const servicesSearched = ref(false);
        const appointmentViewMode = ref('list');
        const calendarCursor = ref(new Date());
        const selectedCalendarDate = ref(null);
        const registrationTab = ref('clients');

        // ─── INVENTÁRIO / ACERVO ──────────────────────────────
        const showInventoryModal = ref(false);
        const editingInventoryId = ref(null);
        const inventoryCatFilter = ref('all');
        const inventoryItems = ref([]);
        const newInventory = reactive({ name: '', category: '', qty: 0, notes: '' });
        const inventoryCategories = [
            { k:'all',    label:'Todos',     icon:'🗂️' },
            { k:'baloes', label:'Balões',    icon:'🎈' },
            { k:'flores', label:'Flores',    icon:'🌸' },
            { k:'tecidos',label:'Tecidos',   icon:'🎀' },
            { k:'mesas',  label:'Mesas',     icon:'🪑' },
            { k:'luzes',  label:'Iluminação',icon:'💡' },
            { k:'outros', label:'Outros',    icon:'📦' },
        ];
        const inventoryFiltered = computed(() => {
            if (inventoryCatFilter.value === 'all') return inventoryItems.value;
            const catLabel = inventoryCategories.find(c => c.k === inventoryCatFilter.value)?.label;
            return inventoryItems.value.filter(i => i.category === catLabel);
        });
        const getCatIcon = (cat) => {
            const found = inventoryCategories.find(c => c.label === cat);
            return found ? found.icon : '📦';
        };
        const getCatColor = (cat) => {
            const map = { 'Balões':'rgba(59,130,246,0.12)', 'Flores':'rgba(236,72,153,0.12)', 'Tecidos':'rgba(168,85,247,0.12)', 'Mesas':'rgba(245,158,11,0.12)', 'Iluminação':'rgba(234,179,8,0.12)' };
            return map[cat] || 'rgba(255,92,53,0.08)';
        };

        // Moodboard helpers
        const moodboardSearch = ref('');
        const moodboardFiltered = computed(() => {
            if (!moodboardSearch.value.trim()) return services.value;
            const t = moodboardSearch.value.toLowerCase();
            return services.value.filter(s => s.description.toLowerCase().includes(t));
        });
        const getMoodboardIcon = (desc) => {
            const d = desc.toLowerCase();
            if (d.includes('balo') || d.includes('balloon'))   return '🎈';
            if (d.includes('flor') || d.includes('bouquet'))   return '🌸';
            if (d.includes('mesa') || d.includes('table'))     return '🪑';
            if (d.includes('luz') || d.includes('light'))      return '✨';
            if (d.includes('topo') || d.includes('topper'))    return '🎂';
            if (d.includes('painel') || d.includes('banner'))  return '🖼️';
            if (d.includes('vela') || d.includes('candle'))    return '🕯️';
            if (d.includes('arco') || d.includes('arch'))      return '🌈';
            if (d.includes('foto') || d.includes('photo'))     return '📸';
            if (d.includes('musi') || d.includes('som'))       return '🎵';
            return '🎉';
        };
        const isServiceSelected = (s) => tempApp.selectedServices.some(x => x.description === s.description);
        const toggleMoodboardService = (s) => {
            const idx = tempApp.selectedServices.findIndex(x => x.description === s.description);
            if (idx >= 0) {
                tempApp.selectedServices.splice(idx, 1);
            } else {
                tempApp.selectedServices.push({ description: s.description, price: s.price, qty: 1 });
            }
        };
        const agendaTab = ref('pending');

        // Modais
        const showAppointmentModal = ref(false);
        const showClientModal = ref(false);
        const showServiceModal = ref(false);
        const showExpenseModal = ref(false);
        const showReceiptModal = ref(false);
        const isEditing = ref(false);
        const editingId = ref(null);
        const editingExpenseId = ref(null);
        const currentReceipt = ref(null);

        // Meta mensal
        const monthlyGoal = ref(0);
        const showGoalModal = ref(false);
        const tempGoal = ref('');

        // Auditoria
        const auditLog = ref([]);
        const showAuditModal = ref(false);

        // EmailJS
        const showEmailJSModal = ref(false);
        const showSignatureModal = ref(false);
        const signatureApp = ref(null);
        const signatureMode = ref('company');

        // Forms
        const newClient = reactive({ name: '', phone: '', cpf: '', email: '', consent: false });
        const editingClientId = ref(null);
        const newService = reactive({ description: '', price: '', photo: '' });
        const newExpense = reactive({ description: '', value: '', date: today, category: 'outros', appointmentId: '' });
        const tempServiceSelect = ref('');
        const tempApp = reactive({ clientId: '', date: '', time: '', location: { bairro: '' }, details: { entryFee: 0, balloonColors: '' }, discount: 0, notes: '', internalNotes: '', installments: 1, selectedServices: [], checklist: [] });

        const expenseCategories = [
            { id: 'combustivel', label: 'Combustível', icon: 'fa-gas-pump', color: 'text-orange-500', bg: 'bg-orange-100' },
            { id: 'materiais', label: 'Materiais', icon: 'fa-box-open', color: 'text-blue-500', bg: 'bg-blue-100' },
            { id: 'equipe', label: 'Equipe', icon: 'fa-users', color: 'text-purple-500', bg: 'bg-purple-100' },
            { id: 'refeicao', label: 'Alimentação', icon: 'fa-utensils', color: 'text-red-500', bg: 'bg-red-100' },
            { id: 'marketing', label: 'Marketing', icon: 'fa-bullhorn', color: 'text-pink-500', bg: 'bg-pink-100' },
            { id: 'aluguel', label: 'Aluguel', icon: 'fa-house', color: 'text-indigo-500', bg: 'bg-indigo-100' },
            { id: 'outros', label: 'Outras', icon: 'fa-money-bill', color: 'text-slate-500', bg: 'bg-slate-100' }
        ];

        // --- INICIALIZAÇÃO ---
        onMounted(async () => {
            // Segurança: libera o loading após 8s mesmo que algo falhe silenciosamente
            const safetyTimer = setTimeout(() => {
                if (isGlobalLoading.value) {
                    console.warn("PartyPlanner: timeout de segurança atingido, liberando loading.");
                    isGlobalLoading.value = false;
                }
            }, 8000);

            onAuthStateChanged(auth, async (u) => {
                try {
                    user.value = u;
                    if (u) {
                        if (u.isAnonymous) { isGlobalLoading.value = false; return; }
                        await loadDashboardData();
                        searchExpenses();
                        syncData();
                        const uDoc = await getDoc(doc(db, "users", u.uid));
                        if (uDoc.exists() && uDoc.data().companyConfig) {
                    if (uDoc.exists()) weeklyReportOptOut.value = uDoc.data().weeklyReportOptOut === true;
                            Object.assign(company, uDoc.data().companyConfig);
                            applyThemeColor(company.primaryColor);
                        }
                        if (uDoc.exists() && uDoc.data().monthlyGoal) monthlyGoal.value = uDoc.data().monthlyGoal;
                    }
                } catch(e) {
                    console.error("PartyPlanner: erro na inicialização:", e);
                } finally {
                    clearTimeout(safetyTimer);
                    setTimeout(() => { isGlobalLoading.value = false; }, 800);
                }
            });
        });

        // --- COMPUTEDS & HELPERS ---
        const toNum = (v) => { if(!v) return 0; if(typeof v==='number') return v; const c=String(v).replace(',','.').replace(/[^0-9.-]/g,''); return parseFloat(c)||0; };
        const formatCurrency = (v) => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(toNum(v));
        const formatDate = (d) => { if(!d) return ''; try{return d.split('-').reverse().join('/');}catch(e){return d;} };
        const getDay = (d) => d?d.split('-')[2]:'';
        const getMonth = (d) => d?['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'][parseInt(d.split('-')[1])-1]:'';
        const statusText = (s) => s === 'budget' ? 'Orçamento' : (s==='concluded'?'Concluído':(s==='cancelled'?'Cancelado':'Pendente'));
        const getClientName = (id) => clientCache[id]?.name || 'Cliente';
        const getCategoryIcon = (id) => expenseCategories.find(c=>c.id===id)?.icon || 'fa-tag';
        // Normaliza telefone: remove +55 / 55 colado do WhatsApp, mantém DDD + número
        const normalizePhoneDigits = (raw) => {
            let d = (raw || "").replace(/\D/g, "");
            // Remove DDI 55 quando o número tem 12–13 dígitos (55 + DDD + 8/9 dígitos)
            if (d.startsWith("55") && d.length >= 12) d = d.slice(2);
            return d.slice(0, 11); // DDD (2) + até 9 dígitos
        };
        const maskPhone = (v) => {
            let d = normalizePhoneDigits(v);
            if (!d) return "";
            if (d.length <= 2) return "(" + d;
            if (d.length <= 6) return "(" + d.slice(0,2) + ") " + d.slice(2);
            if (d.length <= 10) return "(" + d.slice(0,2) + ") " + d.slice(2,6) + "-" + d.slice(6);
            return "(" + d.slice(0,2) + ") " + d.slice(2,7) + "-" + d.slice(7);
        };
        const maskCPF = (v) => { if(!v) return ""; v=v.replace(/\D/g,"").replace(/(\d{3})(\d)/,"$1.$2").replace(/(\d{3})(\d)/,"$1.$2").replace(/(\d{3})(\d{1,2})$/,"$1-$2"); return v; };

        const statementList = computed(() => { 
            if (!isExtractLoaded.value) return []; 
            return expensesList.value.sort((a, b) => b.date.localeCompare(a.date)); 
        });

        const filteredSummary = computed(() => {
            const list = statementList.value;
            const income = list.filter(i => i.type === 'income').reduce((acc, i) => acc + toNum(i.value), 0);
            const expense = list.filter(i => i.type === 'expense').reduce((acc, i) => acc + toNum(i.value), 0);
            return { income, expense, balance: income - expense };
        });

        const rankingData = computed(() => {
            const expensesOnly = statementList.value.filter(i => i.type === 'expense');
            const totalExp = expensesOnly.reduce((acc, i) => acc + toNum(i.value), 0);
            const grouped = {};
            expensesOnly.forEach(e => { if(!grouped[e.category]) grouped[e.category] = 0; grouped[e.category] += toNum(e.value); });
            return Object.keys(grouped).map(catId => {
                const catDef = expenseCategories.find(c => c.id === catId) || { label: 'Outros', icon: 'fa-tag', color: 'text-gray-500', bg: 'bg-gray-100' };
                const value = grouped[catId];
                const percent = totalExp > 0 ? (value / totalExp) * 100 : 0;
                return { id: catId, label: catDef.label, icon: catDef.icon, styleClass: catDef.color, bgClass: catDef.bg || 'bg-gray-100', value: value, percent: percent.toFixed(1) };
            }).sort((a, b) => b.value - a.value);
        });

        const servicesSubtotal = computed(() => tempApp.selectedServices.reduce((s,i) => s + toNum(i.price) * (toNum(i.qty) || 1), 0));
        const totalServices = computed(() => Math.max(0, servicesSubtotal.value - toNum(tempApp.details?.discount || tempApp.discount)));
        const finalBalance = computed(() => totalServices.value - toNum(tempApp.details.entryFee));
        const kpiRevenue = computed(() => dashboardData.appointments.filter(a => a.status !== 'budget').reduce((acc, a) => acc + toNum(a.totalServices), 0));
        const kpiExpenses = computed(() => dashboardData.expenses.reduce((acc, e) => acc + toNum(e.value), 0));
        const financeData = computed(() => ({ revenue: kpiRevenue.value, expenses: kpiExpenses.value, profit: kpiRevenue.value - kpiExpenses.value }));
        const kpiPendingReceivables = computed(() => dashboardData.appointments.filter(a => a.status === 'pending').reduce((acc, a) => acc + toNum(a.finalBalance), 0));
        const totalAppointmentsCount = computed(() => dashboardData.appointments.filter(a => a.status !== 'budget').length);
        const expensesByCategoryStats = computed(() => { if (!dashboardData.expenses.length) return []; return expenseCategories.map(cat => { const total = dashboardData.expenses.filter(e => e.category === cat.id).reduce((sum, e) => sum + toNum(e.value), 0); return { ...cat, total }; }).filter(c => c.total > 0).sort((a, b) => b.total - a.total); });
        const topExpenseCategory = computed(() => expensesByCategoryStats.value[0] || null);

        // Eventos urgentes (próximos 3 dias)
        const urgentEvents = computed(() => {
            const now = new Date(); now.setHours(0,0,0,0);
            const in3 = new Date(now); in3.setDate(now.getDate() + 3);
            const todayStr = now.toISOString().split('T')[0];
            const in3Str = in3.toISOString().split('T')[0];
            return pendingAppointments.value.filter(a => a.date >= todayStr && a.date <= in3Str);
        });

        // Eventos com saldo em atraso (data passou e ainda tem saldo a pagar)
        const overdueEvents = computed(() => {
            const todayStr = new Date().toISOString().split('T')[0];
            return pendingAppointments.value.filter(a => a.date < todayStr && toNum(a.finalBalance) > 0);
        });

        // Progresso da meta mensal
        const goalProgress = computed(() => {
            if (!monthlyGoal.value || monthlyGoal.value <= 0) return 0;
            return Math.min((kpiRevenue.value / monthlyGoal.value) * 100, 100).toFixed(1);
        });

        // Parcela valor
        const installmentValue = computed(() => {
            const n = parseInt(tempApp.installments) || 1;
            return n > 0 ? finalBalance.value / n : finalBalance.value;
        });
        
        const next7DaysApps = computed(() => { 
            const now = new Date(); now.setHours(0,0,0,0);
            const nextWeek = new Date(now); nextWeek.setDate(now.getDate() + 7);
            const startStr = now.toISOString().split('T')[0];
            const endStr = nextWeek.toISOString().split('T')[0];
            return pendingAppointments.value.filter(a => a.date >= startStr && a.date <= endStr).sort((a,b) => a.date.localeCompare(b.date)).slice(0,6); 
        });
        
        const calendarGrid = computed(() => { const year = calendarCursor.value.getFullYear(); const month = calendarCursor.value.getMonth(); const firstDay = new Date(year, month, 1).getDay(); const daysInMonth = new Date(year, month + 1, 0).getDate(); const days = []; for (let i = 0; i < firstDay; i++) days.push({ day: '', date: null }); for (let i = 1; i <= daysInMonth; i++) { const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`; days.push({ day: i, date: dateStr, hasEvent: pendingAppointments.value.some(a => a.date === dateStr), isBlocked: blockedDates.value.some(b => b.date === dateStr) }); } return days; });
        const appointmentsOnSelectedDate = computed(() => pendingAppointments.value.filter(a => a.date === selectedCalendarDate.value));
        const calendarTitle = computed(() => `${['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'][calendarCursor.value.getMonth()]} ${calendarCursor.value.getFullYear()}`);
        
        const filteredListAppointments = computed(() => { 
            let list = [];
            if (agendaTab.value === 'pending') { 
                list = pendingAppointments.value; 
                if(clientSearchTerm.value) list = list.filter(a => getClientName(a.clientId).toLowerCase().includes(clientSearchTerm.value.toLowerCase())); 
            } else { 
                list = historyList.value; 
            }
            return list.sort((a,b) => a.date.localeCompare(b.date)); 
        });
        
        const filteredClientsSearch = computed(() => {
            const term = clientSearchTerm.value.toLowerCase().trim();
            if (!term) return [];
            // Hide dropdown when a client is selected and search term matches the selection
            if (selectedClientNameLock.value && clientSearchTerm.value === selectedClientNameLock.value) return [];
            return catalogClientsList.value.filter(c => 
                c.name.toLowerCase().includes(term)
            );
        });

        // Clear client selection when user types something different
        watch(clientSearchTerm, (newVal) => {
            if (selectedClientNameLock.value && newVal !== selectedClientNameLock.value) {
                tempApp.clientId = '';
                selectedClientNameLock.value = '';
            }
        });

        // --- FIREBASE OPS ---
        const fetchClientToCache = async (id) => { if (!id || clientCache[id]) return; try { const s = await getDoc(doc(db, "clients", id)); if (s.exists()) clientCache[id] = s.data(); else clientCache[id] = { name: 'Excluído', phone: '-' }; } catch (e) {} };
        const sanitizeApp = (d) => { const data = d.data ? d.data() : d; return { id: d.id || data.id, ...data, selectedServices: Array.isArray(data.selectedServices) ? data.selectedServices : [], details: { ...(data.details || {}), balloonColors: data.details?.balloonColors || '', entryFee: data.details?.entryFee || 0 }, checklist: data.checklist || [], clientSignature: data.clientSignature || '' }; };
        const sanitizeExpense = (d) => { const data=d.data?d.data():d; return {id:d.id||data.id,...data,value:toNum(data.value)}; };
        
        const loadDashboardData = async () => {
            if (!user.value) return;
            isLoadingDashboard.value = true;
            try {
                const [y, m] = dashboardMonth.value.split('-'); 
                const lastDay = new Date(y, m, 0).getDate();
                const startStr = `${y}-${m}-01`; 
                const endStr = `${y}-${m}-${lastDay}`;
                const qApps = query(collection(db, "appointments"), where("userId", "==", user.value.uid), where("date", ">=", startStr), where("date", "<=", endStr));
                const qExp = query(collection(db, "expenses"), where("userId", "==", user.value.uid), where("date", ">=", startStr), where("date", "<=", endStr));
                const [sA, sE] = await Promise.all([getDocs(qApps), getDocs(qExp)]);
                dashboardData.appointments = sA.docs.map(sanitizeApp).filter(a => a.status !== 'cancelled');
                dashboardData.expenses = sE.docs.map(sanitizeExpense);
                dashboardData.appointments.forEach(a => fetchClientToCache(a.clientId));
            } catch(e) {
                console.error("Erro ao carregar dashboard:", e);
                Swal.fire('Erro', 'Falha ao carregar dados do painel.', 'error');
            } finally {
                isLoadingDashboard.value = false;
            }
        };

        watch(dashboardMonth, () => {
            loadDashboardData();
        });
        
        const syncData = () => { 
            const myId = user.value.uid; 
            onSnapshot(query(collection(db, "services"), where("userId", "==", myId)), (snap) => services.value = snap.docs.map(d => ({ id: d.id, ...d.data() }))); 
            onSnapshot(query(collection(db, "clients"), where("userId", "==", myId)), (snap) => {
                catalogClientsList.value = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            });
            onSnapshot(query(collection(db, "appointments"), where("userId", "==", myId), where("status", "==", "pending")), (snap) => { pendingAppointments.value = snap.docs.map(sanitizeApp); pendingAppointments.value.forEach(a => fetchClientToCache(a.clientId)); }); 
            onSnapshot(query(collection(db, "appointments"), where("userId", "==", myId), where("status", "==", "budget")), (snap) => { budgetList.value = snap.docs.map(sanitizeApp); budgetList.value.forEach(a => fetchClientToCache(a.clientId)); }); 
            onSnapshot(query(collection(db, "reviews"), where("userId", "==", myId)), (snap) => { allReviews.value = snap.docs.map(d => ({ id: d.id, ...d.data() })); });
            loadRecontractRadar();
            loadBlockedDates();
            checkOnboarding();
        };
        
        const searchHistory = async () => { if(!agendaFilter.start || !agendaFilter.end) return Swal.fire('Atenção', 'Selecione datas', 'warning'); const q = query(collection(db, "appointments"), where("userId", "==", user.value.uid), where("status", "==", agendaTab.value), where("date", ">=", agendaFilter.start), where("date", "<=", agendaFilter.end)); const snap = await getDocs(q); historyList.value = snap.docs.map(sanitizeApp); historyList.value.forEach(a => fetchClientToCache(a.clientId)); };
        
        const searchExpenses = async () => { 
            if(!expensesFilter.start || !expensesFilter.end) return Swal.fire('Data', 'Selecione o período', 'info'); 
            const qExp = query(collection(db, "expenses"), where("userId", "==", user.value.uid), where("date", ">=", expensesFilter.start), where("date", "<=", expensesFilter.end)); 
            const snapExp = await getDocs(qExp); 
            const loadedExpenses = snapExp.docs.map(d => ({ ...sanitizeExpense(d), type: 'expense', icon: 'fa-arrow-down', color: 'text-red-500' })); 
            const qApp = query(collection(db, "appointments"), where("userId", "==", user.value.uid), where("date", ">=", expensesFilter.start), where("date", "<=", expensesFilter.end)); 
            const snapApp = await getDocs(qApp); 
            const loadedIncome = snapApp.docs.map(d => sanitizeApp(d)).filter(a => a.status !== 'budget').map(app => { return { id: app.id, date: app.date, value: app.totalServices, description: `Receita: ${getClientName(app.clientId)}`, type: 'income', icon: 'fa-arrow-up', color: 'text-green-500' }; }); 
            expensesList.value = [...loadedExpenses, ...loadedIncome]; 
            isExtractLoaded.value = true; 
        };
        
        const searchCatalogClients = async () => {
            const q = query(collection(db, "clients"), where("userId", "==", user.value.uid));
            const snap = await getDocs(q);
            let list = snap.docs.map(d => ({id: d.id, ...d.data()}));

            // Filtro por nome
            if (clientFilter.name.trim()) {
                const t = clientFilter.name.toLowerCase();
                list = list.filter(c => c.name?.toLowerCase().includes(t));
            }
            // Filtro por CPF
            if (clientFilter.cpf.trim()) {
                const t = clientFilter.cpf.replace(/\D/g, '');
                list = list.filter(c => (c.cpf || '').replace(/\D/g, '').includes(t));
            }
            // Filtro por e-mail
            if (clientFilter.email.trim()) {
                const t = clientFilter.email.toLowerCase();
                list = list.filter(c => (c.email || '').toLowerCase().includes(t));
            }
            // Filtro por data do evento
            if (clientFilter.eventDateStart || clientFilter.eventDateEnd) {
                const clientIds = list.map(c => c.id);
                if (clientIds.length > 0) {
                    let appQ = query(collection(db, "appointments"), where("userId", "==", user.value.uid));
                    const appSnap = await getDocs(appQ);
                    const appsInRange = appSnap.docs.map(d => ({...d.data()})).filter(a => {
                        if (clientFilter.eventDateStart && a.date < clientFilter.eventDateStart) return false;
                        if (clientFilter.eventDateEnd && a.date > clientFilter.eventDateEnd) return false;
                        return clientIds.includes(a.clientId);
                    });
                    const matchedIds = new Set(appsInRange.map(a => a.clientId));
                    list = list.filter(c => matchedIds.has(c.id));
                }
            }

            catalogClientsDisplayList.value = list;
            catalogClientsList.value = list;
            catalogSearched.value = true;
        };

        const clearClientFilter = () => {
            clientFilter.name = ''; clientFilter.cpf = ''; clientFilter.email = '';
            clientFilter.eventDateStart = ''; clientFilter.eventDateEnd = '';
            catalogClientsDisplayList.value = [];
            catalogSearched.value = false;
        };

        const searchServices = () => {
            let list = services.value;
            if (serviceSearch.value.trim()) {
                const t = serviceSearch.value.toLowerCase();
                list = list.filter(s => s.description?.toLowerCase().includes(t));
            }
            if (serviceMaxPrice.value !== '' && serviceMaxPrice.value !== null) {
                const max = toNum(serviceMaxPrice.value);
                if (max > 0) list = list.filter(s => toNum(s.price) <= max);
            }
            servicesDisplayList.value = list;
            servicesSearched.value = true;
        };

        const clearServiceFilter = () => {
            serviceSearch.value = '';
            serviceMaxPrice.value = '';
            servicesDisplayList.value = [];
            servicesSearched.value = false;
        };

        // ─── CHECKLIST ────────────────────────────────────────────
        const addChecklistItem = () => {
            const text = newChecklistItem.value.trim();
            if (!text) return;
            if (!tempApp.checklist) tempApp.checklist = [];
            tempApp.checklist.push({ text, done: false });
            newChecklistItem.value = '';
        };
        const removeChecklistItem = (i) => tempApp.checklist.splice(i, 1);
        const syncBalloonChecklist = () => {
            const raw = tempApp.details?.balloonColors || '';
            const cores = raw.split(/[,;/&]| e /i).map(x => x.trim()).filter(Boolean);
            if (!tempApp.checklist) tempApp.checklist = [];
            // Marca itens auto anteriores para reconciliar
            tempApp.checklist = tempApp.checklist.filter(it => !it.autoBalloon || cores.some(c => `Balões: ${c}` === it.text));
            cores.forEach(cor => {
                const label = `Balões: ${cor}`;
                if (!tempApp.checklist.some(it => it.text === label)) {
                    tempApp.checklist.push({ text: label, done: false, autoBalloon: true });
                }
            });
        };
        const toggleChecklistItem = (i) => { tempApp.checklist[i].done = !tempApp.checklist[i].done; };
        const checklistProgress = computed(() => {
            const list = tempApp.checklist || [];
            if (!list.length) return 0;
            return Math.round((list.filter(i => i.done).length / list.length) * 100);
        });
        const saveChecklistInline = async (app) => {
            await updateDoc(doc(db, 'appointments', app.id), { checklist: app.checklist });
        };

        // ─── RANKING DE CLIENTES ──────────────────────────────────
        const loadClientRanking = async () => {
            clientRankingLoading.value = true;
            try {
                const [appsSnap, clientsSnap] = await Promise.all([
                    getDocs(query(collection(db, 'appointments'), where('userId', '==', user.value.uid), where('status', '==', 'pending'))),
                    getDocs(query(collection(db, 'clients'), where('userId', '==', user.value.uid)))
                ]);
                const concludedSnap = await getDocs(query(collection(db, 'appointments'), where('userId', '==', user.value.uid), where('status', '==', 'concluded')));
                const clientMap = {};
                clientsSnap.docs.forEach(d => { clientMap[d.id] = { id: d.id, ...d.data() }; });
                const tally = {};
                [...appsSnap.docs, ...concludedSnap.docs].forEach(d => {
                    const a = { id: d.id, ...d.data() };
                    if (!tally[a.clientId]) tally[a.clientId] = { count: 0, total: 0, lastDate: '' };
                    tally[a.clientId].count++;
                    tally[a.clientId].total += toNum(a.totalServices);
                    if (a.date > tally[a.clientId].lastDate) tally[a.clientId].lastDate = a.date;
                });
                clientRankingData.value = Object.entries(tally)
                    .map(([id, stats]) => ({ ...stats, client: clientMap[id] || { name: 'Excluído', phone: '' }, id }))
                    .sort((a, b) => b.total - a.total)
                    .slice(0, 10);
            } catch(e) { console.error(e); }
            finally { clientRankingLoading.value = false; }
        };

        // ─── COMPARATIVO MENSAL (últimos 6 meses) ─────────────────
        const loadMonthlyChart = async () => {
            monthlyChartLoading.value = true;
            try {
                const result = [];
                const now = new Date();
                for (let i = 5; i >= 0; i--) {
                    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                    const y = d.getFullYear();
                    const m = String(d.getMonth() + 1).padStart(2, '0');
                    const lastDay = new Date(y, d.getMonth() + 1, 0).getDate();
                    const start = `${y}-${m}-01`;
                    const end = `${y}-${m}-${lastDay}`;
                    const snap = await getDocs(query(collection(db, 'appointments'), where('userId', '==', user.value.uid), where('date', '>=', start), where('date', '<=', end)));
                    const revenue = snap.docs.map(d => sanitizeApp(d)).filter(a => a.status !== 'budget' && a.status !== 'cancelled').reduce((acc, a) => acc + toNum(a.totalServices), 0);
                    const monthNames = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
                    result.push({ label: monthNames[d.getMonth()], value: revenue, year: y });
                }
                monthlyChartData.value = result;
            } catch(e) { console.error(e); }
            finally { monthlyChartLoading.value = false; }
        };

        // ─── HISTÓRICO DO CLIENTE ─────────────────────────────────
        const openClientHistory = async (client) => {
            clientHistoryData.value = client;
            clientHistoryApps.value = [];
            clientHistoryLoading.value = true;
            showClientHistoryModal.value = true;
            try {
                const snap = await getDocs(query(collection(db, 'appointments'), where('clientId', '==', client.id)));
                clientHistoryApps.value = snap.docs.map(sanitizeApp).sort((a, b) => b.date.localeCompare(a.date));
            } catch(e) { console.error(e); }
            finally { clientHistoryLoading.value = false; }
        };
        const clientAvgRating = computed(() => {
            const rated = clientHistoryApps.value.filter(a => a.review?.rating);
            if (!rated.length) return 0;
            return (rated.reduce((acc, a) => acc + a.review.rating, 0) / rated.length).toFixed(1);
        });
        const generateReviewLink = (app) => {
            const basePath = window.location.origin + window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/') + 1);
            return basePath + 'review.html?aid=' + app.id + '&uid=' + user.value.uid;
        };
        const copyReviewLink = (app) => {
            navigator.clipboard.writeText(generateReviewLink(app)).then(() => Swal.fire('Copiado!', 'Link de avaliacao copiado.', 'success'));
        };
        const sendReviewWhatsApp = (app) => {
            const cli = clientCache[app.clientId];
            if (!cli?.phone) return Swal.fire('Atencao', 'Cliente sem telefone cadastrado.', 'warning');
            const link = generateReviewLink(app);
            const phoneClean = cli.phone.replace(/\D/g,'');
            const msg = 'Ola ' + cli.name + '! Foi um prazer realizar seu evento!\n\nQueremos saber como foi sua experiencia. Avalie nosso servico (leva menos de 1 minuto):\n' + link;
            window.open('https://wa.me/55' + phoneClean + '?text=' + encodeURIComponent(msg), '_blank');
        };
        const clientHistoryTotal = computed(() => clientHistoryApps.value.filter(a => a.status !== 'budget').reduce((acc, a) => acc + toNum(a.totalServices), 0));

        // ─── COR DO TEMA ──────────────────────────────────────────
        watch(() => company.primaryColor, (val) => { if (val) applyThemeColor(val); });


        // --- ACTIONS ---
        const handleAuth = async () => { authLoading.value = true; try { if (isRegistering.value) { const res = await createUserWithEmailAndPassword(auth, authForm.email, authForm.password); await setDoc(doc(db, "users", res.user.uid), { email: authForm.email, role: 'user', createdAt: new Date().toISOString(), companyConfig: { fantasia: authForm.name || 'Minha Empresa', email: authForm.email } }); } else { await signInWithEmailAndPassword(auth, authForm.email, authForm.password); } } catch (e) { Swal.fire('Ops', 'Erro no login.', 'error'); } finally { authLoading.value = false; } };
        const copyClientLink = () => { const path = window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/') + 1); const url = `${window.location.origin}${path}client.html?uid=${user.value.uid}`; navigator.clipboard.writeText(url).then(() => Swal.fire('Copiado!', 'Link da Área do Cliente copiado.', 'success')); };
        const logAudit = async (action, details) => {
            try {
                await addDoc(collection(db, "auditLog"), {
                    userId: user.value.uid,
                    action,
                    details,
                    timestamp: new Date().toISOString(),
                    userName: company.fantasia || user.value.email
                });
            } catch(e) { console.warn('Audit log error:', e); }
        };

        const sendEmailJS = async (clientId, appData) => {
            if (!company.emailjs_service_id || !company.emailjs_template_id || !company.emailjs_public_key) return;
            const cli = clientCache[clientId];
            if (!cli || !cli.email) return;
            try {
                const clientLink = `${window.location.origin}${window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/') + 1)}client.html?uid=${user.value.uid}`;
                await emailjs.send(company.emailjs_service_id, company.emailjs_template_id, {
                    to_name: cli.name,
                    to_email: cli.email,
                    company_name: company.fantasia,
                    event_date: formatDate(appData.date),
                    event_time: appData.time,
                    event_location: appData.location?.bairro || '',
                    total_value: formatCurrency(appData.totalServices),
                    client_link: clientLink
                }, company.emailjs_public_key);
            } catch(e) { console.warn('EmailJS error:', e); }
        };

        const saveAppointment = async () => {
            if (isDateBlocked(tempApp.date)) { Swal.fire('Data bloqueada', 'Esta data está marcada como indisponível na sua agenda. Desbloqueie antes de agendar.', 'warning'); return; }
            const data = { ...tempApp, totalServices: totalServices.value, finalBalance: finalBalance.value, userId: user.value.uid, status: 'pending' };
            let appId = editingId.value;
            if (isEditing.value) {
                await updateDoc(doc(db, "appointments", editingId.value), data);
                await logAudit('edit_appointment', `Editou agendamento de ${getClientName(data.clientId)} para ${formatDate(data.date)}`);
            } else {
                const ref = await addDoc(collection(db, "appointments"), data);
                appId = ref.id;
                await logAudit('create_appointment', `Criou agendamento de ${getClientName(data.clientId)} para ${formatDate(data.date)}`);
                // Envia email automático
                await sendEmailJS(data.clientId, data);
            }
            showAppointmentModal.value = false;
            loadDashboardData();
            // Pergunta se quer enviar WhatsApp com link do contrato
            if (!isEditing.value) {
                const cli = clientCache[data.clientId];
                if (cli && cli.phone) {
                    const { isConfirmed } = await Swal.fire({
                        title: '✅ Agendamento criado!',
                        text: `Deseja enviar o link do contrato para ${cli.name} via WhatsApp?`,
                        icon: 'success',
                        showCancelButton: true,
                        confirmButtonText: '<i class="fa-brands fa-whatsapp"></i> Enviar WhatsApp',
                        cancelButtonText: 'Agora não',
                        confirmButtonColor: '#22c55e'
                    });
                    if (isConfirmed) {
                        const path = window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/') + 1);
                        const link = `${window.location.origin}${path}client.html?uid=${user.value.uid}`;
                        const phone = cli.phone.replace(/\D/g, '');
                        const msg = `Olá ${cli.name}! 🎉 Seu agendamento com *${company.fantasia}* para o dia *${formatDate(data.date)}* foi confirmado.\n\nAcesse o link abaixo para ver os detalhes e assinar o contrato:\n${link}`;
                        window.open(`https://wa.me/55${phone}?text=${encodeURIComponent(msg)}`, '_blank');
                    }
                } else {
                    Swal.fire('✅ Agendamento criado!', '', 'success');
                }
            }
        };
        
        // CORREÇÃO: Mapeia o valor da entrada para o campo entryFee esperado pelo HTML do recibo
        const showReceipt = (app) => { 
            const sanitized = sanitizeApp(app);
            // Garante que o entryFee esteja disponível no nível superior para o template
            sanitized.entryFee = sanitized.details?.entryFee || 0;
            currentReceipt.value = sanitized; 
            showReceiptModal.value = true; 
        };

        const logout = () => { signOut(auth); window.location.href="index.html"; };
        const openNewExpense = () => { editingExpenseId.value = null; Object.assign(newExpense, { description: '', value: '', date: today, category: 'outros', appointmentId: '' }); showExpenseModal.value = true; if (!expenseLinkOptions.value.length) loadExpenseLinkOptions(); };
        const openEditExpense = (expense) => { editingExpenseId.value = expense.id; Object.assign(newExpense, { description: expense.description, value: expense.value, date: expense.date, category: expense.category, appointmentId: expense.appointmentId || '' }); showExpenseModal.value = true; if (!expenseLinkOptions.value.length) loadExpenseLinkOptions(); };
        
        const downloadReceiptImage = () => { html2canvas(document.getElementById('receipt-capture-area')).then(c => { const l = document.createElement('a'); l.download = 'Recibo.png'; l.href = c.toDataURL(); l.click(); }); };
        const openWhatsApp = (app) => { const cli = clientCache[app.clientId]; if (!cli || !cli.phone) return Swal.fire('Erro', 'Cliente sem telefone cadastrado.', 'error'); const phoneClean = cli.phone.replace(/\D/g, ''); const msg = `Olá ${cli.name}, aqui é da ${company.fantasia}. Segue o comprovante do seu agendamento para o dia ${formatDate(app.date)}.`; window.open(`https://wa.me/55${phoneClean}?text=${encodeURIComponent(msg)}`, '_blank'); };
        
        const selectClient = (client) => { 
            tempApp.clientId = client.id; 
            clientSearchTerm.value = client.name; 
            selectedClientNameLock.value = client.name;
        };
        
        const addServiceToApp = () => { if(tempServiceSelect.value) tempApp.selectedServices.push(tempServiceSelect.value); tempServiceSelect.value=''; };
        const removeServiceFromApp = (i) => tempApp.selectedServices.splice(i,1);
        const incServiceQty = (i) => { const s = tempApp.selectedServices[i]; s.qty = (toNum(s.qty)||1) + 1; };
        const decServiceQty = (i) => { const s = tempApp.selectedServices[i]; s.qty = Math.max(1, (toNum(s.qty)||1) - 1); };
        const serviceLineTotal = (s) => toNum(s.price) * (toNum(s.qty)||1);
        const saveMonthlyGoal = async () => {
            const val = toNum(tempGoal.value);
            if (!val || val <= 0) return Swal.fire('Atenção', 'Informe um valor válido.', 'warning');
            monthlyGoal.value = val;
            await updateDoc(doc(db, "users", user.value.uid), { monthlyGoal: val });
            showGoalModal.value = false;
            Swal.fire('Meta definida!', `Meta de ${formatCurrency(val)} para o mês.`, 'success');
        };

        const generateMonthlyReport = () => {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();
            const [y, m] = dashboardMonth.value.split('-');
            const monthNames = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
            const monthName = monthNames[parseInt(m) - 1];
            let posY = 20;

            doc.setFont("helvetica", "bold"); doc.setFontSize(16);
            doc.text(company.fantasia.toUpperCase(), 105, posY, {align:"center"}); posY += 8;
            doc.setFont("helvetica", "normal"); doc.setFontSize(11);
            doc.text(`RELATÓRIO FINANCEIRO — ${monthName.toUpperCase()} ${y}`, 105, posY, {align:"center"}); posY += 6;
            doc.line(20, posY, 190, posY); posY += 10;

            doc.setFontSize(12); doc.setFont("helvetica", "bold");
            doc.text("RESUMO", 20, posY); posY += 8;
            doc.setFont("helvetica", "normal"); doc.setFontSize(10);
            doc.text(`Receita Total:`, 20, posY); doc.text(formatCurrency(financeData.value.revenue), 190, posY, {align:"right"}); posY += 6;
            doc.text(`Despesas Totais:`, 20, posY); doc.text(formatCurrency(financeData.value.expenses), 190, posY, {align:"right"}); posY += 6;
            doc.setFont("helvetica", "bold");
            doc.text(`Lucro Líquido:`, 20, posY); doc.text(formatCurrency(financeData.value.profit), 190, posY, {align:"right"}); posY += 6;
            doc.text(`A Receber (Pendentes):`, 20, posY); doc.text(formatCurrency(kpiPendingReceivables.value), 190, posY, {align:"right"}); posY += 6;
            if (monthlyGoal.value > 0) {
                doc.text(`Meta do Mês:`, 20, posY); doc.text(`${formatCurrency(monthlyGoal.value)} (${goalProgress.value}% atingido)`, 190, posY, {align:"right"}); posY += 6;
            }
            posY += 4; doc.line(20, posY, 190, posY); posY += 10;

            // Eventos do mês
            if (dashboardData.appointments.length > 0) {
                doc.setFont("helvetica", "bold"); doc.setFontSize(12);
                doc.text("EVENTOS DO MÊS", 20, posY); posY += 6;
                const appsBody = dashboardData.appointments.map(a => [
                    formatDate(a.date), getClientName(a.clientId), statusText(a.status),
                    formatCurrency(a.totalServices), formatCurrency(a.finalBalance)
                ]);
                doc.autoTable({ startY: posY, head: [['Data','Cliente','Status','Total','Saldo']], body: appsBody, theme: 'grid', headStyles: { fillColor: [60,60,60] }, styles: { fontSize: 8 }, margin: { left: 20, right: 20 } });
                posY = doc.lastAutoTable.finalY + 10;
            }

            // Despesas do mês
            if (dashboardData.expenses.length > 0) {
                if (posY > 220) { doc.addPage(); posY = 20; }
                doc.setFont("helvetica", "bold"); doc.setFontSize(12);
                doc.text("DESPESAS DO MÊS", 20, posY); posY += 6;
                const expBody = dashboardData.expenses.map(e => [
                    formatDate(e.date), e.description, expenseCategories.find(c=>c.id===e.category)?.label||'Outro', formatCurrency(e.value)
                ]);
                doc.autoTable({ startY: posY, head: [['Data','Descrição','Categoria','Valor']], body: expBody, theme: 'grid', headStyles: { fillColor: [60,60,60] }, styles: { fontSize: 8 }, margin: { left: 20, right: 20 } });
            }

            doc.setFontSize(8);
            doc.text(`Gerado em ${new Date().toLocaleDateString('pt-BR')} via PartyPlanner Pro`, 105, 290, {align:"center"});
            doc.save(`Relatorio_${monthName}_${y}.pdf`);
        };

        const exportBackupJSON = async () => {
            const { isConfirmed } = await Swal.fire({ title: 'Exportar Backup', text: 'Isso irá baixar todos os seus dados em JSON.', icon: 'info', showCancelButton: true, confirmButtonText: 'Exportar' });
            if (!isConfirmed) return;
            const [clients, appointments, expenses] = await Promise.all([
                getDocs(query(collection(db, "clients"), where("userId", "==", user.value.uid))),
                getDocs(query(collection(db, "appointments"), where("userId", "==", user.value.uid))),
                getDocs(query(collection(db, "expenses"), where("userId", "==", user.value.uid)))
            ]);
            const data = {
                exportDate: new Date().toISOString(),
                company: { ...company },
                clients: clients.docs.map(d => ({id: d.id, ...d.data()})),
                appointments: appointments.docs.map(d => ({id: d.id, ...d.data()})),
                expenses: expenses.docs.map(d => ({id: d.id, ...d.data()}))
            };
            const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url;
            a.download = `Backup_PartyPlanner_${new Date().toISOString().split('T')[0]}.json`;
            a.click(); URL.revokeObjectURL(url);
            Swal.fire('Backup exportado!', 'Arquivo JSON baixado com sucesso.', 'success');
        };

        const loadAuditLog = async () => {
            try {
                const q = query(collection(db, "auditLog"), where("userId", "==", user.value.uid), orderBy("timestamp", "desc"), limit(50));
                const snap = await getDocs(q);
                auditLog.value = snap.docs.map(d => ({id: d.id, ...d.data()}));
                showAuditModal.value = true;
            } catch(e) { Swal.fire('Erro', 'Não foi possível carregar o log.', 'error'); }
        };

        const startNewSchedule = () => { isEditing.value=false; clientSearchTerm.value = ''; selectedClientNameLock.value = ''; Object.assign(tempApp, { clientId:'', date:'', time:'', location:{bairro:''}, details:{entryFee:0, balloonColors:''}, discount:0, notes:'', internalNotes:'', installments: 1, selectedServices:[],checklist:[]}); showAppointmentModal.value = true; };
        const editAppointment = (app) => { isEditing.value=true; editingId.value=app.id; Object.assign(tempApp, JSON.parse(JSON.stringify(app))); if (!tempApp.internalNotes) tempApp.internalNotes = ''; if (!tempApp.installments) tempApp.installments = 1; clientSearchTerm.value = getClientName(app.clientId); selectedClientNameLock.value = getClientName(app.clientId); showAppointmentModal.value=true; };
        
        let canvasContext = null; let isDrawing = false;
        const openSignatureModal = (target, mode = 'company') => { signatureApp.value = target; signatureMode.value = mode; showSignatureModal.value = true; setTimeout(() => initCanvas(), 100); };
        const initCanvas = () => { const canvas = document.getElementById('signature-pad'); if(!canvas) return; const ratio = Math.max(window.devicePixelRatio || 1, 1); canvas.width = canvas.offsetWidth * ratio; canvas.height = canvas.offsetHeight * ratio; canvas.getContext("2d").scale(ratio, ratio); canvasContext = canvas.getContext('2d'); canvasContext.strokeStyle = "#000"; canvasContext.lineWidth = 2; canvas.addEventListener('mousedown', startDrawing); canvas.addEventListener('mousemove', draw); canvas.addEventListener('mouseup', stopDrawing); canvas.addEventListener('mouseout', stopDrawing); canvas.addEventListener('touchstart', (e) => { e.preventDefault(); startDrawing(e.touches[0]); }); canvas.addEventListener('touchmove', (e) => { e.preventDefault(); draw(e.touches[0]); }); canvas.addEventListener('touchend', (e) => { e.preventDefault(); stopDrawing(); }); };
        const startDrawing = (e) => { isDrawing = true; const pos = getPos(e); canvasContext.beginPath(); canvasContext.moveTo(pos.x, pos.y); };
        const draw = (e) => { if(!isDrawing) return; const pos = getPos(e); canvasContext.lineTo(pos.x, pos.y); canvasContext.stroke(); };
        const stopDrawing = () => { isDrawing = false; };
        const getPos = (e) => { const canvas = document.getElementById('signature-pad'); const rect = canvas.getBoundingClientRect(); return { x: e.clientX - rect.left, y: e.clientY - rect.top }; };
        const clearSignature = () => { const canvas = document.getElementById('signature-pad'); canvasContext.clearRect(0, 0, canvas.width, canvas.height); };
        const isCanvasBlank = (canvas) => { const context = canvas.getContext('2d'); const pixelBuffer = new Uint32Array(context.getImageData(0, 0, canvas.width, canvas.height).data.buffer); return !pixelBuffer.some(color => color !== 0); }
        const saveSignature = async () => { const canvas = document.getElementById('signature-pad'); const dataUrl = canvas.toDataURL(); if (isCanvasBlank(canvas)) return Swal.fire('Atenção', 'Faça sua assinatura.', 'warning'); authLoading.value = true; try { company.signature = dataUrl; await updateDoc(doc(db, "users", user.value.uid), { companyConfig: company }); Swal.fire('Sucesso', 'Assinatura salva!', 'success'); showSignatureModal.value = false; } catch (e) { Swal.fire('Erro', 'Erro ao salvar.', 'error'); } finally { authLoading.value = false; } };
        const downloadClientReceipt = async (app) => { if (!app.clientSignature) Swal.fire('Aviso', 'Este contrato ainda não foi assinado pelo cliente.', 'info'); currentReceipt.value = app; generateContractPDF(); };
        
        const generateContractPDF = () => { 
            const { jsPDF } = window.jspdf; 
            const doc = new jsPDF(); 
            const app = currentReceipt.value; 
            const cli = clientCache[app.clientId] || {name:'...',cpf:'...', phone: '', email: ''}; 
            let docTitle = "CONTRATO DE PRESTAÇÃO DE SERVIÇOS"; 
            if(app.status === 'budget') docTitle = "ORÇAMENTO"; 
            doc.setFont("helvetica", "bold"); doc.setFontSize(14); 
            doc.text(company.fantasia.toUpperCase(), 105, 20, {align: "center"}); 
            doc.setFontSize(10); doc.setFont("helvetica", "normal"); 
            let headerY = 26; 
            if (company.cnpj) { doc.text(`CNPJ: ${company.cnpj}`, 105, headerY, {align: "center"}); headerY += 5; } 
            doc.text(`${company.rua} - ${company.bairro}`, 105, headerY, {align: "center"}); 
            headerY += 5; doc.text(`${company.cidade}/${company.estado} - Tel: ${company.phone}`, 105, headerY, {align: "center"}); 
            doc.line(20, headerY + 5, 190, headerY + 5); 
            doc.setFontSize(14); doc.setFont("helvetica", "bold"); 
            doc.text(docTitle, 105, headerY + 15, {align:"center"}); 
            let y = headerY + 25; 
            doc.setFontSize(10); doc.setFont("helvetica", "bold"); 
            doc.text("CONTRATANTE:", 20, y); y += 5; doc.setFont("helvetica", "normal"); 
            doc.text(`Nome: ${cli.name} | CPF: ${cli.cpf || '-'}`, 20, y); y += 5; 
            doc.text(`Tel: ${cli.phone} | E-mail: ${cli.email || '-'}`, 20, y); y += 10; 
            doc.setFont("helvetica", "bold"); doc.text("EVENTO:", 20, y); y += 5; 
            doc.setFont("helvetica", "normal"); 
            doc.text(`Data: ${formatDate(app.date)} | Hora: ${app.time}`, 20, y); y += 5; 
            doc.text(`Local: ${app.location.bairro}`, 20, y); 
            if(app.details.balloonColors) { y += 5; doc.text(`Cores: ${app.details.balloonColors}`, 20, y); } y += 10; 
            const body = app.selectedServices.map(s => [s.description, formatCurrency(s.price)]); 
            doc.autoTable({ startY: y, head: [['Descrição', 'Valor']], body: body, theme: 'grid', headStyles: { fillColor: [60, 60, 60] }, margin: { left: 20, right: 20 } }); 
            y = doc.lastAutoTable.finalY + 10; 
            doc.setFont("helvetica", "bold"); 
            doc.text(`TOTAL: ${formatCurrency(app.totalServices)}`, 140, y, {align: "right"}); y += 5; 
            doc.text(`SINAL: ${formatCurrency(app.details?.entryFee || 0)}`, 140, y, {align: "right"}); y += 5; 
            doc.text(`RESTANTE: ${formatCurrency(app.finalBalance)}`, 140, y, {align: "right"}); 
            if (app.status !== 'budget') { 
                y += 15; doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.text("CLÁUSULAS E CONDIÇÕES:", 20, y); y += 5; doc.setFont("helvetica", "normal");
                const defaultClauses = ["1. RESERVA: O pagamento do sinal garante a reserva da data.", "2. DESISTÊNCIA: Em caso de cancelamento com menos de 15 dias, o sinal não será devolvido.", "3. DANOS: O CONTRATANTE responsabiliza-se pela conservação dos materiais.", "4. PAGAMENTO: O restante deve ser pago até a data do evento.", "5. MONTAGEM: O local deve estar liberado no horário combinado."];
                const customClauses = company.contractClauses ? company.contractClauses.split('\n').filter(l => l.trim()) : null;
                const clauses = customClauses && customClauses.length ? customClauses : defaultClauses; 
                clauses.forEach(clause => { const lines = doc.splitTextToSize(clause, 170); doc.text(lines, 20, y); y += (lines.length * 4) + 2; if (y > 230) { doc.addPage(); y = 20; } }); 
                if (y > 230) { doc.addPage(); y = 40; } else { y += 20; } 
                if (app.clientSignature) { doc.addImage(app.clientSignature, 'PNG', 115, y - 15, 60, 20); } 
                if (company.signature) { doc.addImage(company.signature, 'PNG', 25, y - 15, 60, 20); } 
                doc.line(20, y, 90, y); doc.line(110, y, 180, y); 
                doc.text("CONTRATADA", 55, y + 5, {align: "center"}); doc.text("CONTRATANTE", 145, y + 5, {align: "center"}); 
            } else { y += 20; doc.setFontSize(8); doc.text("* Este documento é apenas um orçamento.", 105, y, {align: "center"}); } 
            doc.save(`Doc_${cli.name.replace(/ /g, '_')}.pdf`); 
        };

        const saveAsBudget = async () => { const appData = { ...JSON.parse(JSON.stringify(tempApp)), totalServices: totalServices.value, finalBalance: finalBalance.value, userId: user.value.uid, status: 'budget' }; if(!appData.checklist.length) appData.checklist = [{text:'Materiais', done:false}]; if (isEditing.value && editingId.value) await updateDoc(doc(db, "appointments", editingId.value), appData); else await addDoc(collection(db, "appointments"), appData); showAppointmentModal.value = false; Swal.fire('Orçamento Criado!', 'Ver na aba Orçamentos.', 'success'); };
        const approveBudget = async (app) => { const { isConfirmed } = await Swal.fire({ title: 'Aprovar Orçamento?', text: 'Mover para Agenda?', icon: 'question', showCancelButton: true, confirmButtonColor: '#4F46E5' }); if (isConfirmed) { await updateDoc(doc(db, "appointments", app.id), { status: 'pending' }); Swal.fire('Aprovado!', '', 'success'); view.value = 'schedule'; } };
        const openClientModal = () => { 
            editingClientId.value = null;
            newClient.name = ''; newClient.phone = ''; newClient.cpf = ''; newClient.email = ''; newClient.consent = false;
            showClientModal.value = true; 
        };

        const openEditClient = (client) => {
            editingClientId.value = client.id;
            newClient.name = client.name;
            newClient.phone = client.phone || '';
            newClient.cpf = client.cpf || '';
            newClient.email = client.email || '';
            showClientModal.value = true;
        };

        const saveClient = async () => { 
            if(!newClient.name) return;
            if (!editingClientId.value && !newClient.consent) return Swal.fire('Consentimento necessário', 'Confirme que o cliente autorizou o uso dos dados (LGPD).', 'warning'); 

            if (editingClientId.value) {
                // Editar cliente existente
                await updateDoc(doc(db, 'clients', editingClientId.value), {
                    name: newClient.name, phone: newClient.phone, cpf: newClient.cpf, email: newClient.email
                });
                // Atualiza cache
                clientCache[editingClientId.value] = { ...clientCache[editingClientId.value], name: newClient.name, phone: newClient.phone, cpf: newClient.cpf, email: newClient.email };
                showClientModal.value = false;
                newClient.name = ''; newClient.phone = ''; newClient.cpf = ''; newClient.email = ''; newClient.consent = false;
                editingClientId.value = null;
                if(view.value === 'registrations') searchCatalogClients();
                Swal.fire('Atualizado!', 'Dados do cliente salvos.', 'success');
            } else {
                // Novo cliente
                const docRef = await addDoc(collection(db, "clients"), { name: newClient.name, phone: newClient.phone, cpf: newClient.cpf, email: newClient.email, userId: user.value.uid, consent: { accepted: true, at: new Date().toISOString() } }); 
                
                const savedClient = { id: docRef.id, name: newClient.name, phone: newClient.phone, cpf: newClient.cpf, email: newClient.email, userId: user.value.uid };
                
                // Auto-select the new client in appointment modal if it's open
                if (showAppointmentModal.value) {
                    clientCache[docRef.id] = savedClient;
                    selectClient(savedClient);
                }

                showClientModal.value = false; 
                newClient.name = ''; newClient.phone = ''; newClient.cpf = ''; newClient.email = ''; newClient.consent = false; 
                // Limpa filtros de busca — sem exibir o cliente automaticamente
                clientFilter.name = ''; clientFilter.cpf = ''; clientFilter.email = '';
                Swal.fire({ toast:true, position:'bottom', icon:'success', title:'Cliente cadastrado!', timer:2000, showConfirmButton:false }); 
            }
        };
        const saveService = async () => {
            if(!newService.description || !newService.price) return;
            await addDoc(collection(db, "services"), { description: newService.description, price: toNum(newService.price), photo: newService.photo || '', userId: user.value.uid });
            newService.description = ''; newService.price = ''; newService.photo = '';
            showServiceModal.value = false;
            Swal.fire({ toast:true, position:'bottom', icon:'success', title:'Serviço salvo!', timer:2000, showConfirmButton:false });
        };
        const handleServicePhotoUpload = async (e) => {
            const f = e.target.files[0];
            if (!f || !f.type.startsWith('image/')) return;
            try {
                newService.photo = await compressImage(f, 800, 0.7);
                if (newService.photo.length > 850000) {
                    newService.photo = '';
                    Swal.fire('Atenção', 'Foto muito grande mesmo comprimida. Tente outra.', 'warning');
                }
            } catch(err) { console.error(err); }
            e.target.value = '';
        };
        const copyCatalogLink = () => {
            const path = window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/') + 1);
            const url = `${window.location.origin}${path}catalogo.html?uid=${user.value.uid}`;
            navigator.clipboard.writeText(url).then(() => Swal.fire('Copiado!', 'Link do catálogo público copiado.', 'success'));
        };
        const saveExpenseLogic = async () => { const data = { ...newExpense, value: toNum(newExpense.value), userId: user.value.uid }; if (editingExpenseId.value) { await updateDoc(doc(db, "expenses", editingExpenseId.value), data); } else { await addDoc(collection(db, "expenses"), data); } showExpenseModal.value = false; Swal.fire('Salvo','','success'); if (expensesFilter.start && expensesFilter.end) searchExpenses(); loadDashboardData(); };
        const saveCompany = () => { updateDoc(doc(db, "users", user.value.uid), { companyConfig: company }); Swal.fire('Salvo', '', 'success'); };

        // ─── RELATÓRIO SEMANAL POR E-MAIL ─────────────────────
        const sendingReport = ref(false);
        const weeklyReportOptOut = ref(false);
        const sendWeeklyReportNow = async () => {
            sendingReport.value = true;
            try {
                const fn = httpsCallable(functions, 'sendWeeklyReportNow');
                const res = await fn();
                if (res.data?.ok) {
                    Swal.fire({ icon:'success', title:'Enviado!', text: res.data.message, confirmButtonColor:'#6b8a68' });
                } else {
                    Swal.fire({ icon:'info', title:'Sem eventos', text: res.data?.message || 'Nada para enviar agora.', confirmButtonColor:'#6b8a68' });
                }
            } catch(e) {
                console.error(e);
                Swal.fire({ icon:'error', title:'Ops', text:'Não foi possível enviar. Verifique se as Cloud Functions estão publicadas.', confirmButtonColor:'#6b8a68' });
            } finally { sendingReport.value = false; }
        };
        const toggleWeeklyReport = async () => {
            weeklyReportOptOut.value = !weeklyReportOptOut.value;
            try { await updateDoc(doc(db, "users", user.value.uid), { weeklyReportOptOut: weeklyReportOptOut.value }); } catch(e) { console.error(e); }
        };
        const deleteService = async (id) => { await deleteDoc(doc(db, "services", id)); };
        const deleteExpense = async (id) => { const { isConfirmed } = await Swal.fire({ title: 'Excluir?', text: 'Não pode desfazer.', icon: 'warning', showCancelButton: true, confirmButtonColor: '#d33' }); if (isConfirmed) { await deleteDoc(doc(db, "expenses", id)); if (expensesFilter.start && expensesFilter.end) searchExpenses(); loadDashboardData(); Swal.fire('Excluído!', '', 'success'); } };
        const changeStatus = async (app, status) => {
            const {isConfirmed} = await Swal.fire({title: 'Alterar Status?', icon:'question', showCancelButton:true, confirmButtonColor:'#4F46E5'});
            if(!isConfirmed) return;
            await updateDoc(doc(db,"appointments",app.id), {status});
            await logAudit('change_status', `Status de agendamento de ${getClientName(app.clientId)} (${formatDate(app.date)}) alterado para ${statusText(status)}`);
            loadDashboardData();
            if (status === 'concluded') {
                const basePath = window.location.origin + window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/') + 1);
                const reviewLink = `${basePath}review.html?aid=${app.id}&uid=${user.value.uid}`;
                const cli = clientCache[app.clientId];
                const { isConfirmed: share } = await Swal.fire({
                    title: '\u{1F389} Evento conclu\u00EDdo!',
                    html: `Deseja enviar o link de avalia\u00E7\u00E3o para <strong>${cli?.name || 'o cliente'}</strong>?<br><small style="color:#94a3b8">O cliente poder\u00E1 dar de 1 a 5 estrelas e deixar um coment\u00E1rio.</small>`,
                    icon: 'success',
                    showCancelButton: true,
                    confirmButtonText: '\u{1F4F2} Enviar WhatsApp',
                    cancelButtonText: 'S\u00F3 copiar link',
                    confirmButtonColor: '#16A34A',
                });
                if (share && cli?.phone) {
                    const phoneClean = cli.phone.replace(/\D/g,'');
                    const msg = `Ol\u00E1 ${cli.name}! \u{1F389} Foi um prazer realizar seu evento!\n\nQueremos saber como foi sua experi\u00EAncia. Avalie nosso servi\u00E7o (leva menos de 1 minuto):\n${reviewLink}`;
                    window.open(`https://wa.me/55${phoneClean}?text=${encodeURIComponent(msg)}`, '_blank');
                } else if (!share) {
                    navigator.clipboard.writeText(reviewLink).then(() => Swal.fire('Link copiado!', 'Cole e envie para o cliente.', 'success'));
                }
            } else {
                Swal.fire('Feito','','success');
            }
        };
        const handleLogoUpload = (e) => { const f = e.target.files[0]; if(f){ const r=new FileReader(); r.onload=x=>{company.logo=x.target.result; updateDoc(doc(db,"users",user.value.uid),{companyConfig:company});}; r.readAsDataURL(f); }};
        const toggleDarkMode = () => { isDark.value=!isDark.value; document.documentElement.classList.toggle('dark'); };
        const changeCalendarMonth = (off) => { const d = new Date(calendarCursor.value); d.setMonth(d.getMonth() + off); calendarCursor.value = d; };
        const showDayActionModal = ref(false);
        const selectCalendarDay = (d) => {
            if (!d.day) return;
            selectedCalendarDate.value = d.date;
            // Dia livre (sem evento e sem bloqueio) → abre o menu de ação
            const temEvento = pendingAppointments.value.some(a => a.date === d.date);
            if (!temEvento && !isDateBlocked(d.date)) {
                showDayActionModal.value = true;
            }
        };
        // Ações do menu do dia
        const scheduleForSelectedDay = () => {
            showDayActionModal.value = false;
            startNewSchedule();
            tempApp.date = selectedCalendarDate.value; // já preenche a data escolhida
        };
        const blockSelectedDay = () => {
            showDayActionModal.value = false;
            openBlockModal();
        };

        // ─── BLOQUEIO DE AGENDA ───────────────────────────────
        const blockedDates = ref([]);
        const loadBlockedDates = () => {
            onSnapshot(query(collection(db, "blockedDates"), where("userId", "==", user.value.uid)), (snap) => {
                blockedDates.value = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            });
        };
        const isDateBlocked = (dateStr) => blockedDates.value.some(b => b.date === dateStr);
        const blockReasonFor = (dateStr) => { const b = blockedDates.value.find(x => x.date === dateStr); return b ? b.reason : ''; };
        const newBlock = reactive({ date: '', reason: '' });
        const showBlockModal = ref(false);
        const openBlockModal = () => { newBlock.date = selectedCalendarDate.value || today; newBlock.reason = ''; showBlockModal.value = true; };
        const saveBlockedDate = async () => {
            if (!newBlock.date) return Swal.fire('Atenção', 'Escolha uma data.', 'warning');
            // impede bloquear data que já tem evento
            if (pendingAppointments.value.some(a => a.date === newBlock.date)) {
                return Swal.fire('Atenção', 'Já existe evento marcado nesta data. Cancele o evento antes de bloquear.', 'warning');
            }
            try {
                await addDoc(collection(db, "blockedDates"), { userId: user.value.uid, date: newBlock.date, reason: newBlock.reason || 'Indisponível' });
                showBlockModal.value = false;
                Swal.fire({ toast:true, position:'bottom', icon:'success', title:'Data bloqueada', timer:1800, showConfirmButton:false });
            } catch(e) { console.error(e); }
        };
        const removeBlockedDate = async (dateStr) => {
            const b = blockedDates.value.find(x => x.date === dateStr);
            if (!b) return;
            try { await deleteDoc(doc(db, "blockedDates", b.id)); Swal.fire({ toast:true, position:'bottom', icon:'success', title:'Bloqueio removido', timer:1500, showConfirmButton:false }); } catch(e) { console.error(e); }
        };
        const deleteClient = async (id) => { 
    const cli = catalogClientsList.value.find(c => c.id === id); 
    
    const { isConfirmed } = await Swal.fire({
        title: 'Excluir Cliente?',
        text: 'ATENÇÃO: Isto apagará também TODOS os orçamentos e agendamentos vinculados a este cliente. Esta ação não pode ser desfeita!',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonText: 'Cancelar',
        confirmButtonText: 'Sim, excluir tudo'
    }); 

    if (isConfirmed) { 
        try {
            // 1. Busca todas as festas e orçamentos associados a este cliente
            const qApps = query(collection(db, "appointments"), where("clientId", "==", id));
            const snapApps = await getDocs(qApps);
            
            // 2. Apaga todas as festas ligadas a ele (Limpeza de Órfãos) em simultâneo
            const deletePromises = snapApps.docs.map(docSnap => deleteDoc(doc(db, "appointments", docSnap.id)));
            await Promise.all(deletePromises);

            // 3. Finalmente, apaga o registo do cliente
            await deleteDoc(doc(db, "clients", id)); 
            await logAudit('delete_client', `Excluiu cliente (${cli?.name || id}) e ${snapApps.docs.length} evento(s) associado(s)`); 
            
            // 4. Sincroniza todas as listas no ecrã
            searchCatalogClients(); 
            loadDashboardData(); 
            
            Swal.fire('Excluído!', 'O cliente e o seu histórico de eventos foram removidos com sucesso.', 'success');
        } catch (error) {
            console.error("Erro na exclusão em cascata:", error);
            
            // Se o documento já não existir (o tal fantasma), ignora o erro e limpa o ecrã
            if (error.code === 'not-found') {
                searchCatalogClients();
                loadDashboardData();
            } else {
                Swal.fire('Erro', 'Ocorreu um problema ao tentar excluir os dados.', 'error');
            }
        }
    }
};

        // ─── GALERIA DE FOTOS DO EVENTO ───────────────────────
        const showGalleryModal = ref(false);
        const galleryApp = ref(null);
        const galleryPhotos = ref([]);
        const galleryLoading = ref(false);
        const uploadingPhoto = ref(false);

        const compressImage = (file, maxSize = 900, quality = 0.72) => new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    let { width, height } = img;
                    if (width > maxSize || height > maxSize) {
                        const ratio = Math.min(maxSize / width, maxSize / height);
                        width = Math.round(width * ratio);
                        height = Math.round(height * ratio);
                    }
                    const canvas = document.createElement('canvas');
                    canvas.width = width; canvas.height = height;
                    canvas.getContext('2d').drawImage(img, 0, 0, width, height);
                    resolve(canvas.toDataURL('image/jpeg', quality));
                };
                img.onerror = reject;
                img.src = e.target.result;
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });

        const openGalleryModal = async (app) => {
            galleryApp.value = app;
            galleryPhotos.value = [];
            galleryLoading.value = true;
            showGalleryModal.value = true;
            try {
                const snap = await getDocs(query(collection(db, 'eventPhotos'), where('appointmentId', '==', app.id)));
                galleryPhotos.value = snap.docs.map(d => ({ id: d.id, ...d.data() }))
                    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
            } catch(e) { console.error(e); }
            finally { galleryLoading.value = false; }
        };

        const handlePhotoUpload = async (e) => {
            const files = Array.from(e.target.files || []);
            if (!files.length || !galleryApp.value) return;
            uploadingPhoto.value = true;
            try {
                for (const file of files) {
                    if (!file.type.startsWith('image/')) continue;
                    const data = await compressImage(file);
                    if (data.length > 950000) {
                        Swal.fire('Atenção', `A foto "${file.name}" ficou grande demais mesmo comprimida e foi ignorada.`, 'warning');
                        continue;
                    }
                    const docRef = await addDoc(collection(db, 'eventPhotos'), {
                        appointmentId: galleryApp.value.id,
                        clientId: galleryApp.value.clientId || '',
                        userId: user.value.uid,
                        data,
                        highlight: false,
                        createdAt: new Date().toISOString()
                    });
                    galleryPhotos.value.unshift({ id: docRef.id, appointmentId: galleryApp.value.id, clientId: galleryApp.value.clientId || '', userId: user.value.uid, data, highlight: false, createdAt: new Date().toISOString() });
                }
                Swal.fire({ toast:true, position:'bottom', icon:'success', title:'Fotos adicionadas!', timer:2000, showConfirmButton:false });
            } catch(err) {
                console.error(err);
                Swal.fire('Erro', 'Não foi possível enviar as fotos.', 'error');
            } finally {
                uploadingPhoto.value = false;
                e.target.value = '';
            }
        };

        const toggleHighlight = async (photo) => {
            try {
                await updateDoc(doc(db, 'eventPhotos', photo.id), { highlight: !photo.highlight });
                photo.highlight = !photo.highlight;
                Swal.fire({ toast:true, position:'bottom', icon:'success', title: photo.highlight ? 'Adicionada ao portfólio ⭐' : 'Removida do portfólio', timer:1800, showConfirmButton:false });
            } catch(e) { console.error(e); }
        };

        const deletePhoto = async (photoId) => {
            const { isConfirmed } = await Swal.fire({ title:'Excluir foto?', text:'Não pode desfazer.', icon:'warning', showCancelButton:true, confirmButtonColor:'#dc2626' });
            if (!isConfirmed) return;
            await deleteDoc(doc(db, 'eventPhotos', photoId));
            galleryPhotos.value = galleryPhotos.value.filter(p => p.id !== photoId);
        };

        const copyPortfolioLink = () => {
            const path = window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/') + 1);
            const url = `${window.location.origin}${path}portfolio.html?uid=${user.value.uid}`;
            navigator.clipboard.writeText(url).then(() => Swal.fire('Copiado!', 'Link do portfólio público copiado.', 'success'));
        };

        // ─── RESUMO DO DIA ────────────────────────────────────
        const dayGreeting = computed(() => {
            const h = new Date().getHours();
            return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
        });
        const todayEvents = computed(() => pendingAppointments.value.filter(a => a.date === today));
        const daySummaryText = computed(() => {
            const parts = [];
            const ev = todayEvents.value.length;
            const bud = budgetList.value.length;
            const over = overdueEvents.value.length;
            if (ev) parts.push(`${ev} evento${ev>1?'s':''} hoje`);
            if (bud) parts.push(`${bud} orçamento${bud>1?'s':''} aguardando resposta`);
            if (over) parts.push(`${over} pagamento${over>1?'s':''} em atraso`);
            if (!parts.length) return 'Nenhuma pendência para hoje. Aproveite para prospectar! ✨';
            return 'Você tem ' + parts.join(', ').replace(/, ([^,]*)$/, ' e $1') + '.';
        });

        // ─── ONBOARDING GUIADO ────────────────────────────────
        const onboardingDismissed = ref(false);
        const hasClients = ref(true);       // otimista até checar
        const hasAppointments = ref(true);
        const checkOnboarding = async () => {
            onboardingDismissed.value = localStorage.getItem('pp_onboarding_' + user.value.uid) === '1';
            if (onboardingDismissed.value) return;
            try {
                const [cSnap, aSnap] = await Promise.all([
                    getDocs(query(collection(db, 'clients'), where('userId', '==', user.value.uid))),
                    getDocs(query(collection(db, 'appointments'), where('userId', '==', user.value.uid)))
                ]);
                hasClients.value = !cSnap.empty;
                hasAppointments.value = !aSnap.empty;
            } catch(e) { console.error(e); }
        };
        const onboardingSteps = computed(() => [
            { k:'service', label:'Cadastre seu primeiro serviço', icon:'fa-tag',      done: services.value.length > 0 },
            { k:'client',  label:'Cadastre seu primeiro cliente', icon:'fa-user-plus', done: hasClients.value },
            { k:'event',   label:'Crie seu primeiro agendamento', icon:'fa-calendar-plus', done: hasAppointments.value },
        ]);
        const onboardingProgress = computed(() => onboardingSteps.value.filter(s => s.done).length);
        const showOnboarding = computed(() => !onboardingDismissed.value && onboardingProgress.value < 3);
        const dismissOnboarding = () => {
            onboardingDismissed.value = true;
            localStorage.setItem('pp_onboarding_' + user.value.uid, '1');
        };
        const onboardingAction = (step) => {
            if (step.k === 'service') { view.value = 'registrations'; registrationTab.value = 'services'; showServiceModal.value = true; }
            else if (step.k === 'client') { view.value = 'registrations'; registrationTab.value = 'clients'; showClientModal.value = true; }
            else { startNewSchedule(); }
        };

        // ─── ATALHOS DE TECLADO ───────────────────────────────
        const showShortcutsModal = ref(false);
        const closeTopModal = () => {
            const modals = [showShortcutsModal, showDayActionModal, showServiceInfoModal, showServicePickerModal, showBalloonModal, showBlockModal, showGalleryModal, showInventoryModal, showExpenseModal, showClientHistoryModal, showClientModal, showServiceModal, showGoalModal, showAppointmentModal, showReceiptModal, showSignatureModal];
            for (const m of modals) {
                if (m.value) { m.value = false; return true; }
            }
            return false;
        };
        const handleKeydown = (e) => {
            if (!user.value) return;
            const tag = (e.target.tagName || '').toLowerCase();
            const typing = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable;
            if (e.key === 'Escape') { closeTopModal(); return; }
            if (typing) return;
            if (e.key === 'n' || e.key === 'N') { e.preventDefault(); startNewSchedule(); }
            else if (e.key === '?') { e.preventDefault(); showShortcutsModal.value = true; }
        };
        window.addEventListener('keydown', handleKeydown);

        // ─── ENVIAR AVALIAÇÃO A PARTIR DO CLIENTE ─────────────
        const sendReviewLinkForClient = async (c) => {
            if (!c.phone) return Swal.fire('Atenção', 'Cliente sem telefone cadastrado.', 'warning');
            try {
                const snap = await getDocs(query(collection(db, 'appointments'), where('clientId', '==', c.id)));
                const candidate = snap.docs.map(sanitizeApp)
                    .filter(a => a.status === 'concluded' && !a.review?.rating)
                    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];
                if (!candidate) {
                    return Swal.fire({ icon:'info', title:'Nada pendente', text:'Este cliente não tem eventos concluídos aguardando avaliação.', confirmButtonColor:'#0f4c81' });
                }
                clientCache[c.id] = c; // garante nome/telefone no cache
                sendReviewWhatsApp(candidate);
            } catch(e) { console.error(e); }
        };

        // ─── CONFIRMAÇÃO DE CADASTRO + PREVIEW ────────────────
        const sendRegistrationConfirmation = (c) => {
            if (!c.phone) return Swal.fire('Atenção', 'Cliente sem telefone cadastrado.', 'warning');
            const phoneClean = c.phone.replace(/\D/g, '');
            const path = window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/') + 1);
            const link = `${window.location.origin}${path}client.html?uid=${user.value.uid}`;
            const nome = (c.name || '').split(' ')[0];
            const acesso = c.cpf ? 'seu CPF' : (c.email ? 'seu e-mail' : 'seu CPF ou e-mail');
            const msg = `Olá ${nome}! 🎉 Seu cadastro foi confirmado com sucesso na ${company.fantasia || 'nossa empresa'}!\n\nVocê já pode acessar sua Área do Cliente para acompanhar seus eventos, contratos e fotos:\n${link}\n\nPara entrar, use ${acesso}. Qualquer dúvida, é só chamar! 😊`;
            window.open(`https://wa.me/55${phoneClean}?text=${encodeURIComponent(msg)}`, '_blank');
        };
        const previewClientArea = (c) => {
            const path = window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/') + 1);
            const exp = (Date.now() + 30 * 60 * 1000).toString(36);
            const url = `${window.location.origin}${path}client.html?uid=${user.value.uid}&cid=${c.id}&preview=1&exp=${exp}`;
            window.open(url, '_blank');
        };

        // ─── RADAR DE RECONTRATAÇÃO ───────────────────────────
        const recontractRadar = ref([]);
        const loadRecontractRadar = async () => {
            try {
                const snap = await getDocs(query(collection(db, "appointments"), where("userId", "==", user.value.uid)));
                const apps = snap.docs.map(sanitizeApp);
                const now = new Date();
                const lastByClient = {};   // último evento concluído por cliente
                const hasFuture = {};      // cliente já tem evento pendente/futuro?
                apps.forEach(a => {
                    if (!a.clientId || !a.date) return;
                    if (a.status === 'pending' || a.status === 'budget') { hasFuture[a.clientId] = true; return; }
                    if (a.status !== 'concluded') return;
                    if (!lastByClient[a.clientId] || a.date > lastByClient[a.clientId].date) lastByClient[a.clientId] = a;
                });
                recontractRadar.value = Object.values(lastByClient)
                    .map(a => {
                        const monthsSince = Math.floor((now - new Date(a.date + 'T00:00:00')) / (30.44 * 86400000));
                        return { ...a, monthsSince };
                    })
                    .filter(a => a.monthsSince >= 10 && a.monthsSince <= 14 && !hasFuture[a.clientId])
                    .sort((a, b) => b.monthsSince - a.monthsSince);
                recontractRadar.value.forEach(a => fetchClientToCache(a.clientId));
            } catch(e) { console.error('Radar:', e); }
        };
        const sendRecontractWhatsApp = (item) => {
            const cli = clientCache[item.clientId];
            if (!cli?.phone) return Swal.fire('Atenção', 'Cliente sem telefone cadastrado.', 'warning');
            const phoneClean = cli.phone.replace(/\D/g, '');
            const nome = (cli.name || '').split(' ')[0];
            const msg = `Olá ${nome}! Tudo bem? 😊\n\nEstá chegando a época do aniversário de novo! 🎂 No ano passado tivemos o prazer de fazer a festa de vocês em ${formatDate(item.date)} e foi incrível.\n\nJá quer garantir a data deste ano? Temos novidades no catálogo e condições especiais para quem já é cliente! 🎉`;
            window.open(`https://wa.me/55${phoneClean}?text=${encodeURIComponent(msg)}`, '_blank');
        };

        // ─── PAINEL DE REPUTAÇÃO ──────────────────────────────
        const allReviews = ref([]);
        const reputationTotal = computed(() => allReviews.value.length);
        const reputationAvg = computed(() => {
            if (!allReviews.value.length) return 0;
            return (allReviews.value.reduce((a, r) => a + (r.rating || 0), 0) / allReviews.value.length).toFixed(1);
        });
        const reputationDist = computed(() => {
            const dist = [5,4,3,2,1].map(star => {
                const count = allReviews.value.filter(r => r.rating === star).length;
                const pct = allReviews.value.length ? Math.round(count / allReviews.value.length * 100) : 0;
                return { star, count, pct };
            });
            return dist;
        });
        const reputationRecent = computed(() =>
            allReviews.value
                .filter(r => (r.comment || '').trim())
                .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
                .slice(0, 3)
        );

        // ─── LUCRATIVIDADE POR EVENTO ─────────────────────────
        const expenseLinkOptions = ref([]);
        const loadExpenseLinkOptions = async () => {
            try {
                const snap = await getDocs(query(collection(db, "appointments"), where("userId", "==", user.value.uid)));
                expenseLinkOptions.value = snap.docs.map(sanitizeApp)
                    .filter(a => a.status === 'pending' || a.status === 'concluded')
                    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
                    .slice(0, 60);
                expenseLinkOptions.value.forEach(a => fetchClientToCache(a.clientId));
            } catch(e) { console.error(e); }
        };

        const profitLoading = ref(false);
        const profitRanking = ref([]);
        const loadProfitability = async () => {
            profitLoading.value = true;
            try {
                const [appSnap, expSnap] = await Promise.all([
                    getDocs(query(collection(db, "appointments"), where("userId", "==", user.value.uid))),
                    getDocs(query(collection(db, "expenses"), where("userId", "==", user.value.uid)))
                ]);
                const costByApp = {};
                expSnap.docs.forEach(d => {
                    const e = d.data();
                    if (e.appointmentId) costByApp[e.appointmentId] = (costByApp[e.appointmentId] || 0) + toNum(e.value);
                });
                profitRanking.value = appSnap.docs.map(sanitizeApp)
                    .filter(a => a.status === 'concluded' || a.status === 'pending')
                    .map(a => {
                        const revenue = toNum(a.totalServices);
                        const cost = costByApp[a.id] || 0;
                        const margin = revenue - cost;
                        const marginPct = revenue > 0 ? Math.round(margin / revenue * 100) : 0;
                        return { ...a, revenue, cost, margin, marginPct };
                    })
                    .sort((a, b) => b.margin - a.margin);
                profitRanking.value.forEach(a => fetchClientToCache(a.clientId));
            } catch(e) { console.error(e); }
            finally { profitLoading.value = false; }
        };

        // ─── INVENTORY CRUD ───────────────────────────────────
        const loadInventory = () => {
            if (!user.value) return;
            import('../js/firebase.js').then(({ collection, onSnapshot, query, where, db }) => {
                onSnapshot(query(collection(db, 'inventory'), where('userId', '==', user.value.uid)), snap => {
                    inventoryItems.value = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                });
            }).catch(() => {});
        };
        const saveInventoryItem = async () => {
            if (!newInventory.name.trim() || !newInventory.category || newInventory.qty < 0) {
                return Swal.fire('Atenção', 'Preencha nome, categoria e quantidade.', 'warning');
            }
            const { db, collection, doc, addDoc, updateDoc } = await import('./firebase.js');
            const payload = { name: newInventory.name.trim(), category: newInventory.category, qty: newInventory.qty, notes: newInventory.notes.trim(), userId: user.value.uid };
            if (editingInventoryId.value) {
                await updateDoc(doc(db, 'inventory', editingInventoryId.value), payload);
                Swal.fire({ toast:true, position:'bottom', icon:'success', title:'Item atualizado!', timer:2000, showConfirmButton:false });
            } else {
                await addDoc(collection(db, 'inventory'), payload);
                Swal.fire({ toast:true, position:'bottom', icon:'success', title:'Item adicionado!', timer:2000, showConfirmButton:false });
            }
            closeInventoryModal();
        };
        const closeInventoryModal = () => {
            showInventoryModal.value = false;
            editingInventoryId.value = null;
            newInventory.name = ''; newInventory.category = ''; newInventory.qty = 0; newInventory.notes = '';
        };
        const editInventoryItem = (item) => {
            editingInventoryId.value = item.id;
            newInventory.name = item.name; newInventory.category = item.category; newInventory.qty = item.qty; newInventory.notes = item.notes || '';
            showInventoryModal.value = true;
        };
        const deleteInventoryItem = async (id) => {
            const { isConfirmed } = await Swal.fire({ title:'Remover item?', icon:'question', showCancelButton:true, confirmButtonColor:'#dc2626' });
            if (!isConfirmed) return;
            const { db, doc, deleteDoc } = await import('./firebase.js');
            await deleteDoc(doc(db, 'inventory', id));
        };

        return {
            user, view, isDark, authForm, authLoading, isRegistering, handleAuth, logout, isGlobalLoading,
            dashboardMonth, financeData, next7DaysApps, statementList, isExtractLoaded,
            filteredSummary,
            expensesFilter, searchExpenses,
            showExpenseModal, newExpense, addExpense: saveExpenseLogic, saveExpenseLogic, openNewExpense, openEditExpense, deleteExpense, editingExpenseId,
            startNewSchedule, editAppointment, saveAppointment, showAppointmentModal, showClientModal, showServiceModal, newService, saveService, deleteService, handleServicePhotoUpload, copyCatalogLink,
            newClient, saveClient, tempApp, tempServiceSelect, services, totalServices, finalBalance, isEditing, clientSearchTerm, filteredClientsSearch, selectClient,
            addServiceToApp, removeServiceFromApp, appointmentViewMode, calendarGrid, calendarTitle, changeCalendarMonth, selectCalendarDay, selectedCalendarDate, appointmentsOnSelectedDate, showDayActionModal, scheduleForSelectedDay, blockSelectedDay, blockedDates, isDateBlocked, blockReasonFor, newBlock, showBlockModal, openBlockModal, saveBlockedDate, removeBlockedDate, filteredListAppointments,
            catalogClientsList, catalogClientSearch, searchCatalogClients, openClientModal, openEditClient, editingClientId, deleteClient, currentReceipt, showReceipt, showReceiptModal,
            catalogClientsDisplayList, catalogSearched, clientFilter, clearClientFilter,
            serviceSearch, serviceMaxPrice, servicesDisplayList, servicesSearched, searchServices, clearServiceFilter,
            company, handleLogoUpload, saveCompany, sendWeeklyReportNow, sendingReport, weeklyReportOptOut, toggleWeeklyReport, downloadReceiptImage, generateContractPDF, openWhatsApp, formatCurrency, formatDate, getDay, getMonth, statusText, getClientName,
            toggleDarkMode, expenseCategories, expensesByCategoryStats, agendaTab, agendaFilter, searchHistory, changeStatus, registrationTab, kpiPendingReceivables, totalAppointmentsCount, topExpenseCategory, getCategoryIcon, maskPhone, maskCPF, normalizePhoneDigits, servicesSubtotal, incServiceQty, decServiceQty, serviceLineTotal, syncBalloonChecklist, showServiceInfoModal, serviceInfo, openServiceInfo, showServicePickerModal, showBalloonModal,
            copyClientLink, budgetList, saveAsBudget, approveBudget, pendingAppointments,
            openSignatureModal, clearSignature, saveSignature, showSignatureModal,
            downloadClientReceipt,
            financeTab, rankingData,
            // Novas features
            urgentEvents, overdueEvents,
            monthlyGoal, goalProgress, showGoalModal, tempGoal, saveMonthlyGoal,
            generateMonthlyReport, exportBackupJSON,
            showAuditModal, auditLog, loadAuditLog,
            installmentValue,
            showEmailJSModal,
            // Checklist
            addChecklistItem, removeChecklistItem, toggleChecklistItem, checklistProgress, newChecklistItem, saveChecklistInline,
            // Ranking clientes
            clientRankingData, clientRankingLoading, loadClientRanking,
            // Comparativo mensal
            monthlyChartData, monthlyChartLoading, loadMonthlyChart,
            // Histórico cliente
            showClientHistoryModal, clientHistoryData, clientHistoryApps, clientHistoryLoading, openClientHistory, clientHistoryTotal, clientAvgRating, generateReviewLink, copyReviewLink, sendReviewWhatsApp,
            // Tema
            applyThemeColor,
            // Inventário / Acervo
            showInventoryModal, inventoryItems, inventoryFiltered, inventoryCategories, inventoryCatFilter,
            newInventory, saveInventoryItem, closeInventoryModal, editInventoryItem, deleteInventoryItem, editingInventoryId,
            getCatIcon, getCatColor,
            // Moodboard
            moodboardSearch, moodboardFiltered, getMoodboardIcon, isServiceSelected, toggleMoodboardService,
            // Galeria de fotos
            showGalleryModal, galleryApp, galleryPhotos, galleryLoading, uploadingPhoto,
            openGalleryModal, handlePhotoUpload, toggleHighlight, deletePhoto, copyPortfolioLink,
            // Reputação
            allReviews, reputationTotal, reputationAvg, reputationDist, reputationRecent,
            // Radar de recontratação
            recontractRadar, loadRecontractRadar, sendRecontractWhatsApp,
            // Confirmação de cadastro + preview
            sendRegistrationConfirmation, previewClientArea, sendReviewLinkForClient,
            // Resumo do dia
            dayGreeting, todayEvents, daySummaryText,
            // Onboarding
            showOnboarding, onboardingSteps, onboardingProgress, dismissOnboarding, onboardingAction,
            // Atalhos
            showShortcutsModal,
            // Lucratividade
            expenseLinkOptions, profitLoading, profitRanking, loadProfitability,
        };
    }
}).mount('#app');
