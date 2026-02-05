const { createApp, ref, computed, reactive, onMounted } = Vue;

// Importa as configurações do arquivo firebase.js (certifique-se que ele está na mesma pasta)
import { 
    db, auth, 
    collection, addDoc, onSnapshot, doc, updateDoc, deleteDoc, 
    signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged 
} from './firebase.js';

createApp({
    setup() {
        // --- 1. PWA SERVICE WORKER ---
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('./sw.js')
                .then(() => console.log('PWA Service Worker Registrado!'))
                .catch(err => console.log('Erro PWA:', err));
        }

        // --- 2. ESTADOS (VARIÁVEIS) ---
        const user = ref(null);
        const authLoading = ref(false);
        const authForm = reactive({ email: '', password: '' });
        const view = ref('dashboard');
        const isDark = ref(false);
        const dashboardFilter = ref('month');
        const filterDate = ref('');
        const isEditing = ref(false);
        const editingId = ref(null);
        const currentReceipt = ref(null);
        const newTaskText = ref({});

        const clients = ref([]);
        const services = ref([]);
        const appointments = ref([]);
        const expenses = ref([]);
        const company = reactive({ fantasia: '', logo: '', cnpj: '', razao: '', cidade: '', rua: '', estado: '' });
        
        const tempApp = reactive({ clientId: '', date: '', time: '', location: { bairro: '', cidade: '', numero: '' }, details: { colors: '', entryFee: 0 }, selectedServices: [] });
        const tempServiceSelect = ref('');
        const newExpense = reactive({ description: '', value: '', date: new Date().toISOString().split('T')[0] });

        // --- 3. UTILITÁRIOS DE FORMATAÇÃO ---
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

        // --- 4. LÓGICA DE AUTENTICAÇÃO ---
        onMounted(() => {
            onAuthStateChanged(auth, (u) => {
                user.value = u;
                if (u) {
                    syncData(); 
                } else {
                    clients.value=[]; services.value=[]; appointments.value=[]; expenses.value=[];
                }
            });
            // Carregar tema salvo
            if(localStorage.getItem('pp_dark') === 'true') {
                isDark.value = true;
                document.documentElement.classList.add('dark');
            }
        });

        const handleLogin = async () => {
            authLoading.value = true;
            try {
                await signInWithEmailAndPassword(auth, authForm.email, authForm.password);
                Swal.fire({ icon: 'success', title: 'Bem-vindo!', timer: 1500, showConfirmButton: false });
            } catch (error) {
                let msg = 'Email ou senha incorretos.';
                if(error.code === 'auth/invalid-credential') msg = 'Credenciais inválidas.';
                Swal.fire('Erro', msg, 'error');
            } finally {
                authLoading.value = false;
            }
        };

        const handleRegister = async () => {
            authLoading.value = true;
            try {
                await createUserWithEmailAndPassword(auth, authForm.email, authForm.password);
                Swal.fire({ icon: 'success', title: 'Conta criada!', text: 'Você já está logado.', timer: 1500 });
            } catch (error) {
                let msg = error.message;
                if(error.code === 'auth/email-already-in-use') msg = 'Este email já existe.';
                if(error.code === 'auth/weak-password') msg = 'Senha fraca (min 6 digitos).';
                Swal.fire('Erro', msg, 'error');
            } finally {
                authLoading.value = false;
            }
        };

        const logout = async () => {
            await signOut(auth);
        };

        // --- 5. SINCRONIZAÇÃO DE DADOS (DATABASE) ---
        let unsubscribeListeners = [];
        const syncData = () => {
            unsubscribeListeners.forEach(unsub => unsub());
            unsubscribeListeners = [];

            const addListener = (colName, targetRef) => {
                const unsub = onSnapshot(collection(db, colName), (snap) => {
                    targetRef.value = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                });
                unsubscribeListeners.push(unsub);
            };

            addListener("clients", clients);
            addListener("services", services);
            addListener("appointments", appointments);
            addListener("expenses", expenses);
            
            const savedCompany = JSON.parse(localStorage.getItem('pp_company'));
            if(savedCompany) Object.assign(company, savedCompany);
        };

        // --- 6. CÁLCULOS (COMPUTED) ---
        const kpiRevenue = computed(() => { 
            const now = new Date(); 
            return appointments.value.filter(a => a.status !== 'cancelled').filter(a => {
                const d = new Date(a.date);
                if(dashboardFilter.value === 'year') return d.getFullYear() === now.getFullYear();
                return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
            }).reduce((acc, a) => acc + (a.totalServices || 0), 0); 
        });
        const kpiExpenses = computed(() => { 
            const now = new Date(); 
            return expenses.value.filter(e => {
                const d = new Date(e.date);
                if(dashboardFilter.value === 'year') return d.getFullYear() === now.getFullYear();
                return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
            }).reduce((acc, e) => acc + (e.value || 0), 0); 
        });
        const kpiReceivables = computed(() => appointments.value.filter(a => a.status === 'pending').reduce((acc, a) => acc + (a.finalBalance || 0), 0));
        const next7DaysApps = computed(() => { 
            const t = new Date(); t.setHours(0,0,0,0); 
            const w = new Date(t); w.setDate(t.getDate() + 7); 
            return appointments.value.filter(a => {
                const dp = a.date.split('-');
                const d = new Date(dp[0], dp[1]-1, dp[2]);
                return d >= t && d <= w && a.status === 'pending';
            }).sort((a,b) => new Date(a.date) - new Date(b.date));
        });
        const filteredListAppointments = computed(() => { 
            let l = appointments.value; 
            if(filterDate.value) l = l.filter(a => a.date === filterDate.value); 
            return [...l].sort((a,b) => new Date(b.date) - new Date(a.date)); 
        });
        const totalServices = computed(() => tempApp.selectedServices.reduce((s,i) => s + i.price, 0));
        const finalBalance = computed(() => totalServices.value - (tempApp.details.entryFee || 0));

        // --- 7. AÇÕES PRINCIPAIS (SALVAR, EDITAR, EXCLUIR) ---
        const saveAppointment = async () => {
            const total = tempApp.selectedServices.reduce((sum, i) => sum + i.price, 0);
            const appData = { 
                ...JSON.parse(JSON.stringify(tempApp)), 
                totalServices: total, 
                entryFee: tempApp.details.entryFee,
                finalBalance: total - tempApp.details.entryFee 
            };
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
        };
        const updateAppInFirebase = async (app) => { await updateDoc(doc(db, "appointments", app.id), { checklist: app.checklist, status: app.status }); };
        const addExpense = async () => { if(!newExpense.description || !newExpense.value) return; await addDoc(collection(db, "expenses"), {...newExpense}); Object.assign(newExpense, {description: '', value: ''}); Swal.fire({icon:'success', title:'Registrado', timer:1000}); };
        const deleteExpense = async (id) => { await deleteDoc(doc(db, "expenses", id)); };

        // --- 8. FUNÇÕES DE NAVEGAÇÃO (QUE FALTAVAM) ---
        const startNewSchedule = () => { 
            isEditing.value = false; 
            editingId.value = null; 
            // Resetar o objeto tempApp
            Object.assign(tempApp, { 
                clientId: '', 
                date: '',
                time: '',
                location: { bairro: '', cidade: '', numero: '' },
                details: { colors: '', entryFee: 0 },
                selectedServices: []
            }); 
            view.value = 'schedule'; 
        };

        const editAppointment = (app) => { 
            isEditing.value = true; 
            editingId.value = app.id; 
            Object.assign(tempApp, JSON.parse(JSON.stringify(app))); 
            view.value = 'schedule'; 
        };

        const showReceipt = (app) => { 
            currentReceipt.value = app; 
            view.value = 'receipt'; 
        };

        // --- 9. MODALS, PDF E HELPERS ---
        const validateCPF = (cpf) => { cpf = cpf.replace(/[^\d]+/g,''); if(cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false; let s=0,r; for(let i=1; i<=9; i++) s += parseInt(cpf.substring(i-1, i)) * (11 - i); r = (s * 10) % 11; if((r === 10) || (r === 11)) r = 0; if(r !== parseInt(cpf.substring(9, 10))) return false; s = 0; for(let i=1; i<=10; i++) s += parseInt(cpf.substring(i-1, i)) * (12 - i); r = (s * 10) % 11; if((r === 10) || (r === 11)) r = 0; if(r !== parseInt(cpf.substring(10, 11))) return false; return true; };
        const maskPhone = (v) => { v=v.replace(/\D/g,""); v=v.replace(/^(\d{2})(\d)/g,"($1) $2"); v=v.replace(/(\d)(\d{4})$/,"$1-$2"); return v.slice(0,15); };
        const maskCPF = (v) => { v=v.replace(/\D/g,""); v=v.replace(/(\d{3})(\d)/,"$1.$2"); v=v.replace(/(\d{3})(\d)/,"$1.$2"); v=v.replace(/(\d{3})(\d{1,2})$/,"$1-$2"); return v.slice(0,14); };

        const openClientModal = async (c) => {
            const { value: vals } = await Swal.fire({
                title: c ? 'Editar Cliente' : 'Novo Cliente',
                html: `<input id="swal-name" class="swal2-input" placeholder="Nome" value="${c?.name||''}"><input id="swal-phone" class="swal2-input" placeholder="Telefone" value="${c?.phone||''}"><input id="swal-cpf" class="swal2-input" placeholder="CPF" value="${c?.cpf||''}">`,
                didOpen: () => {
                    const p = Swal.getPopup().querySelector('#swal-phone'); const cp = Swal.getPopup().querySelector('#swal-cpf');
                    p.addEventListener('input', (e) => e.target.value = maskPhone(e.target.value)); cp.addEventListener('input', (e) => e.target.value = maskCPF(e.target.value));
                },
                preConfirm: () => [document.getElementById('swal-name').value, document.getElementById('swal-phone').value, document.getElementById('swal-cpf').value]
            });
            if(vals) {
                const data = {name: vals[0], phone: vals[1], cpf: vals[2]};
                if(c) await updateDoc(doc(db, "clients", c.id), data); else await addDoc(collection(db, "clients"), data);
                Swal.fire('Salvo!', '', 'success');
            }
        };
        const deleteClient = async (id) => { if((await Swal.fire({title:'Excluir?',showCancelButton:true})).isConfirmed) await deleteDoc(doc(db, "clients", id)); };
        
        const openServiceModal = async (s) => { const { value: v } = await Swal.fire({ html: `<input id="d" class="swal2-input" value="${s?.description||''}"><input id="p" type="number" class="swal2-input" value="${s?.price||''}">`, preConfirm: () => [document.getElementById('d').value, document.getElementById('p').value] }); if(v) { const data = {description: v[0], price: Number(v[1])}; if(s) await updateDoc(doc(db, "services", s.id), data); else await addDoc(collection(db, "services"), data); } };
        const deleteService = async (id) => { await deleteDoc(doc(db, "services", id)); };

        const downloadReceiptImage = () => { html2canvas(document.getElementById('receipt-capture-area'),{scale:2}).then(c=>{const l=document.createElement('a');l.download=`Recibo_${currentReceipt.value.id}.png`;l.href=c.toDataURL();l.click();}); };
        
        const generateContractPDF = () => { 
            const { jsPDF } = window.jspdf; 
            const doc = new jsPDF(); 
            const app = currentReceipt.value; 
            const cli = clients.value.find(c => c.id === app.clientId) || {name: 'N/A'}; 
            
            doc.setFontSize(16); doc.text("CONTRATO DE SERVIÇOS", 105, 20, {align:"center"}); 
            doc.setFontSize(10); 
            doc.text(`CONTRATADA: ${company.razao} | CNPJ: ${company.cnpj}`, 20, 40); 
            doc.text(`CLIENTE: ${cli.name} | CPF: ${cli.cpf||'N/A'}`, 20, 50); 
            doc.text(`DATA: ${formatDate(app.date)} - ${app.time}`, 20, 60); 
            
            let y=80; 
            app.selectedServices.forEach(s => { doc.text(`- ${s.description}`, 20, y); y+=5; }); 
            
            const entry = app.entryFee || app.details?.entryFee || 0;
            doc.text(`TOTAL: ${formatCurrency(app.totalServices)}`, 20, y+10); 
            doc.text(`ENTRADA: - ${formatCurrency(entry)}`, 20, y+15);
            doc.text(`RESTANTE: ${formatCurrency(app.finalBalance)}`, 20, y+20);
            
            doc.save(`Contrato_${app.id}.pdf`); 
        };
        
        const handleLogoUpload = (e) => { const f = e.target.files[0]; if(f){ const r = new FileReader(); r.onload=x=>company.logo=x.target.result; r.readAsDataURL(f); } };
        const saveCompany = () => { localStorage.setItem('pp_company', JSON.stringify(company)); Swal.fire('Salvo!', '', 'success'); view.value='catalog_hub'; };
        
        const addTask = (app) => { const t = newTaskText.value[app.id]; if(!t) return; app.checklist.push({text:t, done:false}); newTaskText.value[app.id]=''; updateAppInFirebase(app); };
        const removeTask = (app, i) => { app.checklist.splice(i, 1); updateAppInFirebase(app); };
        const checklistProgress = (app) => { if(!app.checklist?.length) return 0; return Math.round((app.checklist.filter(t=>t.done).length/app.checklist.length)*100); };
        const changeStatus = (app, s) => { app.status = s; updateAppInFirebase(app); };
        const addServiceToApp = () => { if(tempServiceSelect.value) { tempApp.selectedServices.push({...tempServiceSelect.value}); tempServiceSelect.value = ''; } };
        const removeServiceFromApp = (i) => tempApp.selectedServices.splice(i,1);
        
        const toggleDarkMode = () => { 
            isDark.value = !isDark.value; 
            if(isDark.value) document.documentElement.classList.add('dark');
            else document.documentElement.classList.remove('dark');
            localStorage.setItem('pp_dark', isDark.value);
        };

        // --- 10. RETORNO PARA O HTML ---
        return {
            user, authForm, authLoading, view, isDark, dashboardFilter, 
            clients, services, appointments, expenses, company, 
            tempApp, tempServiceSelect, newExpense, currentReceipt, 
            isEditing, newTaskText, filterDate,
            kpiRevenue, kpiExpenses, kpiReceivables, next7DaysApps, 
            filteredListAppointments, totalServices, finalBalance,
            handleLogin, handleRegister, logout, toggleDarkMode,
            startNewSchedule, editAppointment, saveAppointment, updateAppInFirebase, addExpense, deleteExpense, 
            openClientModal, deleteClient, openServiceModal, deleteService,
            addTask, removeTask, checklistProgress, changeStatus,
            addServiceToApp, removeServiceFromApp, handleLogoUpload, saveCompany,
            showReceipt, downloadReceiptImage, generateContractPDF, 
            getClientName, formatCurrency, formatDate, getDay, getMonth, statusText, statusClass
        };
    }
}).mount('#app');