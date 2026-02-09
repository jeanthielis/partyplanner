<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>PartyPlanner Pro</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.25/jspdf.plugin.autotable.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
    
    <script>
        tailwind.config = {
            darkMode: 'class',
            theme: {
                extend: {
                    fontFamily: { sans: ['Plus Jakarta Sans', 'sans-serif'] },
                    colors: { brand: { 50: '#f5f3ff', 100: '#ede9fe', 500: '#8b5cf6', 600: '#7c3aed' } }
                }
            }
        }
    </script>
    <style>
        [v-cloak] { display: none; }
        .sidebar-active { background-color: #f5f3ff; color: #7c3aed; font-weight: 600; border-right: 3px solid #7c3aed; }
        .dark .sidebar-active { background-color: #374151; color: #fff; border-right: 3px solid #fff; }
    </style>
</head>
<body class="bg-gray-50 text-gray-800 dark:bg-gray-900 dark:text-gray-100 transition-colors duration-300">
    
    <div id="app" v-cloak>
        
        <div v-if="!user" class="min-h-screen flex items-center justify-center bg-brand-600 p-4">
            <div class="bg-white p-8 rounded-3xl shadow-2xl w-full max-w-md text-center">
                <div class="mb-6 text-brand-600 text-5xl"><i class="fa-solid fa-wand-magic-sparkles"></i></div>
                <h1 class="text-2xl font-bold text-gray-900 mb-2">PartyPlanner Pro</h1>
                <p class="text-gray-400 text-sm mb-6">Gestão inteligente para seus eventos</p>

                <form @submit.prevent="handleAuth" class="space-y-4">
                    <div v-if="isRegistering" class="text-left">
                        <label class="text-xs font-bold text-gray-500 ml-1">NOME</label>
                        <input v-model="authForm.name" type="text" class="w-full p-3 border rounded-xl outline-none focus:border-brand-500" required>
                    </div>
                    <div class="text-left">
                        <label class="text-xs font-bold text-gray-500 ml-1">EMAIL</label>
                        <input v-model="authForm.email" type="email" class="w-full p-3 border rounded-xl outline-none focus:border-brand-500" required>
                    </div>
                    <div class="text-left">
                        <label class="text-xs font-bold text-gray-500 ml-1">SENHA</label>
                        <input v-model="authForm.password" type="password" class="w-full p-3 border rounded-xl outline-none focus:border-brand-500" required>
                    </div>
                    <button type="submit" :disabled="authLoading" class="w-full bg-brand-600 text-white py-3 rounded-xl font-bold hover:bg-brand-500 transition shadow-lg flex justify-center items-center gap-2">
                        <i v-if="authLoading" class="fa-solid fa-circle-notch fa-spin"></i>
                        {{ isRegistering ? 'Criar Conta' : 'Acessar Sistema' }}
                    </button>
                </form>
                
                <div class="mt-6 pt-4 border-t">
                    <button @click="isRegistering = !isRegistering" class="text-sm text-brand-600 font-bold hover:underline">
                        {{ isRegistering ? 'Já tenho conta? Entrar' : 'Não tem conta? Cadastre-se' }}
                    </button>
                </div>
            </div>
        </div>

        <div v-else class="flex h-screen overflow-hidden">
            
            <aside class="w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 hidden md:flex flex-col z-20">
                <div class="p-6 flex items-center gap-3">
                    <div class="w-8 h-8 bg-brand-600 text-white rounded flex items-center justify-center"><i class="fa-solid fa-wand-magic-sparkles"></i></div>
                    <span class="font-bold text-lg">PartyPlanner</span>
                </div>

                <nav class="flex-1 px-4 space-y-1 mt-4">
                    <button @click="view='dashboard'" :class="view==='dashboard'?'sidebar-active':''" class="w-full text-left p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition flex items-center gap-3 text-gray-500 dark:text-gray-400">
                        <i class="fa-solid fa-chart-pie w-5 text-center"></i> Dashboard
                    </button>
                    <button @click="view='schedule'; startNewSchedule()" :class="view==='schedule'?'sidebar-active':''" class="w-full text-left p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition flex items-center gap-3 text-gray-500 dark:text-gray-400">
                        <i class="fa-solid fa-calendar w-5 text-center"></i> Agenda
                    </button>
                    <button @click="view='finance'" :class="view==='finance'?'sidebar-active':''" class="w-full text-left p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition flex items-center gap-3 text-gray-500 dark:text-gray-400">
                        <i class="fa-solid fa-wallet w-5 text-center"></i> Financeiro
                    </button>
                    <button @click="view='clients'" :class="view==='clients'?'sidebar-active':''" class="w-full text-left p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition flex items-center gap-3 text-gray-500 dark:text-gray-400">
                        <i class="fa-solid fa-users w-5 text-center"></i> Clientes
                    </button>
                    <button @click="view='settings'" :class="view==='settings'?'sidebar-active':''" class="w-full text-left p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition flex items-center gap-3 text-gray-500 dark:text-gray-400">
                        <i class="fa-solid fa-gear w-5 text-center"></i> Configurações
                    </button>
                </nav>

                <div class="p-4 border-t dark:border-gray-700">
                    <button @click="logout" class="w-full text-left p-2 text-red-500 hover:bg-red-50 rounded-lg transition flex items-center gap-3">
                        <i class="fa-solid fa-right-from-bracket w-5 text-center"></i> Sair
                    </button>
                </div>
            </aside>

            <main class="flex-1 overflow-y-auto relative bg-gray-50 dark:bg-gray-900">
                
                <header class="md:hidden bg-white dark:bg-gray-800 p-4 flex justify-between items-center shadow-sm sticky top-0 z-10">
                    <div class="font-bold text-brand-600 flex items-center gap-2">
                        <i class="fa-solid fa-wand-magic-sparkles"></i> PartyPlanner
                    </div>
                    <div class="flex gap-4 text-xl">
                        <button @click="view='dashboard'"><i class="fa-solid fa-home text-gray-400 hover:text-brand-600"></i></button>
                        <button @click="view='schedule'"><i class="fa-solid fa-plus-circle text-brand-600"></i></button>
                        <button @click="view='finance'"><i class="fa-solid fa-wallet text-gray-400 hover:text-brand-600"></i></button>
                    </div>
                </header>

                <div v-if="view === 'dashboard'" class="p-6 md:p-10 space-y-8 max-w-7xl mx-auto">
                    <div class="flex flex-col md:flex-row justify-between md:items-end gap-4">
                        <div>
                            <h2 class="text-2xl font-bold">Visão Geral</h2>
                            <p class="text-gray-500 text-sm">Acompanhe o desempenho do seu negócio.</p>
                        </div>
                        <input type="month" v-model="dashboardMonth" class="bg-white dark:bg-gray-800 border p-2 rounded-lg text-sm shadow-sm">
                    </div>

                    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <div class="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border-l-4 border-green-500">
                            <div class="text-gray-400 text-xs font-bold uppercase mb-1">Receita</div>
                            <div class="text-2xl font-bold text-gray-800 dark:text-white">{{ formatCurrency(financeData.revenue) }}</div>
                        </div>
                        <div class="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border-l-4 border-red-500">
                            <div class="text-gray-400 text-xs font-bold uppercase mb-1">Despesas</div>
                            <div class="text-2xl font-bold text-gray-800 dark:text-white">{{ formatCurrency(financeData.expenses) }}</div>
                        </div>
                        <div class="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border-l-4 border-brand-500">
                            <div class="text-gray-400 text-xs font-bold uppercase mb-1">Lucro</div>
                            <div class="text-2xl font-bold text-brand-600">{{ formatCurrency(financeData.profit) }}</div>
                        </div>
                        <div class="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border-l-4 border-orange-500">
                            <div class="text-gray-400 text-xs font-bold uppercase mb-1">A Receber</div>
                            <div class="text-2xl font-bold text-gray-800 dark:text-white">{{ formatCurrency(financeData.receivables) }}</div>
                        </div>
                    </div>

                    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-6">
                        <h3 class="font-bold text-lg mb-4">Agenda Recente</h3>
                        <div v-if="next7DaysApps.length === 0" class="text-gray-400 text-center py-4">Sem eventos próximos.</div>
                        <div v-else class="space-y-3">
                            <div v-for="app in next7DaysApps" :key="app.id" @click="showReceipt(app)" class="flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-xl cursor-pointer border border-transparent hover:border-gray-200 transition">
                                <div class="flex items-center gap-4">
                                    <div class="bg-brand-100 text-brand-600 w-12 h-12 rounded-xl flex flex-col items-center justify-center font-bold leading-none">
                                        <span class="text-xs">{{ getMonth(app.date) }}</span>
                                        <span class="text-lg">{{ getDay(app.date) }}</span>
                                    </div>
                                    <div>
                                        <div class="font-bold">{{ getClientName(app.clientId) }}</div>
                                        <div class="text-xs text-gray-500">{{ app.time }} - {{ app.location.bairro }}</div>
                                    </div>
                                </div>
                                <div class="text-right">
                                    <div class="font-bold text-brand-600">{{ formatCurrency(app.totalServices) }}</div>
                                    <span class="text-[10px] bg-gray-100 px-2 py-1 rounded text-gray-500 uppercase">{{ statusText(app.status) }}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div v-if="view === 'finance'" class="p-6 md:p-10 max-w-5xl mx-auto space-y-6">
                    <div class="flex justify-between items-center">
                        <h2 class="text-2xl font-bold">Financeiro</h2>
                        <button @click="showExpenseModal = true" class="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-lg shadow-red-500/20 flex items-center gap-2">
                            <i class="fa-solid fa-minus"></i> Nova Despesa
                        </button>
                    </div>

                    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm overflow-hidden">
                        <div class="p-4 bg-gray-50 dark:bg-gray-900 border-b dark:border-gray-700 flex gap-4 overflow-x-auto">
                            <input type="date" v-model="expensesFilter.start" class="bg-white dark:bg-gray-800 border p-2 rounded text-sm">
                            <input type="date" v-model="expensesFilter.end" class="bg-white dark:bg-gray-800 border p-2 rounded text-sm">
                            <button @click="searchExpenses" class="bg-gray-800 text-white px-4 rounded text-sm hover:bg-gray-700">Filtrar</button>
                        </div>

                        <div v-if="statementList.length === 0" class="p-10 text-center text-gray-400">
                            Nenhuma movimentação encontrada.
                        </div>
                        <div v-else>
                            <div v-for="item in statementList" :key="item.id" class="flex justify-between items-center p-4 border-b dark:border-gray-700 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-700 transition">
                                <div class="flex items-center gap-4">
                                    <div class="w-10 h-10 rounded-full flex items-center justify-center bg-opacity-10" :class="item.type === 'income' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-500'">
                                        <i class="fa-solid" :class="item.icon"></i>
                                    </div>
                                    <div>
                                        <div class="font-bold text-sm">{{ item.description }}</div>
                                        <div class="text-xs text-gray-400">{{ formatDate(item.date) }}</div>
                                    </div>
                                </div>
                                <div class="font-mono font-bold" :class="item.color">
                                    {{ item.type === 'income' ? '+' : '-' }} {{ formatCurrency(item.value) }}
                                </div>
                            </div>
                        </div>
                        
                        <div class="p-4 bg-gray-50 dark:bg-gray-900 text-right border-t dark:border-gray-700">
                            <span class="text-sm text-gray-500 mr-2">Saldo do Período:</span>
                            <span class="font-bold text-lg" :class="financeData.profit >= 0 ? 'text-green-600' : 'text-red-500'">
                                {{ formatCurrency(financeData.profit) }}
                            </span>
                        </div>
                    </div>
                </div>

                <div v-if="view === 'schedule' || view === 'appointments_list'" class="p-6 md:p-10 max-w-3xl mx-auto">
                    <div class="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-lg">
                        <h2 class="text-xl font-bold mb-6 flex items-center gap-2">
                            <i class="fa-solid fa-calendar-plus text-brand-600"></i> {{ isEditing ? 'Editar Evento' : 'Novo Agendamento' }}
                        </h2>
                        
                        <div class="mb-4 relative">
                            <label class="text-xs font-bold text-gray-500 uppercase">Cliente</label>
                            <input v-model="clientSearchTerm" placeholder="Digite para buscar..." class="w-full p-3 border rounded-xl bg-gray-50 dark:bg-gray-900 dark:border-gray-700 mt-1">
                            
                            <div v-if="filteredClientsSearch.length > 0" class="absolute w-full bg-white dark:bg-gray-800 border dark:border-gray-700 shadow-xl max-h-48 overflow-y-auto z-50 rounded-xl mt-1">
                                <div v-for="c in filteredClientsSearch" @click="tempApp.clientId=c.id; clientSearchTerm=c.name; filteredClientsSearch=[]" class="p-3 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer border-b dark:border-gray-700 last:border-0">
                                    {{ c.name }} <span class="text-xs text-gray-400">({{ c.phone }})</span>
                                </div>
                            </div>
                            <button v-if="!tempApp.clientId" @click="openClientModal()" class="text-xs text-blue-600 font-bold mt-1 hover:underline">+ Cadastrar Novo Cliente</button>
                        </div>

                        <div class="grid grid-cols-2 gap-4 mb-4">
                            <div>
                                <label class="text-xs font-bold text-gray-500 uppercase">Data</label>
                                <input v-model="tempApp.date" type="date" class="w-full p-3 border rounded-xl bg-gray-50 dark:bg-gray-900 dark:border-gray-700 mt-1">
                            </div>
                            <div>
                                <label class="text-xs font-bold text-gray-500 uppercase">Hora</label>
                                <input v-model="tempApp.time" type="time" class="w-full p-3 border rounded-xl bg-gray-50 dark:bg-gray-900 dark:border-gray-700 mt-1">
                            </div>
                        </div>
                        <div class="mb-4">
                            <label class="text-xs font-bold text-gray-500 uppercase">Local / Bairro</label>
                            <input v-model="tempApp.location.bairro" placeholder="Ex: Centro" class="w-full p-3 border rounded-xl bg-gray-50 dark:bg-gray-900 dark:border-gray-700 mt-1">
                        </div>

                        <div class="mb-6 bg-gray-50 dark:bg-gray-900 p-4 rounded-xl border dark:border-gray-700">
                            <label class="text-xs font-bold text-gray-500 uppercase block mb-2">Adicionar Serviços</label>
                            <div class="flex gap-2 mb-3">
                                <select v-model="tempServiceSelect" class="flex-1 p-2 border rounded-lg dark:bg-gray-800 dark:border-gray-600">
                                    <option :value="''">Selecione...</option>
                                    <option v-for="s in services" :value="s">{{ s.description }} - {{ formatCurrency(s.price) }}</option>
                                </select>
                                <button @click="addServiceToApp" class="bg-green-500 hover:bg-green-600 text-white px-4 rounded-lg font-bold">+</button>
                            </div>
                            <div class="space-y-2">
                                <div v-for="(s,i) in tempApp.selectedServices" class="flex justify-between items-center text-sm bg-white dark:bg-gray-800 p-2 rounded border dark:border-gray-700">
                                    <span>{{ s.description }}</span>
                                    <div class="flex gap-3 items-center">
                                        <span class="font-bold">{{ formatCurrency(s.price) }}</span>
                                        <button @click="removeServiceFromApp(i)" class="text-red-500 hover:text-red-700"><i class="fa-solid fa-times"></i></button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="bg-brand-50 dark:bg-gray-700 p-4 rounded-xl mb-6 border border-brand-100 dark:border-gray-600">
                            <div class="flex justify-between mb-2 text-sm">
                                <span>Valor Total:</span>
                                <span class="font-bold">{{ formatCurrency(totalServices) }}</span>
                            </div>
                            <div class="flex justify-between items-center mb-2 text-sm">
                                <span>Sinal (Entrada):</span>
                                <input v-model="tempApp.details.entryFee" type="number" class="w-24 p-1 rounded text-right border focus:ring-2 focus:ring-brand-500 text-gray-900">
                            </div>
                            <div class="flex justify-between text-brand-700 dark:text-brand-300 font-bold text-lg border-t border-brand-200 dark:border-gray-600 pt-2 mt-2">
                                <span>Restante a Pagar:</span>
                                <span>{{ formatCurrency(finalBalance) }}</span>
                            </div>
                        </div>

                        <button @click="saveAppointment" class="w-full bg-brand-600 hover:bg-brand-500 text-white py-4 rounded-xl font-bold shadow-lg transition transform active:scale-95">
                            <i class="fa-solid fa-check"></i> Salvar Agendamento
                        </button>
                    </div>
                </div>

                <div v-if="view === 'clients'" class="p-6 md:p-10 max-w-4xl mx-auto space-y-6">
                    <div class="flex justify-between items-center">
                        <h2 class="text-2xl font-bold">Base de Clientes</h2>
                        <button @click="openClientModal()" class="bg-brand-600 text-white px-4 py-2 rounded-lg font-bold shadow-md hover:bg-brand-500 transition">+ Novo</button>
                    </div>
                    <div class="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm">
                        <div class="flex gap-2 mb-6">
                            <input v-model="catalogClientSearch" placeholder="Buscar por nome ou telefone..." class="w-full p-3 border rounded-xl dark:bg-gray-700 dark:border-gray-600">
                            <button @click="searchCatalogClients" class="bg-gray-800 text-white px-6 rounded-xl font-bold hover:bg-gray-700">Buscar</button>
                        </div>
                        <div class="space-y-2">
                            <div v-for="c in catalogClientsList" :key="c.id" class="flex justify-between items-center p-3 border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition">
                                <div>
                                    <div class="font-bold text-lg">{{ c.name }}</div>
                                    <div class="text-sm text-gray-500"><i class="fa-solid fa-phone text-xs"></i> {{ c.phone }}</div>
                                </div>
                                <div class="flex gap-3">
                                    <button @click="deleteClient(c.id)" class="text-red-500 hover:bg-red-50 p-2 rounded-full transition" title="Excluir"><i class="fa-solid fa-trash"></i></button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div v-if="view === 'settings'" class="p-6 md:p-10 max-w-2xl mx-auto">
                    <h2 class="text-2xl font-bold mb-6">Configurações</h2>
                    <div class="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm space-y-6">
                        <div>
                            <label class="block text-xs font-bold text-gray-500 uppercase mb-2">Logo da Empresa</label>
                            <input type="file" @change="handleLogoUpload" class="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100">
                            <img v-if="company.logo" :src="company.logo" class="h-20 mt-4 rounded border p-1">
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Nome Fantasia</label>
                            <input v-model="company.fantasia" class="w-full p-3 border rounded-xl dark:bg-gray-700 dark:border-gray-600">
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-gray-500 uppercase mb-1">CNPJ / CPF</label>
                            <input v-model="company.cnpj" class="w-full p-3 border rounded-xl dark:bg-gray-700 dark:border-gray-600">
                        </div>
                        <button @click="saveCompany" class="w-full bg-brand-600 text-white py-3 rounded-xl font-bold shadow hover:bg-brand-500 transition">Salvar Dados</button>
                        
                        <div class="border-t pt-6 flex justify-between items-center">
                            <button @click="toggleDarkMode" class="text-gray-500 font-bold hover:text-brand-600 flex items-center gap-2"><i class="fa-solid fa-moon"></i> Modo Escuro</button>
                            <button @click="handleChangePassword" class="text-brand-600 font-bold hover:underline">Alterar Senha</button>
                        </div>
                    </div>
                </div>

                <div v-if="view === 'receipt' && currentReceipt" class="p-6 flex justify-center bg-gray-100 dark:bg-gray-900 min-h-full">
                    <div class="bg-white p-8 shadow-2xl w-full max-w-lg relative text-gray-800" id="receipt-capture-area">
                        <div class="text-center border-b-2 border-brand-500 pb-6 mb-6">
                            <img v-if="company.logo" :src="company.logo" class="h-20 mx-auto mb-3 object-contain">
                            <h1 class="text-3xl font-bold text-brand-600">{{ company.fantasia || 'Sua Empresa' }}</h1>
                            <p class="text-xs text-gray-500 uppercase tracking-widest">Comprovante de Agendamento</p>
                        </div>
                        <div class="space-y-3 text-sm mb-8">
                            <div class="flex justify-between border-b border-gray-100 pb-2">
                                <span class="text-gray-500">Cliente</span>
                                <span class="font-bold text-lg">{{ getClientName(currentReceipt.clientId) }}</span>
                            </div>
                            <div class="flex justify-between border-b border-gray-100 pb-2">
                                <span class="text-gray-500">Data</span>
                                <span class="font-bold">{{ formatDate(currentReceipt.date) }} às {{ currentReceipt.time }}</span>
                            </div>
                            <div class="flex justify-between border-b border-gray-100 pb-2">
                                <span class="text-gray-500">Local</span>
                                <span class="font-bold">{{ currentReceipt.location?.bairro || '-' }}</span>
                            </div>
                        </div>
                        <div class="bg-gray-50 p-4 rounded-lg mb-6">
                            <div v-for="s in currentReceipt.selectedServices" class="flex justify-between text-sm mb-2">
                                <span>{{ s.description }}</span><span class="font-mono">{{ formatCurrency(s.price) }}</span>
                            </div>
                            <div class="border-t border-gray-300 my-2 pt-2 flex justify-between font-bold text-lg">
                                <span>Total</span><span>{{ formatCurrency(currentReceipt.totalServices) }}</span>
                            </div>
                            <div class="flex justify-between text-green-600 text-sm">
                                <span>Sinal Pago</span><span>- {{ formatCurrency(currentReceipt.entryFee) }}</span>
                            </div>
                            <div class="flex justify-between font-bold text-brand-600 mt-2 pt-2 border-t border-gray-200">
                                <span>Restante</span><span>{{ formatCurrency(currentReceipt.finalBalance) }}</span>
                            </div>
                        </div>
                        <div class="text-center text-[10px] text-gray-400 mt-8">
                            <p>Documento gerado em {{ new Date().toLocaleDateString() }}</p>
                            <p>PartyPlanner Pro System</p>
                        </div>
                    </div>
                    
                    <div class="fixed bottom-6 right-6 flex flex-col gap-3">
                        <button @click="downloadReceiptImage" class="bg-blue-600 text-white w-14 h-14 rounded-full shadow-xl flex items-center justify-center text-xl hover:bg-blue-700 transition" title="Baixar Imagem"><i class="fa-solid fa-image"></i></button>
                        <button @click="generateContractPDF" class="bg-red-600 text-white w-14 h-14 rounded-full shadow-xl flex items-center justify-center text-xl hover:bg-red-700 transition" title="PDF Contrato"><i class="fa-solid fa-file-pdf"></i></button>
                        <button @click="view='dashboard'" class="bg-gray-800 text-white w-14 h-14 rounded-full shadow-xl flex items-center justify-center text-xl hover:bg-gray-900 transition" title="Fechar"><i class="fa-solid fa-xmark"></i></button>
                    </div>
                </div>

            </main>
        </div>

        <div v-if="showExpenseModal" class="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div class="bg-white dark:bg-gray-800 p-6 rounded-2xl w-full max-w-sm shadow-2xl">
                <h3 class="font-bold text-lg mb-4">Adicionar Despesa</h3>
                <div class="space-y-3">
                    <input v-model="newExpense.description" placeholder="Descrição (ex: Combustível)" class="w-full p-3 rounded-xl border dark:bg-gray-700 dark:border-gray-600">
                    <input v-model="newExpense.value" type="number" placeholder="Valor (R$)" class="w-full p-3 rounded-xl border dark:bg-gray-700 dark:border-gray-600">
                    <select v-model="newExpense.category" class="w-full p-3 rounded-xl border dark:bg-gray-700 dark:border-gray-600">
                        <option value="" disabled>Categoria</option>
                        <option v-for="c in expenseCategories" :value="c.id">{{ c.label }}</option>
                    </select>
                    <input v-model="newExpense.date" type="date" class="w-full p-3 rounded-xl border dark:bg-gray-700 dark:border-gray-600">
                </div>
                <div class="flex gap-3 mt-6">
                    <button @click="showExpenseModal=false" class="flex-1 py-3 text-gray-500 font-bold hover:bg-gray-100 rounded-xl">Cancelar</button>
                    <button @click="addExpense" class="flex-1 py-3 bg-red-500 text-white rounded-xl font-bold shadow hover:bg-red-600">Salvar</button>
                </div>
            </div>
        </div>

    </div>

    <script src="https://unpkg.com/vue@3/dist/vue.global.js"></script>
    <script type="module" src="js/app.js?v=200.0"></script>
</body>
</html>