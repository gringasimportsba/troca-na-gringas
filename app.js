const models=['iPhone 11','iPhone 11 Pro','iPhone 11 Pro Max','iPhone 12','iPhone 12 Pro','iPhone 12 Pro Max','iPhone 13','iPhone 13 Pro','iPhone 13 Pro Max','iPhone 14','iPhone 14 Pro','iPhone 14 Pro Max','iPhone 15','iPhone 15 Pro','iPhone 15 Pro Max','iPhone 16','iPhone 16 Pro','iPhone 16 Pro Max','iPhone 17','iPhone 17 Pro','iPhone 17 Pro Max'];
const storageMap={
'iPhone 11':['64 GB','128 GB','256 GB'],'iPhone 11 Pro':['64 GB','256 GB','512 GB'],'iPhone 11 Pro Max':['64 GB','256 GB','512 GB'],
'iPhone 12':['64 GB','128 GB','256 GB'],'iPhone 12 Pro':['128 GB','256 GB','512 GB'],'iPhone 12 Pro Max':['128 GB','256 GB','512 GB'],
'iPhone 13':['128 GB','256 GB','512 GB'],'iPhone 13 Pro':['128 GB','256 GB','512 GB','1 TB'],'iPhone 13 Pro Max':['128 GB','256 GB','512 GB','1 TB'],
'iPhone 14':['128 GB','256 GB','512 GB'],'iPhone 14 Pro':['128 GB','256 GB','512 GB','1 TB'],'iPhone 14 Pro Max':['128 GB','256 GB','512 GB','1 TB'],
'iPhone 15':['128 GB','256 GB','512 GB'],'iPhone 15 Pro':['128 GB','256 GB','512 GB','1 TB'],'iPhone 15 Pro Max':['256 GB','512 GB','1 TB'],
'iPhone 16':['128 GB','256 GB','512 GB'],'iPhone 16 Pro':['128 GB','256 GB','512 GB','1 TB'],'iPhone 16 Pro Max':['256 GB','512 GB','1 TB'],
'iPhone 17':['256 GB','512 GB'],'iPhone 17 Pro':['256 GB','512 GB','1 TB'],'iPhone 17 Pro Max':['256 GB','512 GB','1 TB']};

// VALORES DEMONSTRATIVOS para testar o motor 5.2. Antes de uso público, substituir pelos valores reais da Gringas.
const baseByModel={
'iPhone 11':900,'iPhone 11 Pro':1150,'iPhone 11 Pro Max':1350,'iPhone 12':1250,'iPhone 12 Pro':1550,'iPhone 12 Pro Max':1800,
'iPhone 13':1750,'iPhone 13 Pro':2200,'iPhone 13 Pro Max':2500,'iPhone 14':2250,'iPhone 14 Pro':2850,'iPhone 14 Pro Max':3250,
'iPhone 15':2850,'iPhone 15 Pro':3650,'iPhone 15 Pro Max':4250,'iPhone 16':3500,'iPhone 16 Pro':4550,'iPhone 16 Pro Max':5350,
'iPhone 17':4300,'iPhone 17 Pro':5700,'iPhone 17 Pro Max':6500};
const storageBonus={'64 GB':0,'128 GB':100,'256 GB':250,'512 GB':500,'1 TB':800};
const conditionDiscount={'Excelente':0,'Bom':100,'Regular':300,'Danificado':0};
const screenDiscount={'Sim, perfeitamente':0,'Possui riscos/manchas':180,'Está trincada':0,'Possui problema no touch':0,'Tela já foi substituída':220};
const issueDiscount={'Face ID / Touch ID':0,'Câmeras':350,'Alto-falantes':160,'Microfones':160,'Botões':120,'Wi‑Fi / Bluetooth':300,'Carregamento':250};
const manualReasons={condition:new Set(['Danificado']),screen:new Set(['Está trincada','Possui problema no touch']),issues:new Set(['Face ID / Touch ID'])};

