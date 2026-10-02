/* =========================================================
   GRINGAS TROCA — AVALIAÇÃO (avaliar.html)
   Wizard de 11 etapas → resultado → simulação de upgrade.
   ========================================================= */

const STORE_WHATSAPP='5571999498939';

const models=['iPhone 11','iPhone 11 Pro','iPhone 11 Pro Max','iPhone 12','iPhone 12 Pro','iPhone 12 Pro Max','iPhone 13','iPhone 13 Pro','iPhone 13 Pro Max','iPhone 14','iPhone 14 Pro','iPhone 14 Pro Max','iPhone 15','iPhone 15 Pro','iPhone 15 Pro Max','iPhone 16','iPhone 16 Pro','iPhone 16 Pro Max','iPhone 17','iPhone 17 Pro','iPhone 17 Pro Max','iPhone 18 Pro','iPhone 18 Pro Max'];
const storageMap={
'iPhone 11':['64 GB','128 GB','256 GB'],'iPhone 11 Pro':['64 GB','256 GB','512 GB'],'iPhone 11 Pro Max':['64 GB','256 GB','512 GB'],
'iPhone 12':['64 GB','128 GB','256 GB'],'iPhone 12 Pro':['128 GB','256 GB','512 GB'],'iPhone 12 Pro Max':['128 GB','256 GB','512 GB'],
'iPhone 13':['128 GB','256 GB','512 GB'],'iPhone 13 Pro':['128 GB','256 GB','512 GB','1 TB'],'iPhone 13 Pro Max':['128 GB','256 GB','512 GB','1 TB'],
'iPhone 14':['128 GB','256 GB','512 GB'],'iPhone 14 Pro':['128 GB','256 GB','512 GB','1 TB'],'iPhone 14 Pro Max':['128 GB','256 GB','512 GB','1 TB'],
'iPhone 15':['128 GB','256 GB','512 GB'],'iPhone 15 Pro':['128 GB','256 GB','512 GB','1 TB'],'iPhone 15 Pro Max':['256 GB','512 GB','1 TB'],
'iPhone 16':['128 GB','256 GB','512 GB'],'iPhone 16 Pro':['128 GB','256 GB','512 GB','1 TB'],'iPhone 16 Pro Max':['256 GB','512 GB','1 TB'],
'iPhone 17':['256 GB','512 GB'],'iPhone 17 Pro':['256 GB','512 GB','1 TB'],'iPhone 17 Pro Max':['256 GB','512 GB','1 TB','2 TB'],
'iPhone 18 Pro':['256 GB','512 GB','1 TB'],'iPhone 18 Pro Max':['256 GB','512 GB','1 TB','2 TB']};

// VALORES DEMONSTRATIVOS. Antes de uso público, substituir pelos valores reais da Gringas (ou editar no painel).
const defaultBaseByModel={
'iPhone 11':900,'iPhone 11 Pro':1150,'iPhone 11 Pro Max':1350,
'iPhone 12':1250,'iPhone 12 Pro':1550,'iPhone 12 Pro Max':1800,
'iPhone 13':1750,'iPhone 13 Pro':2200,'iPhone 13 Pro Max':2500,
'iPhone 14':2250,'iPhone 14 Pro':2850,'iPhone 14 Pro Max':3250,
'iPhone 15':2800,'iPhone 15 Pro':3650,'iPhone 15 Pro Max':4250,
'iPhone 16':3500,'iPhone 16 Pro':4550,'iPhone 16 Pro Max':5350,
'iPhone 17':4300,'iPhone 17 Pro':5700,'iPhone 17 Pro Max':6500,
'iPhone 18 Pro':6900,'iPhone 18 Pro Max':7800
};

const readJSON=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key)||'null')??fallback}catch(e){return fallback}};
const baseByModel={...defaultBaseByModel,...(readJSON('gringasTrocaAdminPricesV55',{})||{})};
const storageBonus={'64 GB':0,'128 GB':100,'256 GB':250,'512 GB':500,'1 TB':800,'2 TB':1200};
const conditionDiscount={'Excelente':0,'Bom':100,'Regular':300,'Danificado':0};
const screenDiscount={'Sim, perfeitamente':0,'Possui riscos/manchas':180,'Está trincada':0,'Possui problema no touch':0,'Tela já foi substituída':220};
const issueDiscount={'Face ID / Touch ID':0,'Câmeras':350,'Alto-falantes':160,'Microfones':160,'Botões':120,'Wi‑Fi / Bluetooth':300,'Carregamento':250};
const manualReasons={condition:new Set(['Danificado']),screen:new Set(['Está trincada','Possui problema no touch']),issues:new Set(['Face ID / Touch ID'])};

// Aparelhos oferecidos no upgrade. Preços editados no painel (mesmo navegador) sobrescrevem estes.
const upgradeProducts=(()=>{
  const base=[
    {id:'18',name:'iPhone 18',storage:'256GB',price:6299},
    {id:'18pro',name:'iPhone 18 Pro',storage:'256GB',price:8499},
    {id:'18promax',name:'iPhone 18 Pro Max',storage:'256GB',price:9499}
  ];
  const edited=readJSON('gringasTrocaAdminProductsV55',[]);
  if(Array.isArray(edited))edited.forEach(e=>{const p=base.find(b=>b.name===e.name);if(p&&Number(e.price)>0)p.price=Number(e.price)});
  return [...base,{id:'undecided',name:'Ainda não decidi',storage:'',price:null}];
})();
const INSTALLMENTS=12;
const TOTAL_STEPS=11;

