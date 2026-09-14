
(function(){
  const cfg = window.GRINGAS_CONFIG || {};
  const configured = !!(
    cfg.supabaseUrl && cfg.supabaseAnonKey &&
    !cfg.supabaseUrl.includes('COLE_AQUI') &&
    !cfg.supabaseAnonKey.includes('COLE_AQUI') &&
    window.supabase
  );
  let client = null;
  if(configured){
    client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
      auth: { persistSession:true, autoRefreshToken:true, detectSessionInUrl:true }
    });
  }

  const clone = o => JSON.parse(JSON.stringify(o));
  const safe = s => String(s||'').replace(/[^a-zA-Z0-9._-]/g,'_');

  async function dataUrlToBlob(dataUrl){
    const r = await fetch(dataUrl);
    return await r.blob();
  }
  function extFor(blob, name=''){
    const mime=(blob.type||'').toLowerCase();
    if(mime.includes('png')) return 'png';
    if(mime.includes('webp')) return 'webp';
    if(mime.includes('heic')) return 'heic';
    if(mime.includes('heif')) return 'heif';
    const m=String(name).match(/\.([a-z0-9]{2,5})$/i);
    return m?m[1].toLowerCase():'jpg';
  }

  async function uploadPhotos(code, photos){
    if(!configured || !photos) return {};
    const out={};
    for(const [key,value] of Object.entries(photos)){
      if(!value) continue;
      let data=value, name=key;
      if(typeof value==='object'){ data=value.data||value.url||''; name=value.name||key; }
      if(!String(data).startsWith('data:')){
        out[key]=data;
        continue;
      }
      const blob=await dataUrlToBlob(data);
      const ext=extFor(blob,name);
      const path=`${cfg.storeId}/${safe(code)}/${safe(key)}-${Date.now()}.${ext}`;
      const {error}=await client.storage.from(cfg.photoBucket).upload(path,blob,{
        contentType:blob.type||'image/jpeg',
        upsert:false,
        cacheControl:'3600'
      });
      if(error) throw error;
      out[key]=path;
    }
    return out;
  }

  async function signedPhotoUrl(path, expires=3600){
    if(!configured || !path) return path||'';
    if(/^https?:\/\//i.test(path) || String(path).startsWith('data:')) return path;
    const {data,error}=await client.storage.from(cfg.photoBucket).createSignedUrl(path,expires);
    if(error) return '';
    return data?.signedUrl||'';
  }

  function rowFromRecord(record, photoPaths){
    return {
      code: record.id,
      store_id: cfg.storeId,
      status: record.status || 'Nova',
      customer_name: record.customer?.name || 'Cliente',
      customer_phone: record.customer?.phone || '',
      preferred_service: record.customer?.service || 'WhatsApp',
      device_model: record.device?.model || '',
      device_storage: record.device?.storage || '',
      battery: typeof record.device?.battery==='number' ? record.device.battery : null,
      battery_label: typeof record.device?.battery==='number' ? null : String(record.device?.battery||''),
      condition: record.device?.condition || '',
      screen_condition: record.device?.screen || '',
      issues: record.device?.issues || [],
      repair_history: record.device?.repair || '',
      part_alert: record.device?.partAlert || '',
      warranty_status: record.warranty?.status || '',
      warranty_date: record.warranty?.date || null,
      applecare: record.warranty?.appleCare || '',
      accessories: record.accessories || [],
      notes: record.notes || '',
      photos: photoPaths || {},
      base_value: record.calculation?.base || 0,
      total_discount: record.calculation?.totalDiscount || 0,
      estimated_value: record.calculation?.estimated || 0,
      manual_review: !!record.calculation?.isManual,
      manual_reasons: record.calculation?.manual || [],
      calculation_lines: record.calculation?.lines || [],
      approved_value: record.approvedValue ?? null,
      adjustment_reason: record.adjustmentReason || '',
      metadata: { source:'web-5.6' }
    };
  }

  async function saveEvaluation(record){
    if(!configured) return {mode:'local'};
    try{
      const photoPaths=await uploadPhotos(record.id,record.photos||{});
      const row=rowFromRecord(record,photoPaths);
      // Formulário público: apenas INSERT. Não usa upsert/select porque o visitante
      // não deve ter permissão para ler ou alterar avaliações pela API pública.
      const {error}=await client.from('evaluations').insert(row);
      if(error) throw error;
      return {mode:'cloud'};
    }catch(error){
      console.error('[GringasCloud] saveEvaluation',error);
      return {mode:'error',error};
    }
  }

  async function updateUpgrade(code, upgrade){
    if(!configured) return {mode:'local'};
    const payload={
      upgrade_product_id:upgrade.productId||'',
      upgrade_product_name:upgrade.productName||'',
      upgrade_storage:upgrade.storage||'',
      upgrade_trade_value:upgrade.tradeValue ?? null,
      upgrade_difference:upgrade.difference ?? null,
      updated_at:new Date().toISOString()
    };
    const {error}=await client.from('evaluations').update(payload)
      .eq('store_id',cfg.storeId).eq('code',code);
    return error?{mode:'error',error}:{mode:'cloud'};
  }

  function recordFromRow(r){
    return {
      id:r.code,
      createdAt:r.created_at,
      updatedAt:r.updated_at,
      status:r.status||'Nova',
      customer:{name:r.customer_name||'Cliente',phone:r.customer_phone||'',service:r.preferred_service||'WhatsApp'},
      device:{
        model:r.device_model||'',storage:r.device_storage||'',
        battery:r.battery ?? r.battery_label ?? 'Não informado',
        condition:r.condition||'',screen:r.screen_condition||'',
        issues:r.issues||[],repair:r.repair_history||'',partAlert:r.part_alert||''
      },
      warranty:{status:r.warranty_status||'',date:r.warranty_date||'',appleCare:r.applecare||''},
      accessories:r.accessories||[],
      notes:r.notes||'',
      photos:r.photos||{},
      calculation:{
        base:Number(r.base_value||0),totalDiscount:Number(r.total_discount||0),
        estimated:Number(r.estimated_value||0),isManual:!!r.manual_review,
        manual:r.manual_reasons||[],lines:r.calculation_lines||[]
      },
      approvedValue:r.approved_value==null?null:Number(r.approved_value),
      adjustmentReason:r.adjustment_reason||'',
      upgrade:r.upgrade_product_name ? {
        productId:r.upgrade_product_id||'',
        productName:r.upgrade_product_name||'',
        storage:r.upgrade_storage||'',
        tradeValue:r.upgrade_trade_value==null?null:Number(r.upgrade_trade_value),
        difference:r.upgrade_difference==null?null:Number(r.upgrade_difference),
        selectedAt:r.updated_at
      } : null,
      cloud:true
    };
  }

  async function getEvaluations(){
    if(!configured) return [];
    const {data,error}=await client.from('evaluations').select('*')
      .eq('store_id',cfg.storeId).order('created_at',{ascending:false}).limit(500);
    if(error) throw error;
    return (data||[]).map(recordFromRow);
  }

  async function hydratePhotoUrls(record){
    const copy=clone(record);
    const photos={};
    for(const [key,path] of Object.entries(copy.photos||{})){
      photos[key]=await signedPhotoUrl(path,3600);
    }
    copy.photos=photos;
    return copy;
  }

  async function updateEvaluationOps(record){
    if(!configured) return {mode:'local'};
    const {error}=await client.from('evaluations').update({
      status:record.status,
      approved_value:record.approvedValue ?? null,
      adjustment_reason:record.adjustmentReason||'',
      updated_at:new Date().toISOString()
    }).eq('store_id',cfg.storeId).eq('code',record.id);
    return error?{mode:'error',error}:{mode:'cloud'};
  }

  async function session(){
    if(!configured) return null;
    const {data}=await client.auth.getSession();
    return data?.session||null;
  }
  async function signIn(email,password){
    if(!configured) throw new Error('Supabase não configurado.');
    const {data,error}=await client.auth.signInWithPassword({email,password});
    if(error) throw error;
    try{ await client.rpc('claim_initial_gringas_admin'); }catch(e){}
    return data;
  }
  async function signOut(){ if(configured) await client.auth.signOut(); }
  async function claimInitialAdmin(){
    if(!configured) return;
    const {data,error}=await client.rpc('claim_initial_gringas_admin');
    if(error && !String(error.message||'').includes('already')) throw error;
    return data;
  }

  window.GringasCloud={
    configured, client, cfg,
    saveEvaluation, updateUpgrade, getEvaluations, hydratePhotoUrls,
    updateEvaluationOps, session, signIn, signOut, claimInitialAdmin,
    signedPhotoUrl
  };
})();
