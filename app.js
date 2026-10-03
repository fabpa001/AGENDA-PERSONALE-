const SUPABASE_URL='https://cbftclazvhaaatorhvbt.supabase.co';
const SUPABASE_KEY='sb_publishable__w5Sx3YaFuMwZKy7fINegQ_iROassGS';
const sb=supabase.createClient(SUPABASE_URL,SUPABASE_KEY);

const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
let people=[], motivations=[], events=[], exceptions=[], closures=[];
let monthCursor=monthStart(todayISO()), selectedDay=todayISO();

function pad(n){return String(n).padStart(2,'0')}
function todayISO(){const d=new Date();return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())}
function parts(s){const [y,m,d]=s.split('-').map(Number);return {y,m,d}}
function utcDate(s){const p=parts(s);return new Date(Date.UTC(p.y,p.m-1,p.d))}
function isoUTC(d){return d.getUTCFullYear()+'-'+pad(d.getUTCMonth()+1)+'-'+pad(d.getUTCDate())}
function addDays(s,n){const d=utcDate(s);d.setUTCDate(d.getUTCDate()+n);return isoUTC(d)}
function monthStart(s){return s.slice(0,7)+'-01'}
function addMonths(s,n){const p=parts(s);return isoUTC(new Date(Date.UTC(p.y,p.m-1+n,1)))}
function endMonth(s){const p=parts(s);return isoUTC(new Date(Date.UTC(p.y,p.m,0)))}
function fmtDate(s,opt={weekday:'long',day:'numeric',month:'long'}){return utcDate(s).toLocaleDateString('it-IT',{...opt,timeZone:'UTC'})}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function toast(t){const e=$('#toast');e.textContent=t;e.classList.add('show');setTimeout(()=>e.classList.remove('show'),2200)}
function person(id){return people.find(p=>p.id===id)}
function motivation(e){if(e.custom_motivation)return e.custom_motivation;return motivations.find(m=>m.id===e.motivation_id)?.name||'Impegno'}
function timeLabel(e){return e.all_day?'Tutto il giorno':(e.start_time?.slice(0,5)+'–'+e.end_time?.slice(0,5))}
function repeatLabel(e){return e.recurrence_type==='weekly'?'↻ Ogni settimana':e.recurrence_type==='yearly'?'↻ Ogni anno':''}

function easterSunday(year){const a=year%19,b=Math.floor(year/100),c=year%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),month=Math.floor((h+l-7*m+114)/31),day=((h+l-7*m+114)%31)+1;return year+'-'+pad(month)+'-'+pad(day)}
function isNationalHoliday(date){const p=parts(date),md=pad(p.m)+'-'+pad(p.d);const fixed=['01-01','01-06','04-25','05-01','06-02','08-15','11-01','12-08','12-25','12-26'];if(p.y>=2026)fixed.push('10-04');return fixed.includes(md)||date===addDays(easterSunday(p.y),1)}
function isSunday(date){return utcDate(date).getUTCDay()===0}
function closureFor(date){return closures.find(c=>date>=c.start_date&&date<=c.end_date)}
function isClosedRecurring(e,date){return e.recurrence_type!=='none'&&!!closureFor(date)}