const initialState=()=>({
  view:'wizard',step:1,
  model:'',storage:'',battery:87,condition:'',screen:'',issues:[],repair:'',partAlert:'',
  warranty:'',warrantyDate:'',appleCare:'',notes:'',accessories:[],
  name:'',phone:'',service:'WhatsApp',photos:{},evaluationId:'',
  touched:{},result:null,upgradeId:'',leadSent:false
});
const state=initialState();

const screen=document.getElementById('screen');
const backBtn=document.getElementById('backBtn');
const restartBtn=document.getElementById('restartBtn');

/* ---------- utilidades ---------- */
const $$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const money=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0}).format(Math.max(0,Math.round(Number(n)||0)));
const money2=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',minimumFractionDigits:2,maximumFractionDigits:2}).format(Math.max(0,Number(n)||0));
const onlyDigits=s=>String(s||'').replace(/\D/g,'');
function formatDateBR(v){if(!v)return '';const [y,m,d]=v.split('-');return `${d}/${m}/${y}`}
const ICON_WA='<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.16-.17.2-.35.22-.64.08-.3-.15-1.26-.46-2.39-1.48-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.6.13-.14.3-.35.45-.52.15-.18.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.61-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48 0 1.46 1.07 2.88 1.21 3.07.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.7.63.71.22 1.36.19 1.87.12.57-.09 1.76-.72 2-1.42.25-.7.25-1.29.18-1.41-.08-.13-.28-.2-.57-.35M12.05 21.79h-.01a9.87 9.87 0 0 1-5.03-1.38l-.36-.21-3.74.98 1-3.65-.24-.37a9.86 9.86 0 0 1-1.51-5.26c0-5.45 4.44-9.88 9.89-9.88 2.64 0 5.12 1.03 6.99 2.9a9.83 9.83 0 0 1 2.89 6.99c0 5.45-4.44 9.88-9.88 9.88m8.41-18.3A11.82 11.82 0 0 0 12.05 0C5.5 0 .16 5.34.16 11.89c0 2.1.55 4.14 1.59 5.95L.06 24l6.3-1.65a11.88 11.88 0 0 0 5.69 1.45h.01c6.55 0 11.89-5.34 11.89-11.9a11.82 11.82 0 0 0-3.48-8.4Z"/></svg>';

/* ---------- navegação (com suporte ao botão "voltar" do celular) ---------- */
function go(patch,{push=true}={}){
  Object.assign(state,patch);
  if(push)history.pushState({view:state.view,step:state.step},'');
  render();
  window.scrollTo(0,0);
}
function next(){go({step:state.step+1})}
window.addEventListener('popstate',e=>{
  const s=e.state;
  if(!s){window.location.href='index.html';return}
  // Voltar do resultado para o formulário equivale a "editar": a próxima conclusão gera nova avaliação.
  if(s.view==='wizard'&&state.view!=='wizard')resetEvaluation();
  if(s.view!=='wizard'&&!state.result){go({view:'wizard',step:TOTAL_STEPS},{push:false});return}
  go({view:s.view,step:s.step},{push:false});
});
history.replaceState({view:'wizard',step:1},'');

function resetEvaluation(){state.evaluationId='';state.result=null;state.upgradeId='';state.leadSent=false}

if(restartBtn)restartBtn.onclick=()=>{
  if(state.step>1&&state.view==='wizard'&&!confirm('Recomeçar a avaliação do início?'))return;
  Object.assign(state,initialState());
  go({});
};
if(backBtn)backBtn.onclick=()=>{
  if(state.view==='upgrade'){go({view:'result'});return}
  if(state.view==='result'){resetEvaluation();go({view:'wizard',step:TOTAL_STEPS});return}
  if(state.step>1)go({step:state.step-1});
  else window.location.href='index.html';
};

/* ---------- blocos de interface ---------- */
function progress(n){
  const pct=Math.round(n/TOTAL_STEPS*100);
  return `<div class="progress-wrap" aria-label="Etapa ${n} de ${TOTAL_STEPS}">
    <div class="progress-meta"><span>AVALIAÇÃO</span><b>${n} de ${TOTAL_STEPS}</b></div>
    <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><span style="width:${pct}%"></span></div>
  </div>`;
}
function shell(n,title,sub,body,footer=''){
  return `<section class="screen">${progress(n)}
    <h1 class="question">${title}</h1>${sub?`<p class="sub">${sub}</p>`:''}
    <div class="screen-body">${body}</div>
    <div class="footer-actions">${footer}</div>
  </section>`;
}
function button(label='CONTINUAR',enabled=true,cls='primary'){
  return `<button type="button" class="btn ${cls}" data-next ${enabled?'':'disabled'}>${label} <span aria-hidden="true">→</span></button>`;
}
function choice(attr,value,selected,inner){
  return `<button type="button" class="choice ${selected?'selected':''}" ${attr}="${esc(value)}" aria-pressed="${selected}">${inner}<span class="radio" aria-hidden="true"></span></button>`;
}
function simpleChoices(attr,options,current){
  return `<div class="choices">${options.map(x=>choice(attr,x,current===x,`<strong>${esc(x)}</strong>`)).join('')}</div>`;
}
function bindNext(){$$('[data-next]').forEach(b=>b.onclick=()=>{if(!b.disabled)next()})}

