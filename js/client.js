const { createApp, ref, reactive, onMounted, computed } = Vue;

import { 
    db, auth, collection, getDocs, query, where, doc, updateDoc, getDoc, signInAnonymously, signOut 
} from './firebase.js';

createApp({
    setup() {
        // Estado
        const loadingState = ref('global'); // 'global', 'login', 'portal'
        const authLoading = ref(false);
        const accessInput = ref('');
        const showSignModal = ref(false);
        const currentApp = ref(null);
        
        // Dados
        const company = reactive({ fantasia: '', logo: '', signature: '', email: '', phone: '', rua: '', bairro: '', cidade: '', estado: '', cnpj: '' });
        const clientData = ref(null);
        const appointments = ref([]);
        
        // URL Params
        const urlParams = new URLSearchParams(window.location.search);
        const providerUid = urlParams.get('uid');

        // --- INICIALIZAÇÃO ---
        onMounted(async () => {
            // 1. Carrega dados da empresa se tiver UID na URL
            if (providerUid) {
                try {
                    const docSnap = await getDoc(doc(db, "users", providerUid));
                    if (docSnap.exists() && docSnap.data().companyConfig) {
                        Object.assign(company, docSnap.data().companyConfig);
                    }
                } catch (e) { console.error("Erro ao carregar empresa:", e); }
            }
            
            // 2. Verifica se já existe um cliente "logado" na memória (opcional, por segurança pedimos login sempre)
            // Mas liberamos a tela de login
            setTimeout(() => { loadingState.value = 'login'; }, 800);
        });

        // --- MÁSCARA INPUT ---
        const handleInputMask = (e) => {
            let val = e.target.value;
            if (/^\d/.test(val)) { 
                val = val.replace(/\D/g, "").slice(0, 11);
                val = val.replace(/(\d{3})(\d)/, "$1.$2");
                val = val.replace(/(\d{3})(\d)/, "$1.$2");
                val = val.replace(/(\d{3})(\d{1,2})$/, "$1-$2");
            }
            accessInput.value = val;
        };

        // --- LOGIN E BUSCA ---
        const handleAccess = async () => {
            if (!accessInput.value) return Swal.fire('Erro', 'Preencha o campo.', 'warning');
            
            authLoading.value = true;
            try {
                // Login Anônimo Obrigatório
                if (!auth.currentUser) await signInAnonymously(auth);

                const term = accessInput.value.trim();
                const numericTerm = term.replace(/\D/g, '');
                
                // Filtros de busca
                let constraints = [];
                if (providerUid) constraints.push(where("userId", "==", providerUid));

                // Tenta achar cliente
                let q = query(collection(db, "clients"), where("cpf", "==", term), ...constraints);
                let snap = await getDocs(q);
                
                // Tenta CPF formatado
                if (snap.empty && numericTerm.length === 11) {
                    const formatted = numericTerm.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
                    q = query(collection(db, "clients"), where("cpf", "==", formatted), ...constraints);
                    snap = await getDocs(q);
                }
                
                // Tenta Email
                if (snap.empty) {
                    q = query(collection(db, "clients"), where("email", "==", term), ...constraints);
                    snap = await getDocs(q);
                }

                if (snap.empty) throw new Error("Cliente não encontrado.");

                const docData = snap.docs[0];
                clientData.value = { id: docData.id, ...docData.data() };

                // Busca Eventos
                let appQ = query(collection(db, "appointments"), where("clientId", "==", docData.id));
                if (providerUid) appQ = query(collection(db, "appointments"), where("clientId", "==", docData.id), where("userId", "==", providerUid));
                
                const appSnap = await getDocs(appQ);
                appointments.value = appSnap.docs.map(sanitizeApp)
                    .filter(a => a.status !== 'cancelled')
                    .sort((a,b) => b.date.localeCompare(a.date));

                // Se não carregou empresa via URL mas achou evento, carrega agora
                if (appointments.value.length > 0 && !providerUid) {
                    const uDoc = await getDoc(doc(db, "users", appointments.value[0].userId));
                    if (uDoc.exists() && uDoc.data().companyConfig) Object.assign(company, uDoc.data().companyConfig);
                }

                loadingState.value = 'portal';

            } catch (e) {
                console.error(e);
                Swal.fire('Acesso Negado', 'Dados não encontrados neste organizador.', 'error');
            } finally {
                authLoading.value = false;
            }
        };

        // --- ASSINATURA ---
        let canvasContext = null;
        let isDrawing = false;

        const openSignature = (app) => {
            currentApp.value = app;
            showSignModal.value = true;
            setTimeout(initCanvas, 100);
        };

        const initCanvas = () => {
            const canvas = document.getElementById('signature-pad');
            if(!canvas) return;
            const ratio = Math.max(window.devicePixelRatio || 1, 1);
            canvas.width = canvas.offsetWidth * ratio;
            canvas.height = canvas.offsetHeight * ratio;
            canvas.getContext("2d").scale(ratio, ratio);
            canvasContext = canvas.getContext('2d');
            canvasContext.strokeStyle = "#000";
            canvasContext.lineWidth = 2;
            
            // Eventos Mouse/Touch
            const start = (e) => { isDrawing = true; canvasContext.beginPath(); canvasContext.moveTo(getPos(e).x, getPos(e).y); };
            const move = (e) => { if(!isDrawing) return; e.preventDefault(); canvasContext.lineTo(getPos(e).x, getPos(e).y); canvasContext.stroke(); };
            const end = () => { isDrawing = false; };

            canvas.onmousedown = start; canvas.onmousemove = move; canvas.onmouseup = end; canvas.onmouseout = end;
            canvas.ontouchstart = (e) => start(e.touches[0]);
            canvas.ontouchmove = (e) => move(e.touches[0]);
            canvas.ontouchend = end;
        };

        const getPos = (e) => {
            const rect = document.getElementById('signature-pad').getBoundingClientRect();
            return { x: e.clientX - rect.left, y: e.clientY - rect.top };
        };

        const clearCanvas = () => {
            const c = document.getElementById('signature-pad');
            canvasContext.clearRect(0, 0, c.width, c.height);
        };

        const isCanvasBlank = () => {
            const c = document.getElementById('signature-pad');
            const pixelBuffer = new Uint32Array(canvasContext.getImageData(0,0,c.width,c.height).data.buffer);
            return !pixelBuffer.some(color => color !== 0);
        };

        const saveSignature = async () => {
            if (isCanvasBlank()) return Swal.fire('Ops', 'Faça sua assinatura.', 'warning');
            
            authLoading.value = true;
            try {
                const dataUrl = document.getElementById('signature-pad').toDataURL();
                
                await updateDoc(doc(db, "appointments", currentApp.value.id), {
                    clientSignature: dataUrl,
                    status: 'pending' // Confirma orçamento
                });

                // Atualiza local
                const idx = appointments.value.findIndex(a => a.id === currentApp.value.id);
                if (idx !== -1) {
                    appointments.value[idx].clientSignature = dataUrl;
                    appointments.value[idx].status = 'pending';
                }

                showSignModal.value = false;
                await Swal.fire({ title: 'Assinado!', text: 'Contrato confirmado. Baixando PDF...', icon: 'success', timer: 1500, showConfirmButton:false });
                
                // Gera PDF atualizado
                currentApp.value.clientSignature = dataUrl; // Garante que o PDF tenha a assinatura
                downloadContract(currentApp.value);

            } catch (e) {
                console.error(e);
                Swal.fire('Erro', 'Falha ao salvar assinatura.', 'error');
            } finally {
                authLoading.value = false;
            }
        };

        // --- PDF E UTILS ---
        const sanitizeApp = (d) => { 
            const data = d.data ? d.data() : d; 
            return { 
                id: d.id || data.id, ...data, 
                selectedServices: data.selectedServices || [], 
                details: { ...(data.details||{}), balloonColors: data.details?.balloonColors||'' } 
            }; 
        };
        const toNum = (v) => parseFloat(String(v).replace(',','.').replace(/[^0-9.-]/g,''))||0;
        const formatCurrency = (v) => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(toNum(v));
        const formatDate = (d) => d ? d.split('-').reverse().join('/') : '';
        const getDay = (d) => d ? d.split('-')[2] : '';
        const getMonth = (d) => d ? ['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'][parseInt(d.split('-')[1])-1] : '';
        const statusText = (s) => s==='budget'?'Orçamento':(s==='concluded'?'Concluído':(s==='cancelled'?'Cancelado':'Pendente'));

        const downloadContract = (app) => {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();
            
            // Lógica simplificada de PDF (semelhante ao app.js)
            doc.setFont("helvetica", "bold"); doc.setFontSize(14);
            doc.text(company.fantasia.toUpperCase(), 105, 20, {align: "center"});
            doc.setFontSize(10); doc.setFont("helvetica", "normal");
            
            let y = 30;
            if(company.cnpj) { doc.text(`CNPJ: ${company.cnpj}`, 105, y, {align:"center"}); y+=5; }
            doc.text(`${company.rua||''} ${company.bairro||''}`, 105, y, {align:"center"}); y+=10;
            
            doc.line(20, y, 190, y); y+=10;
            doc.setFont("helvetica", "bold"); doc.setFontSize(12);
            doc.text(app.status==='budget'?"ORÇAMENTO":"CONTRATO DE SERVIÇO", 105, y, {align:"center"}); y+=15;
            
            doc.setFontSize(10);
            doc.text("CLIENTE: " + (clientData.value.name), 20, y); y+=5;
            doc.setFont("helvetica", "normal");
            doc.text("CPF: " + (clientData.value.cpf||'-'), 20, y); y+=10;
            
            doc.setFont("helvetica", "bold");
            doc.text("EVENTO:", 20, y); y+=5;
            doc.setFont("helvetica", "normal");
            doc.text(`Data: ${formatDate(app.date)} às ${app.time}`, 20, y); y+=5;
            doc.text(`Local: ${app.location.bairro}`, 20, y); y+=10;
            
            // Tabela simples
            const body = app.selectedServices.map(s => [s.description, formatCurrency(s.price)]);
            doc.autoTable({ startY: y, head: [['Item', 'Valor']], body: body });
            y = doc.lastAutoTable.finalY + 10;
            
            doc.setFont("helvetica", "bold");
            doc.text(`TOTAL: ${formatCurrency(app.totalServices)}`, 140, y, {align:"right"}); y+=5;
            doc.text(`SINAL: ${formatCurrency(app.entryFee || app.details.entryFee)}`, 140, y, {align:"right"}); y+=5;
            doc.text(`RESTANTE: ${formatCurrency(app.finalBalance)}`, 140, y, {align:"right"}); y+=20;
            
            // Assinaturas
            if (app.clientSignature) doc.addImage(app.clientSignature, 'PNG', 120, y, 50, 20);
            if (company.signature) doc.addImage(company.signature, 'PNG', 30, y, 50, 20);
            
            y+=20;
            doc.line(20, y, 90, y); doc.line(110, y, 180, y);
            doc.text("CONTRATADA", 55, y+5, {align:"center"}); doc.text("CONTRATANTE", 145, y+5, {align:"center"});
            
            doc.save("Contrato_PartyPlanner.pdf");
        };

        const openSupport = (app) => {
            const msg = `Olá, gostaria de falar sobre o evento do dia ${formatDate(app.date)}.`;
            const phone = company.phone ? company.phone.replace(/\D/g, '') : '';
            if(phone) window.open(`https://wa.me/55${phone}?text=${encodeURIComponent(msg)}`, '_blank');
            else Swal.fire('Ops', 'Telefone da empresa não configurado.', 'info');
        };

        const logout = () => {
            signOut(auth);
            loadingState.value = 'login';
            accessInput.value = '';
            appointments.value = [];
        };

        return {
            loadingState, authLoading, accessInput, company, clientData, appointments,
            showSignModal, handleInputMask, handleAccess, logout,
            getDay, getMonth, statusText, formatCurrency, openSignature, openSupport,
            clearCanvas, saveSignature, downloadContract
        };
    }
}).mount('#client-app');