async function init(){
  const {data:{session}}=await sb.auth.getSession();
  if(session)showApp(); else showAuth();
  sb.auth.onAuthStateChange((_e,s)=>{if(s)showApp();else showAuth()});
  if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
}
function showAuth(){$('#auth').classList.remove('hidden');$('#app').classList.add('hidden')}
async function showApp(){
  $('#auth').classList.add('hidden');$('#app').classList.remove('hidden');
  $('#todayDate').textContent=fmtDate(todayISO());
  setDefaultSearchDates();$('#eventDate').value=todayISO();
  await loadAll();go('todayView');
}
async function loadAll(){
  const [p,m,e,x,c]=await Promise.all([
    sb.from('people').select('*').order('sort_order').order('created_at'),
    sb.from('motivations').select('*').eq('active',true).order('sort_order').order('created_at'),
    sb.from('events').select('*').order('event_date'),
    sb.from('event_exceptions').select('*'),
    sb.from('closure_periods').select('*').order('start_date')
  ]);
  const err=p.error||m.error||e.error||x.error||c.error;if(err){toast('Errore: '+err.message);return}
  people=p.data||[];motivations=m.data||[];events=e.data||[];exceptions=x.data||[];closures=c.data||[];
  fillSelects();renderToday();renderCalendar();renderPeople();renderMotivations();renderClosures();renderSearch();
}
function fillSelects(){
  const po=people.length?people.map(p=>'<option value="'+p.id+'">'+esc(p.name)+'</option>').join(''):'<option value="">Prima aggiungi una persona</option>';
  $('#eventPerson').innerHTML=po;$('#searchPerson').innerHTML=po;
  $('#eventMotivation').innerHTML=motivations.map(m=>'<option value="'+m.id+'">'+esc(m.name)+'</option>').join('')+'<option value="custom">ALTRO</option>';
}
function occursOn(e,date){
  if(date<e.event_date)return false;
  if(e.recurrence_until&&date>e.recurrence_until)return false;
  if(exceptions.some(x=>x.event_id===e.id&&x.occurrence_date===date))return false;
  if(isClosedRecurring(e,date))return false;
  if(e.recurrence_type==='none')return date===e.event_date;
  if(e.recurrence_type==='weekly'){
    const diff=Math.round((utcDate(date)-utcDate(e.event_date))/86400000);
    return diff>=0&&diff%7===0;
  }
  if(e.recurrence_type==='yearly'){
    const a=parts(e.event_date),b=parts(date);return b.y>=a.y&&a.m===b.m&&a.d===b.d;
  }
  return false;
}
function occurrences(from,to,personId=null){
  const out=[];
  for(let d=from;d<=to;d=addDays(d,1)){
    for(const e of events){
      if(personId&&e.person_id!==personId)continue;
      if(occursOn(e,d))out.push({...e,occurrence_date:d});
    }
  }
  return out.sort((a,b)=>a.occurrence_date.localeCompare(b.occurrence_date)||(a.all_day?-1:b.all_day?1:(a.start_time||'').localeCompare(b.start_time||'')));
}
function eventCard(e){
  const p=person(e.person_id);const color=p?.color||'#888';
  return '<div class="eventCard" style="--person:'+esc(color)+'"><div class="eventTop"><div class="eventPerson">'+esc(p?.name||'Persona')+'</div><div class="eventTime">'+esc(timeLabel(e))+'</div></div><div class="eventTitle">'+esc(motivation(e))+'</div>'+(e.note?'<div class="eventNote">'+esc(e.note)+'</div>':'')+(repeatLabel(e)?'<div class="eventRepeat">'+repeatLabel(e)+'</div>':'')+'<div class="smallActions" style="margin-top:9px"><button class="smallBtn editEvent" data-id="'+e.id+'">Modifica</button><button class="smallBtn deleteEvent" data-id="'+e.id+'" data-date="'+e.occurrence_date+'">Elimina</button></div></div>';
}
function bindEventButtons(root=document){
  root.querySelectorAll('.editEvent').forEach(b=>b.addEventListener('click',()=>editEvent(b.dataset.id)));
  root.querySelectorAll('.deleteEvent').forEach(b=>b.addEventListener('click',()=>askDelete(b.dataset.id,b.dataset.date)));
}
function renderToday(){
  const list=occurrences(todayISO(),todayISO());
  $('#todayEvents').innerHTML=list.length?list.map(eventCard).join(''):'<div class="empty">Nessun impegno per oggi 🎉</div>';
  bindEventButtons($('#todayEvents'));
}
function renderCalendar(){
  const p=parts(monthCursor), first=utcDate(monthCursor), weekday=(first.getUTCDay()+6)%7;
  const start=addDays(monthCursor,-weekday), last=endMonth(monthCursor), end=addDays(last,6-((utcDate(last).getUTCDay()+6)%7));
  $('#monthLabel').textContent=fmtDate(monthCursor,{month:'long',year:'numeric'});
  const occ=occurrences(start,end), by={};occ.forEach(e=>(by[e.occurrence_date]??=[]).push(e));
  let html='';
  for(let d=start;d<=end;d=addDays(d,1)){
    const outside=d.slice(0,7)!==monthCursor.slice(0,7), isToday=d===todayISO(), sel=d===selectedDay, festive=isSunday(d)||isNationalHoliday(d);
    const dots=(by[d]||[]).map(e=>'<i class="dot" style="--dot:'+esc(person(e.person_id)?.color||'#888')+'"></i>').join('');
    html+='<button class="day '+(outside?'out ':'')+(isToday?'today ':'')+(sel?'selected ':'')+(festive?'festive':'')+'" data-date="'+d+'"><span class="dayNum">'+parts(d).d+'</span><span class="dots">'+dots+'</span></button>';
  }
  $('#calendarGrid').innerHTML=html;
  $$('#calendarGrid .day').forEach(b=>b.addEventListener('click',()=>{selectedDay=b.dataset.date;renderCalendar();renderDayDetail()}));
  renderDayDetail();
}
function renderDayDetail(){
  const list=occurrences(selectedDay,selectedDay);
  $('#dayDetail').innerHTML='<div class="sectionTitle">'+esc(fmtDate(selectedDay))+'</div>'+(list.length?list.map(eventCard).join(''):'<div class="empty">Nessun impegno.</div>');
  bindEventButtons($('#dayDetail'));
}
function setDefaultSearchDates(){const t=todayISO();$('#searchFrom').value=t;$('#searchTo').value=addDays(t,6)}
function renderSearch(){
  const pid=$('#searchPerson').value;if(!pid||!people.length){$('#searchResults').innerHTML='<div class="empty">Aggiungi prima una persona.</div>';$('#searchSummary').textContent='';return}
  const from=$('#searchFrom').value||todayISO(),to=$('#searchTo').value||addDays(todayISO(),6);
  if(to<from){toast('La data finale deve essere successiva');return}
  const list=occurrences(from,to,pid);const p=person(pid);
  $('#searchSummary').textContent=(p?.name||'')+' · '+fmtDate(from,{day:'numeric',month:'short'})+' – '+fmtDate(to,{day:'numeric',month:'short',year:'numeric'});
  let last='';let html='';
  list.forEach(e=>{if(e.occurrence_date!==last){last=e.occurrence_date;html+='<div class="groupDate">'+esc(fmtDate(last))+'</div>'}html+=eventCard(e)});
  $('#searchResults').innerHTML=html||'<div class="empty">Nessun impegno nel periodo scelto.</div>';bindEventButtons($('#searchResults'));
}
function renderPeople(){
  $('#peopleList').innerHTML=people.map(p=>'<div class="manageRow"><div class="personLabel"><i class="colorDot" style="--c:'+esc(p.color)+'"></i>'+esc(p.name)+'</div><div class="smallActions"><button class="smallBtn editPerson" type="button" data-id="'+p.id+'">Modifica</button><button class="smallBtn removePerson" type="button" data-id="'+p.id+'">Elimina</button></div></div>').join('')||'<div class="empty">Nessuna persona ancora.</div>';
}
function renderClosures(){
  $('#closuresList').innerHTML=closures.map(c=>'<div class="manageRow"><div><strong>'+esc(c.name)+'</strong><div class="hint closureDates">'+esc(fmtDate(c.start_date,{day:'numeric',month:'short',year:'numeric'}))+' – '+esc(fmtDate(c.end_date,{day:'numeric',month:'short',year:'numeric'}))+'</div></div><button class="smallBtn removeClosure" data-id="'+c.id+'">Elimina</button></div>').join('')||'<div class="empty">Nessun periodo di chiusura.</div>';

}
async function removeClosure(id){modal('Eliminare questo periodo di chiusura?','Le ricorrenze torneranno visibili nelle date interessate.',[{label:'Elimina',className:'danger',run:async()=>{const {error}=await sb.from('closure_periods').delete().eq('id',id);if(error)toast(error.message);else{toast('Chiusura eliminata');await loadAll()}}},{label:'Annulla'}])}
function renderMotivations(){
  $('#motivationsList').innerHTML=motivations.map(m=>'<div class="manageRow"><strong>'+esc(m.name)+'</strong><button class="smallBtn removeMotivation" data-id="'+m.id+'">Elimina</button></div>').join('')||'<div class="empty">Nessuna motivazione salvata.</div>';
  $$('.removeMotivation').forEach(b=>b.addEventListener('click',()=>removeMotivation(b.dataset.id)));
}
function go(id){
  $$('.view').forEach(v=>v.classList.toggle('active',v.id===id));$$('.navBtn').forEach(b=>b.classList.toggle('active',b.dataset.go===id));
  const titles={todayView:'Oggi',calendarView:'Calendario',searchView:'Impegni',newView:'Nuovo evento',manageView:'Gestisci'};
  $('#pageTitle').textContent=titles[id]||'Agenda';
  if(id==='todayView')renderToday();if(id==='calendarView')renderCalendar();if(id==='searchView')renderSearch();
  window.scrollTo({top:0,behavior:'smooth'});
}
function resetEventForm(){
  $('#eventForm').reset();$('#editEventId').value='';$('#eventDate').value=todayISO();$('#recurrence').value='none';$('#personColor').value='#e4572e';
  $('#customMotivationWrap').classList.add('hidden');$('#untilWrap').classList.add('hidden');$('#timeFields').classList.remove('hidden');$('#cancelEdit').classList.add('hidden');fillSelects();
}
function editEvent(id){
  const e=events.find(x=>x.id===id);if(!e)return;go('newView');
  $('#editEventId').value=e.id;$('#eventPerson').value=e.person_id;$('#eventDate').value=e.event_date;$('#allDay').checked=e.all_day;
  $('#startTime').value=e.start_time?.slice(0,5)||'';$('#endTime').value=e.end_time?.slice(0,5)||'';
  if(e.custom_motivation){$('#eventMotivation').value='custom';$('#customMotivation').value=e.custom_motivation;$('#customMotivationWrap').classList.remove('hidden')}else{$('#eventMotivation').value=e.motivation_id}
  $('#eventNote').value=e.note||'';$('#recurrence').value=e.recurrence_type;$('#recurrenceUntil').value=e.recurrence_until||'';
  $('#untilWrap').classList.toggle('hidden',e.recurrence_type==='none');$('#timeFields').classList.toggle('hidden',e.all_day);$('#cancelEdit').classList.remove('hidden');
}
function modal(title,body,actions){$('#modalTitle').textContent=title;$('#modalBody').innerHTML=body;$('#modalActions').innerHTML='';actions.forEach(a=>{const b=document.createElement('button');b.className=a.className||'secondary';b.textContent=a.label;b.addEventListener('click',async()=>{const shouldClose=a.run?await a.run():true;if(shouldClose!==false)closeModal()});$('#modalActions').appendChild(b)});$('#modal').classList.remove('hidden')}
function closeModal(){$('#modal').classList.add('hidden')}
function askDelete(id,date){
  const e=events.find(x=>x.id===id);if(!e)return;
  if(e.recurrence_type==='none')modal('Eliminare questo evento?','',[
    {label:'Elimina',className:'danger',run:()=>deleteWhole(id)},{label:'Annulla'}]);
  else modal('Evento ricorrente','Vuoi cancellare solo questa data o tutta la serie?',[
    {label:'Solo '+fmtDate(date,{day:'numeric',month:'long'}),run:()=>deleteOccurrence(id,date)},
    {label:'Tutta la serie',className:'danger',run:()=>deleteWhole(id)},{label:'Annulla'}]);
}
async function deleteOccurrence(id,date){const {error}=await sb.from('event_exceptions').insert({event_id:id,occurrence_date:date});if(error)toast(error.message);else{toast('Data cancellata');await loadAll()}}
async function deleteWhole(id){const {error}=await sb.from('events').delete().eq('id',id);if(error)toast(error.message);else{toast('Evento cancellato');await loadAll()}}
function editPerson(id){
  const p=person(id);if(!p)return;
  modal('Modifica persona','<label>Nome<input id="modalPersonName" maxlength="60" value="'+esc(p.name)+'"></label><label>Colore<select id="modalPersonColor"><option value="#e53935">Rosso</option><option value="#fb8c00">Arancione</option><option value="#fdd835">Giallo</option><option value="#43a047">Verde</option><option value="#1e88e5">Blu</option><option value="#8e24aa">Viola</option><option value="#ec407a">Rosa</option><option value="#6d4c41">Marrone</option><option value="#546e7a">Grigio</option></select></label>',[
    {label:'Salva',className:'primary',run:async()=>{const name=$('#modalPersonName').value.trim(),color=$('#modalPersonColor').value;if(!name){toast('Inserisci il nome');return false}const {error}=await sb.from('people').update({name,color}).eq('id',id);if(error){toast(error.message);return false}toast('Persona aggiornata');await loadAll();return true}},
    {label:'Annulla'}
  ]);
  const sel=$('#modalPersonColor');if(sel){const match=[...sel.options].find(o=>o.value.toLowerCase()===String(p.color).toLowerCase());if(match)sel.value=match.value}
}
async function removePerson(id){modal('Eliminare questa persona?','Se ha eventi associati, prima dovrai eliminare quegli eventi.',[{label:'Elimina',className:'danger',run:async()=>{const {error}=await sb.from('people').delete().eq('id',id);if(error)toast('Non posso eliminarla: ci sono eventi associati.');else{toast('Persona eliminata');await loadAll()}}},{label:'Annulla'}])}
async function removeMotivation(id){modal('Eliminare questa motivazione?','Gli eventi già salvati resteranno in agenda.',[{label:'Elimina',className:'danger',run:async()=>{const {error}=await sb.from('motivations').delete().eq('id',id);if(error)toast(error.message);else{toast('Motivazione eliminata');await loadAll()}}},{label:'Annulla'}])}

