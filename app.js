/* ===========================================================
   Auditoria SSMA · app.js v5
   Turnos · Negociação de prazo · Link gestor · WhatsApp
   =========================================================== */

/* ====== Opções de resposta padrão ====== */
const DEFAULT_OPCOES = [
  {id:'conforme',          label:'Conforme',         peso:1,    cor:'ok',  gera_plano:false, neutro:false},
  {id:'nao_conforme',      label:'Não Conforme',      peso:-1,   cor:'bad', gera_plano:true,  neutro:false},
  {id:'na',                label:'N/A',               peso:0,    cor:'na',  gera_plano:false, neutro:true},
  {id:'oportunidade_melhoria', label:'Oport. Melhoria', peso:0.5, cor:'om', gera_plano:true,  neutro:false},
];

const PRESETS = {
  padrao: [
    {id:'conforme',          label:'Conforme',         peso:1,    cor:'ok',  gera_plano:false, neutro:false},
    {id:'nao_conforme',      label:'Não Conforme',      peso:-1,   cor:'bad', gera_plano:true,  neutro:false},
    {id:'na',                label:'N/A',               peso:0,    cor:'na',  gera_plano:false, neutro:true},
    {id:'oportunidade_melhoria', label:'Oport. Melhoria', peso:0.5, cor:'om', gera_plano:true, neutro:false},
  ],
  sim_nao: [
    {id:'conforme',     label:'Sim',  peso:1,  cor:'ok',  gera_plano:false, neutro:false},
    {id:'nao_conforme', label:'Não',  peso:-1, cor:'bad', gera_plano:true,  neutro:false},
    {id:'na',           label:'N/A',  peso:0,  cor:'na',  gera_plano:false, neutro:true},
  ],
  conforme_nc: [
    {id:'conforme',     label:'Conforme',      peso:1,  cor:'ok',  gera_plano:false, neutro:false},
    {id:'nao_conforme', label:'Não Conforme',  peso:-1, cor:'bad', gera_plano:true,  neutro:false},
    {id:'na',           label:'N/A',           peso:0,  cor:'na',  gera_plano:false, neutro:true},
  ],
  atende: [
    {id:'conforme',     label:'Atende',         peso:1,  cor:'ok',  gera_plano:false, neutro:false},
    {id:'nao_conforme', label:'Não Atende',     peso:-1, cor:'bad', gera_plano:true,  neutro:false},
    {id:'oportunidade_melhoria', label:'Atende Parcialmente', peso:0.5, cor:'om', gera_plano:true, neutro:false},
    {id:'na',           label:'N/A',            peso:0,  cor:'na',  gera_plano:false, neutro:true},
  ],
};

const COR_MAP = {ok:{bg:'var(--ok-bg)',color:'var(--ok)'}, bad:{bg:'var(--bad-bg)',color:'var(--bad)'}, na:{bg:'var(--na-bg)',color:'var(--na)'}, om:{bg:'var(--om-bg)',color:'#92400E'}};
const STATUS_BTN_CLS = {ok:'status-btn--ok', bad:'status-btn--bad', na:'status-btn--na', om:'status-btn--om'};

/* ====== IndexedDB ====== */
const localDB = new Dexie('AuditoriaSSMA');
localDB.version(1).stores({cache:'key', pendingAudits:'id,createdAt'});
async function cacheSet(k,v){try{await localDB.cache.put({key:k,value:JSON.stringify(v)});}catch(e){}}
async function cacheGet(k){try{const r=await localDB.cache.get(k);return r?JSON.parse(r.value):null;}catch(e){return null;}}

/* ====== Estado ====== */
const state={
  view:'dashboard',isOnline:navigator.onLine,pendingCount:0,
  unidades:[],areas:[],colaboradores:[],diretorias:[],turnos:[],formularios:[],
  auditIndex:[],acoesIndex:[],chartData:[],
  config:{peso_conforme:'1',peso_om:'0.5',peso_nc:'-1',whatsapp_ssma:''},
  currentChecklist:[],currentOpcoes:[...DEFAULT_OPCOES],editingAudit:null,editingFormulario:null,
  cadastroDraft:{unidades:[],diretorias:[],turnos:[],areas:[],colaboradores:[]},
  configDraft:{peso_conforme:'1',peso_om:'0.5',peso_nc:'-1',whatsapp_ssma:''},
  cadastroTab:'unidades',
  filterUnidade:'todos',filterDiretoria:'todas',filterArea:'todas',filterFormulario:'todos',filterSearch:'',
  filterAcaoStatus:'todos',filterAcaoUnidade:'todos',filterAcaoDiretoria:'todas',filterAcaoArea:'todas',chartAreaId:'',analiseData:null,analiseLoading:false,filterAnaliseUnidade:'todos',filterAnaliseDiretoria:'todas',filterAnalisePeriodo:'todos',colabSearch:'',colabFilterUnidade:'todos',colabFilterDiretoria:'todas',colabFilterArea:'todas',colabFilterSituacao:'todos',colabShowLimit:150,colabEditing:null,agendaMonth:new Date().toISOString().slice(0,7),agendamentos:[],agendaLoading:false,agendaFilterUnidade:'todos',agendaEditing:null,agendaDayView:null,agendaAuditorQ:'',
};

/* ====== Online/Offline ====== */
window.addEventListener('online',async()=>{state.isOnline=true;updateSyncStatus();await syncPendingAudits();try{state.auditIndex=await loadAuditIndex();state.acoesIndex=await loadAcoesIndex();if(state.view==='dashboard')render();}catch(e){}});
window.addEventListener('offline',()=>{state.isOnline=false;updateSyncStatus();});

function updateSyncStatus(){
  const el=document.getElementById('online-status');if(!el)return;
  if(!state.isOnline){el.innerHTML='🔴 Offline — salvando localmente';el.style.cssText='color:#FDB952;font-size:.72rem;font-family:var(--mono);padding:3px 10px;background:rgba(0,0,0,.3);border-radius:5px;';el.onclick=null;}
  else if(state.pendingCount>0){el.innerHTML=`🟡 ${state.pendingCount} auditoria(s) pendente(s)`;el.style.cssText='color:#B3DD64;font-size:.72rem;font-family:var(--mono);padding:3px 10px;background:rgba(0,0,0,.3);border-radius:5px;cursor:pointer;';el.onclick=()=>App.syncNow();}
  else{el.innerHTML='🟢 Online';el.style.cssText='color:rgba(179,221,100,.65);font-size:.72rem;font-family:var(--mono);padding:3px 10px;';el.onclick=null;}
}

async function syncPendingAudits(){
  if(!state.isOnline)return;
  let pending=[];try{pending=await localDB.pendingAudits.toArray();}catch(e){return;}
  let synced=0;
  for(const item of pending){
    try{
      const audit=JSON.parse(item.auditData),checklist=JSON.parse(item.checklistData);
      if(!audit.codigo||audit.codigo.startsWith('OFFLINE-')){try{audit.codigo=await getNextCode(audit.unidadeSigla,new Date(item.createdAt).getFullYear());}catch(e){audit.codigo='AUD-'+audit.unidadeSigla+'-'+new Date(item.createdAt).getFullYear()+'-'+Date.now().toString(36).toUpperCase();}}
      await uploadBase64Photos(audit,checklist);await saveAuditToDb(audit,checklist);
      await localDB.pendingAudits.delete(item.id);synced++;
    }catch(e){console.warn('Erro sync',item.id,e);}
  }
  state.pendingCount=(await localDB.pendingAudits.count())||0;updateSyncStatus();
  if(synced>0){state.auditIndex=await loadAuditIndex();state.acoesIndex=await loadAcoesIndex();if(state.view==='dashboard')render();showToast(`${synced} auditoria(s) sincronizada(s)!`,'ok');}
}

async function uploadBase64Photos(audit,checklist){
  for(const item of checklist){const r=audit.itens[item.id];if(!r||!r.evidencia||!r.evidencia.startsWith('data:'))continue;try{const blob=dataURLtoBlob(r.evidencia);const path=audit.id+'/'+item.id+'-'+Date.now()+'.jpg';const{error}=await supabaseClient.storage.from('evidencias').upload(path,blob,{contentType:'image/jpeg',upsert:true});if(!error){const{data}=supabaseClient.storage.from('evidencias').getPublicUrl(path);r.evidencia=data.publicUrl;}}catch(e){}}
}

function dataURLtoBlob(d){const[h,data]=d.split(','),mime=h.match(/:(.*?);/)[1],bin=atob(data),arr=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)arr[i]=bin.charCodeAt(i);return new Blob([arr],{type:mime});}
function showToast(msg,type){const e=document.getElementById('toast');if(e)e.remove();const el=document.createElement('div');el.id='toast';el.textContent=msg;el.style.cssText=`position:fixed;bottom:90px;left:50%;transform:translateX(-50%);background:${type==='ok'?'var(--ok)':'var(--bad)'};color:#fff;padding:12px 20px;border-radius:8px;font-weight:600;font-size:.88rem;z-index:9999;box-shadow:0 4px 16px rgba(0,0,0,.2);`;document.body.appendChild(el);setTimeout(()=>el.remove(),4000);}
function generateToken(){const arr=new Uint8Array(20);crypto.getRandomValues(arr);return Array.from(arr).map(b=>b.toString(16).padStart(2,'0')).join('');}

/* ====== Utils ====== */
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function fmtDate(iso){if(!iso)return'—';const p=String(iso).slice(0,10).split('-');return p.length===3?p[2]+'/'+p[1]+'/'+p[0]:iso;}
function newUUID(){return crypto&&crypto.randomUUID?crypto.randomUUID():'id_'+Date.now().toString(36)+Math.random().toString(36).slice(2,10);}
function genId(){return'new_'+Date.now().toString(36)+Math.random().toString(36).slice(2,7);}
function groupByCategoria(list){const o=[],m={};list.forEach(it=>{if(!m[it.categoria]){m[it.categoria]=[];o.push(it.categoria);}m[it.categoria].push(it);});return o.map(c=>({categoria:c,itens:m[c]}));}
function toggleSidebar(){document.body.classList.toggle('sidebar-open');}
const NAV_TITLES={dashboard:'Painel',agenda:'Agenda',form:'Auditoria','formulario-editor':'Formulário',acoes:'Planos de Ação',analise:'Análise',formularios:'Formulários',cadastros:'Cadastros'};
function setActiveNav(view){
  const k=view==='formulario-editor'?'formularios':view;
  document.querySelectorAll('#nav .nav__btn').forEach(b=>b.classList.toggle('is-active',b.dataset.nav===k));
  const titleEl=document.getElementById('page-title');
  if(titleEl)titleEl.textContent=NAV_TITLES[view]||'Auditoria Interna';
  document.body.classList.remove('sidebar-open');
}
async function compressToBase64(file){return new Promise((res,rej)=>{const r=new FileReader();r.onload=e=>{const img=new Image();img.onload=()=>{let w=img.width,h=img.height;if(w>1280){h=Math.round(h*1280/w);w=1280;}const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(img,0,0,w,h);res(c.toDataURL('image/jpeg',.72));};img.onerror=rej;img.src=e.target.result;};r.onerror=rej;r.readAsDataURL(file);});}

function computeScore(audit,checklist){
  const opcoes=state.currentOpcoes||DEFAULT_OPCOES;
  let totalPeso=0,totalNaoNeutro=0;
  const contagens={};opcoes.forEach(op=>contagens[op.id]=0);
  checklist.forEach(item=>{
    const r=audit.itens[item.id];if(!r||!r.status)return;
    const op=opcoes.find(o=>o.id===r.status);if(!op)return;
    contagens[op.id]=(contagens[op.id]||0)+1;
    if(!op.neutro){totalPeso+=parseFloat(op.peso||0);totalNaoNeutro++;}
  });
  const resultado=totalNaoNeutro>0?Math.round((totalPeso/totalNaoNeutro)*1000)/10:0;
  const totalNc=opcoes.filter(op=>op.gera_plano&&parseFloat(op.peso||0)<0).reduce((s,op)=>s+(contagens[op.id]||0),0);
  const totalOm=opcoes.filter(op=>op.gera_plano&&parseFloat(op.peso||0)>=0).reduce((s,op)=>s+(contagens[op.id]||0),0);
  const totalNeutro=opcoes.filter(op=>op.neutro).reduce((s,op)=>s+(contagens[op.id]||0),0);
  return{contagens,pontosPossiveis:totalNaoNeutro,resultado,totalNc,totalOm,totalNeutro,opcoes};
}
function classify(r){
  if(r>=90)return{label:'Excelente',cls:'excelente',color:'#065F46',bg:'#D1FAE5'};
  if(r>=70)return{label:'Bom',cls:'bom',color:'#07583B',bg:'#E4F4EC'};
  if(r>=50)return{label:'Regular',cls:'regular',color:'#92400E',bg:'#FFF4DC'};
  return{label:'Atenção',cls:'atencao',color:'#DF4636',bg:'#FBEAE8'};
}
function stampClass(r){if(r>=90)return'stamp--excelente';if(r>=70)return'stamp--bom';if(r>=50)return'stamp--regular';return'stamp--atencao';}
function emptyItens(cl){const o={};cl.forEach(it=>{o[it.id]={status:null,observacao:'',evidencia:null,planoAcao:{acao:'',responsavel:'',prazo:'',status:'pendente',statusNegociacao:'aguardando_gestor'}};});return o;}

/* ====== CSV ====== */
function detectDelim(l){
  const counts={';':(l.match(/;/g)||[]).length,',':(l.match(/,/g)||[]).length,'\t':(l.match(/\t/g)||[]).length};
  let best=';',bestN=-1;
  for(const[d,n] of Object.entries(counts)){if(n>bestN){bestN=n;best=d;}}
  return bestN>0?best:',';
}
function parseCSVLine(l,d){const r=[];let cur='',q=false;for(let i=0;i<l.length;i++){const c=l[i];if(c==='"'){if(q&&l[i+1]==='"'){cur+='"';i++;}else q=!q;}else if(c===d&&!q){r.push(cur);cur='';}else cur+=c;}r.push(cur);return r.map(s=>s.trim().replace(/^"|"$/g,''));}
function parseCSV(t){
  // Remove BOM se presente
  if(t.charCodeAt(0)===0xFEFF)t=t.slice(1);
  const lines=t.split(/\r?\n/).filter(x=>x.trim().length);
  if(!lines.length)return{headers:[],rows:[]};
  const d=detectDelim(lines[0]);
  const headers=parseCSVLine(lines[0],d);
  const rows=lines.slice(1).map(l=>parseCSVLine(l,d)).filter(r=>r.some(c=>c&&c.trim()));
  return{headers,rows,delimiter:d};
}
// Lê o arquivo tentando UTF-8; se detectar muitos caracteres corrompidos (típico de CSV exportado do Senior em Windows-1252/Latin-1), relê com a codificação correta
async function readCsvFile(file){
  const buf=await file.arrayBuffer();
  const utf8Text=new TextDecoder('utf-8').decode(buf);
  const badChars=(utf8Text.match(/\ufffd/g)||[]).length;
  if(badChars>2){
    // Provável Latin-1/Windows-1252 — relê com a codificação correta
    try{return new TextDecoder('windows-1252').decode(buf);}catch(e){return utf8Text;}
  }
  return utf8Text;
}
function guessMapSenior(h){
  const l=h.map(x=>x.toLowerCase().trim().replace(/[_\s]+/g,'_'));
  const f=keys=>{for(const k of keys){const i=l.findIndex(x=>x.includes(k));if(i>-1)return i;}return-1;};
  return{
    mat:f(['matricula','matric','registro','cod_func']),
    nome:f(['nome']),
    nasc:f(['data_nasc','nascimento']),
    admiss:f(['data_admiss','admissao']),
    unid:f(['unidade','filial','unid']),
    diretoria:f(['diretoria']),
    gerencia:f(['gerencia','gerência']),
    supervisao:f(['supervisao','supervisão']),
    local:f(['local']),
    situacao:f(['situacao','situação','status']),
    cargo:f(['cargo','funcao','função']),
    codcc:f(['cod_centro','cod_cc','cód_cc','centro_custo']),
    desccc:f(['desc_centro','desc_cc','descrição_cc','descricao_cc']),
  };
}
function parseDate(s){
  if(!s||!s.trim())return null;
  let v=s.trim().split(/[\sT]/)[0]; // remove componente de hora, se houver
  if(!v)return null;
  // Já no formato ISO (AAAA-MM-DD)
  if(/^\d{4}-\d{2}-\d{2}$/.test(v))return v;
  // DD/MM/AAAA ou DD-MM-AAAA
  const m=v.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if(m){
    const day=m[1].padStart(2,'0'),month=m[2].padStart(2,'0'),year=m[3];
    const mi=parseInt(month,10),di=parseInt(day,10);
    if(mi<1||mi>12||di<1||di>31)return null;
    return`${year}-${month}-${day}`;
  }
  return null; // formato não reconhecido — ignora em vez de quebrar a importação
}

/* ====== Camada de dados ====== */
async function withCache(key,fetcher,fallback=[]){
  if(state.isOnline){try{const d=await fetcher();await cacheSet(key,d);return d;}catch(e){return(await cacheGet(key))||fallback;}}
  return(await cacheGet(key))||fallback;
}
async function loadUnidades(){return withCache('unidades',async()=>{const{data,error}=await supabaseClient.from('unidades').select('*').order('nome');if(error)throw error;return data||[];});}
async function loadDiretorias(){return withCache('diretorias',async()=>{const{data,error}=await supabaseClient.from('diretorias').select('*').order('nome');if(error)throw error;return data||[];});}
async function loadTurnos(){return withCache('turnos',async()=>{const{data,error}=await supabaseClient.from('turnos').select('*').order('nome');if(error)throw error;return data||[];});}
async function loadAreas(){return withCache('areas',async()=>{const{data,error}=await supabaseClient.from('areas').select('*,diretorias(nome)').order('nome');if(error)throw error;return(data||[]).map(a=>({id:a.id,nome:a.nome,unidade_id:a.unidade_id,diretoria_id:a.diretoria_id||null,diretoria_nome:a.diretorias?.nome||''}));});}
async function loadColaboradores(){
  return withCache('colaboradores',async()=>{
    // Supabase limita cada consulta a 1000 linhas por padrão — pagina até trazer tudo
    const PAGE=1000;let all=[],from=0;
    while(true){
      const{data,error}=await supabaseClient.from('colaboradores')
        .select('id,nome,matricula,telefone,unidade_id,diretoria_id,area_id,cargo,situacao,gerencia,supervisao,data_nascimento,data_admissao,cod_centro_custo,desc_centro_custo')
        .order('nome').range(from,from+PAGE-1);
      if(error)throw error;
      all=all.concat(data||[]);
      if(!data||data.length<PAGE)break;
      from+=PAGE;
    }
    return all;
  });
}
async function loadFormularios(){
  return withCache('formularios',async()=>{
    const{data:f,error}=await supabaseClient.from('formularios').select('id,nome,descricao,opcoes_resposta').eq('ativo',true).order('created_at');if(error)throw error;
    const{data:items}=await supabaseClient.from('checklist_items').select('formulario_id').eq('ativo',true);
    const cnt={};(items||[]).forEach(i=>{cnt[i.formulario_id]=(cnt[i.formulario_id]||0)+1;});
    return(f||[]).map(x=>({id:x.id,nome:x.nome,descricao:x.descricao||'',itemCount:cnt[x.id]||0,opcoes:x.opcoes_resposta||DEFAULT_OPCOES}));
  });
}
async function loadChecklistForFormulario(fid){return withCache('cl:'+fid,async()=>{const{data,error}=await supabaseClient.from('checklist_items').select('*').eq('formulario_id',fid).eq('ativo',true).order('ordem');if(error)throw error;return(data||[]).map(d=>({id:d.id,categoria:d.categoria,texto:d.texto}));});}
async function loadFormularioWithItems(fid){if(!state.isOnline){return(await cacheGet('fFull:'+fid))||null;}try{const{data,error}=await supabaseClient.from('formularios').select('*').eq('id',fid).single();if(error||!data)return null;const{data:items}=await supabaseClient.from('checklist_items').select('*').eq('formulario_id',fid).eq('ativo',true).order('ordem');const r={id:data.id,nome:data.nome,descricao:data.descricao||'',opcoes:data.opcoes_resposta||DEFAULT_OPCOES,itens:(items||[]).map(d=>({id:d.id,categoria:d.categoria,texto:d.texto}))};await cacheSet('fFull:'+fid,r);return r;}catch(e){return null;}}
async function loadConfig(){
  return withCache('config',async()=>{
    const{data,error}=await supabaseClient.from('configuracoes').select('*');if(error)throw error;
    const cfg={peso_conforme:'1',peso_om:'0.5',peso_nc:'-1',whatsapp_ssma:''};
    (data||[]).forEach(row=>{cfg[row.chave]=row.valor;});return cfg;
  },{peso_conforme:'1',peso_om:'0.5',peso_nc:'-1',whatsapp_ssma:''});
}
async function loadAuditIndex(){
  if(!state.isOnline){
    const cached=(await cacheGet('auditIndex'))||[];
    const pending=await localDB.pendingAudits.toArray().catch(()=>[]);
    const pCards=pending.map(p=>{try{const a=JSON.parse(p.auditData);return{...a,_offline:true,codigo:a.codigo||'OFFLINE',resultado:0,classificacao:'',totalNc:0,totalOm:0};}catch(e){return null;}}).filter(Boolean);
    return[...pCards,...cached];
  }
  const PAGE=1000;let rawData=[],from=0;
  while(true){
    const{data,error}=await supabaseClient.from('audits').select('id,codigo,unidade_nome,unidade_id,area_nome,area_id,diretoria_nome,diretoria_id,turno_nome,formulario_nome,formulario_id,data,resultado,classificacao,total_nc,total_om,atualizado_em').order('data',{ascending:false}).range(from,from+PAGE-1);
    if(error)throw error;
    rawData=rawData.concat(data||[]);
    if(!data||data.length<PAGE)break;
    from+=PAGE;
  }
  const list=rawData.map(a=>({id:a.id,codigo:a.codigo,unidadeNome:a.unidade_nome,unidadeId:a.unidade_id,areaNome:a.area_nome,areaId:a.area_id,diretoriaNome:a.diretoria_nome||'',diretoriaId:a.diretoria_id,turnoNome:a.turno_nome||'',formularioNome:a.formulario_nome,formularioId:a.formulario_id,data:a.data,resultado:a.resultado,classificacao:a.classificacao,totalNc:a.total_nc,totalOm:a.total_om}));
  await cacheSet('auditIndex',list);return list;
}
async function loadAuditFull(id){
  try{const p=await localDB.pendingAudits.get(id);if(p){const a=JSON.parse(p.auditData),cl=JSON.parse(p.checklistData);return{...a,checklistFromHistory:cl,_offline:true};}}catch(e){}
  const cached=await cacheGet('aFull:'+id);
  if(!state.isOnline&&cached)return cached;
  try{
    const{data:audit,error}=await supabaseClient.from('audits').select('*').eq('id',id).single();
    if(error||!audit)return cached||null;
    const{data:rows}=await supabaseClient.from('audit_itens').select('*').eq('audit_id',id);
    const itens={},cl=[];
    (rows||[]).forEach(r=>{const key=r.checklist_item_id||r.id;itens[key]={status:r.status,observacao:r.observacao||'',evidencia:r.evidencia_url||null,planoAcao:{acao:r.plano_acao_acao||'',responsavel:r.plano_acao_responsavel||'',prazo:r.plano_acao_prazo||'',status:r.plano_acao_status||'pendente',prazoGestor:r.plano_acao_prazo_gestor||'',comentarioGestor:r.plano_acao_comentario_gestor||'',statusNegociacao:r.plano_acao_status_negociacao||'aguardando_gestor'}};cl.push({id:key,categoria:r.checklist_item_categoria,texto:r.checklist_item_texto});});
    const result={id:audit.id,persisted:true,codigo:audit.codigo,token_gestor:audit.token_gestor||null,formularioId:audit.formulario_id,formularioNome:audit.formulario_nome,unidadeId:audit.unidade_id,unidadeNome:audit.unidade_nome,unidadeSigla:audit.unidade_sigla,areaId:audit.area_id,areaNome:audit.area_nome,diretoriaId:audit.diretoria_id,diretoriaNome:audit.diretoria_nome||'',turnoId:audit.turno_id,turnoNome:audit.turno_nome||'',data:audit.data,auditores:audit.auditores||[],auditados:audit.auditados||[],observacaoGeral:audit.observacao_geral||'',itens,checklistFromHistory:cl};
    await cacheSet('aFull:'+id,result);return result;
  }catch(e){return cached||null;}
}
async function saveAuditToDb(a,checklist){
  const sc=computeScore(a,checklist),cl=classify(sc.resultado);
  const opcoes=sc.opcoes||DEFAULT_OPCOES;
  const totalConforme=opcoes.filter(op=>!op.neutro&&!op.gera_plano&&parseFloat(op.peso||0)>0).reduce((s,op)=>s+(sc.contagens[op.id]||0),0);
  const row={id:a.id,codigo:a.codigo,token_gestor:a.token_gestor||null,formulario_id:a.formularioId||null,formulario_nome:a.formularioNome||'',unidade_id:a.unidadeId||null,unidade_nome:a.unidadeNome||'',unidade_sigla:a.unidadeSigla||'',area_id:a.areaId||null,area_nome:a.areaNome||'',diretoria_id:a.diretoriaId||null,diretoria_nome:a.diretoriaNome||'',turno_id:a.turnoId||null,turno_nome:a.turnoNome||'',data:a.data,auditores:a.auditores,auditados:a.auditados,observacao_geral:a.observacaoGeral||'',total_conforme:totalConforme,total_nc:sc.totalNc,total_om:sc.totalOm,total_na:sc.totalNeutro,pontos_possiveis:sc.pontosPossiveis,resultado:sc.resultado,classificacao:cl.label,atualizado_em:new Date().toISOString()};
  const{error}=await supabaseClient.from('audits').upsert(row,{onConflict:'id'});if(error)throw error;
  await supabaseClient.from('audit_itens').delete().eq('audit_id',a.id);
  const itemRows=checklist.map(item=>{const r=a.itens[item.id]||{};const pa=r.planoAcao||{};return{audit_id:a.id,checklist_item_id:item.id,checklist_item_texto:item.texto,checklist_item_categoria:item.categoria,status:r.status||null,observacao:r.observacao||'',evidencia_url:r.evidencia&&!r.evidencia.startsWith('data:')?r.evidencia:null,plano_acao_acao:pa.acao||'',plano_acao_responsavel:pa.responsavel||'',plano_acao_prazo:pa.prazo||null,plano_acao_status:pa.status||'pendente',plano_acao_prazo_gestor:pa.prazoGestor||null,plano_acao_comentario_gestor:pa.comentarioGestor||'',plano_acao_status_negociacao:pa.statusNegociacao||'aguardando_gestor'};});
  if(itemRows.length){const{error:e2}=await supabaseClient.from('audit_itens').insert(itemRows);if(e2)throw e2;}
  await autoLinkAgendamento(a);
}
async function loadAcoesIndex(){
  if(!state.isOnline)return(await cacheGet('acoesIndex'))||[];
  try{
    const PAGE=1000;let rawData=[],from=0;
    while(true){
      const{data,error}=await supabaseClient.from('audit_itens').select('id,audit_id,checklist_item_id,checklist_item_texto,plano_acao_acao,plano_acao_responsavel,plano_acao_prazo,plano_acao_status,plano_acao_prazo_gestor,plano_acao_comentario_gestor,plano_acao_status_negociacao,audits(codigo,area_nome,area_id,diretoria_id,unidade_nome,unidade_id,data)').in('status',['nao_conforme','oportunidade_melhoria']).range(from,from+PAGE-1);
      if(error)throw error;
      rawData=rawData.concat(data||[]);
      if(!data||data.length<PAGE)break;
      from+=PAGE;
    }
    const list=rawData.map(r=>{const a=r.audits||{};return{rowId:r.id,auditId:r.audit_id,codigo:a.codigo||'',itemTexto:r.checklist_item_texto,areaNome:a.area_nome||'',areaId:a.area_id||'',diretoriaId:a.diretoria_id||'',unidadeNome:a.unidade_nome||'',unidadeId:a.unidade_id||'',data:a.data||'',acao:r.plano_acao_acao||'',responsavel:r.plano_acao_responsavel||'',prazo:r.plano_acao_prazo||'',status:r.plano_acao_status||'pendente',prazoGestor:r.plano_acao_prazo_gestor||'',comentarioGestor:r.plano_acao_comentario_gestor||'',statusNegociacao:r.plano_acao_status_negociacao||'aguardando_gestor'};});
    await cacheSet('acoesIndex',list);return list;
  }catch(e){return(await cacheGet('acoesIndex'))||[];}
}
async function loadEvolutionData(areaId){if(!state.isOnline)return(await cacheGet('evo:'+areaId))||[];try{const{data}=await supabaseClient.from('audits').select('data,resultado,classificacao,codigo').eq('area_id',areaId).order('data',{ascending:true});const l=data||[];await cacheSet('evo:'+areaId,l);return l;}catch(e){return(await cacheGet('evo:'+areaId))||[];}}
async function getNextCode(sigla,ano){const{data,error}=await supabaseClient.rpc('get_next_audit_seq',{p_sigla:sigla,p_ano:ano});if(error)throw error;return`AUD-${sigla}-${ano}-${String(data).padStart(3,'0')}`;}