/* ---------- etapas ---------- */
function modelStep(){
  screen.innerHTML=shell(1,'Qual iPhone você tem?','Escolha o modelo do aparelho que você quer usar na troca.',
    `<div class="choices model-grid">${models.map(m=>choice('data-model',m,state.model===m,`<span class="mini-phone" aria-hidden="true"></span><strong>${m}</strong>`)).join('')}</div>`,
    button(state.model?'CONTINUAR':'ESCOLHA UM MODELO',!!state.model));
  $$('[data-model]').forEach(b=>b.onclick=()=>{state.model=b.dataset.model;state.storage='';next()});
}
function storageStep(){
  const opts=storageMap[state.model]||['128 GB','256 GB','512 GB','1 TB'];
  screen.innerHTML=shell(2,'Qual a capacidade do seu iPhone?',`Opções disponíveis para o ${esc(state.model)}.`,
    simpleChoices('data-storage',opts,state.storage),
    button(state.storage?'CONTINUAR':'ESCOLHA A CAPACIDADE',!!state.storage));
  $$('[data-storage]').forEach(b=>b.onclick=()=>{state.storage=b.dataset.storage;next()});
}
function batteryStep(){
  const v=typeof state.battery==='number'?state.battery:87;
  if(typeof state.battery!=='number')state.battery=v;
  screen.innerHTML=shell(3,'Qual a saúde da bateria?','Informe a capacidade máxima mostrada nos Ajustes do seu iPhone.',
    `<div class="battery-card">
      <div class="battery-icon" aria-hidden="true"><span id="batteryFill" style="width:${v}%"></span></div>
      <output class="battery-value" id="batteryValue" for="battery">${v}%</output>
      <label class="sr-only" for="battery">Saúde da bateria em porcentagem</label>
      <input class="range" id="battery" type="range" min="50" max="100" value="${v}" style="--fill:${(v-50)*2}%">
      <div class="range-scale" aria-hidden="true"><span>50%</span><span>100%</span></div>
      <div class="help"><b>Como verificar?</b>Ajustes → Bateria → Saúde da Bateria</div>
    </div>`,
    `${button()}<button type="button" class="btn ghost" id="unknownBattery">NÃO CONSIGO VERIFICAR</button>`);
  const r=document.getElementById('battery');
  // Atualiza só o necessário para não interromper o arraste no celular.
  r.oninput=e=>{
    const n=+e.target.value;state.battery=n;
    document.getElementById('batteryValue').textContent=n+'%';
    document.getElementById('batteryFill').style.width=n+'%';
    r.style.setProperty('--fill',`${(n-50)*2}%`);
  };
  document.getElementById('unknownBattery').onclick=()=>{state.battery='Não informado';next()};
}
function conditionStep(){
  const a=[['Excelente','Praticamente sem marcas de uso.'],['Bom','Pequenas marcas normais de uso.'],['Regular','Riscos ou marcas aparentes.'],['Danificado','Trincas, amassados ou danos importantes.']];
  screen.innerHTML=shell(4,'Como está seu iPhone?','Escolha a opção que mais se aproxima do estado físico atual.',
    `<div class="choices">${a.map(([x,d])=>choice('data-v',x,state.condition===x,`<div><strong>${x}</strong><small>${d}</small></div>`)).join('')}</div>`,
    button(state.condition?'CONTINUAR':'ESCOLHA UMA OPÇÃO',!!state.condition));
  $$('[data-v]').forEach(b=>b.onclick=()=>{state.condition=b.dataset.v;next()});
}
function screenStep(){
  const a=['Sim, perfeitamente','Possui riscos/manchas','Está trincada','Possui problema no touch','Tela já foi substituída'];
  screen.innerHTML=shell(5,'A tela está funcionando perfeitamente?','Isso deixa a estimativa mais próxima da avaliação presencial.',
    simpleChoices('data-s',a,state.screen),
    button(state.screen?'CONTINUAR':'ESCOLHA UMA OPÇÃO',!!state.screen));
  $$('[data-s]').forEach(b=>b.onclick=()=>{state.screen=b.dataset.s;next()});
}
function functionsStep(){
  const a=['Face ID / Touch ID','Câmeras','Alto-falantes','Microfones','Botões','Wi‑Fi / Bluetooth','Carregamento'];
  screen.innerHTML=shell(6,'Alguma dessas funções está com problema?','Ative apenas o que <b>não</b> está funcionando. Se está tudo certo, é só continuar.',
    `<div class="toggle-list">${a.map(x=>{const on=state.issues.includes(x);return `<button type="button" class="toggle-row" data-issue="${esc(x)}" role="switch" aria-checked="${on}"><span>${x}</span><span class="switch ${on?'on':''}" aria-hidden="true"></span></button>`}).join('')}</div>`,
    button(state.issues.length?'CONTINUAR':'ESTÁ TUDO FUNCIONANDO'));
  $$('[data-issue]').forEach(b=>b.onclick=()=>{
    const x=b.dataset.issue;
    state.issues=state.issues.includes(x)?state.issues.filter(i=>i!==x):[...state.issues,x];
    render();
  });
}
function repairStep(){
  const ready=state.repair&&state.partAlert;
  screen.innerHTML=shell(7,'Seu iPhone já passou por manutenção?','Também precisamos saber se aparece algum aviso de peça no sistema.',
    `<div class="field"><span class="label">JÁ FOI PARA MANUTENÇÃO?</span>${simpleChoices('data-r',['Não','Sim','Não sei'],state.repair)}</div>
     <div class="field"><span class="label">APARECE AVISO DE PEÇA DESCONHECIDA?</span>${simpleChoices('data-p',['Não','Sim','Não sei'],state.partAlert)}</div>`,
    button(ready?'CONTINUAR':'RESPONDA AS DUAS PERGUNTAS',!!ready));
  $$('[data-r]').forEach(b=>b.onclick=()=>{state.repair=b.dataset.r;render()});
  $$('[data-p]').forEach(b=>b.onclick=()=>{state.partAlert=b.dataset.p;render()});
}
function warrantyStep(){
  const opts=['Sim','Não','Não sei'];
  screen.innerHTML=shell(8,'Seu aparelho ainda tem garantia Apple?','A garantia fica registrada para a análise da Gringas.',
    `${simpleChoices('data-w',opts,state.warranty)}
     ${state.warranty==='Sim'?`<div class="field"><label class="label" for="wdate">GARANTIA VÁLIDA ATÉ (OPCIONAL)</label><input class="input" type="date" id="wdate" value="${esc(state.warrantyDate)}"></div>
     <div class="field"><span class="label">POSSUI APPLECARE+?</span>${simpleChoices('data-ac',opts,state.appleCare)}</div>`:''}`,
    button(state.warranty?'CONTINUAR':'ESCOLHA UMA OPÇÃO',!!state.warranty));
  $$('[data-w]').forEach(b=>b.onclick=()=>{state.warranty=b.dataset.w;if(state.warranty!=='Sim'){state.warrantyDate='';state.appleCare='';next()}else render()});
  const wd=document.getElementById('wdate');if(wd)wd.onchange=e=>state.warrantyDate=e.target.value;
  $$('[data-ac]').forEach(b=>b.onclick=()=>{state.appleCare=b.dataset.ac;render()});
}

