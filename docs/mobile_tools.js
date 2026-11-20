(function mobileTools(){
'use strict';
const oldDetail=detail,oldFeedCard=feedCard,oldDashboard=dashboard,oldSettings=settings,oldRender=render;
let shareId=null,shareFiles=[],shareLinks=[],shareBusy=false,shareError='',shareText='';
let reportFrom=isoDate().slice(0,8)+'01',reportTo=isoDate(),reportAccount='all';
const $tool=selector=>document.querySelector(selector);
const lookup=id=>recordsAll().find(r=>r.kind==='trade'&&r.record_id===id);
const attachedTrade=r=>({id:r.record_id,...r.data?.payload,rev:r.revision,pending:!!r.pending});
const accountName=t=>accounts().find(a=>a.id===t.accountSyncId)?.name||'—';
const pt=v=>String(v??'—');
const labelLine=(l,v)=>`${l}: ${v===undefined||v===null||String(v).trim()===''?'—':String(v)}`;
const duration=t=>{if(!t.start||!t.end)return '—';const a=t.start.split(':').map(Number),b=t.end.split(':').map(Number);let n=b[0]*60+b[1]-a[0]*60-a[1];if(n<0)n+=1440;return n>=60?`${Math.floor(n/60)}h ${n%60}min`:`${n} min`};
const hasRecorded=(v)=>v!==null&&v!==undefined&&(typeof v!=='string'||(v.trim()!==''&&v.trim()!=='—'&&v.trim()!=='-'&&v.trim().toLowerCase()!=='null'))&&!(typeof v==='number'&&!Number.isFinite(v));
function tradeText(t){
 const groups=cardSections(t);
 return ['D_TRADING | RELATÓRIO DA OPERAÇÃO',...groups.map(group=>group.section+'\n'+group.entries.map(([label,value])=>`${label}: ${value}`).join('\n'))].join('\n\n');
}
function actionBar(t){
 const id=esc(t.id);
 return `<div class="mobile-tools-actions"><button class="button secondary" type="button" data-tool-action="edit" data-id="${id}">✎ Editar</button><button class="button secondary" type="button" data-tool-action="share" data-id="${id}">↗ Compartilhar</button><button class="button danger" type="button" data-tool-action="delete" data-id="${id}">▤ Excluir</button></div>`;
}
detail=function enhancedDetail(){
 const old=oldDetail();
 const rec=lookup(S.selected);
 if(!rec||!rec.data?.payload)return old;
 const t=attachedTrade(rec);
 return actionBar(t)+old.replace('<div class="notice">Edição, exclusão e modo de estudo com desenhos continuam disponíveis na versão Windows.</div>','<div class="notice">O modo de estudo com desenhos continua disponível no Windows. As edições e exclusões feitas aqui são enviadas ao computador pela nuvem.</div>');
};
feedCard=function enhancedFeedCard(t){
 const original=oldFeedCard(t);
 if(t.noTrade)return original;
 const action=`<div class="mobile-feed-share"><button type="button" data-tool-action="share" data-id="${esc(t.id)}">↗ Compartilhar operação</button></div>`;
 return original.replace(/<\/article>$/,action+'</article>');
};
dashboard=function enhancedDashboard(){
 return `<div class="mobile-report-entry"><button type="button" class="button secondary" data-tool-action="report">▤ Gerar relatório do período</button></div>`+oldDashboard();
};
settings=function enhancedSettings(){
 return oldSettings()+`<div class="panel"><h2>▤ Relatórios</h2><p class="tagline">Consulte os resultados de um período e salve um relatório em PDF pelo iPhone.</p><button class="button secondary" style="width:100%" data-tool-action="report">Gerar relatório</button></div>`;
};
function dateMinus(days){const d=new Date();d.setDate(d.getDate()-days);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function reportTrades(){return trades().filter(t=>(!reportFrom||t.date>=reportFrom)&&(!reportTo||t.date<=reportTo)&&(reportAccount==='all'||t.accountSyncId===reportAccount)).sort((a,b)=>(a.date||'').localeCompare(b.date||'')||(a.start||'').localeCompare(b.start||''))}
function aggregate(t){const m=metrics(t),w=t.filter(x=>net(x)>0),l=t.filter(x=>net(x)<0);
 let curve=0,peak=0,dd=0;for(const trade of t){curve+=net(trade);peak=Math.max(peak,curve);dd=Math.max(dd,peak-curve);}
 const rr=t.map(x=>{const risk=Number(x.risk);return Number.isFinite(risk)&&risk>0?net(x)/risk:NaN}).filter(Number.isFinite);
 return {...m,dd,grossWins:w.reduce((s,x)=>s+net(x),0),grossLoss:Math.abs(l.reduce((s,x)=>s+net(x),0)),averageRR:rr.length?rr.reduce((s,x)=>s+x,0)/rr.length:null,expectancy:t.length?m.net/t.length:0};
}
function reportView(){
 const t=reportTrades(),m=aggregate(t);
 const assetTotals=new Map(),strategyTotals=new Map(),dayTotals=new Map();
 for(const x of t){
  for(const [map,key] of [[assetTotals,x.asset||'Outro'],[strategyTotals,x.strategy||'Sem estratégia'],[dayTotals,x.date]]){
   const old=map.get(key)||{amount:0,count:0};old.amount+=net(x);old.count++;map.set(key,old);
  }
 }
 const fmt=v=>esc(money(v));
 const bar=(map)=>[...map].sort((a,b)=>b[1].amount-a[1].amount).map(([name,v])=>`<tr><td>${esc(name)}</td><td>${v.count}</td><td class="${sign(v.amount)}">${fmt(v.amount)}</td></tr>`).join('');
 const accountsOpt=accounts().map(a=>`<option value="${esc(a.id)}" ${reportAccount===a.id?'selected':''}>${esc(a.name)}</option>`).join('');
 return `<div class="mobile-report-controls"><button class="button secondary" data-tool-action="reportBack">← Voltar</button><h1>Relatório de Performance</h1><p class="hint">Escolha o período e a conta que deseja analisar.</p><div class="mob-two"><div class="field"><label for="rFrom">Data inicial</label><input id="rFrom" data-tool-input="from" type="date" value="${esc(reportFrom)}"></div><div class="field"><label for="rTo">Data final</label><input id="rTo" data-tool-input="to" type="date" value="${esc(reportTo)}"></div></div><div class="field"><label>Conta</label><select data-tool-input="account"><option value="all">Todas as contas</option>${accountsOpt}</select></div><div class="mobile-report-presets"><button data-tool-action="preset" data-period="7">7 dias</button><button data-tool-action="preset" data-period="30">30 dias</button><button data-tool-action="preset" data-period="month">Este mês</button><button data-tool-action="preset" data-period="all">Todo histórico</button></div><div class="mobile-report-buttons"><button class="button" data-tool-action="printReport">▤ Salvar PDF / Imprimir</button><button class="button secondary" data-tool-action="csvReport">Exportar CSV</button></div><p class="mob-helper">No iPhone, escolha “Salvar em Arquivos” a partir da visualização de impressão para guardar o PDF. Os valores não são convertidos entre moedas diferentes.</p></div><article class="report-paper" id="report-paper"><header class="report-head"><h1>D_TRADING</h1><p>RELATÓRIO DE PERFORMANCE • GERADO EM ${esc(new Date().toLocaleString('pt-BR'))}</p><p>Período: ${esc(reportFrom||'Início')} a ${esc(reportTo||'Hoje')} • ${reportAccount==='all'?'Todas as contas':esc(accounts().find(a=>a.id===reportAccount)?.name||'Conta')}</p><p>Última sincronização conhecida: ${S.lastSync?esc(new Date(S.lastSync).toLocaleString('pt-BR')):'Não confirmada'} • ${navigator.onLine?'Conectado':'Offline'}</p></header><section class="report-kpis"><div><span>Resultado líquido</span><strong>${fmt(m.net)}</strong></div><div><span>Operações</span><strong>${m.count}</strong></div><div><span>Win Rate</span><strong>${pct(m.rate)}</strong></div><div><span>Profit Factor</span><strong>${m.pf===Infinity?'∞':m.pf.toFixed(2)}</strong></div><div><span>Vitórias / Derrotas</span><strong>${m.wins} / ${m.losses}</strong></div><div><span>Expectativa / Trade</span><strong>${fmt(m.expectancy)}</strong></div><div><span>Drawdown Máximo</span><strong>${fmt(m.dd)}</strong></div><div><span>R/R Médio</span><strong>${m.averageRR===null?'—':m.averageRR.toFixed(2)+' R'}</strong></div><div><span>Lucro Bruto</span><strong>${fmt(m.grossWins)}</strong></div><div><span>Perdas Brutas</span><strong>${fmt(-m.grossLoss)}</strong></div></section><h2>Resultado por Ativo</h2><table><thead><tr><th>Ativo</th><th>Trades</th><th>Resultado</th></tr></thead><tbody>${bar(assetTotals)||'<tr><td colspan="3">Sem operações no período</td></tr>'}</tbody></table><h2>Resultado por Estratégia</h2><table><thead><tr><th>Estratégia</th><th>Trades</th><th>Resultado</th></tr></thead><tbody>${bar(strategyTotals)||'<tr><td colspan="3">Sem dados</td></tr>'}</tbody></table><h2>Resultado Diário</h2><table><thead><tr><th>Data</th><th>Trades</th><th>Resultado</th></tr></thead><tbody>${bar(dayTotals)||'<tr><td colspan="3">Sem dados</td></tr>'}</tbody></table><h2>Operações do Período</h2><table><thead><tr><th>Data / Hora</th><th>Ativo</th><th>Direção</th><th>Estratégia</th><th>P&L líquido</th></tr></thead><tbody>${t.map(x=>`<tr><td>${esc(formatDate(x.date))} ${esc(x.start||'')}</td><td>${esc(x.asset)}</td><td>${esc(x.direction||'—')}</td><td>${esc(x.strategy||'—')}</td><td class="${sign(net(x))}">${fmt(net(x))}</td></tr>`).join('')||'<tr><td colspan="5">Nenhum trade neste período</td></tr>'}</tbody></table><footer>Relatório gerado no D_Trading Mobile. O resultado representa registros informados, não extratos oficiais da corretora.</footer></article>`;
}
function clearShare(){
 for(const url of shareLinks)URL.revokeObjectURL(url);
 shareFiles=[];shareLinks=[];shareError='';shareBusy=false;shareText='';shareId=null;
}
async function loadPrivateImage(path){
 if(!/^\/uploads\/[a-f0-9]{32}\.(?:png|jpg|jpeg|webp|gif)$/i.test(path||''))throw Error('O print vinculado não tem um caminho válido.');
 if(!navigator.onLine)throw Error('Conecte o iPhone à internet para incluir o print da operação.');
 if(Date.now()+60000>S.session.expires)await refreshAuth();
 const filename=path.split('/').pop();
 const uri=`${S.cfg.url}/storage/v1/object/authenticated/dtrading-private/${encodeURIComponent(S.session.userId)}/${encodeURIComponent(filename)}`;
 const res=await fetch(uri,{headers:{apikey:S.cfg.key,Authorization:`Bearer ${S.session.access}`}});
 if(!res.ok)throw Error('Não foi possível carregar o print do Supabase (erro '+res.status+').');
 return await res.blob();
}
async function blobImage(blob){
 const url=URL.createObjectURL(blob);
 try{
  const img=new Image();
  img.src=url;
  await new Promise((ok,fail)=>{img.onload=ok;img.onerror=()=>fail(new Error('Não foi possível ler a imagem do gráfico'))});
  return img;
 }finally{ /* URL revogada depois de desenhar no canvas */ }
}
const wrap=(ctx,text,width)=>{
 const parts=String(text??'').replace(/\r/g,'').split('\n'),all=[];
 for(const part of parts){
  if(!part.trim()){all.push('');continue;}
  let line='';
  for(const word of part.split(/\s+/)){
   const candidate=line?line+' '+word:word;
   if(ctx.measureText(candidate).width>width&&line){all.push(line);line=word;}
   else line=candidate;
  }
  if(line)all.push(line);
 }
 return all.length?all:[''];
};
function cardSections(t){
 const acc=accounts().find(a=>a.id===t.accountSyncId);
 const netValid=hasRecorded(t.pnl);
 const feeValid=hasRecorded(t.fees);
 const risk=Number(t.risk);
 const riskValid=hasRecorded(t.risk)&&Number.isFinite(risk)&&risk>0;
 const rr=riskValid&&netValid?(net(t)/risk).toFixed(2)+' R':hasRecorded(t.rr)?String(t.rr)+' R':null;
 const pricesValid=hasRecorded(t.entry)&&hasRecorded(t.exit)&&Number.isFinite(Number(t.entry))&&Number.isFinite(Number(t.exit));
 const points=pricesValid?(Number(t.exit)-Number(t.entry))*(t.direction==='Venda'?-1:1):null;
 const capital=Number(acc?.initial_capital);
 const pct=netValid&&Number.isFinite(capital)&&capital>0?(net(t)/capital*100).toFixed(2)+'%':null;
 const shown=(name,v)=>[name,v];
 const groups=[
 ['DATA E IDENTIFICAÇÃO',[
 shown('Ativo',t.asset),shown('Data',hasRecorded(t.date)?formatDate(t.date):null),shown('Entrada',t.start),shown('Saída',t.end),
 shown('Duração',hasRecorded(t.start)&&hasRecorded(t.end)?duration(t):null),
 shown('Conta',acc?.name),shown('Tipo de Conta',acc?.kind),shown('Mercado',t.market),shown('Direção',t.direction),
 shown('Estratégia',t.strategy),shown('Timeframe',t.timeframe),shown('Tendência',t.trend)]],
 ['GESTÃO E RESULTADOS',[
 shown('Preço de Entrada',t.entry),shown('Preço de Saída',t.exit),shown('Preço do Stop',t.stop),
 shown('Alvo 1',t.target1),shown('Alvo 2',t.target2),shown('Alvo 3',t.target3),
 shown('Resultado Bruto',netValid?money(asNum(t.pnl)):null),shown('Taxas',feeValid?money(asNum(t.fees)):null),
 shown('Resultado Líquido',netValid?money(net(t)):null),shown('Resultado em Pontos',points),
 shown('Capital Inicial',hasRecorded(acc?.initial_capital)?acc.initial_capital:null),
 shown('% sobre Capital Inicial',pct),shown('Risco Financeiro',t.risk),shown('R/R Realizado',rr)]],
 ['PSICOLOGIA',[
 shown('Seguiu Plano',t.followed),shown('Impulso',t.impulsive),shown('Revenge Trade',t.revenge),
 shown('Confiança',t.confidence),shown('Disciplina',t.discipline),shown('Emoções e Comportamento',t.psychology)]],
 ['ANÁLISE E REVISÃO',[
 shown('Análise',t.analysis),shown('Planejamento',t.planning),shown('Contexto',t.notes),shown('Revisão',t.review),
 shown('O Que Fez Bem',t.good),shown('O Que Precisa Melhorar',t.improve),shown('Erros',t.mistakes),
 shown('Aprendizados',t.lessons),shown('Nota Geral',hasRecorded(t.rating)?String(t.rating)+'/5':null),
 shown('Tags',t.tag),shown('Favorito',t.favorite===true?'Sim':null)]]
 ];
 return groups.map(([section,entries])=>({section,entries:entries.filter(([,v])=>hasRecorded(v))})).filter(group=>group.entries.length>0);
}
async function makeShareCards(t,img){
 const width=1080,margin=55,lineH=35,maxPage=6500;
 const s=document.createElement('canvas');s.width=width;s.height=32;
 const ctx=s.getContext('2d');
 if(!ctx)throw Error('O navegador não conseguiu gerar a imagem para compartilhar.');
 ctx.font='25px system-ui';
 let parts=[];
 const add=(height,draw)=>parts.push({height,draw});
 add(125,(c,y)=>{c.fillStyle='#fb304d';c.font='bold 54px system-ui';c.fillText('D_TRADING',margin,y+52);c.fillStyle='#d9d6df';c.font='23px system-ui';c.fillText('RELATÓRIO DE OPERAÇÃO • '+(t.asset||'TRADE'),margin,y+90);});
 add(70,(c,y)=>{c.fillStyle='#fff';c.font='bold 43px system-ui';c.fillText(money(net(t)),margin,y+48);});
 if(img){
  const maxWidth=width-margin*2, maxH=680;
  const ratio=img.naturalWidth/img.naturalHeight;
  const h=Math.min(maxH,maxWidth/ratio),w=h*ratio;
  add(h+62,(c,y)=>{c.fillStyle='#28232a';c.fillRect(margin,y+9,maxWidth,h+20);c.drawImage(img,margin+(maxWidth-w)/2,y+19,w,h);c.fillStyle='#bbb';c.font='20px system-ui';c.fillText('PRINT DA OPERAÇÃO',margin,y+48+h);});
 }
 const sectionData=cardSections(t);
 for(const section of sectionData){
  add(65,(c,y)=>{c.fillStyle='#f33b55';c.font='bold 30px system-ui';c.fillText(section.section,margin,y+45)});
  for(const [key,value] of section.entries){
   ctx.font='24px system-ui';
   const lines=wrap(ctx,key+': '+value,width-2*margin);
   const height=Math.max(43,lines.length*lineH+10);
   add(height,(c,y)=>{c.font='24px system-ui';c.fillStyle='#eae8ed';lines.forEach((line,i)=>c.fillText(line,margin,y+31+i*lineH));});
  }
 }
 add(62,(c,y)=>{c.fillStyle='#adabb3';c.font='20px system-ui';c.fillText('Registro fornecido pelo usuário • D_Trading Mobile',margin,y+30)});
 const pages=[];let current=[],height=50;
 for(const part of parts){if(current.length&&height+part.height+60>maxPage){pages.push({parts:current,height:height+60});current=[];height=50;}current.push({...part,y:height});height+=part.height;}
 if(current.length)pages.push({parts:current,height:height+60});
 const files=[];
 for(let i=0;i<pages.length;i++){
  const page=pages[i],canvas=document.createElement('canvas');canvas.width=width;canvas.height=Math.ceil(page.height);
  const c=canvas.getContext('2d');if(!c)throw Error('O Safari não conseguiu criar a imagem');
  c.fillStyle='#101016';c.fillRect(0,0,width,canvas.height);
  c.strokeStyle='#b71932';c.lineWidth=9;c.strokeRect(5,5,width-10,canvas.height-10);
  for(const p of page.parts)p.draw(c,p.y);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.88));
  if(!blob)throw Error('Não foi possível gerar a imagem de compartilhamento.');
  const filename=`DTrading_${String(t.asset||'Trade').replace(/[^a-zA-Z0-9_-]/g,'_')}_${String(t.date||'')}_${i+1}.jpg`;
  files.push(new File([blob],filename,{type:'image/jpeg'}));
 }
 return files;
}
function shareView(){
 const r=lookup(shareId);
 if(!r||!r.data?.payload)return `<div class="notice badnotice">Esta operação não está mais disponível.</div><button class="button secondary" data-tool-action="shareBack">← Voltar</button>`;
 const t=attachedTrade(r);
 return `<section class="mobile-share"><button class="button secondary" data-tool-action="shareBack">← Voltar</button><h1 style="margin-top:15px">Compartilhar Operação</h1><p class="hint">Envie o print e os detalhes completos pelo WhatsApp, Mail ou outro app instalado no iPhone.</p><div class="panel"><h2>${esc(t.asset||'Operação')} • ${esc(formatDate(t.date))}</h2><p class="tagline">Resultado: <strong class="${sign(net(t))}">${esc(money(net(t)))}</strong> · ${esc(t.direction||'—')} · ${esc(t.strategy||'Sem estratégia')}</p><p class="tagline">${t.images?.length?'Incluindo o primeiro print da operação na imagem compartilhada.':'Sem print vinculado. O cartão terá todas as especificações do registro.'}</p></div>${shareBusy?'<div class="panel"><div class="spinner"></div><p class="tagline">Preparando imagens com o print e todos os dados...</p></div>':shareError?`<div class="notice badnotice">${esc(shareError)}</div><button class="button secondary" data-tool-action="retryShare">↻ Tentar preparar novamente</button>`:shareFiles.length?`<div class="panel"><h2>Arquivo preparado</h2><p class="tagline">${shareFiles.length} imagem(ns) com dados da operação, prontas para envio.</p>${shareLinks[0]?`<img class="file-preview" src="${shareLinks[0]}" alt="Prévia da operação para compartilhar">`:''}</div><button class="button" style="width:100%;margin-bottom:10px" data-tool-action="nativeShare">↗ Compartilhar via WhatsApp / E-mail</button><button class="button secondary" style="width:100%;margin-bottom:10px" data-tool-action="downloadShare">Salvar imagem no iPhone</button><p class="mob-helper">Use o botão Compartilhar para abrir a lista de aplicativos do iPhone. Se o navegador não permitir anexos, salve a imagem e anexe manualmente na conversa ou no e-mail.</p>`:'<p class="hint">Iniciando preparo...</p>'}</section>`;
}
async function prepareShare(){
 const record=lookup(shareId);if(!record?.data?.payload)throw Error('Operação não encontrada');
 shareBusy=true;shareError='';render();
 let img=null,objectUrl=null;
 try{
  const t=attachedTrade(record);
  const ref=(Array.isArray(t.images)?t.images:[])[0];
  if(ref){
   const blob=await loadPrivateImage(ref);
   objectUrl=URL.createObjectURL(blob);
   img=new Image();
   img.src=objectUrl;
   await new Promise((ok,fail)=>{img.onload=ok;img.onerror=()=>fail(new Error('Não foi possível abrir o print da operação'))});
  }
  const files=await makeShareCards(t,img);
  if(shareId!==record.record_id)return;
  shareFiles=files;shareText=tradeText(t);
  shareLinks=files.map(f=>URL.createObjectURL(f));
 }catch(err){shareError=err.message||'Falha ao preparar o compartilhamento';}
 finally{if(objectUrl)URL.revokeObjectURL(objectUrl);shareBusy=false;if(S.view==='share')render();}
}
async function deleteTrade(id){
 const r=lookup(id);if(!r||!r.data?.payload){toast('Operação não encontrada');return;}
 if(S.busy){toast('Sincronização em andamento. Tente novamente.');return;}
 const label=r.data.payload.noTrade?'o registro do dia sem operar':`a operação ${r.data.payload.asset||''} de ${formatDate(r.data.payload.date)}`;
 if(!confirm(`Deseja realmente excluir ${label}?\nA exclusão também será sincronizada com o computador. Confira seu backup antes de continuar.`))return;
 await queueRecordChange('trade',id,{},true,Number(r.revision||0));
 clearShare();S.selected=null;S.view='feed';render();toast('Exclusão registrada. Sincronizando com o computador...');
 if(navigator.onLine)await sync();
}
function startShare(id){
 if(!lookup(id)?.data?.payload){toast('Operação não encontrada');return;}
 clearShare();shareId=id;S.selected=id;S.view='share';render();void prepareShare();
}
function shareNative(){
 if(!shareFiles.length)return toast('Prepare o compartilhamento primeiro.');
 const data={title:'Operação D_Trading',text:'Operação registrada no D_Trading',files:shareFiles};
 let supportsFiles=typeof navigator.share==='function';try{if(supportsFiles&&typeof navigator.canShare==='function')supportsFiles=navigator.canShare({files:shareFiles})}catch{supportsFiles=false}
 if(!supportsFiles){
  toast('Este navegador não permite anexar arquivos por Compartilhar. Salve a imagem e anexe manualmente no WhatsApp ou e-mail.');
  return;
 }
 navigator.share(data).catch(err=>{if(err?.name!=='AbortError')toast('Não foi possível compartilhar: '+err.message)});
}
function downloadShares(){
 if(!shareLinks.length)return;
 shareLinks.forEach((src,i)=>{
  const a=document.createElement('a');
  a.href=src;a.download=shareFiles[i].name;
  document.body.appendChild(a);a.click();a.remove();
 });
 toast('Imagem preparada. Se o Safari abrir a imagem, use Compartilhar → Salvar em Arquivos/Fotos.');
}
function csvReport(){
 const list=reportTrades();
 const cols=['Data','Hora','Ativo','Direção','Mercado','Estratégia','Conta','Resultado Bruto','Taxas','Resultado Líquido','Risco','R/R'];
 const rows=list.map(t=>[t.date,t.start,t.asset,t.direction,t.market,t.strategy,accountName(t),t.pnl,t.fees,net(t),t.risk,t.rr]);
 const csv='\ufeff'+[cols,...rows].map(row=>row.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(';')).join('\r\n');
 const link=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
 const a=document.createElement('a');a.href=link;a.download=`D_Trading_Relatorio_${reportFrom||'todos'}_${reportTo||'atual'}.csv`;document.body.appendChild(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(link),60000);
}
render=function enhancedMobileRender(){
 if(S.view==='report'||S.view==='share'){
  updateNet();
  $('bottomnav').hidden=!S.session?.access;
  $('sync-button').hidden=!S.session?.access;
  $('screen').innerHTML=S.view==='report'?reportView():shareView();
  document.querySelectorAll('#bottomnav button').forEach(b=>b.classList.toggle('active',b.dataset.view===S.view));
  return;
 }
 oldRender();
};
document.addEventListener('click',e=>{
 const el=e.target.closest('[data-tool-action]');if(!el)return;
 const action=el.dataset.toolAction,id=el.dataset.id;
 if(action==='edit'){
  window.DTradingMobileForm?.beginEdit(id);
 }else if(action==='delete'){void deleteTrade(id).catch(err=>toast(err.message))}
 else if(action==='share')startShare(id);
 else if(action==='shareBack'){clearShare();S.view='feed';render()}
 else if(action==='retryShare'){void prepareShare()}
 else if(action==='nativeShare')shareNative();
 else if(action==='downloadShare')downloadShares();
 else if(action==='report'){S.view='report';render();window.scrollTo(0,0)}
 else if(action==='reportBack'){S.view='dashboard';render()}
 else if(action==='printReport'){if(reportFrom&&reportTo&&reportFrom>reportTo){toast('A data inicial deve ser anterior à final.');return;}window.print();}
 else if(action==='csvReport')csvReport();
 else if(action==='preset'){
  if(el.dataset.period==='7')reportFrom=dateMinus(6);
  else if(el.dataset.period==='30')reportFrom=dateMinus(29);
  else if(el.dataset.period==='month')reportFrom=isoDate().slice(0,8)+'01';
  else if(el.dataset.period==='all')reportFrom='';
  reportTo=isoDate();render();
 }
});
document.addEventListener('change',e=>{
 const field=e.target.closest('[data-tool-input]');if(!field)return;
 if(field.dataset.toolInput==='from')reportFrom=field.value;
 if(field.dataset.toolInput==='to')reportTo=field.value;
 if(field.dataset.toolInput==='account')reportAccount=field.value;
 if(reportFrom&&reportTo&&reportFrom>reportTo){toast('A data inicial deve ser anterior à final.');return;}
 render();
});
})();