/* ====== Agenda ====== */
async function loadAgendamentos(yearMonth){
  const[y,m]=yearMonth.split('-').map(Number);
  const inicio=`${yearMonth}-01`;
  const fimDate=new Date(y,m,0); // último dia do mês
  const fim=`${yearMonth}-${String(fimDate.getDate()).padStart(2,'0')}`;
  const{data,error}=await supabaseClient.from('agendamentos').select('*').gte('data',inicio).lte('data',fim).order('data',{ascending:true});
  if(error)throw error;
  return(data||[]).map(a=>({
    id:a.id,data:a.data,unidadeId:a.unidade_id,unidadeNome:a.unidade_nome||'',areaId:a.area_id,areaNome:a.area_nome||'',
    diretoriaId:a.diretoria_id,diretoriaNome:a.diretoria_nome||'',turnoId:a.turno_id,turnoNome:a.turno_nome||'',
    formularioId:a.formulario_id,formularioNome:a.formulario_nome||'',auditorNome:a.auditor_nome||'',auditorMatricula:a.auditor_matricula||'',
    observacao:a.observacao||'',status:a.status,auditId:a.audit_id||null
  }));
}
async function saveAgendamentoToDb(ag){
  const row={id:ag.id,data:ag.data,unidade_id:ag.unidadeId||null,unidade_nome:ag.unidadeNome||'',area_id:ag.areaId||null,area_nome:ag.areaNome||'',
    diretoria_id:ag.diretoriaId||null,diretoria_nome:ag.diretoriaNome||'',turno_id:ag.turnoId||null,turno_nome:ag.turnoNome||'',
    formulario_id:ag.formularioId||null,formulario_nome:ag.formularioNome||'',auditor_nome:ag.auditorNome||'',auditor_matricula:ag.auditorMatricula||'',
    observacao:ag.observacao||'',status:ag.status||'agendado'};
  const{error}=await supabaseClient.from('agendamentos').upsert(row,{onConflict:'id'});
  if(error)throw error;
}
async function deleteAgendamentoDb(id){const{error}=await supabaseClient.from('agendamentos').delete().eq('id',id);if(error)throw error;}
// Vincula automaticamente uma auditoria recém-salva a um agendamento pendente da mesma área/mês
async function autoLinkAgendamento(audit){
  if(!audit.areaId||!audit.data)return;
  try{
    const yearMonth=audit.data.slice(0,7);
    const inicio=yearMonth+'-01';
    const[y,m]=yearMonth.split('-').map(Number);
    const fim=yearMonth+'-'+String(new Date(y,m,0).getDate()).padStart(2,'0');
    const{data,error}=await supabaseClient.from('agendamentos').select('id,data')
      .eq('area_id',audit.areaId).eq('status','agendado').is('audit_id',null)
      .gte('data',inicio).lte('data',fim).order('data',{ascending:true});
    if(error||!data||!data.length)return;
    // Escolhe o agendamento com data mais próxima da data real da auditoria
    const alvo=audit.data;
    let melhor=data[0],menorDiff=Math.abs(new Date(data[0].data)-new Date(alvo));
    data.forEach(d=>{const diff=Math.abs(new Date(d.data)-new Date(alvo));if(diff<menorDiff){menorDiff=diff;melhor=d;}});
    await supabaseClient.from('agendamentos').update({audit_id:audit.id}).eq('id',melhor.id);
  }catch(e){console.warn('autoLinkAgendamento falhou (não crítico):',e);}
}


/* ====== WhatsApp ====== */
function buildWhatsAppLink(audit, reportUrl){
  const auditadoNomes=(audit.auditados||[]).map(a=>a.nome).filter(Boolean).join(', ');
  const sc=computeScore(audit,state.currentChecklist);
  const cl=classify(sc.resultado);
  let phone='';
  if(audit.auditados&&audit.auditados.length>0){
    const colab=state.colaboradores.find(c=>c.nome===audit.auditados[0].nome&&c.telefone);
    if(colab)phone=colab.telefone.replace(/\D/g,'');
  }
  const msg=
    `*Auditoria SSMA — ${audit.codigo}*\n\n`+
    `📍 Área: ${audit.areaNome}\n`+
    `📅 Data: ${fmtDate(audit.data)}\n`+
    (audit.turnoNome?`⏱ Turno: ${audit.turnoNome}\n`:'')+
    (audit.diretoriaNome?`🏢 Diretoria: ${audit.diretoriaNome}\n`:'')+
    (auditadoNomes?`👤 Auditado(s): ${auditadoNomes}\n`:'')+
    `\n📊 *Resultado: ${sc.resultado}% — ${cl.label}*\n`+
    (sc.NC?`❌ Não conformidades: ${sc.NC}\n`:'')+
    (sc.OM?`⚠️ Oportunidades de melhoria: ${sc.OM}\n`:'')+
    `\nPor favor, acesse o link abaixo, veja o relatório e *proponha os prazos* para cada plano de ação:\n${reportUrl}\n\n`+
    `_Equipe SSMA · Usina Santa Adélia_`;
  const num=phone||state.config.whatsapp_ssma?.replace(/\D/g,'')||'';
  return num?`https://wa.me/55${num}?text=${encodeURIComponent(msg)}`:`https://wa.me/?text=${encodeURIComponent(msg)}`;
}

/* ====== Análise ====== */
async function loadAnaliseData(){
  const[ncRes,auditRes]=await Promise.all([
    supabaseClient.from('audit_itens')
      .select('checklist_item_texto,checklist_item_categoria,status,audit_id')
      .in('status',['nao_conforme','oportunidade_melhoria'])
      .limit(5000),
    supabaseClient.from('audits')
      .select('id,auditores,total_nc,total_om,resultado,area_nome,unidade_nome,unidade_id,diretoria_id,diretoria_nome,data')
      .order('data',{ascending:false}).limit(2000)
  ]);
  let audits=auditRes.data||[];
  const items=ncRes.data||[];
  // Aplica filtros de unidade/diretoria/período
  if(state.filterAnaliseUnidade!=='todos')audits=audits.filter(a=>a.unidade_id===state.filterAnaliseUnidade);
  if(state.filterAnaliseDiretoria!=='todas')audits=audits.filter(a=>a.diretoria_id===state.filterAnaliseDiretoria);
  if(state.filterAnalisePeriodo!=='todos'){
    const dias=parseInt(state.filterAnalisePeriodo,10);
    const limite=new Date();limite.setDate(limite.getDate()-dias);
    const limiteStr=limite.toISOString().slice(0,10);
    audits=audits.filter(a=>a.data>=limiteStr);
  }
  const auditIds=new Set(audits.map(a=>a.id));
  const filteredItems=items.filter(row=>auditIds.has(row.audit_id));
  const auditMap={};audits.forEach(a=>auditMap[a.id]=a);
  // NC por item
  const byItem={};
  filteredItems.forEach(row=>{
    const a=auditMap[row.audit_id];if(!a)return;
    const k=row.checklist_item_texto;
    if(!byItem[k])byItem[k]={texto:k,categoria:row.checklist_item_categoria||'—',nc:0,om:0,areas:new Set()};
    if(row.status==='nao_conforme')byItem[k].nc++;else byItem[k].om++;
    if(a.area_nome)byItem[k].areas.add(a.area_nome);
  });
  // Por auditor
  const byAuditor={};
  audits.forEach(a=>{
    (a.auditores||[]).forEach(aud=>{
      const nome=(typeof aud==='object'?aud.nome:aud||'').trim();if(!nome)return;
      if(!byAuditor[nome])byAuditor[nome]={nome,n:0,nc:0,om:0,semNc:0,res:[]};
      byAuditor[nome].n++;byAuditor[nome].nc+=a.total_nc||0;byAuditor[nome].om+=a.total_om||0;
      byAuditor[nome].res.push(a.resultado||0);
      if(!(a.total_nc))byAuditor[nome].semNc++;
    });
  });
  // Por área
  const byArea={};
  audits.forEach(a=>{
    const k=a.area_nome||'—';
    if(!byArea[k])byArea[k]={nome:k,n:0,somaRes:0,nc:0};
    byArea[k].n++;byArea[k].somaRes+=a.resultado||0;byArea[k].nc+=a.total_nc||0;
  });
  return{
    ncByItem:Object.values(byItem).map(x=>({...x,areas:[...x.areas]})).sort((a,b)=>b.nc-a.nc).slice(0,20),
    auditores:Object.values(byAuditor).map(x=>({...x,media:x.res.length?Math.round(x.res.reduce((s,v)=>s+v,0)/x.res.length):0,taxaSemNc:x.n>0?Math.round(x.semNc/x.n*100):0})).sort((a,b)=>b.n-a.n),
    byArea:Object.values(byArea).map(x=>({...x,media:Math.round(x.somaRes/x.n)})).sort((a,b)=>b.n-a.n),
    totalAudits:audits.length
  };
}
function analiseHtml(){
  if(!state.analiseData&&state.analiseLoading)return'<div class="loading">Carregando análise…</div>';
  if(!state.analiseData)return`<div class="filterbar" style="margin-bottom:18px;"><h2 style="font-weight:800;font-size:1.35rem;margin:0;color:var(--brand);">Análise de Auditorias</h2></div><div class="empty"><strong>Clique para carregar a análise</strong><br><br><button class="btn-primary" onclick="App.reloadAnalise()">📊 Carregar análise</button></div>`;
  const d=state.analiseData;
  // Alertas de auditores
  const alertAuditores=d.auditores.filter(a=>a.n>=3&&a.taxaSemNc>=80);
  const alertAreas=d.byArea.filter(a=>a.media<70&&a.n>=2);
  // Bar chart de áreas (top 10)
  const topAreas=d.byArea.slice(0,10);
  const maxMedia=topAreas.length?Math.max(...topAreas.map(a=>a.media)):100;
  const uOptsAn=state.unidades.map(u=>`<option value="${u.id}" ${state.filterAnaliseUnidade===u.id?'selected':''}>${esc(u.nome)}</option>`).join('');
  const dOptsAn=(state.filterAnaliseUnidade==='todos'?state.diretorias:state.diretorias.filter(dd=>dd.unidade_id===state.filterAnaliseUnidade)).map(dd=>`<option value="${dd.id}" ${state.filterAnaliseDiretoria===dd.id?'selected':''}>${esc(dd.nome)}</option>`).join('');
  return`<div class="filterbar" style="margin-bottom:18px;flex-wrap:wrap;">
    <h2 style="font-weight:800;font-size:1.35rem;margin:0;color:var(--brand);">Análise de Auditorias</h2>
    <span style="font-family:var(--mono);font-size:.78rem;color:var(--ink-soft);">${d.totalAudits} auditoria(s) analisada(s)</span>
  </div>
  <div class="filterbar" style="margin-bottom:18px;">
    <select class="flt-select" onchange="App.setFAnU(this.value)"><option value="todos">Todas unidades</option>${uOptsAn}</select>
    <select class="flt-select" onchange="App.setFAnD(this.value)"><option value="todas">Todas diretorias</option>${dOptsAn}</select>
    <select class="flt-select" onchange="App.setFAnP(this.value)">
      <option value="todos" ${state.filterAnalisePeriodo==='todos'?'selected':''}>Todo o período</option>
      <option value="30" ${state.filterAnalisePeriodo==='30'?'selected':''}>Últimos 30 dias</option>
      <option value="90" ${state.filterAnalisePeriodo==='90'?'selected':''}>Últimos 90 dias</option>
      <option value="180" ${state.filterAnalisePeriodo==='180'?'selected':''}>Últimos 6 meses</option>
      <option value="365" ${state.filterAnalisePeriodo==='365'?'selected':''}>Último ano</option>
    </select>
    <button class="btn-secondary" style="margin-left:auto;" onclick="App.reloadAnalise()">🔄 Atualizar</button>
  </div>
  ${(alertAuditores.length||alertAreas.length)?`<div style="background:var(--om-bg);border:1px solid var(--om);border-radius:10px;padding:14px 16px;margin-bottom:20px;">
    <p style="font-weight:700;font-size:.9rem;color:#92400E;margin:0 0 8px;">⚠ Alertas de Qualidade</p>
    ${alertAuditores.map(a=>`<p style="margin:4px 0;font-size:.86rem;">👤 <strong>${esc(a.nome)}</strong> realizou ${a.n} auditorias com ${a.taxaSemNc}% sem nenhuma Não Conformidade — pode indicar preenchimento superficial</p>`).join('')}
    ${alertAreas.map(a=>`<p style="margin:4px 0;font-size:.86rem;">📍 <strong>${esc(a.nome)}</strong> média de ${a.media}% em ${a.n} auditoria(s) — abaixo da meta de 70%</p>`).join('')}
  </div>`:''}
  <div class="panel" style="margin-bottom:20px;"><div class="panel__pad">
    <h3 style="font-weight:700;font-size:1rem;color:var(--brand);margin:0 0 14px;">🔴 Top itens com Não Conformidades</h3>
    ${d.ncByItem.length?`<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:.85rem;">
      <thead><tr style="background:var(--paper);"><th style="text-align:left;padding:8px 10px;border-bottom:2px solid var(--line);font-size:.72rem;color:var(--ink-soft);text-transform:uppercase;letter-spacing:.04em;">Item</th><th style="padding:8px 10px;border-bottom:2px solid var(--line);font-size:.72rem;color:var(--ink-soft);text-transform:uppercase;letter-spacing:.04em;text-align:center;">NC</th><th style="padding:8px 10px;border-bottom:2px solid var(--line);font-size:.72rem;color:var(--ink-soft);text-transform:uppercase;letter-spacing:.04em;text-align:center;">OM</th><th style="padding:8px 10px;border-bottom:2px solid var(--line);font-size:.72rem;color:var(--ink-soft);text-transform:uppercase;letter-spacing:.04em;">Áreas afetadas</th></tr></thead>
      <tbody>${d.ncByItem.map((item,i)=>`<tr style="border-bottom:1px solid var(--line);">
        <td style="padding:9px 10px;"><span style="font-family:var(--mono);font-size:.68rem;color:var(--ink-soft);margin-right:6px;">${i+1}</span>${esc(item.texto)}<div style="font-size:.72rem;color:var(--ink-soft);">${esc(item.categoria)}</div></td>
        <td style="padding:9px 10px;text-align:center;"><span style="background:var(--bad-bg);color:var(--bad);font-weight:700;font-family:var(--mono);font-size:.88rem;padding:2px 8px;border-radius:4px;">${item.nc}</span></td>
        <td style="padding:9px 10px;text-align:center;"><span style="background:var(--om-bg);color:#92400E;font-weight:700;font-family:var(--mono);font-size:.88rem;padding:2px 8px;border-radius:4px;">${item.om}</span></td>
        <td style="padding:9px 10px;font-size:.78rem;color:var(--ink-soft);">${item.areas.slice(0,3).map(a=>esc(a)).join(', ')}${item.areas.length>3?' +'+( item.areas.length-3):''}</td>
      </tr>`).join('')}</tbody>
    </table></div>`:'<p style="color:var(--ink-soft);">Nenhuma não conformidade registrada.</p>'}
  </div></div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">
    <div class="panel"><div class="panel__pad">
      <h3 style="font-weight:700;font-size:1rem;color:var(--brand);margin:0 0 14px;">📍 Resultado médio por Área</h3>
      ${topAreas.length?topAreas.map(a=>{const pct=maxMedia>0?a.media/maxMedia*100:0;const cl=classify(a.media);return`<div style="margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;font-size:.82rem;margin-bottom:3px;"><span>${esc(a.nome)}</span><span style="font-family:var(--mono);color:${cl.color};font-weight:700;">${a.media}%</span></div>
        <div style="background:var(--paper);border-radius:4px;height:8px;"><div style="background:${cl.color};border-radius:4px;height:8px;width:${pct.toFixed(1)}%;transition:width .3s;"></div></div>
        <div style="font-size:.71rem;color:var(--ink-soft);">${a.n} auditoria(s) · ${a.nc} NC total</div>
      </div>`;}).join(''):'<p style="color:var(--ink-soft);">Sem dados.</p>'}
    </div></div>
    <div class="panel"><div class="panel__pad">
      <h3 style="font-weight:700;font-size:1rem;color:var(--brand);margin:0 0 14px;">👥 Desempenho por Auditor</h3>
      ${d.auditores.length?`<div style="overflow-y:auto;max-height:320px;"><table style="width:100%;border-collapse:collapse;font-size:.82rem;">
        <thead><tr style="background:var(--paper);"><th style="text-align:left;padding:6px 8px;border-bottom:2px solid var(--line);font-size:.7rem;color:var(--ink-soft);">Auditor</th><th style="padding:6px 8px;border-bottom:2px solid var(--line);font-size:.7rem;color:var(--ink-soft);text-align:center;">Aud.</th><th style="padding:6px 8px;border-bottom:2px solid var(--line);font-size:.7rem;color:var(--ink-soft);text-align:center;">Média</th><th style="padding:6px 8px;border-bottom:2px solid var(--line);font-size:.7rem;color:var(--ink-soft);text-align:center;">NC/aud</th></tr></thead>
        <tbody>${d.auditores.map(a=>{const alerta=a.n>=3&&a.taxaSemNc>=80;const ncRate=a.n>0?(a.nc/a.n).toFixed(1):0;return`<tr style="border-bottom:1px solid var(--line);">
          <td style="padding:7px 8px;">${alerta?'⚠️ ':''}<strong>${esc(a.nome)}</strong></td>
          <td style="padding:7px 8px;text-align:center;font-family:var(--mono);">${a.n}</td>
          <td style="padding:7px 8px;text-align:center;font-family:var(--mono);color:${classify(a.media).color};">${a.media}%</td>
          <td style="padding:7px 8px;text-align:center;font-family:var(--mono);">${ncRate}</td>
        </tr>`;}).join('')}</tbody>
      </table></div>`:'<p style="color:var(--ink-soft);">Sem dados.</p>'}
    </div></div>
  </div>`;
}


/* ====== Render ====== */
function render(){
  setActiveNav(state.view);updateSyncStatus();
  const root=document.getElementById('app');
  try{
    if(state.view==='dashboard')root.innerHTML=dashboardHtml();
    else if(state.view==='form')root.innerHTML=formHtml();
    else if(state.view==='formularios')root.innerHTML=formulariosHtml();
    else if(state.view==='formulario-editor')root.innerHTML=formularioEditorHtml();
    else if(state.view==='cadastros')root.innerHTML=cadastrosHtml();
    else if(state.view==='acoes')root.innerHTML=acoesHtml();
    else if(state.view==='analise')root.innerHTML=analiseHtml();
    else if(state.view==='agenda')root.innerHTML=agendaHtml();
    else if(state.view==='analise')root.innerHTML=analiseHtml();
    else if(state.view==='agenda')root.innerHTML=agendaHtml();
  }catch(e){console.error(e);root.innerHTML=`<div class="empty"><strong>Erro</strong>${esc(e.message)}</div>`;}
}

