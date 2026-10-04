const base=Zotero.CiteLensTestRoot,{CiteLensNetworkUI:NU,CiteLensUI:U,CiteLensServices:S}=Zotero.CiteLensQA,r=Zotero.Reader._readers[0],d=r._iframeWindow.document,settings={...S.state.settings},report={run:'network-layout',checks:[]},check=(name,ok)=>{report.checks.push({name,ok});if(!ok)throw Error(name);};let frame,modal;
try{
for(const [width,height,theme] of [[620,540,'dark'],[420,640,'light']]){
 frame=d.createElement('iframe');frame.style.cssText=`position:fixed;left:0;top:0;width:${width}px;height:${height}px;z-index:900000;background:white;border:0`;frame.src='about:blank';d.body.append(frame);await Zotero.Promise.delay(150);const fd=frame.contentDocument;
 S.state.settings={...settings,theme,fontSize:14};modal=NU.open(null,{doc:fd});for(let i=0;i<80&&!modal.querySelector('.pn-paper');i++)await Zotero.Promise.delay(100);
 check('Network fits '+width+'px viewport',modal.scrollWidth<=modal.clientWidth+1&&modal.getBoundingClientRect().right<=width);
 check('Visible controls fit '+width+'px viewport',[...modal.querySelectorAll('.pn-controls button,.pn-controls select,.pn-controls input')].every(e=>e.getBoundingClientRect().right<=width));
 check('Icon remains loaded in '+theme+' reader content',modal.querySelector('.pn-logo').naturalWidth>0);
 const canvas=d.createElement('canvas');canvas.width=width*2;canvas.height=height*2;const ctx=canvas.getContext('2d');ctx.scale(2,2);const b=frame.getBoundingClientRect();ctx.drawWindow(d.defaultView,b.x,b.y,width,height,'#fff');await IOUtils.write(base+'/test-results/review-4-network-'+theme+'.png',Uint8Array.from(d.defaultView.atob(canvas.toDataURL('image/png').split(',')[1]),x=>x.charCodeAt(0)));
 modal.querySelector('.cl-dialog-header button').click();frame.remove();
}report.passed=true;
}catch(e){report.passed=false;report.error=String(e);report.stack=e.stack;}
finally{modal?.querySelector('.cl-dialog-header button')?.click();frame?.remove();S.state.settings=settings;await IOUtils.writeUTF8(base+'/test-results/network-layout.json',JSON.stringify(report,null,2));}return report;
