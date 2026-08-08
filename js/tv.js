(() => {
  const cfg=window.APP_CONFIG;
  const configured=Boolean(cfg.SUPABASE_URL && cfg.SUPABASE_URL.startsWith('https://') && cfg.SUPABASE_ANON_KEY && cfg.SUPABASE_ANON_KEY.startsWith('sb_publishable_'));
  const supa=configured?window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY):null;
  const $=id=>document.getElementById(id);

  // Atalho secreto para abrir a área administrativa:
  // Ctrl + Shift + A
  document.addEventListener('keydown', (event) => {
    if (
      event.ctrlKey &&
      event.shiftKey &&
      !event.altKey &&
      event.key.toLowerCase() === 'a'
    ) {
      event.preventDefault();
      window.open('admin.html', '_blank', 'noopener');
    }
  });


  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  let slides=[],currentIndex=0,tick=0,slideSeconds=10,yellowThreshold=80,presentationPaused=false,forcedSlide='aviso',lastGoodSync=null;
  let latestData={armazenistas:null,empilhadores:null};

  const todayISO=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
  const brDate=(iso,full=false)=>{if(!iso)return'--/--';const[y,m,d]=iso.split('-');return full?`${d}/${m}/${y}`:`${d}/${m}`};
  const fmtTime=x=>x?new Date(x).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}):'--:--';

  function clock(){const d=new Date();$('clockAviso').textContent=d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});$('dateAviso').textContent=d.toLocaleDateString('pt-BR')}
  setInterval(clock,1000);clock();

  async function settings(){
    if(!supa)return;
    const {data}=await supa.from('settings').select('key,value');
    const map=Object.fromEntries((data||[]).map(x=>[x.key,x.value]));
    slideSeconds=Number(map.slide_seconds||10);
    yellowThreshold=Number(map.yellow_threshold||80);
    presentationPaused=String(map.presentation_paused||'false')==='true';
    forcedSlide=map.forced_slide||'aviso';
    $('shiftLabel').textContent=map.shift_name||'3º Turno';
    $('pausedPill').classList.toggle('hidden',!presentationPaused);
    if(map.image_armazenistas)$('photoArmazenistas').style.backgroundImage=`linear-gradient(135deg,rgba(6,16,11,.15),rgba(6,16,11,.78)),url("${map.image_armazenistas}")`;
    if(map.image_empilhadores)$('photoEmpilhadores').style.backgroundImage=`linear-gradient(135deg,rgba(3,14,28,.15),rgba(4,13,25,.8)),url("${map.image_empilhadores}")`;
  }

  async function loadNotices(){
    if(!supa)return;
    const {data}=await supa.from('notices').select('*').eq('active',true).order('priority',{ascending:false}).order('updated_at',{ascending:false});
    const n=data?.[0];
    if(!n)return;
    $('noticeType').textContent=n.notice_type||'AVISO';
    $('noticeTitle').textContent=n.title||'Avisos';
    $('noticeMessage').textContent=n.message||'';
    $('noticeAuthor').textContent=n.author||'CD T3';
    $('noticeUpdated').textContent='Atualizado '+fmtTime(n.updated_at);
    if(n.image_url){$('noticeImage').src=n.image_url;$('noticeImage').classList.remove('hidden');$('noticeMediaWrap').classList.remove('hidden')}else{$('noticeMediaWrap').classList.add('hidden')}
  }

  async function latestDate(category){
    const {data}=await supa.from('production').select('production_date').eq('category',category).order('production_date',{ascending:false}).limit(1);
    return data?.[0]?.production_date||todayISO()
  }

  async function previousDate(category,current){
    const {data}=await supa.from('production').select('production_date').eq('category',category).lt('production_date',current).order('production_date',{ascending:false}).limit(1);
    return data?.[0]?.production_date||null
  }

  async function loadRanking(category){
    if(!supa)return;
    const cap=category==='armazenistas'?'Armazenistas':'Empilhadores';
    const isArm=category==='armazenistas';
    const date=await latestDate(category);
    const prev=await previousDate(category,date);
    const [{data:goalRow},{data:rows},{data:prevRows}]=await Promise.all([
      supa.from('settings').select('value').eq('key',`goal_${category}`).maybeSingle(),
      supa.from('production_view').select('*').eq('category',category).eq('production_date',date),
      prev?supa.from('production_view').select('*').eq('category',category).eq('production_date',prev):Promise.resolve({data:[]})
    ]);
    const goal=Number(goalRow?.value||150);
    const prevMap=new Map((prevRows||[]).map(r=>[r.employee_id,Number(r.quantity||0)]));
    const sorted=[...(rows||[])].sort((a,b)=>Number(b.quantity)-Number(a.quantity));
    const total=sorted.reduce((s,r)=>s+Number(r.quantity||0),0);
    const hit=sorted.filter(r=>Number(r.quantity)>=goal).length;
    const max=Math.max(goal,...sorted.map(r=>Number(r.quantity||0)),1);
    $(`date${cap}`).textContent=isArm?brDate(date):'';$(`goal${cap}`).textContent=goal.toLocaleString('pt-BR');$(`total${cap}`).textContent=total.toLocaleString('pt-BR');$(`hit${cap}`).textContent=hit;
    const last=sorted.reduce((a,r)=>!r.updated_at?a:(!a||r.updated_at>a?r.updated_at:a),null);$(`updated${cap}`).textContent=fmtTime(last);
    const unit=isArm?'Cxs':'Mov.';
    const list=$(`ranking${cap}`);
    list.innerHTML='';

    const totalPeople=sorted.length;
    const perColumn=Math.max(1,Math.ceil(totalPeople/2));
    const useOneColumn=totalPeople<=6;

    list.classList.toggle('one-column',useOneColumn);
    list.classList.toggle('dense',perColumn>=7);
    list.style.setProperty('--rows-per-column',String(useOneColumn?totalPeople:perColumn));

    const left=document.createElement('div');
    left.className='ranking-column';
    left.style.setProperty('--rows-per-column',String(useOneColumn?totalPeople:perColumn));

    const right=document.createElement('div');
    right.className='ranking-column';
    right.style.setProperty('--rows-per-column',String(Math.max(1,totalPeople-perColumn)));

    sorted.forEach((r,i)=>{
      const qty=Number(r.quantity||0),pct=goal?(qty/goal)*100:0,width=Math.max(2,Math.min(100,(qty/max)*100));
      const prevQty=prevMap.get(r.employee_id);
      let deltaText='Novo';
      if(prevQty!==undefined && prevQty>0){
        const delta=((qty-prevQty)/prevQty)*100;
        deltaText=`${delta>=0?'▲':'▼'} ${Math.abs(delta).toLocaleString('pt-BR',{maximumFractionDigits:0})}% vs ontem`;
      }
      const tone=pct>=100?'ok':pct>=yellowThreshold?'warn':'low';
      const row=document.createElement('div');
      row.className=`rank-row ${tone} ${i<3?`top-${i+1}`:''}`;
      row.style.setProperty('--bar',`${width}%`);
      row.innerHTML=`<div class="rank-pos">${i===0?'🥇':i===1?'🥈':i===2?'🥉':i+1}</div><div class="person"><strong>${esc(r.employee_name)}</strong><small>${deltaText}</small></div><div class="bar-track"><div class="bar-fill"></div></div><div class="amount-box"><div class="qty">${qty.toLocaleString('pt-BR')} <span>${unit}</span></div><div class="percent ${tone}">${pct.toLocaleString('pt-BR',{maximumFractionDigits:1})}%</div></div>`;

      if(useOneColumn || i<perColumn) left.appendChild(row);
      else right.appendChild(row);
    });

    list.appendChild(left);
    if(!useOneColumn && right.children.length) list.appendChild(right);
    latestData[category]={date,goal,total,hit,rows:sorted,prevMap,unit};
    renderSummary()
  }

  function renderSummary(){
    const a=latestData.armazenistas,e=latestData.empilhadores;if(!a||!e)return;
    const bestA=a.rows[0],bestE=e.rows[0];
    $('dateResumo').textContent=brDate(a.date);
    $('bestArmName').textContent=bestA?.employee_name||'—';$('bestArmValue').textContent=`${Number(bestA?.quantity||0).toLocaleString('pt-BR')} Cxs`;
    $('bestEmpName').textContent=bestE?.employee_name||'—';$('bestEmpValue').textContent=`${Number(bestE?.quantity||0).toLocaleString('pt-BR')} Mov.`;
    const comp=(best,map)=>{if(!best)return'Sem dados';const prev=map.get(best.employee_id);if(prev===undefined||prev===0)return'Sem comparação anterior';const d=((Number(best.quantity)-prev)/prev)*100;return `${d>=0?'▲':'▼'} ${Math.abs(d).toLocaleString('pt-BR',{maximumFractionDigits:0})}% vs último dia`};
    $('bestArmCompare').textContent=comp(bestA,a.prevMap);$('bestEmpCompare').textContent=comp(bestE,e.prevMap);
    $('summaryTotal').textContent=(a.total+e.total).toLocaleString('pt-BR');$('summaryHits').textContent=a.hit+e.hit
  }

  async function loadExtraPages(){
    if(!supa)return;
    const {data}=await supa.from('extra_pages').select('*').eq('active',true).order('sort_order').order('id');
    const host=$('extraSlidesHost');host.innerHTML='';
    (data||[]).forEach((p,i)=>{
      const sec=document.createElement('section');sec.className='tv-slide extra-slide';sec.dataset.kind='extra';sec.dataset.key=`extra-${p.id}`;
      sec.innerHTML=`<header class="slide-top ${p.theme==='blue'?'blue-header':p.theme==='orange'?'orange-header':p.theme==='dark'?'dark-header':'green-header'}"><div><span class="eyebrow dark">PÁGINA ESPECIAL</span><h1>${esc(p.title)}</h1></div></header><div class="extra-stage ${p.theme||'green'}">${p.image_url?`<div class="extra-image" style="background-image:url('${p.image_url.replace(/'/g,"%27")}')"></div>`:''}<div class="extra-copy"><span>${esc(p.subtitle||'')}</span><h2>${esc(p.title)}</h2><p>${esc(p.message||'')}</p></div></div><footer class="slide-footer"><div class="brand-circle">selene</div><span>Página especial</span><div class="slide-progress"><i class="progress-bar"></i></div><span class="slide-counter"></span></footer>`;
      host.appendChild(sec)
    });
    rebuildSlides()
  }

  function rebuildSlides(){
    slides=[...document.querySelectorAll('.tv-slide')];
    slides.forEach((s,i)=>{const c=s.querySelector('.slide-counter');if(c)c.textContent=`${i+1}/${slides.length}`});
    if(!slides[currentIndex])currentIndex=0
  }

  function activateSlide(i){
    rebuildSlides();slides.forEach(s=>s.classList.remove('active'));currentIndex=(i+slides.length)%slides.length;slides[currentIndex].classList.add('active');tick=0;updateProgress()
  }
  function updateProgress(){slides.forEach(s=>{const b=s.querySelector('.progress-bar');if(b)b.style.width='0%'});const b=slides[currentIndex]?.querySelector('.progress-bar');if(b)b.style.width=`${Math.min(100,(tick/slideSeconds)*100)}%`}

  function setConnection(ok){
    const pill=$('connectionPill');
    $('connectionText').textContent=ok?'Online':'Sem conexão';
    pill.classList.toggle('offline',!ok);
    if(ok){
      lastGoodSync=new Date();
      $('syncLabel').textContent='Última sincronização: '+lastGoodSync.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
    }
  }

  async function loadAll(){
    if(!supa)return;
    try{
      await settings();
      await Promise.all([loadNotices(),loadRanking('armazenistas'),loadRanking('empilhadores'),loadExtraPages()]);
      setConnection(true);
      if(presentationPaused){
        rebuildSlides();
        const idx=slides.findIndex(s=>s.dataset.key===forcedSlide);
        if(idx>=0 && currentIndex!==idx) activateSlide(idx);
      }
    }catch(e){
      console.error(e);
      setConnection(false);
    }
  }

  rebuildSlides();
  if(configured){
    loadAll();
    supa.channel('tv-live')
      .on('postgres_changes',{event:'*',schema:'public',table:'production'},loadAll)
      .on('postgres_changes',{event:'*',schema:'public',table:'settings'},loadAll)
      .on('postgres_changes',{event:'*',schema:'public',table:'notices'},loadAll)
      .on('postgres_changes',{event:'*',schema:'public',table:'extra_pages'},loadAll)
      .subscribe();
    setInterval(loadAll,Number(cfg.REFRESH_SECONDS||5)*1000)
  }else{setConnection(false);$('noticeTitle').textContent='Falha na conexão';$('noticeMessage').textContent='Não foi possível iniciar a conexão com o banco. Atualize a página ou verifique a internet.'}

  setInterval(()=>{
    if(presentationPaused){
      tick=0;
      updateProgress();
      rebuildSlides();
      const idx=slides.findIndex(s=>s.dataset.key===forcedSlide);
      if(idx>=0 && currentIndex!==idx) activateSlide(idx);
      return;
    }
    tick++;
    updateProgress();
    if(tick>=slideSeconds) activateSlide(currentIndex+1);
  },1000)
})();