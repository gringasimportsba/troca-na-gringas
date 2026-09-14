
const HISTORY_KEY='gringasTrocaEvaluationsV55';
const PRICES_KEY='gringasTrocaAdminPricesV55';
const RULES_KEY='gringasTrocaAdminRulesV55';
const PRODUCTS_KEY='gringasTrocaAdminProductsV55';
const statuses=['Nova','Em análise','Cliente contatado','Aguardando aparelho','Aprovado','Troca realizada','Recusado','Cliente desistiu'];
const demoPrices={'iPhone 17 Pro Max':6500,'iPhone 17 Pro':5700,'iPhone 16 Pro Max':5350,'iPhone 16 Pro':4550,'iPhone 15 Pro Max':4250,'iPhone 15 Pro':3650};
const demoRules={battery85:100,battery80:220,batteryLow:400,good:100,regular:300,repair:100,maxDiscount:30};
const demoProducts=[{name:'iPhone 18',storage:'256GB',price:6299},{name:'iPhone 18 Pro',storage:'256GB',price:8499},{name:'iPhone 18 Pro Max',storage:'256GB',price:9499}];
let currentView='overview', query='', statusFilter='Todos';
let cloudMode=false;
let cloudHistory=null;

const $=s=>document.querySelector(s);
const money=n=>Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0});
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const dateBR=v=>{if(!v)return '—';try{return new Date(v).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})}catch(e){return v}};
const cssStatus=s=>String(s).replaceAll(' ','-');

function loadHistory(){try{return JSON.parse(localStorage.getItem(HISTORY_KEY)||'[]')}catch(e){return []}}
function activeHistory(){return cloudMode && Array.isArray(cloudHistory) ? cloudHistory : loadHistory()}
function saveHistory(v){
  if(cloudMode) cloudHistory=JSON.parse(JSON.stringify(v));
  localStorage.setItem(HISTORY_KEY,JSON.stringify(v));
}
function loadObj(key,fallback){try{return JSON.parse(localStorage.getItem(key)||'null')||structuredClone(fallback)}catch(e){return JSON.parse(JSON.stringify(fallback))}}
function saveObj(key,v){localStorage.setItem(key,JSON.stringify(v))}
function filtered(){
  return activeHistory().filter(x=>{
    const hay=[x.id,x.customer?.name,x.customer?.phone,x.device?.model,x.device?.storage].join(' ').toLowerCase();
    return (!query||hay.includes(query.toLowerCase())) && (statusFilter==='Todos'||x.status===statusFilter)
  })
}
function setTitles(title,sub){$('#pageTitle').textContent=title;$('#pageSub').textContent=sub}
function statusBadge(s){return `<span class="status ${cssStatus(s)}">${esc(s)}</span>`}

