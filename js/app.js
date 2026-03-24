const { createApp, ref, computed, reactive, onMounted, watch } = Vue;

import { 
    db, auth, 
    collection, addDoc, onSnapshot, doc, updateDoc, deleteDoc, getDocs, query, where, setDoc, getDoc, 
    signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged
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
        const company = reactive({ fantasia: '', logo: '', signature: '', cnpj: '', email: '', phone: '', rua: '', bairro: '', cidade: '', estado: '' });

        // Dados
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
        const appointmentViewMode = ref('list');
        const calendarCursor = ref(new Date());
        const selectedCalendarDate = ref(null);
        const registrationTab = ref('clients');
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
        const showSignatureModal = ref(false);
        const signatureApp = ref(null);
        const signatureMode = ref('company');

        // Forms
        const newClient = reactive({ name: '', phone: '', cpf: '', email: '' });
        const editingClientId = ref(null);
        const newService = reactive({ description: '', price: '' });
        const newExpense = reactive({ description: '', value: '', date: today, category: 'outros' });
        const tempServiceSelect = ref('');
        const tempApp = reactive({ clientId: '', date: '', time: '', location: { bairro: '' }, details: { entryFee: 0, balloonColors: '' }, notes: '', selectedServices: [], checklist: [] });

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
            onAuthStateChanged(auth, async (u) => {
                user.value = u;
                if (u) {
                    if (u.isAnonymous) { isGlobalLoading.value = false; return; }
                    await loadDashboardData();
                    searchExpenses();
                    syncData();
                    const uDoc = await getDoc(doc(db, "users", u.uid));
                    if (uDoc.exists() && uDoc.data().companyConfig) Object.assign(company, uDoc.data().companyConfig);
                }
                setTimeout(() => { isGlobalLoading.value = false; }, 800);
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
        const maskPhone = (v) => { if(!v) return ""; v=v.replace(/\D/g,"").replace(/^(\d{2})(\d)/g,"($1) $2").replace(/(\d)(\d{4})$/,"$1-$2"); return v; };
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

        const totalServices = computed(() => tempApp.selectedServices.reduce((s,i) => s + toNum(i.price), 0));
        const finalBalance = computed(() => totalServices.value - toNum(tempApp.details.entryFee));
        const kpiRevenue = computed(() => dashboardData.appointments.filter(a => a.status !== 'budget').reduce((acc, a) => acc + toNum(a.totalServices), 0));
        const kpiExpenses = computed(() => dashboardData.expenses.reduce((acc, e) => acc + toNum(e.value), 0));
        const financeData = computed(() => ({ revenue: kpiRevenue.value, expenses: kpiExpenses.value, profit: kpiRevenue.value - kpiExpenses.value }));
        const kpiPendingReceivables = computed(() => dashboardData.appointments.filter(a => a.status === 'pending').reduce((acc, a) => acc + toNum(a.finalBalance), 0));
        const totalAppointmentsCount = computed(() => dashboardData.appointments.filter(a => a.status !== 'budget').length);
        const expensesByCategoryStats = computed(() => { if (!dashboardData.expenses.length) return []; return expenseCategories.map(cat => { const total = dashboardData.expenses.filter(e => e.category === cat.id).reduce((sum, e) => sum + toNum(e.value), 0); return { ...cat, total }; }).filter(c => c.total > 0).sort((a, b) => b.total - a.total); });
        const topExpenseCategory = computed(() => expensesByCategoryStats.value[0] || null);
        
        const next7DaysApps = computed(() => { 
            const now = new Date(); now.setHours(0,0,0,0);
            const nextWeek = new Date(now); nextWeek.setDate(now.getDate() + 7);
            const startStr = now.toISOString().split('T')[0];
            const endStr = nextWeek.toISOString().split('T')[0];
            return pendingAppointments.value.filter(a => a.date >= startStr && a.date <= endStr).sort((a,b) => a.date.localeCompare(b.date)).slice(0,6); 
        });
        
        const calendarGrid = computed(() => { const year = calendarCursor.value.getFullYear(); const month = calendarCursor.value.getMonth(); const firstDay = new Date(year, month, 1).getDay(); const daysInMonth = new Date(year, month + 1, 0).getDate(); const days = []; for (let i = 0; i < firstDay; i++) days.push({ day: '', date: null }); for (let i = 1; i <= daysInMonth; i++) { const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`; days.push({ day: i, date: dateStr, hasEvent: pendingAppointments.value.some(a => a.date === dateStr) }); } return days; });
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
            const term = catalogClientSearch.value.toLowerCase().trim();
            const q = query(collection(db, "clients"), where("userId", "==", user.value.uid)); 
            const snap = await getDocs(q); 
            catalogClientsList.value = snap.docs.map(d => ({id: d.id, ...d.data()})).filter(c => c.name.toLowerCase().includes(term)); 
        };

        // --- ACTIONS ---
        const handleAuth = async () => { authLoading.value = true; try { if (isRegistering.value) { const res = await createUserWithEmailAndPassword(auth, authForm.email, authForm.password); await setDoc(doc(db, "users", res.user.uid), { email: authForm.email, role: 'user', createdAt: new Date().toISOString(), companyConfig: { fantasia: authForm.name || 'Minha Empresa', email: authForm.email } }); } else { await signInWithEmailAndPassword(auth, authForm.email, authForm.password); } } catch (e) { Swal.fire('Ops', 'Erro no login.', 'error'); } finally { authLoading.value = false; } };
        const copyClientLink = () => { const path = window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/') + 1); const url = `${window.location.origin}${path}client.html?uid=${user.value.uid}`; navigator.clipboard.writeText(url).then(() => Swal.fire('Copiado!', 'Link da Área do Cliente copiado.', 'success')); };
        const saveAppointment = async () => { const data = { ...tempApp, totalServices: totalServices.value, finalBalance: finalBalance.value, userId: user.value.uid, status: 'pending' }; if (isEditing.value) await updateDoc(doc(db, "appointments", editingId.value), data); else await addDoc(collection(db, "appointments"), data); showAppointmentModal.value = false; loadDashboardData(); };
        
        // CORREÇÃO: Mapeia o valor da entrada para o campo entryFee esperado pelo HTML do recibo
        const showReceipt = (app) => { 
            const sanitized = sanitizeApp(app);
            // Garante que o entryFee esteja disponível no nível superior para o template
            sanitized.entryFee = sanitized.details?.entryFee || 0;
            currentReceipt.value = sanitized; 
            showReceiptModal.value = true; 
        };

        const logout = () => { signOut(auth); window.location.href="index.html"; };
        const openNewExpense = () => { editingExpenseId.value = null; Object.assign(newExpense, { description: '', value: '', date: today, category: 'outros' }); showExpenseModal.value = true; };
        const openEditExpense = (expense) => { editingExpenseId.value = expense.id; Object.assign(newExpense, { description: expense.description, value: expense.value, date: expense.date, category: expense.category }); showExpenseModal.value = true; };
        
        const downloadReceiptImage = () => { html2canvas(document.getElementById('receipt-capture-area')).then(c => { const l = document.createElement('a'); l.download = 'Recibo.png'; l.href = c.toDataURL(); l.click(); }); };
        const openWhatsApp = (app) => { const cli = clientCache[app.clientId]; if (!cli || !cli.phone) return Swal.fire('Erro', 'Cliente sem telefone cadastrado.', 'error'); const phoneClean = cli.phone.replace(/\D/g, ''); const msg = `Olá ${cli.name}, aqui é da ${company.fantasia}. Segue o comprovante do seu agendamento para o dia ${formatDate(app.date)}.`; window.open(`https://wa.me/55${phoneClean}?text=${encodeURIComponent(msg)}`, '_blank'); };
        
        const selectClient = (client) => { 
            tempApp.clientId = client.id; 
            clientSearchTerm.value = client.name; 
            selectedClientNameLock.value = client.name;
        };
        
        const addServiceToApp = () => { if(tempServiceSelect.value) tempApp.selectedServices.push(tempServiceSelect.value); tempServiceSelect.value=''; };
        const removeServiceFromApp = (i) => tempApp.selectedServices.splice(i,1);
        const startNewSchedule = () => { isEditing.value=false; clientSearchTerm.value = ''; Object.assign(tempApp, { clientId:'', date:'', time:'', location:{bairro:''}, details:{entryFee:0}, selectedServices:[]}); showAppointmentModal.value = true; };
        const editAppointment = (app) => { isEditing.value=true; editingId.value=app.id; Object.assign(tempApp, JSON.parse(JSON.stringify(app))); clientSearchTerm.value = getClientName(app.clientId); showAppointmentModal.value=true; };
        
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
                const clauses = [ "1. RESERVA: O pagamento do sinal garante a reserva da data.", "2. DESISTÊNCIA: Em caso de cancelamento com menos de 15 dias, o sinal não será devolvido.", "3. DANOS: O CONTRATANTE responsabiliza-se pela conservação dos materiais.", "4. PAGAMENTO: O restante deve ser pago até a data do evento.", "5. MONTAGEM: O local deve estar liberado no horário combinado." ]; 
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
            newClient.name = ''; newClient.phone = ''; newClient.cpf = ''; newClient.email = '';
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

            if (editingClientId.value) {
                // Editar cliente existente
                await updateDoc(doc(db, 'clients', editingClientId.value), {
                    name: newClient.name, phone: newClient.phone, cpf: newClient.cpf, email: newClient.email
                });
                // Atualiza cache
                clientCache[editingClientId.value] = { ...clientCache[editingClientId.value], name: newClient.name, phone: newClient.phone, cpf: newClient.cpf, email: newClient.email };
                showClientModal.value = false;
                newClient.name = ''; newClient.phone = ''; newClient.cpf = ''; newClient.email = '';
                editingClientId.value = null;
                if(view.value === 'registrations') searchCatalogClients();
                Swal.fire('Atualizado!', 'Dados do cliente salvos.', 'success');
            } else {
                // Novo cliente
                const docRef = await addDoc(collection(db, "clients"), { name: newClient.name, phone: newClient.phone, cpf: newClient.cpf, email: newClient.email, userId: user.value.uid }); 
                
                const savedClient = { id: docRef.id, name: newClient.name, phone: newClient.phone, cpf: newClient.cpf, email: newClient.email, userId: user.value.uid };
                
                // Auto-select the new client in appointment modal if it's open
                if (showAppointmentModal.value) {
                    clientCache[docRef.id] = savedClient;
                    selectClient(savedClient);
                }

                showClientModal.value = false; 
                newClient.name = ''; newClient.phone = ''; newClient.cpf = ''; newClient.email = ''; 
                if(view.value === 'registrations') searchCatalogClients(); 
                Swal.fire('Salvo!', '', 'success'); 
            }
        };
        const saveService = async () => { if(!newService.description || !newService.price) return; await addDoc(collection(db, "services"), { description: newService.description, price: toNum(newService.price), userId: user.value.uid }); newService.description = ''; newService.price = ''; showServiceModal.value = false; };
        const saveExpenseLogic = async () => { const data = { ...newExpense, value: toNum(newExpense.value), userId: user.value.uid }; if (editingExpenseId.value) { await updateDoc(doc(db, "expenses", editingExpenseId.value), data); } else { await addDoc(collection(db, "expenses"), data); } showExpenseModal.value = false; Swal.fire('Salvo','','success'); if (expensesFilter.start && expensesFilter.end) searchExpenses(); loadDashboardData(); };
        const saveCompany = () => { updateDoc(doc(db, "users", user.value.uid), { companyConfig: company }); Swal.fire('Salvo', '', 'success'); };
        const deleteClient = async (id) => { if((await Swal.fire({title:'Excluir?',showCancelButton:true})).isConfirmed) { await deleteDoc(doc(db,"clients",id)); searchCatalogClients(); }};
        const deleteService = async (id) => { await deleteDoc(doc(db, "services", id)); };
        const deleteExpense = async (id) => { const { isConfirmed } = await Swal.fire({ title: 'Excluir?', text: 'Não pode desfazer.', icon: 'warning', showCancelButton: true, confirmButtonColor: '#d33' }); if (isConfirmed) { await deleteDoc(doc(db, "expenses", id)); if (expensesFilter.start && expensesFilter.end) searchExpenses(); loadDashboardData(); Swal.fire('Excluído!', '', 'success'); } };
        const changeStatus = async (app, status) => { const {isConfirmed} = await Swal.fire({title: 'Alterar Status?', icon:'question', showCancelButton:true}); if(isConfirmed) { await updateDoc(doc(db,"appointments",app.id), {status:status}); Swal.fire('Feito','','success'); loadDashboardData(); } };
        const handleLogoUpload = (e) => { const f = e.target.files[0]; if(f){ const r=new FileReader(); r.onload=x=>{company.logo=x.target.result; updateDoc(doc(db,"users",user.value.uid),{companyConfig:company});}; r.readAsDataURL(f); }};
        const toggleDarkMode = () => { isDark.value=!isDark.value; document.documentElement.classList.toggle('dark'); };
        const changeCalendarMonth = (off) => { const d = new Date(calendarCursor.value); d.setMonth(d.getMonth() + off); calendarCursor.value = d; };
        const selectCalendarDay = (d) => { if(d.day) selectedCalendarDate.value = d.date; };

        return {
            user, view, isDark, authForm, authLoading, isRegistering, handleAuth, logout, isGlobalLoading,
            dashboardMonth, financeData, next7DaysApps, statementList, isExtractLoaded, 
            filteredSummary, 
            expensesFilter, searchExpenses,
            showExpenseModal, newExpense, addExpense: saveExpenseLogic, saveExpenseLogic, openNewExpense, openEditExpense, deleteExpense, editingExpenseId,
            startNewSchedule, editAppointment, saveAppointment, showAppointmentModal, showClientModal, showServiceModal, newService, saveService, deleteService,
            newClient, saveClient, tempApp, tempServiceSelect, services, totalServices, finalBalance, isEditing, clientSearchTerm, filteredClientsSearch, selectClient,
            addServiceToApp, removeServiceFromApp, appointmentViewMode, calendarGrid, calendarTitle, changeCalendarMonth, selectCalendarDay, selectedCalendarDate, appointmentsOnSelectedDate, filteredListAppointments,
            catalogClientsList, catalogClientSearch, searchCatalogClients, openClientModal, openEditClient, editingClientId, deleteClient, currentReceipt, showReceipt, showReceiptModal,
            company, handleLogoUpload, saveCompany, downloadReceiptImage, generateContractPDF, openWhatsApp, formatCurrency, formatDate, getDay, getMonth, statusText, getClientName, 
            toggleDarkMode, expenseCategories, expensesByCategoryStats, agendaTab, agendaFilter, searchHistory, changeStatus, registrationTab, kpiPendingReceivables, totalAppointmentsCount, topExpenseCategory, getCategoryIcon, maskPhone, maskCPF,
            
            copyClientLink, budgetList, saveAsBudget, approveBudget, pendingAppointments,
            openSignatureModal, clearSignature, saveSignature, showSignatureModal, 
            downloadClientReceipt,
            financeTab, rankingData
        };
    }
}).mount('#app');
