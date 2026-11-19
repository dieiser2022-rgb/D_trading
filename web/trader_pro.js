'use strict';
/* D_Trading • Template Trader Pro. Extensão visual, sem alterar o núcleo de dados/sincronização. */
(function traderProExtension() {
  const originalApplyPrefs = applyPrefs;
  applyPrefs = function applyPrefsWithSkin() {
    originalApplyPrefs();
    const enabled = P.skin === 'trader-pro';
    document.documentElement.dataset.skin = enabled ? 'trader-pro' : 'classic';
    const brandLabel = document.querySelector('.brand small');
    if (brandLabel) brandLabel.textContent = enabled ? 'DIÁRIO DE TRADES' : 'LOCAL + NUVEM';
    const sideText = document.querySelector('.side-bottom small');
    if (sideText) sideText.textContent = enabled ? 'TRADER PRO • LOCAL + NUVEM' : 'v1.2 • offline-first';
  };

  const originalSettings = settings;
  settings = function traderProSettings() {
    const choose = (skin, label, caption, css) => `
      <button type="button" class="theme-choice ${P.skin===skin || (!P.skin && skin==='classic')?'selected':''}"
              data-action="proSkin" data-val="${skin}" aria-pressed="${P.skin===skin || (!P.skin && skin==='classic')}">
        <span class="theme-preview ${css}"><i></i><i></i><i></i></span>
        <strong>${label}</strong><small>${caption}</small>
      </button>`;
    const gallery = `<div class="pro-theme-setting"><p class="split-label">TEMPLATES VISUAIS</p>
      <div class="theme-choice-grid">
      ${choose('classic','Clássico','Visual original do diário','preview-classic')}
      ${choose('trader-pro','Trader Pro','Preto fosco + vermelho','preview-pro')}
      </div><p class="helper">O template altera a aparência e o Feed; suas operações, prints e sincronização permanecem os mesmos.</p></div>`;
    return originalSettings().replace('<p class="split-label">TEMA</p>', gallery + '<p class="split-label">TEMA</p>');
  };

  let proPeriod = 30;
  let proFilter = 'all';
  let proSelectMode = false;
  const proSelectedIds = new Set();

  function periodTrades() {
    const trades = activeTrades();
    if (!proPeriod) return trades;
    const since = new Date();
    since.setHours(0,0,0,0);
    since.setDate(since.getDate() - proPeriod + 1);
    return trades.filter(t => (t.date || '') >= localDate(since));
  }
  function sparkPro(values) {
    if (!values || values.length < 2) return '<div class="pro-spark-empty">Sem histórico no período</div>';
    const min=Math.min(...values), max=Math.max(...values), range=Math.max(1,max-min);
    const w=180,h=46, pts=values.map((v,i)=>[(i/(values.length-1)*w).toFixed(2),(h-5-(v-min)/range*(h-10)).toFixed(2)]);
    const line=pts.map((p,i)=>`${i?'L':'M'}${p[0]} ${p[1]}`).join(' ');
    const fill=line+` L${w} ${h} L0 ${h} Z`;
    return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Curva de resultado do período">
      <defs><linearGradient id="proShade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#df2537" stop-opacity=".35"/><stop offset="1" stop-color="#df2537" stop-opacity="0"/></linearGradient></defs>
      <path d="${fill}" fill="url(#proShade)"/><path d="${line}" stroke="#e72235" stroke-width="2" fill="none" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>`;
  }
  function proKeyValue(k,v,cls='') {return `<div class="pro-key-value"><span>${k}</span><b class="${cls}">${v}</b></div>`;}
  function proSummary(m,trades) {
    const sumCapital = S.accounts.reduce((s,a)=>s+num(a.initial_capital),0);
    const currencies = new Set(S.accounts.map(a=>a.currency||'USD'));
    const growth = sumCapital > 0 && currencies.size === 1 ? `${m.net>=0?'+':''}${pct(m.net/sumCapital*100)}` : '—';
    const total = m.wins+m.losses;
    const winPie = total ? m.wins/total*100 : 0;
    return `<aside class="pro-analytics" aria-label="Resumo de desempenho">
      <section class="pro-panel pro-summary"><div class="pro-panel-title"><h3><span class="pro-ico">▥</span> Resumo da Conta</h3>
        <label class="sr-only" for="proPeriod">Período de resumo</label>
        <select id="proPeriod" aria-label="Período de análise">
          <option value="7" ${proPeriod===7?'selected':''}>Últimos 7 dias</option>
          <option value="30" ${proPeriod===30?'selected':''}>Últimos 30 dias</option>
          <option value="90" ${proPeriod===90?'selected':''}>Últimos 90 dias</option>
          <option value="0" ${proPeriod===0?'selected':''}>Todo o período</option>
        </select></div>
        <p class="pro-hint">Visão geral do desempenho</p><div class="pro-rule"></div>
        <p class="pro-hint">Resultado Líquido</p>
        <div class="pro-netrow"><strong class="${col(m.net)}">${money(m.net)}</strong><span class="pro-growth">${growth}</span></div>
        <div class="pro-spark">${sparkPro(m.equity)}</div>
        <div class="pro-quad">
          <div><span>Operações</span><strong>${m.count}</strong></div>
          <div><span>Wins</span><strong class="positive">${m.wins}</strong></div>
          <div><span>Losses</span><strong class="negative">${m.losses}</strong></div>
          <div><span>Taxa de acerto</span><strong>${pct(m.winrate)}</strong></div>
        </div>
      </section>
      <section class="pro-panel pro-outcomes"><div class="pro-panel-title"><h3><span class="pro-ico">◉</span> Desempenho por Operação</h3></div><div class="pro-rule"></div>
        <div class="pro-outcome-inner"><div class="pro-donut" style="--win-percent:${winPie}%">
          <div><strong>${pct(m.winrate)}</strong><small>Taxa de Acerto</small></div></div>
          <div class="pro-legend"><div><i class="dot-green"></i><span>Vencedoras</span><strong>${m.wins}</strong></div>
          <div><i class="dot-red"></i><span>Perdedoras</span><strong>${m.losses}</strong></div></div></div>
      </section>
      <section class="pro-panel pro-risk"><div class="pro-panel-title"><h3><span class="pro-ico">⚖</span> Risco e Retorno</h3></div><div class="pro-rule"></div>
        ${proKeyValue('R/R Médio',m.avgRR ? fnum(m.avgRR) : '—')}
        ${proKeyValue('Maior Ganho',money(m.best),col(m.best))}
        ${proKeyValue('Maior Perda',money(m.worst),col(m.worst))}
        ${proKeyValue('Drawdown Máximo',amount(m.drawdown),'negative')}
        ${proKeyValue('Expectativa (por trade)',money(m.expectancy),col(m.expectancy))}
      </section>
      <p class="pro-data-note">Dados reais registrados no diário. Valores em moedas distintas não são convertidos automaticamente.</p>
    </aside>`;
  }
  function proResult(t) {
    const net=tnet(t);
    const state=t.noTrade?'—':net>0?'Win':net<0?'Loss':'Breakeven';
    const statusClass=t.noTrade?'be':net>0?'win':net<0?'loss':'be';
    return {net,statusClass,state};
  }
  function proCard(t) {
    const r=proResult(t),imgs=Array.isArray(t.images)?t.images:[],file=imgs.length?imgSrc(imgs[0]):'';
    const checked=proSelectedIds.has(Number(t.id));
    const icon=/BTC|ETH|CRYPTO/i.test(t.asset||'')?'₿':/XAU|GOLD/i.test(t.asset||'')?'◆':/NASDAQ|USTEC|NQ|US100/i.test(t.asset||'')?'▥':'↗';
    const direction=t.direction||'—';
    const rr = Number.isFinite(+t.rr) && String(t.rr??'').trim() && num(t.rr)!==0 ? `${fnum(t.rr,2)}R` : '—';
    return `<article class="pro-trade-card ${r.statusClass}" data-action="details" data-id="${t.id}" tabindex="0" role="button" aria-label="Ver detalhes ${esc(t.asset||'operação')} ${datePt(t.date)}">
      <div class="pro-trade-head">
        <div class="pro-trade-heading">
          ${proSelectMode ? `<button class="pro-trade-pick" data-action="proPick" data-id="${t.id}" aria-label="${checked?'Desmarcar':'Selecionar'} operação" aria-pressed="${checked}">${checked?'☑':'☐'}</button>` : ''}
          <span class="pro-asset-icon">${icon}</span><strong>${esc(t.noTrade?'Não operei':t.asset||'Sem ativo')}</strong>
          <span class="pro-chip">${esc(t.strategy||'Sem estratégia')}</span>
          ${!t.noTrade?`<span class="pro-direction ${direction==='Compra'?'buy':'sell'}">${esc(direction)}</span>`:''}
        </div>
        <div class="pro-trade-result"><strong class="${t.noTrade?'':col(r.net)}">${t.noTrade?'—':money(r.net)}</strong><span class="pro-status ${r.statusClass}">${r.statusClass==='win'?'✓':r.statusClass==='loss'?'✕':'–'} ${r.state}</span></div>
      </div>
      <div class="pro-trade-meta"><span>▦ ${esc(t.date||'—')}</span><span>◷ ${esc(t.start||'—')}</span><span>${esc(t.market||'—')}</span><span class="${direction==='Compra'?'positive':direction==='Venda'?'negative':''}">${esc(direction)}</span></div>
      <div class="pro-trade-content">
        ${file ? `<button type="button" class="pro-trade-image" data-action="study" data-id="${t.id}" data-index="0" title="Abrir print no modo de estudo"><img src="${esc(file)}" loading="lazy" alt="Print do trade ${esc(t.asset||'')}"></button>` : `<div class="pro-trade-image pro-image-empty">▧<small>Sem print · adicione na operação</small></div>`}
        <div class="pro-trade-facts">
          ${proKeyValue('Estratégia',esc(t.strategy||'—'))}
          ${proKeyValue('Direção',esc(direction),direction==='Compra'?'positive':direction==='Venda'?'negative':'')}
          ${proKeyValue('Resultado',t.noTrade?'—':money(r.net),col(r.net))}
          ${proKeyValue('R/R',rr)}
          ${proKeyValue('Duração',esc(duration(t.start,t.end)))}
          <div class="pro-fact-actions"><button data-action="details" data-id="${t.id}">Detalhes</button>
            <button data-action="editTrade" data-id="${t.id}" title="Editar operação">Editar</button></div>
        </div>
      </div>
    </article>`;
  }
  function feedPro() {
    const tradeSet=periodTrades(), m=metrics(tradeSet);
    let entries=[...S.trades].filter(t=>!proPeriod||t.date >= (()=>{const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()-proPeriod+1);return localDate(d)})())
      .sort((a,b)=>((b.date||'')+(b.start||'')).localeCompare((a.date||'')+(a.start||'')));
    if (proFilter==='wins') entries=entries.filter(t=>!t.noTrade&&tnet(t)>0);
    else if (proFilter==='losses') entries=entries.filter(t=>!t.noTrade&&tnet(t)<0);
    return `<div class="pro-feed-layout">${proSummary(m,tradeSet)}
      <section class="pro-feed-main"><div class="pro-feed-header"><div><h1>Feed</h1><p>Suas operações recentes no diário de trades</p></div>
      <div class="pro-feed-controls"><div class="pro-filters">
        ${[['all','Todas'],['wins','Wins'],['losses','Losses']].map(([k,name])=>`<button type="button" class="pro-filter ${k} ${proFilter===k?'active':''}" data-action="proFilter" data-val="${k}" aria-pressed="${proFilter===k}">${name}</button>`).join('')}</div>
        <button class="pro-select-btn ${proSelectMode?'active':''}" data-action="proToggleSelect">☑ ${proSelectMode?'Cancelar seleção':'Selecionar'}</button>
      </div></div>
      ${proSelectMode?`<div class="pro-selection-bar"><span>${proSelectedIds.size} selecionada(s)</span>
        <button data-action="proSelectVisible">Selecionar visíveis</button>
        <button class="pro-delete-btn" data-action="proDeleteSelected" ${!proSelectedIds.size?'disabled':''}>♜ Excluir selecionadas</button></div>`:''}
      ${entries.length?`<div class="pro-trades">${entries.map(proCard).join('')}</div>`:
        `<div class="pro-empty"><span>▧</span><h3>Nenhuma operação ${proFilter==='wins'?'vencedora':proFilter==='losses'?'perdedora':''} neste período</h3><p>Registre trades ou altere o período para visualizar seu histórico.</p>${btn('+ Nova Operação','newTrade','primary')}</div>`}
      </section></div>`;
  }
  const originalFeed=feed;
  feed=function traderProFeed(){return P.skin==='trader-pro'?feedPro():originalFeed();};

  async function proCommand(node) {
    const action=node.dataset.action;
    switch(action){
      case 'proSkin': {
        const skin=node.dataset.val;
        P.skin=skin;
        if(skin==='trader-pro'){P.theme='dark';P.primary='#dc192b';}
        else {P.theme='light';P.primary='#635cf6';}
        await saveSettings('preferences',P);
        render();toast(skin==='trader-pro'?'Template Trader Pro ativado':'Template Clássico ativado');break;
      }
      case 'proFilter':proFilter=node.dataset.val;proSelectedIds.clear();render();break;
      case 'proToggleSelect':proSelectMode=!proSelectMode;proSelectedIds.clear();render();break;
      case 'proPick': {
        const id=Number(node.dataset.id);
        if(proSelectedIds.has(id))proSelectedIds.delete(id);else proSelectedIds.add(id);
        render();break;
      }
      case 'proSelectVisible': {
        const renderedIds=[...document.querySelectorAll('.pro-trade-card[data-id]')].map(x=>Number(x.dataset.id));
        const allSelected=renderedIds.every(id=>proSelectedIds.has(id));
        for(const id of renderedIds){if(allSelected)proSelectedIds.delete(id);else proSelectedIds.add(id)}render();break;
      }
      case 'proDeleteSelected': {
        const chosen=[...proSelectedIds];
        if(!chosen.length)return;
        if(!confirm(`Excluir permanentemente ${chosen.length} operação(ões) selecionada(s)? As exclusões também serão sincronizadas com a nuvem.`))return;
        for(const id of chosen)await api('/api/trades/delete',{id});
        proSelectedIds.clear();proSelectMode=false;
        await reload();render();toast(`${chosen.length} operação(ões) excluída(s)`);break;
      }
    }
  }
  document.addEventListener('click',e=>{
    const node=e.target.closest('[data-action]');
    if(!node)return;
    if(['proSkin','proFilter','proToggleSelect','proPick','proSelectVisible','proDeleteSelected'].includes(node.dataset.action)){
      e.preventDefault();e.stopPropagation();run(()=>proCommand(node));
    } else if(node.dataset.action==='theme' && P.skin==='trader-pro' && node.dataset.val==='light') {
      e.preventDefault();e.stopPropagation();run(async()=>{P.skin='classic';P.theme='light';await saveSettings('preferences',P);render()});
    }
  },true);
  document.addEventListener('change',e=>{
    if(e.target.id==='proPeriod') {proPeriod=Number(e.target.value);proSelectedIds.clear();render();}
  });
  document.addEventListener('keydown',e=>{
    const card=e.target.closest('.pro-trade-card[role="button"]');
    if(card && (e.key==='Enter'||e.key===' ') && e.target===card){e.preventDefault();window.currentTradeId=Number(card.dataset.id);nav('details');}
  });
})();
