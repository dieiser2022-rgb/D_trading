# D_Trading v1.1 — sincronização Casa ↔ Escritório

**O diário continua instalado e funcionando localmente em ambos os computadores.** Ao entrar na mesma conta Supabase, compartilha os registros pela internet. Não é necessário instalar Supabase no Windows nem instalar bibliotecas Python extras.

## 1. Proteja os dados atuais (IMPORTANTE)

Em **cada computador**, antes de atualizar:

1. Abra a versão antiga em **Configurações > Fazer backup completo**, baixe o ZIP e guarde cópia fora da pasta do diário.
2. Feche a janela preta que executa o D_Trading.
3. Extraia a versão 1.1 em `Documentos\D_Trading_Local` **sem apagar a pasta `data` da versão antiga**. O melhor é copiar o conteúdo novo para a pasta antiga e substituir os arquivos do programa quando solicitado, mas **não excluir a pasta `data`**.
4. Confirme que o arquivo `data\diario.db` e a pasta `data\uploads` ainda estão ali. As tabelas de sincronização serão adicionadas automaticamente na primeira inicialização.

Se os dois computadores já possuírem históricos diferentes, faça backup dos **dois** antes de conectar. O sistema une registros por identificador e apresenta conflitos em vez de sobrescrever alterações do mesmo registro. Em bases antigas copiadas, alguns registros iguais recebem o mesmo identificador para ajudar na migração; verifique os números e a contagem de operações após sincronizar.

## 2. Criar o projeto Supabase (uma vez)

1. Entre em **https://supabase.com/dashboard** e crie um novo projeto Supabase.
2. Abra **SQL Editor > New query**.
3. Abra o arquivo `SETUP_SUPABASE.sql` incluído nesta pasta, copie **todo o conteúdo** e execute no SQL Editor. Ele cria uma tabela protegida por RLS, uma função para atualização sem sobrescritas silenciosas e um bucket privado para prints/livros.
4. Abra **Project Settings > API** (em algumas versões, **Connect** ou **Settings > API Keys**). Copie:
   - **Project URL** (`https://...supabase.co`);
   - **Publishable API key** (começa com `sb_publishable_`). Em projetos mais antigos a chave pública `anon` também pode funcionar.
5. **NUNCA use** `sb_secret_`, `service_role`, senha do banco, JWT de serviço ou qualquer credencial administrativa no aplicativo.
6. Para cadastrar e-mails, use a aba **Authentication** e mantenha o método **Email** habilitado. Se houver confirmação por e-mail, confirme a conta antes de entrar.

Os preços, limites e políticas do serviço podem mudar. Consulte o painel do próprio Supabase para saber o plano vigente.

## 3. Conectar o primeiro computador (recomendado: escritório)

1. Execute `INICIAR_DIARIO.bat`.
2. Abra **Configurações > Sincronização Casa ↔ Escritório**.
3. Cole a **Project URL** e a **publishable key**, preencha **seu e-mail e uma senha**.
4. Se ainda não tem usuário nesse projeto, clique em **Criar conta com este e-mail**. Confira o e-mail caso seja pedida confirmação.
5. Clique em **Conectar e sincronizar**.
6. Aguarde a seção mostrar pendências `0` (pode demorar mais se tiver PDFs grandes). Use **Sincronizar agora** se quiser solicitar uma rodada manual.

## 4. Conectar o segundo computador (casa)

Repita o passo 3 com **exatamente o mesmo projeto, e-mail e senha**. Os registros que já estavam na nuvem serão baixados para o SQLite local; os registros novos que você fez em casa serão enviados. O capital inicial das contas, operações, estratégias, prints, livros, páginas salvas, plano, preferências, perfil e sessões do cronômetro são incluídos.

## 5. Se a internet cair

