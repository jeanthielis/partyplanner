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

        // --- EM js/client.js ---
        
        const downloadContract = (app) => {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();
            
            // 1. CABEÇALHO DA EMPRESA
            doc.setFont("helvetica", "bold");
            doc.setFontSize(14);
            doc.text((company.fantasia || 'Nome da Empresa').toUpperCase(), 105, 20, {align: "center"});
            
            doc.setFontSize(10);
            doc.setFont("helvetica", "normal");
            let y = 28;
            
            if(company.cnpj) { 
                doc.text(`CNPJ: ${company.cnpj}`, 105, y, {align:"center"}); 
                y += 5; 
            }
            if(company.rua || company.bairro) {
                doc.text(`${company.rua || ''} - ${company.bairro || ''} - ${company.cidade || ''}/${company.estado || ''}`, 105, y, {align:"center"});
                y += 5;
            }
            if(company.email || company.phone) {
                doc.text(`Contato: ${company.phone || ''} | ${company.email || ''}`, 105, y, {align:"center"});
                y += 5;
            }

            doc.line(20, y, 190, y); // Linha separadora
            y += 10;

            // 2. TÍTULO DO DOCUMENTO
            doc.setFont("helvetica", "bold");
            doc.setFontSize(12);
            const title = app.status === 'budget' ? "ORÇAMENTO DE PRESTAÇÃO DE SERVIÇOS" : "CONTRATO DE PRESTAÇÃO DE SERVIÇOS";
            doc.text(title, 105, y, {align:"center"});
            y += 15;

            // 3. DADOS DAS PARTES (CONTRATANTE E EVENTO)
            doc.setFontSize(10);
            
            // Coluna Esquerda: Cliente
            doc.setFont("helvetica", "bold");
            doc.text("CONTRATANTE:", 20, y);
            y += 5;
            doc.setFont("helvetica", "normal");
            doc.text(`Nome: ${clientData.value.name}`, 20, y); y += 5;
            doc.text(`CPF: ${clientData.value.cpf || '-'}`, 20, y); y += 5;
            doc.text(`Tel: ${clientData.value.phone || '-'}`, 20, y); y += 5;
            
            // Reset Y para coluna direita (se quisesse fazer lado a lado), mas vamos fazer sequencial para caber tudo
            y += 5;
            doc.setFont("helvetica", "bold");
            doc.text("DADOS DO EVENTO:", 20, y);
            y += 5;
            doc.setFont("helvetica", "normal");
            doc.text(`Data: ${formatDate(app.date)}`, 20, y); 
            doc.text(`Horário: ${app.time}`, 80, y); y += 5;
            doc.text(`Local: ${app.location.bairro}`, 20, y); y += 5;
            if (app.details.balloonColors) {
                doc.text(`Decoração/Cores: ${app.details.balloonColors}`, 20, y); y += 5;
            }

            // 4. TABELA DE ITENS (Usando autoTable)
            y += 5;
            const body = app.selectedServices.map(s => [s.description, formatCurrency(s.price)]);
            doc.autoTable({
                startY: y,
                head: [['Descrição do Serviço/Item', 'Valor']],
                body: body,
                theme: 'grid',
                headStyles: { fillColor: [50, 50, 50] },
                styles: { fontSize: 9 }
            });
            y = doc.lastAutoTable.finalY + 10;

            // 5. RESUMO FINANCEIRO
            doc.setFont("helvetica", "bold");
            doc.text(`VALOR TOTAL: ${formatCurrency(app.totalServices)}`, 190, y, {align: "right"}); y += 5;
            doc.text(`SINAL (PAGO): ${formatCurrency(app.entryFee || app.details.entryFee)}`, 190, y, {align: "right"}); y += 5;
            doc.text(`RESTANTE: ${formatCurrency(app.finalBalance)}`, 190, y, {align: "right"}); y += 15;

            // 6. CLÁUSULAS CONTRATUAIS (Profissional)
            doc.setFontSize(9);
            doc.setFont("helvetica", "bold");
            doc.text("CLÁUSULAS E CONDIÇÕES:", 20, y);
            y += 7;
            doc.setFont("helvetica", "normal");

            const clauses = [
                "1. DO OBJETO: O presente contrato tem como objeto a prestação de serviços de decoração conforme itens descritos acima.",
                "2. DA RESERVA: A data somente será reservada mediante o pagamento do sinal estipulado. Em caso de cancelamento por parte do CONTRATANTE com menos de 30 dias, o valor do sinal não será devolvido, servindo como multa contratual.",
                "3. DO PAGAMENTO: O valor restante deverá ser quitado até a data do evento, antes do início da montagem.",
                "4. DA CONSERVAÇÃO: O CONTRATANTE fica responsável pela conservação das peças e materiais locados durante o evento. Em caso de quebra, dano ou extravio, o CONTRATANTE deverá arcar com o valor de reposição do item.",
                "5. DA MONTAGEM E DESMONTAGEM: O local deve estar disponível e limpo no horário combinado para montagem. A desmontagem ocorrerá conforme horário pré-agendado.",
                "6. DE FORÇA MAIOR: A CONTRATADA não se responsabiliza por falhas decorrentes de casos fortuitos ou força maior (tempestades, falta de energia no local, etc)."
            ];

            // Loop para escrever as cláusulas com quebra de linha automática
            clauses.forEach(clause => {
                // Divide o texto para caber em 170mm de largura
                const splitText = doc.splitTextToSize(clause, 170);
                
                // Verifica se vai estourar a página (altura A4 é 297mm)
                if (y + (splitText.length * 4) > 270) {
                    doc.addPage();
                    y = 20; // Reinicia Y na nova página
                }
                
                doc.text(splitText, 20, y);
                y += (splitText.length * 4) + 2; // Espaço entre cláusulas
            });

            // 7. ASSINATURAS
            // Se precisar de nova página para as assinaturas
            if (y > 240) {
                doc.addPage();
                y = 40;
            } else {
                y += 20;
            }

            // Assinatura da Empresa
            if (company.signature) {
                doc.addImage(company.signature, 'PNG', 30, y - 15, 50, 20);
            }
            doc.line(30, y, 90, y);
            doc.text("CONTRATADA", 60, y + 5, {align: "center"});

            // Assinatura do Cliente
            if (app.clientSignature) {
                doc.addImage(app.clientSignature, 'PNG', 120, y - 15, 50, 20);
            }
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

        return {
            loadingState, authLoading, accessInput, company, clientData, appointments,
            showSignModal, handleInputMask, handleAccess, logout,
            getDay, getMonth, statusText, formatCurrency, openSignature, openSupport,
            clearCanvas, saveSignature, downloadContract
        };
    }
}).mount('#client-app');
