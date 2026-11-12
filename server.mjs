
import {createServer as http} from 'node:http';
import {createServer as https} from 'node:https';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID,randomBytes,createHash,scryptSync,timingSafeEqual} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync,existsSync,statSync} from 'node:fs';
import {join,resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {catalog,categories,demo,types,wallNames,canMount} from './public/domain.mjs';
import {makeGLB} from './public/exports.mjs';
import {loadModel} from './public/view.mjs';

const root=fileURLToPath(new URL('.',import.meta.url)), dir=resolve(process.env.DATA_DIR||join(root,'data'));
mkdirSync(join(dir,'assets'),{recursive:true});
const db=new DatabaseSync(join(dir,'projects.sqlite'));
db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
db.exec(readFileSync(join(root,'schema.sql'),'utf8'));
const sql=(query,...params)=>db.prepare(query).run(...params);
const one=(query,...params)=>db.prepare(query).get(...params);
const all=(query,...params)=>db.prepare(query).all(...params);
const json=JSON.stringify, parse=JSON.parse;
const token=()=>randomBytes(32).toString('base64url');
const hash=s=>createHash('sha256').update(s).digest('hex');
const password=s=>{const salt=randomBytes(16).toString('hex');return salt+':'+scryptSync(s,salt,64).toString('hex');};
function compare(value,stored) {
  if(!stored) return false;
  const [salt,derived]=stored.split(':');
  return timingSafeEqual(scryptSync(value,salt,64),Buffer.from(derived,'hex'));
}
const stamp=()=>new Date().toISOString();
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const integer=(n,a,b)=>Number.isSafeInteger(n)&&n>=a&&n<=b;
const number=(n,a,b)=>typeof n==='number'&&Number.isFinite(n)&&n>=a&&n<=b;
const string=(s,max)=>typeof s==='string'&&s.length<=max;
const idFormat=/^[a-zA-Z0-9_-]{1,80}$/;
const validId=s=>typeof s==='string'&&idFormat.test(s);
const emailFormat=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const validEmail=s=>string(s,254)&&emailFormat.test(s);
const roles=['admin','engineer','user','viewer'];
const categoryList=()=>({...categories,...Object.fromEntries(all('SELECT id,name FROM equipment_categories ORDER BY name').map(c=>[c.id,c.name]))});
const modelList=()=>[...catalog,...all('SELECT body FROM equipment_models').map(r=>parse(r.body))];
const adminEmail=process.env.ADMIN_EMAIL?.toLowerCase();
if(adminEmail&&process.env.ADMIN_PASSWORD?.length>=12&&!one('SELECT id FROM users WHERE email=?',adminEmail))
  sql('INSERT INTO users(id,email,password,name,role) VALUES(?,?,?,?,?)',randomUUID(),adminEmail,password(process.env.ADMIN_PASSWORD),'Администратор','admin');

function transaction(fn){
  db.exec('BEGIN IMMEDIATE');
  try{const result=fn();db.exec('COMMIT');return result;}
  catch(e){db.exec('ROLLBACK');throw e;}
}
function cleanProject(p) {
  if(!p||!string(p.name,100)||!p.name.trim()||!string(p.description,4000)||!['мм','см','м'].includes(p.units)) fail(400,'Проверьте название и параметры проекта.');
  const r=p.room;
  if(!r||!['w','l','h'].every(k=>integer(r[k],300,100000))||!integer(r.thickness,20,2000)||!integer(r.grid,25,5000)||!['tile','concrete','raised'].includes(r.floor)||!['walls','ceiling'].every(k=>typeof r[k]==='boolean')) fail(400,'Проверьте размеры и настройки помещения.');
  if(!Array.isArray(p.objects)||p.objects.length>300||!Array.isArray(p.measurements)||p.measurements.length>200||typeof p.validation!=='boolean') fail(400,'Некорректный состав проекта.');
  const ids=new Set();
  for(const o of p.objects){
    if(!o||!validId(o.id)||ids.has(o.id)||!(o.kind==='equipment'||Object.hasOwn(types,o.kind))||!string(o.name,120)||!['x','y','z'].every(k=>number(o[k],-200000,200000))||!['w','d','h'].every(k=>integer(o[k],1,100000))||!['rx','ry','rz'].every(k=>number(o[k],-3600,3600))||!/^#[0-9a-f]{6}$/i.test(o.color)) fail(400,'Некорректные параметры объекта.');
    ids.add(o.id);
    if(o.wall&&(!Object.hasOwn(wallNames,o.wall)||!number(o.offset,-100000,100000))) fail(400,'Некорректная привязка к стене.');
    if(o.kind==='door'&&!['in-left','in-right','out-left','out-right','slide'].includes(o.swing)) fail(400,'Некорректное направление двери.');
    if(o.kind==='equipment'){
      if(!validId(o.ref)||!integer(o.rack,0,60)||!integer(o.u,0,60)||!Array.isArray(o.slots)||o.slots.length>60||!['front','rear','side'].every(k=>integer(o[k],0,20000))||(o.asset&&!validId(o.asset))) fail(400,'Некорректные параметры оборудования.');
      if(o.rack&&o.h<Math.round(o.rack*44.45+145)) fail(400,'Высоты корпуса недостаточно для выбранного количества юнитов.');
      const occupied=new Set();
      for(const s of o.slots){
        const model=s&&catalog.find(m=>m.id===s.ref);
        if(!s||!integer(s.start,1,o.rack)||!integer(s.u,1,o.rack)||!string(s.name,120)||!validId(s.id)||!validId(s.ref)||model?.u!==s.u||!canMount({...o,slots:[]},model,s.start)) fail(400,'Некорректный монтаж в стойку.');
        for(let i=s.start;i<s.start+s.u;i++){if(occupied.has(i)) fail(400,'Юнит уже занят.');occupied.add(i);}
      }
    }
  }
  for(const m of p.measurements) if(!m||!validId(m.id)||![m.a,m.b].every(a=>Array.isArray(a)&&a.length===3&&a.every(v=>number(v,-200000,200000)))) fail(400,'Некорректный замер.');
  return {name:p.name.trim(),description:p.description,units:p.units,room:r,objects:p.objects,measurements:p.measurements,validation:p.validation};
}
function saveParts(id,p){
  sql('INSERT INTO rooms(project_id,body) VALUES(?,?) ON CONFLICT(project_id) DO UPDATE SET body=excluded.body',id,json(p.room));
  for(const [table,objects] of [['project_objects',p.objects.filter(o=>o.kind==='equipment')],['room_elements',p.objects.filter(o=>o.kind!=='equipment')]]){
    sql('DELETE FROM '+table+' WHERE project_id=?',id);
    for(const o of objects) sql('INSERT INTO '+table+'(project_id,id,ordinal,body) VALUES(?,?,?,?)',id,o.id,p.objects.indexOf(o),json(o));
  }
}
function rowProject(row,access){
  const room=parse(one('SELECT body FROM rooms WHERE project_id=?',row.id).body);
  const objects=all('SELECT ordinal,body FROM project_objects WHERE project_id=? UNION ALL SELECT ordinal,body FROM room_elements WHERE project_id=? ORDER BY ordinal',row.id,row.id).map(x=>parse(x.body));
  return {id:row.id,name:row.name,description:row.description,units:row.units,room,objects,measurements:parse(row.measurements),validation:!!row.validation,created:row.created,modified:row.modified,version:row.version,deleted:row.deleted,access};
}
function createProject(user,p){
  return transaction(()=>{
    const id=randomUUID(),now=stamp();
    sql('INSERT INTO projects(id,owner,name,description,units,measurements,validation,created,modified) VALUES(?,?,?,?,?,?,?,?,?)',id,user,p.name,p.description,p.units,json(p.measurements),+p.validation,now,now);
    saveParts(id,p);
    return rowProject(one('SELECT * FROM projects WHERE id=?',id),'owner');
  });
}
function saveProject(row,p,version,access){
  return transaction(()=>{
    const now=stamp();
    if(!sql('UPDATE projects SET name=?,description=?,units=?,measurements=?,validation=?,modified=?,version=version+1 WHERE id=? AND version=? AND deleted IS NULL',p.name,p.description,p.units,json(p.measurements),+p.validation,now,row.id,version).changes) fail(409,'Проект изменён в другой сессии. Сохраните копию или откройте актуальную версию.');
    saveParts(row.id,p);
    return rowProject(one('SELECT * FROM projects WHERE id=?',row.id),access);
  });
}
const secure=!!(process.env.TLS_CERT&&process.env.TLS_KEY)||process.env.BEHIND_HTTPS==='1';
function cookie(res,value,age=2592000){
  res.setHeader('Set-Cookie','arse='+value+'; Path=/; HttpOnly; SameSite=Lax; Max-Age='+age+(secure?'; Secure':''));
}
function newSession(res,id,old){
  if(old) sql('DELETE FROM sessions WHERE token=?',hash(old));
  const t=token();
  sql('INSERT INTO sessions(token,user_id,expires) VALUES(?,?,?)',hash(t),id,Date.now()+2592000000);
  cookie(res,t);
}
function send(res,data,status=200){
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
  res.end(json(data));
}
async function body(req,limit=2_500_000){
  const pieces=[];let bytes=0;
  for await(const piece of req){bytes+=piece.length;if(bytes>limit)fail(413,'Файл или запрос превышает допустимый размер.');pieces.push(piece);}
  return Buffer.concat(pieces);
}
async function data(req){try{return parse((await body(req)).toString('utf8'));}catch(e){if(e.status)throw e;fail(400,'Некорректный JSON.');}}
const attempts=new Map();
function limit(req,key,max){
  const now=Date.now(), ip=req.socket.remoteAddress;
  if(attempts.size>2048) for(const [k,v] of attempts) if(v.until<now) attempts.delete(k);
  const id=ip+':'+key,entry=attempts.get(id);
  if(!entry||entry.until<now) attempts.set(id,{until:now+60000,n:1});
  else if(++entry.n>max) fail(429,'Слишком много запросов. Повторите через минуту.');
}
const userInfo=u=>({id:u.id,name:u.name,email:u.email,role:u.role,preferences:parse(u.preferences)});
const requireUser=u=>{if(!u)fail(401,'Войдите в приложение.');};
const requireAdmin=u=>{if(u?.role!=='admin')fail(403,'Требуются права администратора.');};
function modelCheck(bytes,kind){
  let gltf;
  try {
    if(kind==='glb'){
      if(bytes.length<20||bytes.toString('ascii',0,4)!=='glTF'||bytes.readUInt32LE(4)!==2||bytes.readUInt32LE(8)!==bytes.length||bytes.readUInt32LE(16)!==0x4e4f534a||bytes.readUInt32LE(12)>bytes.length-20) throw Error();
      gltf=parse(bytes.toString('utf8',20,20+bytes.readUInt32LE(12)));
    } else gltf=parse(bytes.toString('utf8'));
    if(gltf.asset?.version!=='2.0'||!Array.isArray(gltf.meshes)||!gltf.meshes.length||gltf.extensionsRequired?.length) throw Error();
    for(const item of [...(gltf.buffers||[]),...(gltf.images||[])]) if(item.uri&&!/^data:(application\/(octet-stream|gltf-buffer)|image\/(png|jpeg|webp));base64,/.test(item.uri)) throw Error();
  }catch{fail(400,'Поддерживаются автономные модели glTF 2.0 и GLB без внешних ресурсов и обязательных расширений.');}
}
async function recovery(email){
  if(!process.env.RECOVERY_WEBHOOK||!process.env.PUBLIC_ORIGIN) fail(503,'Сервис восстановления пароля ещё не настроен.');
  const u=one("SELECT * FROM users WHERE email=? AND role!='guest'",email);
  if(!u) return;
  const t=token();
  sql('INSERT INTO password_resets(token,user_id,expires) VALUES(?,?,?)',hash(t),u.id,Date.now()+1800000);
  try{
    const response=await fetch(process.env.RECOVERY_WEBHOOK,{method:'POST',headers:{'Content-Type':'application/json',...(process.env.RECOVERY_SECRET?{Authorization:'Bearer '+process.env.RECOVERY_SECRET}:{})},body:json({email,url:new URL('/?reset='+t,process.env.PUBLIC_ORIGIN).href}),signal:AbortSignal.timeout(5000)});
    if(!response.ok) throw Error();
  }catch{sql('DELETE FROM password_resets WHERE token=?',hash(t));fail(503,'Сервис восстановления временно недоступен.');}
}
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'};
export const handler=async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Permissions-Policy','camera=(self), xr-spatial-tracking=(self)');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
  try{
    const url=new URL(req.url,'http://localhost'),path=url.pathname,method=req.method;
    if(!path.startsWith('/api/')){
      if(!['GET','HEAD'].includes(method)) fail(405,'Метод недоступен.');
      const file=resolve(root,'public',path==='/'?'index.html':'.'+path);
      if(!Object.hasOwn(mime,extname(file))||!existsSync(file)||!statSync(file).isFile()) fail(404,'Страница не найдена.');
      res.writeHead(200,{'Content-Type':mime[extname(file)],'Cache-Control':'no-cache'});
      return res.end(method==='HEAD'?undefined:readFileSync(file));
    }
    if(method!=='GET'){
      const origin=req.headers.origin,allowed=process.env.PUBLIC_ORIGIN?new URL(process.env.PUBLIC_ORIGIN).origin:(secure?'https://':'http://')+req.headers.host;
      if(origin&&origin!==allowed) fail(403,'Запрос с внешнего адреса отклонён.');
    }
    const session=(req.headers.cookie||'').match(/(?:^|; *)arse=([\w-]{43})(?:;|$)/)?.[1];
    const user=session&&one('SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token=? AND s.expires>?',hash(session),Date.now());
    if(path==='/api/bootstrap'&&method==='GET'){
      if(user||url.searchParams.has('share')) return send(res,{user:user?userInfo(user):null,catalog:modelList(),categories:categoryList()});
      limit(req,'guest',24);
      const id=randomUUID();
      sql("INSERT INTO users(id,name,role) VALUES(?,?,'guest')",id,'Гость');
      const project=createProject(id,demo());
      newSession(res,id,session);
      return send(res,{user:userInfo(one('SELECT * FROM users WHERE id=?',id)),catalog:modelList(),categories:categoryList(),project});
    }
    if(path.startsWith('/api/auth/')&&method==='POST'){
      limit(req,'auth',12);
      if(path.endsWith('/logout')){if(session)sql('DELETE FROM sessions WHERE token=?',hash(session));cookie(res,'',0);return send(res,{ok:true});}
      const b=await data(req), email=typeof b.email==='string'?b.email.trim().toLowerCase():'';
      if(path.endsWith('/forgot')){if(!validEmail(email))fail(400,'Введите корректный email.');await recovery(email);return send(res,{ok:true});}
      if(path.endsWith('/reset')){
        if(!string(b.token,100)||!string(b.password,128)||b.password.length<10) fail(400,'Пароль должен содержать не менее 10 символов.');
        transaction(()=>{
          const reset=one('SELECT * FROM password_resets WHERE token=? AND expires>?',hash(b.token),Date.now());
          if(!reset)fail(400,'Срок действия ссылки истёк.');
          sql('UPDATE users SET password=? WHERE id=?',password(b.password),reset.user_id);
          sql('DELETE FROM password_resets WHERE user_id=?',reset.user_id);
          sql('DELETE FROM sessions WHERE user_id=?',reset.user_id);
        });
        return send(res,{ok:true});
      }
      if(!validEmail(email)||!string(b.password,128)||b.password.length<10) fail(400,'Введите email и пароль длиной от 10 символов.');
      if(path.endsWith('/register')){
        if(!string(b.name,80)||!b.name.trim()) fail(400,'Введите имя.');
        const id=user?.role==='guest'?user.id:randomUUID();
        try{
          if(user?.role==='guest') sql("UPDATE users SET name=?,email=?,password=?,role='user' WHERE id=?",b.name.trim(),email,password(b.password),id);
          else sql("INSERT INTO users(id,name,email,password,role) VALUES(?,?,?,?,'user')",id,b.name.trim(),email,password(b.password));
        }catch(e){if(e.code==='ERR_SQLITE_ERROR'&&e.message.includes('UNIQUE')) fail(409,'Этот email уже зарегистрирован.');throw e;}
        newSession(res,id,session);
        return send(res,userInfo(one('SELECT * FROM users WHERE id=?',id)),201);
      }
      if(path.endsWith('/login')){
        const found=one('SELECT * FROM users WHERE email=?',email);
        const matched=compare(b.password,found?.password||dummyPassword);
        if(!found||!matched)fail(401,'Неверный email или пароль.');
        newSession(res,found.id,session);
        return send(res,userInfo(found));
      }
    }
    if(path==='/api/profile'&&method==='PUT'){
      requireUser(user);
      const b=await data(req);
      const pref=b.preferences,r=pref?.room;
      if(!string(b.name,80)||!b.name.trim()||!r||!['w','l','h'].every(k=>integer(r[k],300,100000))||!integer(r.grid,25,5000)||!integer(pref.calibration,100,5000)||!['мм','см','м'].includes(pref.units)||!['high','low'].includes(pref.quality)||!['dark','light'].includes(pref.theme)||pref.language!=='ru'||typeof pref.notifications!=='boolean'||json(pref).length>1800) fail(400,'Проверьте настройки профиля.');
      sql('UPDATE users SET name=?,preferences=? WHERE id=?',b.name.trim(),json(b.preferences),user.id);
      return send(res,userInfo(one('SELECT * FROM users WHERE id=?',user.id)));
    }
    if(path==='/api/projects'){
      requireUser(user);
      if(method==='GET')return send(res,all('SELECT * FROM projects WHERE owner=? ORDER BY modified DESC',user.id).map(r=>rowProject(r,'owner')));
      if(user.role==='viewer')fail(403,'У вашей роли доступ только для просмотра.');
      if(method==='POST')return send(res,createProject(user.id,cleanProject(await data(req))),201);
    }
    const projectRoute=path.match(/^\/api\/projects\/([\w-]+)(?:\/(share|snapshots|restore|model|model-access))?$/);
    if(projectRoute){
      const [,id,action]=projectRoute,t=url.searchParams.get('share');
      const row=one('SELECT * FROM projects WHERE id=?',id);
      const grant=t&&row&&one('SELECT * FROM project_permissions WHERE token=? AND project_id=? AND expires>?',hash(t),id,Date.now());
      const modelToken=action==='model'&&url.searchParams.get('key');
      const scoped=modelToken&&row&&one('SELECT * FROM model_permissions WHERE token=? AND project_id=? AND object_id=? AND expires>?',hash(modelToken),id,url.searchParams.get('object'),Date.now());
      const access=user?.id===row?.owner?'owner':grant?.mode||(scoped?'view':undefined);
      if(!row||!access||(row.deleted&&access!=='owner'))fail(404,'Проект не найден или доступ закрыт.');
      const canEdit=(access==='owner'||access==='edit')&&user?.role!=='viewer';
      if(action==='model-access'&&method==='POST'){
        limit(req,'model-access',20);
        const b=await data(req),p=rowProject(row,access);
        if(!p.objects.some(o=>o.kind==='equipment'&&o.id===b.id))fail(404,'Оборудование не найдено.');
        const key=token();
        sql('DELETE FROM model_permissions WHERE expires<=?',Date.now());
        sql('INSERT INTO model_permissions(token,project_id,object_id,expires) VALUES(?,?,?,?)',hash(key),id,b.id,Date.now()+900000);
        return send(res,{key},201);
      }
      if(action==='model'&&method==='GET'){
        limit(req,'model',30);
        const p=rowProject(row,access),o=p.objects.find(o=>o.kind==='equipment'&&o.id===url.searchParams.get('object'));
        if(!o)fail(404,'Оборудование не найдено.');
        let asset;
        if(o.asset){
          const row=one('SELECT id FROM uploaded_assets WHERE id=?',o.asset);
          if(!row)fail(404,'3D-модель не найдена.');
          const raw=readFileSync(join(dir,'assets',row.id));
          asset=await loadModel(row.id,raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength));
        }
        const model=await makeGLB(o,asset);
        res.writeHead(200,{'Content-Type':'model/gltf-binary','Content-Length':model.byteLength,'Cache-Control':'private, no-store'});
        return res.end(model);
      }
      if(action==='share'){
        if(access!=='owner'||!canEdit)fail(403,'Ссылками управляет владелец проекта.');
        if(method==='GET')return send(res,all('SELECT id,mode,expires FROM project_permissions WHERE project_id=? AND expires>?',id,Date.now()));
        const b=await data(req);
        if(method==='DELETE'){sql('DELETE FROM project_permissions WHERE id=? AND project_id=?',b.id,id);return send(res,{ok:true});}
        if(method==='POST'){
          if(!['view','edit'].includes(b.mode)||!integer(b.days,1,365))fail(400,'Укажите тип и срок доступа.');
          const raw=token();
          sql('INSERT INTO project_permissions(id,token,project_id,mode,expires) VALUES(?,?,?,?,?)',randomUUID(),hash(raw),id,b.mode,Date.now()+b.days*86400000);
          return send(res,{token:raw});
        }
      }
      if(action==='snapshots'){
        if(method==='GET'){
          const snapshot=url.searchParams.get('id');
          if(!snapshot)return send(res,all('SELECT id,created,label FROM project_snapshots WHERE project_id=? ORDER BY created DESC',id));
          const saved=one('SELECT created,label,body FROM project_snapshots WHERE project_id=? AND id=?',id,snapshot);
          if(!saved)fail(404,'Снимок не найден.');
          return send(res,{...parse(saved.body),captured:saved.created,label:saved.label});
        }
        if(!canEdit)fail(403,'Доступ только для просмотра.');
        const b=await data(req);
        if(method==='POST'){
          const snapshot=randomUUID(),p=rowProject(row,access), extras=b.poses;
          if(extras&&(!Array.isArray(extras)||extras.length>100||extras.some(x=>!x||!p.objects.some(o=>o.id===x.id&&o.kind==='equipment')||!Array.isArray(x.matrix)||x.matrix.length!==16||x.matrix.some(v=>!number(v,-10000,10000)))))fail(400,'Некорректные позиции AR.');
          sql('INSERT INTO project_snapshots(id,project_id,created,label,body) VALUES(?,?,?,?,?)',snapshot,id,stamp(),extras?'Размещение в AR':'Версия проекта',json({...p,poses:extras||[]}));
          return send(res,{id:snapshot},201);
        }
        if(method==='PUT'){
          const snap=one('SELECT body FROM project_snapshots WHERE id=? AND project_id=?',b.id,id);
          if(!snap)fail(404,'Снимок не найден.');
          return send(res,saveProject(row,cleanProject(parse(snap.body)),b.version,access));
        }
      }
      if(action==='restore'&&method==='POST'&&access==='owner'&&canEdit){
        sql('UPDATE projects SET deleted=NULL,version=version+1 WHERE id=? AND deleted IS NOT NULL',id);
        return send(res,rowProject(one('SELECT * FROM projects WHERE id=?',id),access));
      }
      if(!action&&method==='GET')return send(res,rowProject(row,access));
      if(!canEdit)fail(403,'Доступ только для просмотра.');
      if(!action&&method==='PUT'){
        const b=await data(req);
        return send(res,saveProject(row,cleanProject(b),b.version,access));
      }
      if(!action&&method==='DELETE'&&access==='owner'){
        sql('UPDATE projects SET deleted=?,version=version+1 WHERE id=? AND deleted IS NULL',stamp(),id);
        return send(res,{ok:true});
      }
    }
    if(path==='/api/admin'){
      requireAdmin(user);
      if(method==='GET')return send(res,{users:all('SELECT id,email,name,role FROM users ORDER BY name LIMIT 200'),projects:one('SELECT count(*) n FROM projects WHERE deleted IS NULL').n,assets:one('SELECT count(*) n FROM uploaded_assets').n,models:all('SELECT body FROM equipment_models').map(r=>parse(r.body)),categories:categoryList()});
      const b=await data(req);
      if(method==='PUT'){
        if(!roles.includes(b.role)||b.id===user.id||!one('SELECT id FROM users WHERE id=? AND email IS NOT NULL',b.id))fail(400,'Нельзя назначить эту роль выбранному пользователю.');
        sql('UPDATE users SET role=? WHERE id=?',b.role,b.id);
        return send(res,{ok:true});
      }
      if(method==='POST'){
        if(!validId(b.id)||catalog.some(e=>e.id===b.id)||!string(b.name,100)||!b.name.trim()||!string(b.manufacturer,100)||!string(b.model,100)||!string(b.description,800)||!Object.hasOwn(categoryList(),b.category)||!['w','h','d'].every(k=>integer(b[k],1,10000))||!/^#[a-f\d]{6}$/i.test(b.material)||!one('SELECT id FROM uploaded_assets WHERE id=?',b.asset))fail(400,'Проверьте параметры модели и загрузите файл.');
        sql('INSERT INTO equipment_models(id,body) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body',b.id,json(b));
        return send(res,{ok:true});
      }
    }
    if(path==='/api/admin/categories'&&method==='PUT'){
      requireAdmin(user);
      const b=await data(req);
      if(!validId(b.id)||['all','new','__proto__','constructor','prototype'].includes(b.id)||!string(b.name,80)||!b.name.trim())fail(400,'Укажите идентификатор и название категории.');
      sql('INSERT INTO equipment_categories(id,name) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name',b.id,b.name.trim());
      return send(res,categoryList());
    }
    if(path==='/api/assets'&&method==='POST'){
      requireAdmin(user);
      limit(req,'upload',12);
      const kind=url.searchParams.get('format');
      if(!['glb','gltf'].includes(kind))fail(400,'Допустимые форматы: GLB и glTF.');
      const bytes=await body(req,15*1024*1024);
      modelCheck(bytes,kind);
      const id=randomUUID();
      writeFileSync(join(dir,'assets',id),bytes,{flag:'wx'});
      sql('INSERT INTO uploaded_assets(id,format,size,owner) VALUES(?,?,?,?)',id,kind,bytes.length,user.id);
      return send(res,{id},201);
    }
    const asset=path.match(/^\/api\/assets\/([\w-]+)$/);
    if(asset&&method==='GET'){
      const row=one('SELECT * FROM uploaded_assets WHERE id=?',asset[1]);
      if(!row)fail(404,'Модель не найдена.');
      res.writeHead(200,{'Content-Type':row.format==='glb'?'model/gltf-binary':'model/gltf+json','Cache-Control':'public, max-age=86400'});
      return res.end(readFileSync(join(dir,'assets',row.id)));
    }
    fail(404,'Запрос не найден.');
  }catch(e){
    if(!e.status)console.error(e);
    if(!res.headersSent)send(res,{error:e.status?e.message:'Ошибка сервера. Повторите запрос.'},e.status||500);
    else res.end();
  }
};
const dummyPassword=password(randomUUID());
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const tls=Boolean(process.env.TLS_CERT&&process.env.TLS_KEY);
  const server=tls?https({cert:readFileSync(process.env.TLS_CERT),key:readFileSync(process.env.TLS_KEY)},handler):http(handler);
  server.listen(Number(process.env.PORT||4173),process.env.HOST||'127.0.0.1',()=>console.log('AR SERVER EQUIPMENT: '+(tls?'https':'http')+'://'+(process.env.HOST||'localhost')+':'+server.address().port));
}

