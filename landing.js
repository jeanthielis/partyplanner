const { createApp, ref } = Vue;

createApp({
    setup() {
        const features = ref([
            {
                icon: 'fa-solid fa-file-signature',
                title: 'Contratos Digitais',
                desc: 'Envie contratos para seus clientes assinarem direto pelo celular. Seguro, rápido e profissional.'
            },
            {
                icon: 'fa-solid fa-money-bill-trend-up',
                title: 'Controle Financeiro',
                desc: 'Saiba exatamente quanto entra e quanto sai. Gestão de entradas, despesas e lucro real.'
            },
            {
                icon: 'fa-solid fa-calendar-circle-check',
                title: 'Agenda Inteligente',
                desc: 'Nunca mais perca um evento. Visualize sua agenda em lista ou calendário de forma intuitiva.'
            }
        ]);

        return { features };
    }
}).mount('#landingApp');
