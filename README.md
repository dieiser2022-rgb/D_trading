# D_Trading — Diário de Trade (v1.1)

Diário de trade para Windows, com **funcionamento local/offline** e **sincronização opcional pela internet via Supabase**.

## Iniciar no Windows
1. Instale Python 3.9+ (com Python no PATH).
2. Baixe o repositório com **Code > Download ZIP** e extraia a pasta.
3. Execute `INICIAR_DIARIO.bat`.
4. Acesse o endereço local indicado na janela (normalmente `http://127.0.0.1:8765`).

Não é necessário instalar frameworks Python externos.

## Sincronizar casa e escritório
Abra `SINCRONIZACAO_CASA_ESCRITORIO.md` e siga as instruções do arquivo `SETUP_SUPABASE.sql`. O app continua operando offline e sincroniza ao restabelecer a conexão quando estiver configurado.

## Seus dados
**Operações, banco SQLite, PDFs e prints são privados e ficam em `data/`, que deve permanecer fora do GitHub.** Faça backup pelo aplicativo antes de qualquer atualização. Nunca publique senhas, tokens, arquivos `.env`, backups ou pastas `data`.

## Importante
GitHub **hospeda e versiona este código**; por si só, não sincroniza operações. Esta versão não funciona diretamente em GitHub Pages, pois o programa usa um servidor Python local. A autenticação e a sincronização são implementadas via Supabase.

Consulte `LEIA_PRIMEIRO.md` para todas as funcionalidades e limitações.