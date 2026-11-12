
export const units = {мм:1, см:10, м:1000};
export const wallNames = {north:'Северная',south:'Южная',west:'Западная',east:'Восточная'};
export const types = {door:'Дверь',window:'Окно',column:'Колонна',pillar:'Опора',wall:'Перегородка',obstacle:'Препятствие',cable:'Кабельный ввод',vent:'Вентиляция'};
export const categories = {rack:'Серверные стойки',server:'Серверы',network:'Сетевое оборудование',power:'Электропитание',storage:'Хранение данных',cooling:'Охлаждение',accessory:'Аксессуары'};
function equipment(id, name, category, w, d, h, extra = {}) {
  return {id,name,category,w,d,h,manufacturer:'Учебный каталог',model:id.toUpperCase(),weight:null,description:'Демонстрационная модель. Габариты приведены для планирования.',material:category==='cooling'?'#8299aa':'#304555',...extra};
}
export const catalog = [
  ...[42,24,18,27,36,45,48].map(n=>equipment('rack-'+n,'Серверная стойка '+n+'U','rack',600,n===18?800:1000,Math.round(n*44.45+145),{rack:n})),
  equipment('network-rack','Сетевая стойка 42U','rack',800,1000,2012,{rack:42,style:'network'}),
  equipment('open','Открытая стойка 42U','rack',600,900,2012,{rack:42,style:'open'}),
  equipment('wall-rack','Настенная стойка 18U','rack',600,550,945,{rack:18,style:'wall'}),
  ...[1,2,4].map(n=>equipment('server-'+n,'Сервер '+n+'U','server',482,650,Math.round(n*44.45),{u:n})),
  equipment('tower','Башенный сервер','server',230,560,480),
  ...[['switch','Коммутатор Ethernet'],['core','Магистральный коммутатор'],['router','Маршрутизатор'],['patch','Патч-панель'],['firewall','Межсетевой экран']].map(([id,n])=>equipment(id,n,'network',482,350,44,{u:1})),
  equipment('ups','Напольный ИБП','power',600,850,1170),equipment('rack-ups','Стоечный ИБП','power',482,600,89,{u:2}),
  equipment('pdu','Блок распределения питания','power',482,150,44,{u:1}),equipment('battery','Батарейный шкаф','power',600,800,1300),
  ...[['nas','NAS'],['san','SAN'],['array','Дисковый массив'],['storage-shelf','Дисковая полка']].map(([id,n])=>equipment(id,n,'storage',482,650,89,{u:2})),
  equipment('cool','Прецизионный кондиционер','cooling',750,800,1950),equipment('in-row','Межрядный кондиционер','cooling',300,1000,1950),
  equipment('air','Распределитель воздуха','cooling',650,550,800),
  ...[['shelf','Полка'],['cable-guide','Кабельный органайзер'],['horizontal','Горизонтальный органайзер'],['blank','Заглушка']].map(([id,n])=>equipment(id,n,'accessory',482,id==='shelf'?400:100,44,{u:1})),
  equipment('vertical','Вертикальный органайзер','accessory',90,100,1800)
];
export const defaultRoom = {w:6000,l:8000,h:3000,thickness:150,grid:250,floor:'tile',walls:true,ceiling:false};
export const roomElement = (kind, id = crypto.randomUUID()) => {
  const dims = {door:[1000,120,2100],window:[1600,120,1000],column:[400,400,3000],pillar:[300,300,2600],wall:[1700,150,2200],obstacle:[600,600,700],cable:[450,450,35],vent:[700,100,400]};
  const [w,d,h]=dims[kind];
  return {id,kind,name:types[kind],x:0,z:0,y:kind==='window'?1100:kind==='vent'?2100:0,w,d,h,ry:0,rx:0,rz:0,wall:['door','window','vent'].includes(kind)?'north':'',offset:0,swing:'in-left',color:'#738a9b'};
};
export const makeObject = (item, x=0,z=0,id=crypto.randomUUID()) => ({
  id,kind:'equipment',ref:item.id,name:item.name,category:item.category,x,y:0,z,w:item.w,d:item.d,h:item.h,rx:0,ry:0,rz:0,rack:item.rack||0,u:item.u||0,style:item.style||'',color:item.material,asset:item.asset||'',front:item.rack?1000:0,rear:item.rack?750:0,side:0,slots:[]
});
export function demo() {
  const rack=catalog[0], network=catalog.find(m=>m.id==='network-rack');
  const objects=[[-1450,-1450],[ -680,-1450],[90,-1450],[860,-1450]].map(([x,z],i)=>({...makeObject(rack,x,z,'rack-'+(i+1)),name:'Серверная стойка 42U · '+String(i+1).padStart(2,'0'),side:i===0?220:0,slots:i===0?[{id:'sample-server',ref:'server-2',start:8,u:2,name:'Сервер 2U'}]:[]}));
  objects.push(makeObject(network,1870,450,'net'),makeObject(catalog.find(m=>m.id==='ups'),-1580,1390,'ups'),makeObject(catalog.find(m=>m.id==='cool'),-2400,-2950,'cool'));
  objects.push({...roomElement('door','door-1'),wall:'north',offset:1760}, {...roomElement('door','door-2'),wall:'west',offset:2350}, {...roomElement('window','window-1'),offset:-550});
  return {name:'Демонстрационная серверная',description:'План размещения стоек и инженерного оборудования.',units:'мм',room:{...defaultRoom},objects,measurements:[],validation:true};
}
export function placement(o,r) {
  if(!o.wall) return o;
  const side=o.wall==='west'||o.wall==='east';
  return {...o,x:side?(o.wall==='west'?-1:1)*r.w/2:o.offset,z:side?o.offset:(o.wall==='north'?-1:1)*r.l/2,ry:side?90:0};
}
export const radians = degrees=>degrees*Math.PI/180;
export function axesFor(o) {
  const a=radians(o.rx||0), b=radians(o.ry||0), c=radians(o.rz||0);
  const sa=Math.sin(a),ca=Math.cos(a),sb=Math.sin(b),cb=Math.cos(b),sc=Math.sin(c),cc=Math.cos(c);
  return [[cb*cc,ca*sc+sa*sb*cc,sa*sc-ca*sb*cc],[-cb*sc,ca*cc-sa*sb*sc,sa*cc+ca*sb*sc],[sb,-sa*cb,ca*cb]];
}
const dot=(a,b)=>a.reduce((n,x,i)=>n+x*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export function bounds(o) {
  const axes=axesFor(o), half=[o.w/2,o.h/2,o.d/2], center=[o.x,o.y+o.h/2,o.z];
  const extent=[0,1,2].map(i=>axes.reduce((n,a,j)=>n+Math.abs(a[i])*half[j],0));
  return {axes,half,center,extent};
}
export function overlaps(a,b) {
  const delta=b.center.map((v,i)=>v-a.center[i]);
  const tests=[...a.axes,...b.axes,...a.axes.flatMap(x=>b.axes.map(y=>cross(x,y)))];
  return tests.every(axis=>{
    const len=Math.hypot(...axis);
    if(len<1e-8) return true;
    const radius=shape=>shape.axes.reduce((n,v,i)=>n+Math.abs(dot(v,axis))*shape.half[i],0);
    return Math.abs(dot(delta,axis))<radius(a)+radius(b)-0.01*len;
  });
}
export function zones(o) {
  const a=radians(o.ry||0), sin=Math.sin(a),cos=Math.cos(a);
  function zone(zoneType,name,x,z,w,d) {
    return {...o,zoneType,name,x:o.x+x*cos+z*sin,z:o.z-x*sin+z*cos,w,d,h:Math.min(o.h,2100),rx:0,rz:0};
  }
  const list=[];
  if(o.front>0) list.push(zone('front','Передний доступ',0,(o.d+o.front)/2,o.w,o.front));
  if(o.rear>0) list.push(zone('rear','Задний доступ',0,-(o.d+o.rear)/2,o.w,o.rear));
  if(o.side>0) list.push(zone('side','Боковой доступ',(o.w+o.side)/2,0,o.side,o.d),zone('side','Боковой доступ',-(o.w+o.side)/2,0,o.side,o.d));
  return list;
}
export function doorZone(o) {
  if(o.swing==='slide'||o.swing?.startsWith('out')) return [];
  const sign=['north','west'].includes(o.wall)?1:-1, left=o.swing==='in-right'?-1:1;
  const hinge=o.offset-left*o.w/2;
  return Array.from({length:12},(_,i)=>{
    const lo=i*o.w/12,hi=(i+1)*o.w/12, length=Math.sqrt(o.w*o.w-hi*hi);
    const side=o.wall==='west'||o.wall==='east', depth=sign*(lo+hi)/2, along=hinge+left*length/2;
    return {...o,x:side?o.x+depth:along,z:side?along:o.z+depth,w:side?hi-lo:length,d:side?length:hi-lo,ry:0,rx:0,rz:0};
  }).filter(v=>v.w>0&&v.d>0);
}
export function validate(project) {
  if(!project.validation) return [];
  const r=project.room, items=project.objects.map(o=>placement(o,r)), solids=items.filter(o=>!['door','window','vent','cable'].includes(o.kind));
  const issues=[], boxes=solids.map(bounds);
  const outside=b=>b.center.some((v,i)=>v-b.extent[i]<[-r.w/2,0,-r.l/2][i]-.01||v+b.extent[i]>[r.w/2,r.h,r.l/2][i]+.01);
  const add=(severity,o,message,action)=>issues.push({severity,id:o.id,name:o.name,message,action,location:[Math.round(o.x),Math.round(o.z)]});
  solids.forEach((o,i)=>{
    if(outside(boxes[i])) add('error',o,'Объект пересекает границу помещения','Переместите объект внутрь помещения.');
    for(let j=i+1;j<solids.length;j++) if(overlaps(boxes[i],boxes[j])) add('error',o,'Пересечение с «'+solids[j].name+'»','Разведите объекты.');
    for(const zone of zones(o)){
      const box=bounds(zone), hit=solids.find((_,j)=>j!==i&&overlaps(box,boxes[j]));
      if(hit||outside(box)) add('warning',o,zone.name+(hit?' перекрыт: '+hit.name:' выходит за границу комнаты'),'Освободите настроенную зону доступа.');
    }
  });
  for(const door of items.filter(o=>o.kind==='door')) {
    const swept=doorZone(door).map(bounds);
    solids.forEach((o,i)=>{if(swept.some(b=>overlaps(b,boxes[i]))) add('warning',o,'В зоне открывания двери','Переместите оборудование или измените открывание.');});
  }
  for(const o of items.filter(o=>o.wall)) {
    const span=['west','east'].includes(o.wall)?r.l:r.w;
    if(Math.abs(o.offset)+o.w/2>span/2||o.y<0||o.y+o.h>r.h) add('error',o,'Проём выходит за пределы стены','Измените габариты или положение проёма.');
  }
  return issues;
}
export function canMount(rack, equipment, start) {
  if(!equipment?.u||!rack.rack||!Number.isInteger(start)||start<1||start+equipment.u-1>rack.rack||equipment.d>rack.d-75||equipment.w>rack.w-75) return false;
  return !rack.slots.some(s=>start<s.start+s.u&&s.start<start+equipment.u);
}