const initialState=()=>({step:0,model:'',storage:'',battery:87,condition:'',screen:'',issues:[],repair:'',partAlert:'',warranty:'',warrantyDate:'',appleCare:'',notes:'',accessories:[],name:'',phone:'',service:'WhatsApp',photos:{},evaluationId:''});
const state=initialState();
const screen=document.getElementById('screen'),back=document.getElementById('backBtn');
document.getElementById('restartBtn').onclick=()=>{Object.assign(state,initialState());render()};
back.onclick=()=>{if(state.step>0){state.step--;render()}};
const esc=s=>String(s||'').replace(/[&<>\"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[m]));
const money=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0}).format(Math.max(0,Math.round(n)));
function progress(n,total=11){return `<div class="progress-wrap"><div class="progress-meta"><span>AVALIAÇÃO</span><b>${n} de ${total}</b></div><div class="progress"><span style="width:${Math.round(n/total*100)}%"></span></div></div>`}
function shell(n,title,sub,body,footer=''){return `<section class="screen">${progress(n)}<h1 class="question">${title}</h1>${sub?`<p class="sub">${sub}</p>`:''}${body}<div class="footer-actions">${footer}</div></section>`}
function next(){state.step++;render()}
function button(label='CONTINUAR →',cls='primary'){return `<button class="${cls}" data-next>${label}</button>`}
function bind(){document.querySelectorAll('[data-next]').forEach(b=>b.onclick=next)}
function render(){back.classList.toggle('hidden',state.step===0);if(state.step===0){screen.innerHTML=document.getElementById('welcome').innerHTML}else if(state.step===1)modelStep();else if(state.step===2)storageStep();else if(state.step===3)batteryStep();else if(state.step===4)conditionStep();else if(state.step===5)screenStep();else if(state.step===6)functionsStep();else if(state.step===7)repairStep();else if(state.step===8)warrantyStep();else if(state.step===9)photosStep();else if(state.step===10)notesStep();else if(state.step===11)dataStep();else reviewStep();bind()}
function modelStep(){screen.innerHTML=shell(1,'Qual iPhone você tem?','Escolha o modelo do aparelho que você quer usar na troca.',`<div class="choices model-grid">${models.map(m=>`<button class="choice model-card ${state.model===m?'selected':''}" data-model="${m}"><span class="mini-phone"></span><strong>${m}</strong><span class="radio"></span></button>`).join('')}</div>`,state.model?button():button('ESCOLHA UM MODELO','primary disabled'));document.querySelectorAll('[data-model]').forEach(b=>b.onclick=()=>{state.model=b.dataset.model;state.storage='';render()})}
function storageStep(){const opts=storageMap[state.model]||['128 GB','256 GB','512 GB','1 TB'];screen.innerHTML=shell(2,'Qual a capacidade do seu iPhone?','Mostraremos apenas opções compatíveis com o modelo escolhido.',`<div class="choices">${opts.map(v=>`<button class="choice ${state.storage===v?'selected':''}" data-storage="${v}"><strong>${v}</strong><span class="radio"></span></button>`).join('')}</div>`,state.storage?button():button('ESCOLHA A CAPACIDADE'));document.querySelectorAll('[data-storage]').forEach(b=>b.onclick=()=>{state.storage=b.dataset.storage;render()})}
function batteryStep(){const display=typeof state.battery==='number'?`${state.battery}%`:'—';screen.innerHTML=shell(3,'Qual a saúde da bateria?','Informe a capacidade máxima mostrada nos Ajustes do seu iPhone.',`<div class="battery-card"><div class="battery-icon"><span style="width:${typeof state.battery==='number'?state.battery:0}%"></span></div><div class="battery-value">${display}</div><input class="range" id="battery" type="range" min="50" max="100" value="${typeof state.battery==='number'?state.battery:87}"><div class="help"><b>Como verificar?</b><br>Ajustes → Bateria → Saúde da Bateria</div></div>`,`${button()}<button class="secondary" id="unknownBattery">NÃO CONSIGO VERIFICAR</button>`);document.getElementById('battery').oninput=e=>{state.battery=+e.target.value;render()};document.getElementById('unknownBattery').onclick=()=>{state.battery='Não informado';next()}}
function conditionStep(){const a=[['Excelente','Praticamente sem marcas de uso.'],['Bom','Pequenas marcas normais de uso.'],['Regular','Riscos ou marcas aparentes.'],['Danificado','Trincas, amassados ou danos importantes.']];screen.innerHTML=shell(4,'Como está seu iPhone?','Escolha a opção que mais se aproxima do estado físico atual.',`<div class="choices">${a.map(([x,d])=>`<button class="choice ${state.condition===x?'selected':''}" data-v="${x}"><div><strong>${x}</strong><small>${d}</small></div><span class="radio"></span></button>`).join('')}</div>`,state.condition?button():button('ESCOLHA UMA OPÇÃO'));document.querySelectorAll('[data-v]').forEach(b=>b.onclick=()=>{state.condition=b.dataset.v;render()})}
function screenStep(){const a=['Sim, perfeitamente','Possui riscos/manchas','Está trincada','Possui problema no touch','Tela já foi substituída'];screen.innerHTML=shell(5,'A tela está funcionando perfeitamente?','Essa informação ajuda a deixar a estimativa mais próxima da avaliação presencial.',`<div class="choices">${a.map(x=>`<button class="choice ${state.screen===x?'selected':''}" data-s="${x}"><strong>${x}</strong><span class="radio"></span></button>`).join('')}</div>`,state.screen?button():button('ESCOLHA UMA OPÇÃO'));document.querySelectorAll('[data-s]').forEach(b=>b.onclick=()=>{state.screen=b.dataset.s;render()})}
function functionsStep(){const a=['Face ID / Touch ID','Câmeras','Alto-falantes','Microfones','Botões','Wi‑Fi / Bluetooth','Carregamento'];screen.innerHTML=shell(6,'Existe algum problema nas seguintes funções?','Ative apenas o que NÃO está funcionando corretamente.',`<div class="toggle-list">${a.map(x=>`<div class="toggle-row"><span>${x}</span><button class="switch ${state.issues.includes(x)?'on':''}" data-issue="${x}"></button></div>`).join('')}</div>`,button());document.querySelectorAll('[data-issue]').forEach(b=>b.onclick=()=>{const x=b.dataset.issue;state.issues=state.issues.includes(x)?state.issues.filter(i=>i!==x):[...state.issues,x];render()})}
function repairStep(){screen.innerHTML=shell(7,'Seu iPhone já passou por manutenção?','Também precisamos saber se existe algum alerta de peça no sistema.',`<div class="field"><label>MANUTENÇÃO</label><div class="choices">${['Não','Sim','Não sei'].map(x=>`<button class="choice ${state.repair===x?'selected':''}" data-r="${x}"><strong>${x}</strong><span class="radio"></span></button>`).join('')}</div></div><div class="field"><label>APRESENTA AVISO DE PEÇA?</label><div class="choices">${['Não','Sim','Não sei'].map(x=>`<button class="choice ${state.partAlert===x?'selected':''}" data-p="${x}"><strong>${x}</strong><span class="radio"></span></button>`).join('')}</div></div>`,state.repair&&state.partAlert?button():button('RESPONDA AS DUAS PERGUNTAS'));document.querySelectorAll('[data-r]').forEach(b=>b.onclick=()=>{state.repair=b.dataset.r;render()});document.querySelectorAll('[data-p]').forEach(b=>b.onclick=()=>{state.partAlert=b.dataset.p;render()})}
function warrantyStep(){
 const choices=['Sim','Não','Não sei'];
 screen.innerHTML=shell(8,'Seu aparelho ainda possui garantia Apple?','A garantia não define o valor sozinha, mas fica registrada para a análise da Gringas.',
 `<div class="choices">${choices.map(x=>`<button class="choice ${state.warranty===x?'selected':''}" data-w="${x}"><strong>${x}</strong><span class="radio"></span></button>`).join('')}</div>
 ${state.warranty==='Sim'?`<div class="field" style="margin-top:16px"><label>GARANTIA VÁLIDA ATÉ</label><input type="date" id="wdate" value="${state.warrantyDate}"></div>
 <div class="field"><label>POSSUI APPLECARE+?</label><div class="choices">${choices.map(x=>`<button class="choice ${state.appleCare===x?'selected':''}" data-ac="${x}"><strong>${x}</strong><span class="radio"></span></button>`).join('')}</div></div>`:''}
 <div class="note" style="margin-top:14px">Garantia e AppleCare+ são informações de apoio e não aumentam automaticamente a estimativa nesta versão.</div>`,
 state.warranty?button():button('ESCOLHA UMA OPÇÃO'));
 document.querySelectorAll('[data-w]').forEach(b=>b.onclick=()=>{state.warranty=b.dataset.w;if(state.warranty!=='Sim'){state.warrantyDate='';state.appleCare='';}render()});
 const wd=document.getElementById('wdate');if(wd)wd.onchange=e=>state.warrantyDate=e.target.value;
 document.querySelectorAll('[data-ac]').forEach(b=>b.onclick=()=>{state.appleCare=b.dataset.ac;render()});
}
function photosStep(){
 const requiredOk=!!(state.photos.front&&state.photos.back);
 screen.innerHTML=shell(9,'Agora queremos conhecer seu aparelho.','Frente e traseira são obrigatórias. As demais fotos ajudam a Gringas a conferir o estado informado.',
 `<div class="photo-grid">${photo('front','Frente','obrigatória')}${photo('back','Traseira','obrigatória')}${photo('left','Lateral esquerda','opcional')}${photo('right','Lateral direita','opcional')}${photo('detail','Avaria / detalhe','opcional')}</div>
 <div class="note" style="margin-top:14px">Você pode tirar a foto na hora pelo celular ou escolher uma imagem da galeria. As fotos não alteram o valor automaticamente.</div>`,
 requiredOk?button():button('ENVIE FRENTE E TRASEIRA','primary disabled'));
 document.querySelectorAll('.photo-box input').forEach(i=>i.onchange=e=>{
   const f=e.target.files[0];if(!f)return;
   if(f.size>6*1024*1024){alert('Escolha uma foto de até 6 MB.');return;}
   const r=new FileReader();r.onload=ev=>{state.photos[i.dataset.key]=ev.target.result;render()};r.readAsDataURL(f)
 });
 document.querySelectorAll('[data-remove-photo]').forEach(b=>b.onclick=e=>{e.preventDefault();e.stopPropagation();delete state.photos[b.dataset.removePhoto];render()});
}
function photo(k,title,note){return `<div class="photo-wrap"><label class="photo-box">${state.photos[k]?`<img src="${state.photos[k]}">`:`<div><div class="photo-plus">＋</div><b>${title}</b><br><small>${note}</small></div>`}<input type="file" accept="image/*" capture="environment" data-key="${k}"></label>${state.photos[k]?`<button type="button" class="photo-remove" data-remove-photo="${k}">REMOVER</button>`:''}</div>`}
function notesStep(){
 const acc=['Caixa','Cabo','Nota fiscal'];
 screen.innerHTML=shell(10,'Tem algo importante que devemos saber?','Conte sobre marcas, reparos ou qualquer outra informação útil.',
 `<div class="field"><textarea id="notes" maxlength="500" placeholder="Ex.: Troquei a bateria há 4 meses na Apple. Pequena marca na lateral direita...">${esc(state.notes)}</textarea><div class="counter"><span id="count">${state.notes.length}</span>/500</div></div>
 <div class="field"><label>O QUE ACOMPANHA O APARELHO?</label><p class="sub" style="margin-top:4px">Não se preocupe: você pode avaliar somente o aparelho.</p><div class="choices">${acc.map(x=>`<button class="choice ${state.accessories.includes(x)?'selected':''}" data-acc="${x}"><strong>${x}</strong><span class="radio"></span></button>`).join('')}<button class="choice ${state.accessories.length===0?'selected':''}" id="noAccessories"><strong>Nenhum</strong><span class="radio"></span></button></div></div>`,
 `${button()}<button class="secondary" id="noNotes">NÃO TENHO OBSERVAÇÕES</button>`);
 const t=document.getElementById('notes');t.oninput=e=>{state.notes=e.target.value;document.getElementById('count').textContent=e.target.value.length};
 document.querySelectorAll('[data-acc]').forEach(b=>b.onclick=()=>{const x=b.dataset.acc;state.accessories=state.accessories.includes(x)?state.accessories.filter(a=>a!==x):[...state.accessories,x];render()});
 document.getElementById('noAccessories').onclick=()=>{state.accessories=[];render()};
 document.getElementById('noNotes').onclick=()=>{state.notes='';next()};
}
function dataStep(){screen.innerHTML=shell(11,'Estamos quase lá. 🔥','Deixe seus dados para identificarmos a avaliação e entrarmos em contato.',`<div class="field"><label>NOME COMPLETO</label><input id="name" value="${esc(state.name)}" placeholder="Seu nome"></div><div class="field"><label>WHATSAPP</label><input id="phone" value="${esc(state.phone)}" placeholder="(71) 99999-9999" inputmode="tel"></div><div class="field"><label>COMO PREFERE SER ATENDIDO?</label><div class="choices">${['WhatsApp','Loja física'].map(x=>`<button class="choice ${state.service===x?'selected':''}" data-service="${x}"><strong>${x}</strong><span class="radio"></span></button>`).join('')}</div></div><div class="note">Ao continuar, você confirma que as informações fornecidas são verdadeiras e autoriza a Gringas a utilizá-las para realizar esta avaliação.</div>`,button('CALCULAR MINHA AVALIAÇÃO →','primary gold'));document.getElementById('name').oninput=e=>state.name=e.target.value;document.getElementById('phone').oninput=e=>state.phone=e.target.value;document.querySelectorAll('[data-service]').forEach(b=>b.onclick=()=>{state.service=b.dataset.service;render()})}