$('#loginForm').addEventListener('submit',async e=>{e.preventDefault();$('#authMsg').textContent='';const {error}=await sb.auth.signInWithPassword({email:$('#email').value.trim(),password:$('#password').value});if(error)$('#authMsg').textContent='Accesso non riuscito: '+error.message});
$('#firstAccess').addEventListener('click',async()=>{const email=$('#email').value.trim(),password=$('#password').value;if(!email||password.length<6){$('#authMsg').textContent='Inserisci email e una password di almeno 6 caratteri.';return}const {error}=await sb.auth.signUp({email,password});$('#authMsg').textContent=error?error.message:'Account creato. Se ricevi una email di conferma, aprila e poi torna qui per entrare.'});
$('#logout').addEventListener('click',()=>sb.auth.signOut());
$$('[data-go]').forEach(b=>b.addEventListener('click',()=>{if(b.dataset.go==='newView')resetEventForm();go(b.dataset.go)}));
$('#prevMonth').addEventListener('click',()=>{monthCursor=addMonths(monthCursor,-1);renderCalendar()});
$('#nextMonth').addEventListener('click',()=>{monthCursor=addMonths(monthCursor,1);renderCalendar()});
$('#searchBtn').addEventListener('click',renderSearch);$('#searchPerson').addEventListener('change',renderSearch);
$('#allDay').addEventListener('change',()=>$('#timeFields').classList.toggle('hidden',$('#allDay').checked));
$('#eventMotivation').addEventListener('change',()=>$('#customMotivationWrap').classList.toggle('hidden',$('#eventMotivation').value!=='custom'));
$('#recurrence').addEventListener('change',()=>$('#untilWrap').classList.toggle('hidden',$('#recurrence').value==='none'));
$('#cancelEdit').addEventListener('click',()=>{resetEventForm();go('todayView')});
$('#eventForm').addEventListener('submit',async e=>{
  e.preventDefault();if(!people.length){toast('Prima aggiungi una persona');return}
  const all=$('#allDay').checked,rec=$('#recurrence').value,mot=$('#eventMotivation').value;
  if(!all&&(!$('#startTime').value||!$('#endTime').value)){toast('Inserisci orario di inizio e fine');return}
  if(!all&&$('#endTime').value<=$('#startTime').value){toast('L’orario finale deve essere successivo');return}
  if(mot==='custom'&&!$('#customMotivation').value.trim()){toast('Scrivi la motivazione');return}
  const row={person_id:$('#eventPerson').value,event_date:$('#eventDate').value,all_day:all,start_time:all?null:$('#startTime').value,end_time:all?null:$('#endTime').value,motivation_id:mot==='custom'?null:mot,custom_motivation:mot==='custom'?$('#customMotivation').value.trim():null,note:$('#eventNote').value.trim()||null,recurrence_type:rec,recurrence_until:rec==='none'?null:($('#recurrenceUntil').value||null)};
  const id=$('#editEventId').value;const q=id?sb.from('events').update(row).eq('id',id):sb.from('events').insert(row);const {error}=await q;
  if(error)toast('Errore: '+error.message);else{toast(id?'Evento aggiornato':'Evento salvato');resetEventForm();await loadAll();go('todayView')}
});
$('#personForm').addEventListener('submit',async e=>{e.preventDefault();const {error}=await sb.from('people').insert({name:$('#personName').value.trim(),color:$('#personColor').value});if(error)toast(error.message);else{$('#personForm').reset();$('#personColor').value='#e4572e';toast('Persona aggiunta');await loadAll()}});
$('#closureForm').addEventListener('submit',async e=>{e.preventDefault();const start=$('#closureFrom').value,end=$('#closureTo').value;if(end<start){toast('La data finale deve essere successiva');return}const {error}=await sb.from('closure_periods').insert({name:$('#closureName').value.trim(),start_date:start,end_date:end});if(error)toast(error.message);else{$('#closureForm').reset();toast('Periodo di chiusura aggiunto');await loadAll()}});
$('#motivationForm').addEventListener('submit',async e=>{e.preventDefault();const {error}=await sb.from('motivations').insert({name:$('#motivationName').value.trim()});if(error)toast(error.message);else{$('#motivationForm').reset();toast('Motivazione aggiunta');await loadAll()}});
$$('.tab').forEach(b=>b.addEventListener('click',()=>{$$('.tab').forEach(x=>x.classList.toggle('active',x===b));$$('.pane').forEach(p=>p.classList.toggle('active',p.id===b.dataset.tab))}));
$('#peopleList').addEventListener('click',e=>{const edit=e.target.closest('.editPerson'),remove=e.target.closest('.removePerson');if(edit){e.preventDefault();editPerson(edit.dataset.id)}else if(remove){e.preventDefault();removePerson(remove.dataset.id)}});
$('#closuresList').addEventListener('click',e=>{const remove=e.target.closest('.removeClosure');if(remove){e.preventDefault();removeClosure(remove.dataset.id)}});
$('#modal').addEventListener('click',e=>{if(e.target===$('#modal'))closeModal()});
init();