function overview(){
  setTitles('Boa noite, Railander. 👋','Aqui está o resumo do Gringas Troca.');
  const a=activeHistory(), today=new Date().toISOString().slice(0,10);
  const todays=a.filter(x=>(x.createdAt||'').slice(0,10)===today);
  const contacted=a.filter(x=>['Cliente contatado','Aguardando aparelho','Aprovado','Troca realizada'].includes(x.status));
  const done=a.filter(x=>x.status==='Troca realizada');
  const pending=a.filter(x=>['Nova','Em análise'].includes(x.status));
  $('#content').innerHTML=`<div class="cards">
    <div class="metric"><small>Avaliações hoje</small><strong>${todays.length}</strong><em>${a.length} ${cloudMode?'na nuvem':'no histórico local'}</em></div>
    <div class="metric"><small>Aguardando análise</small><strong>${pending.length}</strong><em>pedem atenção</em></div>
    <div class="metric"><small>Clientes contatados</small><strong>${contacted.length}</strong><em>pipeline ativo</em></div>
    <div class="metric"><small>Trocas realizadas</small><strong>${done.length}</strong><em>concluídas</em></div>
  </div>
  ${tablePanel(a.slice(0,8),'Avaliações recentes',cloudMode?'Últimas avaliações sincronizadas com o Supabase.':'Últimas avaliações registradas neste navegador.')}`;
  bindRows();
}
function tablePanel(rows,title='Avaliações',sub=''){
 return `<div class="panel"><div class="panel-head"><div><h2>${title}</h2><p>${sub}</p></div></div>
 <div class="table-wrap">${rows.length?`<table><thead><tr><th>Código</th><th>Cliente</th><th>Aparelho</th><th>Valor estimado</th><th>Interesse</th><th>Status</th></tr></thead><tbody>
 ${rows.map(x=>`<tr class="clickable" data-id="${x.id}"><td class="code">${x.id}</td><td>${esc(x.customer?.name||'—')}</td><td>${esc(x.device?.model||'—')} ${esc(x.device?.storage||'')}</td><td class="money">${money(x.calculation?.estimated)}</td><td>${esc(x.upgrade?.productName||'—')}</td><td>${statusBadge(x.status||'Nova')}</td></tr>`).join('')}
 </tbody></table>`:`<div class="empty"><b>Nenhuma avaliação ainda.</b>Faça uma avaliação no index.html e ela aparecerá aqui automaticamente.</div>`}</div></div>`;
}
function evaluations(){
 setTitles('Avaliações','Pesquise, filtre e abra cada ficha de trade-in.');
 $('#content').innerHTML=`<div class="panel"><div class="panel-head"><div><h2>Todas as avaliações</h2><p>${cloudMode?'Fonte atual: Supabase • somente registros da nuvem.':'Modo local • dados deste navegador.'}</p></div><div class="toolbar"><input class="search" id="search" placeholder="Código, cliente, modelo..." value="${esc(query)}"><select class="filter" id="filter">${['Todos',...statuses].map(s=>`<option ${statusFilter===s?'selected':''}>${s}</option>`).join('')}</select></div></div>
 <div id="evalTable">${tableInner(filtered())}</div></div>`;
 $('#search').oninput=e=>{query=e.target.value;$('#evalTable').innerHTML=tableInner(filtered());bindRows()};
 $('#filter').onchange=e=>{statusFilter=e.target.value;$('#evalTable').innerHTML=tableInner(filtered());bindRows()};
 bindRows();
}
function tableInner(rows){
 return `<div class="table-wrap">${rows.length?`<table><thead><tr><th>Código</th><th>Cliente</th><th>WhatsApp</th><th>Aparelho</th><th>Estimativa</th><th>Status</th></tr></thead><tbody>${rows.map(x=>`<tr class="clickable" data-id="${x.id}"><td class="code">${x.id}</td><td>${esc(x.customer?.name||'—')}</td><td>${esc(x.customer?.phone||'—')}</td><td>${esc(x.device?.model)} ${esc(x.device?.storage)}</td><td class="money">${money(x.calculation?.estimated)}</td><td>${statusBadge(x.status||'Nova')}</td></tr>`).join('')}</tbody></table>`:`<div class="empty"><b>Nenhum resultado.</b>Tente outro filtro.</div>`}</div>`;
}
function clients(){
 setTitles('Clientes','Leads gerados pelas avaliações do Gringas Troca.');
 const map=new Map();
 activeHistory().forEach(x=>{
   const key=(x.customer?.phone||x.customer?.name||x.id).toLowerCase();
   if(!map.has(key))map.set(key,{name:x.customer?.name||'Cliente',phone:x.customer?.phone||'—',count:0,last:x.createdAt,total:0});
   const c=map.get(key);c.count++;c.total+=Number(x.calculation?.estimated||0);if(x.createdAt>c.last)c.last=x.createdAt;
 });
 const arr=[...map.values()];
 $('#content').innerHTML=arr.length?`<div class="client-grid">${arr.map(c=>`<div class="client-card"><h3>${esc(c.name)}</h3><p>${esc(c.phone)}</p><strong>${c.count} avaliação(ões)</strong><p>Última: ${dateBR(c.last)}</p></div>`).join('')}</div>`:`<div class="panel"><div class="empty"><b>Nenhum cliente ainda.</b>Os leads aparecerão aqui após as avaliações.</div></div>`;
}
function prices(){
 setTitles('Aparelhos e preços','Valores-base demonstrativos e editáveis neste navegador.');
 const p=loadObj(PRICES_KEY,demoPrices);
 $('#content').innerHTML=`<h2 class="section-title">Tabela-base</h2><div class="grid2">${Object.entries(p).map(([k,v])=>`<div class="setting"><h3>${esc(k)}</h3><p>Valor-base do aparelho em excelente estado.</p><input type="number" data-price="${esc(k)}" value="${v}"></div>`).join('')}</div><div style="margin-top:16px"><button class="savebtn" id="savePrices">SALVAR VALORES</button></div>`;
 $('#savePrices').onclick=()=>{document.querySelectorAll('[data-price]').forEach(i=>p[i.dataset.price]=Number(i.value||0));saveObj(PRICES_KEY,p);alert('Valores salvos localmente. A ligação desses preços ao motor entra após validação da tabela real.')};
}
function rules(){
 setTitles('Regras de avaliação','Parâmetros editáveis para o motor de trade-in.');
 const r=loadObj(RULES_KEY,demoRules);
 const fields=[['battery85','Bateria 85–89%'],['battery80','Bateria 80–84%'],['batteryLow','Bateria abaixo de 80%'],['good','Estado físico: Bom'],['regular','Estado físico: Regular'],['repair','Histórico de manutenção'],['maxDiscount','Limite de desconto automático (%)']];
 $('#content').innerHTML=`<div class="grid2">${fields.map(([k,l])=>`<div class="setting"><h3>${l}</h3><p>${k==='maxDiscount'?'Percentual máximo antes de análise manual.':'Desconto demonstrativo em reais.'}</p><input type="number" data-rule="${k}" value="${r[k]}"></div>`).join('')}</div><div style="margin-top:16px"><button class="savebtn" id="saveRules">SALVAR REGRAS</button></div>`;
 $('#saveRules').onclick=()=>{document.querySelectorAll('[data-rule]').forEach(i=>r[i.dataset.rule]=Number(i.value||0));saveObj(RULES_KEY,r);alert('Regras salvas localmente. A conexão final com o motor será feita junto da tabela comercial real.')};
}
function upgradeView(){
 setTitles('Produtos para upgrade','Aparelhos oferecidos após a avaliação.');
 let p=loadObj(PRODUCTS_KEY,demoProducts);
 $('#content').innerHTML=`<div class="grid2">${p.map((x,i)=>`<div class="setting"><h3>${esc(x.name)} ${esc(x.storage)}</h3><p>Preço demonstrativo do aparelho novo.</p><input type="number" data-prod="${i}" value="${x.price}"></div>`).join('')}</div><div style="margin-top:16px"><button class="savebtn" id="saveProd">SALVAR PREÇOS DE UPGRADE</button></div>`;
 $('#saveProd').onclick=()=>{document.querySelectorAll('[data-prod]').forEach(i=>p[+i.dataset.prod].price=Number(i.value||0));saveObj(PRODUCTS_KEY,p);alert('Preços de upgrade salvos localmente.')};
}
function bindRows(){document.querySelectorAll('[data-id]').forEach(r=>r.onclick=()=>openDetail(r.dataset.id))}
async function openDetail(id){
 let x=activeHistory().find(v=>v.id===id);if(!x)return;
 try{if(window.GringasCloud?.configured && x.cloud)x=await window.GringasCloud.hydratePhotoUrls(x)}catch(e){console.warn(e)}
 const photos=Object.values(x.photos||{}).filter(Boolean);
 const issue=(x.device?.issues||[]).join(', ')||'Nenhum informado';
 const w=x.warranty?.status==='Sim'?`Sim${x.warranty.date?' • até '+x.warranty.date.split('-').reverse().join('/'):''}`:(x.warranty?.status||'Não informado');
 $('#drawerContent').innerHTML=`<div class="detail-head"><div class="eyebrow">${esc(x.id)} • ${dateBR(x.createdAt)}</div><h2>${esc(x.device?.model)} ${esc(x.device?.storage)}</h2><p>${esc(x.customer?.name)} • ${esc(x.customer?.phone||'Sem WhatsApp')}</p></div>
 <div class="detail-value">${money(x.calculation?.estimated)}</div>
 ${x.upgrade?`<div class="upgrade-tag">↗ Interesse: ${esc(x.upgrade.productName)} ${esc(x.upgrade.storage||'')} • diferença ${x.upgrade.difference==null?'a definir':money(x.upgrade.difference)}</div>`:''}
 <div class="detail-box"><h3>Aparelho</h3>
   <div class="kv"><span>Bateria</span><b>${esc(x.device?.battery)}${typeof x.device?.battery==='number'?'%':''}</b></div>
   <div class="kv"><span>Estado físico</span><b>${esc(x.device?.condition)}</b></div>
   <div class="kv"><span>Tela</span><b>${esc(x.device?.screen)}</b></div>
   <div class="kv"><span>Problemas</span><b>${esc(issue)}</b></div>
   <div class="kv"><span>Manutenção</span><b>${esc(x.device?.repair)}</b></div>
   <div class="kv"><span>Alerta de peça</span><b>${esc(x.device?.partAlert)}</b></div>
 </div>
 <div class="detail-box"><h3>Complementares</h3>
   <div class="kv"><span>Garantia Apple</span><b>${esc(w)}</b></div>
   <div class="kv"><span>AppleCare+</span><b>${esc(x.warranty?.appleCare||'—')}</b></div>
   <div class="kv"><span>Acompanha</span><b>${esc((x.accessories||[]).join(', ')||'Somente aparelho')}</b></div>
   <div class="kv"><span>Observações</span><b>${esc(x.notes||'Nenhuma')}</b></div>
 </div>
 <div class="detail-box"><h3>Fotos (${photos.length})</h3>${photos.length?`<div class="photos">${photos.map(p=>`<img src="${p}" alt="Foto da avaliação">`).join('')}</div>`:`<p style="color:#888;font-size:12px">Nenhuma foto disponível no armazenamento local.</p>`}</div>
 <div class="detail-box"><h3>Gestão da negociação</h3><div class="ops">
   <label>Status</label><select id="statusEdit">${statuses.map(s=>`<option ${x.status===s?'selected':''}>${s}</option>`).join('')}</select>
   <label>Valor aprovado presencialmente</label><input id="approved" type="number" value="${x.approvedValue??''}" placeholder="${x.calculation?.estimated||0}">
   <label>Motivo do ajuste</label><textarea id="reason" placeholder="Ex.: estado físico diferente do informado">${esc(x.adjustmentReason||'')}</textarea>
   <button class="primary gold" id="saveOps">SALVAR ALTERAÇÕES</button>
 </div></div>`;
 $('#drawer').classList.add('open');
 $('#saveOps').onclick=async()=>{
   const btn=$('#saveOps');
   const all=activeHistory().map(v=>JSON.parse(JSON.stringify(v))),ix=all.findIndex(v=>v.id===id);if(ix<0)return;
   all[ix].status=$('#statusEdit').value;
   all[ix].approvedValue=$('#approved').value===''?null:Number($('#approved').value);
   all[ix].adjustmentReason=$('#reason').value;
   all[ix].updatedAt=new Date().toISOString();

   btn.disabled=true;
   btn.textContent='SALVANDO...';

   try{
     if(cloudMode && window.GringasCloud?.configured){
       const result=await window.GringasCloud.updateEvaluationOps(all[ix]);
       if(!result || result.mode==='error'){
         throw (result?.error || new Error('A nuvem não confirmou a alteração.'));
       }

       // Recarrega diretamente do Supabase para confirmar que a alteração persistiu.
       const rows=await window.GringasCloud.getEvaluations();
       cloudHistory=Array.isArray(rows)?rows:[];
       localStorage.setItem(HISTORY_KEY,JSON.stringify(cloudHistory));

       const confirmed=cloudHistory.find(v=>v.id===id);
       if(!confirmed || confirmed.status!==all[ix].status){
         throw new Error('O Supabase não confirmou o novo status.');
       }

       openDetail(id);
       renderView();
       alert('Alteração salva e confirmada na nuvem.');
     }else{
       window.__V55_LAST_CHANGED=id;
       saveHistory(all);
       openDetail(id);
       renderView();
       alert('Alteração salva apenas neste navegador (modo local).');
     }
   }catch(e){
     console.error('[Gringas Admin] erro ao salvar alteração',e);
     alert('Não foi possível salvar no Supabase: '+(e?.message||e));
   }finally{
     btn.disabled=false;
     btn.textContent='SALVAR ALTERAÇÕES';
   }
 };
}
function renderView(){
 document.querySelectorAll('.nav').forEach(n=>n.classList.toggle('active',n.dataset.view===currentView));
 ({overview,evaluations,clients,prices,rules,upgrade:upgradeView}[currentView]||overview)();
}
document.querySelectorAll('.nav').forEach(n=>n.onclick=()=>{currentView=n.dataset.view;renderView();$('.sidebar').classList.remove('open')});
$('#drawerClose').onclick=()=>$('#drawer').classList.remove('open');
$('#drawer').onclick=e=>{if(e.target===$('#drawer'))$('#drawer').classList.remove('open')};
$('#menuBtn').onclick=()=>$('.sidebar').classList.toggle('open');
renderView();


