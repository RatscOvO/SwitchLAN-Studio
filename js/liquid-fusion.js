/*
 * SwitchLAN Studio liquid-glass integration.
 * Adapted SDF/texture normalization from the MIT-licensed Liquid Glass Web
 * (xiaofangstudio/liquid-glass-web), whose refraction engine credits Shu Ding
 * (github.com/shuding/liquid-glass, MIT). Details in THIRD_PARTY_NOTICES.md.
 *
 * Kept on navigation/brand/primary controls only. Windows permission and
 * credential content never receives an optical-distortion filter.
 */
(function(){
  'use strict';
  const NS='http://www.w3.org/2000/svg';
  function smoothStep(a,b,t){t=Math.max(0,Math.min(1,(t-a)/(b-a)));return t*t*(3-2*t);}
  function roundedRectSDF(x,y,w,h,r){
    const qx=Math.abs(x)-w+r,qy=Math.abs(y)-h+r;
    return Math.min(Math.max(qx,qy),0)+Math.hypot(Math.max(qx,0),Math.max(qy,0))-r;
  }
  function makeFilter(){
    if(!document.createElement('canvas').getContext)return;
    const W=192,H=76,canvas=document.createElement('canvas');
    canvas.width=W;canvas.height=H;
    const ctx=canvas.getContext('2d');
    if(!ctx||typeof ImageData==='undefined')return;
    const data=new Uint8ClampedArray(W*H*4), raw=new Float32Array(W*H*2);
    let maxScale=0;
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){
      const uvx=(x+.5)/W,uvy=(y+.5)/H;
      const ix=uvx-.5,iy=uvy-.5;
      // Inset SDF: flat center, curved edge, from referenced engine.
      const distance=roundedRectSDF(ix,iy,.3,.2,.6);
      const displacement=smoothStep(.8,0,distance-.15);
      const scaled=smoothStep(0,1,displacement);
      const dx=(ix*scaled+.5-uvx)*W;
      const dy=(iy*scaled+.5-uvy)*H;
      const i=(y*W+x)*2;raw[i]=dx;raw[i+1]=dy;
      maxScale=Math.max(maxScale,Math.abs(dx),Math.abs(dy));
    }
    maxScale=Math.max(.001,maxScale*.5);
    for(let i=0;i<W*H;i++){
      data[i*4]=Math.round((raw[i*2]/maxScale+.5)*255);
      data[i*4+1]=Math.round((raw[i*2+1]/maxScale+.5)*255);
      data[i*4+2]=128;data[i*4+3]=255;
    }
    const bitmap=new ImageData(data,W,H);
    ctx.putImageData(bitmap,0,0);
    const svg=document.createElementNS(NS,'svg');
    svg.setAttribute('width','0');svg.setAttribute('height','0');svg.setAttribute('aria-hidden','true');
    svg.style.cssText='position:absolute;pointer-events:none;overflow:hidden';
    const defs=document.createElementNS(NS,'defs'),f=document.createElementNS(NS,'filter');
    f.id='sl-liquid-refract';f.setAttribute('filterUnits','objectBoundingBox');
    f.setAttribute('x','0');f.setAttribute('y','0');f.setAttribute('width','1');f.setAttribute('height','1');
    const fe=document.createElementNS(NS,'feImage');
    fe.setAttribute('href',canvas.toDataURL('image/png'));
    fe.setAttribute('preserveAspectRatio','none');fe.setAttribute('result','sl-map');
    const dm=document.createElementNS(NS,'feDisplacementMap');
    dm.setAttribute('in','SourceGraphic');dm.setAttribute('in2','sl-map');
    dm.setAttribute('xChannelSelector','R');dm.setAttribute('yChannelSelector','G');
    dm.setAttribute('scale',String(Math.min(10,maxScale)));
    f.append(fe,dm);defs.appendChild(f);svg.appendChild(defs);
    document.body.appendChild(svg);
  }
  try{makeFilter();}catch(_){/* Fallback to ordinary translucency */}
  const targetSelector='.liquid-button,.core-shell .btn.primary,.core-shell .brandlogo,.core-shell .iconbtn';
  document.addEventListener('pointerdown',e=>{
    if(document.body.dataset.glass==='off'||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    const target=e.target.closest(targetSelector);
    if(!target||target.disabled)return;
    const rect=target.getBoundingClientRect();
    const dx=(e.clientX-rect.left)/Math.max(rect.width,1)-.5;
    const dy=(e.clientY-rect.top)/Math.max(rect.height,1)-.5;
    target.style.setProperty('--press-origin-x',`${50-dx*42}%`);
    target.style.setProperty('--press-origin-y',`${50-dy*42}%`);
    target.classList.remove('liquid-pressed');
    void target.offsetWidth;
    target.classList.add('liquid-pressed');
    function end(){target.classList.remove('liquid-pressed');}
    target.addEventListener('pointerup',end,{once:true});
    target.addEventListener('pointercancel',end,{once:true});
    window.addEventListener('pointerup',end,{once:true});
  },{passive:true});
  // Playful 3D tilt on navigation tiles. Purely visual: click targets and
  // actual Windows backend requests remain completely untouched.
  let activeCard=null;
  const finePointer=window.matchMedia('(hover:hover) and (pointer:fine)');
  document.addEventListener('pointermove',e=>{
    if(!finePointer.matches||document.body.dataset.glass!=='full'||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    const tile=e.target.closest('.core-action-card.game-card,.core-game-workbench .wb-entry.game-card');
    if(activeCard&&activeCard!==tile){activeCard.classList.remove('game-tilt');activeCard.style.removeProperty('--tilt-x');activeCard.style.removeProperty('--tilt-y');activeCard= null;}
    if(!tile)return;
    const b=tile.getBoundingClientRect();
    const x=Math.max(0,Math.min(1,(e.clientX-b.left)/Math.max(b.width,1)));
    const y=Math.max(0,Math.min(1,(e.clientY-b.top)/Math.max(b.height,1)));
    tile.style.setProperty('--tilt-x',`${((.5-y)*7).toFixed(1)}deg`);
    tile.style.setProperty('--tilt-y',`${((x-.5)*7).toFixed(1)}deg`);
    tile.style.setProperty('--spot-x',`${(x*100).toFixed(1)}%`);
    tile.style.setProperty('--spot-y',`${(y*100).toFixed(1)}%`);
    tile.classList.add('game-tilt');activeCard=tile;
  },{passive:true});
  document.addEventListener('pointerleave',()=>{if(activeCard){activeCard.classList.remove('game-tilt');activeCard=null;}},true);
  // Cursor-following reflection; throttled by animation frames and never impacts clicks.
  let scheduled=false,point=null;
  document.addEventListener('pointermove',e=>{
    if(document.body.dataset.glass==='off')return;
    point={x:e.clientX,y:e.clientY};
    if(scheduled)return;
    scheduled=true;
    requestAnimationFrame(()=>{
      scheduled=false;
      if(!point)return;
      const els=document.querySelectorAll('.core-shell .nav-link,.core-shell .btn.primary');
      els.forEach(el=>{
        const r=el.getBoundingClientRect();
        if(point.x<r.left-100||point.x>r.right+100||point.y<r.top-100||point.y>r.bottom+100)return;
        el.style.setProperty('--light-x',`${(point.x-r.left)/Math.max(r.width,1)*100}%`);
        el.style.setProperty('--light-y',`${(point.y-r.top)/Math.max(r.height,1)*100}%`);
      });
    });
  },{passive:true});
})();