/* Fotos: redimensiona no aparelho para subir rápido e caber no armazenamento local. */
function compressImage(file,maxSide=1600,quality=.82){
  return new Promise(resolve=>{
    const fallback=()=>{const r=new FileReader();r.onload=ev=>resolve(ev.target.result);r.onerror=()=>resolve('');r.readAsDataURL(file)};
    const url=URL.createObjectURL(file);const img=new Image();
    img.onload=()=>{
      try{
        const k=Math.min(1,maxSide/Math.max(img.naturalWidth,img.naturalHeight));
        const c=document.createElement('canvas');c.width=Math.round(img.naturalWidth*k);c.height=Math.round(img.naturalHeight*k);
        c.getContext('2d').drawImage(img,0,0,c.width,c.height);
        URL.revokeObjectURL(url);resolve(c.toDataURL('image/jpeg',quality));
      }catch(e){URL.revokeObjectURL(url);fallback()}
    };
    img.onerror=()=>{URL.revokeObjectURL(url);fallback()};
    img.src=url;
  });
}
function photo(k,title,required){
  const has=!!state.photos[k];
  return `<div class="photo-wrap">
    <label class="photo-box ${has?'has-photo':''} ${required?'required':''}">
      ${has?`<img src="${state.photos[k]}" alt="Foto: ${title}">`:`<span class="photo-plus" aria-hidden="true">＋</span><b>${title}</b><small>${required?'obrigatória':'opcional'}</small>`}
      <input type="file" accept="image/*" capture="environment" data-key="${k}" aria-label="Foto ${title}">
    </label>
    ${has?`<button type="button" class="photo-remove" data-remove-photo="${k}">Remover</button>`:''}
  </div>`;
}
function photosStep(){
  const ok=!!(state.photos.front&&state.photos.back);
  screen.innerHTML=shell(9,'Agora mostre seu aparelho.','Frente e traseira são obrigatórias. As outras ajudam a Gringas a confirmar o estado informado.',
    `<div class="photo-grid">${photo('front','Frente',true)}${photo('back','Traseira',true)}${photo('left','Lateral esquerda')}${photo('right','Lateral direita')}${photo('detail','Avaria / detalhe')}</div>
     <p class="note">Tire a foto na hora ou escolha da galeria. Prefira um lugar bem iluminado.</p>`,
    button(ok?'CONTINUAR':'ENVIE FRENTE E TRASEIRA',ok));
  $$('.photo-box input').forEach(i=>i.onchange=async e=>{
    const f=e.target.files[0];if(!f)return;
    if(f.size>20*1024*1024){alert('Essa foto é muito grande. Escolha uma imagem de até 20 MB.');return}
    i.closest('.photo-box').classList.add('loading');
    const data=await compressImage(f);
    if(data)state.photos[i.dataset.key]=data;
    render();
  });
  $$('[data-remove-photo]').forEach(b=>b.onclick=e=>{e.preventDefault();delete state.photos[b.dataset.removePhoto];render()});
}
function notesStep(){
  const acc=['Caixa','Cabo','Nota fiscal'];
  screen.innerHTML=shell(10,'Algo mais que devemos saber?','Conte sobre marcas, reparos ou qualquer detalhe útil. É opcional.',
    `<div class="field"><label class="sr-only" for="notes">Observações</label><textarea class="input" id="notes" maxlength="500" rows="4" placeholder="Ex.: troquei a bateria há 4 meses na Apple. Pequena marca na lateral direita...">${esc(state.notes)}</textarea><div class="counter"><span id="count">${state.notes.length}</span>/500</div></div>
     <div class="field"><span class="label">O QUE ACOMPANHA O APARELHO?</span><p class="hint">Você pode avaliar só o aparelho.</p>
       <div class="choices chips">${acc.map(x=>choice('data-acc',x,state.accessories.includes(x),`<strong>${x}</strong>`)).join('')}${choice('data-acc-none','1',state.accessories.length===0,'<strong>Nenhum</strong>')}</div>
     </div>`,
    button());
  const t=document.getElementById('notes');
  t.oninput=e=>{state.notes=e.target.value;document.getElementById('count').textContent=e.target.value.length};
  $$('[data-acc]').forEach(b=>b.onclick=()=>{const x=b.dataset.acc;state.accessories=state.accessories.includes(x)?state.accessories.filter(a=>a!==x):[...state.accessories,x];render()});
  $$('[data-acc-none]').forEach(b=>b.onclick=()=>{state.accessories=[];render()});
}

