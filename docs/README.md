# D_Trading Mobile para iPhone — versão piloto 0.1

Esta pasta (`docs/`) contém uma interface PWA estática que acessa **o mesmo Supabase da versão Windows**.

## Publicar no GitHub Pages

1. No repositório `D_trading`, abra **Settings → Pages**.
2. Em **Build and deployment**, escolha **Deploy from a branch**.
3. Selecione a branch `main`, a pasta `/docs`, e clique em **Save**.
4. Abra o endereço exibido **pelo próprio GitHub Pages** após o deployment. O endereço típico é `https://USUARIO.github.io/REPOSITORIO/`, mas confirme o endereço gerado antes de usar.
5. No iPhone, abra esse endereço no **Safari**, toque em **Compartilhar → Adicionar à Tela de Início** e escolha **Abrir como App da Web** se a opção aparecer.
6. Entre no aplicativo usando a **mesma URL de projeto Supabase**, a **mesma chave pública `sb_publishable_...`** e o mesmo e-mail/senha da conta já usada no Windows. A senha do banco e a chave `sb_secret_` nunca devem ser utilizadas.

O site estático é público no GitHub Pages: **não inclua dados, tokens, chaves secretas ou arquivos de backup no repositório**. As operações são buscadas do Supabase com autenticação e RLS. Configuração e sessão são armazenadas apenas no navegador do aparelho.

## Funcionalidades do piloto

- Consultar Feed, detalhes das operações e Dashboard com dados reais.
- Buscar por ativo ou estratégia e filtrar Wins/Losses.
- Registrar operações simples vinculadas a contas já cadastradas no Windows; salvar opcionalmente um print com internet.
- Ver os prints privados vinculados às operações quando online.
- Consultar os registros previamente carregados offline; registrar operações **sem print** offline em uma fila local (IndexedDB).
- Enviar a fila ao reabrir o app com internet e atualizar os dados manualmente.
- Usar uma interface adaptada à tela do iPhone e instalá-la na tela de início.

**Limitações atuais:** a versão mobile ainda não possui todos os campos da versão Windows, editor de prints, gestão de livros nem exclusão/edição de operações. Imagens não são armazenadas offline. O Safari no iPhone não garante sincronização em segundo plano; abra o app com conexão e verifique se as pendências chegaram a zero. Armazenamento offline do navegador também pode ser removido pelo sistema: sincronização não substitui backups no Windows.

## Teste seguro

1. Faça backup da versão Windows antes de testar qualquer escrita.
2. Faça o primeiro login no iPhone e confirme que uma conta e um trade do Windows aparecem no Feed.
3. Cadastre uma operação **de teste**, sem print, e sincronize.
4. No computador, abra o D_Trading v1.1+ e confirme a operação após sincronizar.
5. Apague a operação de teste usando o Windows, não edite diretamente a tabela no Supabase.

A versão foi validada com verificação de sintaxe e compatibilidade com o esquema remoto do Windows. **Ainda precisa ser testada com o Supabase real e Safari em um iPhone**, portanto não registre trades exclusivamente no celular antes de concluir o teste nos dois sentidos.