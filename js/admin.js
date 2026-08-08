(() => {
 const cfg=window.APP_CONFIG,configured=Boolean(cfg.SUPABASE_URL&&cfg.SUPABASE_URL.startsWith('https://')&&cfg.SUPABASE_ANON_KEY&&cfg.SUPABASE_ANON_KEY.startsWith('sb_publishable_'));
 const supa=configured?window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY):null;
 const $=id=>document.getElementById(id);
 const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
 const isoWeekValue=()=>{
   const d=new Date();
   const date=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));
   const dayNum=date.getUTCDay()||7;
   date.setUTCDate(date.getUTCDate()+4-dayNum);
   const yearStart=new Date(Date.UTC(date.getUTCFullYear(),0,1));
   const weekNo=Math.ceil((((date-yearStart)/86400000)+1)/7);
   return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2,'0')}`;
 };
 const weekToMonday=(weekValue)=>{
   if(!weekValue||!weekValue.includes('-W')) return today();
   const [yearStr,weekStr]=weekValue.split('-W');
   const year=Number(yearStr),week=Number(weekStr);
   const jan4=new Date(Date.UTC(year,0,4));
   const day=jan4.getUTCDay()||7;
   const monday=new Date(jan4);
   monday.setUTCDate(jan4.getUTCDate()-day+1+(week-1)*7);
   return `${monday.getUTCFullYear()}-${String(monday.getUTCMonth()+1).padStart(2,'0')}-${String(monday.getUTCDate()).padStart(2,'0')}`;
 };

 const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
 let editingNoticeId=null;
 $('dateArmazenistasInput').value=today();$('dateEmpilhadoresInput').value=isoWeekValue();

 function setAuth(on){$('loginPanel').classList.toggle('hidden',on);$('adminContent').classList.toggle('hidden',!on);$('logoutBtn').classList.toggle('hidden',!on)}
 document.querySelectorAll('.admin-tab').forEach(b=>b.onclick=()=>{document.querySelectorAll('.admin-tab').forEach(x=>x.classList.remove('active'));document.querySelectorAll('.tab-panel').forEach(x=>x.classList.add('hidden'));b.classList.add('active');$(`panel-${b.dataset.tab}`).classList.remove('hidden')});
 $('loginForm').onsubmit=async e=>{e.preventDefault();if(!configured){$('loginMessage').textContent='Configure js/config.js primeiro.';return}const{error}=await supa.auth.signInWithPassword({email:$('email').value,password:$('password').value});if(error){$('loginMessage').textContent=error.message;return}setAuth(true);initialLoad()};
 $('logoutBtn').onclick=async()=>{await supa.auth.signOut();setAuth(false)};

 async function uploadImage(file,prefix){
   if(!file)return null;
   const ext=(file.name.split('.').pop()||'jpg').replace(/[^a-z0-9]/gi,'');
   const path=`${prefix}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
   const{error}=await supa.storage.from('panel-media').upload(path,file,{upsert:false});
   if(error)throw error;
   return supa.storage.from('panel-media').getPublicUrl(path).data.publicUrl
 }

 async function loadNotices(){
   const{data}=await supa.from('notices').select('*').order('priority',{ascending:false}).order('id');
   $('noticeList').innerHTML=(data||[]).map(n=>`
      <div class="list-row">
        <div>
          <strong>${esc(n.title)}</strong>
          <small>${esc(n.notice_type)} • prioridade ${n.priority} • ${n.active?'ativo':'inativo'}</small>
        </div>
        <div class="list-actions">
          <button type="button" class="btn btn-secondary notice-edit-btn" data-notice="${n.id}">Editar</button>
          <button type="button" class="btn btn-danger notice-delete-btn" data-delete-notice="${n.id}" data-delete-title="${esc(n.title)}">Excluir</button>
        </div>
      </div>`).join('');

   document.querySelectorAll('[data-notice]').forEach(b=>b.onclick=()=>{
     const n=data.find(x=>x.id==b.dataset.notice);
     editingNoticeId=n.id;
     $('noticeTypeInput').value=n.notice_type;
     $('noticeTitleInput').value=n.title;
     $('noticeMessageInput').value=n.message;
     $('noticeAuthorInput').value=n.author;
     $('noticePriorityInput').value=n.priority;
     $('noticeActiveInput').checked=n.active;
   });

   document.querySelectorAll('[data-delete-notice]').forEach(b=>b.onclick=async()=>{
     const title=b.dataset.deleteTitle||'este aviso';
     if(!confirm(`Excluir o aviso "${title}"?\n\nEle será removido da lista e da TV.`)) return;

     const {error}=await supa
       .from('notices')
       .delete()
       .eq('id',Number(b.dataset.deleteNotice));

     if(error){
       alert('Não foi possível excluir o aviso: '+error.message);
       return;
     }

     if(editingNoticeId===Number(b.dataset.deleteNotice)){
       editingNoticeId=null;
     }

     await loadNotices();
   })
 }
 $('newNoticeBtn').onclick=()=>{editingNoticeId=null;$('noticeTypeInput').value='AVISO';$('noticeTitleInput').value='';$('noticeMessageInput').value='';$('noticeAuthorInput').value='CD T3';$('noticePriorityInput').value=10;$('noticeActiveInput').checked=true};
 $('saveNoticeBtn').onclick=async()=>{try{$('noticeStatus').textContent='Salvando...';const{data:{user}}=await supa.auth.getUser();const file=$('noticeImageInput').files[0];const image=file?await uploadImage(file,'notices'):undefined;const payload={notice_type:$('noticeTypeInput').value,title:$('noticeTitleInput').value.trim(),message:$('noticeMessageInput').value.trim(),author:$('noticeAuthorInput').value.trim(),priority:Number($('noticePriorityInput').value)||10,active:$('noticeActiveInput').checked,updated_by:user?.id||null,updated_at:new Date().toISOString()};if(image)payload.image_url=image;if(editingNoticeId)payload.id=editingNoticeId;const{error}=await supa.from('notices').upsert(payload);if(error)throw error;$('noticeStatus').textContent='Salvo ✓';editingNoticeId=null;loadNotices()}catch(e){$('noticeStatus').textContent='Erro: '+e.message}};

 async function loadProduction(category,dateOverride){
   const cap=category==='armazenistas'?'Armazenistas':'Empilhadores',rawDate=dateOverride||$(`date${cap}Input`).value,date=category==='empilhadores'?weekToMonday(rawDate):rawDate;
   const[{data:employees},{data:prod},{data:goal}]=await Promise.all([supa.from('employees').select('id,name,active').eq('category',category).order('sort_order'),supa.from('production').select('employee_id,quantity').eq('category',category).eq('production_date',date),supa.from('settings').select('value').eq('key',`goal_${category}`).maybeSingle()]);
   $(`goal${cap}Input`).value=Number(goal?.value||150);const map=new Map((prod||[]).map(x=>[x.employee_id,x.quantity]));const grid=$(`grid${cap}`);grid.innerHTML='';
   (employees||[]).filter(e=>e.active).forEach((e,i)=>{const card=document.createElement('label');card.className='employee-card';card.dataset.id=e.id;card.innerHTML=`<span class="num">${String(i+1).padStart(2,'0')}</span><span class="emp-name"><strong>${esc(e.name)}</strong><small>${category==='armazenistas'?'Caixas produzidas':'Movimentações realizadas'}</small></span><input type="number" min="0" step="1" value="${Number(map.get(e.id)||0)}">`;
      const qtyInput=card.querySelector('input');
      qtyInput.addEventListener('focus',()=>qtyInput.select());
      qtyInput.addEventListener('click',()=>qtyInput.select());
      qtyInput.addEventListener('keydown',e=>{
        if((e.key>='0'&&e.key<='9') && qtyInput.selectionStart===qtyInput.selectionEnd){
          qtyInput.select();
        }
      });
      grid.appendChild(card)});
   const teamMembers=$(`teamMembers${cap}`);
   if(teamMembers){
     teamMembers.innerHTML=(employees||[]).map(e=>`<div class="team-member"><strong>${esc(e.name)}</strong><div class="team-member-actions"><span class="save-status">${e.active?'Ativo':'Oculto'}</span><button type="button" class="delete-employee" data-delete-employee="${e.id}" data-delete-category="${category}" data-delete-name="${esc(e.name)}">Excluir</button></div></div>`).join('');
     teamMembers.querySelectorAll('[data-delete-employee]').forEach(btn=>btn.onclick=async()=>{
       const name=btn.dataset.deleteName||'este funcionário';
       if(!confirm(`Excluir ${name}?\n\nO cadastro e o histórico ligado a ele serão removidos.`)) return;
       const status=$(`teamStatus${cap}`);
       status.textContent='Excluindo...';
       const {error}=await supa.from('employees').delete().eq('id',Number(btn.dataset.deleteEmployee));
       if(error){
         status.textContent='Erro ao excluir';
         alert('Não foi possível excluir: '+error.message);
         return;
       }
       status.textContent='Excluído ✓';
       await loadProduction(category);
     });
   }

   const visibility=$(`visibility${cap}`);
   if(visibility){
     visibility.innerHTML=(employees||[]).map(e=>`<label class="visibility-item"><span><strong>${esc(e.name)}</strong><small>${e.active?'Visível no ranking':'Oculto do ranking'}</small></span><input type="checkbox" data-employee-active="${e.id}" ${e.active?'checked':''}></label>`).join('');
     visibility.querySelectorAll('[data-employee-active]').forEach(ch=>ch.onchange=async()=>{
       const active=ch.checked;
       const {error}=await supa.from('employees').update({active}).eq('id',Number(ch.dataset.employeeActive));
       if(error){alert('Não foi possível alterar: '+error.message);ch.checked=!active;return}
       await loadProduction(category);
     });
   }
   $(`status${cap}`).textContent='Dados carregados'
 }
 async function saveProduction(category){
   const cap=category==='armazenistas'?'Armazenistas':'Empilhadores',rawDate=$(`date${cap}Input`).value,date=category==='empilhadores'?weekToMonday(rawDate):rawDate,goal=Math.max(1,Number($(`goal${cap}Input`).value)||1),cards=[...$(`grid${cap}`).querySelectorAll('.employee-card')];$(`status${cap}`).textContent='Salvando...';const{data:{user}}=await supa.auth.getUser();
   const anomalyLimit=Number((await supa.from('settings').select('value').eq('key','anomaly_limit').maybeSingle()).data?.value||5000);
   const abnormal=cards.map(c=>({name:c.querySelector('strong').textContent,qty:Math.max(0,Number(c.querySelector('input').value)||0)})).filter(x=>x.qty>anomalyLimit);
   if(abnormal.length){
     const text=abnormal.map(x=>`${x.name}: ${x.qty.toLocaleString('pt-BR')}`).join('\n');
     if(!confirm(`Os valores abaixo estão acima do limite de alerta (${anomalyLimit.toLocaleString('pt-BR')}):\n\n${text}\n\nDeseja salvar mesmo assim?`)){
       $(`status${cap}`).textContent='Salvamento cancelado';
       return;
     }
   }
   const payload=cards.map(c=>({production_date:date,category,employee_id:Number(c.dataset.id),quantity:Math.max(0,Number(c.querySelector('input').value)||0),updated_by:user?.id||null,updated_at:new Date().toISOString()}));
   const[{error:e1},{error:e2}]=await Promise.all([supa.from('production').upsert(payload,{onConflict:'production_date,category,employee_id'}),supa.from('settings').upsert({key:`goal_${category}`,value:String(goal)},{onConflict:'key'})]);$(`status${cap}`).textContent=e1||e2?'Erro ao salvar':'Salvo ✓'
 }
 async function copyYesterday(category){
   const cap=category==='armazenistas'?'Armazenistas':'Empilhadores',rawDate=$(`date${cap}Input`).value,date=category==='empilhadores'?weekToMonday(rawDate):rawDate;const{data}=await supa.from('production').select('production_date').eq('category',category).lt('production_date',date).order('production_date',{ascending:false}).limit(1);if(!data?.[0])return alert('Não encontrei produção anterior.');const prev=data[0].production_date;const{data:rows}=await supa.from('production').select('employee_id,quantity').eq('category',category).eq('production_date',prev);const map=new Map((rows||[]).map(r=>[r.employee_id,r.quantity]));[...$(`grid${cap}`).querySelectorAll('.employee-card')].forEach(c=>c.querySelector('input').value=map.get(Number(c.dataset.id))||0)
 }
 function newDay(category){const cap=category==='armazenistas'?'Armazenistas':'Empilhadores';$(`date${cap}Input`).value=category==='empilhadores'?isoWeekValue():today();[...$(`grid${cap}`).querySelectorAll('.employee-card')].forEach(c=>c.querySelector('input').value=0);$(`status${cap}`).textContent='Novo dia preparado (ainda não salvo)'}
 document.querySelectorAll('[data-load]').forEach(b=>b.onclick=()=>loadProduction(b.dataset.load));
 document.querySelectorAll('[data-save]').forEach(b=>b.onclick=()=>saveProduction(b.dataset.save));
 document.querySelectorAll('[data-copy]').forEach(b=>b.onclick=()=>copyYesterday(b.dataset.copy));
 document.querySelectorAll('[data-newday]').forEach(b=>b.onclick=()=>newDay(b.dataset.newday));
 ['Armazenistas','Empilhadores'].forEach(cap=>{$(`search${cap}`).oninput=e=>{const q=e.target.value.toLowerCase();[...$(`grid${cap}`).children].forEach(c=>c.style.display=c.querySelector('strong').textContent.toLowerCase().includes(q)?'grid':'none')}});

 document.querySelectorAll('[data-upload]').forEach(b=>b.onclick=async()=>{const category=b.dataset.upload,cap=category==='armazenistas'?'Armazenistas':'Empilhadores',file=$(`image${cap}`).files[0];if(!file)return alert('Escolha uma imagem.');try{b.textContent='Enviando...';const url=await uploadImage(file,`production/${category}`);const{error}=await supa.from('settings').upsert({key:`image_${category}`,value:url},{onConflict:'key'});if(error)throw error;b.textContent='Imagem enviada ✓';setTimeout(()=>b.textContent='Enviar imagem',1800)}catch(e){alert(e.message);b.textContent='Enviar imagem'}});

 async function loadPages(){
   const{data}=await supa.from('extra_pages').select('*').order('sort_order').order('id');
   $('pagesList').innerHTML=(data||[]).map(p=>`<div class="list-row"><div><strong>${esc(p.title)}</strong><small>${p.active?'Ativa':'Oculta'} • tema ${esc(p.theme)}</small></div><button class="mini-danger" data-delete-page="${p.id}">Excluir</button></div>`).join('');
   document.querySelectorAll('[data-delete-page]').forEach(b=>b.onclick=async()=>{if(!confirm('Excluir esta página?'))return;await supa.from('extra_pages').delete().eq('id',b.dataset.deletePage);loadPages()})
 }
 $('savePageBtn').onclick=async()=>{try{$('pageStatus').textContent='Salvando...';let image=null;const file=$('pageImage').files[0];if(file)image=await uploadImage(file,'extra-pages');const{data:max}=await supa.from('extra_pages').select('sort_order').order('sort_order',{ascending:false}).limit(1);const payload={title:$('pageTitle').value.trim(),subtitle:$('pageSubtitle').value.trim(),message:$('pageMessage').value.trim(),theme:$('pageTheme').value,active:$('pageActive').checked,sort_order:Number(max?.[0]?.sort_order||0)+1,image_url:image};const{error}=await supa.from('extra_pages').insert(payload);if(error)throw error;$('pageStatus').textContent='Página adicionada ✓';$('pageTitle').value='';$('pageSubtitle').value='';$('pageMessage').value='';$('pageImage').value='';loadPages()}catch(e){$('pageStatus').textContent='Erro: '+e.message}};

 async function loadSettings(){
   const{data}=await supa.from('settings').select('key,value').in('key',['slide_seconds','yellow_threshold','shift_name','anomaly_limit','presentation_paused','forced_slide']);const map=Object.fromEntries((data||[]).map(x=>[x.key,x.value]));$('slideSeconds').value=map.slide_seconds||'10';$('yellowThreshold').value=map.yellow_threshold||'80';$('shiftName').value=map.shift_name||'3º Turno';$('anomalyLimit').value=map.anomaly_limit||'5000';$('presentationPaused').value=map.presentation_paused||'false';$('forcedSlide').value=map.forced_slide||'aviso'
 }
 $('saveSettingsBtn').onclick=async()=>{const rows=[{key:'slide_seconds',value:String($('slideSeconds').value)},{key:'yellow_threshold',value:String($('yellowThreshold').value)},{key:'shift_name',value:String($('shiftName').value||'3º Turno')},{key:'anomaly_limit',value:String($('anomalyLimit').value||'5000')},{key:'presentation_paused',value:String($('presentationPaused').value||'false')},{key:'forced_slide',value:String($('forcedSlide').value||'aviso')}];const{error}=await supa.from('settings').upsert(rows,{onConflict:'key'});$('panelStatus').textContent=error?'Erro ao salvar':'Salvo ✓'};


 // Criação de novas contas sem trocar a sessão atual do ADM.
 const accountClient = configured ? window.supabase.createClient(
   cfg.SUPABASE_URL,
   cfg.SUPABASE_ANON_KEY,
   {
     auth: {
       persistSession: false,
       autoRefreshToken: false,
       detectSessionInUrl: false
     }
   }
 ) : null;

 $('accountForm').onsubmit = async e => {
   e.preventDefault();
   const status = $('accountStatus');
   const name = $('accountName').value.trim();
   const email = $('accountEmail').value.trim();
   const password = $('accountPassword').value;
   const confirm = $('accountPasswordConfirm').value;

   if (!name || !email || !password) {
     status.textContent = 'Preencha todos os campos';
     return;
   }
   if (password.length < 6) {
     status.textContent = 'A senha precisa ter ao menos 6 caracteres';
     return;
   }
   if (password !== confirm) {
     status.textContent = 'As senhas não conferem';
     return;
   }

   try {
     status.textContent = 'Criando conta...';
     const { data, error } = await accountClient.auth.signUp({
       email,
       password,
       options: {
         data: {
           display_name: name,
           role: 'encarregado'
         }
       }
     });
     if (error) throw error;

     status.textContent = data?.user ? 'Conta criada ✓' : 'Solicitação enviada ✓';
     $('accountForm').reset();

     setTimeout(() => {
       status.textContent = 'Pronto';
     }, 3000);
   } catch (err) {
     status.textContent = 'Erro: ' + (err.message || 'não foi possível criar');
   }
 };


 async function addEmployee(category){
   const cap=category==='armazenistas'?'Armazenistas':'Empilhadores';
   const input=category==='armazenistas'?$('newArmazenistaName'):$('newEmpilhadorName');
   const name=input.value.trim();
   const status=$(`teamStatus${cap}`);

   if(!name){
     status.textContent='Digite um nome';
     input.focus();
     return;
   }

   status.textContent='Adicionando...';

   const {data:maxRows,error:maxError}=await supa
     .from('employees')
     .select('sort_order')
     .eq('category',category)
     .order('sort_order',{ascending:false})
     .limit(1);

   if(maxError){
     status.textContent='Erro';
     alert(maxError.message);
     return;
   }

   const nextOrder=Number(maxRows?.[0]?.sort_order||0)+1;
   const {error}=await supa.from('employees').insert({
     category,
     name,
     active:true,
     sort_order:nextOrder
   });

   if(error){
     status.textContent='Erro ao adicionar';
     alert(error.code==='23505'?'Esse nome já está cadastrado nessa equipe.':error.message);
     return;
   }

   input.value='';
   status.textContent='Adicionado ✓';
   await loadProduction(category);
 }

 document.querySelectorAll('[data-add-employee]').forEach(btn=>{
   btn.onclick=()=>addEmployee(btn.dataset.addEmployee);
 });

 async function initialLoad(){await Promise.all([loadNotices(),loadProduction('armazenistas'),loadProduction('empilhadores'),loadPages(),loadSettings()])}
 (async()=>{if(!configured){setAuth(false);$('loginMessage').textContent='Falha ao carregar a configuração do banco. Atualize a página.';return}const{data:{session}}=await supa.auth.getSession();if(session){setAuth(true);initialLoad()}else setAuth(false)})()
})();