/* ---------- validação de nome e telefone ---------- */
function validateName(v){
  const parts=String(v||'').trim().split(/\s+/).filter(p=>/\p{L}{2,}/u.test(p));
  if(!String(v||'').trim())return 'Informe seu nome.';
  if(/[0-9@#$%*_=+<>{}[\]\\/|]/.test(v))return 'Use apenas letras no nome.';
  if(parts.length<2)return 'Informe nome e sobrenome.';
  return '';
}
function validatePhone(v){
  const d=onlyDigits(v);
  if(!d)return 'Informe seu WhatsApp com DDD.';
  if(d.length<10||d.length>11)return 'Número incompleto. Use DDD + número.';
  if(+d.slice(0,2)<11||d[1]==='0')return 'DDD inválido.';
  if(d.length===11&&d[2]!=='9')return 'Celular deve começar com 9 depois do DDD.';
  if(/^(\d)\1+$/.test(d.slice(2)))return 'Número inválido.';
  return '';
}
function maskPhone(v){
  const d=onlyDigits(v).slice(0,11);
  if(d.length<=2)return d.length?`(${d}`:'';
  if(d.length<=6)return `(${d.slice(0,2)}) ${d.slice(2)}`;
  if(d.length<=10)return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
  return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
}
function fieldState(id,error){
  const wrap=document.querySelector(`[data-field="${id}"]`);if(!wrap)return;
  const show=state.touched[id];
  wrap.classList.toggle('is-invalid',!!(show&&error));
  wrap.classList.toggle('is-valid',!!(show&&!error));
  const input=wrap.querySelector('input');input.setAttribute('aria-invalid',show&&error?'true':'false');
  wrap.querySelector('.field-error').textContent=show?error:'';
}
function dataStep(){
  screen.innerHTML=shell(11,'Estamos quase lá.','Deixe seus dados para identificarmos sua avaliação e falarmos com você.',
    `<div class="field" data-field="name">
       <label class="label" for="name">NOME COMPLETO</label>
       <div class="input-wrap"><input class="input" id="name" value="${esc(state.name)}" placeholder="Seu nome e sobrenome" autocomplete="name" autocapitalize="words" enterkeyhint="next" aria-describedby="name-error"><span class="input-check" aria-hidden="true">✓</span></div>
       <p class="field-error" id="name-error" role="alert"></p>
     </div>
     <div class="field" data-field="phone">
       <label class="label" for="phone">WHATSAPP</label>
       <div class="input-wrap"><input class="input" id="phone" value="${esc(maskPhone(state.phone))}" placeholder="(71) 99999-9999" inputmode="tel" type="tel" autocomplete="tel-national" enterkeyhint="done" aria-describedby="phone-error"><span class="input-check" aria-hidden="true">✓</span></div>
       <p class="field-error" id="phone-error" role="alert"></p>
     </div>
     <div class="field"><span class="label">COMO PREFERE SER ATENDIDO?</span>${simpleChoices('data-service',['WhatsApp','Loja física'],state.service)}</div>
     <p class="note">Ao continuar, você confirma que as informações são verdadeiras e autoriza a Gringas a usá-las para esta avaliação.</p>`,
    `<button type="button" class="btn primary" id="calc">VER MINHA AVALIAÇÃO <span aria-hidden="true">→</span></button>`);
  const name=document.getElementById('name'),phone=document.getElementById('phone');
  const refresh=()=>{fieldState('name',validateName(state.name));fieldState('phone',validatePhone(state.phone))};
  name.oninput=e=>{state.name=e.target.value;refresh()};
  name.onblur=()=>{state.name=state.name.trim().replace(/\s+/g,' ');name.value=state.name;state.touched.name=true;refresh()};
  name.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();phone.focus()}};
  phone.oninput=e=>{
    const masked=maskPhone(e.target.value);e.target.value=masked;state.phone=masked;
    if(onlyDigits(masked).length>=10)state.touched.phone=true;
    refresh();
  };
  phone.onblur=()=>{state.touched.phone=true;refresh()};
  phone.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();document.getElementById('calc').click()}};
  $$('[data-service]').forEach(b=>b.onclick=()=>{state.service=b.dataset.service;$$('[data-service]').forEach(x=>{const on=x===b;x.classList.toggle('selected',on);x.setAttribute('aria-pressed',on)})});
  refresh();
  document.getElementById('calc').onclick=()=>{
    state.touched.name=true;state.touched.phone=true;refresh();
    const bad=validateName(state.name)?name:validatePhone(state.phone)?phone:null;
    if(bad){bad.focus();bad.closest('.field').animate?.([{transform:'translateX(0)'},{transform:'translateX(-6px)'},{transform:'translateX(6px)'},{transform:'translateX(0)'}],{duration:240});return}
    finishEvaluation();
  };
}