function batteryPenalty(v){if(typeof v!=='number')return {amount:0,label:'Bateria não informada',manual:true};if(v>=90)return {amount:0,label:`Bateria ${v}%`,manual:false};if(v>=85)return {amount:100,label:`Bateria ${v}%`,manual:false};if(v>=80)return {amount:220,label:`Bateria ${v}%`,manual:false};return {amount:400,label:`Bateria ${v}%`,manual:false}}
function calculate(){
 const base=(baseByModel[state.model]||0)+(storageBonus[state.storage]||0);let totalDiscount=0;const lines=[];const reasons=[];
 const add=(label,amount)=>{if(amount>0){totalDiscount+=amount;lines.push({label,amount})}};
 const bp=batteryPenalty(state.battery);add(bp.label,bp.amount);if(bp.manual)reasons.push('Saúde da bateria não informada');
 add(`Estado físico: ${state.condition}`,conditionDiscount[state.condition]||0);if(manualReasons.condition.has(state.condition))reasons.push('Estado físico danificado');
 add(`Tela: ${state.screen}`,screenDiscount[state.screen]||0);if(manualReasons.screen.has(state.screen))reasons.push(`Tela: ${state.screen}`);
 state.issues.forEach(i=>{add(`Função: ${i}`,issueDiscount[i]||0);if(manualReasons.issues.has(i))reasons.push(`${i} com problema`)});
 if(state.repair==='Sim')add('Histórico de manutenção',100);
 if(state.partAlert==='Sim')reasons.push('Aviso de peça no sistema');
 if(state.partAlert==='Não sei')reasons.push('Alerta de peça precisa ser verificado');
 const cap=Math.round(base*.30);if(totalDiscount>cap)reasons.push('Descontos ultrapassam 30% do valor-base');
 const estimated=Math.max(0,base-Math.min(totalDiscount,cap));
 const manual=[...new Set(reasons)];
 return {base,totalDiscount,cap,estimated,manual,lines,isManual:manual.length>0};
}
function makeId(){if(!state.evaluationId)state.evaluationId='GT-'+String(Math.floor(10000+Math.random()*89999));return state.evaluationId}
function formatDateBR(v){if(!v)return '';const [y,m,d]=v.split('-');return `${d}/${m}/${y}`}

