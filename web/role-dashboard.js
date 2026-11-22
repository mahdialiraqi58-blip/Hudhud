/* Hudhud Level MAX — Role Dashboard UI
 * Safe UI shell. It never grants roles and never writes directly to RTDB.
 * Expects Firebase Auth compat and (optionally) HudhudClassrooms from Phase 2.
 */
(function(global){
 'use strict';
 const ROOT_ID='hudhud-role-root';
 const roleNames={admin:'المدير',teacher:'المعلم',student:'الطالب'};
 const navs={
  admin:[['overview','نظرة عامة'],['accounts','إدارة الحسابات'],['classes','إدارة الصفوف'],['content','المحتوى'],['settings','الإعدادات']],
  teacher:[['overview','لوحتي'],['classes','صفوفي'],['requests','طلبات الانضمام'],['content','محتوى الصف'],['progress','متابعة الطلاب']],
  student:[['overview','ملخصي'],['classes','صفوفي'],['lessons','الدروس'],['progress','تقدمي'],['achievements','إنجازاتي']]
 };
 const state={role:null,section:'overview',classes:[],requests:[],myRequests:[],busy:false,activeClassId:null};
 let mountPromise=null; let mountedUid=null;
 const $=s=>document.querySelector(s);
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function root(){return $('#'+ROOT_ID)}
 function setMessage(msg){const el=root()?.querySelector('[data-hr-message]');if(el)el.textContent=msg||''}
 function shell(){
  const r=root(); if(!r)return;
  const items=navs[state.role]||[];
  r.innerHTML=`<div class="hr-shell">
   <aside class="hr-side"><p class="hr-brand">هدهد <span style="color:var(--hr-accent)">MAX</span></p><p class="hr-sub">مساحة ${roleNames[state.role]}</p>
    <nav class="hr-nav" aria-label="التنقل بلوحة التحكم">${items.map(([id,label])=>`<button type="button" data-section="${id}" aria-current="${state.section===id?'page':'false'}">${label}</button>`).join('')}</nav>
   </aside>
   <main class="hr-content"><header class="hr-top"><div><h2 class="hr-title">${roleNames[state.role]} — ${esc(items.find(x=>x[0]===state.section)?.[1]||'لوحة التحكم')}</h2><p class="hr-description">إدارة منظمة وتجربة مناسبة للهاتف</p></div><span class="hr-chip">● ${roleNames[state.role]}</span></header>
   <div class="hr-stats" data-hr-stats></div><section class="hr-main-card" data-hr-panel></section><p class="hr-muted" role="status" aria-live="polite" data-hr-message></p></main>
  </div>`;
  r.querySelectorAll('[data-section]').forEach(b=>b.addEventListener('click',()=>{state.section=b.dataset.section;shell();renderSection()}));
  renderStats();
  renderSection();
 }
 function stat(n,label){return `<div class="hr-stat"><strong>${esc(n)}</strong><span>${esc(label)}</span></div>`}
 function renderStats(){
  const el=root()?.querySelector('[data-hr-stats]');if(!el)return;
  if(state.role==='admin')el.innerHTML=stat('—','المستخدمون')+stat(state.classes.length,'الصفوف')+stat('—','المحتويات');
  else if(state.role==='teacher')el.innerHTML=stat(state.classes.length,'صفوفي')+stat(state.requests.length,'طلبات معلّقة')+stat('—','الطلاب');
  else el.innerHTML=stat(state.classes.length,'صفوفي')+stat('—','الدروس المكتملة')+stat('—','نسبة التقدم');
 }
 function empty(msg){return `<div class="hr-empty">${esc(msg)}</div>`}
 function card(title,body,extra=''){return `<div class="hr-card-head"><h3>${title}</h3>${extra}</div>${body}`}
 function row(title,sub,actions=''){return `<div class="hr-row"><div><strong>${esc(title)}</strong><small>${esc(sub||'')}</small></div><div class="hr-actions">${actions}</div></div>`}
 function renderSection(){
  const panel=root()?.querySelector('[data-hr-panel]');if(!panel)return;
  const section=state.section;
  if(section==='overview'){
   const copy={
    admin:'من هنا تدير حسابات المنصة وصفوفها ومحتواها وإعداداتها.',
    teacher:'تابع صفوفك وطلبات الانضمام وأضف المحتوى التعليمي.',
    student:'تابع دروسك وصفوفك وإنجازاتك من مكان واحد.'
   };
   panel.innerHTML=card('مرحباً بك في هدهد',`<p class="hr-muted">${copy[state.role]}</p><div class="hr-note">هذه واجهة المرحلة الأولى. البيانات الحقيقية ستظهر بعد ربط Firebase واختبار الصلاحيات.</div>`);
  }else if(section==='classes' && state.role!=='student'){
   const rows=state.classes.map(c=>row(c.name||'صف بدون اسم',`رمز الانضمام: ${c.joinCode||'—'} · ${c.active===false?'متوقف':'نشط'}`,`${state.role==='teacher'?`<button class="hr-btn secondary" data-requests="${esc(c.id)}">الطلبات</button>`:''}${state.role!=='student'?`<button class="hr-btn secondary" data-toggle-class="${esc(c.id)}" data-active="${c.active===false?'true':'false'}">${c.active===false?'تفعيل':'إيقاف'}</button>`:''}`)).join('');
   const create=state.role==='teacher'?`<form data-create-class class="hr-actions"><input name="className" required minlength="2" maxlength="100" placeholder="اسم الصف" aria-label="اسم الصف" style="flex:1;min-width:150px;padding:9px;border:1px solid var(--hr-line);border-radius:10px;background:var(--hr-bg);color:var(--hr-ink)"><button class="hr-btn" type="submit">إنشاء صف</button></form>`:'';
   panel.innerHTML=card(state.role==='teacher'?'إدارة صفوفي':'صفوفي',create+`<div class="hr-list" style="margin-top:12px">${rows||empty('لا توجد صفوف مرتبطة بهذا الحساب بعد.')}</div>`);
   const form=panel.querySelector('[data-create-class]');
   form?.addEventListener('submit',async e=>{e.preventDefault();const name=new FormData(form).get('className');await run(async()=>{const c=await global.HudhudClassrooms.createClass(name);state.classes.unshift(c);shell();setMessage('تم إنشاء الصف. رمز الانضمام: '+c.joinCode)})});
   panel.querySelectorAll('[data-requests]').forEach(b=>b.addEventListener('click',()=>{state.activeClassId=b.dataset.requests;state.section='requests';run(async()=>{await loadRequests();shell()})}));
   panel.querySelectorAll('[data-toggle-class]').forEach(b=>b.addEventListener('click',()=>run(async()=>{await global.HudhudClassrooms.setClassActive(b.dataset.toggleClass,b.dataset.active==='true');await load();renderSection();setMessage('تم تحديث حالة الصف.')})));
  }else if(section==='requests'){
   const classOptions=state.classes.map(c=>`<option value="${esc(c.id)}" ${state.activeClassId===c.id?'selected':''}>${esc(c.name||c.id)}</option>`).join('');
   const rows=state.requests.filter(q=>!state.activeClassId||q.classId===state.activeClassId).map(q=>row('طلب انضمام',`${q.className||'صف'} · معرّف الطالب: ${q.studentId}`,q.status==='pending'?`<button class="hr-btn" data-decision="yes" data-student="${esc(q.studentId)}" data-class="${esc(q.classId)}">قبول</button><button class="hr-btn secondary" data-decision="no" data-student="${esc(q.studentId)}" data-class="${esc(q.classId)}">رفض</button>`:'')).join('');
   panel.innerHTML=card('طلبات الانضمام',`<label style="display:block;margin-bottom:12px">اختر الصف<select data-pick-class style="width:100%;margin-top:6px;padding:10px;border:1px solid var(--hr-line);border-radius:10px;background:var(--hr-bg);color:var(--hr-ink)">${classOptions||'<option value="">لا توجد صفوف</option>'}</select></label><div class="hr-list">${rows||empty('لا توجد طلبات معلّقة لهذا الصف.')}</div>`);
   panel.querySelector('[data-pick-class]')?.addEventListener('change',e=>{state.activeClassId=e.target.value||null;run(async()=>{await loadRequests();renderSection()})});
   panel.querySelectorAll('[data-decision]').forEach(b=>b.addEventListener('click',()=>run(async()=>{await global.HudhudClassrooms.decideJoin(b.dataset.class,b.dataset.student,b.dataset.decision==='yes');await load();renderSection();setMessage('تم تحديث حالة طلب الانضمام.')})));
  }else if(state.role==='student' && section==='classes'){
   const joinForm=`<form data-join-class class="hr-actions"><input name="joinCode" required maxlength="8" minlength="8" placeholder="رمز الصف (8 خانات)" aria-label="رمز الصف" dir="ltr" style="flex:1;min-width:160px;padding:9px;border:1px solid var(--hr-line);border-radius:10px;background:var(--hr-bg);color:var(--hr-ink);text-align:center;letter-spacing:2px"><button class="hr-btn" type="submit">إرسال طلب انضمام</button></form>`;
   const requests=state.myRequests.map(q=>row(q.className||q.classId,`حالة الطلب: ${q.status==='pending'?'بانتظار موافقة المعلم':q.status==='accepted'?'تم القبول':'مرفوض'}`)).join('');
   panel.innerHTML=card('الانضمام إلى صف',joinForm+`<div class="hr-list" style="margin-top:12px">${requests||empty('لا توجد طلبات انضمام سابقة.')}</div>`);
   panel.querySelector('[data-join-class]')?.addEventListener('submit',e=>{e.preventDefault();const code=new FormData(e.currentTarget).get('joinCode');run(async()=>{await global.HudhudClassrooms.requestJoin(code);await load();renderSection();setMessage('أُرسل طلبك بنجاح. انتظر موافقة المعلم.')})});
  }else{
   const labels={accounts:'إدارة حسابات المستخدمين وتعيين أدوارهم ستكون عبر وظائف خادمية محمية.',content:'إدارة المحتوى التعليمي ستُربط بمسارات Firebase وقواعد الصلاحيات.',settings:'إعدادات المنصة العامة وخيارات تفعيل متابعة الطلاب.',progress:'ستظهر متابعة تقدم الطلاب في الصفوف التي تملكها فقط.',lessons:'الدروس المخصصة للصفوف التي انضممت إليها.',achievements:'إنجازاتك وشاراتك التعليمية.',};
   panel.innerHTML=card(({accounts:'إدارة الحسابات',content:'المحتوى التعليمي',settings:'إعدادات المنصة',progress:'متابعة التقدم',lessons:'الدروس',achievements:'إنجازاتي'})[section]||'قريباً',`<p class="hr-muted">${labels[section]||'سيتم تجهيز هذا القسم في المرحلة التالية.'}</p><div class="hr-note">لم يتم تفعيل هذا الإجراء بعد؛ لا توجد كتابة مباشرة إلى قاعدة البيانات من هذه الواجهة.</div>`);
  }
 }
 async function run(fn){if(state.busy)return;state.busy=true;setMessage('جارٍ التنفيذ…');try{await fn()}catch(e){setMessage(e.message||'حدث خطأ غير متوقع.')}finally{state.busy=false}}
 async function loadRequests(){
  const api=global.HudhudClassrooms;if(!api)return;
  const targets=state.activeClassId?state.classes.filter(c=>c.id===state.activeClassId):state.classes;
  const all=[];
  for(const c of targets){const qs=await api.listJoinRequests(c.id);qs.forEach(q=>all.push({...q,classId:c.id,className:c.name}));}
  state.requests=all;
 }
 async function load(){
  const api=global.HudhudClassrooms;if(!api)return;
  state.classes=await api.listMyClasses();
  if(state.role==='teacher') await loadRequests();
  if(state.role==='student') state.myRequests=await api.listMyJoinRequests();
  renderStats();
 }
 async function init(){
  const auth=global.firebase?.auth?.();const user=auth?.currentUser;
  if(!user)throw Error('يجب تسجيل الدخول أولاً.');
  const token=await user.getIdTokenResult(true);
  const role=token.claims.role;
  if(!navs[role])throw Error('لم يتم تعيين دور صالح لهذا الحساب في Firebase Custom Claims.');
  state.role=role;state.section='overview';shell();
  if(global.HudhudClassrooms){await load();renderStats();}else setMessage('واجهة تجريبية: لم يتم تحميل مكتبة ربط المرحلة الثانية.');
 }
 async function mount(){
  const r=root();if(!r)throw Error('أضف عنصر #'+ROOT_ID+' داخل الصفحة.');
  const uid=global.firebase?.auth?.()?.currentUser?.uid||null;
  if(mountPromise && mountedUid===uid) return mountPromise;
  mountedUid=uid; mountPromise=init().catch(err=>{mountedUid=null;mountPromise=null;throw err});
  return mountPromise;
 }
 global.HudhudRoleUI=Object.freeze({init,refresh:async()=>{await load();renderStats();renderSection()},mount});
})(window);
