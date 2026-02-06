const { createApp, ref, computed, reactive, onMounted } = Vue;

import { 
    db, auth, 
    collection, addDoc, onSnapshot, doc, updateDoc, deleteDoc, getDocs, query, where, setDoc, getDoc,
    signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged,
    updatePassword, reauthenticateWithCredential, EmailAuthProvider 
} from './firebase.js';

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js"; 
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyAhHRcZwrzD36oEFaeQzD1Fd-685YRAxBA",
    authDomain: "partyplanner-3f352.firebaseapp.com",
    projectId: "partyplanner-3f352",
    storageBucket: "partyplanner-3f352.firebasestorage.app",
    messagingSenderId: "748641483081",
    appId: "1:748641483081:web:dec19c31c9e58d9040c298",
    measurementId: "G-YVYD6MEXC1"
};

createApp({
    setup() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('./sw.js').catch(err => console.log('Erro PWA:', err));
        }

        const user = ref(null);
        const userRole = ref('user');
        const userStatus = ref('trial');
        const daysRemaining = ref(30);
        const authLoading = ref(false);
        const authForm = reactive({ email: '', password: '' });
        
        const view = ref('dashboard');
        const catalogView = ref('company'); // Abas do Catálogo
        const isDark = ref(false);
        const dashboardFilter = ref('month');
        
        const currentTab = ref('pending'); 
        const historyFilter = reactive({ start: '', end: '' });
        const historyList = ref([]); 
        const isLoadingHistory = ref(false);

        // --- BUSCA INTELIGENTE DE CLIENTES ---
        const clientSearchTerm = ref('');
        const filteredClientsSearch = computed(() => {
            if (clientSearchTerm.value.length < 3) return [];
            const term = clientSearchTerm.value.toLowerCase();
            return clients.value.filter(c => 
                c.name.toLowerCase().includes(term) || 
                (c.phone && c.phone.includes(term))
            );
        });
        const selectClientFromSearch = (client) => { tempApp.clientId = client.id; clientSearchTerm.value = ''; };
        const clearClientSelection = () => { tempApp.clientId = ''; clientSearchTerm.value = ''; };

        const isEditing = ref(false);
        const editingId = ref(null);
        const currentReceipt = ref(null);
        const newTaskText = ref({});

        const clients = ref([]);
        const services = ref([]);
        const pendingAppointments = ref([]); 
        const expenses = ref([]);
        const company = reactive({ fantasia: '', logo: '', cnpj: '', razao: '', cidade: '', rua: '', estado: '' });
        
        const tempApp = reactive({ clientId: '', date: '', time: '', location: { bairro: '', cidade: '', numero: '' }, details: { colors: '', entryFee: 0 }, selectedServices: [] });
        const tempServiceSelect = ref('');
        const newExpense = reactive({ description: '', value: '', date: new Date().toISOString().split('T')[0] });

        // UTILS
        const formatCurrency = (v) => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(v||0);
        const formatDate = (d) => d ? d.split('-').reverse().join('/') : '';
        const getDay = (d) => d ? d.split('-')[2] : '';
        const getMonth = (d) => ['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'][parseInt(d.split('-')[1])-1];
        const statusText = (s) => s === 'concluded' ? 'Concluída' : (s === 'cancelled' ? 'Cancelada' : 'Pendente');
        const statusClass = (s) => s === 'concluded' ? 'bg-green-100 text-green-600' : (s === 'cancelled' ? 'bg-red-100 text-red-600' : 'bg-yellow-100 text-yellow-600');
        const getClientName = (id) => { const c = clients.value.find(x => x.id === id); return c ? c.name : 'Desconhecido'; };
        const getClientPhone = (id) => { const c = clients.value.find(x => x.id === id); return c ? c.phone : ''; };

        // AUTH
        onMounted(() => {
            onAuthStateChanged(auth, async (u) => {
                if (u) {
                    const userDoc = await getDoc(doc(db, "users", u.uid));
                    if (!userDoc.exists()) { await signOut(auth); user.value = null; Swal.fire({ icon: 'error', title: 'Acesso Revogado', text: 'Conta removida.' }); return; }

                    user.value = u;
                    const data = userDoc.data();
                    userRole.value = data.role || 'user';
                    userStatus.value = data.status || 'trial';
                    
                    if (userRole.value !== 'admin' && userStatus.value !== 'active') {
                        const createdAt = new Date(data.createdAt || new Date());
                        const diffDays = Math.ceil(Math.abs(new Date() - createdAt) / (1000 * 60 * 60 * 24)); 
                        daysRemaining.value = 30 - diffDays;
                        if (daysRemaining.value <= 0) { view.value = 'expired_plan'; return; }
                    }

                    if(data.companyConfig) Object.assign(company, data.companyConfig);
                    syncData();
                } else {
                    user.value = null;
                    clients.value=[]; services.value=[]; pendingAppointments.value=[]; expenses.value=[];
                }
            });
            if(localStorage.getItem('pp_dark') === 'true') { isDark.value = true; document.documentElement.classList.add('dark'); }
            const t = new Date(); const lm = new Date(); lm.setDate(t.getDate() - 30);
            historyFilter.end = t.toISOString().split('T')[0]; historyFilter.start = lm.toISOString().split('T')[0];
        });

        const handleLogin = async () => {
            authLoading.value = true;
            try { await signInWithEmailAndPassword(auth, authForm.email, authForm.password); } 
            catch (error) { Swal.fire('Erro', 'Dados incorretos', 'error'); } 
            finally { authLoading.value = false; }
        };

        const logout = async () => { await signOut(auth); window.location.href = "index.html"; };

        let unsubscribeListeners = [];
        const syncData = () => {
            unsubscribeListeners.forEach(unsub => unsub()); unsubscribeListeners = [];
            const myId = user.value.uid; 
            unsubscribeListeners.push(onSnapshot(query(collection(db, "clients"), where("userId", "==", myId)), (snap) => { clients.value = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })); }));
            unsubscribeListeners.push(onSnapshot(query(collection(db, "services"), where("userId", "==", myId)), (snap) => { services.value = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })); }));
            unsubscribeListeners.push(onSnapshot(query(collection(db, "expenses"), where("userId", "==", myId)), (snap) => { expenses.value = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })); }));
            const qApps = query(collection(db, "appointments"), where("userId", "==", myId), where("status", "==", "pending"));
            unsubscribeListeners.push(onSnapshot(qApps, (snap) => { pendingAppointments.value = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })); }));
        };

        const searchHistory = async () => {
            if(!historyFilter.start || !historyFilter.end) return Swal.fire('Atenção', 'Selecione as datas', 'warning');
            isLoadingHistory.value = true; historyList.value = [];
            try {
                const q = query(collection(db, "appointments"), where("userId", "==", user.value.uid), where("status", "==", currentTab.value), where("date", ">=", historyFilter.start), where("date", "<=", historyFilter.end));
                const querySnapshot = await getDocs(q);
                historyList.value = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                if(historyList.value.length === 0) Swal.fire('Info', 'Nenhum registro encontrado.', 'info');
            } catch (error) { console.error(error); Swal.fire('Erro', 'Verifique console.', 'error'); } finally { isLoadingHistory.value = false; }
        };

        // --- KPIS ---
        const filteredListAppointments = computed(() => { 
            let list = currentTab.value === 'pending' ? pendingAppointments.value : historyList.value;
            return [...list].sort((a,b) => new Date(a.date) - new Date(b.date)); 
        });
        const kpiRevenue = computed(() => pendingAppointments.value.reduce((acc, a) => acc + (a.totalServices || 0), 0));
        const kpiExpenses = computed(() => expenses.value.reduce((acc, e) => acc + (e.value || 0), 0));
        const kpiProfit = computed(() => kpiRevenue.value - kpiExpenses.value); 
        const kpiReceivables = computed(() => pendingAppointments.value.reduce((acc, a) => acc + (a.finalBalance || 0), 0));
        const pendingCount = computed(() => pendingAppointments.value.length);
        
        const next7DaysApps = computed(() => { 
            const t = new Date(); t.setHours(0,0,0,0); const w = new Date(t); w.setDate(t.getDate() + 7); 
            return pendingAppointments.value.filter(a => { return new Date(a.date) >= t && new Date(a.date) <= w; }).sort((a,b) => new Date(a.date) - new Date(b.date));
        });
        const totalServices = computed(() => tempApp.selectedServices.reduce((s,i) => s + i.price, 0));
        const finalBalance = computed(() => totalServices.value - (tempApp.details.entryFee || 0));

        // ACTIONS
        const saveAppointment = async () => {
            const total = tempApp.selectedServices.reduce((sum, i) => sum + i.price, 0);
            const appData = { ...JSON.parse(JSON.stringify(tempApp)), totalServices: total, entryFee: tempApp.details.entryFee, finalBalance: total - tempApp.details.entryFee, userId: user.value.uid };
            if(isEditing.value && editingId.value) { await updateDoc(doc(db, "appointments", editingId.value), appData); Swal.fire({icon:'success', title:'Atualizado', timer:1000}); } 
            else { appData.status = 'pending'; appData.checklist = [{text:'Confirmar Equipe', done:false},{text:'Separar Materiais', done:false}]; await addDoc(collection(db, "appointments"), appData); Swal.fire({icon:'success', title:'Agendado!', timer:1000}); }
            view.value = 'appointments_list'; currentTab.value = 'pending';
        };

        const changeStatus = async (app, status) => { 
            const action = status === 'concluded' ? 'Concluir' : 'Cancelar';
            const { isConfirmed } = await Swal.fire({ title: action + '?', text: 'Deseja marcar como ' + action + '?', icon: 'question', showCancelButton: true });
            if(isConfirmed) {
                await updateDoc(doc(db, "appointments", app.id), { status: status });
                if(currentTab.value !== 'pending') { const idx = historyList.value.findIndex(x => x.id === app.id); if(idx !== -1) historyList.value[idx].status = status; }
                Swal.fire('Feito!', '', 'success');
            }
        };

        const updateAppInFirebase = async (app) => { await updateDoc(doc(db, "appointments", app.id), { checklist: app.checklist }); };
        const addExpense = async () => { if(!newExpense.description) return; await addDoc(collection(db, "expenses"), {...newExpense, userId: user.value.uid}); Object.assign(newExpense, {description: '', value: ''}); Swal.fire({icon:'success', title:'Registrado', timer:1000}); };
        const deleteExpense = async (id) => { await deleteDoc(doc(db, "expenses", id)); };
        
        const startNewSchedule = () => { isEditing.value=false; editingId.value=null; clientSearchTerm.value = ''; Object.assign(tempApp, {clientId: '', date: '', time: '', location: { bairro: '', cidade: '', numero: '' }, details: { colors: '', entryFee: 0 }, selectedServices: [] }); view.value='schedule'; };
        const editAppointment = (app) => { isEditing.value=true; editingId.value=app.id; clientSearchTerm.value = ''; Object.assign(tempApp, JSON.parse(JSON.stringify(app))); view.value='schedule'; };
        const showReceipt = (app) => { currentReceipt.value = app; view.value = 'receipt'; };

        // MODAIS
        const openClientModal = async (c) => { 
            const n = c && c.name ? c.name : ''; const p = c && c.phone ? c.phone : ''; const cpf = c && c.cpf ? c.cpf : '';
            const html = '<input id="n" class="swal2-input" value="' + n + '" placeholder="Nome">' + '<input id="p" class="swal2-input" value="' + p + '" placeholder="Telefone">' + '<input id="cpf" class="swal2-input" value="' + cpf + '" placeholder="CPF">';
            const { value: vals } = await Swal.fire({ title: c ? 'Editar Cliente' : 'Novo Cliente', html: html, showCancelButton: true, confirmButtonText: 'Salvar', preConfirm: () => [ document.getElementById('n').value, document.getElementById('p').value, document.getElementById('cpf').value ] });
            if (vals) { const d = { name: vals[0], phone: vals[1], cpf: vals[2], userId: user.value.uid }; if (c) await updateDoc(doc(db, "clients", c.id), d); else await addDoc(collection(db, "clients"), d); Swal.fire('Salvo', '', 'success'); } 
        };
        const deleteClient = async (id) => { if ((await Swal.fire({ title: 'Excluir?', showCancelButton: true })).isConfirmed) { await deleteDoc(doc(db, "clients", id)); } };
        const openServiceModal = async (s) => { 
            const d = s && s.description ? s.description : ''; const p = s && s.price ? s.price : '';
            const html = '<input id="d" class="swal2-input" value="' + d + '" placeholder="Descrição">' + '<input id="p" type="number" class="swal2-input" value="' + p + '" placeholder="Preço (R$)">';
            const { value: v } = await Swal.fire({ title: s ? 'Editar Serviço' : 'Novo Serviço', html: html, showCancelButton: true, confirmButtonText: 'Salvar', preConfirm: () => [ document.getElementById('d').value, document.getElementById('p').value ] });
            if (v) { const data = { description: v[0], price: Number(v[1]), userId: user.value.uid }; if (s) await updateDoc(doc(db, "services", s.id), data); else await addDoc(collection(db, "services"), data); }
        };
        const deleteService = async (id) => { await deleteDoc(doc(db,"services",id)); };
        const downloadReceiptImage = () => { html2canvas(document.getElementById('receipt-capture-area'),{scale:2}).then(c=>{const l=document.createElement('a');l.download='Recibo.png';l.href=c.toDataURL();l.click();}); };
        
        // CONTRATO PROFISSIONAL
        const generateContractPDF = () => { 
            const { jsPDF } = window.jspdf; const doc = new jsPDF(); const app = currentReceipt.value; 
            const cli = clients.value.find(c => c.id === app.clientId) || {name: '....................', cpf: '....................', phone: ''}; 
            const margin = 20; const pageWidth = 210; const maxLineWidth = pageWidth - (margin * 2); let y = 20; 

            if (company.logo) { try { doc.addImage(company.logo, 'JPEG', margin, y, 25, 25); } catch (e) {} }
            
            doc.setFont("times", "bold"); doc.setFontSize(16); doc.text("CONTRATO DE PRESTAÇÃO DE SERVIÇOS", pageWidth / 2, y + 10, { align: "center" }); 
            doc.setFontSize(10); doc.text("DE DECORAÇÃO E EVENTOS", pageWidth / 2, y + 16, { align: "center" }); y += 35;

            doc.setFontSize(10); doc.setFont("times", "normal");
            const cName = company.fantasia || 'A CONTRATADA'; const cCnpj = company.cnpj || '....................'; const cEnd = (company.rua || '') + ' - ' + (company.cidade || '');
            const txtPartes = 'IDENTIFICAÇÃO DAS PARTES\n\nCONTRATADA: ' + cName + ', inscrita no CNPJ sob nº ' + cCnpj + ', com sede em ' + cEnd + '.\n\nCONTRATANTE: ' + cli.name + ', CPF nº ' + (cli.cpf || '....................') + ', Telefone: ' + (cli.phone || '....................') + '.';
            doc.text(doc.splitTextToSize(txtPartes, maxLineWidth), margin, y); y += 35;

            doc.setFont("times", "bold"); doc.text("CLÁUSULA 1ª - DO OBJETO", margin, y); y += 6; doc.setFont("times", "normal");
            const txtObjeto = 'O presente contrato tem como objeto a prestação de serviços de decoração para o evento em ' + formatDate(app.date) + ', às ' + app.time + ' horas, no local: ' + (app.location.bairro || 'A definir') + '.';
            doc.text(doc.splitTextToSize(txtObjeto, maxLineWidth), margin, y); y += 20;

            doc.setFont("times", "bold"); doc.text("CLÁUSULA 2ª - DOS ITENS CONTRATADOS", margin, y); y += 6; doc.setFont("times", "normal");
            let servicosTexto = 'A CONTRATADA fornecerá:\n'; app.selectedServices.forEach(s => { servicosTexto += '• ' + s.description + ' (' + formatCurrency(s.price) + ')\n'; });
            doc.text(doc.splitTextToSize(servicosTexto, maxLineWidth), margin, y); y += (app.selectedServices.length * 5) + 10;

            doc.setFont("times", "bold"); doc.text("CLÁUSULA 3ª - DO VALOR E PAGAMENTO", margin, y); y += 6; doc.setFont("times", "normal");
            const entry = app.entryFee || app.details?.entryFee || 0;
            const txtValor = 'Valor total: ' + formatCurrency(app.totalServices) + '. Sinal pago: ' + formatCurrency(entry) + '. Restante: ' + formatCurrency(app.finalBalance) + ' a ser quitado até a data do evento.';
            doc.text(doc.splitTextToSize(txtValor, maxLineWidth), margin, y); y += 20;

            doc.setFont("times", "bold"); doc.text("CLÁUSULA 4ª - DO CANCELAMENTO", margin, y); y += 6; doc.setFont("times", "normal");
            const txtCancel = 'Cancelamento com menos de 30 dias implica na perda do sinal para cobrir custos operacionais.';
            doc.text(doc.splitTextToSize(txtCancel, maxLineWidth), margin, y); y += 25;

            if (y > 240) { doc.addPage(); y = 40; } else { y += 20; }
            doc.text( (company.cidade || 'Local') + ', ' + new Date().toLocaleDateString('pt-BR') + '.', margin, y); y += 25;

            doc.setLineWidth(0.5); doc.line(margin, y, 90, y); doc.line(110, y, 190, y); y += 5;
            doc.setFontSize(8); doc.text("CONTRATADA", margin + 20, y); doc.text("CONTRATANTE", 135, y);
            doc.save("Contrato.pdf"); 
        };
        
        const handleLogoUpload = (e) => { const f = e.target.files[0]; if(f){ const r = new FileReader(); r.onload=x=>{ company.logo=x.target.result; saveCompany(); }; r.readAsDataURL(f); } };
        const saveCompany = async () => { localStorage.setItem('pp_company', JSON.stringify(company)); if(user.value) await updateDoc(doc(db,"users",user.value.uid), {companyConfig:company}); Swal.fire('Salvo','','success'); };
        const addTask = (app) => { if(!newTaskText.value[app.id]) return; app.checklist.push({text:newTaskText.value[app.id], done:false}); newTaskText.value[app.id]=''; updateAppInFirebase(app); };
        const removeTask = (app, i) => { app.checklist.splice(i, 1); updateAppInFirebase(app); };
        const checklistProgress = (app) => { if(!app.checklist?.length) return 0; return Math.round((app.checklist.filter(t=>t.done).length/app.checklist.length)*100); };
        const addServiceToApp = () => { if(tempServiceSelect.value) { tempApp.selectedServices.push({...tempServiceSelect.value}); tempServiceSelect.value = ''; } };
        const removeServiceFromApp = (i) => tempApp.selectedServices.splice(i,1);
        const toggleDarkMode = () => { isDark.value = !isDark.value; if(isDark.value) document.documentElement.classList.add('dark'); else document.documentElement.classList.remove('dark'); localStorage.setItem('pp_dark', isDark.value); };

        const handleChangePassword = async () => {
            const html = '<input id="currentPass" type="password" class="swal2-input" placeholder="Senha Atual">' + '<input id="newPass" type="password" class="swal2-input" placeholder="Nova Senha">';
            const { value: formValues } = await Swal.fire({ title: 'Alterar Senha', html: html, showCancelButton: true, confirmButtonText: 'Alterar', preConfirm: () => { const c = document.getElementById('currentPass').value; const n = document.getElementById('newPass').value; if (!c || !n) { Swal.showValidationMessage('Preencha os dois campos'); } return [c, n]; } });
            if (formValues) {
                try {
                    const credential = EmailAuthProvider.credential(user.value.email, formValues[0]);
                    await reauthenticateWithCredential(user.value, credential);
                    await updatePassword(user.value, formValues[1]);
                    Swal.fire('Sucesso!', 'Senha alterada.', 'success');
                } catch (error) { Swal.fire('Erro', 'Senha incorreta.', 'error'); }
            }
        };

        return {
            user, userRole, userStatus, daysRemaining, authForm, authLoading, view, catalogView, isDark, dashboardFilter, 
            clients, services, appointments: pendingAppointments, expenses, company,
            tempApp, tempServiceSelect, newExpense, currentReceipt, 
            isEditing, newTaskText, 
            kpiRevenue, kpiExpenses, kpiReceivables, kpiProfit, next7DaysApps, pendingCount,
            filteredListAppointments, totalServices, finalBalance,
            currentTab, historyFilter, searchHistory, isLoadingHistory, 
            handleLogin, logout, toggleDarkMode,
            startNewSchedule, editAppointment, saveAppointment, changeStatus, addExpense, deleteExpense, 
            openClientModal, deleteClient, openServiceModal, deleteService,
            addTask, removeTask, checklistProgress,
            addServiceToApp, removeServiceFromApp, handleLogoUpload, saveCompany,
            showReceipt, downloadReceiptImage, generateContractPDF, 
            getClientName, getClientPhone, formatCurrency, formatDate, getDay, getMonth, statusText, statusClass,
            clientSearchTerm, filteredClientsSearch, selectClientFromSearch, clearClientSelection,
            handleChangePassword
        };
    }
}).mount('#app');
