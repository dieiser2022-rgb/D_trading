(function mobileForm() {
'use strict';
const tabs=['Análise','Básico','Resultado','Psicologia','Planejamento','Contexto','Revisão'];
let draft=null, tab='Análise', section='', attachments=[], saving=false;
const A=(s)=>esc(s??'');
const text=(k)=>String(draft?.[k]??'');
const dt=()=>({date:isoDate(),start:localTime(),end:'',asset:'',market:'Futuros',direction:'Compra',strategy:'',accountSyncId:'',entry:'',exit:'',stop:'',risk:'',pnl:'',fees:'0',analysis:'',psychology:'',planning:'',notes:'',review:'',good:'',improve:'',mistakes:'',lessons:'',timeframe:'',trend:'',followed:'',impulsive:'',revenge:'',confidence:'',discipline:'',target1:'',target2:'',target3:'',tag:'',favorite:false,noTrade:false,rating:3,images:[]});
function ensure(){if(!draft)draft=dt();return draft}
function field(label,key,type='text',extra=''){
 const v=text(key);
 return `<div class="field"><label for="mob_${key}">${A(label)}</label><input id="mob_${key}" data-mobile-field="${key}" type="${type}" value="${A(v)}" ${extra}></div>`;
}
function area(label,key,placeholder='',rows=4){
 return `<div class="field"><label for="mob_${key}">${A(label)}</label><textarea id="mob_${key}" data-mobile-field="${key}" rows="${rows}" placeholder="${A(placeholder)}">${A(text(key))}</textarea></div>`;
}
function select(label,key,opts,empty='Selecione'){
 return `<div class="field"><label for="mob_${key}">${A(label)}</label><select id="mob_${key}" data-mobile-field="${key}"><option value="">${A(empty)}</option>${opts.map(opt=>{const val=Array.isArray(opt)?opt[0]:opt;const title=Array.isArray(opt)?opt[1]:opt;return `<option value="${A(val)}" ${text(key)===String(val)?'selected':''}>${A(title)}</option>`}).join('')}</select></div>`;
}
function checkbox(key,label,desc=''){
 return `<label class="mob-switch-row"><input data-mobile-field="${key}" type="checkbox" ${draft[key]?'checked':''}><span><b>${A(label)}</b>${desc?`<small>${A(desc)}</small>`:''}</span></label>`;
}
function imageField(){
 return `<div class="field"><label for="mob_image">Prints do gráfico</label><input id="mob_image" data-mobile-upload type="file" multiple accept="image/*,.heic,.heif"><small class="muted tiny">Adicione um ou vários prints. As imagens são enviadas quando você salvar com internet. No computador, também é possível usar Ctrl+V.</small><div class="mob-files">${attachments.map((file,i)=>`<div class="mob-file"><span>▣ ${A(file.name||'Imagem '+(i+1))}</span><button type="button" data-mobile-action="removeFile" data-index="${i}" aria-label="Remover print">✕</button></div>`).join('')}</div></div>`;
}
function computed(){
 const f=(v)=>Number(String(v??'').trim().replace(',','.'));
 const e=f(draft.entry),exit=f(draft.exit),pnl=f(draft.pnl)||0,fees=f(draft.fees)||0,risk=Math.abs(f(draft.risk)),net=pnl-fees;
 const pts=draft.entry!==''&&draft.exit!==''&&Number.isFinite(e)&&Number.isFinite(exit)?(exit-e)*(draft.direction==='Venda'?-1:1):null;
 const account=accounts().find(x=>x.id===draft.accountSyncId);
 const capital=Number(account?.initial_capital);
 const val=(x)=>Number.isFinite(x)?x.toLocaleString('pt-BR',{maximumFractionDigits:3}):'—';
 return {pts:pts===null?'—':val(pts),net:money(net),pct:capital>0?val(net/capital*100)+'%':'—',rr:risk>0?val(net/risk)+' R':'—'};
}
function readOnly(label,value){
 return `<div class="field"><label>${A(label)}</label><div class="mob-computed">${A(value)}</div></div>`;
}
function content(){
 switch(tab){
 case 'Análise':return `${imageField()}${area('Texto da Análise','analysis','Leitura do mercado, contexto, motivos da entrada, níveis e gerenciamento...',7)}`;
 case 'Básico':return `<div class="mob-two">${field('Data','date','date')}${field('Horário de entrada','start','time')}${field('Horário de saída','end','time')}${`<div class="field"><label>Duração</label><div id="mobileDurationComputed" class="mob-computed">${A(duration())}</div></div>`}</div>${field('Ativo','asset','text','list="mobileAssets" placeholder="NASDAQ, XAUUSD, US30..."')}<datalist id="mobileAssets">${['NASDAQ','USTEC','XAUUSD','US30','ES','NQ','SPX','DXY'].map(x=>`<option value="${x}">`).join('')}</datalist><div class="mob-two">${select('Mercado','market',['Futuros','Forex','CFD','Ações','Opções','Criptomoedas','Outros'])}${select('Tipo de operação','direction',['Compra','Venda'])}</div><div class="mob-create-inline">${select('Estratégia','strategy',strategies().map(x=>x.name))}<button type="button" class="button secondary" data-mobile-action="strategy">+ Nova estratégia</button></div><div class="mob-create-inline"><div class="field"><label for="mob_account">Nome da Conta *</label><select id="mob_account" data-mobile-field="accountSyncId"><option value="">Selecione uma conta</option>${accounts().map(ac=>`<option value="${A(ac.id)}" ${draft.accountSyncId===ac.id?'selected':''}>${A(ac.name)} · ${A(ac.kind||'Pessoal')} · ${A(ac.currency||'USD')}</option>`).join('')}</select></div><button type="button" class="button secondary" data-mobile-action="account">+ Nova conta</button></div>${readOnly('Tipo de Conta',accounts().find(ac=>ac.id===draft.accountSyncId)?.kind||'Definido pela conta')}<p class="mob-helper">Toda nova conta exige um capital inicial. Contas e estratégias ficam disponíveis no iPhone e no computador após sincronizar.</p>`;
 case 'Resultado':{const v=computed();return `<div class="mob-two">${field('Preço de Entrada','entry','text','inputmode="decimal"')}${field('Preço de Saída','exit','text','inputmode="decimal"')}${field('Preço do Stop','stop','text','inputmode="decimal"')}${field('Risco Financeiro ($)','risk','text','inputmode="decimal" placeholder="Ex.: 30"')}${field('Resultado Financeiro Bruto ($)','pnl','text','inputmode="decimal" placeholder="Ex.: 50 ou -20"')}${field('Custos / Taxas ($)','fees','text','inputmode="decimal"')}</div><div id="mobileComputed" class="mob-computed-grid">${readOnly('Resultado em Pontos',v.pts)}${readOnly('Resultado Líquido',v.net)}${readOnly('% sobre capital inicial',v.pct)}${readOnly('Resultado R:R',v.rr)}</div><p class="mob-helper">Informe o P&L bruto. O líquido desconta taxas; os pontos respeitam Compra/Venda. Para calcular R:R, informe o risco financeiro.</p>`;}
 case 'Psicologia':return `<div class="mob-two">${select('Seguiu seu plano?','followed',['Sim','Não','Parcialmente'])}${select('Operou por impulso?','impulsive',['Não','Sim'])}${select('Fez revenge trade?','revenge',['Não','Sim'])}${field('Confiança (0 a 10)','confidence','number','min="0" max="10"')}${field('Disciplina (0 a 10)','discipline','number','min="0" max="10"')}</div>${area('Emoções e comportamento','psychology','Como você se sentiu durante a operação?')}`;
 case 'Planejamento':return `<div class="mob-two">${field('Alvo 1','target1','text','inputmode="decimal"')}${field('Alvo 2','target2','text','inputmode="decimal"')}${field('Alvo 3','target3','text','inputmode="decimal"')}</div>${area('Gerenciamento e plano de execução','planning','Parciais, invalidação, hipótese e limites...',5)}`;
 case 'Contexto':return `<div class="mob-two">${select('Timeframe','timeframe',['15 Segundos','30 Segundos','1 Minuto','2 Minutos','3 Minutos','5 Minutos','15 Minutos','30 Minutos','1 Hora','4 Horas','Diário','Semanal'])}${select('Tendência de Mercado','trend',['Alta','Baixa','Lateral'])}</div>${area('Contexto de mercado','notes','Notícias, suportes, resistências, VWAP, GEX...',5)}`;
 case 'Revisão':return `${area('Análise pós-operação','review','O trade se desenvolveu como esperado?')}${area('O que fez bem','good')}${area('O que precisa melhorar','improve')}${area('Erros cometidos','mistakes')}${area('Aprendizados','lessons')}<div class="field"><label>Nota Geral</label><div class="mob-stars" aria-label="Avaliação do trade">${[1,2,3,4,5].map(i=>`<button type="button" data-mobile-action="rate" data-rating="${i}" class="${Number(draft.rating)>=i?'on':''}" aria-label="Dar nota ${i}">${Number(draft.rating)>=i?'★':'☆'}</button>`).join('')}</div></div>${field('Tags (separadas por vírgula)','tag','text','placeholder="Ex.: pullback, manhã, tendência"')}${checkbox('favorite','Favoritar este trade','Destacar a operação no diário')}${imageField()}`;
 default:return '';
 }
}
function duration(){if(!draft.start||!draft.end)return 'Calculada automaticamente';const s=draft.start.split(':').map(Number),e=draft.end.split(':').map(Number);let v=e[0]*60+e[1]-s[0]*60-s[1];if(v<0)v+=1440;return `${v>=60?Math.floor(v/60)+'h ':''}${v%60}min`;}
function newView(){
 ensure();
 if(section==='account')return accountForm();
 if(section==='strategy')return strategyForm();
 return `<section class="mob-operation"><h1>Análise / Operação</h1><p class="hint">Cadastre sua operação com os mesmos campos do D_Trading Windows.</p><form id="trade-form" novalidate>${checkbox('noTrade','Hoje não operei','Registre a decisão do dia sem alterar suas estatísticas financeiras.')}${draft.noTrade?`<div class="panel">${field('Data','date','date')}${area('Por que não operei?','notes','Decisões, motivos e aprendizados do dia...')}</div>`:`<div class="mob-tabs" role="tablist" aria-label="Etapas do cadastro">${tabs.map(t=>`<button type="button" role="tab" aria-selected="${tab===t}" data-mobile-action="tab" data-tab="${A(t)}" class="${tab===t?'active':''}">${A(t)}</button>`).join('')}</div><div class="panel mob-form-panel">${content()}</div>`}<div id="mobile-trade-feedback" role="alert" aria-live="polite"></div><div class="mob-submitbar"><button type="button" class="button secondary" data-mobile-action="discard">Cancelar</button><button class="button" type="submit" ${saving?'disabled':''}>${saving?'Salvando...':draft.noTrade?'Registrar dia sem operação':'Registrar Operação'}</button></div></form><p class="mob-helper">Os dados são salvos neste iPhone e enviados ao Supabase. Sem internet, a operação sem print fica pendente; não apague o aplicativo antes da sincronização.</p></section>`;
}
function accountForm(){
 return `<section class="mob-operation"><button class="button secondary" type="button" data-mobile-action="back">← Voltar à operação</button><h1 style="margin-top:15px">Nova Conta</h1><p class="hint">A conta ficará disponível no iPhone e no computador após sincronizar.</p><form id="mobile-account-form" class="panel"><div class="field"><label>Nome da conta</label><input name="name" required maxlength="90" placeholder="Ex.: Pessoal — Escritório"></div><div class="mob-two"><div class="field"><label>Tipo de conta</label><select name="kind"><option>Pessoal</option><option>Mesa Proprietária</option><option>Real</option><option>Demo</option><option>Outros</option></select></div><div class="field"><label>Moeda</label><select name="currency"><option>USD</option><option>BRL</option><option>EUR</option></select></div></div><div class="field"><label>Capital inicial *</label><input required name="initial_capital" type="text" inputmode="decimal" placeholder="Ex.: 1000.00"></div><button class="button" type="submit" style="width:100%">Salvar conta</button></form></section>`;
}
function strategyForm(){
 return `<section class="mob-operation"><button class="button secondary" type="button" data-mobile-action="back">← Voltar à operação</button><h1 style="margin-top:15px">Nova Estratégia</h1><form id="mobile-strategy-form" class="panel"><div class="field"><label>Nome da estratégia</label><input name="name" required maxlength="120" placeholder="Ex.: Variação do Ajuste"></div><button class="button" type="submit" style="width:100%">Salvar estratégia</button></form></section>`;
}
function currentField(e){const el=e.target.closest('[data-mobile-field]');if(!el||!draft)return;const key=el.dataset.mobileField;draft[key]=el.type==='checkbox'?el.checked:el.value;if((key==='start'||key==='end')&&$('mobileDurationComputed'))$('mobileDurationComputed').textContent=duration();if(key==='noTrade')render();if(key==='accountSyncId'){render();}if(['entry','exit','risk','pnl','fees','direction'].includes(key)&&tab==='Resultado'){const box=$('mobileComputed');if(box){const v=computed();box.innerHTML=readOnly('Resultado em Pontos',v.pts)+readOnly('Resultado Líquido',v.net)+readOnly('% sobre capital inicial',v.pct)+readOnly('Resultado R:R',v.rr);}}}
function alertForm(text){const box=$('mobile-trade-feedback');if(box)box.innerHTML=`<div class="notice badnotice">${A(text)}</div>`;toast(text);}
function normalizeNum(v,name,required=false){
 const t=String(v??'').trim().replace(',','.');
 if(!t){if(required)throw Error('Informe '+name);return '';}
 const n=Number(t);
 if(!Number.isFinite(n))throw Error('Valor inválido em '+name);
 return String(n);
}
function addFiles(fileList){const arr=Array.from(fileList||[]).filter(f=>f&&f.size);for(const f of arr){if(!f.type.startsWith('image/')&&!/\.(heic|heif)$/i.test(f.name||'')){toast('Selecione somente imagens');continue;}if(attachments.length>=12){toast('Limite de 12 prints por operação');break;}attachments.push(f);}render();}
async function queue(kind,data,id=crypto.randomUUID()){
 S.queue.push({kind,record_id:id,data,deleted:false});
 await saveCache();
 return id;
}
function resetForm(){draft=null;tab='Análise';section='';attachments=[];saving=false;}
async function saveAccount(e){
 e.preventDefault();if(saving)return;
 const f=new FormData(e.target),name=String(f.get('name')||'').trim(),capital=normalizeNum(f.get('initial_capital'),'o capital inicial',true);
 if(!name||name.length>90)throw Error('Informe um nome de conta válido');
 if(Number(capital)<0)throw Error('Capital inicial não pode ser negativo');
 if(accounts().some(x=>x.name.trim().toLowerCase()===name.toLowerCase()))throw Error('Essa conta já existe');
 saving=true;try{const id=await queue('account',{name,kind:String(f.get('kind')||'Pessoal'),initial_capital:Number(capital),currency:String(f.get('currency')||'USD'),created:new Date().toISOString()});draft.accountSyncId=id;section='';render();toast('Conta salva no iPhone. Sincronizando...');if(navigator.onLine)await sync();}finally{saving=false;}
}
async function saveStrategy(e){
 e.preventDefault();if(saving)return;
 const name=String(new FormData(e.target).get('name')||'').trim();
 if(!name||name.length>120)throw Error('Informe o nome da estratégia');
 if(strategies().some(x=>x.name.trim().toLowerCase()===name.toLowerCase()))throw Error('Essa estratégia já existe');
 saving=true;try{await queue('strategy',{name});draft.strategy=name;section='';render();toast('Estratégia salva no iPhone. Sincronizando...');if(navigator.onLine)await sync();}finally{saving=false;}
}
async function saveOperation(e){
 e.preventDefault();if(saving||S.busy){alertForm('Sincronização em andamento. Tente novamente.');return;}
 ensure();
 try{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(draft.date||''))throw Error('Informe a data na aba Básico');
 if(!draft.noTrade){
  if(!String(draft.asset||'').trim()){tab='Básico';render();throw Error('Informe o ativo na aba Básico');}
  if(!accounts().some(ac=>ac.id===draft.accountSyncId)){tab='Básico';render();throw Error('Selecione uma conta ou crie uma nova');}
 }
 const payload={...draft,images:[]};
 if(draft.noTrade){payload.accountSyncId=null;payload.asset='';payload.pnl='0';payload.fees='0';}
 else {
  for(const [key,label] of [['entry','Preço de Entrada'],['exit','Preço de Saída'],['stop','Preço do Stop'],['risk','Risco'],['pnl','Resultado Bruto'],['fees','Taxas'],['target1','Alvo 1'],['target2','Alvo 2'],['target3','Alvo 3']]){
   payload[key]=normalizeNum(payload[key],label,false);
  }
  if(payload.risk!==''&&Number(payload.risk)<0)throw Error('Risco não pode ser negativo');
  for(const key of ['confidence','discipline']){if(payload[key]!==''&&(!Number.isInteger(Number(payload[key]))||Number(payload[key])<0||Number(payload[key])>10))throw Error('Informe '+key+' entre 0 e 10');}
  payload.rr=Number(payload.risk)>0?String((Number(payload.pnl||0)-Number(payload.fees||0))/Math.abs(Number(payload.risk))):'';
 }
 saving=true;
 const btn=e.target.querySelector('button[type=submit]');if(btn){btn.disabled=true;btn.textContent='Salvando...';}
 if(attachments.length&&!navigator.onLine)throw Error('Para salvar com prints, conecte à internet ou remova os prints. Seus dados continuam preenchidos.');
 for(const f of attachments)payload.images.push(await uploadImage(f));
 await queue('trade',{payload,created:new Date().toISOString(),updated:new Date().toISOString()});
 resetForm();S.view='feed';render();toast(navigator.onLine?'Operação salva. Enviando à nuvem...':'Operação salva offline, pendente de sincronização.');
 if(navigator.onLine)await sync();
 }catch(err){alertForm(err.message||'Erro ao salvar');}finally{saving=false;const b=$('trade-form button[type=submit]');if(b){b.disabled=false;b.textContent=draft?.noTrade?'Registrar dia sem operação':'Registrar Operação';}}
}
newTrade=function enhancedNewTrade(){return newView();};
saveTrade=function enhancedSaveTrade(e){return saveOperation(e);};
document.addEventListener('input',currentField);
document.addEventListener('change',e=>{
 if(e.target.matches('[data-mobile-upload]')){addFiles(e.target.files);return;}
 if(e.target.matches('[data-mobile-field]'))currentField(e);
});
document.addEventListener('paste',e=>{
 if(S.view!=='new'||!draft||section)return;
 const files=Array.from(e.clipboardData?.files||[]).filter(f=>f.type.startsWith('image/'));
 if(files.length){e.preventDefault();addFiles(files);}
});
document.addEventListener('click',e=>{
 const el=e.target.closest('[data-mobile-action]');if(!el)return;
 const act=el.dataset.mobileAction;
 if(act==='tab'){tab=el.dataset.tab;render();window.scrollTo(0,0);}
 else if(act==='account'||act==='strategy'){section=act;render();window.scrollTo(0,0);}
 else if(act==='back'){section='';render();}
 else if(act==='rate'){draft.rating=Number(el.dataset.rating);render();}
 else if(act==='removeFile'){attachments.splice(Number(el.dataset.index),1);render();}
 else if(act==='discard'){if((Object.keys(draft||{}).some(k=>draft[k]!==dt()[k]&&k!=='start')||attachments.length)&&!confirm('Descartar os dados desta operação?'))return;resetForm();S.view='feed';render();}
});
document.addEventListener('submit',e=>{
 if(e.target.id==='mobile-account-form'){e.preventDefault();saveAccount(e).catch(err=>alertForm(err.message));}
 else if(e.target.id==='mobile-strategy-form'){e.preventDefault();saveStrategy(e).catch(err=>alertForm(err.message));}
});
})();