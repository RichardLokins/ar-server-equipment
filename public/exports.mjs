
import {faces,objectParts,objectPose,transform} from './geometry.mjs';
import {bounds,placement,units} from './domain.mjs';
import {floorArea} from './area.mjs';
const encode=s=>new TextEncoder().encode(s);
function concat(chunks){
  const out=new Uint8Array(chunks.reduce((n,b)=>n+b.length,0));let offset=0;
  for(const b of chunks){out.set(b,offset);offset+=b.length;}
  return out;
}
export function download(data,name,type){
  const url=URL.createObjectURL(data instanceof Blob?data:new Blob([data],{type}));
  const a=document.createElement('a');a.download=name;a.href=url;document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),12000);
}
async function partsFor(o,asset){
  if(!asset&&o.asset&&typeof window!=='undefined'){
    try{asset=await (await import('./view.mjs')).loadModel(o.asset);}catch{throw Error('Не удалось загрузить 3D-модель для экспорта.');}
  }
  return objectParts(o,'high',asset);
}
function triangles(part){
  if(part.mesh){
    const output=[];
    for(let i=0;i<part.mesh.length;i+=6)output.push(transform(part.m,part.mesh.subarray(i,i+3)).slice(0,3));
    return output;
  }
  return faces.flatMap(([,q])=>[0,1,2,0,2,3].map(i=>transform(part.m,q[i]).slice(0,3)));
}
async function modelGeometry(o,asset,projectPoint=point=>[point[0],point[1]+o.h/2000,point[2]]){
  const groups=new Map();
  for(const p of await partsFor(o,asset)){
    const key=p.c.join(',');
    if(!groups.has(key))groups.set(key,{color:p.c,vertices:[]});
    const list=groups.get(key).vertices;
    for(const point of triangles(p))list.push(projectPoint(point));
  }
  return [...groups.values()];
}
export async function makeGLB(o,asset){
  const data={asset:{version:'2.0',generator:'AR SERVER EQUIPMENT'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0}],meshes:[{primitives:[]}],buffers:[{byteLength:0}],bufferViews:[],accessors:[],materials:[]},chunks=[];
  for(const g of await modelGeometry(o,asset)){
    const i=data.accessors.length,packed=new Float32Array(g.vertices.length*3);
    const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
    g.vertices.forEach((v,j)=>{packed.set(v,j*3);v.forEach((n,k)=>{min[k]=Math.min(n,min[k]);max[k]=Math.max(n,max[k]);});});
    chunks.push(new Uint8Array(packed.buffer));
    data.bufferViews.push({buffer:0,byteOffset:data.buffers[0].byteLength,byteLength:packed.byteLength,target:34962});
    data.buffers[0].byteLength+=packed.byteLength;
    data.accessors.push({bufferView:i,componentType:5126,count:g.vertices.length,type:'VEC3',min,max});
    data.materials.push({doubleSided:true,alphaMode:g.color[3]<1?'BLEND':'OPAQUE',pbrMetallicRoughness:{baseColorFactor:g.color,metallicFactor:.1,roughnessFactor:.72}});
    data.meshes[0].primitives.push({attributes:{POSITION:i},material:i,mode:4});
  }
  const meta=encode(JSON.stringify(data)), pad=new Uint8Array((4-meta.length%4)%4).fill(32), raw=concat(chunks);
  const h=new Uint8Array(20),b=new Uint8Array(8),hv=new DataView(h.buffer),bv=new DataView(b.buffer);
  [0x46546c67,2,28+meta.length+pad.length+raw.length,meta.length+pad.length,0x4e4f534a].forEach((v,i)=>hv.setUint32(i*4,v,true));
  bv.setUint32(0,raw.length,true);bv.setUint32(4,0x004e4942,true);
  return concat([h,meta,pad,b,raw]);
}
const crcTable=Array.from({length:256},(_,n)=>{for(let j=0;j<8;j++)n=(n>>>1)^((n&1)?0xedb88320:0);return n>>>0;});
function zipUSD(name,payload){
  const filename=encode(name), extra=64-((30+filename.length)%64)+(64-((30+filename.length)%64)<4?64:0);
  const crc=payload.reduce((n,v)=>(n>>>8)^crcTable[(n^v)&255],0xffffffff)^0xffffffff;
  const local=new Uint8Array(30+filename.length+extra), cd=new Uint8Array(46+filename.length), end=new Uint8Array(22);
  const l=new DataView(local.buffer),c=new DataView(cd.buffer),e=new DataView(end.buffer);
  l.setUint32(0,0x04034b50,true);l.setUint16(4,20,true);l.setUint32(14,crc,true);l.setUint32(18,payload.length,true);l.setUint32(22,payload.length,true);l.setUint16(26,filename.length,true);l.setUint16(28,extra,true);local.set(filename,30);l.setUint16(30+filename.length,0x1986,true);l.setUint16(32+filename.length,extra-4,true);
  c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint32(16,crc,true);c.setUint32(20,payload.length,true);c.setUint32(24,payload.length,true);c.setUint16(28,filename.length,true);cd.set(filename,46);
  e.setUint32(0,0x06054b50,true);e.setUint16(8,1,true);e.setUint16(10,1,true);e.setUint32(12,cd.length,true);e.setUint32(16,local.length+payload.length,true);
  return concat([local,payload,cd,end]);
}
export async function makeUSDZ(o){
  return packUSDZ([await modelGeometry(o)]);
}
export async function makeUSDZScene(objects){
  if(!objects.length)throw Error('Выберите оборудование для сцены.');
  const boxes=objects.map(bounds);
  const midpoint=i=>(Math.min(...boxes.map(b=>b.center[i]-b.extent[i]))+Math.max(...boxes.map(b=>b.center[i]+b.extent[i])))/2000;
  const origin=[midpoint(0),Math.min(0,...boxes.map(b=>b.center[1]-b.extent[1]))/1000,midpoint(2)];
  const models=[], assets=new Map();
  for(const o of objects){
    if(o.asset&&!assets.has(o.asset)&&typeof window!=='undefined'){
      try{assets.set(o.asset,await (await import('./view.mjs')).loadModel(o.asset));}
      catch{throw Error('Не удалось загрузить 3D-модель для экспорта.');}
    }
    const matrix=objectPose(o);
    models.push(await modelGeometry(o,assets.get(o.asset),p=>transform(matrix,p).slice(0,3).map((v,i)=>v-origin[i])));
  }
  return packUSDZ(models);
}
export async function makeUSDZBrowser(objects){
  if(!objects.length)throw Error('Выберите оборудование для просмотра.');
  const models=[], assets=new Map();
  for(const o of objects){
    if(o.asset&&!assets.has(o.asset)&&typeof window!=='undefined'){
      try{assets.set(o.asset,await (await import('./view.mjs')).loadModel(o.asset));}
      catch{throw Error('Не удалось загрузить 3D-модель для экспорта.');}
    }
    models.push(await modelGeometry(o,assets.get(o.asset)));
  }
  return packUSDZ(models,models.length>1);
}
function browserVariants(count){
  const frames=60,last=count*frames-1;
  const indices=Array.from({length:count},(_,i)=>i);
  const objectName=i=>'Object_'+i;
  const animated=indices.map(i=>{
    const first=i*frames,end=first+frames-1,keys=new Map([[0,false],[last,false]]);
    if(first>0)keys.set(first-1,false);
    keys.set(first,true);keys.set(end,true);
    if(end<last)keys.set(end+1,false);
    const samples=[...keys].sort(([a],[b])=>a-b).map(([time,visible])=>time+': '+(visible?'(1, 1, 1)':'(0, 0, 0)')).join(', ');
    return '   over "'+objectName(i)+'" {\n    float3 xformOp:scale.timeSamples = { '+samples+' }\n    uniform token[] xformOpOrder = ["xformOp:scale"]\n   }\n';
  }).join('');
  const variants=indices.map(i=>'  "Model_'+String(i+1).padStart(2,'0')+'" {\n'+indices.filter(j=>j!==i).map(j=>'   over "'+objectName(j)+'" {\n    token visibility = "invisible"\n   }\n').join('')+'  }\n').join('');
  return {
    stage:' startTimeCode = 0\n endTimeCode = '+last+'\n timeCodesPerSecond = 30\n autoPlay = false\n',
    root:' (\n variants = { string Model = "Browse" }\n prepend variantSets = "Model"\n)',
    body:' variantSet "Model" = {\n  "Browse" {\n'+animated+'  }\n'+variants+' }\n'
  };
}
function packUSDZ(models,browse=false){
  const tuple=a=>'('+a.map(n=>Number(n.toFixed(6))).join(', ')+')';
  const variants=browse?browserVariants(models.length):{stage:'',root:'',body:''};
  let text='#usda 1.0\n(\n defaultPrim = "Equipment"\n metersPerUnit = 1\n upAxis = "Y"\n'+variants.stage+')\ndef Xform "Equipment"'+variants.root+' {\n';
  for(const [j,groups] of models.entries()){
    const item='Object_'+j;
    text+=' def Xform "'+item+'" {\n';
    for(const [i,g] of groups.entries()){
      const name='Surface_'+i, path='/Equipment/'+item+'/'+name;
      text+=' def Material "'+name+'" {\n token outputs:surface.connect = <'+path+'/Shader.outputs:surface>\n def Shader "Shader" {\n uniform token info:id = "UsdPreviewSurface"\n color3f inputs:diffuseColor = '+tuple(g.color.slice(0,3))+'\n float inputs:roughness = 0.72\n token outputs:surface\n }\n }\n';
      text+=' def Mesh "Mesh_'+i+'" {\n uniform token subdivisionScheme = "none"\n bool doubleSided = true\n rel material:binding = <'+path+'>\n point3f[] points = ['+g.vertices.map(tuple).join(',')+']\n int[] faceVertexCounts = ['+Array(g.vertices.length/3).fill(3).join(',')+']\n int[] faceVertexIndices = ['+g.vertices.map((_,k)=>k).join(',')+']\n }\n';
    }
    text+=' }\n';
  }
  return zipUSD('Equipment.usda',encode(text+variants.body+'}\n'));
}
function pdf(images){
  const files=[],offsets=[0];let bytes=0;
  function push(data){const b=typeof data==='string'?encode(data):data;files.push(b);bytes+=b.length;}
  function object(id,entries){offsets[id]=bytes;push(id+' 0 obj\n');entries.forEach(push);push('\nendobj\n');}
  push('%PDF-1.4\n');
  object(1,['<< /Type /Catalog /Pages 2 0 R >>']);
  object(2,['<< /Type /Pages /Count '+images.length+' /Kids ['+images.map((_,i)=>3+i*3+' 0 R').join(' ')+'] >>']);
  images.forEach((image,i)=>{
    const id=3+i*3, instructions='q\n595 0 0 842 0 0 cm\n/Im0 Do\nQ\n';
    object(id,['<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im0 '+(id+1)+' 0 R >> >> /Contents '+(id+2)+' 0 R >>']);
    object(id+1,['<< /Type /XObject /Subtype /Image /Width 1190 /Height 1684 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+image.length+' >>\nstream\n',image,'\nendstream']);
    object(id+2,['<< /Length '+instructions.length+' >>\nstream\n'+instructions+'endstream']);
  });
  const xref=bytes;
  push('xref\n0 '+offsets.length+'\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size '+offsets.length+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF\n');
  return concat(files);
}
export async function report(project,source,warnings,name){
  const pages=[],r=project.room,u=project.units,fmt=n=>new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2}).format(n/units[u]);
  let canvas,ctx,y;
  function page(){
    canvas=document.createElement('canvas');canvas.width=1190;canvas.height=1684;ctx=canvas.getContext('2d');
    ctx.fillStyle='#ffffff';ctx.fillRect(0,0,1190,1684);ctx.fillStyle='#14314a';ctx.fillRect(0,0,1190,112);
    ctx.fillStyle='#ffffff';ctx.font='bold 29px sans-serif';ctx.fillText('AR SERVER EQUIPMENT',64,70);
    ctx.fillStyle='#667c91';ctx.font='20px sans-serif';ctx.fillText('Технический отчёт · '+(pages.length+1),64,1632);
    ctx.fillText(new Date().toLocaleDateString('ru-RU'),950,1632);
    y=155;pages.push(canvas);
  }
  function paragraph(text,size=23,tint='#24394a',bold=false){
    const font=(bold?'bold ':'')+size+'px sans-serif';
    ctx.font=font;
    const tokens=String(text).split(/\s+/).flatMap(v=>v.length>70?v.match(/.{1,70}/g):[v]);let line='';
    const write=part=>{
      if(y+size+10>1580)page();
      ctx.font=font;ctx.fillStyle=tint;ctx.fillText(part,64,y);y+=size+11;
    };
    for(const word of tokens){const test=(line+' '+word).trim();if(ctx.measureText(test).width>1050&&line){write(line);line=word;}else line=test;}
    if(line)write(line);
  }
  function head(t){y+=20;paragraph(t,28,'#14314a',true);}
  page();paragraph(project.name,38,'#132a40',true);
  paragraph(project.description||'Описание не указано.');
  paragraph('Помещение: '+[r.w,r.l,r.h].map(fmt).join(' × ')+' '+u);
  const area=floorArea(project),areaText=new Intl.NumberFormat('ru-RU',{maximumFractionDigits:3});
  paragraph('Площадь пола: '+areaText.format(area.total)+' м² · свободно '+areaText.format(area.free)+' м²',20);
  paragraph('Создано: '+(project.created?new Date(project.created).toLocaleDateString('ru-RU'):'—')+'  ·  Версия: '+project.version,20,'#557089');
  if(source?.width){
    y+=9;const dw=Math.min(1060,560*source.width/source.height),dh=dw*source.height/source.width;
    ctx.drawImage(source,64+(1060-dw)/2,y,dw,dh);y+=dh+34;
  }
  const objects=project.objects.filter(o=>o.kind==='equipment');
  head('Состав оборудования');
  const quantity=new Map();
  objects.forEach(o=>{const item=quantity.get(o.ref)||{name:o.name,count:0};item.count++;quantity.set(o.ref,item);});
  for(const [model,entry] of quantity)paragraph(entry.name+' · '+model+' · '+entry.count+' шт.');
  if(!objects.length)paragraph('Оборудование отсутствует.');
  head('Объекты и координаты');
  for(const original of project.objects){
    const o=placement(original,r), occupied=(o.slots||[]).reduce((n,s)=>n+s.u,0);
    paragraph(o.name,23,'#233c56',true);
    paragraph('Габариты: '+[o.w,o.d,o.h].map(fmt).join(' × ')+' '+u+'  ·  X/Y/Z: '+[o.x,o.y,o.z].map(fmt).join(' / ')+' '+u+'  ·  Y-поворот: '+o.ry+'°',20);
    if(o.rack){paragraph('Стойка: '+o.rack+' U · занято '+occupied+' U · свободно '+(o.rack-occupied)+' U',20);for(const s of o.slots)paragraph(s.start+' U · '+s.name+' · '+s.u+' U',18);}
  }
  head('Геометрическая проверка');
  if(!warnings.length)paragraph(project.validation?'Геометрических конфликтов не обнаружено.':'Геометрическая проверка отключена.');
  for(const w of warnings){paragraph(w.name+' — '+w.message,22,w.severity==='error'?'#a92735':'#80500d',true);paragraph(w.action+' · X '+fmt(w.location[0])+' '+u+' · Z '+fmt(w.location[1])+' '+u,20);}
  if(project.measurements.length){head('Замеры');project.measurements.forEach((m,i)=>paragraph((i+1)+'. '+fmt(Math.hypot(...m.a.map((x,j)=>x-m.b[j])))+' '+u));}
  const images=await Promise.all(pages.map(c=>new Promise((res,rej)=>c.toBlob(async blob=>blob?res(new Uint8Array(await blob.arrayBuffer())):rej(Error('Ошибка формирования PDF.')),'image/jpeg',.88))));
  download(pdf(images),name,'application/pdf');
}


function gfMul(a,b){let result=0;for(let i=0;i<8;i++){if(b&1)result^=a;b>>>=1;a=(a<<1)^((a&128)?0x11d:0);}return result;}
function qrParity(data){
  const n=24,g=Array(n).fill(0);g[n-1]=1;
  let root=1;
  for(let i=0;i<n;i++){
    for(let j=0;j<n;j++){g[j]=gfMul(g[j],root);if(j+1<n)g[j]^=g[j+1];}
    root=gfMul(root,2);
  }
  const rem=Array(n).fill(0);
  for(const b of data){const f=b^rem.shift();rem.push(0);for(let i=0;i<n;i++)rem[i]^=gfMul(g[i],f);}
  return rem;
}
export function qrSVG(url){
  const bytes=encode(url),length=49,capacity=194;
  if(bytes.length>192)return '<small>Адрес слишком длинный для QR-кода. Скопируйте ссылку.</small>';
  const bits=[];
  const push=(v,n)=>{for(let i=n-1;i>=0;i--)bits.push(v>>i&1);};
  push(4,4);push(bytes.length,8);for(const b of bytes)push(b,8);
  push(0,Math.min(4,capacity*8-bits.length));while(bits.length%8)bits.push(0);
  const code=[];
  for(let i=0;i<bits.length;i+=8)code.push(bits.slice(i,i+8).reduce((n,v)=>n*2+v,0));
  for(let i=0;code.length<capacity;i++)code.push(i%2?0x11:0xec);
  const data=[code.slice(0,97),code.slice(97)],parity=data.map(qrParity),payload=[];
  for(const blocks of [data,parity])for(let i=0;i<blocks[0].length;i++)payload.push(blocks[0][i],blocks[1][i]);
  const m=Array.from({length},()=>Array(length).fill(null));
  const set=(x,y,v)=>{if(x>=0&&y>=0&&x<length&&y<length)m[y][x]=!!v;};
  for(let i=0;i<length;i++){set(6,i,i%2===0);set(i,6,i%2===0);}
  for(const [cx,cy] of [[3,3],[length-4,3],[3,length-4]])
    for(let y=-4;y<=4;y++)for(let x=-4;x<=4;x++){const d=Math.max(Math.abs(x),Math.abs(y));set(cx+x,cy+y,d!==2&&d!==4);}
  for(const cx of [6,24,42])for(const cy of [6,24,42]){
    if((cx===6&&(cy===6||cy===42))||(cx===42&&cy===6))continue;
    for(let y=-2;y<=2;y++)for(let x=-2;x<=2;x++)set(cx+x,cy+y,Math.max(Math.abs(x),Math.abs(y))!==1);
  }
  const bch=(v,n,poly)=>{let rem=v;for(let i=0;i<n;i++)rem=(rem<<1)^((rem>>(n-1)&1)*poly);return v<<n|rem;};
  const version=bch(8,12,0x1f25);
  for(let i=0;i<18;i++){const a=length-11+i%3,b=Math.floor(i/3);set(a,b,version>>i&1);set(b,a,version>>i&1);}
  const format=bch(8,10,0x537)^0x5412, bit=i=>format>>i&1;
  for(let i=0;i<=5;i++)set(8,i,bit(i));set(8,7,bit(6));set(8,8,bit(7));set(7,8,bit(8));
  for(let i=9;i<15;i++)set(14-i,8,bit(i));
  for(let i=0;i<8;i++)set(length-1-i,8,bit(i));
  for(let i=8;i<15;i++)set(8,length-15+i,bit(i));
  set(8,length-8,true);
  let k=0;
  for(let x=length-1;x>=1;x-=2){
    if(x===6)x--;
    for(let j=0;j<length;j++){
      const y=((x+1)&2)===0?length-1-j:j;
      for(const xx of [x,x-1])if(m[y][xx]===null){
        const v=(payload[k>>>3]??0)>>(7-(k&7))&1;k++;set(xx,y,v^((xx+y)%2===0?1:0));
      }
    }
  }
  let path='';
  for(let y=0;y<length;y++)for(let x=0;x<length;x++)if(m[y][x])path+='M'+(x+4)+' '+(y+4)+'h1v1h-1z';
  return '<svg class="qr" aria-label="QR-код ссылки на проект" role="img" viewBox="0 0 '+(length+8)+' '+(length+8)+'" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="white"/><path d="'+path+'" fill="#101923"/></svg>';
}