const HISTORY_KEY='gringasTrocaEvaluationsV55';
function evaluationHistory(){
  try{return JSON.parse(localStorage.getItem(HISTORY_KEY)||'[]')}catch(e){return []}
}
function persistEvaluation(calc){
  const id=makeId();
  const record={
    id,
    createdAt:new Date().toISOString(),
    updatedAt:new Date().toISOString(),
    status:'Nova',
    customer:{name:state.name||'Cliente',phone:state.phone||'',service:state.service||'WhatsApp'},
    device:{model:state.model,storage:state.storage,battery:state.battery,condition:state.condition,screen:state.screen,issues:[...state.issues],repair:state.repair,partAlert:state.partAlert},
    warranty:{status:state.warranty,date:state.warrantyDate,appleCare:state.appleCare},
    accessories:[...state.accessories],
    notes:state.notes||'',
    photos:{...state.photos},
    calculation:{base:calc.base,totalDiscount:calc.totalDiscount,estimated:calc.estimated,isManual:calc.isManual,manual:[...calc.manual],lines:[...calc.lines]},
    approvedValue:null,
    adjustmentReason:'',
    upgrade:null
  };
  const items=evaluationHistory();
  const ix=items.findIndex(x=>x.id===id);
  if(ix>=0){
    // Keep operational fields that the admin may already have changed.
    record.status=items[ix].status||record.status;
    record.approvedValue=items[ix].approvedValue ?? null;
    record.adjustmentReason=items[ix].adjustmentReason||'';
    record.upgrade=items[ix].upgrade||null;
    record.createdAt=items[ix].createdAt||record.createdAt;
    items[ix]=record;
  }else items.unshift(record);
  try{
    localStorage.setItem(HISTORY_KEY,JSON.stringify(items.slice(0,150)));
  }catch(e){
    // If photos overflow browser storage, keep the complete evaluation without image bytes.
    record.photos={};
    record.photoStorageWarning=true;
    if(ix>=0)items[ix]=record; else items[0]=record;
    try{localStorage.setItem(HISTORY_KEY,JSON.stringify(items.slice(0,150)))}catch(_){}
  }
  try{
    if(window.GringasCloud?.configured){
      window.GringasCloud.saveEvaluation(record).then(r=>{
        if(r?.mode==='error') console.warn('Avaliação salva localmente, mas houve erro na nuvem.',r.error);
      });
    }
  }catch(e){console.warn('Nuvem indisponível; avaliação preservada localmente.',e)}
  return record;
}
function updateEvaluationUpgrade(data){
  const items=evaluationHistory();
  const ix=items.findIndex(x=>x.id===data.code);
  if(ix<0)return;
  items[ix].upgrade={
    productId:data.productId||'',
    productName:data.productName||'',
    storage:data.storage||'',
    tradeValue:data.tradeValue||items[ix].calculation?.estimated||0,
    difference:data.difference,
    selectedAt:new Date().toISOString()
  };
  items[ix].updatedAt=new Date().toISOString();
  try{localStorage.setItem(HISTORY_KEY,JSON.stringify(items))}catch(e){}
  try{
    if(window.GringasCloud?.configured){
      window.GringasCloud.updateUpgrade(data.code,data).catch(e=>console.warn('Upgrade não sincronizado na nuvem',e));
    }
  }catch(e){}
}

