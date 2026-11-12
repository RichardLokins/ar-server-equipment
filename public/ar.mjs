
import {renderer,loadModel} from './view.mjs';
import {multiply,objectParts,pose,box,look,projection} from './geometry.mjs';
import {icon} from './icons.mjs';

const identity=[[1,0,0],[0,1,0],[0,0,1]];
const yaw=(angle,at=[0,0,0])=>pose([[Math.cos(angle),0,-Math.sin(angle)],[0,1,0],[Math.sin(angle),0,Math.cos(angle)]],at);
const translation=(x,y,z)=>pose(identity,[x,y,z]);
const objectMatrix=(position,angle,scale)=>multiply(multiply(position,yaw(angle)),pose(identity,[0,0,0],[scale,scale,scale]));
const extent=(o,scale=1)=>[o.w,o.d,o.h].map(n=>Math.round(n*scale)).join(' × ')+' мм';
export async function arCapability(){
  let xr=false;
  try{xr=isSecureContext&&!!navigator.xr&&await navigator.xr.isSessionSupported('immersive-ar');}catch{}
  const ua=navigator.userAgent, ios=/iPad|iPhone|iPod/.test(ua)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  const anchor=document.createElement('a');
  let quick=false;try{quick=anchor.relList.supports('ar');}catch{}
  return {xr,ios:ios&&quick,android:/Android/.test(ua),camera:isSecureContext&&!!navigator.mediaDevices?.getUserMedia};
}
function interfaceFor(config,manual){
  const container=document.createElement('section');container.className='ar-full';
  const canvas=document.createElement('canvas');container.append(canvas);
  const overlay=document.createElement('div');overlay.className='ar-overlay';
  const top=document.createElement('div'),bottom=document.createElement('div'),status=document.createElement('p');
  status.className='ar-message';
  function button(text,kind,accent=false){
    const element=document.createElement('button');element.className='btn'+(accent?' primary':'');element.type='button';
    if(kind)element.innerHTML=icon(kind,16);
    element.append(document.createTextNode(text));return element;
  }
  const close=button('Выйти','close'), rotate=button('Повернуть','rotate'), confirm=button('Разместить','plus',true), reset=button('Сбросить','undo'), del=button('Удалить','trash'), move=button(manual?'Изменить объект':'Переместить','move'), calibration=button('Контроль масштаба','ruler'), save=button('Сохранить результат','save'), add=button('Добавить объект','plus');
  confirm.disabled=true;move.disabled=true;del.disabled=true;
  save.disabled=!config.canSave;
  const equipment=document.createElement('select');equipment.setAttribute('aria-label','Выбрать оборудование');
  config.objects.forEach(o=>equipment.append(new Option(o.name,o.id)));equipment.value=config.initial;
  const placedList=document.createElement('select');placedList.setAttribute('aria-label','Размещённые объекты');placedList.hidden=true;
  top.append(close,equipment,add,calibration);
  bottom.append(placedList,confirm,move,rotate,del,reset,save);
  let controls;
  if(manual){controls=document.createElement('div');controls.className='manual-controls';bottom.prepend(controls);}
  overlay.append(top,status,bottom);container.append(overlay);document.body.append(container);
  return {container,canvas,overlay,status,equipment,placedList,close,rotate,confirm,reset,del,move,calibration,save,add,controls};
}
function localParts(o,asset){return objectParts(o,'high',asset).map(p=>({...p,m:multiply(translation(0,o.h/2000,0),p.m)}));}
function positioned(parts,m,preview=false){return parts.map(p=>({...p,m:multiply(m,p.m),c:preview?[...p.c.slice(0,3),.68]:p.c}));}
function controller(ui,config){
  const models=new Map(), requested=new Set();
  const object=()=>config.objects.find(o=>o.id===ui.equipment.value);
  function get(id){
    const o=config.objects.find(o=>o.id===id);
    if(!models.has(id))models.set(id,localParts(o));
    if(o.asset&&!requested.has(id)){
      requested.add(id);loadModel(o.asset).then(model=>models.set(id,localParts(o,model))).catch(config.onError);
    }
    return models.get(id);
  }
  let placed=[],current=null,angle=0,scale=1,calibrate=false,selectedIndex=-1,moveIndex=-1,preview=true;
  const removeAnchor=item=>item?.anchor?.delete?.();
  function refreshPlaced(){
    ui.placedList.replaceChildren(...placed.map((item,i)=>new Option((i+1)+'. '+config.objects.find(o=>o.id===item.id).name,String(i))));
    ui.placedList.hidden=!placed.length;ui.placedList.selectedIndex=selectedIndex;
  }
  const add=()=>{moveIndex=-1;angle=0;scale=1;preview=true;ui.onNew?.();};
  const reset=()=>{placed.forEach(removeAnchor);placed=[];current=null;selectedIndex=-1;add();refreshPlaced();};
  const editSelected=()=>{
    if(selectedIndex<0)return;
    moveIndex=selectedIndex;const item=placed[moveIndex];ui.equipment.value=item.id;angle=item.angle;scale=item.scale;preview=true;
    ui.onMove?.(item);
  };
  ui.placedList.onchange=()=>{selectedIndex=ui.placedList.selectedIndex;if(ui.controls)editSelected();};
  ui.rotate.onclick=()=>{if(!preview)editSelected();angle=(angle+Math.PI/12)%(Math.PI*2);};
  ui.calibration.onclick=()=>{calibrate=!calibrate;};
  ui.add.onclick=add;
  ui.equipment.onchange=add;
  ui.reset.onclick=reset;
  ui.move.onclick=editSelected;
  ui.del.onclick=()=>{
    if(selectedIndex>=0){removeAnchor(placed[selectedIndex]);placed.splice(selectedIndex,1);selectedIndex=placed.length-1;moveIndex=-1;preview=false;refreshPlaced();}
  };
  ui.save.onclick=async()=>{
    if(!placed.length){config.onError(Error('Разместите хотя бы один объект.'));return;}
    ui.save.disabled=true;
    try{await config.save(placed.map(o=>({id:o.id,matrix:o.matrix})));}catch(e){config.onError(e);}finally{ui.save.disabled=!config.canSave;}
  };
  function confirm(matrix,anchorPromise){
    if(!matrix||!preview||placed.length>=100&&moveIndex<0)return;
    const item={id:object().id,matrix:objectMatrix(matrix,angle,scale),anchor:null,angle,scale};
    if(moveIndex>=0){removeAnchor(placed[moveIndex]);placed[moveIndex]=item;selectedIndex=moveIndex;}
    else{placed.push(item);selectedIndex=placed.length-1;}
    if(anchorPromise)Promise.resolve(anchorPromise).then(a=>{if(placed.includes(item))item.anchor=a;else a.delete?.();}).catch(()=>{});
    moveIndex=-1;preview=false;refreshPlaced();
  }
  function frame(matrix){
    current=matrix;
    ui.confirm.disabled=!matrix||!preview;ui.del.disabled=selectedIndex<0;ui.move.disabled=selectedIndex<0;
    const caption=moveIndex<0?'Разместить':'Применить к объекту';
    if(ui.confirm.lastChild.textContent!==caption)ui.confirm.lastChild.textContent=caption;
    const result=placed.flatMap((o,i)=>i===moveIndex?[]:positioned(get(o.id),o.matrix));
    if(matrix&&(preview||calibrate)){
      const m=multiply(matrix,yaw(angle));
      if(preview)result.push(...positioned(get(object().id),objectMatrix(matrix,angle,scale),true));
      const size=calibrate?config.calibration/1000:.24;
      result.push(...positioned([box([0,.013,0],[size,.011,.027],'#49e9b3'),box([0,.013,0],[.027,.011,calibrate?.06:.24],'#49e9b3')],m));
    }
    return result;
  }
  return {object,reset,confirm,frame,editSelected,setScale(value){if(preview)scale=value;},get current(){return current;},get placed(){return placed;},get calibrate(){return calibrate;},get preview(){return preview;},get scale(){return scale;}};
}
export async function startXR(config){
  if(!navigator.xr||!isSecureContext)throw Error('WebXR требует защищённый адрес и совместимое устройство.');
  const ui=interfaceFor(config,false);let session,stopped=false;
  const dispose=()=>{if(stopped)return;stopped=true;ui.container.remove();config.onClose();};
  try{
    session=await navigator.xr.requestSession('immersive-ar',{requiredFeatures:['hit-test','dom-overlay'],optionalFeatures:['anchors','local-floor'],domOverlay:{root:ui.overlay}});
    const r=renderer(ui.canvas,true), gl=r.gl;
    if(gl.makeXRCompatible)await gl.makeXRCompatible();
    session.updateRenderState({baseLayer:new XRWebGLLayer(session,gl,{alpha:true})});
    const space=await session.requestReferenceSpace('local-floor').catch(()=>session.requestReferenceSpace('local'));
    const viewer=await session.requestReferenceSpace('viewer'), source=await session.requestHitTestSource({space:viewer});
    const c=controller(ui,config);
    let placeRequested=false;
    ui.overlay.addEventListener('beforexrselect',e=>e.preventDefault());
    ui.confirm.onclick=()=>{placeRequested=true;};
    function onFrame(_,frame){
      if(stopped)return;
      session.requestAnimationFrame(onFrame);
      const v=frame.getViewerPose(space);if(!v)return;
      const lastResult=frame.getHitTestResults(source)[0];
      const hit=lastResult?.getPose(space), hitMatrix=hit&&Math.abs(hit.transform.matrix[5])>.8?translation(hit.transform.matrix[12],hit.transform.matrix[13],hit.transform.matrix[14]):null;
      if(placeRequested){
        placeRequested=false;
        if(hitMatrix){
          let anchor;
          try{
            if(lastResult.createAnchor)anchor=lastResult.createAnchor();
            else if(frame.createAnchor)anchor=frame.createAnchor(new XRRigidTransform({x:hitMatrix[12],y:hitMatrix[13],z:hitMatrix[14]}),space);
          }catch{}
          c.confirm(hitMatrix,anchor);
        }
      }
      for(const item of c.placed)if(item.anchor){
        const a=frame.getPose(item.anchor.anchorSpace,space);
        if(a){const m=a.transform.matrix;item.matrix=objectMatrix(translation(m[12],m[13],m[14]),item.angle,item.scale);}
      }
      ui.status.textContent=c.calibrate?'Контрольный отрезок: '+config.calibration+' мм':c.preview?(hitMatrix?'Поверхность найдена · '+extent(c.object()):'Направьте камеру на горизонтальную поверхность.'):'Размещено объектов: '+c.placed.length;
      const model=c.frame(hitMatrix),layer=session.renderState.baseLayer;
      gl.bindFramebuffer(gl.FRAMEBUFFER,layer.framebuffer);r.clear();
      for(const eye of v.views){
        const at=layer.getViewport(eye);
        gl.viewport(at.x,at.y,at.width,at.height);r.draw(model,multiply(eye.projectionMatrix,eye.transform.inverse.matrix));
      }
    }
    session.addEventListener('end',()=>{source.cancel();c.reset();dispose();},{once:true});
    ui.close.onclick=()=>session.end().catch(dispose);
    session.requestAnimationFrame(onFrame);
    return {close:ui.close.onclick};
  }catch(e){
    if(session)await session.end().catch(()=>{});
    dispose();throw Error(e.name==='NotAllowedError'?'Запуск AR отклонён устройством.':e.name==='NotSupportedError'?'Устройство не поддерживает поиск поверхности или управление WebXR.':e.message||'Не удалось запустить WebXR.');
  }
}
export async function startCamera(config){
  if(!isSecureContext||!navigator.mediaDevices?.getUserMedia)throw Error('Для доступа к камере требуется HTTPS.');
  const ui=interfaceFor(config,true),video=document.createElement('video');video.autoplay=true;video.playsInline=true;video.muted=true;ui.container.prepend(video);
  let stream,ended=false,id;
  const close=()=>{
    if(ended)return;
    ended=true;cancelAnimationFrame(id);stream?.getTracks().forEach(t=>t.stop());ui.container.remove();config.onClose();
  };
  ui.close.onclick=close;
  try{
    stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'}}});
    if(ended){stream.getTracks().forEach(t=>t.stop());throw Error('Режим камеры закрыт.');}
    video.srcObject=stream;await video.play();
    const canvas=ui.canvas;
    const r=renderer(canvas,true),gl=r.gl,c=controller(ui,config);
    let x=0,y=0,z=-3;
    const slider=(label,min,max,step,value,format,change)=>{
      const field=document.createElement('label'), title=document.createElement('span'), out=document.createElement('output'), input=document.createElement('input');
      title.textContent=label;input.type='range';input.min=min;input.max=max;input.step=step;input.setAttribute('aria-label',label);
      const set=next=>{input.value=next;out.value=format(Number(input.value));};
      input.oninput=()=>{const next=Number(input.value);out.value=format(next);change(next);};
      field.append(title,out,input);ui.controls.append(field);set(value);
      return {input,set};
    };
    const metres=v=>v.toFixed(2).replace('.',',')+' м';
    const horizontal=slider('Смещение',-5,5,.01,x,metres,v=>x=v);
    const vertical=slider('Высота',-1,4,.01,y,metres,v=>y=v);
    const distance=slider('Дистанция',.5,15,.01,-z,metres,v=>z=-v);
    const size=slider('Размер',25,300,1,100,v=>v+'%',v=>c.setScale(v/100));
    const sliders=[horizontal,vertical,distance,size];
    ui.onMove=item=>{
      [x,y,z]=item.matrix.slice(12,15);
      horizontal.set(x);vertical.set(y);distance.set(-z);size.set(Math.round(item.scale*100));
    };
    ui.onNew=()=>{y=0;vertical.set(y);size.set(100);};
    ui.confirm.onclick=()=>c.confirm(translation(x,y,z));
    canvas.style.touchAction='none';
    const pointers=new Map(), clamp=(n,min,max)=>Math.min(max,Math.max(min,n));
    const gap=()=>{const [a,b]=pointers.values();return b?Math.hypot(a.x-b.x,a.y-b.y):0;};
    canvas.addEventListener('pointerdown',event=>{
      if(event.button!==0||pointers.size===2)return;
      if(!c.preview)c.editSelected();
      if(!c.preview)return;
      canvas.setPointerCapture(event.pointerId);pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
    });
    canvas.addEventListener('pointermove',event=>{
      const before=pointers.get(event.pointerId);if(!before||!c.preview)return;
      const oldGap=gap();pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
      if(pointers.size===2){
        if(oldGap>1){const value=clamp(c.scale*gap()/oldGap,.25,3);c.setScale(value);size.set(Math.round(value*100));}
        return;
      }
      const metresPerPixel=-z/Math.max(1,canvas.clientHeight);
      x=clamp(x+(event.clientX-before.x)*metresPerPixel,-5,5);
      y=clamp(y-(event.clientY-before.y)*metresPerPixel,-1,4);
      horizontal.set(x);vertical.set(y);
    });
    for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,e=>pointers.delete(e.pointerId));
    function loop(){
      if(ended)return;
      const ratio=Math.min(1.5,devicePixelRatio||1),w=Math.max(1,Math.round(canvas.clientWidth*ratio)),h=Math.max(1,Math.round(canvas.clientHeight*ratio));
      if(w!==canvas.width||h!==canvas.height){canvas.width=w;canvas.height=h;}
      gl.viewport(0,0,w,h);r.clear();
      const matrix=multiply(projection(w/h,51),look([0,1.45,0],[0,.93,-3]));
      r.draw(c.frame(translation(x,y,z)),matrix);
      for(const {input} of sliders)if(input.disabled===c.preview)input.disabled=!c.preview;
      const status=c.calibrate?'Контрольный отрезок: '+config.calibration+' мм. Камера и масштаб сцены не откалиброваны.':'Режим камеры · размещено: '+c.placed.length+' · '+extent(c.object(),c.scale);
      if(ui.status.textContent!==status)ui.status.textContent=status;
      id=requestAnimationFrame(loop);
    }
    loop();return {close};
  }catch(e){close();throw Error(e.name==='NotAllowedError'?'Доступ к камере отклонён.':e.name==='NotFoundError'?'Камера не найдена.':e.message);}
}

