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
        
        const registrationTab = ref('clients');
        const agendaTab = ref('pending');

        const company = reactive({ fantasia: '', logo: '', cnpj: '', email: '', phone: '', rua: '', bairro: '', cidade: '', estado: '' });
        const dashboardMonth = ref(new Date().toISOString().slice(0, 7));
        const dashboardData = reactive({ appointments: [], expenses: [] });
        const isLoadingDashboard = ref(false);
        
        const services = ref([]);
        const pendingAppointments = ref([]);
        const historyList = ref([]);
        const expensesList = ref([]); 
        const isExtractLoaded = ref(false);
        const catalogClientsList = ref([]);
        const scheduleClientsList = ref([]);
        const clientCache = reactive({});

        const showAppointmentModal = ref(false);
        const showClientModal = ref(false);
        const showServiceModal = ref(false);
        const showExpenseModal = ref(false);
        const isEditing = ref(false);
        const editingId = ref(null);
        const currentReceipt = ref(null);
        
        const clientSearchTerm = ref('');
        const isSelectingClient = ref(false);
        const catalogClientSearch = ref('');
        const expensesFilter = reactive({ start: '', end: '' });
        const agendaFilter = reactive({ start: '', end: '' });
        const appointmentViewMode = ref('list');
        const calendarCursor = ref(new Date());
        const selectedCalendarDate = ref(null);

        const newClient = reactive({ name: '', phone: '', cpf: '', email: '' });
        const newService = reactive({ description: '', price: '' });
        const newExpense = reactive({ description: '', value: '', date: new Date().toISOString().split('T')[0], category: 'outros' });
        const tempServiceSelect = ref('');
        
        const tempApp = reactive({ clientId: '', date: '', time: '', location: { bairro: '' }, details: { entryFee: 0, balloonColors: '' }, notes: '', selectedServices: [], checklist: [] });

        const expenseCategories = [
            { id: 'combustivel', label: 'Combustível', icon: 'fa-gas-pump' },
            { id: 'materiais', label: 'Materiais', icon: 'fa-box-open' },
            { id: 'equipe', label: 'Equipe', icon: 'fa-users' },
            { id: 'refeicao', label: 'Alimentação', icon: 'fa-utensils' },
            { id: 'marketing', label: 'Marketing', icon: 'fa-bullhorn' },
            { id: 'aluguel', label: 'Aluguel', icon: 'fa-house' },
            { id: 'outros', label: 'Outras', icon: 'fa-money-bill' }
        ];

        const toNum = (val) => { if (!val) return 0; if (typeof val === 'number') return val; const clean = String(val).replace(',', '.').replace(/[^0-9.-]/g, ''); return parseFloat(clean) || 0; };
        const formatCurrency = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(toNum(v));
        const formatDate = (d) => { if (!d) return ''; try { return d.split('-').reverse().join('/'); } catch (e) { return d; } };
        const getDay = (d) => d ? d.split('-')[2] : '';
        const getMonth = (d) => d ? ['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'][parseInt(d.split('-')[1])-1] : '';
        const statusText = (s) => s === 'concluded' ? 'Concluído' : (s === 'cancelled' ? 'Cancelado' : 'Pendente');
        const getClientName = (id) => clientCache[id]?.name || 'Cliente Excluído';
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
            return { id: docSnapshot.id || data.id, ...data, selectedServices: safeServices, totalServices: total, finalBalance: balance, entryFee: entry, checklist: data.checklist || [], details: { ...(data.details || {}), balloonColors: data.details?.balloonColors || '' }, notes: data.notes || '' };
        };

        const sanitizeExpense = (docSnapshot) => { const data = docSnapshot.data ? docSnapshot.data() : docSnapshot; return { id: docSnapshot.id || data.id, ...data, value: toNum(data.value) }; };

        onMounted(() => {
            onAuthStateChanged(auth, async (u) => {
                if (u) {
                    user.value = u;
                    const userDoc = await getDoc(doc(db, "users", u.uid));
                    if (!userDoc.exists()) await setDoc(doc(db, "users", u.uid), { email: u.email, role: 'user', createdAt: new Date().toISOString() });
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

        const totalServices = computed(() => tempApp.selectedServices.reduce((s,i) => s + toNum(i.price), 0));
        const finalBalance = computed(() => totalServices.value - toNum(tempApp.details.entryFee));
        const kpiRevenue = computed(() => dashboardData.appointments.reduce((acc, a) => acc + toNum(a.totalServices), 0));
        const kpiExpenses = computed(() => dashboardData.expenses.reduce((acc, e) => acc + toNum(e.value), 0));
        const financeData = computed(() => ({ revenue: kpiRevenue.value, expenses: kpiExpenses.value, profit: kpiRevenue.value - kpiExpenses.value, receivables: dashboardData.appointments.reduce((acc, a) => acc + toNum(a.finalBalance), 0) }));

        // --- NOVAS COMPUTED PROPERTIES ---
        const totalAppointmentsCount = computed(() => dashboardData.appointments.length);
        const kpiPendingReceivables = computed(() => {
            return dashboardData.appointments
                .filter(a => a.status === 'pending')
                .reduce((acc, a) => acc + toNum(a.finalBalance), 0);
        });
        const expensesByCategoryStats = computed(() => { 
            if (!dashboardData.expenses.length) return []; 
            return expenseCategories.map(cat => { 
                const total = dashboardData.expenses.filter(e => e.category === cat.id).reduce((sum, e) => sum + toNum(e.value), 0); 
                return { ...cat, total }; 
            }).filter(c => c.total > 0).sort((a, b) => b.total - a.total); 
        });
        const topExpenseCategory = computed(() => expensesByCategoryStats.value[0] || null);
        // ---------------------------------

        const next7DaysApps = computed(() => {
            const today = new Date(); today.setHours(0,0,0,0);
            const nextWeek = new Date(today); nextWeek.setDate(today.getDate() + 7);
            const todayStr = today.toISOString().split('T')[0];
            const nextWeekStr = nextWeek.toISOString().split('T')[0];
            return pendingAppointments.value.filter(a => a.date >= todayStr && a.date <= nextWeekStr).sort((a,b) => a.date.localeCompare(b.date));
        });

        const searchExpenses = async () => {
            if(!expensesFilter.start || !expensesFilter.end) return Swal.fire('Data', 'Selecione o período', 'info');
            const qExp = query(collection(db, "expenses"), where("userId", "==", user.value.uid), where("date", ">=", expensesFilter.start), where("date", "<=", expensesFilter.end));
            const snapExp = await getDocs(qExp);
            const loadedExpenses = snapExp.docs.map(d => ({ ...sanitizeExpense(d), type: 'expense', icon: 'fa-arrow-down', color: 'text-red-500' }));
            const qApp = query(collection(db, "appointments"), where("userId", "==", user.value.uid), where("date", ">=", expensesFilter.start), where("date", "<=", expensesFilter.end));
            const snapApp = await getDocs(qApp);
            const loadedIncome = snapApp.docs.map(d => { const app = sanitizeApp(d); return { id: app.id, date: app.date, value: app.totalServices, description: `Receita: ${getClientName(app.clientId)}`, type: 'income', icon: 'fa-arrow-up', color: 'text-green-500' }; });
            expensesList.value = [...loadedExpenses, ...loadedIncome]; isExtractLoaded.value = true;
        };
        const statementList = computed(() => { if (!isExtractLoaded.value) return []; return expensesList.value.sort((a, b) => b.date.localeCompare(a.date)); });
        const financeSummary = computed(() => statementList.value.reduce((acc, item) => item.type === 'income' ? acc + item.value : acc - item.value, 0));

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

        watch(clientSearchTerm, async (val) => {
            if (isSelectingClient.value) return; 
            if (val && val.length > 2) {
                const q = query(collection(db, "clients"), where("userId", "==", user.value.uid));
                const snap = await getDocs(q);
                scheduleClientsList.value = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(c => c.name.toLowerCase().includes(val.toLowerCase()));
            } else { scheduleClientsList.value = []; }
        });
        const selectClient = (client) => {
            isSelectingClient.value = true;
            tempApp.clientId = client.id;
            clientSearchTerm.value = client.name;
            scheduleClientsList.value = [];
            setTimeout(() => { isSelectingClient.value = false; }, 500);
        };
        const filteredClientsSearch = computed(() => scheduleClientsList.value);

       const handleAuth = async () => {
        if (!authForm.email || !authForm.password) return Swal.fire('Atenção', 'Preencha todos os campos.', 'warning');
        authLoading.value = true;
        try {
            if (isRegistering.value) {
                const userCredential = await createUserWithEmailAndPassword(auth, authForm.email, authForm.password);
                const newUser = userCredential.user;
                await updateProfile(newUser, { displayName: authForm.name });
                await setDoc(doc(db, "users", newUser.uid), {
                    email: authForm.email, role: 'user', createdAt: new Date().toISOString(),
                    companyConfig: { fantasia: authForm.name || 'Minha Empresa', logo: '', cnpj: '', email: authForm.email, phone: '', rua: '', bairro: '', cidade: '', estado: '' }
                });
                await Swal.fire({ title: 'Sucesso!', text: 'Conta criada com sucesso!', icon: 'success', timer: 2000, showConfirmButton: false });
            } else {
                await signInWithEmailAndPassword(auth, authForm.email, authForm.password);
                const Toast = Swal.mixin({ toast: true, position: 'top-end', showConfirmButton: false, timer: 3000, timerProgressBar: true });
                Toast.fire({ icon: 'success', title: 'Login realizado com sucesso' });
            }
        } catch (error) {
            console.error("Erro Auth:", error.code);
            let msg = "Erro inesperado.";
            if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') msg = "E-mail ou senha incorretos.";
            else if (error.code === 'auth/email-already-in-use') msg = "E-mail já cadastrado.";
            Swal.fire('Ops!', msg, 'error');
        } finally { authLoading.value = false; }
    };
           
        const startNewSchedule = () => { 
            isEditing.value=false; 
            Object.assign(tempApp, { clientId:'', date:'', time:'', location:{bairro:''}, details:{entryFee:0, balloonColors:''}, notes: '', selectedServices:[], checklist:[] }); 
            clientSearchTerm.value = ''; 
            showAppointmentModal.value=true; 
        };
        
        const editAppointment = (app) => { 
            isEditing.value=true; 
            editingId.value=app.id; 
            Object.assign(tempApp, JSON.parse(JSON.stringify(app))); 
            clientSearchTerm.value = getClientName(app.clientId); 
            showAppointmentModal.value=true; 
        };

        const saveAppointment = async () => {
            const appData = { ...JSON.parse(JSON.stringify(tempApp)), totalServices: totalServices.value, finalBalance: finalBalance.value, userId: user.value.uid, status: 'pending' };
            if(!appData.checklist.length) appData.checklist = [{text:'Materiais', done:false}];
            if (isEditing.value) await updateDoc(doc(db, "appointments", editingId.value), appData); else await addDoc(collection(db, "appointments"), appData);
            loadDashboardData(); showAppointmentModal.value = false; Swal.fire('Salvo!', '', 'success');
        };

        const changeStatus = async (app, status) => {
            const action = status === 'concluded' ? 'Concluir' : 'Cancelar';
            const {isConfirmed} = await Swal.fire({title: action + '?', text: 'Deseja alterar o status?', icon:'question', showCancelButton:true});
            if(isConfirmed) { await updateDoc(doc(db,"appointments",app.id), {status:status}); Swal.fire('Feito','','success'); loadDashboardData(); }
        };

        const saveService = async () => { if(!newService.description || !newService.price) return; await addDoc(collection(db, "services"), { description: newService.description, price: toNum(newService.price), userId: user.value.uid }); newService.description = ''; newService.price = ''; showServiceModal.value = false; };
        const deleteService = async (id) => { await deleteDoc(doc(db, "services", id)); };
        const addExpense = async () => { await addDoc(collection(db, "expenses"), { ...newExpense, value: toNum(newExpense.value), userId: user.value.uid }); showExpenseModal.value = false; Swal.fire('Salvo','','success'); };
        
        const saveClient = async () => {
            if(!newClient.name) return;
            await addDoc(collection(db, "clients"), { name: newClient.name, phone: newClient.phone, cpf: newClient.cpf, email: newClient.email, userId: user.value.uid });
            showClientModal.value = false;
            newClient.name = ''; newClient.phone = ''; newClient.cpf = ''; newClient.email = '';
            if(view.value === 'registrations') searchCatalogClients();
            Swal.fire('Salvo!', '', 'success');
        };

        const deleteClient = async (id) => { if((await Swal.fire({title:'Excluir?',showCancelButton:true})).isConfirmed) { await deleteDoc(doc(db,"clients",id)); searchCatalogClients(); }};
        const searchCatalogClients = async () => { const q = query(collection(db, "clients"), where("userId", "==", user.value.uid)); const snap = await getDocs(q); catalogClientsList.value = snap.docs.map(d => ({id: d.id, ...d.data()})).filter(c => c.name.toLowerCase().includes(catalogClientSearch.value.toLowerCase())); };
        
        const downloadReceiptImage = () => { html2canvas(document.getElementById('receipt-capture-area')).then(c => { const l = document.createElement('a'); l.download = 'Recibo.png'; l.href = c.toDataURL(); l.click(); }); };
        
        const openWhatsApp = (app) => {
            const cli = clientCache[app.clientId];
            if (!cli || !cli.phone) return Swal.fire('Erro', 'Cliente sem telefone cadastrado.', 'error');
            const phoneClean = cli.phone.replace(/\D/g, '');
            const msg = `Olá ${cli.name}, aqui é da ${company.fantasia}. Segue o comprovante do seu agendamento para o dia ${formatDate(app.date)}.`;
            window.open(`https://wa.me/55${phoneClean}?text=${encodeURIComponent(msg)}`, '_blank');
        };

        const generateContractPDF = () => { 
            const { jsPDF } = window.jspdf; 
            const doc = new jsPDF(); 
            const app = currentReceipt.value; 
            const cli = clientCache[app.clientId] || {name:'...',cpf:'...', phone: '', email: ''};
            
            doc.setFont("helvetica", "bold");
            doc.setFontSize(14);
            doc.text(company.fantasia.toUpperCase(), 105, 20, {align: "center"});
            
            doc.setFontSize(10);
            doc.setFont("helvetica", "normal");
            let headerY = 26;
            if (company.cnpj) { doc.text(`CNPJ: ${company.cnpj}`, 105, headerY, {align: "center"}); headerY += 5; }
            doc.text(`${company.rua} - ${company.bairro}`, 105, headerY, {align: "center"}); headerY += 5;
            doc.text(`${company.cidade}/${company.estado} - Tel: ${company.phone}`, 105, headerY, {align: "center"});
            
            doc.line(20, headerY + 5, 190, headerY + 5);
            doc.setFontSize(14);
            doc.setFont("helvetica", "bold");
            doc.text("CONTRATO DE PRESTAÇÃO DE SERVIÇOS", 105, headerY + 15, {align:"center"});
            
            let y = headerY + 25;
            doc.setFontSize(10);
            doc.setFont("helvetica", "bold");
            doc.text("CONTRATANTE:", 20, y);
            y += 5;
            doc.setFont("helvetica", "normal");
            doc.text(`Nome: ${cli.name} | CPF: ${cli.cpf || '-'}`, 20, y);
            y += 5;
            doc.text(`Tel: ${cli.phone} | E-mail: ${cli.email || '-'}`, 20, y);
            
            y += 10;
            doc.setFont("helvetica", "bold");
            doc.text("EVENTO:", 20, y);
            y += 5;
            doc.setFont("helvetica", "normal");
            doc.text(`Data: ${formatDate(app.date)} | Hora: ${app.time}`, 20, y);
            y += 5;
            doc.text(`Local: ${app.location.bairro}`, 20, y);
            if(app.details.balloonColors) { y += 5; doc.text(`Cores: ${app.details.balloonColors}`, 20, y); }

            y += 10;
            const body = app.selectedServices.map(s => [s.description, formatCurrency(s.price)]);
            doc.autoTable({
                startY: y,
                head: [['Descrição', 'Valor']],
                body: body,
                theme: 'grid',
                headStyles: { fillColor: [60, 60, 60] },
                margin: { left: 20, right: 20 }
            });
            y = doc.lastAutoTable.finalY + 10;

            doc.setFont("helvetica", "bold");
            doc.text(`TOTAL: ${formatCurrency(app.totalServices)}`, 140, y, {align: "right"});
            y += 5;
            doc.text(`SINAL: ${formatCurrency(app.entryFee)}`, 140, y, {align: "right"});
            y += 5;
            doc.text(`RESTANTE: ${formatCurrency(app.finalBalance)}`, 140, y, {align: "right"});

            y += 15;
            doc.setFontSize(9);
            doc.setFont("helvetica", "bold");
            doc.text("CLÁUSULAS E CONDIÇÕES:", 20, y);
            y += 5;
            doc.setFont("helvetica", "normal");
            
            const clauses = [
                "1. RESERVA: O pagamento do sinal garante a reserva da data e dos materiais descritos.",
                "2. DESISTÊNCIA: Em caso de cancelamento pelo CONTRATANTE com menos de 15 dias de antecedência, o sinal não será devolvido.",
                "3. DANOS: O CONTRATANTE responsabiliza-se pela conservação dos materiais locados.",
                "4. PAGAMENTO: O valor restante deverá ser quitado integralmente até a data da montagem/evento.",
                "5. MONTAGEM: O local do evento deve estar liberado e limpo para montagem no horário combinado."
            ];

            clauses.forEach(clause => {
                const lines = doc.splitTextToSize(clause, 170);
                doc.text(lines, 20, y);
                y += (lines.length * 4) + 2;
                if (y > 270) { doc.addPage(); y = 20; }
            });

            if (y > 250) { doc.addPage(); y = 40; } else { y += 20; }
            doc.line(20, y, 90, y);
            doc.line(110, y, 180, y);
            doc.text("CONTRATADA", 55, y + 5, {align: "center"});
            doc.text("CONTRATANTE", 145, y + 5, {align: "center"});

            doc.save(`Contrato_${cli.name.replace(/ /g, '_')}.pdf`);
        };

        const handleLogoUpload = (e) => { const f = e.target.files[0]; if(f){ const r=new FileReader(); r.onload=x=>{company.logo=x.target.result; updateDoc(doc(db,"users",user.value.uid),{companyConfig:company});}; r.readAsDataURL(f); }};
        const saveCompany = () => { updateDoc(doc(db, "users", user.value.uid), { companyConfig: company }); Swal.fire('Salvo', '', 'success'); };
        const handleChangePassword = async () => { const html = '<input id="currentPass" type="password" class="swal2-input" placeholder="Senha Atual"><input id="newPass" type="password" class="swal2-input" placeholder="Nova Senha">'; const { value: fv } = await Swal.fire({ title: 'Alterar Senha', html: html, showCancelButton: true, confirmButtonText: 'Alterar', preConfirm: () => { return [document.getElementById('currentPass').value, document.getElementById('newPass').value]; } }); if (fv && fv[0] && fv[1]) { try { const c = EmailAuthProvider.credential(user.value.email, fv[0]); await reauthenticateWithCredential(user.value, c); await updatePassword(user.value, fv[1]); Swal.fire('Sucesso!', 'Senha alterada.', 'success'); } catch (error) { Swal.fire('Erro', 'Senha incorreta.', 'error'); } } };

        return {
            user, view, isDark, authForm, authLoading, isRegistering, handleAuth, logout: () => { signOut(auth); window.location.href="index.html"; },
            dashboardMonth, financeData, next7DaysApps, statementList, isExtractLoaded, financeSummary, expensesFilter, searchExpenses,
            showExpenseModal, newExpense, addExpense, deleteExpense: async(id)=>{await deleteDoc(doc(db,"expenses",id)); loadDashboardData();},
            startNewSchedule, editAppointment, saveAppointment, showAppointmentModal, showClientModal, showServiceModal, newService, saveService, deleteService,
            newClient, saveClient, 
            tempApp, tempServiceSelect, services, totalServices, finalBalance, isEditing, clientSearchTerm, filteredClientsSearch, selectClient,
            addServiceToApp: () => { if(tempServiceSelect.value) tempApp.selectedServices.push(tempServiceSelect.value); tempServiceSelect.value=''; },
            removeServiceFromApp: (i) => tempApp.selectedServices.splice(i,1),
            appointmentViewMode, calendarGrid, calendarTitle, changeCalendarMonth, selectCalendarDay, selectedCalendarDate, appointmentsOnSelectedDate, filteredListAppointments,
            catalogClientsList, catalogClientSearch, searchCatalogClients, openClientModal: () => { showClientModal.value = true; }, deleteClient,
            currentReceipt, showReceipt: (app) => { currentReceipt.value = sanitizeApp(app); view.value = 'receipt'; },
            company, handleLogoUpload, saveCompany, handleChangePassword, downloadReceiptImage, 
            generateContractPDF, openWhatsApp, 
            formatCurrency, formatDate, getDay, getMonth, statusText, getClientName, getClientPhone,
            toggleDarkMode: () => { isDark.value=!isDark.value; document.documentElement.classList.toggle('dark'); },
            expenseCategories, expensesByCategoryStats,
            agendaTab, agendaFilter, searchHistory, changeStatus,
            registrationTab,
            // NOVOS EXPORTS
            kpiPendingReceivables, totalAppointmentsCount, topExpenseCategory, getCategoryIcon: (id) => expenseCategories.find(c=>c.id===id)?.icon || 'fa-tag'
        };
    }
}).mount('#app');
