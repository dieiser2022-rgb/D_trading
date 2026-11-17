# D_Trading Local — Diário de Trade para Windows

**Versão 1.1 — sincronização online opcional.** Os dados continuam salvos neste computador e o diário funciona sem internet. Com uma conta Supabase configurada, também sincroniza casa e escritório. **Leia `SINCRONIZACAO_CASA_ESCRITORIO.md` para configurar a nuvem.**

## Como abrir (Windows 10/11)

1. **Extraia o ZIP** para uma pasta fixa, como `Documentos\D_Trading_Local`. **Não** rode dentro do ZIP.
2. É necessário ter **Python 3.9 ou superior** instalado. Consulte `https://www.python.org/downloads/windows/` se não tiver. Durante a instalação, marque "Add Python to PATH".
3. Dê dois cliques em **`INICIAR_DIARIO.bat`**. Uma janela preta ficará aberta e o navegador abrirá automaticamente em `http://127.0.0.1:8765` (se a porta estiver ocupada, ele escolherá a seguinte e mostrará o endereço).
4. **Não feche a janela preta enquanto estiver usando o aplicativo**. Para encerrar, feche-a ou pressione `Ctrl+C` nela.
5. Opcional: dê dois cliques em **`CRIAR_ATALHO_NA_AREA_DE_TRABALHO.bat`** para criar um atalho no desktop.

Não é necessário instalar Flask, Node, banco de dados separado ou usar Base44.

## Comece por aqui

1. Abra **Nova Operação > Básico > + Nova Conta**, informe nome, tipo e **capital inicial**.
2. Em **Estratégia > + Nova**, cadastre a estratégia para reutilizá-la.
3. Preencha o trade. Em **Resultado**, digite o P&L bruto, custos e, se quiser, o risco financeiro. **Registrar Operação** grava todas as abas.
4. Para anexar prints, use **Análise > Anexar** ou cole do clipboard com **Ctrl+V**. O Feed mostra os prints; clique neles para abrir o **Modo de Estudo**, desenhar e salvar as marcações.
5. No **Calendário**, clique em um dia para ver operações resumidas e abrir o registro completo.
6. No canto superior direito, use o cronômetro de tempo de análise. **Iniciar ▶ / Pausar Ⅱ / Zerar ↶**. Ao pausar ou zerar, o tempo é salvo nas métricas.
7. No **Dashboard**, clique em **Relatório**, informe a data inicial/final e depois **Imprimir / Salvar em PDF**. Na janela de impressão do navegador, escolha **Salvar como PDF**.
8. Em **Configurações**, ajuste tema, cores, colunas e cards. Você pode arrastar cards na lista para mudar a ordem e esconder os que não quer ver.
9. Em **Livros**, importe seus próprios PDFs e salve a página atual para voltar a ler depois.

## Localização dos dados e backup

- Arquivo principal: `data\diario.db` (SQLite).
- Prints, avatares e PDFs: `data\uploads\`.
- **Configurações > Fazer backup completo**: gera ZIP contendo dados e anexos. Guarde uma cópia em um pen drive ou outra pasta.
- **Configurações > Restaurar backup**: em instalações **sem vinculação à nuvem**, restaura um backup anterior, substituindo os registros atuais. Antes da restauração é feita uma cópia de segurança do banco na pasta `data`. Em instalações já vinculadas à nuvem, a restauração direta está bloqueada para evitar sobrescrever histórico sincronizado.
- **Não apague a pasta `data`** quando copiar uma nova versão do aplicativo, pois nela estão seus registros.
- Se for migrar manualmente de computador, copie a pasta `data` completa, com o programa fechado.

## Informações sobre cálculos

- **P&L líquido** = resultado bruto informado − custos/taxas.
- **Win Rate** = trades lucrativos / total de trades (incluindo break-even no denominador).
- **Profit Factor** = soma dos trades lucrativos / valor absoluto da soma dos trades perdedores.
- **Expectativa** = P&L líquido total / total de trades.
- **Drawdown máximo** = maior queda do resultado acumulado a partir de um pico anterior (em valor monetário).
- **Consistência** = porcentagem dos dias com resultado positivo, entre os dias com trades.
- **R:R realizado** = resultado líquido / risco financeiro informado; exige informar o risco na operação.
- **Saldo atual de cada conta** = capital inicial + P&L líquido dos seus trades.
- **Resultado percentual de uma operação** = resultado líquido / capital inicial da conta.

**Atenção às moedas:** as contas podem usar USD, BRL ou EUR, mas o Dashboard totaliza os valores sem conversão cambial. Para estatísticas financeiras consistentes, não misture trades em moedas diferentes na mesma análise. Uma versão futura poderá adicionar filtros e conversão cambial.

## O que já funciona na v1.1

- Feed com detalhes, edição, exclusão e prints; editor de estudo com caneta, linha, seta, caixa, texto, borracha, desfazer e salvar imagem anotada.
- Cadastro de operações em 7 abas: Análise, Básico, Resultado, Psicologia, Planejamento, Contexto e Revisão; dias sem operações.
- Contas locais com capital inicial, estratégias salvas, histórico e dados SQLite.
- Dashboard com indicadores, curva acumulada, distribuição Win/Loss, resultados por ativo/estratégia/dia/horário, métricas e contas.
- Calendário mensal com clique e detalhes do dia.
- Cronômetro de estudo, tela cheia, plano de trade, biblioteca de PDFs, relatório imprimível, temas e backup.

## Limitações desta primeira versão

- **Ainda não é um EXE independente:** usa Python instalado e abre no navegador local. A sincronização é opcional, por projeto Supabase próprio.
- A sincronização Supabase é opcional, requer projeto, autenticação e internet para enviar ou receber dados; não foi possível realizar um teste com uma conta real neste ambiente.
- Os PDFs são lidos pelo visualizador nativo do navegador. A página salva é marcada manualmente no diário.
- O modo de estudo salva a imagem marcada sobre o print da operação. Para preservar a imagem original, você pode anexar uma cópia extra antes de desenhar.
- O cronômetro contabiliza o intervalo até pausar mesmo se o computador entrar em suspensão; o controle é manual.
- Não há integração automática com MT5, NinjaTrader ou corretoras nesta versão; o registro é manual.
- A versão foi testada em ambiente local com requisições e interface simulada. **O teste final no seu Windows ainda é necessário.**

## Resolução rápida de problemas

**Não abre:** abra o Prompt de Comando na pasta e execute `py -3 app.py`. Se aparecer "py não reconhecido", tente `python app.py`. Veja a mensagem de erro.

**O navegador não abre:** mantenha a janela preta aberta e abra manualmente o endereço `http://127.0.0.1:8765`.

**O PDF não abre dentro do aplicativo:** experimente Chrome/Edge atualizados, pois o leitor usa o recurso nativo de PDFs do navegador.

**Porta ocupada:** o diário seleciona uma porta próxima e informa o endereço na janela preta.