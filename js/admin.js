const { createApp, ref, computed, reactive, onMounted } = Vue;

import { 
    db, auth, firebaseConfig, 
    collection, onSnapshot, doc, updateDoc, deleteDoc, getDoc, setDoc, signOut, onAuthStateChanged, addDoc 
} from './firebase.js';

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, updateProfile } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

createApp({
    setup() {
        // Estado
        const users = ref([]);
        const searchTerm = ref('');
        const filterStatus = ref('all');
        const currentUser = ref(null);
        const pricing = 49.90;
        
        // Controle de UI
        const showModal = ref(false); // Modal único para Criar/Editar
        const modalMode = ref('create'); // 'create' ou 'edit'
        const showMobileMenu = ref(false); // Menu lateral no mobile
        const loadingAction = ref(false);

        // Formulário User
        const userForm = reactive({ 
            id: null, name: '', email: '', password: '', 
            status: 'trial', phone: '', planExpiresAt: '' 
        });

        // ============================================================
        // 1. INICIALIZAÇÃO
        // ============================================================
        onMounted(() => {
            onAuthStateChanged(auth, async (u) => {
                if (u) {
                    const docSnap = await getDoc(doc(db, "users", u.uid));
                    // Verificação de segurança simples
                    if (docSnap.exists() && (docSnap.data().role === 'admin' || u.email === 'jeanthielis@gmail.com')) {
                        currentUser.value = u;
                        loadUsers();
                    } else {
                        // Se não for admin, carrega igual (para teste) ou redireciona
                        loadUsers(); 
                    }
                } else {
                    window.location.href = "index.html";
                }
            });
        });

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
                        planExpiresAt: data.planExpiresAt || null // Nova data de validade
                    };
                });
            });
        };

        // ============================================================
        // 2. AÇÕES DE USUÁRIO (CRIAR / EDITAR)
        // ============================================================
        const openCreateModal = () => {
            modalMode.value = 'create';
            Object.assign(userForm, { id: null, name: '', email: '', password: '', status: 'trial', phone: '', planExpiresAt: '' });
            showModal.value = true;
            showMobileMenu.value = false;
        };

        const openEditModal = (user) => {
            modalMode.value = 'edit';
            Object.assign(userForm, { 
                id: user.id, 
                name: user.displayName, 
                email: user.email, 
                password: '', // Não editamos senha aqui
                status: user.status, 
                phone: user.phone,
                planExpiresAt: user.planExpiresAt || '' 
            });
            showModal.value = true;
        };

        const handleUserSubmit = async () => {
            if (!userForm.name || !userForm.email) return Swal.fire('Erro', 'Nome e Email obrigatórios', 'warning');
            
            loadingAction.value = true;
            try {
                if (modalMode.value === 'create') {
                    // MODO CRIAÇÃO (Ghost App)
                    if (!userForm.password) throw new Error("Senha obrigatória para criar.");
                    
                    const secondaryApp = initializeApp(firebaseConfig, "SecondaryApp");
                    const secondaryAuth = getAuth(secondaryApp);
                    const cred = await createUserWithEmailAndPassword(secondaryAuth, userForm.email, userForm.password);
                    await updateProfile(cred.user, { displayName: userForm.name });
                    
                    await setDoc(doc(db, "users", cred.user.uid), {
                        email: userForm.email, role: 'user', status: userForm.status, 
                        createdAt: new Date().toISOString(),
                        planExpiresAt: userForm.planExpiresAt || null,
                        companyConfig: { fantasia: userForm.name, email: userForm.email, phone: userForm.phone }
                    });
                    
                    await secondaryAuth.signOut();
                    Swal.fire('Criado', `Usuário ${userForm.name} criado!`, 'success');

                } else {
                    // MODO EDIÇÃO (Apenas Firestore)
                    const updateData = {
                        status: userForm.status,
                        planExpiresAt: userForm.planExpiresAt || null,
                        "companyConfig.fantasia": userForm.name,
                        "companyConfig.phone": userForm.phone,
                        "companyConfig.email": userForm.email // Atualiza email de contato, não o de login
                    };
                    
                    await updateDoc(doc(db, "users", userForm.id), updateData);
                    Swal.fire('Atualizado', 'Dados salvos com sucesso.', 'success');
                }
                showModal.value = false;
            } catch (error) {
                console.error(error);
                Swal.fire('Erro', error.message, 'error');
            } finally {
                loadingAction.value = false;
            }
        };

        // ============================================================
        // 3. FERRAMENTAS EXTRAS
        // ============================================================
        const toggleStatus = async (user) => {
            const newStatus = user.status === 'active' ? 'trial' : 'active';
            // Se ativou, dá 30 dias. Se trial, remove data ou dá 7 dias.
            let expiry = null;
            if (newStatus === 'active') {
                const d = new Date(); d.setDate(d.getDate() + 30);
                expiry = d.toISOString().split('T')[0];
            }
            await updateDoc(doc(db, "users", user.id), { status: newStatus, planExpiresAt: expiry });
        };

        const sendGlobalNotification = async () => {
            const { value: text } = await Swal.fire({
                title: 'Enviar Aviso Global',
                input: 'textarea',
                inputLabel: 'Mensagem (aparecerá para todos os usuários)',
                inputPlaceholder: 'Ex: Manutenção hoje às 22h...',
                showCancelButton: true
            });

            if (text) {
                // Cria uma coleção de avisos (você precisaria implementar a leitura disso no app.js)
                await addDoc(collection(db, "system_messages"), {
                    text, createdAt: new Date().toISOString(), type: 'info', active: true
                });
                Swal.fire('Enviado', 'Mensagem disparada para o sistema.', 'success');
            }
        };

        const exportCSV = () => {
            const headers = "Nome,Email,Telefone,Status,Data Cadastro,Ultimo Login\n";
            const rows = users.value.map(u => 
                `"${u.displayName}","${u.email}","${u.phone}","${u.status}","${formatDate(u.createdAt)}","${formatDate(u.lastLogin)}"`
            ).join("\n");
            
            const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.download = "clientes_partyplanner.csv";
            link.click();
        };

        // CRM e Notas
        const saveNote = async (user) => { await updateDoc(doc(db, "users", user.id), { adminNotes: user.adminNotes }); };
        const addQuickNote = (user, type) => {
            const date = new Date().toLocaleDateString('pt-BR');
            let text = type === 'zap' ? 'Entrei em contato via WhatsApp.' : 'Enviei cobrança/aviso.';
            user.adminNotes = `[${date}] ${text}\n` + (user.adminNotes || '');
            saveNote(user);
        };
        const deleteUser = async (user) => {
            if ((await Swal.fire({ title: 'Excluir?', icon: 'warning', showCancelButton: true })).isConfirmed) {
                await deleteDoc(doc(db, "users", user.id));
            }
        };
        const logout = async () => { await signOut(auth); window.location.href = "index.html"; };

        // ============================================================
        // 4. COMPUTEDS E HELPERS
        // ============================================================
        const filteredUsers = computed(() => {
            let list = users.value;
            if (filterStatus.value === 'active') list = list.filter(u => u.status === 'active');
            else if (filterStatus.value === 'trial') list = list.filter(u => u.status === 'trial');
            else if (filterStatus.value === 'inactive') {
                 const limit = new Date(); limit.setDate(limit.getDate() - 3);
                 list = list.filter(u => u.lastLogin && new Date(u.lastLogin) < limit);
            }
            if (searchTerm.value) {
                const lower = searchTerm.value.toLowerCase();
                list = list.filter(u => u.displayName.toLowerCase().includes(lower) || u.email.toLowerCase().includes(lower));
            }
            return list.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
        });

        // Métricas
        const newUsersToday = computed(() => users.value.filter(u => u.createdAt && u.createdAt.startsWith(new Date().toISOString().split('T')[0])).length);
        const activeCount = computed(() => users.value.filter(u => u.status === 'active').length);
        const mrr = computed(() => activeCount.value * pricing);
        const expiringTrials = computed(() => users.value.filter(u => u.status === 'trial' && getTrialDaysLeft(u) >= 0 && getTrialDaysLeft(u) <= 3).length);
        const inactiveUsers = computed(() => { const limit = new Date(); limit.setDate(limit.getDate() - 3); return users.value.filter(u => u.lastLogin && new Date(u.lastLogin) < limit).length; });

        // Formatadores
        const formatCurrency = (val) => val.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
        const formatDate = (d) => d ? new Date(d).toLocaleDateString('pt-BR') : '-';
        const timeSince = (d) => {
            if (!d) return 'Nunca';
            const s = Math.floor((new Date() - new Date(d)) / 1000);
            if (s < 60) return "Agora";
            if (s < 3600) return Math.floor(s/60) + "m atrás";
            if (s < 86400) return Math.floor(s/3600) + "h atrás";
            return Math.floor(s/86400) + "d atrás";
        };
        const getWhatsappLink = (p) => p ? `https://wa.me/55${p.replace(/\D/g, '')}` : '#';
        const getTrialDaysLeft = (u) => {
            const end = new Date(u.createdAt); end.setDate(end.getDate() + 7);
            return Math.ceil((end - new Date()) / (1000 * 60 * 60 * 24));
        };
        const getTrialPercentage = (u) => Math.min(100, Math.max(0, ((7 - getTrialDaysLeft(u)) / 7) * 100));

        return {
            users, searchTerm, filterStatus, filteredUsers, currentUser, logout,
            newUsersToday, activeCount, mrr, expiringTrials, inactiveUsers,
            showModal, modalMode, userForm, openCreateModal, openEditModal, handleUserSubmit, loadingAction, // Modal actions
            toggleStatus, saveNote, addQuickNote, deleteUser, sendGlobalNotification, exportCSV, // Novas ações
            showMobileMenu, // Mobile
            formatCurrency, formatDate, timeSince, getWhatsappLink, getTrialDaysLeft, getTrialPercentage
        };
    }
}).mount('#adminApp');