/* ---------- cálculo ---------- */
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

/* ---------- persistência ---------- */
const HISTORY_KEY='gringasTrocaEvaluationsV55';
function evaluationHistory(){return readJSON(HISTORY_KEY,[])||[]}
function writeHistory(items,record,ix){
  try{localStorage.setItem(HISTORY_KEY,JSON.stringify(items.slice(0,150)));return}
  catch(e){console.warn('localStorage cheio; mantendo avaliação sem bytes das fotos.',e)}
  record.photos={};record.photoStorageWarning=true;
  if(ix>=0)items[ix]=record;else items[0]=record;
  try{localStorage.setItem(HISTORY_KEY,JSON.stringify(items.slice(0,150)))}catch(_){}
}
async function persistEvaluation(calc){
  const id=makeId();
  const now=new Date().toISOString();
  const record={
    id,createdAt:now,updatedAt:now,status:'Nova',
    customer:{name:state.name.trim()||'Cliente',phone:state.phone||'',service:state.service||'WhatsApp'},
    device:{model:state.model,storage:state.storage,battery:state.battery,condition:state.condition,screen:state.screen,issues:[...state.issues],repair:state.repair,partAlert:state.partAlert},
    warranty:{status:state.warranty,date:state.warrantyDate,appleCare:state.appleCare},
    accessories:[...state.accessories],
    notes:state.notes||'',
    photos:{...state.photos},
    calculation:{base:calc.base,totalDiscount:calc.totalDiscount,estimated:calc.estimated,isManual:calc.isManual,manual:[...calc.manual],lines:[...calc.lines]},
    approvedValue:null,adjustmentReason:'',upgrade:null
  };
  const items=evaluationHistory();
  const ix=items.findIndex(x=>x.id===id);
  if(ix>=0){
    Object.assign(record,{status:items[ix].status||record.status,approvedValue:items[ix].approvedValue??null,adjustmentReason:items[ix].adjustmentReason||'',upgrade:items[ix].upgrade||null,createdAt:items[ix].createdAt||record.createdAt});
    items[ix]=record;
  }else items.unshift(record);

  let photoPaths={};
  try{
    if(window.GringasCloud?.configured){
      const r=await window.GringasCloud.saveEvaluation(record);
      if(r?.mode==='error')console.warn('Avaliação salva localmente, mas houve erro na nuvem.',r.error);
      else photoPaths=r?.photos||{};
    }
  }catch(e){console.warn('Nuvem indisponível; avaliação preservada localmente.',e)}

  writeHistory(items,record,ix);
  return {record,photoPaths};
}
async function photoLinks(paths){
  const out={};
  if(!window.GringasCloud?.configured)return out;
  for(const k of ['front','back']){
    if(!paths[k])continue;
    try{const url=await window.GringasCloud.signedPhotoUrl(paths[k],7*86400);if(/^https?:/i.test(url))out[k]=url}catch(e){}
  }
  return out;
}
function updateEvaluationUpgrade(data){
  const items=evaluationHistory();
  const ix=items.findIndex(x=>x.id===data.code);
  if(ix>=0){
    items[ix].upgrade={productId:data.productId||'',productName:data.productName||'',storage:data.storage||'',tradeValue:data.tradeValue,difference:data.difference,selectedAt:new Date().toISOString()};
    items[ix].updatedAt=new Date().toISOString();
    try{localStorage.setItem(HISTORY_KEY,JSON.stringify(items))}catch(e){}
  }
  try{if(window.GringasCloud?.configured)window.GringasCloud.updateUpgrade(data.code,data).catch(e=>console.warn('Upgrade não sincronizado na nuvem',e))}catch(e){}
}

