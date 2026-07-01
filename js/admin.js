const { createApp, ref, computed, reactive, onMounted, watch } = Vue;

import { 
    db, auth, firebaseConfig, 
    collection, onSnapshot, doc, updateDoc, deleteDoc, getDoc, setDoc, signOut, onAuthStateChanged, addDoc,
    query, orderBy, limit 
} from './firebase.js';

// Usando imports diretos para evitar conflitos de versão
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, updateProfile } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";

createApp({
    setup() {
        // --- ESTADO DA UI ---
        const currentView = ref('dashboard');
        const showMobileMenu = ref(false);
        const showModal = ref(false);
        const modalMode = ref('create');
        const loadingAction = ref(false);
        
        // --- DADOS ---
        const users = ref([]);
        const systemLogs = ref([]);
        const searchTerm = ref('');
        const currentUser = ref(null);
        const pricing = 49.90;

        // --- FORMULÁRIO ---
        const userForm = reactive({ id: null, name: '', email: '', password: '', status: 'trial', phone: '', planExpiresAt: '' });

        // --- GRÁFICOS ---
        let growthChartInstance = null;
        let statusChartInstance = null;

        // --- INICIALIZAÇÃO ---
        onMounted(() => {
            onAuthStateChanged(auth, async (u) => {
                if (u) {
                    currentUser.value = u;
                    loadUsers();
                    loadLogs();
                } else {
                    window.location.href = "index.html";
                }
            });
        });

        // Atualiza gráficos ao trocar de aba
        watch(currentView, (newVal) => {
            if (newVal === 'dashboard') setTimeout(renderCharts, 300);
        });

        // --- CARREGAMENTO DE DADOS ---
        const loadUsers = () => {
            onSnapshot(collection(db, "users"), (snap) => {
                users.value = snap.docs.map(d => {
                    const data = d.data();
                    return {
                        id: d.id, ...data,
                        displayName: data.companyConfig?.fantasia || data.email?.split('@')[0] || 'Sem Nome',
                        phone: data.companyConfig?.phone || '',
                        status: data.status || 'trial',
                        createdAt: data.createdAt || new Date().toISOString(),
                        lastLogin: data.lastLogin || null,
                        adminNotes: data.adminNotes || '',
                        planExpiresAt: data.planExpiresAt || null,
                        stripeId: data.stripeCustomerId || null
                    };
                });
                if(currentView.value === 'dashboard') renderCharts();
            });
        };

        const loadLogs = () => {
            // Verifica se as funções do Firestore carregaram corretamente
            if (typeof orderBy !== 'function' || typeof limit !== 'function') {
                console.warn("Funções do Firestore pendentes. Verifique js/firebase.js");
                return;
            }
            try {
                const q = query(collection(db, "system_logs"), orderBy("timestamp", "desc"), limit(50));
                onSnapshot(q, (snap) => {
                    systemLogs.value = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                });
            } catch (e) { console.error("Erro ao carregar logs", e); }
        };

        // --- AÇÕES DO SISTEMA (LOGS, STRIPE, ETC) ---
        const logAction = async (action, details) => {
            try {
                await addDoc(collection(db, "system_logs"), {
                    timestamp: new Date().toISOString(),
                    adminEmail: currentUser.value.email,
                    action: action,
                    details: details
                });
            } catch (e) { console.error("Erro ao salvar log", e); }
        };

        const createStripeSession = async (user) => {
            const { isConfirmed } = await Swal.fire({
                title: 'Gerar Cobrança Real',
                text: `Criar Checkout Stripe para ${user.displayName}?`,
                icon: 'question',
                showCancelButton: true,
                confirmButtonText: 'Sim, Gerar Link',
                confirmButtonColor: '#635BFF'
            });

            if (isConfirmed) {
                Swal.fire({ title: 'Contatando Stripe...', didOpen: () => Swal.showLoading() });
                
                try {
                    // 1. Chama a Cloud Function (Backend)
                    const createCheckoutParams = httpsCallable(functions, 'createStripeCheckout');
                    
                    // Envia o ID do usuário e qual plano (price_id) você quer vender
                    const result = await createCheckoutParams({ 
                        userId: user.id,
                        email: user.email,
                        priceId: 'price_SEU_ID_AQUI' // *IMPORTANTE: Substitua pelo ID do preço do seu painel Stripe (ex: price_1Op...)
                    });

                    const { url } = result.data;

                    // 2. Loga a ação
                    await logAction('PAYMENT_LINK', `Gerou checkout real para ${user.email}`);

                    // 3. Mostra o link ou abre automaticamente
                    Swal.fire({
                        title: 'Sucesso!',
                        html: `Link gerado com segurança:<br><br>
                               <input value="${url}" readonly style="width:100%; padding:10px; border:1px solid #ddd; border-radius:5px;">
                               <br><br>
                               <a href="${url}" target="_blank" class="swal2-confirm swal2-styled" style="display:inline-block; text-decoration:none;">Abrir Link Agora</a>`,
                        icon: 'success',
                        showConfirmButton: false,
                        showCloseButton: true
                    });

                } catch (error) {
                    console.error("Erro Stripe:", error);
                    Swal.fire('Erro no Pagamento', error.message, 'error');
                }
            }
        };

        const renderCharts = () => {
            if (typeof Chart === 'undefined') return;

            const ctxGrowth = document.getElementById('growthChart');
            const ctxStatus = document.getElementById('statusChart');

            if (!ctxGrowth || !ctxStatus) return;

            // Dados Crescimento
            const months = {};
            users.value.forEach(u => {
                const k = (u.createdAt || '').substring(0, 7);
                if(k) months[k] = (months[k] || 0) + 1;
            });
            const labels = Object.keys(months).sort();
            const dataGrowth = labels.map(k => months[k]);

            if (growthChartInstance) growthChartInstance.destroy();
            growthChartInstance = new Chart(ctxGrowth, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{ label: 'Novos Usuários', data: dataGrowth, borderColor: '#6366F1', backgroundColor: 'rgba(99, 102, 241, 0.1)', fill: true, tension: 0.4 }]
                },
                options: { responsive: true, maintainAspectRatio: false }
            });

            // Dados Status
            const statusCount = { active: 0, trial: 0 };
            users.value.forEach(u => { statusCount[u.status] = (statusCount[u.status] || 0) + 1; });
            
            if (statusChartInstance) statusChartInstance.destroy();
            statusChartInstance = new Chart(ctxStatus, {
                type: 'doughnut',
                data: {
                    labels: ['Ativos', 'Trial'],
                    datasets: [{ data: [statusCount.active, statusCount.trial], backgroundColor: ['#22C55E', '#EAB308'] }]
                },
                options: { responsive: true, maintainAspectRatio: false }
            });
        };

        // --- CRUD USUÁRIOS ---
        const handleUserSubmit = async () => {
            if (!userForm.name || !userForm.email) return Swal.fire('Erro', 'Preencha nome e email', 'warning');
            loadingAction.value = true;
            try {
                if (modalMode.value === 'create') {
                    // Criar usuário no Auth secundário (Ghost)
                    const secondaryApp = initializeApp(firebaseConfig, "SecondaryApp");
                    const secondaryAuth = getAuth(secondaryApp);
                    const cred = await createUserWithEmailAndPassword(secondaryAuth, userForm.email, userForm.password);
                    await updateProfile(cred.user, { displayName: userForm.name });
                    
                    // Salvar no Firestore
                    await setDoc(doc(db, "users", cred.user.uid), {
                        email: userForm.email, role: 'user', status: userForm.status, createdAt: new Date().toISOString(),
                        companyConfig: { fantasia: userForm.name, email: userForm.email, phone: userForm.phone }
                    });
                    
                    await secondaryAuth.signOut();
                    await logAction('CREATE_USER', `Criou: ${userForm.email}`);
                } else {
                    // Editar usuário existente
                    const updateData = {
                        status: userForm.status,
                        planExpiresAt: userForm.planExpiresAt || null,
                        "companyConfig.fantasia": userForm.name,
                        "companyConfig.phone": userForm.phone
                    };
                    await updateDoc(doc(db, "users", userForm.id), updateData);
                    await logAction('EDIT_USER', `Editou: ${userForm.email}`);
                }
                showModal.value = false;
                Swal.fire('Sucesso', 'Salvo com sucesso!', 'success');
            } catch (e) { 
                Swal.fire('Erro', e.message, 'error'); 
            } finally { 
                loadingAction.value = false; 
            }
        };

        const toggleStatus = async (user) => {
            const ns = user.status === 'active' ? 'trial' : 'active';
            await updateDoc(doc(db, "users", user.id), { status: ns });
            await logAction('CHANGE_STATUS', `${user.email} -> ${ns}`);
        };

        const deleteUser = async (user) => {
            if ((await Swal.fire({title:'Excluir usuário?',icon:'warning',showCancelButton:true})).isConfirmed){
                await deleteDoc(doc(db, "users", user.id));
                await logAction('DELETE_USER', `Excluiu: ${user.email}`);
            }
        };

        const addQuickNote = async (user, type) => {
             const date = new Date().toLocaleDateString('pt-BR');
             const msg = type === 'zap' ? 'Contato via WhatsApp' : 'Enviado Cobrança';
             await updateDoc(doc(db, "users", user.id), { adminNotes: `[${date}] ${msg}\n` + (user.adminNotes||'') });
             await logAction('CRM_UPDATE', `Nota para ${user.email}: ${msg}`);
             const Toast = Swal.mixin({toast: true, position: 'top-end', showConfirmButton: false, timer: 2000});
             Toast.fire({icon: 'success', title: 'Nota salva'});
        };

        // --- HELPERS E MODALS ---
        const openCreateModal = () => { modalMode.value='create'; Object.assign(userForm,{name:'',email:'',password:'',phone:'', status:'trial'}); showModal.value=true; };
        const openEditModal = (u) => { modalMode.value='edit'; Object.assign(userForm,{id:u.id, name:u.displayName, email:u.email, phone:u.phone, status:u.status, planExpiresAt:u.planExpiresAt}); showModal.value=true; };
        const logout = async () => { await signOut(auth); window.location.href="index.html"; };

        // --- COMPUTEDS (LÓGICA DO DASHBOARD/FILTROS) ---
        const filteredUsers = computed(() => {
            let l = users.value || [];
            if(searchTerm.value) l = l.filter(u => u.displayName.toLowerCase().includes(searchTerm.value.toLowerCase()));
            return l.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
        });

        const getTrialDaysLeft = (u) => { 
            if(!u.createdAt) return 0;
            const end=new Date(u.createdAt); end.setDate(end.getDate()+7); 
            return Math.ceil((end-new Date())/(86400000)); 
        };

        // *** AQUI ESTAVA O ERRO ANTERIOR *** // Renomeado para 'latest', 'warning', 'pro' para segurança
        const crmColumns = computed(() => {
            const list = users.value || [];
            return {
                latest: list.filter(u => u.status === 'trial' && getTrialDaysLeft(u) > 3),
                warning: list.filter(u => u.status === 'trial' && getTrialDaysLeft(u) <= 3),
                pro: list.filter(u => u.status === 'active')
            };
        });

        const mrr = computed(() => (users.value || []).filter(u => u.status==='active').length * pricing);
        const newUsersToday = computed(() => (users.value || []).filter(u => u.createdAt?.startsWith(new Date().toISOString().split('T')[0])).length);
        const inactiveUsers = computed(() => { const d=new Date(); d.setDate(d.getDate()-3); return (users.value || []).filter(u => u.lastLogin && new Date(u.lastLogin)<d).length; });
        const conversionRate = computed(() => { const total = users.value.length; if(!total) return 0; const active = users.value.filter(u=>u.status==='active').length; return ((active/total)*100).toFixed(1); });
        
        const formatCurrency = (v) => v.toLocaleString('pt-BR',{minimumFractionDigits:2});
        const timeSince = (d) => { if(!d) return '-'; const s=Math.floor((new Date()-new Date(d))/1000); if(s<3600) return 'Agora'; if(s<86400) return Math.floor(s/3600)+'h atrás'; return Math.floor(s/86400)+'d atrás'; };
        const getWhatsappLink = (p) => p?`https://wa.me/55${p.replace(/\D/g,'')}`:'#';
        const getActionColor = (a) => { if(a.includes('DELETE')) return 'bg-red-100 text-red-700'; if(a.includes('CREATE')) return 'bg-green-100 text-green-700'; return 'bg-slate-100 text-slate-700'; };

        // ── KANBAN DRAG & DROP ────────────────────────────────────
        const draggingUser = ref(null);
        const draggingFromCol = ref(null);
        const onKanbanDragStart = (e, user, fromCol) => {
            draggingUser.value = user;
            draggingFromCol.value = fromCol;
            e.dataTransfer.effectAllowed = 'move';
        };
        const onKanbanDrop = async (e, toCol) => {
            e.preventDefault();
            if (!draggingUser.value || draggingFromCol.value === toCol) return;
            const u = draggingUser.value;
            // Remove from current column
            const colMap = { latest:'latest', engaged:'engaged', warning:'warning', pro:'pro', churned:'churned' };
            // Update status in Firebase
            try {
                const { db, doc, updateDoc } = await import('./firebase.js');
                const newStatus = toCol === 'pro' ? 'active' : toCol === 'churned' ? 'inactive' : u.status;
                await updateDoc(doc(db, 'users', u.id), { crmStage: toCol, status: newStatus });
                Swal.fire({ toast:true, position:'bottom-end', icon:'success', title:`${u.displayName} movido para ${toCol}`, timer:2000, showConfirmButton:false });
            } catch(err) {
                console.error('Kanban move error:', err);
            }
            draggingUser.value = null;
            draggingFromCol.value = null;
        };

        // ── CHURN ANALYSIS ────────────────────────────────────────
        const churnReasons = computed(() => {
            const churned = crmColumns.value?.churned || [];
            const reasons = {};
            churned.forEach(u => {
                if (u.churnReason) {
                    reasons[u.churnReason] = (reasons[u.churnReason] || 0) + 1;
                }
            });
            const total = Object.values(reasons).reduce((a,b)=>a+b, 0) || 1;
            return Object.entries(reasons)
                .map(([reason, count]) => ({ reason, count, pct: Math.round(count/total*100) }))
                .sort((a,b) => b.count - a.count);
        });
        const churnRate = computed(() => {
            const total = users.value.length || 1;
            const churned = (crmColumns.value?.churned || []).length;
            return Math.round(churned / total * 100);
        });
        const avgLtv = computed(() => {
            const pro = crmColumns.value?.pro || [];
            if (!pro.length) return 0;
            return (mrr.value * 6) / pro.length; // estimativa 6 meses
        });
        const atRiskUsers = computed(() => {
            return users.value.filter(u => {
                if (u.status !== 'active') return false;
                const last = u.lastLogin || u.createdAt;
                if (!last) return false;
                const days = (Date.now() - new Date(last).getTime()) / 86400000;
                return days > 3;
            });
        });
        const recordChurnReason = async (u) => {
            const { value: reason } = await Swal.fire({
                title: `Motivo de cancelamento`,
                html: `<p style="color:#6b7280;font-size:13px;margin-bottom:12px">Por que ${u.displayName} cancelou?</p>`,
                input: 'select',
                inputOptions: {
                    'Preço alto': 'Preço alto', 'Não usou o produto': 'Não usou o produto',
                    'Achou alternativa': 'Achou alternativa', 'Problema técnico': 'Problema técnico',
                    'Falta de funcionalidade': 'Falta de funcionalidade', 'Outros': 'Outros',
                },
                showCancelButton: true, confirmButtonColor: '#ff5c35',
            });
            if (!reason) return;
            try {
                const { db, doc, updateDoc } = await import('./firebase.js');
                await updateDoc(doc(db, 'users', u.id), { churnReason: reason });
                Swal.fire({ toast:true, position:'bottom-end', icon:'success', title:'Motivo registrado!', timer:2000, showConfirmButton:false });
            } catch(err) { console.error(err); }
        };
        const recordNewChurnReason = async () => {
            const { value: formValues } = await Swal.fire({
                title: 'Registrar Cancelamento', showCancelButton: true, confirmButtonColor:'#ff5c35',
                html: `<input id="swal-name" placeholder="Nome do usuário" class="swal2-input"><select id="swal-reason" class="swal2-input"><option value="">Motivo...</option><option>Preço alto</option><option>Não usou</option><option>Achou alternativa</option><option>Problema técnico</option><option>Falta de funcionalidade</option><option>Outros</option></select>`,
                preConfirm: () => ({ name: document.getElementById('swal-name').value, reason: document.getElementById('swal-reason').value }),
            });
            if (!formValues?.reason) return;
            Swal.fire({ toast:true, position:'bottom-end', icon:'success', title:'Registrado!', timer:2000, showConfirmButton:false });
        };

        return {
            currentView, showMobileMenu, showModal, modalMode, userForm, loadingAction,
            users, filteredUsers, systemLogs, currentUser, searchTerm,
            openCreateModal, openEditModal, handleUserSubmit, deleteUser, toggleStatus, logout,
            createStripeSession, addQuickNote,
            mrr, newUsersToday, inactiveUsers, conversionRate, crmColumns,
            formatCurrency, timeSince, getTrialDaysLeft, getWhatsappLink, getActionColor,
            // Kanban
            onKanbanDragStart, onKanbanDrop,
            // Churn
            churnReasons, churnRate, avgLtv, atRiskUsers, recordChurnReason, recordNewChurnReason,
        };
    }
}).mount('#adminApp');
