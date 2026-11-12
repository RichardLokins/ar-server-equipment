
import {icon,categoryIcon} from './icons.mjs';
import {catalog as samples,categories,defaultRoom,demo,types,wallNames,units,makeObject,roomElement,validate,placement,bounds,canMount} from './domain.mjs';
import {viewport} from './view.mjs';
import {download,report,qrSVG,makeUSDZ,makeUSDZScene,makeUSDZBrowser,makeGLB} from './exports.mjs';
import {startXR,startCamera,arCapability} from './ar.mjs';
import {floorArea} from './area.mjs';

const app=document.querySelector('#app'),modal=document.querySelector('#modal'),query=new URLSearchParams(location.search);
let user,catalog=samples,projects=[],p,view,previews=[],route='editor',panel='object',library='catalog',category='rack',filter='',tool='select',pending='',selected=new Set(),issues=[],past=[],future=[],revision=0,saved=0,saving,saveTimer,saveError='',saveConflict=false,leftOpen=false,rightOpen=false,grid=true,axes=true,zoneDisplay=false,snap=true,quality='high',mountUnit=1,drag,measureStart,share='',activeAR,quickURL;
const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const clone=structuredClone,fmt=n=>new Intl.NumberFormat('ru-RU',{maximumFractionDigits:3}).format(n);
const zoneNames={front:'Спереди',rear:'Сзади',side:'По бокам',door:'Открывание дверей'};
const zoneOptions={front:true,rear:true,side:true,door:true};
let areaCache;
const date=d=>d?new Intl.DateTimeFormat('ru-RU',{dateStyle:'medium'}).format(new Date(d)):'—';
const dim=(n,u=p?.units||'мм')=>fmt(n/units[u])+' '+u, dims=(a,b,c,u=p?.units||'мм')=>[a,b,c].map(n=>fmt(n/units[u])).join(' × ')+' '+u;
const roles={guest:'Гость',admin:'Администратор',engineer:'Инженер',user:'Пользователь',viewer:'Наблюдатель'};
const nav=[['home','house','Главная'],['projects','folder','Мои проекты'],['new','plus','Создать проект'],['editor','box','3D-конструктор'],['catalog','rack','Каталог оборудования'],['ar','ar','AR-просмотр'],['docs','file','Документация']];
const floors={tile:'Плитка',concrete:'Бетон',raised:'Фальшпол'}, swings={'in-left':'Внутрь, петли слева','in-right':'Внутрь, петли справа','out-left':'Наружу, петли слева','out-right':'Наружу, петли справа',slide:'Раздвижная'};
const unitNames={'мм':'Миллиметры','см':'Сантиметры','м':'Метры'}, modes={select:'Выбор',move:'Переместить',rotate:'Повернуть',measure:'Замер'};
const b=(a,l,i='',cls='',extra='')=>'<button type="button" class="btn '+cls+'" data-action="'+a+'" '+extra+'>'+ (i?icon(i,15):'')+(l?'<span>'+l+'</span>':'')+'</button>';
const ib=(a,l,i,extra='')=>'<button type="button" class="icon-btn" data-action="'+a+'" title="'+l+'" aria-label="'+l+'" '+extra+'>'+icon(i,16)+'</button>';
const option=(v,t,sel)=>'<option value="'+esc(v)+'" '+(v===sel?'selected':'')+'>'+esc(t)+'</option>';
const opts=(dict,v)=>Object.entries(dict).map(([k,t])=>option(k,t,v)).join('');
const edit=()=>!!p&&!p.deleted&&['owner','edit'].includes(p.access)&&user?.role!=='viewer';
const obj=()=>p?.objects.find(o=>selected.has(o.id)), selection=()=>p?.objects.filter(o=>selected.has(o.id))||[];
const url=(suffix='')=>'/api/projects/'+encodeURIComponent(p.id)+suffix+(share?'?share='+encodeURIComponent(share):'');
const field=(label,key,value,attrs='')=>'<label class="field"><span>'+label+'</span><input data-field="'+key+'" value="'+esc(value)+'" '+attrs+'></label>';
const sel=(label,key,list,val,attrs='')=>'<label class="field"><span>'+label+'</span><select data-field="'+key+'" '+attrs+'>'+opts(list,val)+'</select></label>';
const tick=(label,key,on,attrs='')=>'<label class="tick"><input type="checkbox" data-field="'+key+'" '+(on?'checked':'')+' '+attrs+'>'+label+'</label>';
const num=(label,key,val,unit=p.units,axis='',attrs='')=>'<label class="field '+(axis?'axis-field':'')+'"><span>'+label+'</span>'+(axis?'<span class="axis-letter">'+axis+'</span>':'')+'<input type="number" step="any" data-field="'+key+'" data-factor="'+(units[unit]||1)+'" value="'+(Number(val)/(units[unit]||1))+'" '+attrs+'></label>';
const idData=id=>'data-id="'+esc(id)+'"';
const section=(title,html,sub='')=>'<div class="inspect-section"><h3>'+title+(sub?'<span>'+sub+'</span>':'')+'</h3>'+html+'</div>';
const fields=(html,n=3)=>'<div class="fields '+(n===3?'three':n===2?'two':'')+'">'+html+'</div>';
function toast(message,isError=false){
  const el=document.createElement('div');el.className='toast'+(isError?' error':'');el.textContent=message;
  $('#toast').append(el);setTimeout(()=>el.remove(),isError?6500:3500);
}
const error=e=>toast(e.message||'Не удалось выполнить действие.',true);
async function api(path,method='GET',body){
  const binary=body instanceof Blob;
  const response=await fetch(path,{method,headers:body===undefined?{}:{'Content-Type':binary?'application/octet-stream':'application/json'},body:body===undefined?undefined:binary?body:JSON.stringify(body)});
  const result=await response.json();
  if(!response.ok)throw Object.assign(Error(result.error||'Ошибка запроса.'),{status:response.status});
  return result;
}
async function refreshProjects(){projects=user?await api('/api/projects'):[];}
function setProject(project,key=''){
  p=project;share=key;selected=new Set(project.objects.some(o=>o.id==='rack-1')?['rack-1']:[]);
  past=[];future=[];revision=saved=0;saveError='';saveConflict=false;drag=null;pending='';measureStart=null;tool='select';panel='object';
  history.replaceState(null,'','/?project='+encodeURIComponent(p.id)+(share?'&share='+encodeURIComponent(share):''));
  navigate('editor',true);
}
function cache(project){
  const i=projects.findIndex(q=>q.id===project.id);
  if(i>=0)projects[i]=project;else if(project.access==='owner')projects.unshift(project);
}
function saveStatus(){
  const mark=$('[data-save-state]');if(!mark)return;
  const state=saveError?'error':saving?'saving':revision!==saved?'dirty':'ok';
  mark.dataset.status=state;mark.title=saveError;
  mark.innerHTML=icon(state==='error'?'warning':state==='ok'?'cloud':'clock',15)+' '+({error:'Ошибка сохранения',saving:'Сохранение…',dirty:'Есть изменения',ok:'Сохранено'})[state];
}
function dirty(){revision++;saveError='';clearTimeout(saveTimer);saveTimer=setTimeout(()=>save().catch(()=>{}),850);saveStatus();}
async function save(show=false){
  clearTimeout(saveTimer);
  if(saving)await saving;
  if(!edit()||revision===saved){if(show&&edit())toast('Проект сохранён.');return;}
  const id=p.id,current=revision,request=api(url(),'PUT',p);
  saving=request;saveStatus();
  try{const next=await request;if(p?.id===id){p.version=next.version;p.modified=next.modified;saved=current;saveError='';saveConflict=false;cache(next);}if(show)toast('Проект сохранён.');}
  catch(e){if(p?.id===id){saveError=e.message;saveConflict=e.status===409;error(e);if(saveConflict)conflictDialog();}throw e;}
  finally{if(saving===request)saving=null;saveStatus();}
  if(p?.id===id&&revision!==saved)await save();
}
const snapshot=()=>clone({room:p.room,objects:p.objects,measurements:p.measurements,validation:p.validation,units:p.units,name:p.name,description:p.description});
function remember(s){past.push(s);if(past.length>70)past.shift();future=[];}
function mutate(fn){if(!edit())return;const old=snapshot();fn();remember(old);dirty();refresh();}
function undo(redo=false){
  if(!edit())return;
  const from=redo?future:past,to=redo?past:future;
  if(!from.length)return;
  to.push(snapshot());Object.assign(p,from.pop());selected=new Set(selection().map(o=>o.id));dirty();refresh();
}
function thumb(m){
  if(m?.rack||m?.category==='rack')return '<svg class="mini" viewBox="0 0 45 43" aria-hidden="true"><path d="M12 8 25 4 34 8 22 13Z" fill="#55758d"/><path d="M22 13 34 8v28l-12 5Z" fill="#263d52"/><path d="M12 8l10 5v28l-10-5Z" fill="#162835" stroke="#678ba3" stroke-width=".7"/><path d="M14 13l6 3m-6 1 6 3m-6 1 6 3m-6 1 6 3m-6 1 6 3m-6 1 6 3" stroke="#698899" stroke-width=".8"/><path d="M16 16v.8m0 7v.8m0 7v.8" stroke="#48d0fa" stroke-width="1.35"/></svg>';
  return icon(categoryIcon[m?.category]||(m?.kind==='door'?'door':'box'),23);
}
function item(m,full=false){
  return '<div class="item" '+(edit()?'draggable="true"':'')+' data-item="'+esc(m.id)+'"><div class="thumb">'+thumb(m)+'</div><div class="item-text"><strong title="'+esc(m.name)+'">'+esc(m.name)+'</strong><small>'+dims(m.w,m.d,m.h,'мм')+'</small></div>'+
  (full?ib('model-info','Характеристики','info',idData(m.id)):ib('place','Разместить в сцене','plus',idData(m.id)+' '+(!edit()?'disabled':'')))+'</div>';
}
function shell(){
  const label=nav.find(x=>x[0]===route)?.[2]||(route==='admin'?'Администрирование':'Настройки');
  app.innerHTML='<div class="shell"><header class="topbar"><div class="brand"><div class="brand-mark">'+icon('logo')+'</div><div><div class="brand-title">AR SERVER EQUIPMENT</div><div class="brand-subtitle">Проектирование серверных</div></div></div><div class="crumb"><span>Рабочая область</span>'+icon('chevron',12)+'<b>'+label+'</b></div><div class="top-right">'+(p?'<span class="save-state" data-save-state></span>':'')+ib('keys','Горячие клавиши','keyboard')+'<span class="sep"></span><button class="account" data-action="'+(user?.role==='guest'||!user?'auth':'settings')+'" title="Профиль"><span class="avatar">'+esc((user?.name||'Г')[0].toUpperCase())+'</span><span class="account-name">'+esc(user?.name||'Гость')+'</span>'+icon('down',13)+'</button></div></header><nav class="rail" aria-label="Основная навигация">'+nav.map(([r,i,l])=>'<button class="rail-btn '+(route===r?'active':'')+(['new','home','docs'].includes(r)?' desktop-only':'')+'" title="'+l+'" aria-label="'+l+'" data-action="'+r+'">'+icon(i,19)+'</button>').join('')+'<div class="rail-fill"></div>'+ (user?.role==='admin'?'<button class="rail-btn" title="Администрирование" data-action="admin">'+icon('lock',19)+'</button>':'')+'<button class="rail-btn '+(route==='settings'?'active':'')+'" title="Настройки" aria-label="Настройки" data-action="settings">'+icon('settings',19)+'</button></nav><main class="main" id="main"></main><footer class="status" id="status"></footer></div>';
  saveStatus();status();
}
function status(){
  const host=$('#status');if(!host)return;
  host.innerHTML='<span class="'+(navigator.onLine?'green':'amber')+'"><i class="dot"></i> '+(navigator.onLine?'Система доступна':'Нет сети')+'</span><i class="sep"></i>'+(p?'<span>'+icon('layers',13)+' '+p.objects.length+' объектов</span><i class="sep"></i><span class="optional">Оборудование: '+p.objects.filter(o=>o.kind==='equipment').length+'</span><span class="spacer"></span><span class="mono optional">Сетка '+dim(p.room.grid)+'</span><i class="sep"></i>'+b('unit-cycle',p.units,'ruler','small clear',!edit()?'disabled':''):'<span class="spacer"></span>')+'<span class="optional mono">AR SERVER EQUIPMENT</span>';
}
function navigate(to,force=false){
  if(to==='editor'&&!p)to='projects';
  if(!force&&to===route&&view){refresh();return;}
  view?.dispose();view=null;previews.forEach(v=>v.dispose());previews=[];
  route=to;shell();if(route==='editor')renderEditor();else renderPage();
}
function renderEditor(){
  $('#main').innerHTML='<div class="projectbar" id="projectbar"></div><div class="editor"><aside class="left" id="left"></aside><section class="stage" aria-label="3D-сцена"><div class="toolbar" id="toolbar"></div><div class="view" id="viewport"><canvas id="scene" aria-label="Интерактивная 3D-модель помещения"></canvas><div class="view-overlay"><div class="view-top"><select id="camera-view" aria-label="Вид сцены">'+opts({'3d':'Изометрия',perspective:'Перспектива',top:'Сверху',front:'Спереди',side:'Сбоку'},'3d')+'</select><span class="tag mono">1 : 1</span></div><div class="axis-gizmo" aria-label="Оси"><button data-view="top" title="Вид сверху">Y</button><button data-view="side" title="Вид сбоку">X</button><button data-view="front" title="Вид спереди">Z</button></div><div id="labels"></div><div id="scene-notice"></div><div class="view-label"><i class="dot"></i><span id="view-caption">ВИД СЦЕНЫ</span></div><div class="view-tools">'+ib('zoom-out','Отдалить','minus')+ib('zoom-in','Приблизить','plus')+ib('fit','Сбросить камеру','focus')+ib('fullscreen','Полноэкранный режим','maximize')+'</div></div></div></section><aside class="right" id="right"></aside></div>';
  try{view=viewport($('#scene'),()=>({project:p,options:{selected,quality,grid,axes,zones:zoneDisplay&&zoneOptions}}),{click:sceneClick,begin:dragStart,drag:dragMove,end:dragEnd,drop:(id,hit)=>{if(edit()){pending=id;placeAt(hit.floor);}},labels,assetError:m=>toast(m,true)});}
  catch(e){$('#viewport').dataset.error=e.message;}
  renderLeft();refresh();
}


