# D_Trading v1.3 — TradeClub Verde

Diário de trade para Windows com banco local SQLite, funcionamento offline e sincronização opcional via Supabase.

## Três temas selecionáveis

Em **Configurações → Aparência → Templates Visuais**:

- **Clássico** — tema original.
- **Trader Pro** — preto fosco e vermelho.
- **TradeClub Verde** — preto fosco e verde neon, Feed com cards grandes, filtros e painel lateral de desempenho.

Todos os temas utilizam os **mesmos registros reais**. A escolha é salva nas preferências do diário.

### Feed verde
- Busca por ativo, estratégia e anotações (`Ctrl+K`).
- Filtros Todas, Wins e Losses e período (7, 30, 90 dias, todos).
- Cards com ativo, estratégia, direção, data, horário, print e resultado; clique no card para detalhes e no print para o Modo de Estudo.
- Painéis de performance, operações recentes e estratégias ordenadas por resultado.
- Seleção múltipla e exclusão com confirmação.
- Sem feeds sociais, rankings de outros membros ou preços ao vivo fictícios. Dados exibidos provêm do seu diário.

## Atualização sem perder as operações
1. Faça um **backup completo** no D_Trading atual.
2. Feche o aplicativo e a janela do Python.
3. Se já usa a v1.2, copie **somente** `web/index.html`, `web/tradeclub_green.js`, `web/tradeclub_green.css` desta versão para a pasta `web` da instalação anterior.
4. Se usa uma versão mais antiga, copie os arquivos do programa sem excluir nem substituir a pasta `data/`. Antes de atualizar, consulte `LEIA_PRIMEIRO.md`.
5. Reabra `INICIAR_DIARIO.bat` e use `Ctrl+F5` no navegador.

**Nunca publique** `data/`, bancos SQLite, fotos de trades, PDFs ou credenciais no repositório GitHub. O Supabase sincroniza os dados, mas não atualiza o código do aplicativo: instale o tema em cada computador.

### Observação sobre valores
O resumo exibe valores financeiros gravados no diário. Contas em moedas diferentes não são convertidas automaticamente; considere isso ao comparar resultados totais.