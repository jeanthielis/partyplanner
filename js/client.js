const { createApp, ref, reactive, onMounted, computed } = Vue;

import { 
    db, auth, collection, getDocs, query, where, doc, updateDoc, getDoc, signInAnonymously, signOut 
} from './firebase.js';

createApp({
    setup() {
        // --- ESTADO ---
        const loadingState = ref('global'); // 'global', 'login', 'portal'
        const authLoading = ref(false);
        const accessInput = ref('');
        const showSignModal = ref(false);
        const showContractModal = ref(false);
        const contractApp = ref(null);
        const currentApp = ref(null);
        
        // --- DADOS ---
        const company = reactive({ 
            fantasia: '', logo: '', signature: '', 
            email: '', phone: '', rua: '', bairro: '', cidade: '', estado: '', cnpj: '' 
        });
        const clientData = ref(null);
        const appointments = ref([]);
        
        // URL Params
        const urlParams = new URLSearchParams(window.location.search);
        const providerUid = urlParams.get('uid');
        const previewCid = urlParams.get('cid');
        const isPreview = ref(urlParams.get('preview') === '1' && !!previewCid);

        // ============================================================
        // 1. INICIALIZAÇÃO
        // ============================================================
        const loadPreview = async () => {
            try {
                if (!auth.currentUser) await signInAnonymously(auth);
                const cDoc = await getDoc(doc(db, "clients", previewCid));
                if (!cDoc.exists() || cDoc.data().userId !== providerUid) throw new Error("Cliente inválido");
                clientData.value = { id: cDoc.id, ...cDoc.data() };

                const appQ = query(collection(db, "appointments"), where("clientId", "==", cDoc.id), where("userId", "==", providerUid));
                const appSnap = await getDocs(appQ);
                appointments.value = appSnap.docs.map(sanitizeApp)
                    .filter(a => a.status !== 'cancelled')
                    .sort((a,b) => b.date.localeCompare(a.date));
                loadClientPhotos(cDoc.id);
                loadingState.value = 'portal';
            } catch(e) {
                console.error('Preview:', e);
                isPreview.value = false;
                loadingState.value = 'login';
            }
        };

        onMounted(async () => {
            // Tenta carregar dados da empresa (Logo/Nome) para a tela de login
            if (providerUid) {
                try {
                    const docSnap = await getDoc(doc(db, "users", providerUid));
                    if (docSnap.exists() && docSnap.data().companyConfig) {
                        Object.assign(company, docSnap.data().companyConfig);
                    }
                } catch (e) { console.error("Erro ao carregar empresa:", e); }
            }
            
            // Modo preview (decorador): carrega o cliente direto, sem login
            if (isPreview.value) { await loadPreview(); return; }
            // Libera a tela de login
            setTimeout(() => { loadingState.value = 'login'; }, 800);
        });

        // ============================================================
        // 2. MÁSCARA E LOGIN
        // ============================================================
        const handleInputMask = (e) => {
            let val = e.target.value;
            // Se começar com número, aplica máscara de CPF
            if (/^\d/.test(val)) { 
                val = val.replace(/\D/g, "").slice(0, 11);
                val = val.replace(/(\d{3})(\d)/, "$1.$2");
                val = val.replace(/(\d{3})(\d)/, "$1.$2");
                val = val.replace(/(\d{3})(\d{1,2})$/, "$1-$2");
            }
            accessInput.value = val;
        };

        const handleAccess = async () => {
            if (!accessInput.value) return Swal.fire('Erro', 'Preencha o campo.', 'warning');
            
            authLoading.value = true;
            try {
                // 1. Login Anônimo OBRIGATÓRIO (para ter permissão de leitura/escrita)
                if (!auth.currentUser) await signInAnonymously(auth);

                const term = accessInput.value.trim();
                const numericTerm = term.replace(/\D/g, '');
                
                // Filtros de busca
                let constraints = [];
                if (providerUid) constraints.push(where("userId", "==", providerUid));

                // 2. Buscas (CPF com ponto, CPF sem ponto, Email)
                let q = query(collection(db, "clients"), where("cpf", "==", term), ...constraints);
                let snap = await getDocs(q);
                
                if (snap.empty && numericTerm.length === 11) {
                    const formatted = numericTerm.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
                    q = query(collection(db, "clients"), where("cpf", "==", formatted), ...constraints);
                    snap = await getDocs(q);
                }
                
                if (snap.empty) {
                    q = query(collection(db, "clients"), where("email", "==", term), ...constraints);
                    snap = await getDocs(q);
                }

                if (snap.empty) throw new Error("Cliente não encontrado.");

                // 3. Carrega Cliente
                const docData = snap.docs[0];
                clientData.value = { id: docData.id, ...docData.data() };

                // 4. Carrega Eventos do Cliente
                let appQ = query(collection(db, "appointments"), where("clientId", "==", docData.id));
                if (providerUid) appQ = query(collection(db, "appointments"), where("clientId", "==", docData.id), where("userId", "==", providerUid));
                
                const appSnap = await getDocs(appQ);
                appointments.value = appSnap.docs.map(sanitizeApp)
                    .filter(a => a.status !== 'cancelled')
                    .sort((a,b) => b.date.localeCompare(a.date));

                // Carrega fotos dos eventos do cliente
                loadClientPhotos(docData.id);

                // Se não carregou empresa via URL mas achou evento, carrega agora (backup)
                if (appointments.value.length > 0 && !providerUid) {
                    const uDoc = await getDoc(doc(db, "users", appointments.value[0].userId));
                    if (uDoc.exists() && uDoc.data().companyConfig) Object.assign(company, uDoc.data().companyConfig);
                }

                loadingState.value = 'portal';

            } catch (e) {
                console.error(e);
                Swal.fire('Acesso Negado', 'Dados não encontrados.', 'error');
            } finally {
                authLoading.value = false;
            }
        };

        // ============================================================
        // 3. ASSINATURA (CORREÇÃO POINTER EVENTS)
        // ============================================================
        let canvasContext = null;
        let isDrawing = false;

        const openContractPreview = (app) => {
            contractApp.value = app;
            showContractModal.value = true;
        };

        const guardPreview = () => {
            if (isPreview.value) {
                Swal.fire({ icon:'info', title:'Modo visualização', text:'A assinatura do contrato só pode ser feita pelo próprio cliente.', confirmButtonColor:'#0f4c81' });
                return true;
            }
            return false;
        };
        const acceptAndSign = () => {
            showContractModal.value = false;
            openSignature(contractApp.value);
        };

        const openSignature = (app) => {
            currentApp.value = app;
            showSignModal.value = true;
            // Delay para garantir que o modal renderizou
            setTimeout(initCanvas, 150);
        };

        const initCanvas = () => {
            const canvas = document.getElementById('signature-pad');
            if(!canvas) return;
            
            // 1. Configuração de Alta Resolução (Retina/Mobile)
            const ratio = Math.max(window.devicePixelRatio || 1, 1);
            canvas.width = canvas.offsetWidth * ratio;
            canvas.height = canvas.offsetHeight * ratio;
            canvas.getContext("2d").scale(ratio, ratio);
            
            canvasContext = canvas.getContext('2d');
            canvasContext.strokeStyle = "#000000";
            canvasContext.lineWidth = 2.5; 
            canvasContext.lineCap = "round";
            canvasContext.lineJoin = "round";
            
            // 2. Função Unificada para pegar posição (Mouse ou Toque)
            const getPointerPos = (e) => {
                const rect = canvas.getBoundingClientRect();
                return {
                    x: e.clientX - rect.left,
                    y: e.clientY - rect.top
                };
            };

            // 3. Funções de Desenho
            const startDrawing = (e) => {
                e.preventDefault(); // Impede rolagem no início
                isDrawing = true;
                canvasContext.beginPath();
                const { x, y } = getPointerPos(e);
                canvasContext.moveTo(x, y);
            };

            const draw = (e) => {
                if (!isDrawing) return;
                e.preventDefault(); // IMPEDE ROLAGEM DURANTE O DESENHO
                const { x, y } = getPointerPos(e);
                canvasContext.lineTo(x, y);
                canvasContext.stroke();
            };

            const stopDrawing = (e) => {
                if (isDrawing) {
                    isDrawing = false;
                    canvasContext.closePath();
                }
            };

            // 4. Listeners (Pointer Events) - Funciona em Desktop e Mobile igual
            // Remove antigos para não duplicar
            canvas.removeEventListener("pointerdown", startDrawing);
            canvas.removeEventListener("pointermove", draw);
            canvas.removeEventListener("pointerup", stopDrawing);
            canvas.removeEventListener("pointerleave", stopDrawing);

            // Adiciona novos com passive: false (Crucial para iOS)
            canvas.addEventListener("pointerdown", startDrawing, { passive: false });
            canvas.addEventListener("pointermove", draw, { passive: false });
            canvas.addEventListener("pointerup", stopDrawing);
            canvas.addEventListener("pointerleave", stopDrawing);
        };

        const clearCanvas = () => {
            const canvas = document.getElementById('signature-pad');
            if (canvas && canvasContext) {
                canvasContext.clearRect(0, 0, canvas.width, canvas.height);
            }
        };

        const isCanvasBlank = () => {
            const canvas = document.getElementById('signature-pad');
            if (!canvas || !canvasContext) return true;
            const pixelBuffer = new Uint32Array(
                canvasContext.getImageData(0, 0, canvas.width, canvas.height).data.buffer
            );
            return !pixelBuffer.some(color => color !== 0);
        };

        const saveSignature = async () => {
            if (isCanvasBlank()) return Swal.fire('Ops', 'Faça sua assinatura.', 'warning');
            
            authLoading.value = true;
            try {
                const dataUrl = document.getElementById('signature-pad').toDataURL();
                
                // Salva no Firestore
                await updateDoc(doc(db, "appointments", currentApp.value.id), {
                    clientSignature: dataUrl,
                    status: 'pending' // Confirma o evento ao assinar
                });

                // Atualiza visualmente na hora
                const idx = appointments.value.findIndex(a => a.id === currentApp.value.id);
                if (idx !== -1) {
                    appointments.value[idx].clientSignature = dataUrl;
                    appointments.value[idx].status = 'pending';
                }

                showSignModal.value = false;
                
                const result = await Swal.fire({ 
                    title: '✅ Contrato Assinado!', 
                    text: 'Contrato confirmado com sucesso! Deseja baixar uma cópia em PDF?', 
                    icon: 'success',
                    showCancelButton: true,
                    confirmButtonText: '<i class="fa-solid fa-file-pdf"></i> Sim, baixar',
                    cancelButtonText: 'Agora não',
                    confirmButtonColor: '#4F46E5'
                });
                
                if (result.isConfirmed) {
                    currentApp.value.clientSignature = dataUrl; 
                    downloadContract(currentApp.value);
                }

            } catch (e) {
                console.error(e);
                Swal.fire('Erro', 'Falha ao salvar assinatura. Tente novamente.', 'error');
            } finally {
                authLoading.value = false;
            }
        };

        // ============================================================
        // 4. PDF E HELPERS
        // ============================================================
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
            
            // 1. CABEÇALHO
            doc.setFont("helvetica", "bold"); doc.setFontSize(14);
            doc.text((company.fantasia || 'Nome da Empresa').toUpperCase(), 105, 20, {align: "center"});
            
            doc.setFontSize(10); doc.setFont("helvetica", "normal");
            let y = 28;
            
            if(company.cnpj) { doc.text(`CNPJ: ${company.cnpj}`, 105, y, {align:"center"}); y += 5; }
            if(company.rua || company.bairro) {
                doc.text(`${company.rua || ''} - ${company.bairro || ''} - ${company.cidade || ''}/${company.estado || ''}`, 105, y, {align:"center"});
                y += 5;
            }
            if(company.email || company.phone) {
                doc.text(`Contato: ${company.phone || ''} | ${company.email || ''}`, 105, y, {align:"center"});
                y += 5;
            }

            doc.line(20, y, 190, y); y += 10;

            // 2. TÍTULO
            doc.setFont("helvetica", "bold"); doc.setFontSize(12);
            const title = app.status === 'budget' ? "ORÇAMENTO DE PRESTAÇÃO DE SERVIÇOS" : "CONTRATO DE PRESTAÇÃO DE SERVIÇOS";
            doc.text(title, 105, y, {align:"center"}); y += 15;

            // 3. DADOS
            doc.setFontSize(10);
            doc.setFont("helvetica", "bold"); doc.text("CONTRATANTE:", 20, y); y += 5;
            doc.setFont("helvetica", "normal");
            doc.text(`Nome: ${clientData.value.name}`, 20, y); y += 5;
            doc.text(`CPF: ${clientData.value.cpf || '-'}`, 20, y); y += 5;
            doc.text(`Tel: ${clientData.value.phone || '-'}`, 20, y); y += 5;
            
            y += 5;
            doc.setFont("helvetica", "bold"); doc.text("DADOS DO EVENTO:", 20, y); y += 5;
            doc.setFont("helvetica", "normal");
            doc.text(`Data: ${formatDate(app.date)}`, 20, y); 
            doc.text(`Horário: ${app.time}`, 80, y); y += 5;
            doc.text(`Local: ${app.location.bairro}`, 20, y); y += 5;
            if (app.details.balloonColors) {
                doc.text(`Decoração/Cores: ${app.details.balloonColors}`, 20, y); y += 5;
            }

            // 4. TABELA
            y += 5;
            const body = app.selectedServices.map(s => [s.description, formatCurrency(s.price)]);
            doc.autoTable({
                startY: y, head: [['Descrição do Serviço/Item', 'Valor']], body: body,
                theme: 'grid', headStyles: { fillColor: [50, 50, 50] }, styles: { fontSize: 9 }
            });
            y = doc.lastAutoTable.finalY + 10;

            // 5. FINANCEIRO
            doc.setFont("helvetica", "bold");
            doc.text(`VALOR TOTAL: ${formatCurrency(app.totalServices)}`, 190, y, {align: "right"}); y += 5;
            doc.text(`SINAL (PAGO): ${formatCurrency(app.entryFee || app.details.entryFee)}`, 190, y, {align: "right"}); y += 5;
            doc.text(`RESTANTE: ${formatCurrency(app.finalBalance)}`, 190, y, {align: "right"}); y += 15;

            // 6. CLÁUSULAS
            doc.setFontSize(9);
            doc.setFont("helvetica", "bold"); doc.text("CLÁUSULAS E CONDIÇÕES:", 20, y); y += 7;
            doc.setFont("helvetica", "normal");

            const defaultClauses = [
                "1. DO OBJETO: O presente contrato tem como objeto a prestação de serviços de decoração conforme itens descritos acima.",
                "2. DA RESERVA: A data somente será reservada mediante o pagamento do sinal estipulado. Em caso de cancelamento por parte do CONTRATANTE com menos de 30 dias, o valor do sinal não será devolvido, servindo como multa contratual.",
                "3. DO PAGAMENTO: O valor restante deverá ser quitado até a data do evento, antes do início da montagem.",
                "4. DA CONSERVAÇÃO: O CONTRATANTE fica responsável pela conservação das peças e materiais locados durante o evento. Em caso de quebra, dano ou extravio, o CONTRATANTE deverá arcar com o valor de reposição do item.",
                "5. DA MONTAGEM E DESMONTAGEM: O local deve estar disponível e limpo no horário combinado para montagem. A desmontagem ocorrerá conforme horário pré-agendado.",
                "6. DE FORÇA MAIOR: A CONTRATADA não se responsabiliza por falhas decorrentes de casos fortuitos ou força maior (tempestades, falta de energia no local, etc)."
            ];
            const customRaw = company.contractClauses || '';
            const customClauses = customRaw ? customRaw.split('\n').filter(l => l.trim()) : null;
            const clauses = customClauses && customClauses.length ? customClauses : defaultClauses;

            clauses.forEach(clause => {
                const splitText = doc.splitTextToSize(clause, 170);
                if (y + (splitText.length * 4) > 270) { doc.addPage(); y = 20; }
                doc.text(splitText, 20, y);
                y += (splitText.length * 4) + 2;
            });

            // 7. ASSINATURAS
            if (y > 240) { doc.addPage(); y = 40; } else { y += 20; }

            // Empresa
            if (company.signature) { doc.addImage(company.signature, 'PNG', 30, y - 15, 50, 20); }
            doc.line(30, y, 90, y);
            doc.text("CONTRATADA", 60, y + 5, {align: "center"});

            // Cliente
            if (app.clientSignature) { doc.addImage(app.clientSignature, 'PNG', 120, y - 15, 50, 20); }
            doc.line(120, y, 180, y);
            doc.text("CONTRATANTE", 150, y + 5, {align: "center"});

            // Rodapé
            doc.setFontSize(8);
            doc.text("Documento gerado eletronicamente via PartyPlanner Pro", 105, 290, {align: "center"});

            // Salvar
            const fileName = `Contrato_${clientData.value.name.split(' ')[0]}_${formatDate(app.date).replace(/\//g, '-')}.pdf`;
            doc.save(fileName);
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

        // ── COBRANÇA PIX (BR Code EMV) ─────────────────────────
        const showPixModal = ref(false);
        const pixApp = ref(null);
        const pixCode = ref('');
        const pixCopied = ref(false);

        const crc16 = (str) => {
            let crc = 0xFFFF;
            for (let i = 0; i < str.length; i++) {
                crc ^= str.charCodeAt(i) << 8;
                for (let j = 0; j < 8; j++) {
                    crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
                    crc &= 0xFFFF;
                }
            }
            return crc.toString(16).toUpperCase().padStart(4, '0');
        };
        const emv = (id, value) => id + String(value.length).padStart(2, '0') + value;
        const sanitizePixText = (t, max) => (t || '')
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^A-Za-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
            .toUpperCase().slice(0, max) || 'N A';

        const buildPixPayload = (key, name, city, amount) => {
            const merchantInfo = emv('00', 'br.gov.bcb.pix') + emv('01', key.trim());
            let payload =
                emv('00', '01') +
                emv('26', merchantInfo) +
                emv('52', '0000') +
                emv('53', '986') +
                (amount > 0 ? emv('54', amount.toFixed(2)) : '') +
                emv('58', 'BR') +
                emv('59', sanitizePixText(name, 25)) +
                emv('60', sanitizePixText(city, 15)) +
                emv('62', emv('05', '***')) +
                '6304';
            return payload + crc16(payload);
        };

        const openPixModal = (app) => {
            if (!company.pixKey) return;
            pixApp.value = app;
            pixCopied.value = false;
            const amount = parseFloat(app.finalBalance) || 0;
            pixCode.value = buildPixPayload(company.pixKey, company.fantasia || 'Recebedor', company.cidade || 'BRASIL', amount);
            showPixModal.value = true;
            // Renderiza o QR após o modal montar
            setTimeout(() => {
                const el = document.getElementById('pix-qrcode');
                if (el && window.QRCode) {
                    el.innerHTML = '';
                    new QRCode(el, { text: pixCode.value, width: 220, height: 220, correctLevel: QRCode.CorrectLevel.M });
                }
            }, 80);
        };
        const copyPixCode = () => {
            navigator.clipboard.writeText(pixCode.value).then(() => {
                pixCopied.value = true;
                setTimeout(() => pixCopied.value = false, 2500);
            });
        };

        // ── GALERIA DE FOTOS ───────────────────────────────────
        const photosByApp = ref({});
        const lightboxPhoto = ref(null);
        const loadClientPhotos = async (clientId) => {
            try {
                const snap = await getDocs(query(collection(db, 'eventPhotos'), where('clientId', '==', clientId)));
                const map = {};
                snap.docs.forEach(d => {
                    const p = { id: d.id, ...d.data() };
                    if (!map[p.appointmentId]) map[p.appointmentId] = [];
                    map[p.appointmentId].push(p);
                });
                Object.values(map).forEach(arr => arr.sort((a,b) => (b.createdAt||'').localeCompare(a.createdAt||'')));
                photosByApp.value = map;
            } catch(e) { console.error('Erro ao carregar fotos:', e); }
        };
        const openLightbox = (photo) => { lightboxPhoto.value = photo; };
        const closeLightbox = () => { lightboxPhoto.value = null; };
        const sharePhoto = async (photo) => {
            try {
                const blob = await (await fetch(photo.data)).blob();
                const file = new File([blob], 'festa.jpg', { type: 'image/jpeg' });
                if (navigator.canShare && navigator.canShare({ files: [file] })) {
                    await navigator.share({ files: [file], title: 'Foto da minha festa 🎉' });
                    return;
                }
            } catch(e) { /* fallback abaixo */ }
            // Fallback: download direto
            const a = document.createElement('a');
            a.href = photo.data;
            a.download = 'festa-' + Date.now() + '.jpg';
            a.click();
        };

        // ── COUNTDOWN ──────────────────────────────────────────
        const countdowns = ref({});
        const getDaysUntil = (dateStr) => {
            if (!dateStr) return -1;
            const now = new Date();
            const ev = new Date(dateStr + 'T00:00:00');
            return Math.floor((ev - now) / 86400000);
        };
        const updateCountdowns = () => {
            appointments.value.forEach(app => {
                if (!app.date) return;
                const ev = new Date(app.date + 'T00:00:00');
                const diff = ev - new Date();
                if (diff < 0) { countdowns.value[app.id] = null; return; }
                const days    = Math.floor(diff / 86400000);
                const hours   = Math.floor((diff % 86400000) / 3600000);
                const minutes = Math.floor((diff % 3600000) / 60000);
                const seconds = Math.floor((diff % 60000) / 1000);
                countdowns.value[app.id] = { days, hours, minutes, seconds };
            });
        };
        let countdownInterval = null;
        const { watch } = Vue;
        watch(appointments, (val) => {
            if (val.length) {
                updateCountdowns();
                if (!countdownInterval) countdownInterval = setInterval(updateCountdowns, 1000);
            }
        }, { immediate: true });

        // ── CLÁUSULAS PADRÃO ────────────────────────────────────
        const defaultClauses = [
            { title:'DO OBJETO', body:'O presente contrato tem como objeto a prestação de serviços de decoração conforme itens descritos acima.' },
            { title:'DA RESERVA', body:'A data somente será reservada mediante o pagamento do sinal. Em caso de cancelamento com menos de 30 dias, o valor do sinal não será devolvido.' },
            { title:'DO PAGAMENTO', body:'O valor restante deverá ser quitado até a data do evento, antes do início da montagem.' },
            { title:'DA CONSERVAÇÃO', body:'O CONTRATANTE responsabiliza-se pela conservação das peças. Danos ou extravios serão de responsabilidade do contratante.' },
            { title:'DA MONTAGEM', body:'O local deve estar disponível e limpo no horário combinado. A desmontagem ocorrerá conforme horário pré-agendado.' },
            { title:'DE FORÇA MAIOR', body:'A CONTRATADA não se responsabiliza por falhas decorrentes de casos fortuitos ou força maior.' },
        ];

        return {
            loadingState, authLoading, accessInput, company, clientData, appointments,
            showSignModal, showContractModal, contractApp, handleInputMask, handleAccess, logout,
            getDay, getMonth, statusText, formatCurrency, formatDate, openSignature, openSupport,
            clearCanvas, saveSignature, downloadContract, openContractPreview, acceptAndSign,
            countdowns, getDaysUntil, defaultClauses,
            photosByApp, lightboxPhoto, openLightbox, closeLightbox, sharePhoto,
            showPixModal, pixApp, pixCode, pixCopied, openPixModal, copyPixCode,
            isPreview, guardPreview,
        };
    }
}).mount('#client-app');
