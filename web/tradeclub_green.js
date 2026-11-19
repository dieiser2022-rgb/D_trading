'use strict';
/* D_Trading • TradeClub Verde v1.3. Extensão opcional: sem dados fictícios, sem APIs externas. */
(function tradeclubGreen() {
  const themeId='tradeclub-green';
  const oldApply=applyPrefs;
  applyPrefs=function applyTradeclubGreen(){
    oldApply();
    if(P.skin!==themeId)return;
    document.documentElement.dataset.skin=themeId;
    document.documentElement.setAttribute('data-theme','dark');
    document.documentElement.style.setProperty('--primary','#16da69');
    const label=document.querySelector('.brand small');
    if(label)label.textContent='DIÁRIO DE TRADES';
    const footer=document.querySelector('.side-bottom small');
    if(footer)footer.textContent='TRADECLUB VERDE • LOCAL + NUVEM';
    const bar=document.querySelector('.topbar');
    if(bar&&!bar.querySelector('#clubSearchWrap')){
      const wrap=document.createElement('label');
      wrap.id='clubSearchWrap';wrap.className='club-search-wrap';
      wrap.innerHTML='<span aria-hidden="true">⌕</span><input id="clubSearch" type="search" placeholder="Buscar ativo, estratégia ou anotação..." aria-label="Buscar operações no Feed"><kbd>Ctrl K</kbd>';
      bar.insertBefore(wrap,bar.querySelector('.toolbar'));
      wrap.querySelector('input').value=clubSearch;
    }
  };

  const oldSettings=settings;
  settings=function settingsWithClub(){
    const html=oldSettings();
    const tile=`<button type="button" class="theme-choice ${P.skin===themeId?'selected':''}"
      data-action="clubSkin" data-val="${themeId}" aria-pressed="${P.skin===themeId}">
      <span class="theme-preview preview-club"><i></i><i></i><i></i></span>
      <strong>TradeClub Verde</strong><small>Preto, verde neon e Feed com painéis</small></button>`;
    return html.replace(/(<\/div><p class="helper">O template altera a aparência e o Feed)/,tile+'$1');
  };

  let clubSearch='';
  let clubPeriod='30';
  let clubOutcome='all';
  let clubSelect=false;
  const clubSelected=new Set();
  const today=()=>localDate(new Date());
  const cutoff=days=>{const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()-days+1);return localDate(d)};
  const allClubTrades=()=>[...S.trades].filter(t=>!t.noTrade);
  function periodList(){
    let list=allClubTrades();
    if(clubPeriod!=='all')list=list.filter(t=>(t.date||'')>=cutoff(Number(clubPeriod)));
    return list.sort((a,b)=>((b.date||'')+' '+(b.start||'')).localeCompare((a.date||'')+' '+(a.start||'')));
  }
  const pctResult=(a,b)=>b>0?`${a>=0?'+':''}${fnum(a/b*100)}%`:'—';
  function equitySvg(trades){
    if(trades.length<2)return '<span class="club-spark-placeholder">Histórico insuficiente</span>';
    let bal=0;const vals=[0];for(const t of [...trades].reverse()){bal+=tnet(t);vals.push(bal)}
    const lo=Math.min(...vals),hi=Math.max(...vals),spread=Math.max(1,hi-lo),w=128,h=41;
    const coords=vals.map((v,i)=>[i/(vals.length-1)*w,h-5-(v-lo)/spread*(h-10)]);
    const d=coords.map((p,i)=>`${i?'L':'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
    return `<svg class="club-spark-svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-label="Curva de capital do período" role="img"><path d="${d} L${w} ${h} L0 ${h}Z" fill="#13dd6538"/><path d="${d}" stroke="#17ed6d" stroke-width="2.3" fill="none" vector-effect="non-scaling-stroke"/></svg>`;
  }
  function clubPill(ok){return `<span class="club-big-status ${ok>0?'win':ok<0?'loss':'even'}">${ok>0?'🏆 WIN':ok<0?'LOSS':'BREAKEVEN'}</span>`}
  function clubAssetMark(asset){
    const a=(asset||'').toUpperCase();
    if(/XAU|GOLD/.test(a))return '<span class="club-mark gold">◆</span>';
    if(/BTC|ETH|CRYPTO/.test(a))return '<span class="club-mark btc">₿</span>';
    if(/EUR|GBP|USDJPY|FOREX/.test(a))return '<span class="club-mark forex">€</span>';
    if(/NQ|NASDAQ|USTEC|US100|US30|ES|SP500/.test(a))return '<span class="club-mark index">▥</span>';
    return '<span class="club-mark index">↗</span>';
  }
  function clubCard(t){
    const v=tnet(t),good=v>0,bad=v<0,images=Array.isArray(t.images)?t.images:[];
    const src=images.length?imgSrc(images[0]):'';
    const acct=S.accounts.find(a=>String(a.id)===String(t.accountId));
    const capital=acct&&num(acct.initial_capital)>0?num(acct.initial_capital):0;
    const cur=t.currency||acct?.currency||'USD';
    const growth=pctResult(v,capital);
    const checked=clubSelected.has(Number(t.id));
    const tradeLabel=esc(t.asset||'Sem ativo');
    const direction=t.direction||'—';
    const dClass=direction==='Compra'?'buy':direction==='Venda'?'sell':'flat';
    return `<article class="club-trade-card ${good?'profit':bad?'loss':'even'}" data-action="details" data-id="${t.id}" tabindex="0" role="button" aria-label="Ver detalhes ${tradeLabel}">
      <div class="club-trade-intro">
        <div class="club-trade-asset">${clubSelect?`<button class="club-pick" data-action="clubPick" data-id="${t.id}" aria-pressed="${checked}" aria-label="${checked?'Desmarcar':'Selecionar'} operação">${checked?'☑':'☐'}</button>`:''}${clubAssetMark(t.asset)}<div><b>${tradeLabel}</b><small title="${esc(t.strategy||'')}">${esc(t.strategy||'Sem estratégia')}</small></div></div>
        ${clubPill(v)}
        <div class="club-trade-metadata"><span>▦ ${esc(t.date||'—')}</span><span>◷ ${esc(t.start||'—')}</span></div>
        <div class="club-trade-metadata"><span class="club-tag">${esc(t.market||'Mercado não informado')}</span><span class="club-tag ${dClass}">${esc(direction)}</span></div>
      </div>
      ${src?`<button class="club-trade-image" data-action="study" data-id="${t.id}" data-index="0" title="Abrir print no Modo de Estudo"><img src="${esc(src)}" alt="Print da operação ${tradeLabel}" loading="lazy"></button>`:`<div class="club-trade-image club-no-print"><span>▧</span><small>Sem print anexado</small></div>`}
      <div class="club-trade-finish"><b class="${col(v)}">${money(v,cur)}</b><span class="club-growth-tag">${growth}</span><div class="club-mini-spark">${equitySvg([t])}</div><button data-action="details" data-id="${t.id}" class="club-details">Ver detalhes</button></div>
    </article>`;
  }
  function groupStats(items, keyName){
    const r=grouped(items,t=>String(t[keyName]||'Sem '+(keyName==='strategy'?'estratégia':'ativo')));
    return r;
  }
  function clubSidebar(trades){
    const m=metrics([...trades].reverse());
    const last7=allClubTrades().filter(t=>(t.date||'')>=cutoff(7));
    const week=metrics(last7);
    const assets=groupStats(trades,'asset');
    const strategies=groupStats(trades,'strategy');
    const sortedRecent=[...allClubTrades()].sort((a,b)=>((b.date||'')+(b.start||'')).localeCompare((a.date||'')+(a.start||''))).slice(0,4);
    const best=strategies.slice(0,4);
    return `<aside class="club-side-panels" aria-label="Resumo do seu desempenho">
      <section class="club-panel club-perf-panel"><div class="club-panel-title"><b>◉ Meu Desempenho</b><span>↗</span></div><p>Suas operações • Dados do diário</p><div class="club-perf-stats"><div><small>Taxa de acerto</small><strong>${pct(m.winrate)}</strong></div><div><small>P&amp;L do período</small><strong class="${col(m.net)}">${money(m.net)}</strong></div></div><p class="club-small-note">${m.count} operações no período selecionado</p></section>
      <section class="club-panel"><div class="club-panel-title"><b>◷ Operações recentes</b><small>Seu histórico</small></div>
        ${sortedRecent.length?sortedRecent.map(t=>`<button class="club-activity" data-action="details" data-id="${t.id}"><span class="club-activity-icon">${clubAssetMark(t.asset)}</span><span><b>${esc(t.asset||'Sem ativo')}</b><small>${esc(t.strategy||'Sem estratégia')} · ${datePt(t.date)}</small></span><strong class="${col(tnet(t))}">${money(tnet(t))}</strong></button>`).join(''):'<div class="club-empty-mini">Nenhuma operação registrada</div>'}
      </section>
      <section class="club-panel"><div class="club-panel-title"><b>🏆 Estratégias do período</b><small>Por resultado</small></div>
        ${best.length?best.map((x,i)=>`<div class="club-rank"><span class="club-rank-no">${i+1}</span><span title="${esc(x.key)}">${esc(x.key)}</span><b class="${col(x.value)}">${money(x.value)}</b></div>`).join(''):'<div class="club-empty-mini">Cadastre operações com estratégias</div>'}
        <div class="club-separate"></div><div class="club-week-net"><span>Resultado últimos 7 dias</span><b class="${col(week.net)}">${money(week.net)}</b></div>
        <button class="club-full-stats" data-page="dashboard">↗ Ver Dashboard completo</button>
      </section>
      <p class="club-small-note">Não é um feed social nem contém cotações em tempo real. Os painéis exibem apenas seus registros. Contas em moedas diferentes não são convertidas automaticamente.</p>
    </aside>`;
  }
  function clubFeed(){
    const entries=periodList();let filtered=entries;
    if(clubOutcome==='win')filtered=filtered.filter(t=>tnet(t)>0);
    if(clubOutcome==='loss')filtered=filtered.filter(t=>tnet(t)<0);
    const q=clubSearch.toLocaleLowerCase('pt-BR').trim();
    if(q)filtered=filtered.filter(t=>[t.asset,t.strategy,t.market,t.direction,t.notes,t.analysis,t.tag].some(v=>String(v||'').toLocaleLowerCase('pt-BR').includes(q)));
    return `<div class="club-layout"><section class="club-main" aria-label="Feed de operações">
      <div class="club-feed-head"><div><h1>♟ Feed de Operações</h1><p>Seu histórico de trades • Resultados registrados no diário</p></div>
        <div class="club-feed-actions"><label class="sr-only" for="clubPeriod">Período</label><select id="clubPeriod" aria-label="Selecionar período"><option value="7" ${clubPeriod==='7'?'selected':''}>Últimos 7 dias</option><option value="30" ${clubPeriod==='30'?'selected':''}>Últimos 30 dias</option><option value="90" ${clubPeriod==='90'?'selected':''}>Últimos 90 dias</option><option value="all" ${clubPeriod==='all'?'selected':''}>Todas as operações</option></select><button class="club-select-btn" data-action="clubToggle">☑ ${clubSelect?'Cancelar':'Selecionar'}</button></div></div>
      <div class="club-feed-tabs">${[['all','Todas'],['win','Wins'],['loss','Losses']].map(([k,l])=>`<button class="club-tab ${clubOutcome===k?'active':''}" data-action="clubFilter" data-val="${k}" aria-pressed="${clubOutcome===k}">${l}</button>`).join('')}</div>
      ${clubSelect?`<div class="club-selection"><span>${clubSelected.size} selecionada(s)</span><button data-action="clubSelectAll">Selecionar visíveis</button><button data-action="clubDelete" ${!clubSelected.size?'disabled':''}>Excluir selecionadas</button></div>`:''}
      ${filtered.length?`<div class="club-trade-list">${filtered.map(clubCard).join('')}</div>`:`<div class="club-no-results"><b>Nenhuma operação encontrada</b><p>${q?'Tente outro termo de busca.':'Cadastre operações ou altere o filtro/período.'}</p>${btn('+ Nova Operação','newTrade','primary')}</div>`}
    </section>${clubSidebar(entries)}</div>`;
  }
  const oldFeed=feed;
  feed=function feedWithClub(){return P.skin===themeId?clubFeed():oldFeed()};

  async function commandClub(node){
    const act=node.dataset.action;
    if(act==='clubSkin'){
      P.skin=themeId;P.theme='dark';P.primary='#16da69';
      await saveSettings('preferences',P);render();toast('Template TradeClub Verde ativado');return;
    }
    if(act==='clubFilter') {clubOutcome=node.dataset.val;clubSelected.clear();render();return;}
    if(act==='clubToggle') {clubSelect=!clubSelect;clubSelected.clear();render();return;}
    if(act==='clubPick') {const id=Number(node.dataset.id);if(clubSelected.has(id))clubSelected.delete(id);else clubSelected.add(id);render();return;}
    if(act==='clubSelectAll') {const ids=[...document.querySelectorAll('.club-trade-card[data-id]')].map(n=>Number(n.dataset.id));const all=ids.every(x=>clubSelected.has(x));for(const id of ids){if(all)clubSelected.delete(id);else clubSelected.add(id)}render();return;}
    if(act==='clubDelete'){
      const ids=[...clubSelected];if(!ids.length)return;
      if(!confirm(`Excluir ${ids.length} operação(ões) selecionada(s)? A exclusão será sincronizada com a nuvem.`))return;
      for(const id of ids)await api('/api/trades/delete',{id});
      clubSelected.clear();clubSelect=false;await reload();render();toast('Operações excluídas');return;
    }
  }
  // A captura intercepta APENAS ações exclusivas deste template; mantém os handlers existentes.
  document.addEventListener('click',e=>{
    const node=e.target.closest('[data-action]');if(!node)return;
    const act=node.dataset.action;
    if(['clubSkin','clubFilter','clubToggle','clubPick','clubSelectAll','clubDelete'].includes(act)){
      e.preventDefault();e.stopImmediatePropagation();run(()=>commandClub(node));
    }
  },true);
  document.addEventListener('change',e=>{
    if(e.target.id==='clubPeriod'){clubPeriod=e.target.value;clubSelected.clear();render();}
  });
  document.addEventListener('input',e=>{
    if(e.target.id==='clubSearch'){
      clubSearch=e.target.value;
      // Atualiza apenas o Feed, preservando o foco e o texto da busca no cabeçalho.
      if(page==='feed'){
        const first=document.querySelector('.club-layout');
        if(first)first.outerHTML=clubFeed();
      }
    }
  });
  document.addEventListener('keydown',e=>{
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k' && P.skin===themeId){e.preventDefault();document.querySelector('#clubSearch')?.focus();}
    const card=e.target.closest('.club-trade-card[role="button"]');
    if(card&&e.target===card&&(e.key==='Enter'||e.key===' ')){e.preventDefault();window.currentTradeId=Number(card.dataset.id);nav('details');}
  });
})();