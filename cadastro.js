<!DOCTYPE html>
<html lang="pt-BR" class="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Criar Conta - PartyPlanner Pro</title>
    
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>

    <script>
        tailwind.config = {
            darkMode: 'class',
            theme: {
                extend: {
                    fontFamily: { sans: ['"Plus Jakarta Sans"', 'sans-serif'] },
                    colors: { brand: { 500: '#6366F1', 600: '#4F46E5' } }
                }
            }
        }
    </script>
    <style>
        [v-cloak] { display: none; }
        /* Inputs Estilizados */
        .input-group { @apply relative w-full; }
        .input-icon { @apply absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 z-10 pointer-events-none; }
        .input-field { @apply w-full h-14 pl-12 pr-4 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-2xl text-sm font-medium outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all text-slate-900 dark:text-white placeholder-slate-400; }
        .btn-primary { @apply h-14 w-full bg-brand-600 hover:bg-brand-500 text-white font-bold rounded-2xl shadow-lg shadow-brand-500/20 transition active:scale-95 flex items-center justify-center gap-2; }
    </style>
</head>
<body class="bg-slate-50 dark:bg-[#0F172A] text-slate-800 dark:text-slate-200 font-sans h-screen flex items-center justify-center p-6 overflow-hidden">

    <div id="register-app" v-cloak class="w-full max-w-sm">
        
        <div class="bg-white dark:bg-[#1E293B] p-8 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700 animate-fade-in-up">
            <div class="text-center mb-8">
                <div class="w-16 h-16 bg-brand-600 rounded-2xl mx-auto flex items-center justify-center shadow-lg mb-4 text-white text-2xl">
                    <i class="fa-solid fa-wand-magic-sparkles"></i>
                </div>
                <h1 class="text-2xl font-bold text-slate-900 dark:text-white">Criar Conta</h1>
                <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">Comece a organizar seus eventos</p>
            </div>

            <form @submit.prevent="handleRegister" class="space-y-4">
                <div class="input-group">
                    <i class="fa-solid fa-building input-icon"></i>
                    <input v-model="form.name" type="text" placeholder="Nome da Empresa" class="input-field" required>
                </div>
                <div class="input-group">
                    <i class="fa-solid fa-envelope input-icon"></i>
                    <input v-model="form.email" type="email" placeholder="E-mail" class="input-field" required>
                </div>
                <div class="input-group">
                    <i class="fa-solid fa-lock input-icon"></i>
                    <input v-model="form.password" type="password" placeholder="Senha" class="input-field" required>
                </div>
                
                <button type="submit" :disabled="loading" class="btn-primary mt-6">
                    <i v-if="loading" class="fa-solid fa-circle-notch fa-spin"></i>
                    {{ loading ? 'Criando...' : 'Cadastrar e Entrar' }}
                </button>
            </form>
            
            <div class="mt-8 text-center border-t border-slate-200 dark:border-slate-700 pt-6">
                <a href="index.html" class="text-sm font-bold text-brand-600 hover:text-brand-500 transition">
                    <i class="fa-solid fa-arrow-left mr-1"></i> Já tenho conta? Fazer Login
                </a>
            </div>
        </div>

    </div>

    <script src="https://unpkg.com/vue@3/dist/vue.global.js"></script>
    <script type="module" src="js/cadastro.js"></script>
</body>
</html>
