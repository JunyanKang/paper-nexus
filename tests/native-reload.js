const base=Zotero.CiteLensTestRoot;
if(Services.dirsvc.get('ProfD',Components.interfaces.nsIFile).path!==base+'/qa-profile')throw Error('Isolated QA profile required');
if(Zotero.CiteLens)await Zotero.CiteLens.stop();
const scope={Zotero,Services,ChromeUtils,Components,IOUtils,PathUtils};for(const file of ['core.js','citation-links.js','authors.js','epmetrics.js','localmetrics.js','bibliography.js','style.js','services.js','ui.js','updater.js','network-core.js','network.js','network-ui.js','main.js'])Services.scriptloader.loadSubScriptWithOptions(Services.io.newFileURI(Zotero.File.pathToFile(base+'/addon/'+file)).spec,{target:scope,ignoreCache:true});
Zotero.CiteLensQA=scope;scope.CiteLens.version=JSON.parse(await IOUtils.readUTF8(base+'/addon/manifest.json')).version;scope.CiteLens.rootURI=Services.io.newFileURI(Zotero.File.pathToFile(base+'/addon/')).spec;await scope.CiteLens.start();return {passed:true};