/* ===== PASSO 5.6 — LOGIN + SINCRONIZAÇÃO SUPABASE ===== */
(function(){
  function cloudBadge(text,ok=true){
    let b=document.getElementById('cloudBadge');
    if(!b){
      b=document.createElement('button');
      b.id='cloudBadge'; b.className='admin-pill'; b.style.cursor='pointer';
      document.querySelector('header')?.appendChild(b);
    }
    b.innerHTML=(ok?'☁ ':'⚠ ')+text;
    return b;
  }
  function loginOverlay(){
    let o=document.getElementById('cloudLogin');
    if(o)return o;
    o=document.createElement('div');o.id='cloudLogin';
    o.style.cssText='position:fixed;inset:0;z-index:999;background:#0f1111;display:flex;align-items:center;justify-content:center;padding:20px';
    o.innerHTML=`<form id="cloudLoginForm" style="width:min(420px,100%);background:#f7f6f2;border-radius:24px;padding:28px">
      <div style="text-align:center;margin-bottom:24px"><div style="font-size:24px;color:#d89a1b">♛</div><b style="font-size:22px">GRINGAS</b><div style="font-size:10px;color:#b27b13;letter-spacing:3px;font-weight:900">TROCA • ADMIN</div></div>
      <h2 style="margin:0 0 7px">Acesse o painel</h2><p style="color:#777;font-size:13px;margin:0 0 20px">Login administrativo protegido pelo Supabase.</p>
      <label style="font-size:12px;font-weight:800">E-mail</label><input id="cloudEmail" type="email" required style="width:100%;padding:13px;border:1px solid #ddd;border-radius:12px;margin:7px 0 14px">
      <label style="font-size:12px;font-weight:800">Senha</label><input id="cloudPassword" type="password" required style="width:100%;padding:13px;border:1px solid #ddd;border-radius:12px;margin:7px 0 14px">
      <div id="cloudLoginError" style="min-height:18px;color:#a22;font-size:12px;margin-bottom:8px"></div>
      <button style="width:100%;padding:15px;border:0;border-radius:13px;background:linear-gradient(100deg,#c7830b,#e8bb59);font-weight:900;cursor:pointer">ENTRAR →</button>
    </form>`;
    document.body.appendChild(o);
    o.querySelector('#cloudLoginForm').onsubmit=async e=>{
      e.preventDefault();
      const err=o.querySelector('#cloudLoginError');err.textContent='Entrando...';
      try{
        await GringasCloud.signIn(o.querySelector('#cloudEmail').value,o.querySelector('#cloudPassword').value);
        await GringasCloud.claimInitialAdmin().catch(()=>{});
        o.remove();await syncCloud();
      }catch(ex){err.textContent=ex.message||'Não foi possível entrar.'}
    };
    return o;
  }
  async function syncCloud(){
    if(!window.GringasCloud?.configured)return;
    cloudBadge('Sincronizando...',true);
    try{
      const rows=await GringasCloud.getEvaluations();
      // Quando autenticado e conectado, a fonte oficial do painel é SOMENTE a nuvem.
      // O localStorage fica apenas como espelho/fallback para uso offline.
      cloudHistory=Array.isArray(rows)?rows:[];
      cloudMode=true;
      localStorage.setItem(HISTORY_KEY,JSON.stringify(cloudHistory));
      cloudBadge('Nuvem conectada',true).onclick=syncCloud;
      renderView();
    }catch(e){
      console.error(e);
      cloudMode=false;
      cloudHistory=null;
      cloudBadge('Erro na nuvem',false);
      renderView();
    }
  }
  async function initCloud(){
    if(!window.GringasCloud?.configured){
      cloudMode=false;cloudHistory=null;
      cloudBadge('Modo local',false).onclick=()=>alert('Configure config.js para ativar banco, fotos e login na nuvem.');
      return;
    }
    const s=await GringasCloud.session();
    if(!s){loginOverlay();return;}
    await GringasCloud.claimInitialAdmin().catch(()=>{});
    await syncCloud();

    // Só pode mostrar "Nuvem conectada" se a sincronização realmente tiver funcionado.
    // Antes, este trecho sobrescrevia "Erro na nuvem" e fazia o painel parecer conectado
    // mesmo com cloudMode=false.
    const b=document.getElementById('cloudBadge');
    if(b){
      if(cloudMode){
        b.title='Clique para atualizar avaliações';
        b.onclick=syncCloud;
      }else{
        b.title='A sincronização com o Supabase falhou. Clique para tentar novamente.';
        b.onclick=syncCloud;
      }
      // Add logout on context/right click
      b.oncontextmenu=async e=>{e.preventDefault();if(confirm('Sair do painel administrativo?')){await GringasCloud.signOut();location.reload()}};
    }
  }
  window.addEventListener('load',initCloud);
})();