function renderLeft(){
  const host=$('#left');if(!host)return;
  host.innerHTML='<div class="pane-heading"><h2>'+icon('layers',16)+' Библиотека</h2>'+ib('toggle-left','Свернуть библиотеку','panel')+'</div><div class="catalog-tabs"><button data-action="lib-catalog" class="'+(library==='catalog'?'active':'')+'">Оборудование</button><button data-action="lib-room" class="'+(library==='room'?'active':'')+'">Элементы комнаты</button></div><div class="pane-content"><div class="catalog-tools"><label class="searchbox">'+icon('search',16)+'<input id="filter" placeholder="Поиск в библиотеке" aria-label="Поиск в библиотеке" value="'+esc(filter)+'"></label>'+(library==='catalog'?'<select id="category" aria-label="Категория оборудования">'+opts({all:'Все категории',...categories},category)+'</select>':'')+'</div><div id="item-list"></div></div><div class="left-foot">'+icon('info',14)+' '+(library==='catalog'?'Демонстрационные характеристики':'Перетащите элемент в сцену')+'</div>';
  renderItems();
}
function renderItems(){
  const host=$('#item-list');if(!host)return;
  const q=filter.trim().toLowerCase();
  const list=library==='catalog'?catalog.filter(m=>(q||category==='all'||m.category===category)&&(!q||[m.name,m.model,m.manufacturer].some(s=>s?.toLowerCase().includes(q)))):Object.keys(types).filter(k=>types[k].toLowerCase().includes(q)).map(k=>roomElement(k,'element-'+k));
  host.innerHTML='<div class="catalog-section-label"><span>'+(library==='catalog'?(q?'Результаты поиска':categories[category]||'Всё оборудование'):'Конструкции')+'</span><span class="mono">'+list.length+'</span></div><div class="catalog-items">'+(list.length?list.map(m=>item(m)).join(''):'<div class="empty">Ничего не найдено.</div>')+'</div>';
}
function tools(){
  const t=(k,i)=>'<button class="tool '+(tool===k?'active':'')+'" data-action="tool-'+k+'" title="'+modes[k]+'" aria-label="'+modes[k]+'" '+(!edit()&&k!=='select'?'disabled':'')+'>'+icon(i,16)+'<span class="tool-text">'+modes[k]+'</span></button>';
  $('#toolbar').innerHTML='<span class="mobile-only">'+ib('toggle-left','Библиотека','layers')+'</span>'+t('select','pointer')+t('move','move')+t('rotate','rotate')+t('measure','ruler')+'<i class="sep"></i>'+ib('snap','Привязка к сетке','magnet','aria-pressed="'+snap+'" style="color:'+(snap?'#68b9ff':'')+'"')+ib('grid','Показать сетку','grid','aria-pressed="'+grid+'" style="color:'+(grid?'#68b9ff':'')+'"')+ib('zones','Зоны доступа','eye','aria-pressed="'+zoneDisplay+'" style="color:'+(zoneDisplay?'#68b9ff':'')+'"')+'<i class="sep"></i>'+ib('undo','Отменить (Ctrl+Z)','undo',!past.length?'disabled':'')+ib('redo','Повторить (Ctrl+Shift+Z)','redo',!future.length?'disabled':'')+'<div class="spacer"></div>'+ib('room','Параметры помещения','settings')+'<span class="mobile-only">'+ib('toggle-right','Панель свойств','panel')+'</span>';
}
function objectPanel(o){
  if(!o)return '<div class="empty">Выберите объект в сцене или откройте список объектов.</div>'+section('Помещение',b('room','Настроить помещение','settings','small'));
  const ds=edit()?'':'disabled', e=o.kind==='equipment';
  const coordinates=o.wall?fields(sel('Стена','object.wall',wallNames,o.wall,ds)+num('Смещение','object.offset',o.offset,p.units,'',ds),2):fields([['x','X'],['y','Y'],['z','Z']].map(([k,a])=>num(k==='y'?'Над полом':'Координата '+a,'object.'+k,o[k],p.units,a,ds)).join(''));
  const used=(o.slots||[]).reduce((s,x)=>s+x.u,0);
  return '<div class="inspect-title"><div class="thumb">'+thumb(o)+'</div><div><strong>'+esc(o.name)+'</strong><small>'+esc(e?categories[o.category]||'Оборудование':types[o.kind])+(o.rack?' · 19″':'')+'</small></div></div>'+
  section('Положение',coordinates+(o.wall&&o.kind!=='door'?'<div style="margin-top:6px">'+num('Высота от пола','object.y',o.y,p.units,'',ds)+'</div>':''),p.units)+
  (!o.wall?section('Поворот',fields([['rx','X'],['ry','Y'],['rz','Z']].map(([k,a])=>num('Ось '+a,'object.'+k,o[k],'°',a,ds)).join('')),'градусы'):'')+
  section('Габариты',fields(num('Ширина','object.w',o.w,p.units,'',ds)+num('Глубина','object.d',o.d,p.units,'',ds)+num('Высота','object.h',o.h,p.units,'',ds)),p.units)+
  (o.kind==='door'?section('Открывание',sel('Направление','object.swing',swings,o.swing,ds)):'')+
  (e?section('Зоны обслуживания',fields(num('Спереди','object.front',o.front,p.units,'',ds)+num('Сзади','object.rear',o.rear,p.units,'',ds)+num('По бокам','object.side',o.side,p.units,'',ds)),p.units):'')+
  (o.rack?section('Монтаж в стойку','<div class="inline"><span class="tag green">'+used+' U занято</span><span class="tag">'+(o.rack-used)+' U свободно</span>'+b('rack','Юниты','rack','small')+'</div>',o.rack+' U'):'')+
  section('Оформление',fields(field('Название','object.name',o.name,'maxlength="120" '+ds)+field('Цвет','object.color',o.color,'type="color" '+ds),2)+'<div class="inspect-actions">'+b('duplicate','Дублировать','copy','small',ds)+b('delete','Удалить','trash','small danger',ds)+'</div>');
}
function roomPanel(){
  const r=p.room,ds=edit()?'':'disabled';
  if(areaCache?.project!==p||areaCache.revision!==revision)areaCache={project:p,revision,area:floorArea(p)};
  const area=areaCache.area;
  return section('Размеры помещения',fields(num('Ширина','room.w',r.w,p.units,'',ds)+num('Длина','room.l',r.l,p.units,'',ds)+num('Высота','room.h',r.h,p.units,'',ds)),p.units)+
  section('Площадь пола','<div class="stack"><div>Общая <strong class="mono">'+fmt(area.total)+' м²</strong></div><div>Свободная <strong class="mono blue">'+fmt(area.free)+' м²</strong></div><small>По проекциям объектов, стоящих на полу.</small></div>')+
  section('Конструкция',fields(num('Толщина стен','room.thickness',r.thickness,p.units,'',ds)+num('Шаг сетки','room.grid',r.grid,p.units,'',ds),2)+'<div class="stack" style="margin-top:9px">'+sel('Пол','room.floor',floors,r.floor,ds)+tick('Показывать стены','room.walls',r.walls,ds)+tick('Показывать потолок','room.ceiling',r.ceiling,ds)+'</div>')+
  section('Проект','<div class="stack">'+field('Название','project.name',p.name,'maxlength="100" '+ds)+field('Описание','project.description',p.description,'maxlength="4000" '+ds)+sel('Единицы','project.units',unitNames,p.units,ds)+tick('Проверять геометрию','project.validation',p.validation,ds)+tick('Показывать оси','ui.axes',axes)+'</div>');
}
function hierarchy(){
  return '<div class="scene-list">'+p.objects.map(o=>'<button class="scene-row '+(selected.has(o.id)?'active':'')+'" data-action="scene-pick" '+idData(o.id)+'>'+icon(categoryIcon[o.category]||(o.kind==='door'?'door':'box'),15)+'<span>'+esc(o.name)+'</span>'+(selected.has(o.id)?icon('check',13):'')+'</button>').join('')+'</div>';
}
function measurePanel(){
  const o=obj(), a=selection().slice(0,2);
  let m='';
  if(o){
    const {center:c,extent:e}=bounds(placement(o,p.room));
    m=section('Размеры объекта','<span class="mono">'+dims(o.w,o.d,o.h)+'</span>')+section('До стен','<div class="stack">'+['Западная','Восточная','Северная','Южная'].map((n,i)=>'<div>'+n+' <span class="mono blue">'+dim([p.room.w/2+c[0]-e[0],p.room.w/2-c[0]-e[0],p.room.l/2+c[2]-e[2],p.room.l/2-c[2]-e[2]][i])+'</span></div>').join('')+'</div>');
  }
  if(a.length===2){
    const [x,y]=a.map(q=>placement(q,p.room));
    m+=section('Между центрами','<span class="mono">'+dim(Math.hypot(x.x-y.x,x.z-y.z,x.y+x.h/2-y.y-y.h/2))+'</span>');
  }
  return section('Две точки','<div class="stack"><p class="muted">Выберите две точки на полу или поверхности оборудования.</p>'+b('tool-measure','Добавить замер','ruler','small',!edit()?'disabled':'')+'</div>')+m+section('Замеры',p.measurements.length?p.measurements.map(m=>'<div class="measure-entry"><span class="mono">'+dim(Math.hypot(...m.a.map((a,i)=>a-m.b[i])))+'</span>'+ib('remove-measure','Удалить замер','trash',idData(m.id)+' '+(!edit()?'disabled':''))+'</div>').join(''):'<small>Замеров пока нет.</small>');
}
function renderRight(){
  const host=$('#right'),prev=host.querySelector('.pane-content')?.scrollTop||0,tabs={object:'Объект',room:'Помещение',scene:'Сцена',measure:'Замеры'};
  host.innerHTML='<div class="pane-heading"><h2>'+icon('settings',16)+' Свойства</h2><span class="mobile-only">'+ib('toggle-right','Закрыть панель','close')+'</span><span class="tag">'+(selected.size?selected.size+' выбрано':'Сцена')+'</span></div><div class="inspector-tabs">'+Object.entries(tabs).map(([k,l])=>'<button data-action="panel-'+k+'" class="'+(panel===k?'active':'')+'">'+l+'</button>').join('')+'</div><div class="pane-content inspector-body">'+(panel==='object'?objectPanel(obj()):panel==='room'?roomPanel():panel==='scene'?hierarchy():measurePanel())+'</div><div class="right-bottom">'+b('validation',issues.length?'Проверка проекта <span class="tag '+(issues.some(i=>i.severity==='error')?'red':'amber')+'">'+issues.length+'</span>':p.validation?'Пересечений нет':'Проверка отключена',issues.length?'warning':'check','small '+(!issues.length?'good':''))+'</div>';
  host.querySelector('.pane-content').scrollTop=prev;
}
function refresh(){
  if(!p)return;issues=validate(p);
  if(route!=='editor'||!$('#scene'))return;
  $('#projectbar').innerHTML='<div class="project-title"><div class="project-emblem">'+icon('box',22)+'</div><div style="min-width:0"><h1>'+esc(p.name)+'</h1><p><span class="mono">'+dims(p.room.w,p.room.l,p.room.h)+'</span><i class="dot"></i>'+(edit()?'План помещения':'Только просмотр')+'</p></div></div><div class="project-actions">'+b('export','Экспорт','download','optional')+b('share','Поделиться','share','optional')+b('save','Сохранить','save','hide-text',!edit()?'disabled':'')+b('ar','Открыть AR','ar','primary')+'</div>';
  tools();renderRight();status();saveStatus();
  const editor=$('.editor');editor.classList.toggle('show-left',leftOpen);editor.classList.toggle('hide-left',!leftOpen&&matchMedia('(min-width:651px) and (max-width:960px)').matches);editor.classList.toggle('show-right',rightOpen);
  $('#scene').className='mode-'+(pending?'place':tool);
  const note=$('#viewport').dataset.error||(pending?'Выберите точку на полу для размещения':tool==='measure'?(measureStart?'Выберите вторую точку':'Выберите первую точку'):'');
  $('#scene-notice').innerHTML=note?'<span class="notice">'+esc(note)+'</span>':'';
  view?.invalidate();
}
function labels(projectPoint){
  const host=$('#labels');if(!host)return;
  const points=[],r=p.room,w=r.w/1000,l=r.l/1000;
  if(['3d','top'].includes(view?.cam.view))points.push([[0,.02,l/2+.41],dim(r.w)],[[w/2+.38,.02,0],dim(r.l)]);
  const o=obj();
  if(o&&view?.cam.view==='3d'){
    const t=placement(o,r);points.push([[t.x/1000,(t.y+t.h)/1000+.22,t.z/1000],o.rack?o.rack+'U':esc(o.name),'selected']);
  }
  for(const m of p.measurements)points.push([m.a.map((a,i)=>(a+m.b[i])/2000),dim(Math.hypot(...m.a.map((a,i)=>a-m.b[i])))]);
  if(measureStart)points.push([measureStart.map(n=>n/1000),'A','selected']);
  host.innerHTML=points.map(([world,label,style=''])=>{
    const at=projectPoint(world);
    return at?'<span class="anno '+style+'" style="left:'+at[0]+'px;top:'+at[1]+'px">'+label+'</span>':'';
  }).join('');
}
function pick(o,add=false,open=false){
  if(!add)selected.clear();
  if(o){if(add&&selected.has(o.id))selected.delete(o.id);else selected.add(o.id);}
  if(open&&o){panel='object';rightOpen=true;}refresh();
}
const snapped=n=>snap?Math.round(n/p.room.grid)*p.room.grid:Math.round(n);
function placeAt(floor){
  if(!edit()||!pending)return;
  if(!floor){toast('Выберите точку на полу.');return;}
  let o;
  if(pending.startsWith('element-')){
    const kind=pending.slice(8);if(!types[kind])return;
    o=roomElement(kind);
    if(o.wall){
      const [x,,z]=floor,r=p.room;
      o.wall=[['west',Math.abs(x+r.w/2)],['east',Math.abs(x-r.w/2)],['north',Math.abs(z+r.l/2)],['south',Math.abs(z-r.l/2)]].sort((a,b)=>a[1]-b[1])[0][0];
      const side=['west','east'].includes(o.wall),span=side?r.l:r.w;
      o.offset=Math.round(Math.max(-span/2+o.w/2,Math.min(span/2-o.w/2,snapped(side?z:x))));
    }else{o.x=snapped(floor[0]);o.z=snapped(floor[2]);}
  }else{
    const m=catalog.find(m=>m.id===pending);if(!m)return;
    o=makeObject(m,snapped(floor[0]),snapped(floor[2]));
  }
  if(p.objects.length>=300){toast('Достигнут предел в 300 объектов.',true);return;}
  pending='';tool='select';selected=new Set([o.id]);panel='object';mutate(()=>p.objects.push(o));toast('Добавлено: '+o.name);
}
function sceneClick(hit,add){
  if(pending){placeAt(hit.floor);return;}
  if(tool==='measure'&&edit()){
    if(!hit.point)return;
    const point=hit.point.map(x=>Math.round(x*10)/10);
    if(!measureStart){measureStart=point;refresh();return;}
    const a=measureStart;measureStart=null;panel='measure';
    mutate(()=>p.measurements.push({id:crypto.randomUUID(),a,b:point}));return;
  }
  pick(hit.object,add);
}
function dragStart(start){
  if(!edit()||start.pan||!start.hit.object||pending||!['move','rotate'].includes(tool))return;
  if(!selected.has(start.hit.object.id))pick(start.hit.object,start.add);
  drag={previous:snapshot(),items:selection().map(o=>clone(o)),moved:false};
}
function dragMove(start,hit){
  if(!drag||!hit.floor||!start.hit.floor)return false;
  const dx=hit.floor[0]-start.hit.floor[0],dz=hit.floor[2]-start.hit.floor[2];
  for(const base of drag.items){
    const o=p.objects.find(o=>o.id===base.id);if(!o)continue;
    if(o.wall){if(tool==='move')o.offset=snapped(base.offset+(['west','east'].includes(o.wall)?dz:dx));}
    else if(tool==='move'){o.x=snapped(base.x+dx);o.z=snapped(base.z+dz);}
    else o.ry=(Math.round((base.ry+dx/8)/(snap?15:1))*(snap?15:1)+3600)%360;
  }
  drag.moved=true;view.invalidate();return true;
}
function dragEnd(){
  if(!drag)return;
  if(drag.moved){remember(drag.previous);dirty();refresh();}
  drag=null;
}
function duplicate(){
  if(!edit()||!selected.size)return;
  if(p.objects.length+selected.size>300){toast('Достигнут предел в 300 объектов.',true);return;}
  mutate(()=>{
    const copies=selection().map(o=>({...clone(o),id:crypto.randomUUID(),name:(o.name+' · копия').slice(0,120),x:o.x+p.room.grid,z:o.z+p.room.grid,offset:o.wall?o.offset+p.room.grid:o.offset}));
    p.objects.push(...copies);selected=new Set(copies.map(o=>o.id));
  });
}
function remove(){if(edit()&&selected.size)mutate(()=>{p.objects=p.objects.filter(o=>!selected.has(o.id));selected.clear();});}
function editField(el){
  const [group,k]=el.dataset.field.split('.');
  if(group==='ui'){axes=el.checked;view?.invalidate();return;}
  if(!edit())return;
  const target=group==='object'?obj():group==='room'?p.room:p;if(!target)return;
  let v=el.type==='checkbox'?el.checked:el.value;
  if(el.type==='number'){
    v=Number(el.value)*Number(el.dataset.factor||1);
    if(el.value===''||!Number.isFinite(v)){refresh();return;}
    if(group==='room')v=Math.max(k==='grid'?25:k==='thickness'?20:300,Math.min(k==='grid'?5000:k==='thickness'?2000:100000,Math.round(v)));
    else if(['w','d','h'].includes(k)){
      const installed=(target.slots||[]).map(s=>catalog.find(m=>m.id===s.ref)).filter(Boolean);
      const min=target.rack?(k==='h'?Math.round(target.rack*44.45+145):Math.max(150,...installed.map(m=>m[k]+75))):1;
      v=Math.max(min,Math.min(100000,Math.round(v)));
    }
    else if(['front','rear','side'].includes(k))v=Math.max(0,Math.min(20000,Math.round(v)));
    else if(k.startsWith('r'))v=((v%360)+360)%360;
    else v=Math.max(-100000,Math.min(100000,v));
  }
  if(k==='name'&&!v.trim()){refresh();return;}
  if(target[k]!==v)mutate(()=>{target[k]=v;});
}
function camera(mode){
  if(!view)return;
  view.cam.view=mode==='perspective'?'3d':mode;view.cam.ortho=mode!=='perspective';
  $('#camera-view').value=mode;$('#view-caption').textContent={top:'ВИД СВЕРХУ',front:'ВИД СПЕРЕДИ',side:'ВИД СБОКУ',perspective:'ПЕРСПЕКТИВА','3d':'ВИД СЦЕНЫ'}[mode];view.invalidate();
}


