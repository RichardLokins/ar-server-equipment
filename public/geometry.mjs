
import {axesFor,placement,zones,doorZone,radians} from './domain.mjs';
export const add=(a,b)=>a.map((x,i)=>x+b[i]);
export const sub=(a,b)=>a.map((x,i)=>x-b[i]);
export const mul=(a,n)=>a.map(x=>x*n);
export const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
export const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export const norm=a=>mul(a,1/(Math.hypot(...a)||1));
export const ident=()=>[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
export function multiply(a,b){
  const out=[];
  for(let i=0;i<4;i++)for(let j=0;j<4;j++)out.push(a[j]*b[4*i]+a[j+4]*b[4*i+1]+a[j+8]*b[4*i+2]+a[j+12]*b[4*i+3]);
  return out;
}
export function transform(m,p,w=1){
  return [0,1,2,3].map(i=>m[i]*p[0]+m[i+4]*p[1]+m[i+8]*p[2]+m[i+12]*w);
}
export const pose=(axes,pos,scale=[1,1,1])=>[...mul(axes[0],scale[0]),0,...mul(axes[1],scale[1]),0,...mul(axes[2],scale[2]),0,...pos,1];
export const color=(c,a=1)=>{
  if(Array.isArray(c)) return c;
  const n=parseInt(c.slice(1),16);
  return [(n>>16)/255,(n>>8&255)/255,(n&255)/255,a];
};
const axes=[[1,0,0],[0,1,0],[0,0,1]];
export const box=(p,s,c,a=1)=>({m:pose(axes,p,s),c:color(c,a)});
export const faces=[
  [[1,0,0],[[.5,-.5,-.5],[.5,.5,-.5],[.5,.5,.5],[.5,-.5,.5]]],
  [[-1,0,0],[[-.5,-.5,.5],[-.5,.5,.5],[-.5,.5,-.5],[-.5,-.5,-.5]]],
  [[0,1,0],[[-.5,.5,.5],[.5,.5,.5],[.5,.5,-.5],[-.5,.5,-.5]]],
  [[0,-1,0],[[-.5,-.5,-.5],[.5,-.5,-.5],[.5,-.5,.5],[-.5,-.5,.5]]],
  [[0,0,1],[[.5,-.5,.5],[.5,.5,.5],[-.5,.5,.5],[-.5,-.5,.5]]],
  [[0,0,-1],[[-.5,-.5,-.5],[-.5,.5,-.5],[.5,.5,-.5],[.5,-.5,-.5]]]
];
export function line(a,b,weight,c) {
  const delta=sub(b,a), y=norm(delta), x=norm(cross(y,Math.abs(y[1])>.98?[1,0,0]:[0,1,0]));
  return {m:pose([x,y,cross(x,y)],mul(add(a,b),.5),[weight,Math.hypot(...delta),weight]),c:color(c)};
}
export const objectPose=o=>pose(axesFor(o),[o.x/1000,(o.y+o.h/2)/1000,o.z/1000]);
export function objectParts(o,quality='high',assetParts){
  const w=o.w/1000,h=o.h/1000,d=o.d/1000, result=[];
  const put=(x,y,z,ww,hh,dd,c,a)=>result.push(box([x,y,z],[ww,hh,dd],c,a));
  if(assetParts?.length) return assetParts.map(b=>({...b,m:multiply(pose(axes,[0,0,0],[w,h,d]),b.m)}));
  if(o.kind==='door'||o.kind==='window'||o.kind==='vent'){
    const f=o.kind==='door'?'#6b8293':'#80a9bb', t=.032;
    put(-w/2,h/2-h/2,0,t,h,.055,f);
    put(w/2,0,0,t,h,.055,f);put(0,h/2,0,w+t,t,.055,f);
    if(o.kind!=='door')put(0,-h/2,0,w,t,.055,f);
    if(o.kind==='door'){
      put(0,0,0,w-.04,h-.05,.036,'#526877');
      put(w*.32,0,.045,.085,.021,.045,'#b0c1c6');
      put(0,h*.22,.021,w*.36,h*.26,.005,'#233e50');
    } else if(o.kind==='window'){
      put(0,0,0,w,h,.02,'#4d829f',.36);put(0,0,0,t,h,.032,f);
    } else for(let y=-h*.4;y<h*.48;y+=.045)put(0,y,0,w,.015,.035,'#526879');
  }else if(o.rack){
    const frame='#485a66', edge='#6b7a83', shadow='#17232c', black='#0e1b25';
    const open=o.style==='open', spacing=.04445;
    const railBottom=-h/2+.073;
    put(0,h/2-.026,0,w,.052,d,frame);
    put(0,-h/2+.047,0,w,.060,d,frame);
    for(const x of [-1,1]) {
      if(!open)put(x*(w/2-.017),.003,0,.034,h-.12,d-.065,o.color);
      for(const z of [-1,1]){
        put(x*(w/2-.025),.012,z*(d/2-.027),.045,h-.075,.055,frame);
        put(x*(w/2-.027),-h/2+.017,z*(d/2-.08),.074,.035,.081,black);
      }
    }
    if(!open){
      put(0,0,-d/2+.018,w-.095,h-.119,.025,shadow);
      put(0,0,d/2-.04,w-.104,h-.14,.020,black);
    }
    for(const z of [-1,1]){
      for(const x of [-1,1]) put(x*Math.min(w/2-.047,.248),.006,z*(d/2-.048),.022,h-.17,.034,edge);
      if(quality==='high'){
        for(let u=0;u<o.rack;u++){
          const y=railBottom+spacing*(u+.5);
          put(0,y,z*(d/2-.026),w-.13,.010,.012,u%4===0?'#405761':'#263943');
          if(u%2===0){
            put(-w*.18,y+.012,z*(d/2-.016),.018,.005,.005,u%6===0?'#50d8e6':'#296976');
            put(w*.19,y+.011,z*(d/2-.016),.035,.006,.008,'#334956');
          }
        }
      }
    }
    put(w*.39,.004,d/2-.016,.025,.22,.035,'#8c9da4');
    put(-w*.32,h/2-.11,d/2-.01,.091,.023,.009,'#1d8cae');
    for(const s of o.slots||[]){
      const y=railBottom+spacing*(s.start-1+s.u/2);
      put(0,y,d*.05,Math.min(.482,w-.07),spacing*s.u-.002,d*.8,'#587885');
      put(-w*.25,y,d*.454,.025,.011,.014,'#48e7dd');
    }
  }else {
    put(0,0,0,w,h,d,o.color);
    if(o.kind==='equipment'){
      const cooling=o.category==='cooling';
      put(0,.015,d/2-.003,w*.86,h*.91,.019,cooling?'#314b5b':'#1a2a36');
      put(-w*.16,h*.30,d/2+.009,w*.25,h*.045,.01,'#35c6e1');
      if(quality==='high') for(let i=0;i<12;i++)put(0,h*(.2-i*.052),d/2+.008,w*.70,Math.min(h*.011,.009),.009,cooling?'#668798':'#3b5260');
    }else if(o.kind==='cable'){
      for(let i=-2;i<=2;i++)put(i*w*.15,.002,0,.015,h,d*.8,'#243747');
    }
  }
  return result;
}
export function scene(project,options,assets){
  const {room:r}=project, W=r.w/1000,L=r.l/1000,H=r.h/1000,T=r.thickness/1000;
  const parts=[], glass=[];
  const put=(p,s,c,a=1)=>{(a===1?parts:glass).push(box(p,s,c,a));};
  if(!options.camera){
    const grid=Math.max(.25,r.grid/1000,Math.max(W,L)/45);
    const extent=Math.max(W,L)*.88;
    if(options.grid)for(let i=-extent;i<=extent;i+=grid){
      const major=Math.round((i+extent)/grid)%4===0;
      const c=major?'#23323e':'#1b2833';
      put([i,-.195,0],[.009,.002,extent*2],c);
      put([0,-.195,i],[extent*2,.002,.009],c);
    }
  }
  const floor=r.floor==='concrete'?'#485763':r.floor==='raised'?'#3c5768':'#405464';
  put([0,-.11,0],[W+.15,.21,L+.15],'#273d50');
  put([0,-.025,0],[W,.048,L],floor);
  if(options.grid&&r.floor!=='concrete'){
    const tile=Math.max(.5,r.grid/1000,Math.max(W,L)/48);
    for(let x=-W/2+tile;x<W/2-.02;x+=tile)put([x,.001,0],[.009,.002,L],'#293b4a');
    for(let z=-L/2+tile;z<L/2-.02;z+=tile)put([0,.001,z],[W,.002,.009],'#293b4a');
  }
  const placed=project.objects.map(o=>placement(o,r));
  const shows=options.view==='top'?[]:options.view==='front'?['north','west','east']:options.view==='side'?['west','north','south']:[
    Math.cos(options.yaw)>=0?'north':'south',Math.sin(options.yaw)>=0?'west':'east'
  ];
  if(r.walls) for(const name of shows){
    const side=name==='west'||name==='east', span=side?L:W, sign=name==='north'||name==='west'?-1:1;
    const fixed=sign*((side?W:L)/2+T/2);
    const holes=placed.filter(o=>o.wall===name).map(o=>({lo:(o.offset-o.w/2)/1000,hi:(o.offset+o.w/2)/1000,base:o.y/1000,top:(o.y+o.h)/1000}));
    const heights=[...new Set([0,H,...holes.flatMap(o=>[Math.max(0,Math.min(o.base,H)),Math.max(0,Math.min(o.top,H))])])].sort((a,b)=>a-b);
    const cuts=[...new Set([-span/2,span/2,...holes.flatMap(o=>[Math.max(-span/2,Math.min(o.lo,span/2)),Math.max(-span/2,Math.min(o.hi,span/2))])])].sort((a,b)=>a-b);
    const panel=(at,y,width,height,thick,c)=>put(side?[fixed,y,at]:[at,y,fixed],side?[thick,height,width]:[width,height,thick],c);
    for(let i=1;i<cuts.length;i++)for(let j=1;j<heights.length;j++){
      const x=(cuts[i-1]+cuts[i])/2,y=(heights[j-1]+heights[j])/2;
      if(!holes.some(o=>o.lo<x&&o.hi>x&&o.base<y&&o.top>y))panel(x,y,cuts[i]-cuts[i-1],heights[j]-heights[j-1],T,name==='north'?'#566b7b':'#4b6274');
    }
    panel(0,H-.005,span+.12,.032,T+.014,'#8095a1');
    for(let x=-span/2+.52;x<span/2;x+=.76)if(!holes.some(h=>h.lo<x&&h.hi>x))panel(x,H/2,.007,H-.09,T+.005,'#687e8d');
  }
  if(r.ceiling&&options.view!=='top')put([0,H+.045,0],[W,.09,L],'#6e8a9e',.24);
  for(const o of placed){
    if(o.wall&&!shows.includes(o.wall)&&options.view!=='top')continue;
    const selected=options.selected.has(o.id), O=objectPose(o);
    if(o.kind==='equipment'&&o.y===0){
      put([o.x/1000,.004,o.z/1000],[o.w/1000+.13,.006,o.d/1000+.14],'#152733',.53);
    }
    for(const p of objectParts(o,options.quality,assets.get(o.asset))) (p.c[3]<.99?glass:parts).push({...p,m:multiply(O,p.m)});
    if(selected){
      const c='#37a7ff', b=.019,x=o.w/2000+.02,y=o.h/2000+.014,z=o.d/2000+.02;
      for(const side of [-1,1])for(const side2 of [-1,1]){
        const ls=[box([0,side*y,side2*z],[x*2,b,b],c),box([side*x,0,side2*z],[b,y*2,b],c),box([side*x,side2*y,0],[b,b,z*2],c)];
        parts.push(...ls.map(p=>({...p,m:multiply(O,p.m)})));
      }
    }
    if(options.zones){
      const zs=o.kind==='door'?(options.zones.door?doorZone(o):[]):zones(o).filter(z=>options.zones[z.zoneType]);
      for(const z of zs)glass.push({m:multiply(objectPose(z),pose(axes,[0,0,0],[z.w/1000,z.h/1000,z.d/1000])),c:color(o.kind==='door'?'#ffbf58':'#26acf5',.13)});
    }
  }
  for(const m of project.measurements)parts.push(line(mul(m.a,.001),mul(m.b,.001),.016,'#46c8ff'));
  if(options.axes&&['top','3d'].includes(options.view)){
    const y=.019,c='#709bb6', x=W/2+.4,z=L/2+.42;
    parts.push(line([-W/2,y,z],[W/2,y,z],.012,c),line([x,y,-L/2],[x,y,L/2],.012,c));
    for(const sign of [-1,1]){
      parts.push(line([sign*W/2,y,L/2+.13],[sign*W/2,y,z+.12],.012,c));
      parts.push(line([W/2+.13,y,sign*L/2],[x+.12,y,sign*L/2],.012,c));
    }
  }
  if(options.axes){
    const origin=[-W/2-.3,.008,L/2+.3];
    parts.push(line(origin,add(origin,[.5,0,0]),.018,'#f76864'),line(origin,add(origin,[0,.5,0]),.018,'#56dc92'),line(origin,add(origin,[0,0,-.5]),.018,'#41adff'));
  }
  return [...parts,...glass];
}
export function look(eye,target,up=[0,1,0]){
  const z=norm(sub(eye,target)),x=norm(cross(up,z)),y=cross(z,x);
  return [x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,eye),-dot(y,eye),-dot(z,eye),1];
}
export function projection(aspect,fov,ortho=0){
  const near=.04, far=600;
  if(ortho) return [1/(ortho*aspect),0,0,0,0,1/ortho,0,0,0,0,-2/(far-near),0,0,0,-(far+near)/(far-near),1];
  const s=1/Math.tan(radians(fov)/2);
  return [s/aspect,0,0,0,0,s,0,0,0,0,-(far+near)/(far-near),-1,0,0,-2*far*near/(far-near),0];
}
export function pickBox(ray,o){
  const C=[o.x/1000,(o.y+o.h/2)/1000,o.z/1000], offset=sub(ray.origin,C), axes=axesFor(o), half=[o.w/2000,o.h/2000,o.d/2000];
  let lo=0,hi=Infinity;
  for(let i=0;i<3;i++){
    const a=dot(axes[i],offset),b=dot(axes[i],ray.dir);
    if(Math.abs(b)<1e-7){if(Math.abs(a)>half[i])return Infinity;continue;}
    const t0=(-half[i]-a)/b,t1=(half[i]-a)/b;
    lo=Math.max(lo,Math.min(t0,t1));hi=Math.min(hi,Math.max(t0,t1));
    if(lo>hi)return Infinity;
  }
  return lo;
}

