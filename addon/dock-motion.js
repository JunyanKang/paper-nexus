/* Reversible compositor motion toward the toolbar. No window capture, image
 * readback, temporary textures or per-frame JavaScript are needed. */
var CiteLensDockMotion = {
 create(panel,orb,fit,onSettled=()=>{}) {
  const win=panel.ownerDocument.defaultView,query=win.matchMedia('(prefers-reduced-motion: reduce)'),duration=360;
  let animation=null,target=false,disposed=false;
  const settle=show=>{
   const old=animation;animation=null;old?.cancel();panel.hidden=!show;panel.inert=!show;
   panel.style.pointerEvents=show?'':'none';panel.style.willChange='';panel.style.transformOrigin='';
   panel.dataset.clVisible=String(show);delete panel.dataset.dockMotion;delete panel.dataset.dockRenderer;
   if(!disposed)onSettled(show);
  };
  const show=visible=>{
   if(disposed)return;visible=!!visible;if(target===visible&&(animation||panel.hidden===!visible))return;target=visible;
   if(!visible&&panel.contains(panel.ownerDocument.activeElement))orb.focus({preventScroll:true});
   if(query.matches||!panel.animate){settle(visible);if(visible)fit();return;}
   const wasHidden=panel.hidden;panel.hidden=false;panel.inert=true;panel.style.pointerEvents='none';panel.dataset.clVisible=String(visible);panel.dataset.dockMotion=visible?'opening':'closing';
   if(!animation){
    fit();const b=panel.getBoundingClientRect(),o=orb.getBoundingClientRect(),base=win.getComputedStyle(panel).transform,transform=base==='none'?'':base;
    panel.style.transformOrigin=`${o.x+o.width/2-b.x}px ${o.y+o.height/2-b.y}px`;panel.style.willChange='transform,opacity';
    animation=panel.animate([{transform:transform+' scale(.015,.035)',opacity:0},{transform:transform+' scale(.38,.62)',opacity:.82,offset:.42},{transform:base,opacity:1}],{duration,easing:'cubic-bezier(.2,.75,.22,1)',fill:'both'});
    animation.pause();animation.currentTime=wasHidden?0:duration;
   }
   panel.dataset.dockRenderer='compositor';const current=animation;current.playbackRate=visible?1:-1.12;current.play();
   current.finished.then(()=>{if(animation===current)settle(target);},()=>{});
  };
  const refit=()=>{if(animation)settle(target);if(!panel.hidden)fit();},reduced=()=>{if(query.matches&&animation)settle(target);},background=()=>{if(panel.ownerDocument.hidden&&animation)settle(target);};
  win.addEventListener('resize',refit);query.addEventListener('change',reduced);panel.ownerDocument.addEventListener('visibilitychange',background);panel._clDockVisibility=show;
  return {show,refit,snap(visible){target=!!visible;settle(target);},finish(){if(animation)settle(target);},dispose(){if(disposed)return;disposed=true;settle(false);delete panel._clDockVisibility;win.removeEventListener('resize',refit);query.removeEventListener('change',reduced);panel.ownerDocument.removeEventListener('visibilitychange',background);}};
 }
};