- Continue usando o diário normalmente; as alterações ficam em `data\diario.db` e `data\uploads`.
- O aplicativo tenta sincronizar automaticamente **a cada 20 segundos** enquanto estiver aberto e conectado à conta (em vez de atualizar a cada clique).
- Com o computador offline ou o Supabase indisponível, os dados continuam neste PC. A próxima tentativa bem-sucedida envia os itens pendentes.
- Se aparecer **Conflitos**, abra **Configurações > Carregar conflitos** e escolha para cada item **Usar versão da nuvem** ou **Manter minha versão local**. Essa escolha substitui apenas o registro indicado.
- Antes de operar simultaneamente nos dois computadores, confira as pendências. Nunca deixe uma restauração de backup substituir um banco já vinculado à nuvem: por segurança a restauração direta está bloqueada quando há conta vinculada.

## 6. Como os seus dados são protegidos

- Os dois computadores conservam seu banco SQLite e uma cópia local dos anexos.
- O serviço online armazena **cópias das informações**, com tráfego **HTTPS** e políticas de controle de acesso por usuário (**RLS**); o bucket de arquivos é privado. **Não se trata de criptografia ponta a ponta**: o serviço de nuvem que você administra hospeda os dados.
- O aplicativo usa apenas a chave **pública** e tokens do usuário. **Não** precisa de chave administrativa.
- No Windows, o token de renovação da sessão é protegido pela API do Windows (**DPAPI**) para o usuário do sistema. A senha não é gravada pelo D_Trading.
- Os arquivos `data\cloud_config.json` e `data\.cloud_session` são próprios da instalação; não copie a sessão do escritório para outro usuário/PC. Conecte manualmente em casa.
- O aplicativo **não permite vincular uma base local a outro usuário da nuvem** depois de vincular o primeiro, para evitar misturar históricos pessoais. Se precisar migrar para outro projeto, crie uma nova instalação e use backups planejados.
- Excluir um trade envia um registro de exclusão para os outros computadores; anexos já enviados à nuvem não são excluídos automaticamente na v1.1 (por segurança e possibilidade de recuperação). Para apagamento definitivo remoto, é necessário limpeza manual/funcionalidade futura.
- Faça **backups regulares** fora das duas máquinas. Sincronização não substitui backup: exclusões e alterações são replicadas.

## 7. Teste rápido para confirmar

1. No escritório: cadastre a conta `Teste de Sincronização` com capital inicial 1.000 e uma operação de teste; faça um print e anexe.
2. Aguarde **Pendências locais: 0**.
3. Em casa: entre na mesma conta Supabase; confirme que a conta, a operação, o resultado e o print apareceram.
4. Mude uma observação na operação em casa e confira no escritório após a próxima sincronização.
5. Exclua a operação de teste e confirme nos dois computadores. Depois pode apagar a conta de teste.

## Problemas comuns

- **Não é possível conectar:** confirme internet, URL, chave pública, e-mail verificado e senha.
- **Erro `relation dtrading_sync does not exist` ou `dtrading_write not found`:** execute `SETUP_SUPABASE.sql` no SQL Editor do **mesmo projeto** usado no aplicativo.
- **Erro 403 / Row Level Security / Storage:** verifique se o SQL foi executado por completo e se o usuário está autenticado. Não desative RLS como atalho.
- **Pendências não diminuem:** clique em Sincronizar agora, veja a mensagem de erro na seção; em caso de conflito, resolva-o.
- **A outra máquina não atualiza:** mantenha o programa aberto, veja o status de conexão e confirme que ambos usam a mesma conta do mesmo projeto.
- **Sessão não persiste após fechar no Windows:** confira se está abrindo o programa sob o mesmo usuário do Windows e se a pasta `data` permite escrita.

## Limitações e transparência

Este pacote foi testado com um **servidor Supabase simulado**, duas bases SQLite locais, transferência simulada de anexos e testes HTTP locais. **A conexão com um projeto Supabase real não pôde ser validada neste ambiente porque ainda não foram fornecidos um projeto e credenciais de teste.** Depois da sua configuração, valide o fluxo completo nos dois PCs antes de registrar exclusivamente trades importantes nessa versão.