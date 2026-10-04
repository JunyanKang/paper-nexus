const base=Zotero.CiteLensTestRoot,{AddonManager:AM}=ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs'),report={run:'manual-migration',from:'0.3.3',to:'0.4.0',checks:[]},check=(name,ok)=>{report.checks.push({name,ok});if(!ok)throw Error(name);};
try{
 if(Services.dirsvc.get('ProfD',Components.interfaces.nsIFile).path!==base+'/qa-profile')throw Error('Isolated QA profile required');
 const snapshot=JSON.parse(await IOUtils.readUTF8(base+'/qa-library/cite-lens/state.json'));
 for(const [path,version] of [['dist/cite-lens-0.3.3.xpi','0.3.3'],['dist/paper-nexus-0.4.0.xpi','0.4.0']]){
  const install=await AM.getInstallForFile(Zotero.File.pathToFile(base+'/'+path));await install.install();for(let n=0;n<100&&Zotero.CiteLens?.version!==version;n++)await Zotero.Promise.delay(100);
  const a=await AM.getAddonByID('cite-lens@local.research');check('Genuine package active '+version,a.isActive&&a.version===version&&Zotero.CiteLens?.version===version);
 }
 const after=JSON.parse(await IOUtils.readUTF8(base+'/qa-library/cite-lens/state.json'));
 check('Reading list identity preserved',JSON.stringify(snapshot.queue)===JSON.stringify(after.queue));check('Appearance and query settings preserved',JSON.stringify(snapshot.settings)===JSON.stringify(after.settings));check('Author cache retained',Object.keys(snapshot.authorCache).every(key=>!!after.authorCache[key]));
 report.passed=true;
}catch(e){report.passed=false;report.error=String(e);report.stack=e.stack;}await IOUtils.writeUTF8(base+'/test-results/manual-migration.json',JSON.stringify(report,null,2));return report;