/* ---------- mensagem para o WhatsApp da loja ---------- */
function leadMessage(product){
  const r=state.result,c=r.calc;
  const bat=typeof state.battery==='number'?`${state.battery}%`:'não informada';
  const lines=[
    `Olá, Gringas! Fiz minha avaliação no Gringas Troca.`,
    ``,
    `🆔 Código: *${r.id}*`,
    `👤 ${state.name.trim()}`,
    `📱 ${state.model} ${state.storage} • bateria ${bat}`,
    `✨ Estado: ${state.condition} • Tela: ${state.screen==='Sim, perfeitamente'?'perfeita':state.screen}`,
    `🏬 Prefiro atendimento: ${state.service}`,
    c.isManual?`💰 Valor de referência: *${money(c.estimated)}* (precisa de análise)`:`💰 Valor estimado: *${money(c.estimated)}*`
  ];
  if(product&&product.price){
    const diff=Math.max(0,product.price-c.estimated);
    lines.push(``,`🎯 Quero o *${product.name} ${product.storage}* (${money(product.price)})`);
    lines.push(diff>0?`💳 Diferença estimada: *${money(diff)}*`:`💳 Meu crédito cobre o aparelho`);
  }else if(product){
    lines.push(``,`🎯 Ainda não decidi o modelo, quero ajuda para escolher.`);
  }
  const links=r.links||{};
  if(links.front||links.back){
    lines.push(``,`📸 Fotos:`);
    if(links.front)lines.push(`Frente: ${links.front}`);
    if(links.back)lines.push(`Traseira: ${links.back}`);
  }else{
    lines.push(``,`📸 Enviei ${Object.keys(state.photos).length} foto(s) pelo formulário.`);
  }
  lines.push(``,product?`Quero continuar meu upgrade!`:`Quero continuar a troca!`);
  return lines.join('\n');
}
const waUrl=msg=>`https://wa.me/${STORE_WHATSAPP}?text=${encodeURIComponent(msg)}`;

/* ---------- conclusão ---------- */
async function finishEvaluation(){
  if(backBtn)backBtn.classList.add('hidden');
  screen.innerHTML=`<section class="screen screen-center" aria-live="polite">
    <div class="loader" aria-hidden="true"></div>
    <h1 class="question">Calculando sua avaliação…</h1>
    <p class="sub">Estamos analisando as informações e salvando suas fotos.</p>
  </section>`;
  const calc=calculate();
  let saved;
  try{saved=await persistEvaluation(calc)}catch(e){console.error(e);saved={record:{id:makeId()},photoPaths:{}}}
  const links=await photoLinks(saved.photoPaths);
  state.result={id:saved.record.id,calc,links};
  go({view:'result'});
}

function resultStep(){
  const r=state.result,c=r.calc;
  const bat=typeof state.battery==='number'?`${state.battery}%`:'Não informada';
  const warrantyLine=state.warranty==='Sim'?`Sim${state.warrantyDate?' • até '+formatDateBR(state.warrantyDate):''}${state.appleCare==='Sim'?' • AppleCare+':''}`:(state.warranty||'Não informado');
  const rows=[
    ['Bateria',bat],['Estado físico',state.condition],['Tela',state.screen],
    ['Funções com problema',state.issues.join(', ')||'Nenhuma'],
    ['Manutenção',state.repair],['Aviso de peça',state.partAlert],
    ['Garantia Apple',warrantyLine],
    ['Acompanha',state.accessories.join(', ')||'Somente o aparelho'],
    ['Fotos',`${Object.keys(state.photos).length} enviada(s)`]
  ];
  screen.innerHTML=`<section class="screen result-screen">
    <div class="result-head">
      <span class="pill">AVALIAÇÃO ${esc(r.id)}</span>
      <div class="result-device"><span class="mini-phone lg" aria-hidden="true"></span><div><b>${esc(state.model)}</b><small>${esc(state.storage)}</small></div></div>
    </div>

    ${c.isManual?`
      <div class="value-card manual">
        <span class="value-label">VALOR DE REFERÊNCIA</span>
        <div class="value-amount">${money(c.estimated)}</div>
        <p class="value-sub">Algumas respostas pedem uma conferência rápida da Gringas antes de confirmarmos o valor.</p>
        <ul class="manual-list">${c.manual.map(m=>`<li>${esc(m)}</li>`).join('')}</ul>
      </div>`:`
      <div class="value-card">
        <span class="value-label">SEU IPHONE PODE VALER ATÉ</span>
        <div class="value-amount">${money(c.estimated)}</div>
        <p class="value-sub">como entrada no seu próximo iPhone na Gringas.</p>
      </div>`}

    <div class="result-actions">
      <button type="button" class="btn primary" id="upgrade">SIMULAR MEU UPGRADE <span aria-hidden="true">→</span></button>
      <a class="btn whatsapp" id="sendWa" href="${esc(waUrl(leadMessage(null)))}" target="_blank" rel="noopener">${ICON_WA} ENVIAR AVALIAÇÃO NO WHATSAPP</a>
    </div>

    <details class="summary-card">
      <summary><span>Resumo das suas respostas</span><span class="chev" aria-hidden="true"></span></summary>
      <dl>${rows.map(([k,v])=>`<div class="summary-row"><dt>${k}</dt><dd>${esc(v||'—')}</dd></div>`).join('')}</dl>
      ${state.notes?`<div class="summary-notes"><dt>Observações</dt><dd>${esc(state.notes)}</dd></div>`:''}
      <button type="button" class="btn ghost small" id="edit">EDITAR RESPOSTAS</button>
    </details>

    <p class="legal">Estimativa com base nas informações enviadas. O valor definitivo é confirmado após avaliação física e testes na Gringas.</p>
  </section>`;
  document.getElementById('upgrade').onclick=()=>go({view:'upgrade'});
  document.getElementById('sendWa').onclick=()=>{state.leadSent=true};
  document.getElementById('edit').onclick=()=>{resetEvaluation();go({view:'wizard',step:TOTAL_STEPS})};
}