function dialog(title,content,wide=false){
  modal.innerHTML='<div class="shade"><section class="dialog '+(wide?'wide':'')+'" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><div class="dialog-head"><h2 id="dialog-title">'+esc(title)+'</h2>'+ib('close','Закрыть','close')+'</div><div class="dialog-body">'+content+'</div></section></div>';
}
const close=()=>{modal.innerHTML='';if(quickURL){URL.revokeObjectURL(quickURL);quickURL=null;}};
function conflictDialog(){
  dialog('Обнаружены изменения в другой сессии','<div class="stack"><p>Сохраните текущую работу в отдельный проект или загрузите последнюю версию с сервера.</p><div class="inline">'+(user?b('copy-project','Сохранить как копию','copy','primary',idData(p.id)):'')+b('export-json','Скачать текущий JSON','download')+b('reload-project','Загрузить с сервера','undo')+'</div></div>');
}
const errorLine=()=>'<p class="error-line" role="alert"></p>';
const formField=(name,label,value='',attrs='')=>'<label class="field"><span>'+label+'</span><input name="'+name+'" value="'+esc(value)+'" '+attrs+'></label>';
const formSelect=(name,label,options,value)=>'<label class="field"><span>'+label+'</span><select name="'+name+'">'+opts(options,value)+'</select></label>';
const submit=label=>'<button class="btn primary" type="submit">'+label+'</button>';
function auth(kind='login'){
  const reset=query.get('reset'),title={login:'Вход в аккаунт',register:'Создать аккаунт',forgot:'Восстановление пароля',reset:'Установить новый пароль'}[kind];
  dialog(title,'<form id="auth-form" class="stack" data-kind="'+kind+'">'+(kind==='register'?formField('name','Имя','','required maxlength="80" autocomplete="name"'):'')+(kind!=='reset'?formField('email','Email','','type="email" required autocomplete="email"'):'')+(kind!=='forgot'?formField('password','Пароль','','type="password" required minlength="10" maxlength="128" autocomplete="'+(kind==='login'?'current-password':'new-password')+'"'):'')+(reset?'<input type="hidden" name="token" value="'+esc(reset)+'">':'')+errorLine()+'<div class="dialog-actions">'+(kind==='login'?b('forgot','Забыли пароль?','','clear'):'')+submit({login:'Войти',register:'Зарегистрироваться',forgot:'Отправить ссылку',reset:'Сохранить'}[kind])+'</div><div class="inline">'+(kind==='login'?b('register','Регистрация','user','clear'):b('auth','Ко входу','','clear'))+'</div></form>');
}
function newProject(){
  if(!user){auth();return;}
  const r=user.preferences?.room||defaultRoom,u=user.preferences?.units||'мм';
  dialog('Новый проект','<form id="new-form" class="stack">'+formField('name','Название проекта','','required maxlength="100" placeholder="Серверная №1"')+'<label class="field"><span>Описание</span><textarea name="description" maxlength="4000"></textarea></label>'+formSelect('units','Единицы измерения',unitNames,u)+fields([['w','Ширина'],['l','Длина'],['h','Высота']].map(([k,n])=>formField(k,n,r[k]/units[u],'type="number" required min="0.001" step="any"')).join(''))+errorLine()+'<div class="dialog-actions">'+b('close','Отмена','','clear')+submit('Создать и открыть')+'</div></form>');
  $('#new-form [name=units]').dataset.last=u;
}
function validation(){
  const warnings=issues.length?'<div class="issue-list">'+issues.map(i=>'<article class="issue"><strong class="'+(i.severity==='error'?'red':'amber')+'">'+icon('warning',15)+' '+esc(i.name)+'</strong><p>'+esc(i.message)+'</p><small class="mono">X '+dim(i.location[0])+' · Z '+dim(i.location[1])+'</small><small>'+esc(i.action)+'</small>'+b('go-issue','Показать объект','focus','small',idData(i.id))+'</article>').join('')+'</div>':'<p>'+(p.validation?'Геометрических конфликтов не обнаружено.':'Проверка отключена в свойствах помещения.')+'</p>';
  const controls=Object.entries(zoneNames).map(([key,label])=>'<label class="tick"><input type="checkbox" data-zone="'+key+'" '+(zoneOptions[key]?'checked':'')+'> '+label+'</label>').join('');
  dialog('Проверка геометрии','<div class="stack"><h3>Зоны на сцене</h3>'+fields(controls,2)+warnings+'</div>');
}
function rackDialog(){
  const rack=obj();if(!rack?.rack)return;
  const occupied=new Map();
  for(const s of rack.slots)for(let i=s.start;i<s.start+s.u;i++)occupied.set(i,s);
  const current=occupied.get(mountUnit),compatible=catalog.filter(m=>canMount(rack,m,mountUnit));
  dialog('Монтаж · '+rack.name,'<div class="stack"><p>1U = 44,45 мм. Выберите позицию по высоте стойки, считая от нижней рейки.</p><div class="inline"><span class="tag green">'+occupied.size+' U занято</span><span class="tag">'+(rack.rack-occupied.size)+' U свободно</span></div><div class="slot-grid">'+Array.from({length:rack.rack},(_,i)=>rack.rack-i).map(i=>'<button type="button" class="slot '+(occupied.has(i)?'used ':'')+(mountUnit===i?'active':'')+'" data-action="rack-unit" '+idData(i)+' title="'+esc(occupied.get(i)?.name||'Свободно')+'">'+i+' U</button>').join('')+'</div>'+(current?'<div class="inline"><strong>'+esc(current.name)+'</strong>'+b('unmount','Снять','trash','small danger',idData(current.id)+' '+(!edit()?'disabled':''))+'</div>':compatible.length?'<div class="inline"><select id="mount-model" aria-label="Оборудование для монтажа">'+compatible.map(m=>option(m.id,m.name)).join('')+'</select>'+b('mount','Установить','plus','primary',!edit()?'disabled':'')+'</div>':'<p>Для этой позиции нет совместимого оборудования.</p>')+'<div class="inline">'+b('rack-front','Вид спереди','eye','small')+b('rack-rear','Вид сзади','rotate','small')+'</div></div>');
}
function pageHead(title,desc,action=''){return '<div class="page-head"><div><h1>'+title+'</h1><p>'+desc+'</p></div>'+action+'</div>';}
function card(q){
  return '<article class="card project-card"><canvas data-preview="'+esc(q.id)+'" aria-label="Предпросмотр проекта"></canvas><div class="card-inner"><h2>'+esc(q.name)+'</h2><p class="mono">'+dims(q.room.w,q.room.l,q.room.h,q.units)+'</p><small>Объектов: '+q.objects.filter(o=>o.kind==='equipment').length+' · Создан '+date(q.created)+'</small><small>Изменён '+date(q.modified)+'</small><div class="inline">'+(q.deleted?b('restore-project','Восстановить','undo','small',idData(q.id)):b('open-project','Открыть','box','small primary',idData(q.id))+ib('copy-project','Дублировать проект','copy',idData(q.id))+ib('delete-project','Удалить проект','trash',idData(q.id)))+'</div></div></article>';
}
function renderPage(){
  const host=$('#main');
  host.innerHTML='<section class="page"><div class="page-wrap" id="page"></div></section>';
  const page=$('#page'), active=projects.filter(q=>!q.deleted);
  if(route==='home'||route==='projects'){
    const racks=active.reduce((n,q)=>n+q.objects.filter(o=>o.rack).length,0), equipment=active.reduce((n,q)=>n+q.objects.filter(o=>o.kind==='equipment').length,0);
    const since=Date.now()-7*86400000, recent=active.filter(q=>Date.parse(q.modified)>=since).length;
    const stats=[['folder',active.length,'Проекты'],['rack',racks,'Стойки'],['box',equipment,'Оборудование'],['clock',recent,'Изменено за неделю']];
    page.innerHTML=pageHead(route==='home'?'Добро пожаловать, '+esc(user?.name||'Гость'):'Мои проекты',route==='home'?'Рабочая область для планирования серверных помещений.':'Открывайте, копируйте и восстанавливайте проекты.',b('new','Создать проект','plus','primary'))+(route==='home'?'<div class="stats">'+stats.map(([i,n,t])=>'<div class="stat">'+icon(i,20)+'<strong>'+n+'</strong><span>'+t+'</span></div>').join('')+'</div><h2 class="section-page">Недавние проекты</h2>':'')+'<div class="cards">'+(active.length?active.slice(0,route==='home'?6:100).map(card).join(''):'<div class="empty">У вас пока нет проектов.</div>')+'</div>'+(route==='projects'&&projects.some(q=>q.deleted)?'<h2 class="section-page">Удалённые проекты</h2><div class="cards">'+projects.filter(q=>q.deleted).map(card).join('')+'</div>':'');
    for(const canvas of [...page.querySelectorAll('canvas')].slice(0,8)){
      const q=projects.find(q=>q.id===canvas.dataset.preview);
      try{previews.push(viewport(canvas,()=>({project:q,options:{selected:new Set(),grid:true,axes:false,zones:false,quality:'low'}}),{labels(){}}));}catch{canvas.style.display='none';}
    }
  }
  if(route==='catalog')page.innerHTML=pageHead('Каталог оборудования','Габариты демонстрационных моделей приведены для планирования.')+'<div class="cat-list">'+Object.entries({all:'Все категории',...categories}).map(([k,v])=>'<button class="cat '+(k===category?'active':'')+'" data-action="catalog-category" '+idData(k)+'>'+esc(v)+'</button>').join('')+'</div><div class="cards">'+catalog.filter(m=>category==='all'||category===m.category).map(m=>item(m,true)).join('')+'</div>';
  if(route==='docs')page.innerHTML=pageHead('Документация','Экспорт текущего проекта и управление версиями.')+(p?'<div class="card page-card"><h2>'+esc(p.name)+'</h2><div class="inline">'+b('export','Экспорт проекта','download')+b('share','Поделиться','share')+b('versions','Версии проекта','clock')+'</div></div>':'<div class="empty">Откройте проект, чтобы экспортировать данные.</div>')+'<div class="card page-card"><h2>Работа в конструкторе</h2><p>Перетащите оборудование на пол или выберите позицию после нажатия «+». Используйте панель свойств для точных координат, размеров и углов. Для проверки доступа включите зоны обслуживания.</p><div style="margin-top:10px">'+b('keys','Горячие клавиши','keyboard')+'</div></div>';
  if(route==='settings')settingsPage(page);
  if(route==='admin')adminPage(page).catch(error);
}
function settingsPage(page){
  const pref=user?.preferences||{},r=pref.room||defaultRoom;
  page.innerHTML=pageHead('Настройки','Профиль и параметры новых проектов.',user&&user.role!=='guest'?b('logout','Выйти','user'):b('auth','Войти','user'))+(user?'<form id="settings-form" class="card page-card stack"><h2>Профиль · '+esc(roles[user.role])+'</h2>'+fields(formField('name','Имя',user.name,'required maxlength="80"')+formField('email','Email',user.email||'','disabled'),2)+fields(formSelect('language','Язык',{ru:'Русский'},'ru')+formSelect('units','Единицы измерения',unitNames,pref.units||'мм')+formSelect('quality','Детализация',{high:'Высокая',low:'Низкая'},pref.quality||'high'))+fields(formSelect('theme','Тема',{dark:'Тёмная',light:'Светлая'},pref.theme||'dark')+formField('grid','Шаг сетки, мм',r.grid,'type="number" min="25" max="5000" required')+formField('calibration','Контрольный размер AR, мм',pref.calibration||1000,'type="number" min="100" max="5000" required'))+fields([['w','Ширина, мм'],['l','Длина, мм'],['h','Высота, мм']].map(([k,n])=>formField(k,n,r[k],'type="number" min="300" max="100000" required')).join(''))+'<label class="tick"><input name="notifications" type="checkbox" '+(pref.notifications!==false?'checked':'')+'> Уведомлять об изменении сети</label>'+errorLine()+'<div>'+submit('Сохранить настройки')+'</div></form>':'<div class="empty">Войдите в профиль, чтобы сохранить настройки.</div>');
}
async function adminPage(page){
  page.innerHTML=pageHead('Администрирование','Пользователи, роли и 3D-модели.');
  const data=await api('/api/admin');if(route!=='admin')return;
  page.innerHTML+= '<div class="stats"><div class="stat"><strong>'+data.users.length+'</strong>Пользователи</div><div class="stat"><strong>'+data.projects+'</strong>Проекты</div><div class="stat"><strong>'+data.assets+'</strong>Загруженные модели</div></div><div class="card page-card"><h2>Пользователи</h2><div class="stack">'+data.users.filter(x=>x.email).map(x=>'<form class="role-form inline"><input type="hidden" name="id" value="'+esc(x.id)+'"><span style="min-width:160px">'+esc(x.name)+'<br><small>'+esc(x.email)+'</small></span><select name="role" aria-label="Роль">'+opts(Object.fromEntries(Object.entries(roles).filter(([k])=>k!=='guest')),x.role)+'</select><button class="btn" '+(x.id===user.id?'disabled':'')+'>Назначить</button></form>').join('')+'</div></div><div class="card page-card"><h2>Модель оборудования</h2><form id="admin-model" class="stack">'+formSelect('existing','Редактирование',{new:'Новая модель',...Object.fromEntries(data.models.map(m=>[m.id,m.name]))},'new')+fields(formField('id','Идентификатор','','required pattern="[a-zA-Z0-9_-]{1,80}"')+formField('name','Название','','required maxlength="100"')+formSelect('category','Категория',categories,'rack'))+fields(formField('manufacturer','Производитель','','maxlength="100"')+formField('model','Модель','','maxlength="100"')+formField('material','Цвет','#698296','type="color"'))+fields(['w','d','h'].map((k,i)=>formField(k,['Ширина, мм','Глубина, мм','Высота, мм'][i],600,'type="number" required min="1" max="10000"')).join(''))+formField('description','Описание','','maxlength="800"')+formField('file','Автономный GLB / glTF','','type="file" accept=".glb,.gltf"')+'<input type="hidden" name="asset">'+errorLine()+'<div>'+submit('Сохранить модель')+'</div></form></div>';
  const f=$('#admin-model');
  f.elements.existing.onchange=()=>{
    const m=data.models.find(m=>m.id===f.elements.existing.value);
    for(const k of ['id','name','category','manufacturer','model','description','material','asset','w','h','d'])f.elements[k].value=m?.[k]??({category:'rack',material:'#698296',w:600,h:600,d:600}[k]||'');
    f.elements.id.readOnly=!!m;
  };
  const cat=document.createElement('div');cat.className='card page-card';
  cat.innerHTML='<h2>Категории оборудования</h2><form id="admin-category" class="stack">'+formSelect('existing','Выбрать категорию',{new:'Новая категория',...data.categories},'new')+fields(formField('id','Идентификатор','','required pattern="[a-zA-Z0-9_-]{1,80}"')+formField('name','Название','','required maxlength="80"'),2)+errorLine()+'<div>'+submit('Сохранить категорию')+'</div></form>';
  page.append(cat);
  const cf=$('#admin-category');
  cf.elements.existing.onchange=()=>{
    const id=cf.elements.existing.value;
    cf.elements.id.value=id==='new'?'':id;cf.elements.id.readOnly=id!=='new';cf.elements.name.value=data.categories[id]||'';
  };
}
function exportDialog(){
  if(!p)return;
  dialog('Экспорт проекта','<div class="stack"><p>Скачайте конфигурацию, изображение 3D-сцены или технический отчёт.</p><div class="inline" style="flex-wrap:wrap">'+b('export-pdf','Отчёт PDF','file','primary')+b('export-json','JSON','code')+b('export-png','PNG сцены','image')+'</div></div>');
}
async function withCanvas(fn){
  if(view){view.draw();return fn($('#scene'));}
  const canvas=document.createElement('canvas');canvas.style.cssText='position:fixed;width:1100px;height:700px;top:-2000px';document.body.append(canvas);
  let preview;
  try{
    preview=viewport(canvas,()=>({project:p,options:{selected:new Set(),grid:true,axes:true,zones:zoneDisplay&&zoneOptions,quality}}),{labels(){}});
    preview.draw();return await fn(canvas);
  }finally{preview?.dispose();canvas.remove();}
}
const fileName=()=>p.name.replace(/[\\/:*?"<>|]/g,'-');
function linkFor(key=share){
  const u=new URL('/',location.origin);u.searchParams.set('project',p.id);if(key)u.searchParams.set('share',key);return u.href;
}
async function shareDialog(){
  if(!p)return;
  const grants=p.access==='owner'&&edit()?await api(url('/share')):[];
  dialog('Доступ к проекту','<div class="stack">'+(p.access==='owner'&&edit()?'<form id="share-form" class="stack">'+fields(formSelect('mode','Права доступа',{view:'Только просмотр',edit:'Редактирование'},'view')+formField('days','Срок, дней',30,'type="number" min="1" max="365" required'),2)+errorLine()+'<div>'+submit('Создать ссылку')+'</div></form>':'<p>Откройте эту ссылку, чтобы использовать выданные вам права доступа.</p>')+'<div id="shared-link" class="stack"></div>'+(grants.length?'<h3>Активные ссылки</h3>'+grants.map(g=>'<div class="inline"><small>'+(g.mode==='view'?'Просмотр':'Редактирование')+' · до '+date(g.expires)+'</small>'+b('revoke','Отозвать','trash','small',idData(g.id))+'</div>').join(''):'')+'</div>');
  if(share)showLink(linkFor());
}
function showLink(link){
  const host=$('#shared-link');if(!host)return;
  host.innerHTML='<input id="share-value" aria-label="Ссылка на проект" readonly value="'+esc(link)+'"><div class="inline">'+b('copy-link','Копировать','copy','small')+qrSVG(link)+'</div>';
}
async function versions(){
  if(!p)return;
  const snaps=await api(url('/snapshots'));
  dialog('Версии проекта','<div class="stack">'+(edit()?b('snapshot','Сохранить версию','save','primary'):'')+(snaps.length?snaps.map(s=>'<div class="issue"><strong>'+esc(s.label)+'</strong><small>'+date(s.created)+'</small><div class="inline">'+b('restore-snapshot','Восстановить план','undo','small',idData(s.id)+' '+(!edit()?'disabled':''))+b('export-snapshot','Скачать снимок','download','small',idData(s.id))+'</div></div>').join(''):'<p>Сохранённых версий пока нет.</p>')+'</div>');
}


async function arDialog(){
  if(!p){navigate('projects');toast('Сначала откройте проект.');return;}
  const available=p.objects.filter(o=>o.kind==='equipment');
  if(!available.length){toast('Добавьте в проект оборудование для AR.');return;}
  dialog('AR-просмотр','<div class="stack"><p id="ar-status">Проверяем возможности устройства…</p><div id="quick-objects"></div>'+formSelect('ar-equipment','Объект для ручного размещения или GLB',Object.fromEntries(available.map(o=>[o.id,o.name])),obj()?.id)+'<div class="inline" id="ar-actions" style="flex-wrap:wrap"></div><p>Для запуска на телефоне откройте этот проект по HTTPS.</p><div class="inline">'+b('ar-link','Получить ссылку и QR','link')+b('editor','Открыть 3D','box')+'</div><div class="stack" id="shared-link"></div></div>');
  if(share)showLink(linkFor());
  const target=$('#ar-status'),cap=await arCapability();if(!target?.isConnected)return;
  target.textContent=cap.xr?'WebXR доступен. Наведите камеру на пол для поиска поверхности.':cap.ios?'На этом устройстве доступен просмотр через AR Quick Look.':cap.android?'WebXR недоступен. Используйте Scene Viewer на поддерживаемом устройстве или режим камеры.':cap.camera?'WebXR недоступен. Можно открыть камеру и оценить расположение вручную.':'AR недоступен на этом устройстве или по текущему адресу.';
  $('#ar-actions').innerHTML=(cap.xr?b('launch-xr','Запустить WebXR','ar','primary'):'')+(cap.ios?b('quicklook','Подготовить сцену Quick Look','ar','primary'):'')+(cap.android&&isSecureContext?b('scene-viewer','Подготовить Scene Viewer','ar',cap.xr?'':'primary'):'')+(cap.camera?b('launch-camera','Камера: пообъектное управление','eye'):'')+b('export-glb','Скачать GLB','download')+b('export-usdz','Скачать USDZ','download');
  $('[name=ar-equipment]').onchange=()=>modal.querySelector('.native-link.android')?.remove();
  if(cap.ios){
    const list=$('#quick-objects');
    list.innerHTML='<div class="stack"><h3>Оборудование для Quick Look</h3><label>Режим <select id="quick-mode"><option value="layout">Вся расстановка</option><option value="browse">Перебор объектов</option></select></label><p id="quick-help">Объекты откроются вместе с расстояниями и поворотами из проекта.</p><label class="tick"><input type="checkbox" id="quick-scale" checked>Масштабирование двумя пальцами</label><label class="tick"><input type="checkbox" id="quick-all" checked>Выбрать все</label><div class="stack" style="max-height:11rem;overflow:auto">'+available.map((o,i)=>'<label class="tick"><input type="checkbox" name="quick-object" value="'+esc(o.id)+'" checked>'+(i+1)+'. '+esc(o.name)+'</label>').join('')+'</div></div>';
    const all=$('#quick-all'), boxes=[...list.querySelectorAll('[name=quick-object]')];
    list.onchange=e=>{
      if(e.target.id==='quick-scale'){
        const link=modal.querySelector('.native-link.ios');if(link&&quickURL)link.href=quickLookURL();return;
      }
      if(e.target.id==='quick-mode')$('#quick-help').textContent=e.target.value==='browse'?'В Quick Look перемещайте ползунок: каждые две секунды — следующий объект. Если есть меню вариантов, можно выбрать модель напрямую.':'Объекты откроются вместе с расстояниями и поворотами из проекта.';
      if(e.target===all)for(const box of boxes)box.checked=all.checked;
      const count=boxes.filter(box=>box.checked).length;
      all.checked=count===boxes.length;all.indeterminate=count>0&&count<boxes.length;
      modal.querySelector('.native-link.ios')?.remove();
      if(quickURL){URL.revokeObjectURL(quickURL);quickURL=null;}
      const prepare=modal.querySelector('[data-action=quicklook]');
      prepare.disabled=count===0;
    };
  }
}
function chosenAR(){return p.objects.find(o=>o.id===$('[name=ar-equipment]')?.value)||obj();}
function quickScene(){
  const selected=new Set([...modal.querySelectorAll('[name=quick-object]:checked')].map(el=>el.value));
  return p.objects.filter(o=>selected.has(o.id));
}
function quickLookURL(){return quickURL+($('#quick-scale')?.checked?'':'#allowsContentScaling=0');}
const makeQuickUSDZ=scene=>$('#quick-mode')?.value==='browse'?makeUSDZBrowser(scene):makeUSDZScene(scene);
async function launchAR(native){
  const o=chosenAR();if(!o)return;
  const available=p.objects.filter(o=>o.kind==='equipment');
  const config={objects:available,initial:o.id,canSave:edit(),calibration:user?.preferences?.calibration||1000,
    save:async poses=>{await save();await api(url('/snapshots'),'POST',{poses});toast('Снимок размещения сохранён.');},
    onClose:()=>{activeAR=null;},
    onError:error};
  close();
  try{activeAR=await (native?startXR(config):startCamera(config));}
  catch(e){toast(e.message||'Не удалось запустить AR.',true);await arDialog();}
}
async function createLink(mode='view',days=30){
  await save();
  if(share)return linkFor();
  if(!edit()||p.access!=='owner')throw Error('Создание ссылки доступно владельцу проекта.');
  const r=await api(url('/share'),'POST',{mode,days});return linkFor(r.token);
}
function modelInfo(id){
  const m=catalog.find(x=>x.id===id);if(!m)return;
  dialog(m.name,'<div class="stack"><p>'+esc(m.description)+'</p><p class="mono">'+dims(m.w,m.d,m.h,'мм')+'</p><p>'+esc(m.manufacturer)+' · '+esc(m.model)+(m.weight?' · '+esc(m.weight)+' кг':'')+'</p><div class="inline">'+(edit()?b('place','Разместить в проекте','plus','primary',idData(id)):'')+'</div></div>');
}
function chooseTool(next){
  if(!edit()&&next!=='select')return;
  tool=next;pending='';measureStart=null;
  if(next==='measure'){panel='measure';rightOpen=false;leftOpen=false;}
  refresh();
}
const actions={
  home:()=>navigate('home'),projects:()=>navigate('projects'),new:newProject,editor:()=>{close();navigate('editor');},catalog:()=>navigate('catalog'),docs:()=>navigate('docs'),settings:()=>navigate('settings'),admin:()=>navigate('admin'),
  auth:()=>auth(),register:()=>auth('register'),forgot:()=>auth('forgot'),close,
  'lib-catalog':()=>{library='catalog';filter='';renderLeft();},'lib-room':()=>{library='room';filter='';renderLeft();},
  'toggle-left':()=>{
    if(matchMedia('(min-width:961px)').matches){$('.editor')?.classList.toggle('collapse-desktop');view?.request();return;}
    leftOpen=!leftOpen;if(leftOpen)rightOpen=false;refresh();
  },
  'toggle-right':()=>{rightOpen=!rightOpen;if(rightOpen)leftOpen=false;refresh();},
  'catalog-category':id=>{category=id;navigate('catalog',true);},'model-info':modelInfo,
  'scene-pick':(id,e)=>pick(p.objects.find(o=>o.id===id),e.ctrlKey||e.metaKey),
  'go-issue':id=>{close();pick(p.objects.find(o=>o.id===id),false,true);},
  'unit-cycle':()=>mutate(()=>{const u=Object.keys(units);p.units=u[(u.indexOf(p.units)+1)%u.length];}),
  'remove-measure':id=>mutate(()=>{p.measurements=p.measurements.filter(m=>m.id!==id);}),
  place:id=>{if(!edit())return;close();if(route!=='editor')navigate('editor');pending=id;tool='select';leftOpen=false;refresh();},
  snap:()=>{snap=!snap;refresh();},grid:()=>{grid=!grid;refresh();},zones:()=>{zoneDisplay=!zoneDisplay;refresh();},undo:()=>undo(),redo:()=>undo(true),duplicate,delete:remove,
  room:()=>{panel='room';rightOpen=true;leftOpen=false;refresh();},
  fit:()=>{camera('3d');view?.reset();},'zoom-in':()=>view?.zoom(.8),'zoom-out':()=>view?.zoom(1.25),
  fullscreen:()=>document.fullscreenElement?document.exitFullscreen():$('#viewport').requestFullscreen(),
  validation,save:()=>save(true),rack:()=>{mountUnit=1;rackDialog();},'rack-unit':id=>{mountUnit=Number(id);rackDialog();},
  mount:()=>{
    const rack=obj(),m=catalog.find(m=>m.id===$('#mount-model')?.value);
    if(!rack||!canMount(rack,m,mountUnit))return;
    mutate(()=>rack.slots.push({id:crypto.randomUUID(),ref:m.id,name:m.name,start:mountUnit,u:m.u}));rackDialog();
  },
  unmount:id=>{const rack=obj();if(rack)mutate(()=>{rack.slots=rack.slots.filter(s=>s.id!==id);});rackDialog();},
  'rack-front':()=>rackView(false),'rack-rear':()=>rackView(true),
  ar:arDialog,'launch-xr':()=>launchAR(true),'launch-camera':()=>launchAR(false),
  'ar-link':async()=>{const link=await createLink();showLink(link);},
  'scene-viewer':async()=>{
    const o=chosenAR();if(!o)return;
    await save();
    const {key}=await api(url('/model-access'),'POST',{id:o.id});
    const file=new URL('/api/projects/'+p.id+'/model',location.origin);
    file.searchParams.set('key',key);file.searchParams.set('object',o.id);
    const params=new URLSearchParams({file:file.href,mode:'ar_preferred',resizable:'false',title:o.name});
    const at=$('#ar-actions');if(!at||chosenAR()?.id!==o.id)return;
    at.querySelector('.native-link.android')?.remove();
    const a=document.createElement('a');a.className='btn primary native-link android';a.textContent='Запустить Scene Viewer';
    a.href='intent://arvr.google.com/scene-viewer/1.0?'+params+'#Intent;scheme=https;package=com.google.ar.core;action=android.intent.action.VIEW;S.browser_fallback_url='+encodeURIComponent(linkFor())+';end;';at.prepend(a);
  },
  quicklook:async()=>{
    const at=$('#ar-actions'), scene=quickScene(), mode=$('#quick-mode')?.value;if(!at||!scene.length)return;
    const button=at.querySelector('[data-action=quicklook]');button.disabled=true;
    let bytes;
    try{bytes=await makeQuickUSDZ(scene);}
    finally{if(button.isConnected)button.disabled=quickScene().length===0;}
    if(!at.isConnected||$('#quick-mode')?.value!==mode||quickScene().some((o,i)=>o.id!==scene[i]?.id)||quickScene().length!==scene.length)return;
    if(quickURL)URL.revokeObjectURL(quickURL);
    quickURL=URL.createObjectURL(new Blob([bytes],{type:'model/vnd.usdz+zip'}));
    at.querySelector('.native-link.ios')?.remove();
    const a=document.createElement('a');a.className='btn primary native-link ios';a.rel='ar';a.href=quickLookURL();
    const img=document.createElement('img');img.alt='Запустить Quick Look';img.src='/ar-button.svg';img.width=135;img.height=22;a.append(img);at.prepend(a);
  },
  'export-glb':async()=>{const o=chosenAR();if(o)download(await makeGLB(o),o.name+'.glb','model/gltf-binary');},
  'export-usdz':async()=>{
    if($('#quick-all')){const scene=quickScene();if(scene.length)download(await makeQuickUSDZ(scene),fileName()+'.usdz','model/vnd.usdz+zip');return;}
    const o=chosenAR();if(o)download(await makeUSDZ(o),o.name+'.usdz','model/vnd.usdz+zip');
  },
  export:exportDialog,
  'export-json':()=>download(JSON.stringify({...p,warnings:validate(p)},null,2),fileName()+'.json','application/json'),
  'export-png':()=>withCanvas(canvas=>new Promise((resolve,reject)=>canvas.toBlob(blob=>{if(!blob){reject(Error('Не удалось создать PNG.'));return;}download(blob,fileName()+'.png','image/png');resolve();},'image/png'))),
  'export-pdf':()=>withCanvas(canvas=>report(p,canvas,validate(p),fileName()+'.pdf')),
  share:shareDialog,revoke:async id=>{await api(url('/share'),'DELETE',{id});await shareDialog();},
  'copy-link':async()=>{const el=$('#share-value');if(!el)return;try{await navigator.clipboard.writeText(el.value);toast('Ссылка скопирована.');}catch{el.select();toast('Скопируйте выделенный адрес.');}},
  versions,snapshot:async()=>{await save();await api(url('/snapshots'),'POST',{});await versions();},
  'export-snapshot':async id=>{const q=await api(url('/snapshots')+(share?'&':'?')+'id='+encodeURIComponent(id));download(JSON.stringify(q,null,2),fileName()+'-снимок.json','application/json');},
  'restore-snapshot':async id=>{await save();const q=await api(url('/snapshots'),'PUT',{id,version:p.version});cache(q);close();setProject(q,share);},
  'reload-project':async()=>{const q=await api(url());cache(q);close();setProject(q,share);},
  'open-project':async id=>{await save();setProject(await api('/api/projects/'+id));},
  'copy-project':async id=>{
    const q=projects.find(q=>q.id===id)||p;if(!q)return;
    const src=p?.id===id?p:q;
    const next=await api('/api/projects','POST',{...src,name:(src.name+' · копия').slice(0,100)});
    cache(next);if(revision!==saved)toast('Создана копия с текущими изменениями.');close();setProject(next);
  },
  'delete-project':id=>dialog('Удалить проект?','<div class="stack"><p>Проект будет перемещён в раздел удалённых.</p><div class="dialog-actions">'+b('close','Отмена')+b('confirm-delete-project','Удалить','trash','danger',idData(id))+'</div></div>'),
  'confirm-delete-project':async id=>{await api('/api/projects/'+id,'DELETE');if(p?.id===id){clearTimeout(saveTimer);p=null;history.replaceState(null,'','/');}await refreshProjects();close();navigate('projects',true);},
  'restore-project':async id=>{cache(await api('/api/projects/'+id+'/restore','POST',{}));navigate('projects',true);},
  keys:()=>dialog('Горячие клавиши','<div class="stack">'+[['Delete','Удалить выбранное'],['Ctrl / ⌘ + Z','Отменить'],['Ctrl / ⌘ + Shift + Z','Повторить'],['Ctrl / ⌘ + D','Дублировать'],['Ctrl / ⌘ + S','Сохранить'],['Ctrl / ⌘ + щелчок','Выбрать несколько объектов'],['Shift + перетаскивание','Панорамировать сцену'],['Escape','Отменить размещение или выбор']].map(([k,n])=>'<div class="inline"><span class="tag mono">'+k+'</span><span>'+n+'</span></div>').join('')+'</div>'),
  logout:async()=>{await save();await api('/api/auth/logout','POST',{});location.href='/';}
};
function rackView(rear){
  const o=obj();if(!o||!view)return;
  close();camera('3d');view.cam.yaw=(o.ry+(rear?180:0))*Math.PI/180;view.cam.pitch=.22;view.cam.target=[o.x/1000,(o.y+o.h/2)/1000,o.z/1000];view.cam.distance=Math.max(o.h/1000*1.95,2);view.invalidate();
}
document.addEventListener('click',e=>{
  if(e.target.classList.contains('shade')){close();return;}
  const axis=e.target.closest('[data-view]');if(axis){camera(axis.dataset.view);return;}
  const el=e.target.closest('[data-action]');if(!el||el.disabled)return;
  const k=el.dataset.action;
  if(k.startsWith('panel-')){panel=k.slice(6);refresh();return;}
  if(k.startsWith('tool-')){chooseTool(k.slice(5));return;}
  Promise.resolve().then(()=>actions[k]?.(el.dataset.id,e)).catch(error);
});
document.addEventListener('change',e=>{
  const el=e.target;
  if(Object.hasOwn(zoneOptions,el.dataset.zone)){zoneOptions[el.dataset.zone]=el.checked;zoneDisplay=true;refresh();}
  if(el.dataset.field)editField(el);
  if(el.id==='camera-view')camera(el.value);
  if(el.id==='category'){category=el.value;renderItems();}
  if(el.matches('#new-form [name=units]')){
    const old=units[el.dataset.last],next=units[el.value];for(const k of ['w','l','h'])el.form.elements[k].value=Number(el.form.elements[k].value)*old/next;
    el.dataset.last=el.value;
  }
});
document.addEventListener('input',e=>{if(e.target.id==='filter'){filter=e.target.value;renderItems();}});
document.addEventListener('dragstart',e=>{const el=e.target.closest('[data-item]');if(el&&edit())e.dataTransfer.setData('text/plain',el.dataset.item);});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){
    if(modal.firstChild){close();return;}
    if(activeAR){activeAR.close();return;}
    pending='';measureStart=null;tool='select';pick(null);return;
  }
  if(e.key==='Enter'&&e.target.dataset.field&&e.target.tagName==='INPUT'){e.target.blur();return;}
  const mod=e.ctrlKey||e.metaKey,k=e.key.toLowerCase();
  if(mod&&k==='s'&&p){e.preventDefault();save(true).catch(()=>{});return;}
  if(e.target.closest('input,textarea,select')||modal.firstChild||route!=='editor')return;
  if(e.key==='Delete'){e.preventDefault();remove();}
  if(mod&&k==='z'){e.preventDefault();undo(e.shiftKey);}
  if(mod&&k==='d'){e.preventDefault();duplicate();}
});
window.addEventListener('beforeunload',e=>{if(revision!==saved){e.preventDefault();e.returnValue='';}});
window.addEventListener('online',()=>{status();if(user?.preferences?.notifications!==false)toast('Соединение восстановлено.');if(!saveConflict)save().catch(()=>{});});
window.addEventListener('offline',()=>{status();if(user?.preferences?.notifications!==false)toast('Связь с сервером потеряна.');});
window.addEventListener('resize',()=>{if(route==='editor'&&p)refresh();});


