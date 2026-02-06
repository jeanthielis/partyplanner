const { createApp, ref, computed, reactive, onMounted } = Vue;

import { 
    db, auth, 
    collection, addDoc, onSnapshot, doc, updateDoc, deleteDoc, getDocs, query, where, setDoc, getDoc,
    signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged 
} from './firebase.js';

// Import necessário para o Admin (caso ainda exista código residual, mantemos por segurança)
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
        // PWA
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('./sw.js').catch(err => console.log('Erro PWA:', err));
        }

        // --- ESTADOS GERAIS ---
        const user = ref(null);
        const userRole = ref('user');
        const userStatus = ref('trial');
        const daysRemaining = ref(30);
        
        const authLoading = ref(false);
        const authForm = reactive({ email: '', password: '' });
        
        const view = ref('dashboard');
        const isDark = ref(false);
        const dashboardFilter = ref('month');
        
        // --- ESTADOS DE ABAS E FILTRO ---
        const currentTab = ref('pending'); 
        const historyFilter = reactive({ start: '', end: '' });
        const historyList = ref([]); 
        const isLoadingHistory = ref(false);

        // --- NOVOS ESTADOS PARA BUSCA DE CLIENTE ---
        const clientSearchTerm = ref('');
        const filteredClientsSearch = computed(() => {
            if (clientSearchTerm.value.length < 3) return [];
            const term = clientSearchTerm.value.toLowerCase();
            return clients.value.filter(c => 
                c.name.toLowerCase().includes(term) || 
                (c.phone && c.phone.includes(term))
            );
        });

        const selectClientFromSearch = (client) => {
            tempApp.clientId = client.id;
            clientSearchTerm.value = ''; 
        };

        const clearClientSelection = () => {
            tempApp.clientId = '';
            clientSearchTerm.value = '';
        };
        // ---------------------------------------------

        const isEditing = ref(false);
        const editingId = ref(null);
        const currentReceipt = ref(null);
        const newTaskText = ref({});

        // Dados
        const clients = ref([]);
        const services = ref([]);
        const pendingAppointments = ref([]); 
        const expenses = ref([]);
        const company = reactive({ fantasia: '', logo: '', cnpj: '', razao: '', cidade: '', rua: '', estado: '' });
        
        const tempApp = reactive({ clientId: '', date: '', time: '', location: { bairro: '', cidade: '', numero: '' }, details: { colors: '', entryFee: 0 }, selectedServices: [] });
        const tempServiceSelect = ref('');
        const newExpense = reactive({ description: '', value: '', date: new Date().toISOString().split('T')[0] });

        // --- UTILS ---
        const formatCurrency = (v) => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(v||0);
        const formatDate = (d) => d ? d.split('-').reverse().join('/') : '';
        const getDay = (d) => d ? d.split('-')[2] : '';
        const getMonth = (d) => ['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'][parseInt(d.split('-')[1])-1];
        const statusText = (s) => s === 'concluded' ? 'Concluída' : (s === 'cancelled' ? 'Cancelada' : 'Pendente');
        const statusClass = (s) => s === 'concluded' ? 'bg-green-100 text-green-600' : (s === 'cancelled' ? 'bg-red-100 text-red-600' : 'bg-yellow-100 text-yellow-600');
        
        const getClientName = (id) => {
            const client = clients.value.find(c => c.id === id);
            return client ? client.name : 'Desconhecido';
        };

        // --- AUTH & SEGURANÇA ---
        onMounted(() => {
            onAuthStateChanged(auth, async (u) => {
                if (u) {
                    // Verifica se o usuário ainda existe no banco (Bloqueio "Renatinha")
                    const userDocRef = doc(db, "users", u.uid);
                    const userDoc = await getDoc(userDocRef);

                    if (!userDoc.exists()) {
                        await signOut(auth);
                        user.value = null;
                        Swal.fire({ icon: 'error', title: 'Acesso Revogado', text: 'Sua conta foi removida pelo administrador.' });
                        return;
                    }

                    user.value = u;
                    const data = userDoc.data();
                    userRole.value = data.role || 'user';
                    userStatus.value = data.status || 'trial';
                    
                    // Lógica 30 Dias Trial
                    if (userRole.value !== 'admin' && userStatus.value !== 'active') {
                        const createdAt = new Date(data.createdAt || new Date());
                        const now = new Date();
                        const diffDays = Math.ceil(Math.abs(now - createdAt) / (1000 * 60 * 60 * 24)); 
                        daysRemaining.value = 30 - diffDays;

                        if (daysRemaining.value <= 0) {
                            view.value = 'expired_plan';
                            return; 
                        }
                    }

                    if(data.companyConfig) Object.assign(company, data.companyConfig);
                    syncData();
                } else {
                    user.value = null;
                    clients.value=[]; services.value=[]; pendingAppointments.value=[]; expenses.value=[];
                }
            });

            if(localStorage.getItem('pp_dark') === 'true') { 
                isDark.value = true; 
                document.documentElement.classList.add('dark'); 
            }
            
            const today = new Date(); 
            const lastMonth = new Date(); 
            lastMonth.setDate(today.getDate() - 30);
            historyFilter.end = today.toISOString().split('T')[0]; 
            historyFilter.start = lastMonth.toISOString().split('T')[0];
        });

        const handleLogin = async () => {
            authLoading.value = true;
            try { 
                await signInWithEmailAndPassword(auth, authForm.email, authForm.password); 
            } catch (error) { 
                Swal.fire('Erro', 'Dados incorretos', 'error'); 
            } finally { 
                authLoading.value = false; 
            }
        };

        const logout = async () => { 
            await signOut(auth); 
            view.value='dashboard'; 
        };

        // --- SINCRONIZAÇÃO DE DADOS ---
        let unsubscribeListeners = [];
        const syncData = () => {
            unsubscribeListeners.forEach(unsub => unsub()); 
            unsubscribeListeners = [];
            
            const myId = user.value.uid; 

            unsubscribeListeners.push(onSnapshot(query(collection(db, "clients"), where("userId", "==", myId)), (snap) => { 
                clients.value = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })); 
            }));
            
            unsubscribeListeners.push(onSnapshot(query(collection(db, "services"), where("userId", "==", myId)), (snap) => { 
                services.value = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })); 
            }));
            
            unsubscribeListeners.push(onSnapshot(query(collection(db, "expenses"), where("userId", "==", myId)), (snap) => { 
                expenses.value = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })); 
            }));

            const qApps = query(
                collection(db, "appointments"), 
                where("userId", "==", myId),
                where("status", "==", "pending")
            );
            unsubscribeListeners.push(onSnapshot(qApps, (snap) => { 
                pendingAppointments.value = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })); 
            }));
        };

        // --- BUSCA HISTÓRICO ---
        const searchHistory = async () => {
            if(!historyFilter.start || !historyFilter.end) return Swal.fire('Atenção', 'Selecione as datas', 'warning');
            isLoadingHistory.value = true; 
            historyList.value = [];
            try {
                const q = query(
                    collection(db, "appointments"), 
                    where("userId", "==", user.value.uid), 
                    where("status", "==", currentTab.value), 
                    where("date", ">=", historyFilter.start), 
                    where("date", "<=", historyFilter.end)
                );
                const querySnapshot = await getDocs(q);
                historyList.value = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                if(historyList.value.length === 0) Swal.fire('Info', 'Nenhum registro encontrado.', 'info');
            } catch (error) { 
                console.error(error); 
                Swal.fire('Erro', 'Verifique console.', 'error'); 
            } finally { 
                isLoadingHistory.value = false; 
            }
        };

        // --- COMPUTED KPI & FILTROS ---
        const filteredListAppointments = computed(() => { 
            let list = currentTab.value === 'pending' ? pendingAppointments.value : historyList.value;
            return [...list].sort((a,b) => new Date(a.date) - new Date(b.date)); 
        });
        const kpiRevenue = computed(() => pendingAppointments.value.reduce((acc, a) => acc + (a.totalServices || 0), 0));
        const kpiExpenses = computed(() => expenses.value.reduce((acc, e) => acc + (e.value || 0), 0));
        const kpiReceivables = computed(() => pendingAppointments.value.reduce((acc, a) => acc + (a.finalBalance || 0), 0));
        const next7DaysApps = computed(() => { 
            const t = new Date(); t.setHours(0,0,0,0); const w = new Date(t); w.setDate(t.getDate() + 7); 
            return pendingAppointments.value.filter(a => { return new Date(a.date) >= t && new Date(a.date) <= w; }).sort((a,b) => new Date(a.date) - new Date(b.date));
        });
        const totalServices = computed(() => tempApp.selectedServices.reduce((s,i) => s + i.price, 0));
        const finalBalance = computed(() => totalServices.value - (tempApp.details.entryFee || 0));

        // --- AÇÕES ---
        const saveAppointment = async () => {
            const total = tempApp.selectedServices.reduce((sum, i) => sum + i.price, 0);
            const appData = { ...JSON.parse(JSON.stringify(tempApp)), totalServices: total, entryFee: tempApp.details.entryFee, finalBalance: total - tempApp.details.entryFee, userId: user.value.uid };
            if(isEditing.value && editingId.value) { 
                await updateDoc(doc(db, "appointments", editingId.value), appData); 
                Swal.fire({icon:'success', title:'Atualizado', timer:1000}); 
            } else { 
                appData.status = 'pending'; 
                appData.checklist = [{text:'Confirmar Equipe', done:false},{text:'Separar Materiais', done:false}]; 
                await addDoc(collection(db, "appointments"), appData); 
                Swal.fire({icon:'success', title:'Agendado!', timer:1000}); 
            }
            view.value = 'appointments_list'; 
            currentTab.value = 'pending';
        };

        const changeStatus = async (app, status) => { 
            await updateDoc(doc(db, "appointments", app.id), { status: status });
            if(currentTab.value !== 'pending') { 
                const idx = historyList.value.findIndex(x => x.id === app.id); 
                if(idx !== -1) historyList.value[idx].status = status; 
            }
        };

        const updateAppInFirebase = async (app) => { await updateDoc(doc(db, "appointments", app.id), { checklist: app.checklist }); };
        const addExpense = async () => { if(!newExpense.description) return; await addDoc(collection(db, "expenses"), {...newExpense, userId: user.value.uid}); Object.assign(newExpense, {description: '', value: ''}); Swal.fire({icon:'success', title:'Registrado', timer:1000}); };
        const deleteExpense = async (id) => { await deleteDoc(doc(db, "expenses", id)); };
        
        const startNewSchedule = () => { 
            isEditing.value=false; 
            editingId.value=null; 
            // Limpa cliente e busca
            clientSearchTerm.value = ''; 
            Object.assign(tempApp, {clientId: '', date: '', time: '', location: { bairro: '', cidade: '', numero: '' }, details: { colors: '', entryFee: 0 }, selectedServices: [] }); 
            view.value='schedule'; 
        };
        
        const editAppointment = (app) => { 
            isEditing.value=true; 
            editingId.value=app.id; 
            clientSearchTerm.value = ''; // Limpa busca
            Object.assign(tempApp, JSON.parse(JSON.stringify(app))); 
            view.value='schedule'; 
        };
        
        const showReceipt = (app) => { currentReceipt.value = app; view.value = 'receipt'; };
        const openClientModal = async (c) => { 
            const { value: vals } = await Swal.fire({ title: c?'Editar':'Novo', html: `<input id="n" class="swal2-input" value="${c?.name||''}" placeholder="Nome"><input id="p" class="swal2-input" value="${c?.phone||''}" placeholder="Telefone"><input id="cpf" class="swal2-input" value="${c?.cpf||''}" placeholder="CPF">`, preConfirm:()=>[document.getElementById('n').value,document.getElementById('p').value, document.getElementById('cpf').value] });
            if(vals) { 
                const d={name:vals[0], phone:vals[1], cpf:vals[2], userId:user.value.uid}; 
                if(c) await updateDoc(doc(db,"clients",c.id),d); 
                else await addDoc(collection(db,"clients"),d); 
                Swal.fire('Salvo','','success'); 
            } 
        };
        const deleteClient = async (id) => { if((await Swal.fire({title:'Excluir?',showCancelButton:true})).isConfirmed) await deleteDoc(doc(db,"clients",id)); };
        const openServiceModal = async (s) => { const {value:v}=await Swal.fire({html:`<input id="d" class="swal2-input" value="${s?.description||''}"><input id="p" type="number" class="swal2-input" value="${s?.price||''}">`,preConfirm:()=>[document.getElementById('d').value,document.getElementById('p').value]}); if(v){ const d={description:v[0],price:Number(v[1]),userId:user.value.uid}; if(s)await updateDoc(doc(db,"services",s.id),d); else await addDoc(collection(db,"services"),d); }};
        const deleteService = async (id) => { await deleteDoc(doc(db,"services",id)); };
        const downloadReceiptImage = () => { html2canvas(document.getElementById('receipt-capture-area'),{scale:2}).then(c=>{const l=document.createElement('a');l.download='Recibo.png';l.href=c.toDataURL();l.click();}); };
        const generateContractPDF = () => { const { jsPDF } = window.jspdf; const doc = new jsPDF(); const app = currentReceipt.value; const cli = clients.value.find(c => c.id === app.clientId) || {name: 'N/A', cpf: '', phone: ''}; const margin = 20; let y = 20; const pageWidth = doc.internal.pageSize.getWidth(); const maxTextWidth = pageWidth - (margin * 2); doc.setFontSize(14); doc.setFont("helvetica", "bold"); doc.text("CONTRATO DE PRESTAÇÃO DE SERVIÇOS", pageWidth / 2, y, { align: "center" }); y += 15; doc.setFontSize(10); doc.setFont("helvetica", "bold"); doc.text("IDENTIFICAÇÃO DAS PARTES", margin, y); y += 6; doc.setFont("helvetica", "normal"); const txtContratada = `CONTRATADA: ${company.fantasia || 'Empresa'}, Razão Social: ${company.razao || ''}, CNPJ: ${company.cnpj || 'N/A'}, Endereço: ${company.rua || ''} - ${company.cidade || ''}.`; const txtContratante = `CONTRATANTE: ${cli.name}, CPF: ${cli.cpf || 'N/A'}, Telefone: ${cli.phone || 'N/A'}.`; doc.text(doc.splitTextToSize(txtContratada, maxTextWidth), margin, y); y += 20; doc.text(doc.splitTextToSize(txtContratante, maxTextWidth), margin, y); y += 20; doc.text(`OBJETO: Evento dia ${formatDate(app.date)} às ${app.time}. Local: ${app.location.bairro}.`, margin, y); y += 10; app.selectedServices.forEach(s => { doc.text(`- ${s.description}: ${formatCurrency(s.price)}`, margin, y); y += 6; }); y += 10; const entry = app.entryFee || app.details?.entryFee || 0; doc.text(`TOTAL: ${formatCurrency(app.totalServices)} | ENTRADA: ${formatCurrency(entry)} | RESTANTE: ${formatCurrency(app.finalBalance)}`, margin, y); doc.save("Contrato.pdf"); };
        const handleLogoUpload = (e) => { const f = e.target.files[0]; if(f){ const r = new FileReader(); r.onload=x=>{ company.logo=x.target.result; saveCompany(); }; r.readAsDataURL(f); } };
        const saveCompany = async () => { localStorage.setItem('pp_company', JSON.stringify(company)); if(user.value) await updateDoc(doc(db,"users",user.value.uid), {companyConfig:company}); Swal.fire('Salvo','','success'); view.value='catalog_hub'; };
        const addTask = (app) => { if(!newTaskText.value[app.id]) return; app.checklist.push({text:newTaskText.value[app.id], done:false}); newTaskText.value[app.id]=''; updateAppInFirebase(app); };
        const removeTask = (app, i) => { app.checklist.splice(i, 1); updateAppInFirebase(app); };
        const checklistProgress = (app) => { if(!app.checklist?.length) return 0; return Math.round((app.checklist.filter(t=>t.done).length/app.checklist.length)*100); };
        const addServiceToApp = () => { if(tempServiceSelect.value) { tempApp.selectedServices.push({...tempServiceSelect.value}); tempServiceSelect.value = ''; } };
        const removeServiceFromApp = (i) => tempApp.selectedServices.splice(i,1);
        const toggleDarkMode = () => { isDark.value = !isDark.value; if(isDark.value) document.documentElement.classList.add('dark'); else document.documentElement.classList.remove('dark'); localStorage.setItem('pp_dark', isDark.value); };

        return {
            user, userRole, userStatus, daysRemaining, authForm, authLoading, view, isDark, dashboardFilter, 
            clients, services, appointments: pendingAppointments, expenses, company,
            tempApp, tempServiceSelect, newExpense, currentReceipt, 
            isEditing, newTaskText, 
            kpiRevenue, kpiExpenses, kpiReceivables, next7DaysApps, 
            filteredListAppointments, totalServices, finalBalance,
            currentTab, historyFilter, searchHistory, isLoadingHistory, 
            handleLogin, logout, toggleDarkMode,
            startNewSchedule, editAppointment, saveAppointment, changeStatus, addExpense, deleteExpense, 
            openClientModal, deleteClient, openServiceModal, deleteService,
            addTask, removeTask, checklistProgress,
            addServiceToApp, removeServiceFromApp, handleLogoUpload, saveCompany,
            showReceipt, downloadReceiptImage, generateContractPDF, 
            getClientName, formatCurrency, formatDate, getDay, getMonth, statusText, statusClass,
            // NOVOS:
            clientSearchTerm, filteredClientsSearch, selectClientFromSearch, clearClientSelection
        };
    }
}).mount('#app');
