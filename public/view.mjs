
import {add,sub,mul,dot,cross,norm,faces,look,projection,multiply,transform,pickBox,scene,pose,ident,color} from './geometry.mjs';
import {placement,radians} from './domain.mjs';

export function renderer(canvas,xr=false){
  const gl=canvas.getContext('webgl2',{antialias:true,alpha:xr,xrCompatible:xr,preserveDrawingBuffer:!xr});
  if(!gl)throw new Error('WebGL 2 недоступен на этом устройстве.');
  const shader=(kind,src)=>{
    const s=gl.createShader(kind);gl.shaderSource(s,src);gl.compileShader(s);
    if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));
    return s;
  };
  const program=gl.createProgram();
  gl.attachShader(program,shader(gl.VERTEX_SHADER,`#version 300 es
    precision highp float;
    layout(location=0) in vec3 point; layout(location=1) in vec3 normal;
    layout(location=2) in mat4 model; layout(location=6) in vec4 tint;
    uniform mat4 vp; out vec4 paint; out vec3 lightNormal; out vec3 world;
    void main(){vec4 pos=model*vec4(point,1.0);world=pos.xyz;lightNormal=normalize(transpose(inverse(mat3(model)))*normal);paint=tint;gl_Position=vp*pos;}`));
  gl.attachShader(program,shader(gl.FRAGMENT_SHADER,`#version 300 es
    precision highp float; in vec4 paint; in vec3 lightNormal; in vec3 world; out vec4 pixel;
    void main(){vec3 n=normalize(lightNormal);float l=.66+.30*max(0.,dot(n,normalize(vec3(.45,.85,.65))))+.13*max(0.,dot(n,normalize(vec3(-.7,.3,-.45))));
    pixel=vec4(paint.rgb*l+vec3(.012,.020,.028)*(.55+.45*max(n.y,0.)),paint.a);}`));
  gl.linkProgram(program);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
  const uniform=gl.getUniformLocation(program,'vp'), meshes=new Map(), instance=gl.createBuffer();
  const cube=new Float32Array(faces.flatMap(([n,quad])=>[0,1,2,0,2,3].flatMap(i=>[...quad[i],...n])));
  function mesh(data){
    if(meshes.has(data))return meshes.get(data);
    const vao=gl.createVertexArray(),vbo=gl.createBuffer();
    gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,vbo);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);
    for(let i=0;i<2;i++){gl.enableVertexAttribArray(i);gl.vertexAttribPointer(i,3,gl.FLOAT,false,24,i*12);}
    gl.bindBuffer(gl.ARRAY_BUFFER,instance);
    for(let i=2;i<=6;i++){gl.enableVertexAttribArray(i);gl.vertexAttribPointer(i,4,gl.FLOAT,false,80,(i-2)*16);gl.vertexAttribDivisor(i,1);}
    const value={vao,vertices:data.length/6};meshes.set(data,value);return value;
  }
  gl.enable(gl.DEPTH_TEST);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthFunc(gl.LEQUAL);
  const clear=()=>{gl.clearColor(xr?0:.067,xr?0:.095,xr?0:.122,xr?0:1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);};
  function draw(parts,vp){
    gl.useProgram(program);gl.uniformMatrix4fv(uniform,false,vp);
    const passes=[new Map(),new Map()];
    for(const b of parts){
      const pass=passes[b.c[3]<.99?1:0], key=b.mesh||cube;
      if(!pass.has(key))pass.set(key,[]);
      pass.get(key).push(b);
    }
    passes.forEach((groups,i)=>{
      gl.depthMask(i===0);
      for(const [data,group] of groups){
        const {vao,vertices}=mesh(data), values=new Float32Array(group.length*20);
        group.forEach((p,j)=>{values.set(p.m,j*20);values.set(p.c,j*20+16);});
        gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,instance);gl.bufferData(gl.ARRAY_BUFFER,values,gl.DYNAMIC_DRAW);
        gl.drawArraysInstanced(gl.TRIANGLES,0,vertices,group.length);
      }
    });
    gl.depthMask(true);
  }
  return {gl,clear,draw};
}
function decodeUri(uri){return Uint8Array.from(atob(uri.split(',')[1]),c=>c.charCodeAt(0)).buffer;}
export async function loadModel(id,raw){
  if(!raw){
    const response=await fetch('/api/assets/'+encodeURIComponent(id));
    if(!response.ok)throw Error('Модель не найдена.');
    raw=await response.arrayBuffer();
  }
  const view=new DataView(raw);
  let g,bin;
  if(view.getUint32(0,true)===0x46546c67){
    const length=view.getUint32(12,true);
    g=JSON.parse(new TextDecoder().decode(raw.slice(20,20+length)));
    bin=raw.slice(28+length);
  }else g=JSON.parse(new TextDecoder().decode(raw));
  const buffers=g.buffers.map((b,i)=>b.uri?decodeUri(b.uri):i===0?bin:null);
  const component={5120:[1,'getInt8'],5121:[1,'getUint8'],5122:[2,'getInt16'],5123:[2,'getUint16'],5125:[4,'getUint32'],5126:[4,'getFloat32']};
  function access(index,n){
    const a=g.accessors[index], b=g.bufferViews[a.bufferView], [size,get]=component[a.componentType];
    if(a.count>600000)throw Error('Модель содержит слишком много вершин.');
    const v=new DataView(buffers[b.buffer]), stride=b.byteStride||size*n, begin=(b.byteOffset||0)+(a.byteOffset||0);
    return Array.from({length:a.count},(_,i)=>Array.from({length:n},(_,j)=>v[get](begin+i*stride+j*size,true)));
  }
  const parts=[],lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
  function visit(index,parent,depth=0){
    if(depth>64)throw Error('Недопустимая иерархия модели.');
    const node=g.nodes[index], [x,y,z,w]=node.rotation||[0,0,0,1];
    const axes=[[1-2*y*y-2*z*z,2*x*y+2*z*w,2*x*z-2*y*w],[2*x*y-2*z*w,1-2*x*x-2*z*z,2*y*z+2*x*w],[2*x*z+2*y*w,2*y*z-2*x*w,1-2*x*x-2*y*y]];
    const matrix=multiply(parent,node.matrix||pose(axes,node.translation||[0,0,0],node.scale||[1,1,1]));
    for(const p of (g.meshes[node.mesh]?.primitives||[])){
      if(p.mode!==undefined&&p.mode!==4)continue;
      const positions=access(p.attributes.POSITION,3).map(v=>transform(matrix,v).slice(0,3));
      const indices=p.indices===undefined?positions.map((_,i)=>i):access(p.indices,1).map(v=>v[0]);
      if(indices.length>900000)throw Error('Модель содержит слишком много полигонов.');
      const vertices=[];
      for(let i=0;i+2<indices.length;i+=3){
        const triangle=indices.slice(i,i+3).map(j=>positions[j]);
        const n=norm(cross(sub(triangle[1],triangle[0]),sub(triangle[2],triangle[0])));
        for(const v of triangle){
          v.forEach((x,k)=>{lo[k]=Math.min(lo[k],x);hi[k]=Math.max(hi[k],x);});
          vertices.push(...v,...n);
        }
      }
      parts.push({mesh:new Float32Array(vertices),c:g.materials?.[p.material]?.pbrMetallicRoughness?.baseColorFactor||color('#819aab')});
    }
    for(const child of node.children||[])visit(child,matrix,depth+1);
  }
  for(const id of g.scenes[g.scene||0].nodes)visit(id,ident());
  const center=mul(add(lo,hi),.5), dims=sub(hi,lo).map(v=>Math.max(v,.000001));
  if(!parts.length||!dims.every(Number.isFinite))throw Error('Модель не содержит треугольной геометрии.');
  return parts.map(p=>({...p,m:pose([[1,0,0],[0,1,0],[0,0,1]],center.map((v,i)=>-v/dims[i]),dims.map(v=>1/v))}));
}

