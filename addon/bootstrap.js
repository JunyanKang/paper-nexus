var CiteLensScope;
async function startup({rootURI, version}) {
  await Zotero.initializationPromise;
  CiteLensScope = {Zotero, Services, ChromeUtils, Components, IOUtils, PathUtils};
  for (const file of ['core.js','citation-links.js','authors.js','epmetrics.js','localmetrics.js','bibliography.js','style.js','services.js','ui.js','updater.js','network-core.js','network.js','network-ui.js','main.js']) {
    Services.scriptloader.loadSubScript(rootURI + file, CiteLensScope);
  }
  CiteLensScope.CiteLens.version = version;
  CiteLensScope.CiteLens.rootURI = rootURI;
  await CiteLensScope.CiteLens.start();
}
async function shutdown() { if (CiteLensScope) await CiteLensScope.CiteLens.stop(); CiteLensScope = null; }
function install() {}
function uninstall() {}
function onMainWindowLoad({window}) { CiteLensScope?.CiteLens.addWindow(window); }
function onMainWindowUnload({window}) { CiteLensScope?.CiteLens.removeWindow(window); }
