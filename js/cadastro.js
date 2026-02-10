const { createApp, ref, reactive } = Vue;

// Importar apenas o necessário do Firebase para o cadastro
import { 
    auth, db, 
    createUserWithEmailAndPassword, updateProfile, setDoc, doc 
} from './firebase.js';

createApp({
    setup() {
        const loading = ref(false);
        const form = reactive({
            name: '',
            email: '',
            password: ''
        });

        const handleRegister = async () => {
            if (!form.name || !form.email || !form.password) {
                return Swal.fire('Atenção', 'Preencha todos os campos.', 'warning');
            }

            loading.value = true;

            try {
                // 1. Criar usuário no Firebase Auth
                const userCredential = await createUserWithEmailAndPassword(auth, form.email, form.password);
                const user = userCredential.user;

                // 2. Atualizar o Nome de Exibição (Profile)
                await updateProfile(user, {
                    displayName: form.name
                });

                // 3. Criar documento inicial no Firestore (Coleção users)
                // Isso garante que o usuário já tenha o objeto de configuração pronto
                await setDoc(doc(db, "users", user.uid), {
                    email: form.email,
                    companyConfig: {
                        fantasia: form.name,
                        logo: '',
                        cnpj: '',
                        email: form.email, // Já salva o email no cadastro da empresa
                        phone: '',
                        rua: '',
                        bairro: '',
                        cidade: '',
                        estado: ''
                    },
                    createdAt: new Date().toISOString()
                });

                // 4. Sucesso e Redirecionamento
                await Swal.fire({
                    title: 'Sucesso!',
                    text: 'Conta criada com sucesso. Redirecionando...',
                    icon: 'success',
                    timer: 2000,
                    showConfirmButton: false
                });

                // Redireciona para o painel principal
                window.location.href = "index.html";

            } catch (error) {
                console.error("Erro no cadastro:", error);
                let msg = 'Ocorreu um erro ao criar a conta.';
                if (error.code === 'auth/email-already-in-use') msg = 'Este e-mail já está em uso.';
                if (error.code === 'auth/weak-password') msg = 'A senha deve ter pelo menos 6 caracteres.';
                
                Swal.fire('Erro', msg, 'error');
            } finally {
                loading.value = false;
            }
        };

        return {
            form,
            loading,
            handleRegister
        };
    }
}).mount('#register-app');
