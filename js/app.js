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
        
        // Configuração da Empresa (Incluindo nova Assinatura)
        const company = reactive({ 
            fantasia: '', logo: '', signature: '', // <--- Nova Assinatura do Organizador
            cnpj: '', email: '', phone: '', rua: '', bairro: '', cidade: '', estado: '' 
        });

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

        // --- PORTAL E ASSINATURAS ---
        const loginMode = ref('provider'); 
        const clientAccessInput = ref('');
        const clientData = ref(null);
        const clientAppointments = ref([]);
        const showSignatureModal = ref(false);
        const signatureApp = ref(null);
        const signatureMode = ref('appointment'); // 'appointment' (Cliente) ou 'company' (Organizador)
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
            return { 
                id: d.id || data.id, ...data, 
                selectedServices: data.selectedServices || [], 
                details: data.details || {entryFee:0, balloonColors:''}, 
                checklist: data.checklist || [],
                clientSignature: data.clientSignature || ''
            };
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
                // Permite Orçamentos e Pendentes
                clientAppointments.value = snapApps.docs.map(sanitizeApp).filter(a => a.status !== 'cancelled').sort((a,b) => b.date.localeCompare(a.date));
                view.value = 'client-portal';
                
                if (clientAppointments.value.length > 0 && !targetProviderId.value) {
                    const uDoc = await getDoc(doc(db, "users", clientAppointments.value[0].userId));
                    if (uDoc.exists() && uDoc.data().companyConfig) Object.assign(company, uDoc.data().companyConfig);
                }
            } catch (e) { Swal.fire('Erro', 'Dados não encontrados.', 'error'); }
            finally { authLoading.value = false; }
        };

        const copyClientLink = () => {
            const url = `${window.location.origin}${window.location.pathname}?acesso=cliente&uid=${user.value.uid}`;
            navigator.clipboard.writeText(url).then(() => Swal.fire('Copiado!', 'Link da sua área de cliente copiado.', 'success'));
        };

        const saveAppointment = async () => {
            const data = { ...tempApp, totalServices: totalServices.value, finalBalance: finalBalance.value, userId: user.value.uid, status: 'pending' };
            if (isEditing.value) await updateDoc(doc(db, "appointments", editingId.value), data);
            else await addDoc(collection(db, "appointments"), data);
            showAppointmentModal.value = false; loadDashboardData();
        };

        const showReceipt = (app) => { 
            currentReceipt.value = sanitizeApp(app); 
            showReceiptModal.value = true; 
        };

        // --- ASSINATURA (CLIENTE & ORGANIZADOR) ---
        let canvasContext = null; let isDrawing = false;
        
        // Abre o modal de assinatura com o modo correto
        const openSignatureModal = (target, mode = 'appointment') => { 
            signatureApp.value = target; 
            signatureMode.value = mode; // 'appointment' ou 'company'
            showSignatureModal.value = true; 
            setTimeout(() => initCanvas(), 100); 
        };

        const initCanvas = () => { const canvas = document.getElementById('signature-pad'); if(!canvas) return; const ratio = Math.max(window.devicePixelRatio || 1, 1); canvas.width = canvas.offsetWidth * ratio; canvas.height = canvas.offsetHeight * ratio; canvas.getContext("2d").scale(ratio, ratio); canvasContext = canvas.getContext('2d'); canvasContext.strokeStyle = "#000"; canvasContext.lineWidth = 2; canvas.addEventListener('mousedown', startDrawing); canvas.addEventListener('mousemove', draw); canvas.addEventListener('mouseup', stopDrawing); canvas.addEventListener('mouseout', stopDrawing); canvas.addEventListener('touchstart', (e) => { e.preventDefault(); startDrawing(e.touches[0]); }); canvas.addEventListener('touchmove', (e) => { e.preventDefault(); draw(e.touches[0]); }); canvas.addEventListener('touchend', (e) => { e.preventDefault(); stopDrawing(); }); };
        const getPos = (e) => { const canvas = document.getElementById('signature-pad'); const rect = canvas.getBoundingClientRect(); return { x: e.clientX - rect.left, y: e.clientY - rect.top }; };
        const startDrawing = (e) => { isDrawing = true; const pos = getPos(e); canvasContext.beginPath(); canvasContext.moveTo(pos.x, pos.y); };
        const draw = (e) => { if(!isDrawing) return; const pos = getPos(e); canvasContext.lineTo(pos.x, pos.y); canvasContext.stroke(); };
        const stopDrawing = () => { isDrawing = false; };
        const clearSignature = () => { const canvas = document.getElementById('signature-pad'); canvasContext.clearRect(0, 0, canvas.width, canvas.height); };
        
        const saveSignature = async () => { 
            const canvas = document.getElementById('signature-pad'); 
            const dataUrl = canvas.toDataURL(); 
            authLoading.value = true; 
            try { 
                if (signatureMode.value === 'company') {
                    // Salva assinatura da empresa
                    company.signature = dataUrl;
                    await updateDoc(doc(db, "users", user.value.uid), { companyConfig: company });
                    Swal.fire('Sucesso', 'Assinatura da empresa salva!', 'success');
                } else {
                    // Salva assinatura do cliente no evento e confirma (passa para pending se era budget)
                    await updateDoc(doc(db, "appointments", signatureApp.value.id), { 
                        clientSignature: dataUrl,
                        status: 'pending' // Assinou = Confirmou
                    }); 
                    const idx = clientAppointments.value.findIndex(a => a.id === signatureApp.value.id); 
                    if(idx !== -1) {
                        clientAppointments.value[idx].clientSignature = dataUrl; 
                        clientAppointments.value[idx].status = 'pending';
                    }
                    Swal.fire('Sucesso', 'Contrato Assinado e Confirmado!', 'success'); 
                }
                showSignatureModal.value = false; 
            } catch (e) { Swal.fire('Erro', 'Não salvou.', 'error'); } 
            finally { authLoading.value = false; } 
        };

        const downloadClientReceipt = async (app) => { currentReceipt.value = app; if(!clientCache[app.clientId] && clientData.value) { clientCache[app.clientId] = clientData.value; } generateContractPDF(); };
        
        const generateContractPDF = () => { 
            const { jsPDF } = window.jspdf; const doc = new jsPDF(); const app = currentReceipt.value; const cli = clientCache[app.clientId] || {name:'...',cpf:'...', phone: '', email: ''};
            
            // Título
            let docTitle = "CONTRATO DE PRESTAÇÃO DE SERVIÇOS"; 
            
            doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.text(company.fantasia.toUpperCase(), 105, 20, {align: "center"});
            doc.setFontSize(10); doc.setFont("helvetica", "normal"); let headerY = 26;
            if (company.cnpj) { doc.text(`CNPJ: ${company.cnpj}`, 105, headerY, {align: "center"}); headerY += 5; }
            doc.text(`${company.rua} - ${company.bairro}`, 105, headerY, {align: "center"}); headerY += 5; doc.text(`${company.cidade}/${company.estado} - Tel: ${company.phone}`, 105, headerY, {align: "center"});
            doc.line(20, headerY + 5, 190, headerY + 5); doc.setFontSize(14); doc.setFont("helvetica", "bold"); doc.text(docTitle, 105, headerY + 15, {align:"center"});
            let y = headerY + 25; doc.setFontSize(10); doc.setFont("helvetica", "bold"); doc.text("CONTRATANTE:", 20, y); y += 5; doc.setFont("helvetica", "normal"); doc.text(`Nome: ${cli.name} | CPF: ${cli.cpf || '-'}`, 20, y); y += 5; doc.text(`Tel: ${cli.phone} | E-mail: ${cli.email || '-'}`, 20, y);
            y += 10; doc.setFont("helvetica", "bold"); doc.text("EVENTO:", 20, y); y += 5; doc.setFont("helvetica", "normal"); doc.text(`Data: ${formatDate(app.date)} | Hora: ${app.time}`, 20, y); y += 5; doc.text(`Local: ${app.location.bairro}`, 20, y); if(app.details.balloonColors) { y += 5; doc.text(`Cores: ${app.details.balloonColors}`, 20, y); }
            y += 10; const body = app.selectedServices.map(s => [s.description, formatCurrency(s.price)]); doc.autoTable({ startY: y, head: [['Descrição', 'Valor']], body: body, theme: 'grid', headStyles: { fillColor: [60, 60, 60] }, margin: { left: 20, right: 20 } });
            y = doc.lastAutoTable.finalY + 10; doc.setFont("helvetica", "bold"); doc.text(`TOTAL: ${formatCurrency(app.totalServices)}`, 140, y, {align: "right"}); y += 5; doc.text(`SINAL: ${formatCurrency(app.entryFee)}`, 140, y, {align: "right"}); y += 5; doc.text(`RESTANTE: ${formatCurrency(app.finalBalance)}`, 140, y, {align: "right"});
            
            // Cláusulas
            y += 15; doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.text("CLÁUSULAS E CONDIÇÕES:", 20, y); y += 5; doc.setFont("helvetica", "normal");
            const clauses = [ "1. RESERVA: O pagamento do sinal garante a reserva da data.", "2. DESISTÊNCIA: Em caso de cancelamento com menos de 15 dias, o sinal não será devolvido.", "3. DANOS: O CONTRATANTE responsabiliza-se pela conservação dos materiais.", "4. PAGAMENTO: O restante deve ser pago até a data do evento.", "5. MONTAGEM: O local deve estar liberado no horário combinado." ];
            clauses.forEach(clause => { const lines = doc.splitTextToSize(clause, 170); doc.text(lines, 20, y); y += (lines.length * 4) + 2; if (y > 230) { doc.addPage(); y = 20; } });
            
            // Assinaturas
            if (y > 230) { doc.addPage(); y = 40; } else { y += 20; }
            
            // Assinatura do Cliente
            if (app.clientSignature) { doc.addImage(app.clientSignature, 'PNG', 115, y - 15, 60, 20); }
            // Assinatura do Organizador (Se configurada)
            if (company.signature) { doc.addImage(company.signature, 'PNG', 25, y - 15, 60, 20); }

            doc.line(20, y, 90, y); doc.line(110, y, 180, y); 
            doc.text("CONTRATADA", 55, y + 5, {align: "center"}); 
            doc.text("CONTRATANTE", 145, y + 5, {align: "center"}); 
            
            doc.save(`Doc_${cli.name.replace(/ /g, '_')}.pdf`);
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

        const logout = () => { signOut(auth); window.location.href="index.html"; };
        const logoutClient = () => { clientData.value = null; clientAppointments.value = []; clientAccessInput.value = ''; view.value = 'dashboard'; loginMode.value = 'provider'; };

        const saveAsBudget = async () => {
            const appData = { ...JSON.parse(JSON.stringify(tempApp)), totalServices: totalServices.value, finalBalance: finalBalance.value, userId: user.value.uid, status: 'budget' }; 
            if(!appData.checklist.length) appData.checklist = [{text:'Materiais', done:false}];
            if (isEditing.value && editingId.value) await updateDoc(doc(db, "appointments", editingId.value), appData); else await addDoc(collection(db, "appointments"), appData);
            showAppointmentModal.value = false; Swal.fire('Orçamento Criado!', 'Ver na aba Orçamentos.', 'success');
        };

        const approveBudget = async (app) => {
            const { isConfirmed } = await Swal.fire({ title: 'Aprovar Orçamento?', text: 'Mover para Agenda?', icon: 'question', showCancelButton: true, confirmButtonColor: '#4F46E5' });
            if (isConfirmed) { await updateDoc(doc(db, "appointments", app.id), { status: 'pending' }); Swal.fire('Aprovado!', '', 'success'); view.value = 'schedule'; }
        };

        const saveClient = async () => { if(!newClient.name) return; await addDoc(collection(db, "clients"), { name: newClient.name, phone: newClient.phone, cpf: newClient.cpf, email: newClient.email, userId: user.value.uid }); showClientModal.value = false; newClient.name = ''; newClient.phone = ''; newClient.cpf = ''; newClient.email = ''; if(view.value === 'registrations') searchCatalogClients(); Swal.fire('Salvo!', '', 'success'); };
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
        const addServiceToApp = () => { if(tempServiceSelect.value) tempApp.selectedServices.push(tempServiceSelect.value); tempServiceSelect.value=''; };
        const removeServiceFromApp = (i) => tempApp.selectedServices.splice(i,1);
        const startNewSchedule = () => { isEditing.value=false; Object.assign(tempApp, { clientId:'', date:'', time:'', location:{bairro:''}, details:{entryFee:0}, selectedServices:[]}); showAppointmentModal.value = true; };
        const editAppointment = (app) => { isEditing.value=true; editingId.value=app.id; Object.assign(tempApp, JSON.parse(JSON.stringify(app))); clientSearchTerm.value = getClientName(app.clientId); showAppointmentModal.value=true; };
        const openNewExpense = () => { editingExpenseId.value = null; Object.assign(newExpense, { description: '', value: '', date: new Date().toISOString().split('T')[0], category: 'outros' }); showExpenseModal.value = true; };
        const openEditExpense = (expense) => { editingExpenseId.value = expense.id; Object.assign(newExpense, { description: expense.description, value: expense.value, date: expense.date, category: expense.category }); showExpenseModal.value = true; };
        const openClientModal = () => { showClientModal.value = true; };
        const downloadReceiptImage = () => { html2canvas(document.getElementById('receipt-capture-area')).then(c => { const l = document.createElement('a'); l.download = 'Recibo.png'; l.href = c.toDataURL(); l.click(); }); };
        const openWhatsApp = (app) => { const cli = clientCache[app.clientId]; if (!cli || !cli.phone) return Swal.fire('Erro', 'Cliente sem telefone cadastrado.', 'error'); const phoneClean = cli.phone.replace(/\D/g, ''); const msg = `Olá ${cli.name}, aqui é da ${company.fantasia}. Segue o comprovante do seu agendamento para o dia ${formatDate(app.date)}.`; window.open(`https://wa.me/55${phoneClean}?text=${encodeURIComponent(msg)}`, '_blank'); };
        const openWhatsAppSupport = () => { window.open('https://wa.me/?text=Preciso%20de%20ajuda%20com%20meu%20evento', '_blank'); };

        watch(dashboardMonth, () => loadDashboardData());
        watch(clientSearchTerm, async (val) => { if (isSelectingClient.value) return; if (val && val.length > 2) { const q = query(collection(db, "clients"), where("userId", "==", user.value.uid)); const snap = await getDocs(q); scheduleClientsList.value = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(c => c.name.toLowerCase().includes(val.toLowerCase())); } else { scheduleClientsList.value = []; } });
        const selectClient = (client) => { isSelectingClient.value = true; tempApp.clientId = client.id; clientSearchTerm.value = client.name; scheduleClientsList.value = []; setTimeout(() => { isSelectingClient.value = false; }, 500); };

        return {
            user, view, isDark, authForm, authLoading, isRegistering, handleAuth, logout, isGlobalLoading,
            dashboardMonth, financeData, next7DaysApps, statementList, isExtractLoaded, financeSummary, expensesFilter, searchExpenses,
            showExpenseModal, newExpense, addExpense: saveExpenseLogic, saveExpenseLogic, openNewExpense, openEditExpense, deleteExpense, editingExpenseId,
            startNewSchedule, editAppointment, saveAppointment, showAppointmentModal, showClientModal, showServiceModal, newService, saveService, deleteService,
            newClient, saveClient, tempApp, tempServiceSelect, services, totalServices, finalBalance, isEditing, clientSearchTerm, filteredClientsSearch, selectClient,
            addServiceToApp, removeServiceFromApp, appointmentViewMode, calendarGrid, calendarTitle, changeCalendarMonth, selectCalendarDay, selectedCalendarDate, appointmentsOnSelectedDate, filteredListAppointments,
            catalogClientsList, catalogClientSearch, searchCatalogClients, openClientModal, deleteClient, currentReceipt, showReceipt, showReceiptModal,
            company, handleLogoUpload, saveCompany, downloadReceiptImage, generateContractPDF, openWhatsApp, formatCurrency, formatDate, getDay, getMonth, statusText, getClientName, 
            toggleDarkMode, expenseCategories, expensesByCategoryStats, agendaTab, agendaFilter, searchHistory, changeStatus, registrationTab, kpiPendingReceivables, totalAppointmentsCount, topExpenseCategory, getCategoryIcon, maskPhone, maskCPF,
            loginMode, clientAccessInput, handleClientAccess, clientData, clientAppointments, logoutClient, openWhatsAppSupport, downloadClientReceipt, showSignatureModal, openSignatureModal, clearSignature, saveSignature, 
            copyClientLink, budgetList, saveAsBudget, approveBudget, pendingAppointments
        };
    }
}).mount('#app');