function applyPreferences(){
  const pref=user?.preferences||{};
  quality=pref.quality==='low'?'low':'high';document.body.classList.toggle('light',pref.theme==='light');
}
document.addEventListener('submit',async e=>{
  const form=e.target;e.preventDefault();
  if(form.dataset.busy)return;
  form.dataset.busy='1';
  const button=e.submitter;if(button)button.disabled=true;
  const body=Object.fromEntries(new FormData(form)),out=form.querySelector('.error-line');if(out)out.textContent='';
  try{
    if(form.id==='new-form'){
      await save();
      const u=body.units,r={...defaultRoom,...user.preferences?.room,...Object.fromEntries(['w','l','h'].map(k=>[k,Math.round(Number(body[k])*units[u])]))};
      const q=await api('/api/projects','POST',{name:body.name,description:body.description,units:u,room:r,objects:[],measurements:[],validation:true});
      cache(q);close();setProject(q);
    }
    if(form.id==='auth-form'){
      const kind=form.dataset.kind;
      if(['login','register'].includes(kind))await save();
      const result=await api('/api/auth/'+kind,'POST',body);
      if(kind==='forgot'){close();toast('Если аккаунт существует, ссылка будет отправлена.');}
      else if(kind==='reset'){history.replaceState(null,'','/');auth();toast('Пароль обновлён.');}
      else{
        user=result;applyPreferences();await refreshProjects();close();
        if(kind==='login'&&!share){
          if(projects.some(q=>!q.deleted))setProject(projects.find(q=>!q.deleted));
          else{p=null;history.replaceState(null,'','/');navigate('projects',true);}
        }else if(p)navigate('editor',true);
        else navigate('projects',true);
        toast(kind==='login'?'Вход выполнен.':'Аккаунт создан.');
      }
    }
    if(form.id==='share-form'){showLink(await createLink(body.mode,Number(body.days)));toast('Ссылка создана.');}
    if(form.id==='settings-form'){
      const room={...defaultRoom,...Object.fromEntries(['w','l','h','grid'].map(k=>[k,Number(body[k])]))};
      user=await api('/api/profile','PUT',{name:body.name,preferences:{room,units:body.units,language:'ru',quality:body.quality,theme:body.theme,calibration:Number(body.calibration),notifications:body.notifications==='on'}});
      applyPreferences();navigate('settings',true);toast('Настройки сохранены.');
    }
    if(form.classList.contains('role-form')){await api('/api/admin','PUT',body);toast('Роль обновлена.');}
    if(form.id==='admin-category'){
      Object.assign(categories,await api('/api/admin/categories','PUT',{id:body.id,name:body.name}));
      navigate('admin',true);toast('Категория сохранена.');
    }
    if(form.id==='admin-model'){
      const file=body.file;
      if(file?.size){
        const format=file.name.split('.').pop().toLowerCase();
        if(!['glb','gltf'].includes(format))throw Error('Допустимые форматы: GLB и glTF.');
        body.asset=(await api('/api/assets?format='+format,'POST',file)).id;
        form.elements.asset.value=body.asset;
      }
      if(!body.asset)throw Error('Выберите файл модели.');
      delete body.file;delete body.existing;for(const k of ['w','d','h'])body[k]=Number(body[k]);
      await api('/api/admin','POST',body);
      catalog=(await api('/api/bootstrap')).catalog;navigate('admin',true);toast('Модель сохранена.');
    }
  }catch(err){if(out)out.textContent=err.message;else error(err);}
  finally{delete form.dataset.busy;if(button)button.disabled=false;}
});
async function boot(){
  const key=query.get('share')||'',id=query.get('project');
  const data=await api('/api/bootstrap'+(key?'?share=1':''));
  user=data.user;catalog=data.catalog;Object.assign(categories,data.categories);applyPreferences();await refreshProjects();
  if(id){
    try{setProject(await api('/api/projects/'+encodeURIComponent(id)+(key?'?share='+encodeURIComponent(key):'')),key);}
    catch(e){navigate('projects',true);error(e);}
  }else{
    const q=data.project||projects.find(q=>!q.deleted);
    if(q)setProject(q);else navigate('projects',true);
  }
  if(query.has('reset'))auth('reset');
}
boot().catch(e=>{
  app.innerHTML='<div class="boot"><div class="brand-mark">'+icon('logo')+'</div><strong>Не удалось загрузить рабочее пространство</strong><small>'+esc(e.message)+'</small><button class="btn" id="reload-app">Повторить</button></div>';
  $('#reload-app').onclick=()=>location.reload();
});

