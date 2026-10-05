const base=Zotero.CiteLensTestRoot,{CiteLensUI:U,CiteLensServices:S,CiteLensUpdater:up}=Zotero.CiteLensQA,d=Zotero.Reader._readers[0]._iframeWindow.document,report={run:'update-feedback',checks:[]},settings={...S.state.settings},manager=up.manager,launch=Zotero.launchURL,initialSubscribers=up.subscribers.size;
const check=(name,ok)=>{report.checks.push({name,ok});if(!ok)throw Error(name);};
const frame=d.createElement('iframe');frame.style.cssText='position:fixed;left:0;top:0;width:360px;height:320px;z-index:200000;background:white;border:0';frame.src='about:blank';d.body.append(frame);await Zotero.Promise.delay(100);const fd=frame.contentDocument;
const capture=async(name)=>{await Zotero.Promise.delay(80);const b=frame.getBoundingClientRect(),canvas=d.createElement('canvas');canvas.width=720;canvas.height=640;const ctx=canvas.getContext('2d');ctx.scale(2,2);ctx.drawWindow(d.defaultView,b.x,b.y,360,320,'#fff');await IOUtils.write(base+'/test-results/'+name+'.png',Uint8Array.from(d.defaultView.atob(canvas.toDataURL('image/png').split(',')[1]),x=>x.charCodeAt(0)));};
const visible=node=>{const b=node.getBoundingClientRect();if(!b.height||b.top<0||b.bottom>fd.defaultView.innerHeight)return false;for(let p=node.parentElement;p;p=p.parentElement){if(/auto|scroll|hidden/.test(fd.defaultView.getComputedStyle(p).overflowY)){const r=p.getBoundingClientRect();if(b.top<r.top||b.bottom>r.bottom)return false;}}return true;};
try{
 S.state.settings={...settings,fontSize:16,theme:'light'};U.style(fd);U.settingsDialog(fd);fd.querySelector('details').open=true;const body=fd.querySelector('.cl-dialog-body'),button=[...fd.querySelectorAll('button')].find(x=>x.textContent==='检查更新'),status=fd.querySelector('[data-update-status]');
 body.scrollTop=0;button.click();check('Actual click immediately shows checking state',button.disabled&&up.phase==='checking');
 for(let n=0;n<500&&up.phase==='checking';n++)await Zotero.Promise.delay(100);
 report.transportState=up.phase;report.status=status.textContent;await capture('updater-feedback');
 check('Actual update check returns an actionable result',['current','available','error'].includes(up.phase)&&!button.disabled);
 check('Update result is visible without scrolling settings',visible(status)&&visible(button));
 body.scrollTop=body.scrollHeight;check('Update result stays visible while settings body scrolls',visible(status)&&visible(button));
 check('Update result is announced accessibly',status.getAttribute('role')==='status'&&status.getAttribute('aria-live')==='polite');
 const actual=up.snapshot();let launched='';Zotero.launchURL=url=>launched=url;
 up.manager=()=>({UPDATE_WHEN_USER_REQUESTED:1,getAddonByID:async()=>({findUpdates:listener=>listener.onUpdateFinished(null,7),cancelUpdate(){}})});
 button.click();for(let n=0;n<30&&up.phase==='checking';n++)await Zotero.Promise.delay(20);
 const release=[...fd.querySelectorAll('button')].find(x=>x.textContent==='打开发布页');await capture('updater-error');
 check('Failure has visible retry and release link',up.phase==='error'&&button.textContent==='重试检查'&&visible(status)&&visible(release));
 release.click();check('Fallback opens the actual release page',launched==='https://github.com/JunyanKang/paper-nexus/releases/latest');
 up.manager=()=>({UPDATE_WHEN_USER_REQUESTED:1,getAddonByID:async()=>({findUpdates:listener=>listener.onUpdateFinished(null,0),cancelUpdate(){}})});
 button.click();for(let n=0;n<30&&up.phase==='checking';n++)await Zotero.Promise.delay(20);
 check('Retry completes and removes obsolete failure controls',up.phase==='current'&&!button.disabled&&release.hidden&&visible(status));
 frame.style.width='480px';frame.style.height='500px';await Zotero.Promise.delay(80);check('Footer follows a resized settings viewport',visible(status)&&visible(button));
 fd.querySelector('.cl-dialog-header button').click();check('Closing dialog releases subscriber',up.subscribers.size===initialSubscribers);
 up.set(actual.phase,actual.message);report.passed=true;
}catch(e){report.passed=false;report.error=String(e);report.stack=e.stack;}
finally{frame.remove();up.manager=manager;Zotero.launchURL=launch;S.state.settings=settings;await IOUtils.writeUTF8(base+'/test-results/update-feedback.json',JSON.stringify(report,null,2));}return report;