function upgradeStep(){
  const r=state.result,trade=r.calc.estimated;
  const sel=upgradeProducts.find(p=>p.id===state.upgradeId);
  const productCard=p=>{
    const on=state.upgradeId===p.id;
    if(!p.price)return `<button type="button" class="product undecided ${on?'selected':''}" data-product="${p.id}" aria-pressed="${on}">
      <div class="product-info"><strong>${p.name}</strong><small>A equipe ajuda você a escolher</small></div><span class="radio" aria-hidden="true"></span></button>`;
    const diff=Math.max(0,p.price-trade);
    return `<button type="button" class="product ${on?'selected':''}" data-product="${p.id}" aria-pressed="${on}">
      <span class="mini-phone" aria-hidden="true"></span>
      <div class="product-info"><strong>${p.name}</strong><small>${p.storage} • ${money(p.price)}</small></div>
      <div class="product-diff">${diff>0?`<small>você completa</small><b>${money(diff)}</b>`:`<small>seu crédito</small><b>cobre tudo</b>`}</div>
      <span class="radio" aria-hidden="true"></span>
    </button>`;
  };
  let summary='';
  if(sel&&sel.price){
    const diff=Math.max(0,sel.price-trade),left=Math.max(0,trade-sel.price);
    summary=`<div class="deal-card" aria-live="polite">
      <div class="deal-row"><span>${sel.name} ${sel.storage}</span><b>${money(sel.price)}</b></div>
      <div class="deal-row credit"><span>Seu ${esc(state.model)} como entrada</span><b>− ${money(Math.min(trade,sel.price))}</b></div>
      <div class="deal-total">
        ${diff>0?`<span class="value-label">VOCÊ COMPLETA</span><div class="deal-amount">${money(diff)}</div><div class="deal-installment">ou em até <b>${INSTALLMENTS}x de ${money2(diff/INSTALLMENTS)}</b>*</div>`
                :`<span class="value-label">SEU CRÉDITO COBRE ESTE IPHONE</span><div class="deal-amount">${money(left)}</div><div class="deal-installment">de saldo estimado a seu favor</div>`}
      </div>
    </div>`;
  }else if(sel){
    summary=`<div class="deal-card" aria-live="polite"><p class="deal-help">Sem problema! Sua avaliação <b>${esc(r.id)}</b> fica salva e a equipe da Gringas ajuda você a escolher o melhor modelo pelo WhatsApp.</p></div>`;
  }
  screen.innerHTML=`<section class="screen upgrade-screen">
    <span class="pill">SEU UPGRADE</span>
    <h1 class="question">Escolha seu próximo iPhone.</h1>
    <div class="credit-chip"><span>Crédito do seu ${esc(state.model)}</span><b>${money(trade)}</b></div>
    <div class="products">${upgradeProducts.map(productCard).join('')}</div>
    ${summary}
    <div class="footer-actions">
      ${sel?`<a class="btn whatsapp" id="goWa" href="${esc(waUrl(leadMessage(sel)))}" target="_blank" rel="noopener">${ICON_WA} CONTINUAR NO WHATSAPP</a>`
           :`<button type="button" class="btn primary" disabled>ESCOLHA UM IPHONE <span aria-hidden="true">→</span></button>`}
      ${state.leadSent?`<p class="success-note" role="status">✓ Abrimos o WhatsApp com sua avaliação. Não abriu? Toque no botão acima.</p>`:''}
    </div>
    <p class="legal">*Simulação. Preços, parcelamento e valor final da troca são confirmados pela Gringas no atendimento.</p>
  </section>`;
  $$('[data-product]').forEach(b=>b.onclick=()=>{state.upgradeId=b.dataset.product;state.leadSent=false;render()});
  const wa=document.getElementById('goWa');
  if(wa)wa.onclick=()=>{
    const p=sel,diff=p.price?Math.max(0,p.price-trade):null;
    updateEvaluationUpgrade({productId:p.id,productName:p.name,storage:p.storage,tradeValue:trade,difference:diff,code:r.id});
    state.leadSent=true;
    setTimeout(render,400);
  };
}

/* ---------- render ---------- */
const steps=[modelStep,storageStep,batteryStep,conditionStep,screenStep,functionsStep,repairStep,warrantyStep,photosStep,notesStep,dataStep];
function render(){
  if(!screen)return;
  if(backBtn)backBtn.classList.remove('hidden');
  document.body.dataset.view=state.view;
  if(state.view==='result'&&state.result)resultStep();
  else if(state.view==='upgrade'&&state.result)upgradeStep();
  else{state.view='wizard';(steps[state.step-1]||dataStep)();bindNext()}
}
render();
