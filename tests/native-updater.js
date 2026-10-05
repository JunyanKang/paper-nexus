const base=Zotero.CiteLensTestRoot,{CiteLensUpdater:up,CiteLensUI:U}=Zotero.CiteLensQA,{AddonManager:AM}=ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs'),addon=await AM.getAddonByID('cite-lens@local.research'),before=addon.applyBackgroundUpdates,doc=Zotero.Reader._readers[0]._iframeWindow.document,report={run:'native-updater',checks:[]},check=(name,ok)=>{report.checks.push({name,ok});if(!ok)throw Error(name);};
try{
 for(const el of doc.querySelectorAll('.cl-overlay'))el.remove();U.settingsDialog(doc);
 const toggle=doc.getElementById('cl-setting-autoUpdate');
 for(const enabled of [false,true]){toggle.checked=enabled;toggle.dispatchEvent(new doc.defaultView.Event('change'));for(let n=0;n<40&&toggle.disabled;n++)await Zotero.Promise.delay(50);check('Native background policy '+enabled,Number((await AM.getAddonByID(addon.id)).applyBackgroundUpdates)===(enabled?AM.AUTOUPDATE_ENABLE:AM.AUTOUPDATE_DISABLE)&&up.snapshot().automatic===enabled);}
 doc.querySelector('.cl-dialog-header button').click();U.settingsDialog(doc);check('Policy survives reopening settings',doc.getElementById('cl-setting-autoUpdate').checked);
 const button=[...doc.querySelectorAll('.cl-dialog button')].find(x=>x.textContent==='检查更新');button.click();check('Manual check immediately disables repeated requests',button.disabled&&up.phase==='checking');
 for(let n=0;n<500&&up.phase==='checking';n++)await Zotero.Promise.delay(100);
 check('Native check completes with actionable state',['error','current','available'].includes(up.phase)&&!button.disabled&&!!doc.querySelector('[data-update-status]').textContent);
 report.transportState=up.phase;doc.querySelector('.cl-dialog-header button').click();check('Closing settings releases update observer',up.subscribers.size===0);U.settingsDialog(doc);doc.querySelector('.cl-settings').closest('.cl-overlay').remove();await Zotero.Promise.delay(50);check('Externally removed settings releases update observer',up.subscribers.size===0);report.passed=true;
}catch(e){report.passed=false;report.error=String(e);report.stack=e.stack;}
finally{addon.applyBackgroundUpdates=before;await up.load();doc.querySelector('.cl-settings .cl-dialog-header button')?.click();await IOUtils.writeUTF8(base+'/test-results/native-updater.json',JSON.stringify(report,null,2));}return report;
