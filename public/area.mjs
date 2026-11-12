import {axesFor, bounds, placement} from './domain.mjs';

const turn=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);

function hull(points){
  points.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  function half(list){
    const edge=[];
    for(const p of list){
      while(edge.length>=2&&turn(edge.at(-2),edge.at(-1),p)<=1e-7)edge.pop();
      edge.push(p);
    }
    return edge.slice(0,-1);
  }
  return [...half(points),...half(points.reverse())];
}

function clip(points,axis,limit,sign){
  return points.flatMap((b,i)=>{
    const a=points[(i+points.length-1)%points.length];
    const before=(a[axis]-limit)*sign>=0, after=(b[axis]-limit)*sign>=0;
    const result=[];
    if(before!==after){
      const t=(limit-a[axis])/(b[axis]-a[axis]);
      result.push(a.map((v,j)=>j===axis?limit:v+t*(b[j]-v)));
    }
    if(after)result.push(b);
    return result;
  });
}

function footprint(o,r){
  const {center,extent}=bounds(o);
  if(center[1]-extent[1]>.01||center[1]+extent[1]<0)return [];
  const axes=axesFor(o),points=[];
  for(const x of [-o.w/2,o.w/2])for(const y of [-o.h/2,o.h/2])for(const z of [-o.d/2,o.d/2]){
    points.push([0,2].map(i=>center[i]+axes[0][i]*x+axes[1][i]*y+axes[2][i]*z));
  }
  let boundary=hull(points);
  for(const [axis,limit,sign] of [[0,-r.w/2,1],[0,r.w/2,-1],[1,-r.l/2,1],[1,r.l/2,-1]])boundary=clip(boundary,axis,limit,sign);
  return boundary;
}

export function floorArea(project){
  const r=project.room, total=r.w*r.l;
  const polygons=project.objects.filter(o=>!o.wall&&!['door','window','vent','cable'].includes(o.kind)).map(o=>footprint(placement(o,r),r)).filter(p=>p.length>=3);
  const cuts=new Set(polygons.flatMap(p=>p.map(v=>v[0])));
  const edges=polygons.map(p=>p.flatMap((a,i)=>{
    const b=p[(i+1)%p.length];
    if(Math.abs(a[0]-b[0])<1e-8)return [];
    const slope=(b[1]-a[1])/(b[0]-a[0]);
    return [{left:Math.min(a[0],b[0]),right:Math.max(a[0],b[0]),slope,start:a[1]-slope*a[0]}];
  }));
  for(let i=0;i<edges.length;i++)for(let j=i+1;j<edges.length;j++)for(const a of edges[i])for(const b of edges[j]){
    if(Math.abs(a.slope-b.slope)<1e-10)continue;
    const x=(b.start-a.start)/(a.slope-b.slope);
    if(x>Math.max(a.left,b.left)&&x<Math.min(a.right,b.right))cuts.add(x);
  }
  const sorted=[...cuts].sort((a,b)=>a-b);
  let covered=0;
  for(let i=1;i<sorted.length;i++){
    const w=sorted[i]-sorted[i-1];
    if(w<1e-7)continue;
    const x=sorted[i-1]+w/2;
    const intervals=edges.flatMap(p=>{
      const z=p.filter(e=>x>e.left&&x<e.right).map(e=>e.start+x*e.slope);
      return z.length>1?[[Math.min(...z),Math.max(...z)]]:[];
    }).sort((a,b)=>a[0]-b[0]);
    let right=-Infinity;
    for(const [a,b] of intervals){if(b>right){covered+=w*(b-Math.max(a,right));right=b;}}
  }
  covered=Math.min(total,Math.max(0,covered));
  return {total:total/1e6,covered:covered/1e6,free:(total-covered)/1e6};
}