function reviewStep(){
const c=calculate();const id=makeId();const record=persistEvaluation(c);const wa=window.open("about:blank","_blank");(async()=>{const p=record.photos||{};const front=p.front?await window.GringasCloud.signedPhotoUrl(p.front,86400):"";const back=p.back?await window.GringasCloud.signedPhotoUrl(p.back,86400):"";const msg=`🚨 *NOVA AVALIAÇÃO — GRINGAS TROCA*\n\n📋 *DADOS DO CLIENTE*\n👤 Cliente: ${record.customer?.name||"Não informado"}\n📱 Aparelho: ${record.device?.model||"Não informado"}\n💾 Armazenamento: ${record.device?.storage||"Não informado"}\n🔋 Bateria: ${record.device?.battery??"Não informado"}${record.device?.battery!=null?"%":""}\n\n💰 *AVALIAÇÃO*\n💵 Valor estimado: *${money(record.calculation?.estimated||0)}*\n\n📸 *FOTOS DO APARELHO*\n${front?"➡️ Frente: "+front:"➡️ Frente: não disponível"}\n${back?"➡️ Traseira: "+back:"➡️ Traseira: não disponível"}\n\n🆔 Código: *${record.id}*\n\n🔗 A avaliação já está disponível no painel *Gringas Troca*.`;const url="https://wa.me/5571999498939?text="+encodeURIComponent(msg);if(wa)wa.location.href=url;else window.location.href=url;})();back.classList.add("hidden");
 const photoCount=Object.keys(state.photos).length;
 const warrantyLine=state.warranty==='Sim'?`Sim${state.warrantyDate?' • até '+formatDateBR(state.warrantyDate):''}`:(state.warranty||'Não informado');
 const appleLine=state.warranty==='Sim'?(state.appleCare||'Não informado'):'—';
 const accessoriesLine=state.accessories.length?state.accessories.join(', '):'Somente aparelho';
 screen.innerHTML=`<section class="screen result-screen"><div class="result-kicker">SUA AVALIAÇÃO FICOU PRONTA</div><div class="result-device"><span class="result-phone-art"></span><div><b>${esc(state.model)}</b><small>${esc(state.storage)}</small></div></div>${c.isManual?`<div class="manual-card"><span>ANÁLISE ESPECIAL</span><h1>Precisamos confirmar alguns detalhes do seu iPhone.</h1><p>Com base nas suas respostas, a Gringas fará uma análise rápida antes de confirmar o valor. Sua referência inicial é de <b>${money(c.estimated)}</b>.</p></div>`:`<div class="value-label">SEU IPHONE PODE VALER ATÉ</div><div class="result-value">${money(c.estimated)}</div><div class="value-sub">como entrada na Gringas.</div><div class="result-callout">🔥 Seu próximo iPhone está mais perto.</div>`}<div class="evaluation-code">Avaliação <b>${id}</b></div><div class="demo-warning">⚠️ PASSO 5.6 — valores demonstrativos para testar o motor. Não usar como tabela comercial.</div>
 <div class="summary-card"><h3>Dados complementares</h3><div class="summary-row"><span>📸 Fotos</span><b>${photoCount}</b></div><div class="summary-row"><span>🍎 Garantia Apple</span><b>${esc(warrantyLine)}</b></div><div class="summary-row"><span>🛡️ AppleCare+</span><b>${esc(appleLine)}</b></div><div class="summary-row"><span>📦 Acompanha</span><b>${esc(accessoriesLine)}</b></div><div class="summary-notes"><span>📝 Observações</span><p>${state.notes?esc(state.notes):'Nenhuma observação.'}</p></div></div>
 <div class="footer-actions result-actions"><button class="primary gold" id="upgrade">QUERO FAZER MEU UPGRADE →</button><button class="secondary" id="diagnostic">VER DIAGNÓSTICO DO CÁLCULO</button><button class="secondary" id="edit">VOLTAR E EDITAR</button></div><p class="legal">Valor estimado com base nas informações fornecidas. O valor definitivo será confirmado após avaliação física e testes realizados pela Gringas.</p></section>`;
 document.getElementById('edit').onclick=()=>{back.classList.remove('hidden');state.step=11;render()};document.getElementById('diagnostic').onclick=()=>diagnosticStep(c);document.getElementById('upgrade').onclick=()=>upgradeStep(c);
}
function diagnosticStep(c){screen.innerHTML=`<section class="screen"><span class="pill">DIAGNÓSTICO 5.6</span><h1 class="question" style="margin-top:18px">Como o sistema chegou ao valor.</h1><p class="sub">Esta tela é só para você validar o motor; o cliente final não precisa vê-la.</p><div class="calc-card"><div class="calc-row"><span>Valor-base demonstrativo</span><b>${money(c.base)}</b></div>${c.lines.length?c.lines.map(x=>`<div class="calc-row deduction"><span>${esc(x.label)}</span><b>− ${money(x.amount)}</b></div>`).join(''):`<div class="calc-row"><span>Descontos automáticos</span><b>R$ 0</b></div>`}<div class="calc-row total"><span>Estimativa</span><b>${money(c.estimated)}</b></div></div>${c.isManual?`<div class="manual-reasons"><b>Encaminhado para análise manual porque:</b>${c.manual.map(r=>`<span>• ${esc(r)}</span>`).join('')}</div>`:`<div class="success-note">✓ Nenhuma regra de análise manual foi acionada.</div>`}<div class="footer-actions"><button class="primary" id="backResult">VOLTAR AO RESULTADO →</button></div></section>`;document.getElementById('backResult').onclick=reviewStep}
function upgradeStep(){showUpgrade(getResultRoot());}
render();