export function viewport(canvas,get,events){
  const render=renderer(canvas), {gl}=render;
  const assets=new Map(), loading=new Set();
  const cam={yaw:.67,pitch:.62,distance:16,target:[0,1,0],view:'3d',ortho:true};
  let vp=ident(),eye,basis,parts,sceneKey='',scheduled=false,dirty=true,disposed=false;
  const projectPoint=p=>{
    const a=transform(vp,p);if(a[3]<=0)return null;
    return [(a[0]/a[3]+1)*canvas.clientWidth/2,(1-a[1]/a[3])*canvas.clientHeight/2];
  };
  const invalidate=()=>{dirty=true;request();};
  function draw(){
    if(disposed)return;
    const {project,options}=get();
    const ratio=Math.min(devicePixelRatio||1,options.quality==='low'?1:1.65);
    const w=Math.max(1,Math.round(canvas.clientWidth*ratio)),h=Math.max(1,Math.round(canvas.clientHeight*ratio));
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
    const a=w/h, scale=Math.max(.45,Math.min(1,a/.95)), ortho=cam.ortho?cam.distance*.334/scale:0;
    const pitch=cam.view==='top'?Math.PI/2:cam.view==='3d'?cam.pitch:0;
    const yaw=cam.view==='top'?0:cam.view==='front'?0:cam.view==='side'?Math.PI/2:cam.yaw;
    const offset=[Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch)];
    eye=add(cam.target,mul(offset,cam.distance));
    const z=norm(offset), x=norm(cross(cam.view==='top'?[0,0,-1]:[0,1,0],z)),y=cross(z,x);
    basis={z,x,y,ortho,a};
    vp=multiply(projection(a,38,ortho),look(eye,cam.target,cam.view==='top'?[0,0,-1]:[0,1,0]));
    gl.viewport(0,0,w,h);render.clear();
    const key=[cam.view,Math.cos(yaw)>=0,Math.sin(yaw)>=0].join();
    if(dirty||key!==sceneKey){
      parts=scene(project,{...options,view:cam.view,yaw},assets);sceneKey=key;dirty=false;
      for(const o of project.objects)if(o.asset&&!assets.has(o.asset)&&!loading.has(o.asset)){
        loading.add(o.asset);
        loadModel(o.asset).then(v=>{assets.set(o.asset,v);invalidate();}).catch(e=>events.assetError?.(e.message));
      }
    }
    render.draw(parts,vp);
    events.labels(projectPoint);
  }
  function request(){
    if(scheduled||disposed)return;
    scheduled=true;requestAnimationFrame(()=>{scheduled=false;draw();});
  }
  function ray(e){
    const r=canvas.getBoundingClientRect(),x=(e.clientX-r.left)/r.width*2-1,y=1-(e.clientY-r.top)/r.height*2;
    const b=basis;
    const lateral=add(mul(b.x,x*b.a),mul(b.y,y));
    return b.ortho?{origin:add(eye,mul(lateral,b.ortho)),dir:mul(b.z,-1)}:{origin:eye,dir:norm(add(mul(b.z,-1),mul(lateral,Math.tan(radians(19)))))};
  }
  function hit(e){
    if(!basis)return {};
    const r=ray(e), p=get().project;
    const t=-r.origin[1]/r.dir[1];
    const floor=Number.isFinite(t)&&t>=0?mul(add(r.origin,mul(r.dir,t)),1000):null;
    let object,nearest=Infinity;
    for(const o of p.objects){
      const k=pickBox(r,placement(o,p.room));
      if(k<nearest){object=o;nearest=k;}
    }
    return {floor,object,point:nearest<Infinity?mul(add(r.origin,mul(r.dir,nearest)),1000):floor};
  }
  const points=new Map();let start,drag=false,pinch=0,suppressClick=false;
  canvas.onpointerdown=e=>{
    if(e.button!==0&&e.button!==1&&e.button!==2)return;
    canvas.setPointerCapture(e.pointerId);
    points.set(e.pointerId,[e.clientX,e.clientY]);
    if(points.size>1){pinch=0;suppressClick=true;return;}
    start={x:e.clientX,y:e.clientY,hit:hit(e),pan:e.button!==0||e.shiftKey,add:e.ctrlKey||e.metaKey};
    drag=false;suppressClick=false;
  };
  canvas.onpointermove=e=>{
    if(!points.has(e.pointerId))return;
    const old=points.get(e.pointerId);points.set(e.pointerId,[e.clientX,e.clientY]);
    if(points.size===2){
      const [a,b]=[...points.values()], dist=Math.hypot(a[0]-b[0],a[1]-b[1]);
      if(pinch>0)cam.distance=Math.max(.8,Math.min(250,cam.distance*pinch/dist));
      pinch=dist;request();return;
    }
    if(!start||suppressClick)return;
    if(Math.hypot(e.clientX-start.x,e.clientY-start.y)>4&&!drag){drag=true;events.begin?.(start);}
    if(!drag)return;
    const dx=e.clientX-old[0],dy=e.clientY-old[1];
    if(events.drag?.(start,hit(e)))return;
    if(start.pan||cam.view!=='3d'){
      cam.target=add(cam.target,add(mul(basis.x,-dx*cam.distance/850),mul(basis.y,dy*cam.distance/850)));
    }else{cam.yaw-=dx*.009;cam.pitch=Math.max(.12,Math.min(1.47,cam.pitch+dy*.008));}
    request();
  };
  function release(e){
    points.delete(e.pointerId);
    if(!points.size&&start){
      if(drag)events.end?.();
      else if(!suppressClick&&e.type!=='pointercancel'&&!start.pan)events.click?.(hit(e),start.add);
      start=null;
    }
  }
  canvas.onpointerup=release;canvas.onpointercancel=release;canvas.oncontextmenu=e=>e.preventDefault();
  canvas.addEventListener('wheel',e=>{e.preventDefault();cam.distance=Math.max(.8,Math.min(250,cam.distance*Math.exp(e.deltaY*.001)));request();},{passive:false});
  canvas.ondragover=e=>e.preventDefault();
  canvas.ondrop=e=>{e.preventDefault();events.drop?.(e.dataTransfer.getData('text/plain'),hit(e));};
  const size=new ResizeObserver(request);size.observe(canvas);
  const reset=()=>{
    const r=get().project.room;
    Object.assign(cam,{yaw:.67,pitch:.66,distance:Math.max(r.w,r.l,r.h*1.9)*.001*1.81,target:[0,Math.min(1.7,r.h/2300),0]});invalidate();
  };
  reset();
  return {invalidate,draw,cam,reset,hit,assets,request,zoom(f){cam.distance=Math.max(.8,Math.min(250,cam.distance*f));request();},dispose(){disposed=true;size.disconnect();gl.getExtension('WEBGL_lose_context')?.loseContext();}};
}