/* ====== Dashboard ====== */
function filteredAuditIndex(){return state.auditIndex.filter(a=>{if(state.filterUnidade!=='todos'&&a.unidadeId!==state.filterUnidade)return false;if(state.filterDiretoria!=='todas'&&a.diretoriaId!==state.filterDiretoria)return false;if(state.filterArea!=='todas'&&a.areaId!==state.filterArea)return false;if(state.filterFormulario!=='todos'&&a.formularioId!==state.filterFormulario)return false;if(state.filterSearch){const q=state.filterSearch.toLowerCase();if(!(a.codigo+a.areaNome+a.unidadeNome+a.formularioNome+a.diretoriaNome).toLowerCase().includes(q))return false;}return true;});}
function kpiData(){const l=state.auditIndex.filter(a=>!a._offline),t=l.length;if(!t)return{total:0,media:0,excelente:0,atencao:0};return{total:t,media:Math.round(l.reduce((s,a)=>s+(a.resultado||0),0)/t*10)/10,excelente:l.filter(a=>a.classificacao==='Excelente').length,atencao:l.filter(a=>a.classificacao==='Atenção').length};}
function overdueBanner(){const today=new Date().toISOString().slice(0,10);const n=state.acoesIndex.filter(p=>p.status!=='concluido'&&p.prazo&&p.prazo<today).length;const m=state.acoesIndex.filter(p=>p.statusNegociacao==='gestor_proposto').length;const parts=[];if(n)parts.push(`⚠ ${n} plano(s) com prazo vencido`);if(m)parts.push(`📬 ${m} proposta(s) de prazo aguardando aprovação`);return parts.length?`<button class="overdue-banner" onclick="App.goAcoes()">${parts.join('  ·  ')} — clique para ver</button>`:'';}

