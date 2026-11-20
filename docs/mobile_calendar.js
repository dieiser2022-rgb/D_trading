(function mobileCalendar(){
'use strict';
const originalRender=render;
const today=new Date();
let month=new Date(today.getFullYear(),today.getMonth(),1);
let selected=null;
const z=n=>String(n).padStart(2,'0');
const dayKey=(y,m,d)=>`${y}-${z(m+1)}-${z(d)}`;
function dateLabel(date){return date.toLocaleDateString('pt-BR',{month:'long',year:'numeric'}).replace(/^./,c=>c.toUpperCase());}
function calTrades(){return trades().filter(t=>/^\d{4}-\d{2}-\d{2}$/.test(t.date||''));}
function calNoTrade(){return noTradeDays().filter(t=>/^\d{4}-\d{2}-\d{2}$/.test(t.date||''));}
function valueKnown(t){return t.pnl!==null&&t.pnl!==undefined&&String(t.pnl).trim()!=='';}
function calendarView(){
 const y=month.getFullYear(),m=month.getMonth(),all=calTrades(),allNo=calNoTrade();
 const current=all.filter(t=>t.date?.startsWith(`${y}-${z(m+1)}-`));
 const totals=new Map();
 for(const t of current){
  const prev=totals.get(t.date)||{amount:0,count:0,withResult:0};
  prev.count++;
  if(valueKnown(t)){prev.amount+=net(t);prev.withResult++;}
  totals.set(t.date,prev);
 }
 const noDays=new Set(allNo.map(t=>t.date));
 const currentWithResult=current.filter(valueKnown),currentNet=currentWithResult.reduce((s,t)=>s+net(t),0);
 const wins=currentWithResult.filter(t=>net(t)>0).length;
 const rate=currentWithResult.length?wins/currentWithResult.length*100:0;
 const firstDay=new Date(y,m,1).getDay();
 const numDays=new Date(y,m+1,0).getDate();
 const grid=[];
 for(let i=0;i<firstDay;i++)grid.push('<div class="cal-outside" aria-hidden="true"></div>');
 for(let d=1;d<=numDays;d++){
  const date=dayKey(y,m,d),v=totals.get(date),hasNoTrade=noDays.has(date);
  const status=v?.withResult?(v.amount>0?'win':v.amount<0?'loss':'flat'):hasNoTrade?'rest':v?'pending':'none';
  const result=v?.withResult?`<span class="cal-amount">${esc(money(v.amount))}</span>`:'';
  const extra=v?`<span class="cal-count">${v.count} op.</span>`:hasNoTrade?'<span class="cal-count">Não operei</span>':'';
  const isToday=date===isoDate();
  grid.push(`<button type="button" class="cal-day ${status} ${selected===date?'selected':''} ${isToday?'today':''}" data-cal-action="day" data-date="${date}" aria-label="${d} de ${dateLabel(month)}${v?.withResult?' resultado '+money(v.amount):''}${v?' '+v.count+' operações':''}" aria-pressed="${selected===date}"><span class="cal-num">${d}</span>${result}${extra}</button>`);
 }
 while(grid.length%7)grid.push('<div class="cal-outside" aria-hidden="true"></div>');
 const selectedHTML=selected?daySummary(selected,all,allNo):'';
 return `<section class="mobile-calendar"><div class="cal-heading"><h1>Calendário</h1><p class="hint">Seus resultados diários, sincronizados com o computador.</p></div><div class="cal-stats"><div><small>Trades do mês</small><strong>${current.length}</strong></div><div><small>P&L do mês</small><strong class="${sign(currentNet)}">${currentWithResult.length?esc(money(currentNet)):'—'}</strong></div><div><small>Win Rate</small><strong>${currentWithResult.length?pct(rate):'—'}</strong></div></div><div class="panel cal-container"><div class="cal-header"><button type="button" data-cal-action="prev" aria-label="Mês anterior">‹</button><h2>${esc(dateLabel(month))}</h2><button type="button" data-cal-action="next" aria-label="Próximo mês">›</button></div><div class="cal-grid cal-week">${['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map(d=>`<span>${d}</span>`).join('')}</div><div class="cal-grid cal-days">${grid.join('')}</div></div>${selectedHTML}</section>`;
}
function daySummary(date,all,allNo){
 const list=all.filter(t=>t.date===date).sort((a,b)=>(a.start||'').localeCompare(b.start||''));
 const rest=allNo.filter(t=>t.date===date);
 const recorded=list.filter(valueKnown),total=recorded.reduce((s,t)=>s+net(t),0);
 const formatted=new Date(date+'T12:00:00').toLocaleDateString('pt-BR',{day:'numeric',month:'long',year:'numeric'});
 const cards=list.map(t=>`<button type="button" class="cal-trade" data-action="detail" data-id="${esc(t.id)}"><div><strong>${esc(t.asset||'Ativo não informado')}</strong><small>${esc(t.direction||'')}${t.start?' · '+esc(t.start):''}${t.strategy?' · '+esc(t.strategy):''}</small></div><span class="${valueKnown(t)?sign(net(t)):'muted'}">${valueKnown(t)?esc(money(net(t))):'Sem resultado'}</span><span class="cal-chevron">›</span></button>`).join('');
 const restCards=rest.map(t=>`<button type="button" class="cal-trade cal-rest" data-action="detail" data-id="${esc(t.id)}"><div><strong>Hoje não operei</strong><small>${esc(t.notes||'Registro do dia sem operações')}</small></div><span class="cal-chevron">›</span></button>`).join('');
 return `<div class="panel cal-details" id="cal-day-detail"><div class="cal-details-head"><div><h2>${esc(formatted)}</h2><p>${list.length} operação(ões)${rest.length?' · '+rest.length+' dia(s) sem operar':''}</p></div><button type="button" data-cal-action="close" aria-label="Fechar resumo do dia">✕</button></div>${recorded.length?`<div class="cal-day-total ${sign(total)}">Total do dia: ${esc(money(total))}</div>`:''}${cards}${restCards}${!list.length&&!rest.length?'<p class="cal-no-trades">Nenhuma operação registrada neste dia.</p>':''}</div>`;
}
render=function calendarEnabledRender(){
 if(S.view!=='calendar')return originalRender();
 updateNet();
 const logged=!!S.session?.access;
 $('bottomnav').hidden=!logged;
 $('sync-button').hidden=!logged;
 if(!logged){return originalRender();}
 $('screen').innerHTML=calendarView();
 document.querySelectorAll('#bottomnav button').forEach(b=>b.classList.toggle('active',b.dataset.view===S.view));
};
document.addEventListener('click',e=>{
 const btn=e.target.closest('[data-cal-action]');if(!btn)return;
 const a=btn.dataset.calAction;
 if(a==='prev'||a==='next'){month=new Date(month.getFullYear(),month.getMonth()+(a==='next'?1:-1),1);selected=null;render();}
 else if(a==='day'){selected=selected===btn.dataset.date?null:btn.dataset.date;render();if(selected){const panel=document.getElementById('cal-day-detail');if(panel)panel.scrollIntoView({behavior:'smooth',block:'nearest'});}}
 else if(a==='close'){selected=null;render();}
});
})();