
import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {defaultRoom,catalog,makeObject,validate,demo,canMount,placement} from '../public/domain.mjs';
import {makeGLB,makeUSDZ,makeUSDZScene,makeUSDZBrowser,qrSVG} from '../public/exports.mjs';
import {floorArea} from '../public/area.mjs';

const dir=mkdtempSync(join(tmpdir(),'arse-test-'));
process.env.DATA_DIR=dir;
const {handler}=await import('../server.mjs');
after(()=>{try{rmSync(dir,{recursive:true,force:true});}catch{}});

function client(){
  let cookie='';
  return async(path,method='GET',body)=>{
    const bytes=body===undefined?[]:[body instanceof Uint8Array?Buffer.from(body):Buffer.from(JSON.stringify(body))];
    const req={url:path,method,headers:{cookie,host:'localhost:4173'},socket:{remoteAddress:'test'},async *[Symbol.asyncIterator](){yield* bytes;}};
    const headers={};let status,payload;
    const res={setHeader(k,v){headers[k.toLowerCase()]=v;},writeHead(s,h){status=s;for(const [k,v] of Object.entries(h))this.setHeader(k,v);this.headersSent=true;},end(data){payload=data;}};
    await handler(req,res);
    if(headers['set-cookie'])cookie=headers['set-cookie'].split(';')[0];
    const data=headers['content-type']?.startsWith('application/json')?JSON.parse(payload):payload;
    return {status,data,headers};
  };
}
test('account, room, version-safe save, isolation, sharing, model export, snapshots, deletion and restore',async()=>{
  const owner=client(),visitor=client();
  const first=await owner('/api/bootstrap');
  assert.equal(first.status,200);
  assert.equal(first.data.project.objects.filter(o=>o.kind==='door').length,2);
  assert.equal(first.data.project.objects.filter(o=>o.rack).length,5);
  const credentials={name:'Инженер',email:'designer@example.test',password:'a-long-test-password'};
  assert.equal((await owner('/api/auth/register','POST',credentials)).status,201);
  assert.equal((await owner('/api/auth/logout','POST',{})).status,200);
  assert.equal((await owner('/api/auth/login','POST',credentials)).status,200);
  const created=await owner('/api/projects','POST',{name:'Приёмочные испытания',description:'',units:'мм',room:defaultRoom,objects:[],measurements:[],validation:true});
  assert.equal(created.status,201);
  const q=created.data,url='/api/projects/'+q.id;
  assert.equal((await visitor(url)).status,404);
  const rack=makeObject(catalog[0],750,500),second=makeObject(catalog[0],750,500);
  rack.ry=90;q.objects.push(rack,second);
  assert.ok(validate(q).some(w=>w.severity==='error'&&w.message.includes('Пересечение с')));
  assert.equal((await owner(url,'PUT',q)).status,200);
  assert.equal((await owner(url,'PUT',q)).status,409);
  const loaded=(await owner(url)).data;
  assert.deepEqual(loaded.room,defaultRoom);
  assert.deepEqual(loaded.objects.map(o=>[o.x,o.z,o.ry]),[[750,500,90],[750,500,0]]);
  const grant=await owner(url+'/share','POST',{mode:'view',days:1});
  const key='?share='+grant.data.token;
  assert.equal((await visitor(url+key)).status,200);
  assert.equal((await visitor(url+key,'PUT',loaded)).status,403);
  const glb=await visitor(url+'/model'+key+'&object='+rack.id);
  assert.equal(glb.status,200);assert.equal(Buffer.from(glb.data).toString('ascii',0,4),'glTF');
  const scoped=(await visitor(url+'/model-access'+key,'POST',{id:rack.id})).data.key;
  assert.equal((await visitor(url+'/model?key='+scoped+'&object='+rack.id)).status,200);
  assert.equal((await visitor(url+'/model?key='+scoped+'&object='+second.id)).status,404);
  assert.equal((await visitor(url+'?key='+scoped)).status,404);
  const writer=(await owner(url+'/share','POST',{mode:'edit',days:1})).data.token;
  loaded.objects[0].x=1200;
  assert.equal((await visitor(url+'?share='+writer,'PUT',loaded)).status,200);
  const snap=await owner(url+'/snapshots','POST',{});
  assert.equal(snap.status,201);
  assert.equal((await owner(url+'/snapshots')).data.length,1);
  assert.equal((await owner(url,'DELETE')).status,200);
  assert.equal((await visitor(url+key)).status,404);
  assert.equal((await owner(url+'/restore','POST',{})).data.deleted,null);
});
test('rotation, clearances, boundaries and rack occupancy',()=>{
  const q=demo(), rack=q.objects[0], mounted=catalog.find(m=>m.id==='server-2');
  assert.equal(canMount(rack,mounted,8),false);
  assert.equal(canMount(rack,mounted,7),false);
  assert.equal(canMount(rack,mounted,10),true);
  assert.equal(canMount(rack,mounted,42),false);
  assert.equal(placement(q.objects.find(o=>o.kind==='door'),q.room).z,-4000);
  rack.x=3000;
  assert.ok(validate(q).some(w=>w.id===rack.id&&w.message.includes('границу')));
});
test('floor area clips the room boundary and counts overlapping projections once',()=>{
  const a={...makeObject(catalog[0]),w:1000,d:1000};
  const b={...a,x:500};
  const c={...a,x:3000};
  const lifted={...a,y:100,z:2500};
  assert.deepEqual(floorArea({room:defaultRoom,objects:[a,b,c,lifted]}),{total:48,covered:2,free:46});
  const rotated={...a,ry:45};
  assert.ok(Math.abs(floorArea({room:defaultRoom,objects:[a,rotated]}).covered-(5-2*Math.sqrt(2)-1))<1e-8);
});
test('GLB uses metre dimensions, USDZ has uncompressed aligned root, QR contains modules',async()=>{
  const rack=makeObject(catalog[0]), glb=await makeGLB(rack);
  const header=new DataView(glb.buffer),len=header.getUint32(12,true);
  const json=JSON.parse(new TextDecoder().decode(glb.slice(20,20+len)));
  assert.equal(header.getUint32(8,true),glb.byteLength);
  assert.ok(Math.abs(Math.max(...json.accessors.map(a=>a.max[1]))-rack.h/1000)<1e-5);
  const usdz=await makeUSDZ(rack),zip=new DataView(usdz.buffer);
  assert.equal(zip.getUint32(0,true),0x04034b50);
  assert.equal(zip.getUint16(8,true),0);
  assert.equal((30+zip.getUint16(26,true)+zip.getUint16(28,true))%64,0);
  assert.match(new TextDecoder().decode(usdz),/metersPerUnit = 1/);
  assert.match(qrSVG('https://example.test/project?id=1'),/M4 4h1v1h-1z/);
});
test('USDZ scene keeps multiple objects, metre distances and rotation',async()=>{
  const first={...makeObject(catalog[0],1000,0),kind:'obstacle',rack:0,w:1000,h:1000,d:500};
  const second={...first,x:3000,y:500,ry:90};
  const file=await makeUSDZScene([first,second]);
  const view=new DataView(file.buffer), start=30+view.getUint16(26,true)+view.getUint16(28,true);
  const usd=new TextDecoder().decode(file.subarray(start,start+view.getUint32(18,true)));
  assert.match(usd,/metersPerUnit = 1/);
  const pointSets=[...usd.matchAll(/point3f\[\] points = \[([^\]]+)\]/g)].map(match=>[...match[1].matchAll(/\(([^)]+)\)/g)].map(row=>row[1].split(',').map(Number)));
  assert.equal(pointSets.length,2);
  const range=(points,i)=>[Math.min(...points.map(p=>p[i])),Math.max(...points.map(p=>p[i]))];
  assert.deepEqual(range(pointSets[0],0),[-1.375,-0.375]);
  assert.deepEqual(range(pointSets[1],0),[0.875,1.375]);
  assert.deepEqual(range(pointSets[1],1),[0.5,1.5]);
  assert.deepEqual(range(pointSets[1],2),[-0.5,0.5]);
  await assert.rejects(makeUSDZScene([]),/Выберите оборудование/);
});
test('Quick Look browser authors a paused timeline and selectable variants on the default prim',async()=>{
  const a=makeObject(catalog[0],1000,0),b=makeObject(catalog[1],3000,0);
  const usd=new TextDecoder().decode(await makeUSDZBrowser([a,b]));
  assert.match(usd,/autoPlay = false/);
  assert.match(usd,/endTimeCode = 119/);
  assert.match(usd,/def Xform "Equipment" \(\s*variants = \{ string Model = "Browse" \}/);
  assert.match(usd,/timeSamples = \{ 0: \(1, 1, 1\), 59: \(1, 1, 1\), 60: \(0, 0, 0\), 119: \(0, 0, 0\) \}/);
  assert.match(usd,/timeSamples = \{ 0: \(0, 0, 0\), 59: \(0, 0, 0\), 60: \(1, 1, 1\), 119: \(1, 1, 1\) \}/);
  assert.match(usd,/"Model_01" \{\s*over "Object_1" \{\s*token visibility = "invisible"/);
  assert.match(usd,/"Model_02" \{\s*over "Object_0" \{\s*token visibility = "invisible"/);
  assert.doesNotMatch(new TextDecoder().decode(await makeUSDZBrowser([a])),/timeSamples|variantSet/);
});