/* ====== Exportação para planilha ====== */
function csvEscape(v){return'"'+String(v==null?'':v).replace(/"/g,'""')+'"';}
function downloadCSV(rows,filename){
  const csv=rows.map(r=>r.map(csvEscape).join(';')).join('\r\n');
  const blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=filename;a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function exportAuditorias(){
  const list=filteredAuditIndex().filter(a=>!a._offline);
  if(!list.length){alert('Nenhuma auditoria para exportar com os filtros atuais.');return;}
  const header=['Código','Data','Unidade','Diretoria','Área/Local','Turno','Formulário','Resultado (%)','Classificação','Conforme','NC','OM','N/A'];
  const rows=list.map(a=>[a.codigo,a.data,a.unidadeNome,a.diretoriaNome,a.areaNome,a.turnoNome||'',a.formularioNome,a.resultado,a.classificacao,a.totalConforme||0,a.totalNc,a.totalOm,a.totalNa||0]);
  downloadCSV([header,...rows],`auditorias_${new Date().toISOString().slice(0,10)}.csv`);
}
async function exportAcoesPlanilha(){
  let list=state.acoesIndex;
  if(!list.length){alert('Nenhum plano de ação para exportar.');return;}
  const header=['Auditoria','Data','Unidade','Área','Item auditado','Ação proposta','Responsável','Prazo SSMA','Prazo proposto gestor','Status','Status negociação'];
  const negLabel={'aguardando_gestor':'Aguardando gestor','gestor_proposto':'Gestor propôs prazo','ssma_aprovou':'SSMA aprovou','ssma_negociou':'SSMA negociou'};
  const stLabel={'pendente':'Pendente','em_andamento':'Em andamento','concluido':'Concluído'};
  const rows=list.map(p=>[p.codigo,p.data,p.unidadeNome,p.areaNome,p.itemTexto,p.acao,p.responsavel,p.prazo||'',p.prazoGestor||'',stLabel[p.status]||p.status,negLabel[p.statusNegociacao]||p.statusNegociacao]);
  downloadCSV([header,...rows],`planos_acao_${new Date().toISOString().slice(0,10)}.csv`);
}
async function exportAuditoriasCompleto(){
  // Versão detalhada: uma linha por ITEM respondido (não por auditoria)
  const list=filteredAuditIndex().filter(a=>!a._offline);
  if(!list.length){alert('Nenhuma auditoria para exportar.');return;}
  showToast('Preparando exportação detalhada…','ok');
  const header=['Código','Data','Unidade','Diretoria','Área','Formulário','Categoria','Item','Resposta','Observação','Ação','Responsável','Prazo','Status plano'];
  const rows=[header];
  const PAGE=50;
  for(let i=0;i<list.length;i+=PAGE){
    const batch=list.slice(i,i+PAGE);
    await Promise.all(batch.map(async a=>{
      try{
        const{data:itens}=await supabaseClient.from('audit_itens').select('checklist_item_texto,checklist_item_categoria,status,observacao,plano_acao_acao,plano_acao_responsavel,plano_acao_prazo,plano_acao_status').eq('audit_id',a.id);
        const statusMap={'conforme':'Conforme','nao_conforme':'Não Conforme','na':'N/A','oportunidade_melhoria':'Oport. Melhoria'};
        (itens||[]).forEach(it=>{rows.push([a.codigo,a.data,a.unidadeNome,a.diretoriaNome,a.areaNome,a.formularioNome,it.checklist_item_categoria,it.checklist_item_texto,statusMap[it.status]||it.status||'',it.observacao||'',it.plano_acao_acao||'',it.plano_acao_responsavel||'',it.plano_acao_prazo||'',it.plano_acao_status||'']);});
      }catch(e){}
    }));
  }
  downloadCSV(rows,`auditorias_detalhado_${new Date().toISOString().slice(0,10)}.csv`);
  showToast(`✅ ${rows.length-1} linhas exportadas!`,'ok');
}

function painelBreakdown(){
  const list=state.auditIndex.filter(a=>!a._offline);
  const byUnidade={},byDiretoria={};
  list.forEach(a=>{
    const un=a.unidadeNome||'—';
    if(!byUnidade[un])byUnidade[un]={nome:un,n:0,soma:0,nc:0,om:0};
    byUnidade[un].n++;byUnidade[un].soma+=a.resultado||0;byUnidade[un].nc+=a.totalNc||0;byUnidade[un].om+=a.totalOm||0;
    const dn=a.diretoriaNome||'Sem diretoria';
    if(!byDiretoria[dn])byDiretoria[dn]={nome:dn,n:0,soma:0,nc:0,om:0};
    byDiretoria[dn].n++;byDiretoria[dn].soma+=a.resultado||0;byDiretoria[dn].nc+=a.totalNc||0;byDiretoria[dn].om+=a.totalOm||0;
  });
  const fmt=obj=>Object.values(obj).map(x=>({...x,media:x.n>0?Math.round(x.soma/x.n):0})).sort((a,b)=>b.n-a.n);
  return{unidades:fmt(byUnidade),diretorias:fmt(byDiretoria)};
}
function breakdownCardHtml(title,icon,items){
  if(!items.length)return`<div class="panel"><div class="panel__pad"><h3 style="font-weight:700;font-size:.95rem;color:var(--brand);margin:0 0 6px;">${icon} ${title}</h3><p style="color:var(--ink-soft);font-size:.83rem;margin:0;">Sem dados ainda.</p></div></div>`;
  const max=Math.max(...items.map(x=>x.media),1);
  return`<div class="panel"><div class="panel__pad">
    <h3 style="font-weight:700;font-size:.95rem;color:var(--brand);margin:0 0 12px;">${icon} ${title}</h3>
    ${items.map(x=>{const cl=classify(x.media);const pct=max>0?x.media/max*100:0;return`<div style="margin-bottom:10px;">
      <div style="display:flex;justify-content:space-between;font-size:.83rem;margin-bottom:3px;"><span>${esc(x.nome)}</span><span style="font-family:var(--mono);font-weight:700;color:${cl.color};">${x.media}%</span></div>
      <div style="background:var(--paper);border-radius:4px;height:7px;"><div style="background:${cl.color};border-radius:4px;height:7px;width:${pct.toFixed(1)}%;"></div></div>
      <div style="font-size:.7rem;color:var(--ink-soft);margin-top:2px;">${x.n} auditoria(s)${x.nc?` · ${x.nc} NC`:''}${x.om?` · ${x.om} OM`:''}</div>
    </div>`;}).join('')}
  </div></div>`;
}

function dashboardHtml(){
  const k=kpiData();
  const uOpts=state.unidades.map(u=>`<option value="${u.id}" ${state.filterUnidade===u.id?'selected':''}>${esc(u.nome)}</option>`).join('');
  const dOpts=(state.filterUnidade==='todos'?state.diretorias:state.diretorias.filter(d=>d.unidade_id===state.filterUnidade)).map(d=>`<option value="${d.id}" ${state.filterDiretoria===d.id?'selected':''}>${esc(d.nome)}</option>`).join('');
  const aOpts=(state.filterUnidade==='todos'?state.areas:state.areas.filter(a=>a.unidade_id===state.filterUnidade)).map(a=>`<option value="${a.id}" ${state.filterArea===a.id?'selected':''}>${esc(a.nome)}</option>`).join('');
  const fOpts=state.formularios.map(f=>`<option value="${f.id}" ${state.filterFormulario===f.id?'selected':''}>${esc(f.nome)}</option>`).join('');
  const chartAreas=state.filterUnidade==='todos'?state.areas:state.areas.filter(a=>a.unidade_id===state.filterUnidade);
  return`${overdueBanner()}
    <div class="kpis">
      <div class="kpi"><div class="kpi__value">${k.total}</div><div class="kpi__label">Auditorias realizadas</div></div>
      <div class="kpi"><div class="kpi__value">${k.media}%</div><div class="kpi__label">Resultado médio</div></div>
      <div class="kpi"><div class="kpi__value">${k.excelente}</div><div class="kpi__label">Excelentes</div></div>
      <div class="kpi"><div class="kpi__value">${k.atencao}</div><div class="kpi__label">Em atenção</div></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">
      ${(()=>{const bd=painelBreakdown();return breakdownCardHtml('Resultado por Unidade','🏭',bd.unidades)+breakdownCardHtml('Resultado por Diretoria','🏢',bd.diretorias);})()}
    </div>
    <div class="chart-section">
      <div class="chart-section__header">
        <h3 class="chart-section__title">Evolução por Área</h3>
        <select class="flt-select" onchange="App.loadChart(this.value)"><option value="">— selecione uma área —</option>${chartAreas.map(a=>`<option value="${a.id}" ${state.chartAreaId===a.id?'selected':''}>${esc(a.nome)}</option>`).join('')}</select>
      </div>
      <div id="chart-body">${state.chartData.length?drawChart(state.chartData):'<p style="color:var(--ink-soft);text-align:center;padding:28px 0;font-size:.88rem;">Selecione uma área para ver a evolução da pontuação.</p>'}</div>
    </div>
    <div class="filterbar">
      <select class="flt-select" onchange="App.setFU(this.value)"><option value="todos">Todas unidades</option>${uOpts}</select>
      <select class="flt-select" onchange="App.setFD(this.value)"><option value="todas">Todas diretorias</option>${dOpts}</select>
      <select class="flt-select" onchange="App.setFA(this.value)"><option value="todas">Todas áreas</option>${aOpts}</select>
      <select class="flt-select" onchange="App.setFF(this.value)"><option value="todos">Todos formulários</option>${fOpts}</select>
      <input class="search" placeholder="Buscar…" value="${esc(state.filterSearch)}" oninput="App.setFS(this.value)">
      <div style="display:flex;gap:6px;flex:none;">
        <div style="position:relative;display:inline-block;" id="export-menu-container">
          <button class="btn-secondary" onclick="App.toggleExportMenu()" title="Exportar para planilha">📥 Exportar</button>
          <div id="export-menu" style="display:none;position:absolute;right:0;top:calc(100% + 4px);background:#fff;border:1px solid var(--line);border-radius:8px;box-shadow:var(--shadow);z-index:100;min-width:220px;padding:6px;">
            <button class="btn-ghost" style="display:block;width:100%;text-align:left;padding:8px 12px;" onclick="App.exportAuditorias()">📊 Resumo de auditorias (.csv)</button>
            <button class="btn-ghost" style="display:block;width:100%;text-align:left;padding:8px 12px;" onclick="App.exportAuditoriasCompleto()">📋 Auditorias com itens (.csv)</button>
          </div>
        </div>
        <button class="btn-primary" onclick="App.goNewAudit()">+ Nova Auditoria</button>
      </div>
    </div>
    <div class="audit-list" id="audit-list">${auditListHtml()}</div>`;
}
function drawChart(data){
  if(!data.length)return'<p style="color:var(--ink-soft);text-align:center;padding:20px;font-size:.88rem;">Nenhuma auditoria encontrada.</p>';
  const sorted=[...data].sort((a,b)=>a.data.localeCompare(b.data));
  const W=700,H=200,pt={t:24,r:36,b:48,l:52},pW=W-pt.l-pt.r,pH=H-pt.t-pt.b;
  const vals=sorted.map(d=>d.resultado);const minY=Math.min(-10,...vals)-5,maxY=108,rY=maxY-minY;
  const toX=i=>pt.l+(sorted.length>1?(i/(sorted.length-1))*pW:pW/2);const toY=v=>pt.t+(1-(v-minY)/rY)*pH;
  const pts=sorted.map((d,i)=>({x:toX(i),y:toY(d.resultado),d}));
  const pathD=pts.map((p,i)=>(i===0?'M':'L')+` ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  function ptColor(r){return r>=90?'#065F46':r>=70?'#07583B':r>=50?'#92400E':'#DF4636';}
  const yTicks=[0,25,50,70,90,100].filter(v=>v>=minY&&v<=maxY);
  return`<svg viewBox="0 0 ${W} ${H}" style="width:100%;overflow:visible;" xmlns="http://www.w3.org/2000/svg">
    ${yTicks.map(v=>`<line x1="${pt.l}" y1="${toY(v).toFixed(1)}" x2="${pt.l+pW}" y2="${toY(v).toFixed(1)}" stroke="var(--line)" stroke-width="${v===0?1:.5}"/>
    <text x="${pt.l-6}" y="${(toY(v)+4).toFixed(1)}" text-anchor="end" font-size="10" fill="var(--ink-soft)" font-family="var(--mono)">${v}%</text>`).join('')}
    <line x1="${pt.l}" y1="${toY(70).toFixed(1)}" x2="${pt.l+pW}" y2="${toY(70).toFixed(1)}" stroke="#B3DD64" stroke-width="1.5" stroke-dasharray="6 3"/>
    <path d="${pathD}" fill="none" stroke="var(--brand)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    ${pts.map(p=>`<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="5" fill="${ptColor(p.d.resultado)}" stroke="#fff" stroke-width="1.5"/>
      <text x="${p.x.toFixed(1)}" y="${(p.y-9).toFixed(1)}" text-anchor="middle" font-size="10" font-weight="700" fill="${ptColor(p.d.resultado)}">${p.d.resultado}%</text>
      <text x="${p.x.toFixed(1)}" y="${(H-pt.b+14).toFixed(1)}" text-anchor="middle" font-size="9" fill="var(--ink-soft)" transform="rotate(-38,${p.x.toFixed(1)},${(H-pt.b+14).toFixed(1)})">${fmtDate(p.d.data)}</text>`).join('')}
  </svg>`;}
function auditListHtml(){
  const list=filteredAuditIndex();
  if(!list.length)return`<div class="empty"><strong>Nenhuma auditoria por aqui</strong>Clique em "Nova Auditoria" para começar.</div>`;
  return list.map(a=>{
    const cl=classify(a.resultado||0);const isOffline=a._offline;
    return`<button class="audit-card" onclick="App.goEditAudit('${a.id}')">
      ${isOffline?`<div class="stamp stamp--regular" style="--rot:5deg"><span class="stamp__pct" style="font-size:.7rem;">OFFLINE</span><span class="stamp__label">Pendente</span></div>`:`<div class="stamp ${stampClass(a.resultado||0)}" style="--rot:${a.resultado>=70?-6:5}deg"><span class="stamp__pct">${a.resultado}%</span><span class="stamp__label">${cl.label}</span></div>`}
      <div class="audit-card__body">
        <div class="audit-card__top">
          <span class="audit-card__area">${esc(a.areaNome||'—')}</span>
          <span class="tag">${esc(a.unidadeNome||'—')}</span>
          ${a.diretoriaNome?`<span class="tag tag--brand">${esc(a.diretoriaNome)}</span>`:''}
          ${a.turnoNome?`<span class="tag" style="background:#E4F4EC;color:var(--brand);">${esc(a.turnoNome)}</span>`:''}
          <span class="audit-card__code">${esc(a.codigo||'Aguardando sync')}</span>
          ${isOffline?'<span class="chip" style="background:var(--om-bg);color:#92400E;">🔴 Offline</span>':''}
        </div>
        <div class="audit-card__meta">${esc(a.formularioNome||'')} · ${fmtDate(a.data)}</div>
        ${!isOffline?`<div class="audit-card__chips"><span class="badge badge--${cl.cls}">${cl.label}</span>${a.totalNc?`<span class="chip chip--bad">${a.totalNc} NC</span>`:''}${a.totalOm?`<span class="chip chip--om">${a.totalOm} OM</span>`:''}</div>`:''}
      </div>
    </button>`;
  }).join('');}

/* ====== Formulário de auditoria ====== */
function formHtml(){
  const a=state.editingAudit;const groups=groupByCategoria(state.currentChecklist);
  const areasFilt=state.areas.filter(x=>x.unidade_id===a.unidadeId);
  const colabs=state.colaboradores.filter(x=>x.unidade_id===a.unidadeId);
  const turnosFilt=state.turnos.filter(x=>x.unidade_id===a.unidadeId||!x.unidade_id);
  return`<div class="panel"><div class="panel__pad">
    <h2 class="form-header__title">${a.persisted?'Editar Auditoria':a._offline?'Editar Auditoria (Offline)':'Nova Auditoria'}</h2>
    ${a._offline?`<div class="overdue-banner" style="cursor:default;">🔴 Salva offline — será sincronizada quando conectar à internet.</div>`:''}
    <div class="field-grid" style="margin-bottom:16px;">
      <div class="field field--2"><label>Código</label><input type="text" disabled value="${esc(a.codigo||'Gerado ao salvar')}"></div>
      <div class="field field--2"><label>Unidade *</label>
        <select onchange="App.setAuditUnidade(this.value)" ${a.persisted||a._offline?'disabled':''}>
          <option value="">— selecione —</option>
          ${state.unidades.map(u=>`<option value="${u.id}" ${a.unidadeId===u.id?'selected':''}>${esc(u.nome)}</option>`).join('')}
        </select>
      </div>
      <div class="field field--2"><label>Formulário *</label>
        ${(a.persisted||a._offline)?`<input type="text" disabled value="${esc(a.formularioNome||'—')}">`:`<select onchange="App.setFormulario(this.value)"><option value="">— selecione —</option>${state.formularios.map(f=>`<option value="${f.id}" ${a.formularioId===f.id?'selected':''}>${esc(f.nome)}</option>`).join('')}</select>`}
      </div>
      <div class="field field--2"><label>Área *</label>
        <select onchange="App.setAuditArea(this.value)"><option value="">— selecione —</option>${areasFilt.map(x=>`<option value="${x.id}" ${a.areaId===x.id?'selected':''}>${esc(x.nome)}</option>`).join('')}</select>
      </div>
      <div class="field field--2"><label>Diretoria</label><input type="text" disabled value="${esc(a.diretoriaNome||'—')}"></div>
      <div class="field field--1"><label>Turno</label>
        <select onchange="App.setAuditTurno(this.value)"><option value="">Selecione</option>${turnosFilt.map(t=>`<option value="${t.id}" ${a.turnoId===t.id?'selected':''}>${esc(t.nome)}${t.horario_inicio?` (${t.horario_inicio}–${t.horario_fim})`:''}</option>`).join('')}</select>
      </div>
      <div class="field field--1"><label>Data *</label><input type="date" value="${esc(a.data)}" onchange="App.setHF('data',this.value)"></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">
      <div class="person-section">
        <span class="section-label">Auditor(es)</span>
        <div id="auditores-list">${(a.auditores||[]).map((p,i)=>personRowHtml('auditores',p,i,colabs)).join('')}</div>
        <button class="btn-ghost" onclick="App.addPerson('auditores')">+ Adicionar auditor</button>
        <datalist id="dl-auditores">${colabs.map(c=>`<option value="${esc(c.nome)}">`).join('')}</datalist>
      </div>
      <div class="person-section">
        <span class="section-label">Auditado(s)</span>
        <div id="auditados-list">${(a.auditados||[]).map((p,i)=>personRowHtml('auditados',p,i,colabs)).join('')}</div>
        <button class="btn-ghost" onclick="App.addPerson('auditados')">+ Adicionar auditado</button>
        <datalist id="dl-auditados">${colabs.map(c=>`<option value="${esc(c.nome)}">`).join('')}</datalist>
      </div>
    </div>
    <div id="checklist-area">${state.currentChecklist.length?groupByCategoria(state.currentChecklist).map(g=>categoryHtml(g)).join(''):`<div class="empty" style="margin-top:0;"><strong>${a.formularioId?'Formulário sem itens':'Selecione um formulário acima'}</strong></div>`}</div>
    <div class="obs-geral">
      <label>Observação geral — como foi a auditoria</label>
      <textarea placeholder="Descreva as condições gerais, pontos positivos, contexto…" oninput="App.setObsGeral(this.value)">${esc(a.observacaoGeral||'')}</textarea>
    </div>
  </div></div>
  <div id="score-footer">${scoreFooterHtml()}</div>`;}
function personRowHtml(type,p,idx,colabs){
  const cargo=p.cargo?' · '+p.cargo:'';
  return`<div class="person-row" id="${type}-row-${idx}">
    <input class="person-row__mat" type="text" value="${esc(p.matricula)}" placeholder="Matrícula" title="Digite a matrícula e o nome será preenchido automaticamente" autofocus oninput="App.setPersonField('${type}',${idx},'matricula',this.value)" onchange="App.autoFillByMat('${type}',${idx},this.value)" style="flex:1;max-width:130px;">
    <input class="person-row__nome" type="text" list="dl-${type}" value="${esc(p.nome)}" placeholder="Nome" oninput="App.setPersonField('${type}',${idx},'nome',this.value)" onchange="App.autoFillMat('${type}',${idx},this.value)" style="flex:2;">
    ${p.cargo?`<span style="font-size:.75rem;color:var(--ink-soft);align-self:center;white-space:nowrap;">${esc(p.cargo)}</span>`:''}
    <button onclick="App.removePerson('${type}',${idx})" title="Remover">✕</button>
  </div>`;}
function categoryHtml(g){return`<details class="category" open><summary>${esc(g.categoria)}<span class="category__count">${g.itens.length} itens</span></summary><div class="category__items">${g.itens.map(itemRowHtml).join('')}</div></details>`;}
function itemRowHtml(item){
  const r=state.editingAudit.itens[item.id]||{status:null,observacao:'',evidencia:null,planoAcao:{acao:'',responsavel:'',prazo:'',status:'pendente',statusNegociacao:'aguardando_gestor'}};
  const st=r.status;
  const opcoes=state.currentOpcoes||DEFAULT_OPCOES;
  const op=opcoes.find(o=>o.id===st);
  const needsP=op&&op.gera_plano;
  const isOmStyle=needsP&&parseFloat(op.peso||0)>=0;
  const buttons=opcoes.map(o=>`<button class="status-btn ${STATUS_BTN_CLS[o.cor]||'status-btn--na'} ${st===o.id?'is-active':''}" onclick="App.setStatus('${item.id}','${o.id}')">${esc(o.label)}</button>`).join('');
  return`<div class="item-row" id="item-${item.id}">
    <div class="item-row__text">${esc(item.texto)}</div>
    <div class="status-group">${buttons}</div>
    <div class="item-row__obs"><textarea placeholder="Observação (opcional)" oninput="App.setObs('${item.id}',this.value)">${esc(r.observacao)}</textarea></div>
    <div style="margin-top:8px;">${evidenceHtml(item.id,r.evidencia)}</div>
    ${needsP?planoHtml(item.id,r.planoAcao,isOmStyle):''}
  </div>`;}
function evidenceHtml(itemId,ev){if(ev){const isLocal=ev.startsWith('data:');return`<div class="evidence__thumb"><img src="${ev}" alt="Evidência">${isLocal?'<span style="font-size:.72rem;color:var(--om);font-family:var(--mono);">📱 local</span>':''}<button class="btn-ghost" onclick="App.removePhoto('${itemId}')">Remover</button></div>`;}return`<div class="evidence"><label class="btn-secondary">📷 Foto de evidência<input type="file" accept="image/*" capture="environment" onchange="App.handlePhotoInput('${itemId}',this)"></label></div>`;}
function planoHtml(itemId,plano,isOm){
  plano=plano||{acao:'',responsavel:'',prazo:'',status:'pendente',statusNegociacao:'aguardando_gestor'};
  const st=plano.status||'pendente',sneg=plano.statusNegociacao||'aguardando_gestor';
  const negLabel={aguardando_gestor:'⏳ Aguardando proposta do gestor',gestor_proposto:`📬 Gestor propôs: ${fmtDate(plano.prazoGestor)}`,ssma_aprovou:'✅ Prazo aprovado pelo SSMA',ssma_negociou:'🔄 Prazo definido pelo SSMA'}[sneg]||'';
  const negCls={aguardando_gestor:'neg-aguardando',gestor_proposto:'neg-proposto',ssma_aprovou:'neg-aprovado',ssma_negociou:'neg-negociado'}[sneg]||'';
  return`<div class="plano ${isOm?'plano--om':''}">
    <div class="plano__title">Plano de Ação</div>
    <div class="plano__grid">
      <input type="text" placeholder="Ação a ser tomada" value="${esc(plano.acao)}" oninput="App.setPlanoField('${itemId}','acao',this.value)">
      <input type="text" placeholder="Responsável" value="${esc(plano.responsavel)}" oninput="App.setPlanoField('${itemId}','responsavel',this.value)">
      <input type="date" placeholder="Prazo (opcional — gestor pode propor)" value="${esc(plano.prazo)}" onchange="App.setPlanoField('${itemId}','prazo',this.value)">
    </div>
    <div style="margin-top:8px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
      <select class="status-pill" onchange="App.setPlanoField('${itemId}','status',this.value)">
        <option value="pendente" ${st==='pendente'?'selected':''}>Pendente</option>
        <option value="em_andamento" ${st==='em_andamento'?'selected':''}>Em andamento</option>
        <option value="concluido" ${st==='concluido'?'selected':''}>Concluído</option>
      </select>
      ${negLabel?`<span class="neg-badge ${negCls}">${negLabel}</span>`:''}
    </div>
    ${sneg==='gestor_proposto'&&plano.comentarioGestor?`<div style="margin-top:6px;font-size:.82rem;color:var(--ink-soft);font-style:italic;">"${esc(plano.comentarioGestor)}"</div>`:''}
  </div>`;}
function scoreFooterHtml(){
  const a=state.editingAudit,sc=computeScore(a,state.currentChecklist),cl=classify(sc.resultado);
  const opcoes=state.currentOpcoes||DEFAULT_OPCOES;
  const hasNcOm=sc.totalNc>0||sc.totalOm>0;
  const detalhe=opcoes.map(op=>`${esc(op.label)}:${sc.contagens[op.id]||0}`).join(' · ');
  return`<div class="score-footer"><div class="stamp ${stampClass(sc.resultado)}" style="--rot:${sc.resultado>=70?-6:5}deg;border-color:#fff;color:#fff;"><span class="stamp__pct">${sc.resultado}%</span><span class="stamp__label">${cl.label}</span></div>
    <div class="score-footer__info"><div class="score-footer__pct">${sc.resultado}% — ${cl.label}</div><div class="score-footer__sub">${detalhe} · Pontos possíveis: ${sc.pontosPossiveis}</div></div>
    <div class="score-footer__actions">
      ${a.persisted&&!a._offline?`<button class="btn-danger" onclick="App.deleteAudit('${a.id}')">Excluir</button><button class="btn-secondary" onclick="App.exportPDF('${a.id}')">📄 PDF</button>`:''}
      ${a.persisted&&!a._offline&&hasNcOm?`<button class="btn-secondary" onclick="App.enviarGestor()" style="background:rgba(179,221,100,.2);border-color:#B3DD64;color:#B3DD64;">📱 Enviar ao gestor</button>`:''}
      ${a._offline?`<button class="btn-danger" onclick="App.deleteOfflineAudit('${a.id}')">Excluir</button>`:''}
      ${a._offline&&state.isOnline?`<button class="btn-secondary" onclick="App.syncNow()">🔄 Sincronizar</button>`:''}
      <button class="btn-secondary" onclick="App.goDashboard()">Cancelar</button>
      <button class="btn-primary" onclick="App.saveAudit()">Salvar auditoria</button>
    </div>
  </div>`;}
function updateScoreFooter(){const el=document.getElementById('score-footer');if(el)el.innerHTML=scoreFooterHtml();}
function rerenderItemRow(itemId){const item=state.currentChecklist.find(i=>i.id===itemId);const el=document.getElementById('item-'+itemId);if(!item||!el)return;el.outerHTML=itemRowHtml(item);}
function rerenderChecklistArea(){const el=document.getElementById('checklist-area');if(!el){render();return;}const groups=groupByCategoria(state.currentChecklist);el.innerHTML=groups.length?groups.map(g=>categoryHtml(g)).join(''):`<div class="empty" style="margin-top:0;"><strong>Formulário sem itens</strong></div>`;updateScoreFooter();}
function rerenderPersonList(type){const el=document.getElementById(type+'-list');if(!el)return;const colabs=state.colaboradores.filter(x=>x.unidade_id===state.editingAudit.unidadeId);el.innerHTML=(state.editingAudit[type]||[]).map((p,i)=>personRowHtml(type,p,i,colabs)).join('');}

/* ====== Formulários ====== */
function formulariosHtml(){return`<div class="filterbar" style="margin-bottom:18px;"><h2 style="font-weight:800;font-size:1.35rem;margin:0;color:var(--brand);">Formulários</h2>${state.isOnline?`<button class="btn-primary" onclick="App.goNewFormulario()">+ Novo Formulário</button>`:'<span style="font-size:.82rem;color:var(--om);font-family:var(--mono);">🔴 Offline — edição indisponível</span>'}</div>${state.formularios.length?`<div class="audit-list">${state.formularios.map(f=>`<div class="audit-card" style="cursor:default;"><div class="audit-card__body"><div class="audit-card__top"><span class="audit-card__area">${esc(f.nome)}</span></div>${f.descricao?`<div class="audit-card__meta">${esc(f.descricao)}</div>`:''}<div class="audit-card__chips"><span class="chip" style="background:var(--na-bg);color:var(--ink-soft)">${f.itemCount} item(ns)</span></div></div>${state.isOnline?`<div style="display:flex;gap:8px;flex:none;"><button class="btn-secondary" onclick="App.goEditFormulario('${f.id}')">Editar</button><button class="btn-danger" onclick="App.deleteFormulario('${f.id}')">Excluir</button></div>`:''}</div>`).join('')}</div>`:`<div class="empty"><strong>Nenhum formulário criado</strong>${state.isOnline?`<br><br><button class="btn-primary" style="margin-top:12px;" onclick="App.goNewFormulario()">+ Criar primeiro formulário</button>`:'Conecte à internet para carregar.'}</div>`}`;}
function formularioEditorHtml(){
  const f=state.editingFormulario;if(!f)return'<div class="empty"><strong>Erro</strong>Formulário não carregado.</div>';
  const groups=groupByCategoria(f.itens);
  const opcoes=f.opcoes||DEFAULT_OPCOES;
  const corLabel={ok:'🟢 Verde',bad:'🔴 Vermelho',om:'🟡 Âmbar',na:'⚫ Cinza'};
  return`<div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap;"><button class="btn-secondary" onclick="App.goFormularios()">← Voltar</button><h2 style="font-weight:800;font-size:1.35rem;margin:0;color:var(--brand);">${f.id?'Editar Formulário':'Novo Formulário'}</h2></div>
  <div class="panel"><div class="panel__pad">
    <div class="field-grid" style="margin-bottom:20px;"><div class="field field--4"><label>Nome do formulário *</label><input type="text" value="${esc(f.nome)}" placeholder="Ex.: Auditoria Manutenção…" oninput="App.setFField('nome',this.value)"></div><div class="field field--2"><label>Descrição</label><input type="text" value="${esc(f.descricao)}" placeholder="Breve descrição" oninput="App.setFField('descricao',this.value)"></div></div>

    <div class="opcoes-section">
      <p class="opcoes-section__title">⚙️ Opções de resposta deste formulário</p>
      <div class="opcoes-presets">
        <span style="font-size:.78rem;color:var(--ink-soft);align-self:center;">Presets rápidos:</span>
        <button onclick="App.setPreset('padrao')">📋 Padrão (C/NC/N/A/OM)</button>
        <button onclick="App.setPreset('sim_nao')">✅ Sim / Não</button>
        <button onclick="App.setPreset('conforme_nc')">🔧 Conforme / Não Conforme</button>
        <button onclick="App.setPreset('atende')">📑 Atende / Não Atende / Parcial</button>
      </div>
      <div class="opcoes-list">
        ${opcoes.map((op,i)=>{
          const cm=COR_MAP[op.cor]||COR_MAP.na;
          return`<div class="opcao-row">
            <div class="opcao-preview" style="background:${cm.bg};color:${cm.color};">${esc(op.label)}</div>
            <input type="text" value="${esc(op.label)}" placeholder="Nome da resposta" title="Nome exibido nos botões" onchange="App.setOpcaoField(${i},'label',this.value)">
            <input type="number" step="0.1" value="${op.peso}" title="Peso no cálculo (ex: 1, -1, 0.5, 0)" style="width:70px;" onchange="App.setOpcaoField(${i},'peso',parseFloat(this.value)||0)">
            <select title="Cor do botão" onchange="App.setOpcaoField(${i},'cor',this.value)">
              ${Object.entries(corLabel).map(([v,l])=>`<option value="${v}" ${op.cor===v?'selected':''}>${l}</option>`).join('')}
            </select>
            <label title="Não conta no cálculo (igual ao N/A)"><input type="checkbox" ${op.neutro?'checked':''} onchange="App.setOpcaoField(${i},'neutro',this.checked)"> Neutro</label>
            <label title="Exibe o campo de Plano de Ação quando selecionado"><input type="checkbox" ${op.gera_plano?'checked':''} onchange="App.setOpcaoField(${i},'gera_plano',this.checked)"> Plano de ação</label>
            <button class="rm" onclick="App.removeOpcao(${i})" title="Remover esta resposta">✕</button>
          </div>`;}).join('')}
      </div>
      <button class="btn-ghost" style="margin-top:8px;" onclick="App.addOpcao()">+ Adicionar resposta personalizada</button>
      <p style="font-size:.75rem;color:var(--ink-soft);margin-top:10px;">💡 <strong>Peso:</strong> define o impacto no cálculo. Use 1 para positivo, -1 para negativo, 0.5 para parcial, 0 para neutro. <strong>Neutro</strong>: item não entra no denominador (ex: N/A). <strong>Plano de ação</strong>: exibe o campo de prazo e responsável.</p>
    </div>

    ${groups.length?groups.map(g=>`<div class="manager-cat"><div class="manager-cat__head"><input type="text" value="${esc(g.categoria)}" oninput="App.renameCategoria('${esc(g.categoria)}',this.value)"><button style="background:transparent;border:none;color:var(--bad);font-size:.8rem;cursor:pointer;font-weight:600;" onclick="App.removeCategoria('${esc(g.categoria)}')">Remover categoria</button></div>${g.itens.map(it=>`<div class="manager-item"><input type="text" style="flex:1;" value="${esc(it.texto)}" placeholder="Item de verificação" oninput="App.setItemTexto('${it.id}',this.value)"><button onclick="App.removeItem('${it.id}')">✕</button></div>`).join('')}<button class="btn-ghost" onclick="App.addItem('${esc(g.categoria)}')">+ adicionar item</button></div>`).join(''):`<p style="color:var(--ink-soft);margin-bottom:4px;">Adicione uma categoria para começar.</p>`}
    <div class="add-cat-row"><input type="text" id="nova-cat-input" placeholder="Nome da nova categoria…" onkeydown="if(event.key==='Enter'){event.preventDefault();App.addCategoriaFromInput();}"><button class="btn-secondary" onclick="App.addCategoriaFromInput()">+ Adicionar categoria</button></div>
  </div></div>
  <div class="score-footer" style="position:sticky;bottom:14px;margin-top:18px;">
    <div class="score-footer__info"><div class="score-footer__pct">${f.itens.length} item(ns) · ${opcoes.length} opção(ões) de resposta</div></div>
    <div class="score-footer__actions"><button class="btn-secondary" onclick="App.goFormularios()">Cancelar</button><button class="btn-primary" onclick="App.saveFormulario()">Salvar formulário</button></div>
  </div>`;}

/* ====== Cadastros ====== */
function cadastrosHtml(){
  const tabs=[['unidades','Unidades'],['diretorias','Diretorias'],['turnos','Turnos'],['areas','Áreas'],['colaboradores','Colaboradores'],['configuracoes','Configurações']];
  return`<div class="panel"><div class="panel__pad">
    <h2 class="form-header__title">Cadastros</h2>
    ${!state.isOnline?`<div style="background:var(--om-bg);border:1px solid var(--om);border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:.86rem;color:#92400E;">🔴 Offline — salvo apenas quando conectar</div>`:''}
    <div class="tabs" style="margin-bottom:16px;display:inline-flex;flex-wrap:wrap;">${tabs.map(([k,l])=>`<button class="tabs__btn ${state.cadastroTab===k?'is-active':''}" onclick="App.setCadastroTab('${k}')">${l}</button>`).join('')}</div>
    <div id="cadastro-body">${state.cadastroTab==='unidades'?unidadesTabHtml():state.cadastroTab==='diretorias'?diretoriasTabHtml():state.cadastroTab==='turnos'?turnosTabHtml():state.cadastroTab==='areas'?areasTabHtml():state.cadastroTab==='colaboradores'?colaboradoresTabHtml():configuracaoTabHtml()}</div>
  </div></div>
  ${state.cadastroTab==='colaboradores'?'':`<div class="score-footer" style="position:static;margin-top:18px;">
    <div class="score-footer__info"><div class="score-footer__pct">${state.cadastroDraft.unidades.length} un · ${state.cadastroDraft.diretorias.length} dir · ${state.cadastroDraft.turnos.length} turn · ${state.cadastroDraft.areas.length} área(s)</div></div>
    <div class="score-footer__actions"><button class="btn-secondary" onclick="App.cancelCadastro()">Cancelar</button><button class="btn-primary" onclick="App.saveCadastros()">Salvar cadastros</button></div>
  </div>`}`;}
function unidadesTabHtml(){const l=state.cadastroDraft.unidades;return`<div class="manager-cat">${l.length?l.map(u=>`<div class="manager-item"><input type="text" style="flex:2;" value="${esc(u.nome)}" placeholder="Nome" oninput="App.setCField('unidades','${u.id}','nome',this.value)"><input type="text" style="flex:1;max-width:90px;" value="${esc(u.sigla)}" placeholder="Sigla" oninput="App.setCField('unidades','${u.id}','sigla',this.value)"><button onclick="App.removeCItem('unidades','${u.id}')">✕</button></div>`).join(''):'<p style="color:var(--ink-soft);font-size:.88rem;">Nenhuma unidade cadastrada.</p>'}</div><button class="btn-ghost" onclick="App.addCItem('unidades')">+ adicionar unidade</button>`;}
function diretoriasTabHtml(){const l=state.cadastroDraft.diretorias;return`<div class="manager-cat">${l.length?l.map(d=>`<div class="manager-item"><input type="text" style="flex:1;" value="${esc(d.nome)}" placeholder="Nome da diretoria" oninput="App.setCField('diretorias','${d.id}','nome',this.value)"><select onchange="App.setCField('diretorias','${d.id}','unidade_id',this.value)"><option value="">Unidade</option>${state.cadastroDraft.unidades.map(u=>`<option value="${u.id}" ${d.unidade_id===u.id?'selected':''}>${esc(u.sigla||u.nome)}</option>`).join('')}</select><button onclick="App.removeCItem('diretorias','${d.id}')">✕</button></div>`).join(''):'<p style="color:var(--ink-soft);font-size:.88rem;">Nenhuma diretoria cadastrada.</p>'}</div><button class="btn-ghost" onclick="App.addCItem('diretorias')">+ adicionar diretoria</button>`;}
function turnosTabHtml(){
  const l=state.cadastroDraft.turnos;
  return`<p style="color:var(--ink-soft);font-size:.86rem;margin-bottom:12px;">Cadastre os turnos de trabalho. O turno será selecionado ao criar cada auditoria.</p>
  <div class="manager-cat">${l.length?l.map(t=>`<div class="manager-item">
    <input type="text" style="flex:2;" value="${esc(t.nome)}" placeholder="Nome do turno (ex: 1° Turno, Noturno)" oninput="App.setCField('turnos','${t.id}','nome',this.value)">
    <input type="text" style="flex:1;max-width:90px;" value="${esc(t.horario_inicio)}" placeholder="Início (06:00)" oninput="App.setCField('turnos','${t.id}','horario_inicio',this.value)">
    <input type="text" style="flex:1;max-width:90px;" value="${esc(t.horario_fim)}" placeholder="Fim (14:00)" oninput="App.setCField('turnos','${t.id}','horario_fim',this.value)">
    <select onchange="App.setCField('turnos','${t.id}','unidade_id',this.value)"><option value="">Todas unidades</option>${state.cadastroDraft.unidades.map(u=>`<option value="${u.id}" ${t.unidade_id===u.id?'selected':''}>${esc(u.sigla||u.nome)}</option>`).join('')}</select>
    <button onclick="App.removeCItem('turnos','${t.id}')">✕</button>
  </div>`).join(''):'<p style="color:var(--ink-soft);font-size:.88rem;">Nenhum turno cadastrado.</p>'}</div>
  <button class="btn-ghost" onclick="App.addCItem('turnos')">+ adicionar turno</button>`;}
function areasTabHtml(){const l=state.cadastroDraft.areas;return`<div class="manager-cat">${l.length?l.map(a=>`<div class="manager-item"><input type="text" style="flex:1;min-width:120px;" value="${esc(a.nome)}" placeholder="Nome da área" oninput="App.setCField('areas','${a.id}','nome',this.value)"><select onchange="App.setCField('areas','${a.id}','unidade_id',this.value)"><option value="">Unidade</option>${state.cadastroDraft.unidades.map(u=>`<option value="${u.id}" ${a.unidade_id===u.id?'selected':''}>${esc(u.sigla||u.nome)}</option>`).join('')}</select><select onchange="App.setCField('areas','${a.id}','diretoria_id',this.value)"><option value="">Diretoria</option>${state.cadastroDraft.diretorias.filter(d=>!a.unidade_id||d.unidade_id===a.unidade_id).map(d=>`<option value="${d.id}" ${a.diretoria_id===d.id?'selected':''}>${esc(d.nome)}</option>`).join('')}</select><button onclick="App.removeCItem('areas','${a.id}')">✕</button></div>`).join(''):'<p style="color:var(--ink-soft);font-size:.88rem;">Nenhuma área cadastrada.</p>'}</div><button class="btn-ghost" onclick="App.addCItem('areas')">+ adicionar área</button>`;}
function colaboradorFilterOptions(){
  return{
    unidades:state.unidades,
    diretorias:state.colabFilterUnidade==='todos'?state.diretorias:state.diretorias.filter(d=>d.unidade_id===state.colabFilterUnidade),
    areas:state.colabFilterUnidade==='todos'?state.areas:state.areas.filter(a=>a.unidade_id===state.colabFilterUnidade),
  };
}
function filteredColaboradores(){
  const q=(state.colabSearch||'').toLowerCase().trim();
  return state.colaboradores.filter(c=>{
    if(state.colabFilterUnidade!=='todos'&&c.unidade_id!==state.colabFilterUnidade)return false;
    if(state.colabFilterDiretoria!=='todas'&&c.diretoria_id!==state.colabFilterDiretoria)return false;
    if(state.colabFilterArea!=='todas'&&c.area_id!==state.colabFilterArea)return false;
    if(state.colabFilterSituacao!=='todos'){
      const sit=(c.situacao||'').toUpperCase();
      if(state.colabFilterSituacao==='ATIVO'&&!sit.startsWith('ATIV'))return false;
      if(state.colabFilterSituacao==='INATIVO'&&sit.startsWith('ATIV'))return false;
    }
    if(q&&!((c.nome||'').toLowerCase().includes(q)||(c.matricula||'').toLowerCase().includes(q)))return false;
    return true;
  });
}
function colaboradoresTabHtml(){
  const opts=colaboradorFilterOptions();
  const all=filteredColaboradores();
  const total=state.colaboradores.length;
  const shown=all.slice(0,state.colabShowLimit);
  const unMap={};state.unidades.forEach(u=>unMap[u.id]=u.sigla||u.nome);
  const dirMap={};state.diretorias.forEach(d=>dirMap[d.id]=d.nome);
  const areaMap={};state.areas.forEach(a=>areaMap[a.id]=a.nome);

  return`
  <div class="import-row">
    <label class="btn-secondary" style="cursor:pointer;margin:0;">📥 Importar CSV do Senior<input type="file" accept=".csv,text/csv" style="display:none" onchange="App.importCSV(this)"></label>
    <span class="import-row__hint">Grava direto no banco — não precisa clicar em "Salvar cadastros" depois.</span>
    <button class="btn-secondary" style="margin-left:auto;" onclick="App.colabOpenNew()">+ Adicionar manualmente</button>
  </div>
  <div id="csv-progress"></div>
  <div class="filterbar" style="margin-bottom:12px;">
    <input class="search" style="max-width:240px;" placeholder="Buscar nome ou matrícula…" value="${esc(state.colabSearch)}" oninput="App.setColabSearch(this.value)">
    <select class="flt-select" onchange="App.setColabFilterU(this.value)">
      <option value="todos">Todas unidades</option>
      ${opts.unidades.map(u=>`<option value="${u.id}" ${state.colabFilterUnidade===u.id?'selected':''}>${esc(u.nome)}</option>`).join('')}
    </select>
    <select class="flt-select" onchange="App.setColabFilterD(this.value)">
      <option value="todas">Todas diretorias</option>
      ${opts.diretorias.map(d=>`<option value="${d.id}" ${state.colabFilterDiretoria===d.id?'selected':''}>${esc(d.nome)}</option>`).join('')}
    </select>
    <select class="flt-select" onchange="App.setColabFilterA(this.value)">
      <option value="todas">Todos locais</option>
      ${opts.areas.map(a=>`<option value="${a.id}" ${state.colabFilterArea===a.id?'selected':''}>${esc(a.nome)}</option>`).join('')}
    </select>
    <select class="flt-select" onchange="App.setColabFilterSit(this.value)">
      <option value="todos" ${state.colabFilterSituacao==='todos'?'selected':''}>Todas situações</option>
      <option value="ATIVO" ${state.colabFilterSituacao==='ATIVO'?'selected':''}>Somente ativos</option>
      <option value="INATIVO" ${state.colabFilterSituacao==='INATIVO'?'selected':''}>Somente inativos</option>
    </select>
  </div>
  <p style="font-size:.78rem;color:var(--ink-soft);margin:0 0 8px;">
    ${total} colaborador(es) no total · ${all.length} encontrado(s) com os filtros atuais${all.length>shown.length?` · mostrando os primeiros ${shown.length} — refine a busca para ver mais`:''}
  </p>
  ${state.colabEditing?colabEditPanelHtml():''}
  ${shown.length?`<div style="overflow-x:auto;border:1px solid var(--line);border-radius:8px;"><table style="width:100%;border-collapse:collapse;font-size:.83rem;">
    <thead><tr style="background:var(--paper);position:sticky;top:0;">
      <th style="text-align:left;padding:8px 10px;border-bottom:2px solid var(--line);font-size:.7rem;color:var(--ink-soft);text-transform:uppercase;">Matrícula</th>
      <th style="text-align:left;padding:8px 10px;border-bottom:2px solid var(--line);font-size:.7rem;color:var(--ink-soft);text-transform:uppercase;">Nome</th>
      <th style="text-align:left;padding:8px 10px;border-bottom:2px solid var(--line);font-size:.7rem;color:var(--ink-soft);text-transform:uppercase;">Unidade</th>
      <th style="text-align:left;padding:8px 10px;border-bottom:2px solid var(--line);font-size:.7rem;color:var(--ink-soft);text-transform:uppercase;">Diretoria</th>
      <th style="text-align:left;padding:8px 10px;border-bottom:2px solid var(--line);font-size:.7rem;color:var(--ink-soft);text-transform:uppercase;">Local</th>
      <th style="text-align:left;padding:8px 10px;border-bottom:2px solid var(--line);font-size:.7rem;color:var(--ink-soft);text-transform:uppercase;">Cargo</th>
      <th style="text-align:center;padding:8px 10px;border-bottom:2px solid var(--line);font-size:.7rem;color:var(--ink-soft);text-transform:uppercase;">Situação</th>
      <th style="padding:8px 10px;border-bottom:2px solid var(--line);"></th>
    </tr></thead>
    <tbody>${shown.map(c=>{
      const ativo=(c.situacao||'').toUpperCase().startsWith('ATIV');
      return`<tr style="border-bottom:1px solid var(--line);">
        <td style="padding:7px 10px;font-family:var(--mono);">${esc(c.matricula||'—')}</td>
        <td style="padding:7px 10px;font-weight:600;">${esc(c.nome)}</td>
        <td style="padding:7px 10px;">${esc(unMap[c.unidade_id]||'—')}</td>
        <td style="padding:7px 10px;">${esc(dirMap[c.diretoria_id]||'—')}</td>
        <td style="padding:7px 10px;">${esc(areaMap[c.area_id]||'—')}</td>
        <td style="padding:7px 10px;color:var(--ink-soft);">${esc(c.cargo||'—')}</td>
        <td style="padding:7px 10px;text-align:center;"><span class="chip" style="background:${ativo?'var(--ok-bg)':'var(--na-bg)'};color:${ativo?'var(--ok)':'var(--ink-soft)'};">${esc(c.situacao||'—')}</span></td>
        <td style="padding:7px 10px;white-space:nowrap;">
          <button class="btn-ghost" style="padding:2px 6px;" onclick="App.colabOpenEdit('${c.id}')" title="Editar">✏️</button>
          <button class="btn-ghost" style="padding:2px 6px;color:var(--bad);" onclick="App.colabDelete('${c.id}')" title="Excluir">🗑</button>
        </td>
      </tr>`;}).join('')}
    </tbody>
  </table></div>
  ${all.length>shown.length?`<button class="btn-secondary" style="margin-top:10px;" onclick="App.colabShowMore()">Mostrar mais ${Math.min(150,all.length-shown.length)}</button>`:''}`
  :`<div class="empty"><strong>${total===0?'Nenhum colaborador cadastrado ainda':'Nenhum resultado para os filtros atuais'}</strong>${total===0?'Use "Importar CSV do Senior" para começar.':''}</div>`}
  `;
}
function colabEditPanelHtml(){
  const c=state.colabEditing;
  const isNew=!c._existing;
  return`<div class="panel" style="margin-bottom:14px;border-color:var(--brand);"><div class="panel__pad">
    <h4 style="margin:0 0 12px;color:var(--brand);">${isNew?'Novo colaborador':'Editar colaborador'}</h4>
    <div class="field-grid">
      <div class="field field--3"><label>Nome *</label><input type="text" value="${esc(c.nome)}" oninput="App.colabEditField('nome',this.value)"></div>
      <div class="field field--2"><label>Matrícula</label><input type="text" value="${esc(c.matricula||'')}" oninput="App.colabEditField('matricula',this.value)"></div>
      <div class="field field--1"><label>Situação</label><select onchange="App.colabEditField('situacao',this.value)"><option value="ATIVO" ${c.situacao==='ATIVO'?'selected':''}>ATIVO</option><option value="INATIVO" ${c.situacao==='INATIVO'?'selected':''}>INATIVO</option></select></div>
      <div class="field field--2"><label>Unidade</label><select onchange="App.colabEditField('unidade_id',this.value)"><option value="">—</option>${state.unidades.map(u=>`<option value="${u.id}" ${c.unidade_id===u.id?'selected':''}>${esc(u.nome)}</option>`).join('')}</select></div>
      <div class="field field--2"><label>Diretoria</label><select onchange="App.colabEditField('diretoria_id',this.value)"><option value="">—</option>${state.diretorias.filter(d=>!c.unidade_id||d.unidade_id===c.unidade_id).map(d=>`<option value="${d.id}" ${c.diretoria_id===d.id?'selected':''}>${esc(d.nome)}</option>`).join('')}</select></div>
      <div class="field field--2"><label>Local</label><select onchange="App.colabEditField('area_id',this.value)"><option value="">—</option>${state.areas.filter(a=>!c.unidade_id||a.unidade_id===c.unidade_id).map(a=>`<option value="${a.id}" ${c.area_id===a.id?'selected':''}>${esc(a.nome)}</option>`).join('')}</select></div>
      <div class="field field--3"><label>Cargo</label><input type="text" value="${esc(c.cargo||'')}" oninput="App.colabEditField('cargo',this.value)"></div>
      <div class="field field--3"><label>WhatsApp</label><input type="text" placeholder="16999990000" value="${esc(c.telefone||'')}" oninput="App.colabEditField('telefone',this.value)"></div>
    </div>
    <div style="display:flex;gap:8px;margin-top:14px;">
      <button class="btn-primary" onclick="App.colabSaveEdit()">Salvar</button>
      <button class="btn-secondary" onclick="App.colabCancelEdit()">Cancelar</button>
    </div>
  </div></div>`;
}
function configuracaoTabHtml(){
  const c=state.configDraft;
  return`<div style="max-width:540px;">
    <p style="color:var(--ink-soft);font-size:.88rem;line-height:1.6;margin-bottom:18px;"><strong>Fórmula:</strong> (C × ${c.peso_conforme} + OM × ${c.peso_om} + NC × ${c.peso_nc}) ÷ pontos possíveis × 100</p>
    <div class="field-grid" style="margin-bottom:20px;">
      <div class="field field--2"><label>Peso — Conforme</label><input type="number" step="0.1" value="${esc(c.peso_conforme)}" oninput="App.setConfigField('peso_conforme',this.value)"></div>
      <div class="field field--2"><label>Peso — Oport. Melhoria</label><input type="number" step="0.1" value="${esc(c.peso_om)}" oninput="App.setConfigField('peso_om',this.value)"></div>
      <div class="field field--2"><label>Peso — Não Conforme</label><input type="number" step="0.1" value="${esc(c.peso_nc)}" oninput="App.setConfigField('peso_nc',this.value)"></div>
    </div>
    <div class="field field--6" style="margin-bottom:20px;">
      <label>Número WhatsApp da equipe SSMA (para o link pré-preencher o destinatário)</label>
      <input type="text" value="${esc(c.whatsapp_ssma||'')}" placeholder="5516999990000 (com DDI e DDD, sem espaços)" oninput="App.setConfigField('whatsapp_ssma',this.value)" style="max-width:300px;">
      <span style="font-size:.78rem;color:var(--ink-soft);">Deixe em branco para escolher o contato manualmente ao enviar</span>
    </div>
    <div style="padding:14px;background:var(--paper);border-radius:8px;border:1px solid var(--line);">
      <p style="margin:0 0 10px;font-weight:700;font-size:.85rem;color:var(--brand);">Classificação</p>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;">
        ${[['excelente','Excelente','≥ 90%'],['bom','Bom','70%–89%'],['regular','Regular','50%–69%'],['atencao','Atenção','≤ 49%']].map(([c,l,r])=>`<div style="text-align:center;"><span class="badge badge--${c}">${l}</span><p style="font-size:.78rem;color:var(--ink-soft);margin:4px 0 0;">${r}</p></div>`).join('')}
      </div>
    </div>
  </div>`;}

/* ====== Planos de Ação ====== */

/* ====== Agenda — render ====== */
const MESES_PT=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
const DOW_PT=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
function agendaComputeStatus(ag){
  if(ag.status==='cancelado')return'cancelado';
  if(ag.auditId)return'realizado';
  const today=new Date().toISOString().slice(0,10);
  if(ag.data<today)return'atrasado';
  return'agendado';
}
function agendaHtml(){
  const[y,m]=state.agendaMonth.split('-').map(Number);
  const monthTitle=MESES_PT[m-1]+' de '+y;
  if(state.agendaLoading)return`<div class="agenda-month-nav"><button onclick="App.agendaPrevMonth()">‹</button><span class="agenda-month-nav__title">${monthTitle}</span><button onclick="App.agendaNextMonth()">›</button></div><div class="loading">Carregando agenda…</div>`;

  const list=state.agendamentos.filter(ag=>state.agendaFilterUnidade==='todos'||ag.unidadeId===state.agendaFilterUnidade);
  const withStatus=list.map(ag=>({...ag,_status:agendaComputeStatus(ag)}));

  // KPIs
  const total=withStatus.length;
  const realizados=withStatus.filter(a=>a._status==='realizado').length;
  const atrasados=withStatus.filter(a=>a._status==='atrasado').length;
  const pendentes=withStatus.filter(a=>a._status==='agendado').length;

  // Agrupa por dia para o calendário
  const byDay={};
  withStatus.forEach(ag=>{const day=parseInt(ag.data.slice(8,10),10);if(!byDay[day])byDay[day]=[];byDay[day].push(ag);});

  // Agrupa por área para a distribuição
  const byArea={};
  withStatus.forEach(ag=>{const k=ag.areaNome||'—';if(!byArea[k])byArea[k]={nome:k,agendado:0,realizado:0,atrasado:0,cancelado:0,total:0};byArea[k][ag._status]++;byArea[k].total++;});
  const areasComAgenda=new Set(Object.keys(byArea));
  // Áreas sem nenhum agendamento esse mês (considerando filtro de unidade)
  const areasRelevantes=state.agendaFilterUnidade==='todos'?state.areas:state.areas.filter(a=>a.unidade_id===state.agendaFilterUnidade);
  const areasSemAgenda=areasRelevantes.filter(a=>!areasComAgenda.has(a.nome));
  const distribuicao=[...Object.values(byArea).sort((a,b)=>b.total-a.total),...areasSemAgenda.map(a=>({nome:a.nome,agendado:0,realizado:0,atrasado:0,cancelado:0,total:0}))];
  const maxTotal=Math.max(...distribuicao.map(d=>d.total),1);

  const uOpts=state.unidades.map(u=>`<option value="${u.id}" ${state.agendaFilterUnidade===u.id?'selected':''}>${esc(u.nome)}</option>`).join('');

  return`
  <div class="filterbar" style="margin-bottom:6px;">
    <h2 style="font-weight:800;font-size:1.35rem;margin:0;color:var(--brand);">Agenda de Auditorias</h2>
    <select class="flt-select" style="margin-left:auto;" onchange="App.setAgendaFilterUnidade(this.value)"><option value="todos">Todas unidades</option>${uOpts}</select>
    <button class="btn-primary" onclick="App.agendaOpenNew()">+ Agendar auditoria</button>
  </div>
  <div class="kpis">
    <div class="kpi"><div class="kpi__value">${total}</div><div class="kpi__label">Agendadas no mês</div></div>
    <div class="kpi"><div class="kpi__value">${pendentes}</div><div class="kpi__label">Pendentes</div></div>
    <div class="kpi"><div class="kpi__value">${atrasados}</div><div class="kpi__label">Atrasadas</div></div>
    <div class="kpi"><div class="kpi__value">${realizados}</div><div class="kpi__label">Realizadas</div></div>
  </div>
  ${state.agendaEditing?agendaEditPanelHtml():(state.agendaDayView?agendaDayPanelHtml(withStatus):'')}
  <div class="agenda-month-nav">
    <button onclick="App.agendaPrevMonth()">‹</button>
    <span class="agenda-month-nav__title">${monthTitle}</span>
    <button onclick="App.agendaNextMonth()">›</button>
    <button class="btn-ghost" style="margin-left:6px;" onclick="App.agendaGoToday()">Hoje</button>
  </div>
  <div class="panel" style="margin-bottom:20px;"><div class="panel__pad">
    ${calendarGridHtml(y,m,byDay)}
  </div></div>
  <div class="panel"><div class="panel__pad">
    <h3 style="font-weight:700;font-size:1rem;color:var(--brand);margin:0 0 6px;">📍 Distribuição por Local</h3>
    <p style="font-size:.8rem;color:var(--ink-soft);margin:0 0 14px;">Veja se as auditorias do mês estão bem distribuídas entre os locais — áreas com 0 agendamentos aparecem destacadas.</p>
    ${distribuicao.length?distribuicao.map(d=>{
      const pct=v=>maxTotal>0?(v/maxTotal*100).toFixed(1):0;
      return`<div class="agenda-area-row">
        <span class="agenda-area-row__name">${esc(d.nome)}${d.total===0?' <span class="agenda-empty-warn">0 agendadas</span>':''}</span>
        <div class="agenda-area-row__bar">
          ${d.realizado?`<div style="background:var(--ok);width:${pct(d.realizado)}%;"></div>`:''}
          ${d.agendado?`<div style="background:#3B82F6;width:${pct(d.agendado)}%;"></div>`:''}
          ${d.atrasado?`<div style="background:var(--bad);width:${pct(d.atrasado)}%;"></div>`:''}
          ${d.cancelado?`<div style="background:var(--na);width:${pct(d.cancelado)}%;"></div>`:''}
        </div>
        <span class="agenda-area-row__count">${d.total} no mês</span>
      </div>`;}).join(''):'<p style="color:var(--ink-soft);font-size:.85rem;">Nenhuma área cadastrada.</p>'}
    <div style="display:flex;gap:14px;margin-top:14px;flex-wrap:wrap;font-size:.76rem;color:var(--ink-soft);">
      <span><span style="display:inline-block;width:9px;height:9px;background:#3B82F6;border-radius:2px;margin-right:4px;"></span>Agendado</span>
      <span><span style="display:inline-block;width:9px;height:9px;background:var(--ok);border-radius:2px;margin-right:4px;"></span>Realizado</span>
      <span><span style="display:inline-block;width:9px;height:9px;background:var(--bad);border-radius:2px;margin-right:4px;"></span>Atrasado</span>
      <span><span style="display:inline-block;width:9px;height:9px;background:var(--na);border-radius:2px;margin-right:4px;"></span>Cancelado</span>
    </div>
  </div></div>`;
}
function calendarGridHtml(year,month,byDay){
  const firstDow=new Date(year,month-1,1).getDay();
  const daysInMonth=new Date(year,month,0).getDate();
  const today=new Date().toISOString().slice(0,10);
  const cells=[];
  for(let i=0;i<firstDow;i++)cells.push(null);
  for(let d=1;d<=daysInMonth;d++)cells.push(d);
  while(cells.length%7!==0)cells.push(null);

  return`<div class="cal-grid">
    ${DOW_PT.map(d=>`<div class="cal-dow">${d}</div>`).join('')}
    ${cells.map(d=>{
      if(d===null)return'<div class="cal-day cal-day--empty"></div>';
      const dateStr=`${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const isToday=dateStr===today;
      const ags=(byDay[d]||[]).slice().sort((a,b)=>a.areaNome.localeCompare(b.areaNome));
      const shown=ags.slice(0,3);
      return`<div class="cal-day ${isToday?'cal-day--today':''}" onclick="App.agendaOpenDay('${dateStr}')">
        <span class="cal-day__num">${d}</span>
        ${shown.map(ag=>`<span class="cal-chip cal-chip--${ag._status}" title="${esc(ag.areaNome)} — ${esc(ag.auditorNome||'sem auditor')}">${esc(ag.areaNome)}</span>`).join('')}
        ${ags.length>3?`<span class="cal-day__more">+${ags.length-3} mais</span>`:''}
      </div>`;
    }).join('')}
  </div>`;
}
function agendaDayPanelHtml(withStatus){
  const dateStr=state.agendaDayView;
  const items=withStatus.filter(ag=>ag.data===dateStr);
  const[y,m,d]=dateStr.split('-');
  const statusLabel={agendado:'Agendado',realizado:'Realizado',atrasado:'Atrasado',cancelado:'Cancelado'};
  return`<div class="panel" style="margin-bottom:18px;border-color:var(--brand);"><div class="panel__pad">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
      <h4 style="margin:0;color:var(--brand);">📅 ${d}/${m}/${y}</h4>
      <button class="btn-ghost" style="margin-left:auto;" onclick="App.agendaCloseDayView()">Fechar</button>
    </div>
    ${items.length?items.map(ag=>`<div style="background:var(--paper-raised);border:1px solid var(--line);border-radius:9px;padding:14px;margin-bottom:10px;">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;flex-wrap:wrap;">
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:5px;">
            <span style="font-weight:700;font-size:.95rem;color:var(--brand);">${esc(ag.areaNome)}</span>
            <span class="tag">${esc(ag.unidadeNome)}</span>
            <span class="cal-chip cal-chip--${ag._status}">${statusLabel[ag._status]}</span>
          </div>
          <div style="font-size:.83rem;color:var(--ink-soft);">
            👤 ${esc(ag.auditorNome||'sem auditor')}
            ${ag.turnoNome?` · ⏱ ${esc(ag.turnoNome)}`:''}
            ${ag.formularioNome?` · 📋 ${esc(ag.formularioNome)}`:''}
          </div>
          ${ag.observacao?`<div style="font-size:.78rem;color:var(--ink-soft);margin-top:4px;font-style:italic;">${esc(ag.observacao)}</div>`:''}
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;flex:none;">
          ${ag._status==='realizado'
            ?`<button class="btn-secondary" style="font-size:.82rem;" onclick="App.goEditAudit('${ag.auditId}')">📋 Ver auditoria</button>`
            :ag._status==='cancelado'
            ?`<button class="btn-ghost" style="font-size:.82rem;" onclick="App.agendaOpenEdit('${ag.id}')">✏️ Editar</button>`
            :`<button class="btn-primary" style="font-size:.82rem;" onclick="App.agendaStartAudit('${ag.id}')">▶ Realizar auditoria</button>
             <button class="btn-ghost" style="font-size:.82rem;" onclick="App.agendaOpenEdit('${ag.id}')">✏️ Editar</button>`}
        </div>
      </div>
    </div>`).join(''):'<p style="color:var(--ink-soft);font-size:.86rem;">Nenhum agendamento neste dia ainda.</p>'}
    <button class="btn-secondary" style="margin-top:6px;" onclick="App.agendaOpenNew('${dateStr}')">+ Agendar novo neste dia</button>
  </div></div>`;
}

function agendaAuditorDropdownHtml(){
  const q=(state.agendaAuditorQ||'').toLowerCase().trim();
  if(!q||q.length<1)return'';
  const matches=state.colaboradores.filter(c=>
    c.nome.toLowerCase().includes(q)||(c.matricula||'').includes(q)
  ).slice(0,12);
  if(!matches.length)return'';
  return`<div id="agenda-auditor-dropdown" style="position:absolute;z-index:200;background:#fff;border:1px solid var(--line);border-radius:8px;box-shadow:var(--shadow);width:100%;margin-top:2px;max-height:220px;overflow-y:auto;">
    ${matches.map(c=>`<div
      onclick="App.agendaSelectAuditor(this)"
      data-nome="${esc(c.nome)}" data-mat="${esc(c.matricula||'')}"
      style="padding:9px 12px;cursor:pointer;border-bottom:1px solid var(--line);font-size:.86rem;"
      onmousedown="event.preventDefault()">
      <strong>${esc(c.nome)}</strong>
      ${c.matricula?`<span style="color:var(--ink-soft);font-family:var(--mono);font-size:.75rem;margin-left:8px;">${esc(c.matricula)}</span>`:''}
      ${c.cargo?`<span style="color:var(--ink-soft);font-size:.75rem;"> · ${esc(c.cargo)}</span>`:''}
    </div>`).join('')}
  </div>`;
}
function agendaEditPanelHtml(){
  const ag=state.agendaEditing;
  const isNew=!ag._existing;
  const areasFilt=ag.unidadeId?state.areas.filter(a=>a.unidade_id===ag.unidadeId):state.areas;
  const turnosFilt=ag.unidadeId?state.turnos.filter(t=>t.unidade_id===ag.unidadeId||!t.unidade_id):state.turnos;
  return`<div class="panel" style="margin-bottom:18px;border-color:var(--brand);"><div class="panel__pad">
    <h4 style="margin:0 0 12px;color:var(--brand);">${isNew?'Agendar nova auditoria':'Editar agendamento'}</h4>
    <div class="field-grid">
      <div class="field field--2"><label>Data *</label><input type="date" value="${esc(ag.data)}" onchange="App.agendaEditField('data',this.value)"></div>
      <div class="field field--2"><label>Unidade *</label><select onchange="App.agendaEditUnidade(this.value)"><option value="">—</option>${state.unidades.map(u=>`<option value="${u.id}" ${ag.unidadeId===u.id?'selected':''}>${esc(u.nome)}</option>`).join('')}</select></div>
      <div class="field field--2"><label>Local/Área *</label><select onchange="App.agendaEditArea(this.value)"><option value="">—</option>${areasFilt.map(a=>`<option value="${a.id}" ${ag.areaId===a.id?'selected':''}>${esc(a.nome)}</option>`).join('')}</select></div>
      <div class="field field--2"><label>Turno</label><select onchange="App.agendaEditField('turnoId',this.value)"><option value="">—</option>${turnosFilt.map(t=>`<option value="${t.id}" ${ag.turnoId===t.id?'selected':''}>${esc(t.nome)}</option>`).join('')}</select></div>
      <div class="field field--2"><label>Formulário</label><select onchange="App.agendaEditFormulario(this.value)"><option value="">—</option>${state.formularios.map(f=>`<option value="${f.id}" ${ag.formularioId===f.id?'selected':''}>${esc(f.nome)}</option>`).join('')}</select></div>
      <div class="field field--1"><label>Matrícula do auditor</label>
        <input type="text" id="agenda-mat-input" value="${esc(ag.auditorMatricula||'')}" placeholder="Matrícula"
          oninput="App.agendaEditField('auditorMatricula',this.value)"
          onchange="App.agendaFillByMat(this.value)">
      </div>
      <div class="field field--1"><label>Nome do auditor *</label>
        <div style="position:relative;">
          <input type="text" id="agenda-auditor-input" value="${esc(ag.auditorNome)}" placeholder="ou busque pelo nome…" autocomplete="off"
            oninput="App.agendaAuditorSearch(this.value)"
            onblur="setTimeout(()=>App.agendaAuditorBlur(),200)"
            style="width:100%;">
          ${agendaAuditorDropdownHtml()}
        </div>
      </div>
      <div class="field field--6"><label>Observação (opcional)</label><input type="text" value="${esc(ag.observacao||'')}" oninput="App.agendaEditField('observacao',this.value)"></div>
    </div>
    <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap;">
      <button class="btn-primary" onclick="App.agendaSave()">Salvar</button>
      ${isNew?'':`<button class="btn-secondary" onclick="App.agendaToggleCancelado()">${ag.status==='cancelado'?'Reativar':'Cancelar agendamento'}</button><button class="btn-danger" onclick="App.agendaDelete('${ag.id}')">Excluir</button>`}
      <button class="btn-secondary" onclick="App.agendaCancelEdit()">Fechar</button>
    </div>
  </div></div>`;
}

function acoesHtml(){
  const today=new Date().toISOString().slice(0,10);
  let ab=0,at=0,and=0,co=0,aguardAprov=0;
  state.acoesIndex.forEach(p=>{if(p.status==='concluido'){co++;return;}ab++;if(p.status==='em_andamento')and++;if(p.prazo&&p.prazo<today)at++;if(p.statusNegociacao==='gestor_proposto')aguardAprov++;});
  const list=state.acoesIndex.filter(p=>{
    if(state.filterAcaoUnidade!=='todos'&&p.unidadeId!==state.filterAcaoUnidade)return false;
    if(state.filterAcaoStatus==='atrasado')return p.status!=='concluido'&&p.prazo&&p.prazo<today;
    if(state.filterAcaoStatus==='aguard_aprov')return p.statusNegociacao==='gestor_proposto';
    if(state.filterAcaoStatus!=='todos'&&p.status!==state.filterAcaoStatus)return false;
    return true;
  }).sort((a,b)=>(a.prazo||'9999').localeCompare(b.prazo||'9999'));
  return`
    ${aguardAprov>0?`<div class="overdue-banner" style="background:var(--bom-bg,#DBEAFE);border-color:#93C5FD;color:#1D4ED8;cursor:pointer;" onclick="App.setFAS('aguard_aprov')">📬 ${aguardAprov} proposta(s) de prazo do gestor aguardando sua aprovação — clique para ver</div>`:''}
    <div class="kpis">
      <div class="kpi"><div class="kpi__value">${ab}</div><div class="kpi__label">Em aberto</div></div>
      <div class="kpi"><div class="kpi__value">${at}</div><div class="kpi__label">Atrasados</div></div>
      <div class="kpi"><div class="kpi__value">${aguardAprov}</div><div class="kpi__label">Aguard. aprovação</div></div>
      <div class="kpi"><div class="kpi__value">${co}</div><div class="kpi__label">Concluídos</div></div>
    </div>
    <div class="filterbar" style="justify-content:space-between;">
      <div class="tabs">${[['todos','Todos'],['pendente','Pendentes'],['em_andamento','Em andamento'],['concluido','Concluídos'],['atrasado','Atrasados'],['aguard_aprov','Aguard. aprovação']].map(([v,l])=>`<button class="tabs__btn ${state.filterAcaoStatus===v?'is-active':''}" onclick="App.setFAS('${v}')">${l}</button>`).join('')}</div>
      <select class="flt-select" onchange="App.setFAU(this.value)"><option value="todos">Todas unidades</option>${state.unidades.map(u=>`<option value="${u.id}" ${state.filterAcaoUnidade===u.id?'selected':''}>${esc(u.nome)}</option>`).join('')}</select>
      <button class="btn-secondary" onclick="App.exportAcoes()" title="Exportar planos de ação">📥 Exportar</button>
      <select class="flt-select" onchange="App.setFAD(this.value)"><option value="todas">Todas diretorias</option>${(state.filterAcaoUnidade==='todos'?state.diretorias:state.diretorias.filter(d=>d.unidade_id===state.filterAcaoUnidade)).map(d=>`<option value="${d.id}" ${state.filterAcaoDiretoria===d.id?'selected':''}>${esc(d.nome)}</option>`).join('')}</select>
      <select class="flt-select" onchange="App.setFAA(this.value)"><option value="todas">Todos locais</option>${(state.filterAcaoUnidade==='todos'?state.areas:state.areas.filter(a=>a.unidade_id===state.filterAcaoUnidade)).map(a=>`<option value="${a.id}" ${state.filterAcaoArea===a.id?'selected':''}>${esc(a.nome)}</option>`).join('')}</select>
    </div>
    <div class="audit-list">${list.length?list.map(p=>{
      const atrasado=p.status!=='concluido'&&p.prazo&&p.prazo<today;
      const stLabel={pendente:'Pendente',em_andamento:'Em andamento',concluido:'Concluído'}[p.status]||'Pendente';
      const sneg=p.statusNegociacao||'aguardando_gestor';
      const negBadge={aguardando_gestor:`<span class="neg-badge neg-aguardando">⏳ Aguardando gestor</span>`,gestor_proposto:`<span class="neg-badge neg-proposto">📬 Gestor propôs prazo</span>`,ssma_aprovou:`<span class="neg-badge neg-aprovado">✅ Prazo aprovado</span>`,ssma_negociou:`<span class="neg-badge neg-negociado">🔄 Prazo negociado</span>`}[sneg]||'';
      return`<div class="audit-card" style="align-items:flex-start;">
        <div class="stamp ${p.status==='concluido'?'stamp--bom':'stamp--atencao'}" style="--rot:${p.status==='concluido'?-6:5}deg;width:64px;height:64px;">
          <span class="stamp__pct" style="font-size:.8rem;">${esc(p.unidadeNome||'—').slice(0,4)}</span>
          <span class="stamp__label">${atrasado?'Atrasado':stLabel}</span>
        </div>
        <div class="audit-card__body">
          <div class="audit-card__top"><span class="audit-card__area">${esc(p.areaNome)}</span><span class="tag">${esc(p.codigo)}</span>${atrasado?'<span class="chip chip--bad">Prazo vencido</span>':''}</div>
          <div class="audit-card__meta">${esc(p.itemTexto)}</div>
          <div class="audit-card__meta" style="margin-top:4px;"><strong>Ação:</strong> ${esc(p.acao)||'<em style="color:var(--ink-soft)">não preenchida</em>'}</div>
          <div class="audit-card__chips" style="align-items:center;gap:8px;flex-wrap:wrap;margin-top:8px;">
            ${negBadge}
            <span class="chip" style="background:var(--na-bg);color:var(--ink-soft);">Resp: ${esc(p.responsavel)||'—'}</span>
            <span class="chip" style="background:var(--na-bg);color:var(--ink-soft);">Prazo: ${p.prazo?fmtDate(p.prazo):'Aguardando gestor'}</span>
            ${state.isOnline?`<select class="status-pill" onchange="App.setAcaoStatus('${p.rowId}',this.value)"><option value="pendente" ${p.status==='pendente'?'selected':''}>Pendente</option><option value="em_andamento" ${p.status==='em_andamento'?'selected':''}>Em andamento</option><option value="concluido" ${p.status==='concluido'?'selected':''}>Concluído</option></select>`:''}
            <button class="btn-ghost" onclick="App.goEditAudit('${p.auditId}')">Ver auditoria</button>
          </div>
          ${sneg==='gestor_proposto'?`
            <div class="proposta-box" style="margin-top:10px;">
              <p class="proposta-box__title">Proposta do gestor</p>
              <p style="font-size:.88rem;margin:0 0 6px;">📅 Prazo proposto: <strong>${fmtDate(p.prazoGestor)}</strong></p>
              ${p.comentarioGestor?`<p style="font-size:.83rem;color:var(--ink-soft);margin:0 0 10px;font-style:italic;">"${esc(p.comentarioGestor)}"</p>`:''}
              <div style="display:flex;gap:8px;flex-wrap:wrap;">
                <button class="btn-primary" style="font-size:.82rem;padding:8px 14px;" onclick="App.approveProposal('${p.rowId}')">✅ Aprovar este prazo</button>
                <button class="btn-secondary" style="font-size:.82rem;padding:8px 14px;" onclick="App.toggleNegotiate('${p.rowId}')">⚙️ Negociar</button>
              </div>
              <div id="neg-${p.rowId}" style="display:none;margin-top:10px;display:none;">
                <label style="font-size:.72rem;font-weight:700;color:var(--ink-soft);text-transform:uppercase;letter-spacing:.04em;display:block;margin-bottom:5px;">Definir outro prazo</label>
                <div style="display:flex;gap:8px;align-items:center;">
                  <input type="date" id="negdate-${p.rowId}" style="border:1px solid var(--line);border-radius:7px;padding:8px;">
                  <button class="btn-primary" style="font-size:.82rem;padding:8px 14px;" onclick="App.negotiateProposal('${p.rowId}')">Confirmar</button>
                </div>
              </div>
            </div>`:sneg==='aguardando_gestor'&&!p.prazo?`<p style="font-size:.8rem;color:var(--ink-soft);margin-top:6px;">ℹ️ Aguardando proposta de prazo do gestor via link do relatório</p>`:''}
        </div>
      </div>`;}).join(''):`<div class="empty"><strong>Nenhum plano de ação aqui</strong></div>`}</div>`;}

/* ====== Relatório para o gestor ====== */
function managerReportHtml(audit, itens){
  const sc={resultado:audit.resultado||0,C:audit.total_conforme||0,NC:audit.total_nc||0,OM:audit.total_om||0};
  const cl=classify(sc.resultado);
  const auditadoNome=(audit.auditores||[]).map(a=>typeof a==='object'?a.nome:a).filter(Boolean).join(', ')||'—';
  const auditNome=(audit.auditados||[]).map(a=>typeof a==='object'?a.nome:a).filter(Boolean).join(', ')||'—';
  const itensPendentes=itens.filter(i=>i.plano_acao_status_negociacao==='aguardando_gestor'||i.plano_acao_status_negociacao==='gestor_proposto');
  const itensFinalizados=itens.filter(i=>i.plano_acao_status_negociacao==='ssma_aprovou'||i.plano_acao_status_negociacao==='ssma_negociou');
  // Helper to get a human-readable label for any status
  function statusLabel(st){const map={conforme:'Conforme',nao_conforme:'Não Conforme',na:'N/A',oportunidade_melhoria:'Oport. Melhoria',sim:'Sim',nao:'Não'};return map[st]||st||'—';}
  function statusStyle(st){if(st==='nao_conforme'||st==='nao')return'background:var(--bad-bg);color:var(--bad);';if(st==='na')return'background:var(--na-bg);color:var(--na);';return'background:var(--om-bg);color:#92400E;';}
  return`<div class="manager-report">
    <div class="manager-report__header">
      <p style="margin:0 0 4px;font-size:.72rem;letter-spacing:.1em;text-transform:uppercase;opacity:.7;">Usina Santa Adélia — SSMA</p>
      <h2 style="margin:0;font-size:1.3rem;">${esc(audit.codigo)}</h2>
      <p style="margin:4px 0 0;opacity:.85;font-size:.9rem;">${esc(audit.area_nome)} · ${fmtDate(audit.data)}${audit.turno_nome?` · ${esc(audit.turno_nome)}`:''}</p>
    </div>
    <div class="manager-report__result">
      <div class="pct" style="color:${cl.color};">${sc.resultado}%</div>
      <div style="margin-top:6px;"><span class="badge badge--${cl.cls}">${cl.label}</span></div>
      <div style="margin-top:10px;font-size:.85rem;color:var(--ink-soft);display:flex;gap:16px;justify-content:center;flex-wrap:wrap;">
        <span>Itens auditados: ${itens.length + (audit.total_conforme||0)}</span><span>Itens com plano de ação: ${itens.length}</span>
      </div>
      <div style="margin-top:8px;font-size:.82rem;color:var(--ink-soft);">Auditor(es): ${esc(auditadoNome)} · Auditado(s): ${esc(auditNome)}</div>
    </div>
    ${itens.length===0?`<div class="empty"><strong>Nenhum plano de ação</strong>Todos os itens estão conformes.</div>`:
    itensPendentes.length>0?`
      <div class="manager-report__msg">
        <strong>Olá!</strong> A auditoria identificou <strong>${itens.length} item(ns)</strong> que precisam de ação corretiva.<br>
        Por favor, <strong>proponha uma data</strong> para cada plano de ação abaixo.
      </div>
      ${itensPendentes.map((item,idx)=>`
        <div class="manager-item" id="mgr-item-${idx}" data-row-id="${item.id}">
          <span class="manager-item__status" style="${statusStyle(item.status)}">${esc(statusLabel(item.status))}</span>
          <p class="manager-item__texto">${esc(item.checklist_item_texto)}</p>
          <p class="manager-item__acao"><strong>Ação proposta pela SSMA:</strong> ${esc(item.plano_acao_acao)||'Não informada'}</p>
          <p class="manager-item__acao"><strong>Responsável:</strong> ${esc(item.plano_acao_responsavel)||'Não informado'}</p>
          ${item.plano_acao_status_negociacao==='gestor_proposto'?`<div style="background:var(--ok-bg);border-radius:6px;padding:10px;font-size:.85rem;color:var(--ok);margin-bottom:10px;"><strong>✅ Você propôs: ${fmtDate(item.plano_acao_prazo_gestor)}</strong> — pode atualizar abaixo</div>`:''}
          <label>Prazo proposto por você *</label>
          <input type="date" class="proposta-data" value="${esc(item.plano_acao_prazo_gestor||'')}" style="margin-bottom:10px;">
          <label>Comentário / justificativa (opcional)</label>
          <textarea class="proposta-comentario" placeholder="Ex.: precisamos de 30 dias para aquisição do EPI…">${esc(item.plano_acao_comentario_gestor||'')}</textarea>
        </div>`).join('')}
      <button class="btn-submit-proposta" id="btn-proposta" onclick="submitManagerProposal()">✅ Enviar proposta de prazos</button>`:`
      <div style="background:var(--ok-bg);border:1px solid var(--ok);border-radius:10px;padding:20px;text-align:center;">
        <div style="font-size:2rem;">✅</div>
        <h3 style="color:var(--ok);margin:8px 0 4px;">Prazos já acordados com a equipe SSMA</h3>
        <p style="color:var(--ink-soft);font-size:.88rem;margin:0;">Os planos de ação foram revisados.</p>
      </div>`}
    ${itensFinalizados.length>0?`
      <div style="margin-top:16px;">
        <p style="font-size:.8rem;font-weight:700;color:var(--ink-soft);text-transform:uppercase;letter-spacing:.04em;margin-bottom:8px;">Prazos já aprovados:</p>
        ${itensFinalizados.map(item=>`<div style="border:1px solid var(--line);border-radius:8px;padding:12px;margin-bottom:8px;background:#fff;">
          <span style="${statusStyle(item.status)}padding:2px 8px;border-radius:4px;font-size:.75rem;font-weight:700;">${esc(statusLabel(item.status))}</span>
          <p style="font-size:.88rem;font-weight:600;margin:6px 0 4px;">${esc(item.checklist_item_texto)}</p>
          <p style="font-size:.82rem;color:var(--ok);margin:0;">✅ Prazo: ${fmtDate(item.plano_acao_prazo)} — ${item.plano_acao_status_negociacao==='ssma_aprovou'?'aprovado':'definido pela SSMA'}</p>
        </div>`).join('')}
      </div>`:''}
    <p style="text-align:center;color:var(--na);font-size:.72rem;margin-top:24px;">Relatório confidencial · Usina Santa Adélia · SSMA</p>
  </div>`;}
/* ====== PDF export ====== */
async function exportPDF(auditId){
  document.getElementById('app').innerHTML='<div class="loading">Preparando PDF…</div>';
  const audit=await loadAuditFull(auditId);if(!audit){alert('Não foi possível carregar.');state.view='dashboard';render();return;}
  const sc=computeScore(audit,audit.checklistFromHistory),cl=classify(sc.resultado);
  const groups=groupByCategoria(audit.checklistFromHistory);
  const win=window.open('','_blank');
  const html=`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Auditoria ${audit.codigo}</title><link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700;800&display=swap" rel="stylesheet"><style>body{font-family:'Open Sans',sans-serif;font-size:12px;color:#1A2E24;margin:18px;}h1{font-size:17px;color:#07583B;margin-bottom:4px;}h2{font-size:13px;margin:16px 0 6px;border-bottom:2px solid #B3DD64;padding-bottom:4px;color:#07583B;}.hg{display:grid;grid-template-columns:repeat(3,1fr);gap:6px 14px;margin:10px 0;background:#F2F6F3;padding:10px;border-radius:6px;}.hf label{font-size:9px;color:#4A6357;text-transform:uppercase;display:block;margin-bottom:2px;font-weight:700;letter-spacing:.04em;}.badge{display:inline-block;padding:3px 10px;border-radius:4px;font-weight:700;font-size:11px;background:${cl.bg};color:${cl.color};}.rb{text-align:center;padding:12px;background:#F2F6F3;border-radius:8px;margin-bottom:16px;border:2px solid #B3DD64;}.rb .pct{font-size:34px;font-weight:800;color:${cl.color};}.ct{font-weight:700;font-size:11px;background:#E4F4EC;padding:6px 8px;margin:10px 0 4px;border-radius:4px;color:#07583B;}.item{border:1px solid #D0DFD7;border-radius:4px;margin-bottom:5px;padding:8px;}.it{font-weight:600;margin-bottom:4px;}.s-c{background:#D1FAE5;color:#065F46;padding:2px 7px;border-radius:3px;font-size:10px;font-weight:700;}.s-nc{background:#FBEAE8;color:#DF4636;padding:2px 7px;border-radius:3px;font-size:10px;font-weight:700;}.s-om{background:#FFF4DC;color:#92400E;padding:2px 7px;border-radius:3px;font-size:10px;font-weight:700;}.s-na{background:#F0F1F2;color:#A3A7A7;padding:2px 7px;border-radius:3px;font-size:10px;font-weight:700;}.plano{margin-top:5px;padding:6px 8px;background:#FFF4DC;border-left:3px solid #FDB952;font-size:11px;}.plano.nc{background:#FBEAE8;border-color:#DF4636;}.og{margin-top:12px;padding:10px;background:#F2F6F3;border:1px solid #D0DFD7;border-radius:4px;font-size:11px;line-height:1.6;}.foto{max-width:120px;max-height:120px;border-radius:4px;margin-top:4px;}.people{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:10px 0;}.pg{background:#F2F6F3;padding:8px;border-radius:4px;}.pg h3{font-size:9px;margin:0 0 4px;color:#4A6357;text-transform:uppercase;font-weight:700;letter-spacing:.04em;}.pr{font-size:11px;margin-bottom:2px;}@media print{body{margin:6px;}}</style></head><body>
  <h1>Relatório de Auditoria — ${audit.codigo}</h1>
  <div class="hg"><div class="hf"><label>Unidade</label>${esc(audit.unidadeNome)}</div><div class="hf"><label>Diretoria</label>${esc(audit.diretoriaNome||'—')}</div><div class="hf"><label>Área</label>${esc(audit.areaNome)}</div><div class="hf"><label>Turno</label>${esc(audit.turnoNome||'—')}</div><div class="hf"><label>Formulário</label>${esc(audit.formularioNome)}</div><div class="hf"><label>Código · Data</label>${esc(audit.codigo)} · ${fmtDate(audit.data)}</div></div>
  <div class="people"><div class="pg"><h3>Auditor(es)</h3>${(audit.auditores||[]).map(p=>`<div class="pr"><strong>${esc(p.nome||p)}</strong>${p.matricula?` · Mat. ${esc(p.matricula)}`:''}</div>`).join('')||'—'}</div><div class="pg"><h3>Auditado(s)</h3>${(audit.auditados||[]).map(p=>`<div class="pr"><strong>${esc(p.nome||p)}</strong>${p.matricula?` · Mat. ${esc(p.matricula)}`:''}</div>`).join('')||'—'}</div></div>
  <div class="rb"><div class="pct">${sc.resultado}%</div><div style="margin-top:4px;"><span class="badge">${cl.label}</span></div><div style="display:flex;gap:16px;justify-content:center;margin-top:6px;font-size:11px;color:#4A6357;"><span>C: ${sc.C}</span><span>NC: ${sc.NC}</span><span>OM: ${sc.OM}</span><span>N/A: ${sc.NA}</span><span>Pontos possíveis: ${sc.pontosPossiveis}</span></div></div>
  ${groups.map(g=>`<div class="ct">${esc(g.categoria)}</div>${g.itens.map(item=>{const r=audit.itens[item.id]||{};const stMap={conforme:'Conforme',nao_conforme:'Não Conforme',na:'N/A',oportunidade_melhoria:'Oport. Melhoria'};const stCls={conforme:'s-c',nao_conforme:'s-nc',na:'s-na',oportunidade_melhoria:'s-om'};const plano=r.planoAcao||{};const needsP=r.status==='nao_conforme'||r.status==='oportunidade_melhoria';return`<div class="item"><div class="it">${esc(item.texto)}</div><span class="${stCls[r.status]||'s-na'}">${stMap[r.status]||'—'}</span>${r.observacao?`<div style="margin-top:4px;font-size:10px;color:#555;">Obs: ${esc(r.observacao)}</div>`:''}${r.evidencia&&!r.evidencia.startsWith('data:')?`<img class="foto" src="${r.evidencia}" alt="Evidência">`:''}${needsP&&(plano.acao||plano.responsavel)?`<div class="plano ${r.status==='nao_conforme'?'nc':''}"><strong>Ação:</strong> ${esc(plano.acao)||'—'} · Resp: ${esc(plano.responsavel)||'—'} · Prazo: ${plano.prazo?fmtDate(plano.prazo):'Aguardando gestor'}</div>`:''}</div>`;}).join('')}`).join('')}
  ${audit.observacaoGeral?`<h2>Observação Geral</h2><div class="og">${esc(audit.observacaoGeral)}</div>`:''}
  <div style="margin-top:20px;padding-top:10px;border-top:1px solid #ccc;font-size:9px;color:#999;text-align:center;">Gerado em ${new Date().toLocaleString('pt-BR')} · Auditoria SSMA · Usina Santa Adélia</div>
  <script>window.onload=()=>setTimeout(()=>window.print(),400)<\/script></body></html>`;
  win.document.write(html);win.document.close();state.view='dashboard';render();}

/* ====== App ====== */
const App={
  async init(){
    if(!window.supabase){document.getElementById('app').innerHTML=`<div class="empty"><strong>Erro de carregamento</strong>Recarregue a página.</div>`;return;}
    if(!SUPABASE_URL||SUPABASE_URL.includes('SEU-PROJETO')){document.getElementById('app').innerHTML=`<div class="empty"><strong>Configuração pendente</strong>Edite config.js com a URL e anon key do Supabase.</div>`;return;}
    // Verifica token de gestor na URL
    const urlParams=new URLSearchParams(window.location.search);
    const token=urlParams.get('token');
    if(token){await this._showManagerReport(token);return;}
    // Inicialização normal
    try{state.pendingCount=await localDB.pendingAudits.count();}catch(e){}
    updateSyncStatus();
    try{
      const[u,d,t,a,c,f,ai,ac,cfg]=await Promise.all([loadUnidades(),loadDiretorias(),loadTurnos(),loadAreas(),loadColaboradores(),loadFormularios(),loadAuditIndex(),loadAcoesIndex(),loadConfig()]);
      state.unidades=u;state.diretorias=d;state.turnos=t;state.areas=a;state.colaboradores=c;state.formularios=f;state.auditIndex=ai;state.acoesIndex=ac;state.config=cfg;
    }catch(e){
      console.error(e);
      if(!state.isOnline){document.getElementById('app').innerHTML=`<div class="empty"><strong>Offline</strong>Sem dados em cache. Conecte à internet uma vez para carregar.</div>`;return;}
      document.getElementById('app').innerHTML=`<div class="empty"><strong>Erro ao conectar</strong>Confira config.js e se rodou o schema.sql.</div>`;return;
    }
    if(state.isOnline&&state.pendingCount>0)syncPendingAudits();
    if(!Router.resolve())Router.navigate('/dashboard',{replace:true});
  },

  async _showManagerReport(token){
    // Página simplificada para o gestor — sem sidebar, sem nav interno
    document.body.classList.add('manager-view');
    document.querySelector('.topbar').innerHTML=`<div class="topbar__inner" style="justify-content:flex-start;"><div><p class="brand__eyebrow">Usina Santa Adélia — SSMA</p><h1 class="brand__title">Relatório de Auditoria</h1></div></div>`;
    const root=document.getElementById('app');
    root.innerHTML='<div class="loading">Carregando relatório…</div>';
    try{
      const{data:audit,error}=await supabaseClient.from('audits').select('*').eq('token_gestor',token).single();
      if(error||!audit){root.innerHTML=`<div class="empty" style="max-width:480px;margin:60px auto;"><strong>Relatório não encontrado</strong>Este link é inválido ou já não está disponível.</div>`;return;}
      const{data:itens}=await supabaseClient.from('audit_itens').select('*').eq('audit_id',audit.id).in('status',['nao_conforme','oportunidade_melhoria']);
      root.innerHTML=managerReportHtml(audit,itens||[]);
    }catch(e){console.error(e);root.innerHTML=`<div class="empty"><strong>Erro ao carregar</strong>Verifique sua conexão.</div>`;}
  },

  goDashboard(){state.editingAudit=null;state.view='dashboard';render();Router.setSilent('/dashboard');},
  toggleExportMenu(){
    const m=document.getElementById('export-menu');
    if(!m)return;
    const open=m.style.display!=='none';
    m.style.display=open?'none':'block';
    if(!open){
      // Fecha ao clicar fora
      const close=e=>{if(!document.getElementById('export-menu-container')?.contains(e.target)){m.style.display='none';document.removeEventListener('click',close);}};
      setTimeout(()=>document.addEventListener('click',close),10);
    }
  },
  exportAuditorias(){exportAuditorias();document.getElementById('export-menu').style.display='none';},
  async exportAuditoriasCompleto(){await exportAuditoriasCompleto();document.getElementById('export-menu').style.display='none';},
  async exportAcoes(){await exportAcoesPlanilha();},

  goNewAudit(){
    state.currentChecklist=[];
    state.editingAudit={id:newUUID(),persisted:false,_offline:false,codigo:'',token_gestor:null,formularioId:null,formularioNome:'',unidadeId:null,unidadeNome:'',unidadeSigla:'',areaId:null,areaNome:'',diretoriaId:null,diretoriaNome:'',turnoId:null,turnoNome:'',data:new Date().toISOString().slice(0,10),auditores:[{nome:'',matricula:''}],auditados:[{nome:'',matricula:''}],observacaoGeral:'',itens:{}};
    if(state.unidades.length===1)App.setAuditUnidade(state.unidades[0].id);
    if(state.formularios.length===1)App.setFormulario(state.formularios[0].id);
    state.view='form';render();Router.setSilent('/auditoria/nova');
  },

  async goEditAudit(id){
    document.getElementById('app').innerHTML='<div class="loading">Carregando auditoria…</div>';
    const audit=await loadAuditFull(id);if(!audit){alert('Não foi possível carregar.');App.goDashboard();return;}
    state.currentChecklist=audit.checklistFromHistory;state.editingAudit=audit;
    // Load opcoes from formulario for correct response buttons
    if(audit.formularioId){try{const fOp=await loadFormularioWithItems(audit.formularioId);state.currentOpcoes=fOp&&fOp.opcoes?[...fOp.opcoes]:[...DEFAULT_OPCOES];}catch(e){state.currentOpcoes=[...DEFAULT_OPCOES];}}
    else{state.currentOpcoes=[...DEFAULT_OPCOES];}
    state.view='form';render();Router.setSilent('/auditoria/'+id);
  },

  async goFormularios(){document.getElementById('app').innerHTML='<div class="loading">Carregando…</div>';state.formularios=await loadFormularios();state.view='formularios';render();Router.setSilent('/formularios');},
  goNewFormulario(){if(!state.isOnline){alert('Requer conexão com a internet.');return;}state.editingFormulario={id:null,nome:'',descricao:'',opcoes:[...DEFAULT_OPCOES],itens:[]};state.view='formulario-editor';render();Router.setSilent('/formularios/novo');},
  async goEditFormulario(id){document.getElementById('app').innerHTML='<div class="loading">Carregando…</div>';const f=await loadFormularioWithItems(id);if(!f){App.goFormularios();return;}state.editingFormulario={...f,opcoes:f.opcoes||[...DEFAULT_OPCOES]};state.view='formulario-editor';render();Router.setSilent('/formularios/'+id);},

  goCadastros(tab){
    state.cadastroDraft={unidades:JSON.parse(JSON.stringify(state.unidades)),diretorias:JSON.parse(JSON.stringify(state.diretorias)),turnos:JSON.parse(JSON.stringify(state.turnos)),areas:JSON.parse(JSON.stringify(state.areas)),colaboradores:[]};
    state.configDraft={...state.config};state.cadastroTab=tab||'unidades';state.view='cadastros';render();Router.setSilent('/cadastros/'+state.cadastroTab);
  },
  goAcoes(){state.view='acoes';render();Router.setSilent('/acoes');},
  async goAgenda(){
    state.view='agenda';state.agendaLoading=true;state.agendaEditing=null;render();Router.setSilent('/agenda');
    try{state.agendamentos=await loadAgendamentos(state.agendaMonth);}catch(e){console.error(e);state.agendamentos=[];}
    state.agendaLoading=false;render();
  },
  async agendaPrevMonth(){const[y,m]=state.agendaMonth.split('-').map(Number);const d=new Date(y,m-2,1);state.agendaMonth=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');await App.goAgenda();},
  async agendaNextMonth(){const[y,m]=state.agendaMonth.split('-').map(Number);const d=new Date(y,m,1);state.agendaMonth=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');await App.goAgenda();},
  async agendaGoToday(){state.agendaMonth=new Date().toISOString().slice(0,7);await App.goAgenda();},
  async setAgendaFilterUnidade(v){state.agendaFilterUnidade=v;render();},
  agendaOpenNew(prefillDate){
    state.agendaDayView=null;
    state.agendaEditing={_existing:false,id:newUUID(),data:prefillDate||new Date().toISOString().slice(0,10),unidadeId:'',unidadeNome:'',areaId:'',areaNome:'',diretoriaId:'',diretoriaNome:'',turnoId:'',turnoNome:'',formularioId:'',formularioNome:'',auditorNome:'',auditorMatricula:'',observacao:'',status:'agendado'};
    render();
    const el=document.querySelector('.panel');if(el)el.scrollIntoView({behavior:'smooth',block:'center'});
  },
  agendaOpenDay(dateStr){
    const temAlgo=state.agendamentos.some(a=>a.data===dateStr);
    if(temAlgo){state.agendaDayView=dateStr;state.agendaEditing=null;render();const el=document.querySelector('.panel');if(el)el.scrollIntoView({behavior:'smooth',block:'center'});}
    else{App.agendaOpenNew(dateStr);}
  },
  agendaCloseDayView(){state.agendaDayView=null;render();},
  async agendaStartAudit(agendaId){
    const ag=state.agendamentos.find(a=>a.id===agendaId);
    if(!ag)return;
    // Se já realizado, vai direto pra auditoria vinculada
    if(ag.auditId){App.goEditAudit(ag.auditId);return;}
    // Fecha visão do dia e muda para o formulário de auditoria pré-preenchido
    state.agendaDayView=null;
    state.currentChecklist=[];
    const unidade=state.unidades.find(u=>u.id===ag.unidadeId);
    state.editingAudit={
      id:newUUID(),persisted:false,_offline:false,
      _agendaId:agendaId, // guarda para vincular automaticamente ao salvar
      codigo:'',token_gestor:null,
      formularioId:ag.formularioId||null,formularioNome:ag.formularioNome||'',
      unidadeId:ag.unidadeId||null,unidadeNome:ag.unidadeNome||'',
      unidadeSigla:unidade?.sigla||'',
      areaId:ag.areaId||null,areaNome:ag.areaNome||'',
      diretoriaId:ag.diretoriaId||null,diretoriaNome:ag.diretoriaNome||'',
      turnoId:ag.turnoId||null,turnoNome:ag.turnoNome||'',
      data:ag.data,
      auditores:ag.auditorNome?[{nome:ag.auditorNome,matricula:ag.auditorMatricula||''}]:[{nome:'',matricula:''}],
      auditados:[{nome:'',matricula:''}],
      observacaoGeral:'',itens:{}
    };
    // Carrega checklist do formulário escolhido
    if(ag.formularioId){
      try{
        const items=await loadChecklistForFormulario(ag.formularioId);
        state.currentChecklist=items;
        state.editingAudit.itens=emptyItens(items);
      }catch(e){console.warn('Checklist load failed',e);}
    }
    state.view='form';render();
    showToast('📋 Formulário pré-preenchido com os dados do agendamento','ok');
  },
  agendaOpenEdit(id){const ag=state.agendamentos.find(a=>a.id===id);if(!ag)return;state.agendaDayView=null;state.agendaEditing={...ag,_existing:true};render();},
  agendaCancelEdit(){state.agendaEditing=null;render();},
  agendaEditField(key,value){if(state.agendaEditing)state.agendaEditing[key]=value;},
  agendaEditUnidade(uid){const u=state.unidades.find(x=>x.id===uid);if(!state.agendaEditing)return;state.agendaEditing.unidadeId=uid;state.agendaEditing.unidadeNome=u?u.nome:'';state.agendaEditing.areaId='';state.agendaEditing.areaNome='';state.agendaEditing.diretoriaId='';state.agendaEditing.diretoriaNome='';render();},
  agendaEditArea(aid){const a=state.areas.find(x=>x.id===aid);if(!state.agendaEditing)return;state.agendaEditing.areaId=aid;state.agendaEditing.areaNome=a?a.nome:'';state.agendaEditing.diretoriaId=a?.diretoria_id||'';state.agendaEditing.diretoriaNome=a?.diretoria_nome||'';},
  agendaEditFormulario(fid){const f=state.formularios.find(x=>x.id===fid);if(!state.agendaEditing)return;state.agendaEditing.formularioId=fid;state.agendaEditing.formularioNome=f?f.nome:'';},
  agendaAutoFillAuditor(nome){const c=state.colaboradores.find(x=>x.nome===nome);if(c&&state.agendaEditing)state.agendaEditing.auditorMatricula=c.matricula||'';},
  agendaFillByMat(mat){
    if(!mat.trim())return;
    const c=state.colaboradores.find(x=>x.matricula&&x.matricula.trim()===mat.trim());
    if(c&&state.agendaEditing){
      state.agendaEditing.auditorNome=c.nome;
      state.agendaEditing.auditorMatricula=mat.trim();
      const input=document.getElementById('agenda-auditor-input');
      if(input)input.value=c.nome;
    }
  },
  agendaAuditorSearch(val){
    state.agendaAuditorQ=val;
    if(state.agendaEditing)state.agendaEditing.auditorNome=val;
    // Atualiza apenas o dropdown sem re-renderizar o form todo
    const container=document.getElementById('agenda-auditor-input')?.parentElement;
    if(container){
      const old=document.getElementById('agenda-auditor-dropdown');if(old)old.remove();
      container.insertAdjacentHTML('beforeend',agendaAuditorDropdownHtml());
    }
  },
  agendaSelectAuditor(el){
    const nome=el.dataset.nome,mat=el.dataset.mat;
    if(state.agendaEditing){state.agendaEditing.auditorNome=nome;state.agendaEditing.auditorMatricula=mat;}
    state.agendaAuditorQ='';
    const input=document.getElementById('agenda-auditor-input');if(input)input.value=nome;
    const matInput=document.getElementById('agenda-mat-input');if(matInput)matInput.value=mat;
    const dd=document.getElementById('agenda-auditor-dropdown');if(dd)dd.remove();
  },
  agendaAuditorBlur(){
    state.agendaAuditorQ='';
    const dd=document.getElementById('agenda-auditor-dropdown');if(dd)dd.remove();
  },
  agendaToggleCancelado(){if(!state.agendaEditing)return;state.agendaEditing.status=state.agendaEditing.status==='cancelado'?'agendado':'cancelado';render();},
  async agendaSave(){
    const ag=state.agendaEditing;
    if(!ag.data){alert('Selecione a data.');return;}
    if(!ag.unidadeId){alert('Selecione a unidade.');return;}
    if(!ag.areaId){alert('Selecione o local/área.');return;}
    if(!ag.auditorNome.trim()){alert('Informe o auditor responsável.');return;}
    try{await saveAgendamentoToDb(ag);}catch(e){alert('Não foi possível salvar: '+e.message);return;}
    state.agendaEditing=null;
    state.agendamentos=await loadAgendamentos(state.agendaMonth);
    render();showToast('✅ Agendamento salvo!','ok');
  },
  async agendaDelete(id){
    if(!confirm('Excluir este agendamento?'))return;
    try{await deleteAgendamentoDb(id);}catch(e){alert('Não foi possível excluir: '+e.message);return;}
    state.agendaEditing=null;
    state.agendamentos=state.agendamentos.filter(a=>a.id!==id);
    render();showToast('Agendamento removido.','ok');
  },
  async goAnalise(){
    state.analiseData=null;state.analiseLoading=true;state.view='analise';render();Router.setSilent('/analise');
    try{state.analiseData=await loadAnaliseData();}catch(e){console.error(e);}
    state.analiseLoading=false;if(state.view==='analise')render();
  },
  async reloadAnalise(){
    state.analiseData=null;state.analiseLoading=true;render();
    try{state.analiseData=await loadAnaliseData();}catch(e){console.error(e);}
    state.analiseLoading=false;render();
  },
  async setFAnU(v){state.filterAnaliseUnidade=v;state.filterAnaliseDiretoria='todas';await App.reloadAnalise();},
  async setFAnD(v){state.filterAnaliseDiretoria=v;await App.reloadAnalise();},
  async setFAnP(v){state.filterAnalisePeriodo=v;await App.reloadAnalise();},
  async syncNow(){await syncPendingAudits();},

  setFU(v){state.filterUnidade=v;state.filterDiretoria='todas';state.filterArea='todas';document.getElementById('audit-list').innerHTML=auditListHtml();},
  setFD(v){state.filterDiretoria=v;document.getElementById('audit-list').innerHTML=auditListHtml();},
  setFA(v){state.filterArea=v;document.getElementById('audit-list').innerHTML=auditListHtml();},
  setFF(v){state.filterFormulario=v;document.getElementById('audit-list').innerHTML=auditListHtml();},
  setFS(v){state.filterSearch=v;document.getElementById('audit-list').innerHTML=auditListHtml();},
  setFAS(v){state.filterAcaoStatus=v;render();},
  setFAU(v){state.filterAcaoUnidade=v;state.filterAcaoDiretoria='todas';state.filterAcaoArea='todas';render();},
  setFAD(v){state.filterAcaoDiretoria=v;state.filterAcaoArea='todas';render();},
  setFAA(v){state.filterAcaoArea=v;render();},

  async loadChart(areaId){state.chartAreaId=areaId;if(!areaId){state.chartData=[];document.getElementById('chart-body').innerHTML='<p style="color:var(--ink-soft);text-align:center;padding:28px 0;font-size:.88rem;">Selecione uma área.</p>';return;}document.getElementById('chart-body').innerHTML='<div class="loading" style="padding:16px;">Carregando…</div>';state.chartData=await loadEvolutionData(areaId);document.getElementById('chart-body').innerHTML=drawChart(state.chartData);},

  setAuditUnidade(uid){const u=state.unidades.find(x=>x.id===uid);state.editingAudit.unidadeId=uid;state.editingAudit.unidadeNome=u?u.nome:'';state.editingAudit.unidadeSigla=u?u.sigla:'';state.editingAudit.areaId=null;state.editingAudit.areaNome='';state.editingAudit.diretoriaId=null;state.editingAudit.diretoriaNome='';state.editingAudit.turnoId=null;state.editingAudit.turnoNome='';render();},
  setAuditArea(areaId){const area=state.areas.find(a=>a.id===areaId);if(!area)return;state.editingAudit.areaId=area.id;state.editingAudit.areaNome=area.nome;state.editingAudit.diretoriaId=area.diretoria_id||null;state.editingAudit.diretoriaNome=area.diretoria_nome||'';render();},
  setAuditTurno(turnoId){const t=state.turnos.find(x=>x.id===turnoId);state.editingAudit.turnoId=turnoId||null;state.editingAudit.turnoNome=t?t.nome:'';},
  setHF(key,value){state.editingAudit[key]=value;},

  async setFormulario(id){if(!id){state.currentChecklist=[];state.currentOpcoes=[...DEFAULT_OPCOES];state.editingAudit.formularioId=null;state.editingAudit.formularioNome='';state.editingAudit.itens={};rerenderChecklistArea();return;}const f=state.formularios.find(x=>x.id===id);state.editingAudit.formularioId=id;state.editingAudit.formularioNome=f?f.nome:'';state.currentOpcoes=f&&f.opcoes?[...f.opcoes]:[...DEFAULT_OPCOES];const cl=document.getElementById('checklist-area');if(cl)cl.innerHTML='<div class="loading" style="padding:24px;">Carregando itens…</div>';const items=await loadChecklistForFormulario(id);state.currentChecklist=items;state.editingAudit.itens=emptyItens(items);rerenderChecklistArea();},

  addPerson(type){(state.editingAudit[type]||(state.editingAudit[type]=[])).push({nome:'',matricula:''});rerenderPersonList(type);},
  removePerson(type,idx){(state.editingAudit[type]||[]).splice(idx,1);rerenderPersonList(type);},
  setPersonField(type,idx,field,value){if(state.editingAudit[type]&&state.editingAudit[type][idx])state.editingAudit[type][idx][field]=value;},
  autoFillMat(type,idx,nome){
    const c=state.colaboradores.find(x=>x.nome===nome);
    if(c&&state.editingAudit[type]&&state.editingAudit[type][idx]){
      Object.assign(state.editingAudit[type][idx],{matricula:c.matricula||'',cargo:c.cargo||''});
      const el=document.getElementById(type+'-row-'+idx);
      if(el){const colabs=state.colaboradores.filter(x=>x.unidade_id===state.editingAudit.unidadeId);el.outerHTML=personRowHtml(type,state.editingAudit[type][idx],idx,colabs);}
    }
  },
  autoFillByMat(type,idx,mat){
    if(!mat.trim())return;
    const c=state.colaboradores.find(x=>x.matricula&&x.matricula.trim()===mat.trim());
    if(c&&state.editingAudit[type]&&state.editingAudit[type][idx]){
      Object.assign(state.editingAudit[type][idx],{nome:c.nome,cargo:c.cargo||''});
      const el=document.getElementById(type+'-row-'+idx);
      if(el){const colabs=state.colaboradores.filter(x=>x.unidade_id===state.editingAudit.unidadeId);el.outerHTML=personRowHtml(type,state.editingAudit[type][idx],idx,colabs);}
    }
  },

  setStatus(itemId,status){const r=state.editingAudit.itens[itemId];r.status=r.status===status?null:status;rerenderItemRow(itemId);updateScoreFooter();},
  setObs(itemId,value){state.editingAudit.itens[itemId].observacao=value;},
  setPlanoField(itemId,key,value){if(!state.editingAudit.itens[itemId].planoAcao)state.editingAudit.itens[itemId].planoAcao={};state.editingAudit.itens[itemId].planoAcao[key]=value;},
  setObsGeral(value){state.editingAudit.observacaoGeral=value;},

  async handlePhotoInput(itemId,inputEl){
    const file=inputEl.files&&inputEl.files[0];if(!file)return;if(!file.type.startsWith('image/')){alert('Selecione uma imagem.');return;}
    try{
      const base64=await compressToBase64(file);state.editingAudit.itens[itemId].evidencia=base64;
      if(state.isOnline){try{const blob=dataURLtoBlob(base64);const path=state.editingAudit.id+'/'+itemId+'-'+Date.now()+'.jpg';const{error}=await supabaseClient.storage.from('evidencias').upload(path,blob,{contentType:'image/jpeg',upsert:true});if(!error){const{data}=supabaseClient.storage.from('evidencias').getPublicUrl(path);state.editingAudit.itens[itemId].evidencia=data.publicUrl;}}catch(e){}}
      rerenderItemRow(itemId);
    }catch(e){console.error(e);alert('Não foi possível processar a foto.');}
  },
  removePhoto(itemId){state.editingAudit.itens[itemId].evidencia=null;rerenderItemRow(itemId);},

  async enviarGestor(){
    const a=state.editingAudit;if(!a||!a.id||!a.persisted){alert('Salve a auditoria antes de enviar ao gestor.');return;}
    let token=a.token_gestor;
    if(!token){token=generateToken();const{error}=await supabaseClient.from('audits').update({token_gestor:token}).eq('id',a.id);if(error){alert('Não foi possível gerar o link.');return;}a.token_gestor=token;}
    const reportUrl=`${window.location.origin}${window.location.pathname.replace(/[^/]*$/,'')}?token=${token}`;
    const waUrl=buildWhatsAppLink(a,reportUrl);
    window.open(waUrl,'_blank');
  },

  async approveProposal(rowId){
    const p=state.acoesIndex.find(x=>x.rowId===rowId);if(!p||!p.prazoGestor)return;
    const{error}=await supabaseClient.from('audit_itens').update({plano_acao_prazo:p.prazoGestor,plano_acao_status:'em_andamento',plano_acao_status_negociacao:'ssma_aprovou'}).eq('id',rowId);
    if(error){alert('Erro ao aprovar.');return;}
    state.acoesIndex=await loadAcoesIndex();render();showToast('Prazo aprovado!','ok');
  },
  toggleNegotiate(rowId){const el=document.getElementById('neg-'+rowId);if(el)el.style.display=el.style.display==='none'||!el.style.display?'block':'none';},
  async negotiateProposal(rowId){
    const dateInput=document.getElementById('negdate-'+rowId);if(!dateInput||!dateInput.value){alert('Selecione uma data.');return;}
    const{error}=await supabaseClient.from('audit_itens').update({plano_acao_prazo:dateInput.value,plano_acao_status:'em_andamento',plano_acao_status_negociacao:'ssma_negociou'}).eq('id',rowId);
    if(error){alert('Erro ao negociar.');return;}
    state.acoesIndex=await loadAcoesIndex();render();showToast('Prazo negociado!','ok');
  },

  async saveAudit(){
    const a=state.editingAudit;
    if(!a.unidadeId){alert('Selecione a unidade.');return;}if(!a.areaId){alert('Selecione a área.');return;}
    if(!a.formularioId&&!a.persisted&&!a._offline){alert('Selecione o formulário.');return;}
    if(!state.currentChecklist.length){alert('O formulário não tem itens.');return;}
    if(!(a.auditores||[]).filter(p=>p.nome.trim()).length){alert('Adicione pelo menos um auditor.');return;}
    const btn=document.querySelector('.score-footer .btn-primary');if(btn){btn.disabled=true;btn.textContent='Salvando…';}
    a.auditores=(a.auditores||[]).filter(p=>p.nome.trim());a.auditados=(a.auditados||[]).filter(p=>p.nome.trim());
    if(state.isOnline&&!a._offline){
      try{
        if(!a.codigo||!a.persisted)a.codigo=await getNextCode(a.unidadeSigla,new Date().getFullYear());
        await saveAuditToDb(a,state.currentChecklist);
        try{await localDB.pendingAudits.delete(a.id);}catch(e){}
        // Se iniciado pela Agenda, vincula diretamente ao agendamento
        if(a._agendaId){
          try{await supabaseClient.from('agendamentos').update({audit_id:a.id}).eq('id',a._agendaId);}
          catch(e){console.warn('Agenda link failed:',e);}
        }
        a.persisted=true;a._offline=false;
        state.auditIndex=await loadAuditIndex();state.acoesIndex=await loadAcoesIndex();
        state.pendingCount=await localDB.pendingAudits.count().catch(()=>0);
        state.editingAudit=null;App.goDashboard();
      }
      catch(e){console.error(e);alert('Não foi possível salvar. Salvando offline…');await this._saveOffline(a);}
    }else{await this._saveOffline(a);}
    if(btn){btn.disabled=false;btn.textContent='Salvar auditoria';}
  },
  async _saveOffline(a){if(!a.codigo||a.codigo==='')a.codigo='OFFLINE-'+a.unidadeSigla+'-'+Date.now().toString(36).toUpperCase();try{await localDB.pendingAudits.put({id:a.id,auditData:JSON.stringify(a),checklistData:JSON.stringify(state.currentChecklist),createdAt:new Date().toISOString(),syncStatus:'pending'});state.pendingCount=await localDB.pendingAudits.count();state.auditIndex=await loadAuditIndex();state.editingAudit=null;state.view='dashboard';render();showToast('Salvo offline. Sincronizará ao conectar.','ok');}catch(e){console.error(e);alert('Não foi possível salvar.');}},

  async deleteAudit(id){if(!confirm('Excluir esta auditoria?'))return;try{const{data:files}=await supabaseClient.storage.from('evidencias').list(id);if(files&&files.length)await supabaseClient.storage.from('evidencias').remove(files.map(f=>id+'/'+f.name));}catch(e){}const{error}=await supabaseClient.from('audits').delete().eq('id',id);if(error){alert('Não foi possível excluir.');return;}state.auditIndex=state.auditIndex.filter(x=>x.id!==id);state.acoesIndex=state.acoesIndex.filter(x=>x.auditId!==id);try{await localDB.cache.delete('aFull:'+id);}catch(e){}state.editingAudit=null;state.view='dashboard';render();},
  async deleteOfflineAudit(id){if(!confirm('Excluir auditoria offline?'))return;try{await localDB.pendingAudits.delete(id);}catch(e){}state.pendingCount=await localDB.pendingAudits.count().catch(()=>0);state.auditIndex=await loadAuditIndex();state.editingAudit=null;state.view='dashboard';render();},
  async exportPDF(id){await exportPDF(id);},

  setFField(k,v){state.editingFormulario[k]=v;},
  // Opções de resposta
  setPreset(name){
    if(!PRESETS[name]){return;}
    state.editingFormulario.opcoes=JSON.parse(JSON.stringify(PRESETS[name]));
    render();
  },
  setOpcaoField(idx,key,value){
    if(!state.editingFormulario.opcoes)return;
    state.editingFormulario.opcoes[idx][key]=value;
    // Re-render only the opcoes section to show updated preview colors
    render();
  },
  addOpcao(){
    if(!state.editingFormulario.opcoes)state.editingFormulario.opcoes=[...DEFAULT_OPCOES];
    const newId='custom_'+Date.now().toString(36);
    state.editingFormulario.opcoes.push({id:newId,label:'Nova resposta',peso:0,cor:'na',gera_plano:false,neutro:false});
    render();
  },
  removeOpcao(idx){
    if(!state.editingFormulario.opcoes||state.editingFormulario.opcoes.length<=1){alert('O formulário precisa ter pelo menos uma opção de resposta.');return;}
    state.editingFormulario.opcoes.splice(idx,1);
    render();
  },
  renameCategoria(o,n){state.editingFormulario.itens.forEach(it=>{if(it.categoria===o)it.categoria=n;});},
  removeCategoria(name){if(!confirm(`Remover categoria "${name}" e seus itens?`))return;state.editingFormulario.itens=state.editingFormulario.itens.filter(it=>it.categoria!==name);render();},
  addCategoriaFromInput(){const input=document.getElementById('nova-cat-input');if(!input||!input.value.trim()){alert('Digite um nome para a categoria.');return;}state.editingFormulario.itens.push({id:genId(),categoria:input.value.trim(),texto:'Novo item de verificação'});render();},
  addItem(cat){state.editingFormulario.itens.push({id:genId(),categoria:cat,texto:'Novo item de verificação'});render();},
  setItemTexto(id,v){const it=state.editingFormulario.itens.find(i=>i.id===id);if(it)it.texto=v;},
  removeItem(id){if(!confirm('Remover este item?'))return;state.editingFormulario.itens=state.editingFormulario.itens.filter(i=>i.id!==id);render();},

  async saveFormulario(){
    const f=state.editingFormulario;if(!f||!f.nome.trim()){alert('Dê um nome ao formulário.');return;}
    const itens=f.itens.filter(it=>it.texto.trim());if(!itens.length){alert('Adicione pelo menos um item.');return;}
    const opcoes=f.opcoes||DEFAULT_OPCOES;if(!opcoes.length){alert('Configure pelo menos uma opção de resposta.');return;}
    if(!state.isOnline){alert('Requer internet para salvar formulários.');return;}
    const btn=document.querySelector('.score-footer .btn-primary');if(btn){btn.disabled=true;btn.textContent='Salvando…';}
    try{
      let fid=f.id;const row={nome:f.nome.trim(),descricao:f.descricao||'',ativo:true,opcoes_resposta:opcoes};
      if(fid){await supabaseClient.from('formularios').update(row).eq('id',fid);}
      else{const{data,error}=await supabaseClient.from('formularios').insert(row).select('id').single();if(error)throw error;fid=data.id;}
      let existingIds=new Set();if(f.id){const{data:ex}=await supabaseClient.from('checklist_items').select('id').eq('formulario_id',fid).eq('ativo',true);existingIds=new Set((ex||[]).map(i=>i.id));}
      const currentIds=new Set();
      for(let i=0;i<itens.length;i++){const it=itens[i];const irow={formulario_id:fid,categoria:it.categoria,texto:it.texto.trim(),ordem:i,ativo:true};if(it.id.startsWith('new_')){const{data,error}=await supabaseClient.from('checklist_items').insert(irow).select('id').single();if(error)throw error;currentIds.add(data.id);}else{await supabaseClient.from('checklist_items').update(irow).eq('id',it.id);currentIds.add(it.id);}}
      const toDeact=[...existingIds].filter(id=>!currentIds.has(id));if(toDeact.length)await supabaseClient.from('checklist_items').update({ativo:false}).in('id',toDeact);
      // Invalidate cache for this formulario
      try{await localDB.cache.delete('fFull:'+fid);await localDB.cache.delete('formularios');}catch(e){}
      state.formularios=await loadFormularios();state.editingFormulario=null;state.view='formularios';render();
    }catch(e){console.error(e);alert('Não foi possível salvar.');if(btn){btn.disabled=false;btn.textContent='Salvar formulário';}}
  },
  async deleteFormulario(id){if(!confirm('Excluir este formulário?'))return;await supabaseClient.from('formularios').update({ativo:false}).eq('id',id);state.formularios=await loadFormularios();render();},

  setCadastroTab(t){state.cadastroTab=t;render();Router.setSilent('/cadastros/'+t);},
  // ===== Tabela de Colaboradores (independente do cadastroDraft) =====
  setColabSearch(v){state.colabSearch=v;state.colabShowLimit=150;render();},
  setColabFilterU(v){state.colabFilterUnidade=v;state.colabFilterDiretoria='todas';state.colabFilterArea='todas';state.colabShowLimit=150;render();},
  setColabFilterD(v){state.colabFilterDiretoria=v;state.colabShowLimit=150;render();},
  setColabFilterA(v){state.colabFilterArea=v;state.colabShowLimit=150;render();},
  setColabFilterSit(v){state.colabFilterSituacao=v;state.colabShowLimit=150;render();},
  colabShowMore(){state.colabShowLimit+=150;render();},
  colabOpenNew(){state.colabEditing={_existing:false,nome:'',matricula:'',telefone:'',unidade_id:'',diretoria_id:'',area_id:'',cargo:'',situacao:'ATIVO'};render();const el=document.querySelector('.cadastro-body, #cadastro-body');if(el)el.scrollIntoView({behavior:'smooth'});},
  colabOpenEdit(id){const c=state.colaboradores.find(x=>x.id===id);if(!c)return;state.colabEditing={...c,_existing:true};render();},
  colabCancelEdit(){state.colabEditing=null;render();},
  colabEditField(key,value){if(state.colabEditing)state.colabEditing[key]=value;},
  async colabSaveEdit(){
    const c=state.colabEditing;if(!c||!c.nome.trim()){alert('Informe o nome.');return;}
    const row={nome:c.nome.trim(),matricula:c.matricula||null,telefone:c.telefone||'',unidade_id:c.unidade_id||null,diretoria_id:c.diretoria_id||null,area_id:c.area_id||null,cargo:c.cargo||'',situacao:c.situacao||'ATIVO'};
    try{
      if(c._existing){
        const{error}=await supabaseClient.from('colaboradores').update(row).eq('id',c.id);
        if(error)throw error;
      }else{
        const{error}=await supabaseClient.from('colaboradores').insert({id:newUUID(),...row});
        if(error)throw error;
      }
    }catch(e){alert('Não foi possível salvar: '+e.message);return;}
    state.colabEditing=null;
    state.colaboradores=await loadColaboradores();
    await cacheSet('colaboradores',state.colaboradores);
    render();showToast('✅ Colaborador salvo!','ok');
  },
  async colabDelete(id){
    if(!confirm('Excluir este colaborador?'))return;
    try{const{error}=await supabaseClient.from('colaboradores').delete().eq('id',id);if(error)throw error;}
    catch(e){alert('Não foi possível excluir: '+e.message);return;}
    state.colaboradores=state.colaboradores.filter(x=>x.id!==id);
    await cacheSet('colaboradores',state.colaboradores);
    render();showToast('Colaborador removido.','ok');
  },
  addCItem(tbl){
    const base=tbl==='unidades'?{id:newUUID(),nome:'',sigla:''}:tbl==='diretorias'?{id:newUUID(),nome:'',unidade_id:''}:tbl==='turnos'?{id:newUUID(),nome:'',horario_inicio:'',horario_fim:'',unidade_id:''}:tbl==='areas'?{id:newUUID(),nome:'',unidade_id:'',diretoria_id:''}:{id:newUUID(),nome:'',matricula:'',telefone:'',unidade_id:'',cargo:'',situacao:'ATIVO',gerencia:'',supervisao:''};
    state.cadastroDraft[tbl].push(base);render();
  },
  setCField(tbl,id,key,value){const item=state.cadastroDraft[tbl].find(x=>x.id===id);if(item)item[key]=value;},
  removeCItem(tbl,id){state.cadastroDraft[tbl]=state.cadastroDraft[tbl].filter(x=>x.id!==id);render();},
  setConfigField(key,value){state.configDraft=state.configDraft||{...state.config};state.configDraft[key]=value;},
  async importCSV(inputEl){
    const file=inputEl.files&&inputEl.files[0];if(!file)return;
    let text;try{text=await readCsvFile(file);}catch(e){alert('Erro ao ler o arquivo: '+e.message);return;}
    const{headers,rows,delimiter}=parseCSV(text);
    if(!rows.length){alert('❌ Arquivo sem dados ou não foi possível interpretar as linhas.');inputEl.value='';return;}
    const map=guessMapSenior(headers);

    // ===== Diagnóstico de mapeamento — mostra ANTES de importar =====
    const colLabel={mat:'Matrícula',nome:'Nome',nasc:'Data Nascimento',admiss:'Data Admissão',unid:'Unidade',diretoria:'Diretoria',gerencia:'Gerência',supervisao:'Supervisão',local:'Local',situacao:'Situação',cargo:'Cargo',codcc:'Cód. Centro Custo',desccc:'Desc. Centro Custo'};
    const diagLines=Object.entries(map).map(([k,idx])=>`${idx>-1?'✅':'❌'} ${colLabel[k]}: ${idx>-1?headers[idx]:'NÃO ENCONTRADA'}`);
    const criticosFaltando=(map.nome===-1?1:0)+(map.mat===-1?1:0);
    let diagMsg=`📄 Arquivo: ${rows.length} linha(s) de dados · ${headers.length} coluna(s) · delimitador "${delimiter==='\t'?'TAB':delimiter}"\n\n`+
      `Colunas detectadas:\n${diagLines.join('\n')}`;
    if(criticosFaltando>0){
      alert('❌ Não foi possível identificar colunas essenciais (Nome e/ou Matrícula).\n\n'+diagMsg+'\n\nVerifique se o arquivo tem cabeçalho na primeira linha com esses nomes.');
      inputEl.value='';return;
    }
    const prosseguir=confirm(diagMsg+'\n\nOs dados parecem corretos? Clique OK para continuar.\n\nOs dados serão gravados DIRETO no banco (não precisa clicar em "Salvar cadastros" depois).');
    if(!prosseguir){inputEl.value='';return;}

    const onlyAtivo=confirm('Importar apenas colaboradores com situação ATIVO?\n\n(OK = somente ativos · Cancelar = importar todos, independente da situação)');

    const progEl=document.getElementById('csv-progress');
    const setProg=(msg)=>{if(progEl)progEl.innerHTML=`<div style="background:var(--paper);border:1px solid var(--line);border-radius:8px;padding:10px 14px;margin-bottom:12px;font-size:.85rem;color:var(--brand);font-family:var(--mono);">⏳ ${msg}</div>`;};
    setProg('Processando arquivo…');

    // ===== Passo 1: detectar/criar Unidades, Diretorias, Áreas (Locais) — listas pequenas, direto no banco =====
    const unidByName={};state.unidades.forEach(u=>{unidByName[u.nome.toLowerCase()]=u;if(u.sigla)unidByName[u.sigla.toLowerCase()]=u;});
    const dirByKey={};state.diretorias.forEach(d=>dirByKey[(d.unidade_id||'')+'|'+d.nome.toLowerCase()]=d);
    const areaByKey={};state.areas.forEach(a=>areaByKey[(a.unidade_id||'')+'|'+a.nome.toLowerCase()]=a);
    const novasUnidsArr=[],novasDirsArr=[],novosLocaisArr=[];
    const novasUnids=new Set(),novasDirs=new Set(),novosLocais=new Set();

    let ignSemNome=0,ignInativo=0,ignSemMat=0;
    const situacoesEncontradas=new Set();
    const colabRows=[]; // linhas prontas para upsert

    rows.forEach(r=>{
      const get=(idx)=>idx>-1?(r[idx]||'').trim():'';
      const nome=get(map.nome);
      if(!nome){ignSemNome++;return;}
      const mat=get(map.mat);
      const situacaoRaw=get(map.situacao);
      const situacao=(situacaoRaw||'ATIVO').toUpperCase().trim();
      if(situacaoRaw)situacoesEncontradas.add(situacaoRaw);
      if(onlyAtivo&&!situacao.startsWith('ATIV')){ignInativo++;return;}

      const unidNome=get(map.unid),dirNome=get(map.diretoria),localNome=get(map.local);

      let unid=unidNome?unidByName[unidNome.toLowerCase()]:null;
      if(!unid&&unidNome){unid={id:newUUID(),nome:unidNome,sigla:unidNome.slice(0,4).toUpperCase()};unidByName[unidNome.toLowerCase()]=unid;novasUnidsArr.push(unid);novasUnids.add(unidNome);}

      const dirKey=(unid?.id||'')+'|'+dirNome.toLowerCase();
      let dir=dirNome?dirByKey[dirKey]:null;
      if(!dir&&dirNome){dir={id:newUUID(),nome:dirNome,unidade_id:unid?.id||null};dirByKey[dirKey]=dir;novasDirsArr.push(dir);novasDirs.add(dirNome);}

      const areaKey=(unid?.id||'')+'|'+localNome.toLowerCase();
      let area=localNome?areaByKey[areaKey]:null;
      if(!area&&localNome){area={id:newUUID(),nome:localNome,unidade_id:unid?.id||null,diretoria_id:dir?.id||null};areaByKey[areaKey]=area;novosLocaisArr.push(area);novosLocais.add(localNome);}
      else if(area&&dir&&!area.diretoria_id){area.diretoria_id=dir.id;}

      if(!mat)ignSemMat++;
      colabRows.push({
        id:newUUID(),nome,matricula:mat||null,telefone:'',
        unidade_id:unid?.id||null,diretoria_id:dir?.id||null,area_id:area?.id||null,
        cargo:get(map.cargo),situacao,gerencia:get(map.gerencia),supervisao:get(map.supervisao),
        data_nascimento:parseDate(get(map.nasc)),data_admissao:parseDate(get(map.admiss)),
        cod_centro_custo:get(map.codcc),desc_centro_custo:get(map.desccc)
      });
    });

    try{
      // Grava Unidades/Diretorias/Áreas novas primeiro (poucas linhas, rápido)
      if(novasUnidsArr.length){setProg(`Criando ${novasUnidsArr.length} unidade(s)…`);const{error}=await supabaseClient.from('unidades').upsert(novasUnidsArr,{onConflict:'id'});if(error)throw new Error('Unidades: '+error.message);}
      if(novasDirsArr.length){setProg(`Criando ${novasDirsArr.length} diretoria(s)…`);const{error}=await supabaseClient.from('diretorias').upsert(novasDirsArr,{onConflict:'id'});if(error)throw new Error('Diretorias: '+error.message);}
      if(novosLocaisArr.length){setProg(`Criando ${novosLocaisArr.length} local(is)…`);const{error}=await supabaseClient.from('areas').upsert(novosLocaisArr,{onConflict:'id'});if(error)throw new Error('Áreas: '+error.message);}

      // Busca matrículas já existentes no banco para decidir INSERT vs UPDATE corretamente (evita duplicar)
      setProg('Verificando colaboradores já cadastrados…');
      const matsNoArquivo=colabRows.filter(c=>c.matricula).map(c=>c.matricula);
      const existingByMat={};
      const CHUNK_LOOKUP=500;
      for(let i=0;i<matsNoArquivo.length;i+=CHUNK_LOOKUP){
        const slice=matsNoArquivo.slice(i,i+CHUNK_LOOKUP);
        const{data,error}=await supabaseClient.from('colaboradores').select('id,matricula').in('matricula',slice);
        if(error)throw new Error('Busca matrículas: '+error.message);
        (data||[]).forEach(d=>{existingByMat[d.matricula]=d.id;});
      }
      let added=0,upd=0;
      colabRows.forEach(c=>{
        if(c.matricula&&existingByMat[c.matricula]){c.id=existingByMat[c.matricula];upd++;}
        else added++;
      });

      // Upsert em lotes de 500
      const BATCH=500;
      for(let i=0;i<colabRows.length;i+=BATCH){
        const slice=colabRows.slice(i,i+BATCH);
        setProg(`Gravando colaboradores… ${Math.min(i+BATCH,colabRows.length)}/${colabRows.length}`);
        const{error}=await supabaseClient.from('colaboradores').upsert(slice,{onConflict:'id'});
        if(error)throw new Error('Colaboradores (lote '+(i/BATCH+1)+'): '+error.message);
      }

      setProg('Atualizando listas…');
      const[u,d,a,c]=await Promise.all([loadUnidades(),loadDiretorias(),loadAreas(),loadColaboradores()]);
      state.unidades=u;state.diretorias=d;state.areas=a;state.colaboradores=c;
      state.cadastroDraft.unidades=JSON.parse(JSON.stringify(u));
      state.cadastroDraft.diretorias=JSON.parse(JSON.stringify(d));
      state.cadastroDraft.areas=JSON.parse(JSON.stringify(a));
      await Promise.all([cacheSet('unidades',u),cacheSet('diretorias',d),cacheSet('areas',a),cacheSet('colaboradores',c)]);

      if(progEl)progEl.innerHTML='';
      render();
      const partes=[`✅ ${added} colaborador(es) novo(s)`,`🔄 ${upd} atualizado(s) (matrícula já existia)`];
      if(ignInativo)partes.push(`⏭ ${ignInativo} ignorado(s) por situação diferente de ATIVO`);
      if(ignSemNome)partes.push(`⚠ ${ignSemNome} linha(s) sem nome (ignoradas)`);
      if(ignSemMat)partes.push(`ℹ ${ignSemMat} sem matrícula no arquivo`);
      if(novasUnids.size)partes.push(`🏭 Unidades criadas: ${[...novasUnids].join(', ')}`);
      if(novasDirs.size)partes.push(`🏢 Diretorias criadas: ${[...novasDirs].join(', ')}`);
      if(novosLocais.size)partes.push(`📍 Locais/Áreas criados: ${[...novosLocais].join(', ')}`);
      if(situacoesEncontradas.size)partes.push(`\nValores de situação encontrados: ${[...situacoesEncontradas].join(', ')}`);
      alert('✅ Importação concluída e gravada no banco!\n\n'+partes.join('\n')+`\n\nTotal de colaboradores no sistema agora: ${c.length}`);
    }catch(e){
      console.error('importCSV:',e);
      if(progEl)progEl.innerHTML='';
      alert('❌ A importação foi interrompida por um erro.\n\n'+e.message+'\n\nNenhuma alteração adicional será feita. Os lotes já gravados antes do erro permanecem salvos — você pode rodar a importação novamente, ela vai apenas atualizar quem já existe.');
    }
    inputEl.value='';
  },
  cancelCadastro(){state.view='dashboard';render();},
  async saveCadastros(){
    if(!state.isOnline){alert('Requer conexão com a internet para salvar cadastros.');return;}
    const btn=document.querySelector('.score-footer .btn-primary');
    if(btn){btn.disabled=true;btn.textContent='Salvando...';}
    try{
      const uRows=state.cadastroDraft.unidades.filter(x=>x.nome.trim()).map(x=>({id:x.id,nome:x.nome,sigla:x.sigla||x.nome.slice(0,4).toUpperCase()}));if(uRows.length){const{error:eU}=await supabaseClient.from('unidades').upsert(uRows,{onConflict:'id'});if(eU)throw new Error('Unidades: '+eU.message);}
      const rmU=state.unidades.filter(x=>!uRows.find(y=>y.id===x.id)).map(x=>x.id);if(rmU.length){const{error:eRU}=await supabaseClient.from('unidades').delete().in('id',rmU);if(eRU)throw new Error('Remover unidades: '+eRU.message);}
      const dRows=state.cadastroDraft.diretorias.filter(x=>x.nome.trim()).map(x=>{
        const validUnidade=uRows.find(u=>u.id===x.unidade_id);
        return{id:x.id,nome:x.nome,unidade_id:validUnidade?x.unidade_id:null};
      });
      if(dRows.length){const{error:eD}=await supabaseClient.from('diretorias').upsert(dRows,{onConflict:'id'});if(eD)throw new Error('Diretorias: '+eD.message);}
      const rmD=state.diretorias.filter(x=>!dRows.find(y=>y.id===x.id)).map(x=>x.id);if(rmD.length){const{error:eRD}=await supabaseClient.from('diretorias').delete().in('id',rmD);if(eRD)throw new Error('Remover diretorias: '+eRD.message);}
      const tRows=state.cadastroDraft.turnos.filter(x=>x.nome.trim()).map(x=>{
        const validUnidade=uRows.find(u=>u.id===x.unidade_id);
        return{id:x.id,nome:x.nome,horario_inicio:x.horario_inicio||'',horario_fim:x.horario_fim||'',unidade_id:validUnidade?x.unidade_id:null};
      });
      if(tRows.length){const{error:eT}=await supabaseClient.from('turnos').upsert(tRows,{onConflict:'id'});if(eT)throw new Error('Turnos: '+eT.message);}
      const rmT=state.turnos.filter(x=>!tRows.find(y=>y.id===x.id)).map(x=>x.id);if(rmT.length){const{error:eRT}=await supabaseClient.from('turnos').delete().in('id',rmT);if(eRT)throw new Error('Remover turnos: '+eRT.message);}
      const aRows=state.cadastroDraft.areas.filter(x=>x.nome.trim()).map(x=>{
        const validUnidade=uRows.find(u=>u.id===x.unidade_id);
        const validDiretoria=dRows.find(d=>d.id===x.diretoria_id);
        return{id:x.id,nome:x.nome,unidade_id:validUnidade?x.unidade_id:null,diretoria_id:validDiretoria?x.diretoria_id:null};
      });
      if(aRows.length){const{error:eA}=await supabaseClient.from('areas').upsert(aRows,{onConflict:'id'});if(eA)throw new Error('Areas: '+eA.message);}
      const rmA=state.areas.filter(x=>!aRows.find(y=>y.id===x.id)).map(x=>x.id);if(rmA.length){const{error:eRA}=await supabaseClient.from('areas').delete().in('id',rmA);if(eRA)throw new Error('Remover areas: '+eRA.message);}
      // Colaboradores agora são gerenciados diretamente na tabela (não fazem parte deste rascunho)
      if(state.configDraft){const cfgRows=[{chave:'peso_conforme',valor:String(state.configDraft.peso_conforme),descricao:'Pontuação Conforme'},{chave:'peso_om',valor:String(state.configDraft.peso_om),descricao:'Pontuação OM'},{chave:'peso_nc',valor:String(state.configDraft.peso_nc),descricao:'Pontuação NC'},{chave:'whatsapp_ssma',valor:state.configDraft.whatsapp_ssma||'',descricao:'WhatsApp SSMA'}];await supabaseClient.from('configuracoes').upsert(cfgRows,{onConflict:'chave'});state.config=await loadConfig();}
    }catch(e){
      console.error('saveCadastros:',e);
      if(btn){btn.disabled=false;btn.textContent='Salvar cadastros';}
      alert('❌ Não foi possível salvar.\n\n'+e.message+'\n\nVerifique:\n• Se o schema.sql foi rodado corretamente no Supabase\n• Se a URL e chave no config.js estão corretas\n• Se há conexão com a internet');
      return;
    }
    const[u,d,t,a,c]=await Promise.all([loadUnidades(),loadDiretorias(),loadTurnos(),loadAreas(),loadColaboradores()]);
    state.unidades=u;state.diretorias=d;state.turnos=t;state.areas=a;state.colaboradores=c;
    await Promise.all([cacheSet('unidades',u),cacheSet('diretorias',d),cacheSet('turnos',t),cacheSet('areas',a),cacheSet('colaboradores',c)]);
    if(btn){btn.disabled=false;btn.textContent='Salvar cadastros';}
    showToast('✅ Cadastros salvos com sucesso!','ok');
    App.goDashboard();
  },

  async setAcaoStatus(rowId,status){if(!state.isOnline){alert('Requer internet.');return;}const{error}=await supabaseClient.from('audit_itens').update({plano_acao_status:status}).eq('id',rowId);if(error){alert('Não foi possível atualizar.');return;}state.acoesIndex=state.acoesIndex.map(p=>p.rowId===rowId?{...p,status}:p);render();}
};

/* ====== Função global para a página do gestor ====== */
async function submitManagerProposal(){
  const items=document.querySelectorAll('.manager-item');
  const proposals=[];let hasDate=false;
  items.forEach(el=>{const rowId=el.dataset.rowId;const dateInput=el.querySelector('.proposta-data');const commentInput=el.querySelector('.proposta-comentario');if(!dateInput)return;const date=dateInput.value;const comment=commentInput?commentInput.value:'';if(date)hasDate=true;proposals.push({rowId,date,comment});});
  if(!hasDate){alert('Por favor, proponha pelo menos uma data.');return;}
  const btn=document.getElementById('btn-proposta');if(btn){btn.disabled=true;btn.textContent='Enviando…';}
  try{
    for(const p of proposals){if(!p.date)continue;const{error}=await supabaseClient.from('audit_itens').update({plano_acao_prazo_gestor:p.date,plano_acao_comentario_gestor:p.comment||'',plano_acao_status_negociacao:'gestor_proposto'}).eq('id',p.rowId);if(error)throw error;}
    document.getElementById('app').innerHTML=`<div style="max-width:480px;margin:60px auto;text-align:center;padding:20px;"><div style="font-size:4rem;">✅</div><h2 style="color:#07583B;margin-top:16px;">Proposta enviada!</h2><p style="color:#4A6357;line-height:1.6;">Os prazos propostos foram enviados para a equipe SSMA.<br>Entraremos em contato caso necessário.</p></div>`;
  }catch(e){console.error(e);alert('Erro ao enviar. Verifique sua conexão.');if(btn){btn.disabled=false;btn.textContent='Enviar proposta de prazos';}}
}

/* ====== Rotas ======
   Cada rota chama a lógica de navegação que já existe em App.go*().
   O Router só cuida da URL, deep-link e botão voltar/avançar. */
Router.register('/dashboard',            ()=>App.goDashboard());
Router.register('/auditoria/nova',       ()=>App.goNewAudit());
Router.register('/auditoria/:id',        p=>App.goEditAudit(p.id));
Router.register('/formularios',          ()=>App.goFormularios());
Router.register('/formularios/novo',     ()=>App.goNewFormulario());
Router.register('/formularios/:id',      p=>App.goEditFormulario(p.id));
Router.register('/cadastros',            ()=>App.goCadastros());
Router.register('/cadastros/:tab',       p=>App.goCadastros(p.tab));
Router.register('/acoes',                ()=>App.goAcoes());
Router.register('/analise',              ()=>App.goAnalise());
Router.register('/agenda',               ()=>App.goAgenda());

App.init();