/* ===== PASSO 5.4 — EXPERIÊNCIA DE UPGRADE ===== */
(function(){
  const UPGRADE_KEY = 'gringasTrocaV54Upgrade';
  const upgradeProducts = [
    { id:'18', name:'iPhone 18', storage:'256GB', price: 6299 },
    { id:'18pro', name:'iPhone 18 Pro', storage:'256GB', price: 8499 },
    { id:'18promax', name:'iPhone 18 Pro Max', storage:'256GB', price: 9499 },
    { id:'undecided', name:'Ainda não decidi', storage:'', price: null }
  ];

  function money(v){
    return Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL',minimumFractionDigits:0,maximumFractionDigits:0});
  }
  function installment(v){
    // Demonstrative simple split; final commercial financing/card rules come later.
    return (Number(v||0)/12).toLocaleString('pt-BR',{style:'currency',currency:'BRL',minimumFractionDigits:2,maximumFractionDigits:2});
  }
  function getResultRoot(){
    const candidates=[...document.querySelectorAll('main, #screen, .screen, section, body > div')];
    return candidates.find(el=>{
      const t=(el.innerText||'').toLowerCase();
      return t.includes('seu iphone pode valer até') && t.includes('avaliação gt-');
    });
  }
  function parseTradeValue(root){
    const text=root.innerText||'';
    const m=text.match(/R\$\s*([\d.]+(?:,\d{2})?)/);
    if(!m) return 0;
    return Number(m[1].replace(/\./g,'').replace(',','.'))||0;
  }
  function parseCode(root){
    const m=(root.innerText||'').match(/GT-\d+/i);
    return m?m[0].toUpperCase():'GT-00000';
  }
  function load(){
    try{return JSON.parse(localStorage.getItem(UPGRADE_KEY)||'{}')}catch(e){return {}}
  }
  function save(v){try{localStorage.setItem(UPGRADE_KEY,JSON.stringify(v))}catch(e){}; try{updateEvaluationUpgrade(v)}catch(e){}}

  function buildUpgrade(root){
    if(root.dataset.v54upgrade==='1') return;
    const trigger=[...root.querySelectorAll('button')].find(b=>(b.innerText||'').toLowerCase().includes('quero fazer meu upgrade'));
    if(!trigger) return;
    root.dataset.v54upgrade='1';
    trigger.addEventListener('click', function(ev){
      ev.preventDefault();
      showUpgrade(root);
    });
  }

  function showUpgrade(root){
    const trade=parseTradeValue(root);
    const code=parseCode(root);
    const saved=load();
    let modal=document.getElementById('v54Upgrade');
    if(modal) modal.remove();

    modal=document.createElement('div');
    modal.id='v54Upgrade';
    modal.className='v54-overlay';
    modal.innerHTML=`
      <div class="v54-shell">
        <div class="v54-top">
          <button class="v54-back" type="button">←</button>
          <div><strong>GRINGAS</strong><span>TROCA</span></div>
          <span class="v54-code">${code}</span>
        </div>
        <div class="v54-progress"><i></i></div>
        <div class="v54-content">
          <div class="v54-kicker">SEU UPGRADE</div>
          <h2>Agora escolha seu próximo iPhone.</h2>
          <p class="v54-sub">Seu aparelho já entra com crédito estimado de <strong>${money(trade)}</strong>.</p>
          <div class="v54-products"></div>
          <div class="v54-summary" hidden></div>
          <button type="button" class="v54-continue" disabled>CONTINUAR →</button>
          <p class="v54-note">Valores dos aparelhos novos são demonstrativos nesta etapa. Condições comerciais reais serão cadastradas no painel da Gringas.</p>
        </div>
      </div>`;
    document.body.appendChild(modal);

    const products=modal.querySelector('.v54-products');
    let selected=saved.productId || '';
    upgradeProducts.forEach(p=>{
      const b=document.createElement('button');
      b.type='button'; b.className='v54-product'+(selected===p.id?' active':'');
      b.innerHTML=`<div><strong>${p.name}</strong>${p.storage?`<span>${p.storage}</span>`:''}</div>
        <div class="v54-product-price">${p.price?money(p.price):'Quero ajuda'}<small>${p.price?'preço demonstrativo':''}</small></div>`;
      b.onclick=()=>{
        selected=p.id;
        [...products.children].forEach(x=>x.classList.remove('active'));
        b.classList.add('active');
        modal.querySelector('.v54-continue').disabled=false;
        renderSummary();
      };
      products.appendChild(b);
    });

    const cont=modal.querySelector('.v54-continue');
    if(selected){cont.disabled=false;renderSummary();}
    modal.querySelector('.v54-back').onclick=()=>modal.remove();

    function renderSummary(){
      const p=upgradeProducts.find(x=>x.id===selected);
      const box=modal.querySelector('.v54-summary');
      if(!p || !p.price){
        box.hidden=false;
        box.innerHTML=`<div class="v54-summary-title">Ainda não decidiu?</div>
          <p>Sem problema. A avaliação <strong>${code}</strong> continua salva e a equipe Gringas pode ajudar você a escolher.</p>`;
        return;
      }
      const diff=Math.max(0,p.price-trade);
      const creditOver=Math.max(0,trade-p.price);
      box.hidden=false;
      box.innerHTML=`
        <div class="v54-summary-title">Sua troca</div>
        <div class="v54-row"><span>${p.name} ${p.storage}</span><strong>${money(p.price)}</strong></div>
        <div class="v54-row credit"><span>Seu iPhone como entrada</span><strong>− ${money(Math.min(trade,p.price))}</strong></div>
        <div class="v54-divider"></div>
        ${diff>0?`
          <div class="v54-paylabel">VOCÊ COMPLETA</div>
          <div class="v54-difference">${money(diff)}</div>
          <div class="v54-or">ou <strong>12x de ${installment(diff)}</strong>*</div>
        `:`
          <div class="v54-paylabel">SEU CRÉDITO COBRE ESTE APARELHO</div>
          <div class="v54-difference">${money(creditOver)} <small>de saldo estimado</small></div>
        `}
        <div class="v54-disclaimer">*Parcelamento apenas ilustrativo no Passo 5.4. A condição real será definida pela Gringas.</div>`;
    }

    cont.onclick=()=>{
      const p=upgradeProducts.find(x=>x.id===selected);
      const diff=p?.price?Math.max(0,p.price-trade):null;
      save({productId:selected, productName:p?.name||'', storage:p?.storage||'', tradeValue:trade, difference:diff, code});
      showLeadReady(modal,p,trade,diff,code);
    };
  }

  function showLeadReady(modal,p,trade,diff,code){
    const c=modal.querySelector('.v54-content');
    c.innerHTML=`
      <div class="v54-successmark">✓</div>
      <div class="v54-kicker">UPGRADE SELECIONADO</div>
      <h2>${p?.id==='undecided'?'Vamos ajudar você a escolher.':'Seu próximo iPhone está ainda mais perto.'}</h2>
      <div class="v54-final-card">
        <div class="v54-final-code">Avaliação <strong>${code}</strong></div>
        <div class="v54-final-line"><span>Crédito estimado do seu iPhone</span><strong>${money(trade)}</strong></div>
        <div class="v54-final-line"><span>Interesse</span><strong>${p?.name||'Não definido'} ${p?.storage||''}</strong></div>
        ${diff!==null?`<div class="v54-final-highlight"><span>Diferença estimada</span><strong>${money(diff)}</strong><small>ou 12x de ${installment(diff)}*</small></div>`:''}
      </div>
      <button type="button" class="v54-whatsapp">FALAR COM A GRINGAS →</button>
      <button type="button" class="v54-secondary">VOLTAR AO RESULTADO</button>
      <p class="v54-note">Ao falar com a Gringas, informe o código <strong>${code}</strong>. A avaliação e as condições serão confirmadas pela equipe.</p>`;
    c.querySelector('.v54-secondary').onclick=()=>modal.remove();
    c.querySelector('.v54-whatsapp').onclick=()=>{
      const msg=`Olá, Gringas! Fiz uma avaliação no Gringas Troca. Código: ${code}. Meu aparelho teve crédito estimado de ${money(trade)}. Tenho interesse em ${p?.name||'um novo iPhone'} ${p?.storage||''}${diff!==null?` e a diferença estimada ficou em ${money(diff)}`:''}. Quero continuar meu upgrade.`;
      // Business number from current Gringas context; opens WhatsApp.
      window.open('https://wa.me/5571999498939?text='+encodeURIComponent(msg),'_blank');
    };
  }

  function init(){
    const root=getResultRoot();
    if(root) buildUpgrade(root);
  }
  init();
  new MutationObserver(init).observe(document.body,{childList:true,subtree:true});
})();
