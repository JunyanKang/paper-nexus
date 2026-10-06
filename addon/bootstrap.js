var CiteLensScope;
async function startup({rootURI, version}) {
  await Zotero.initializationPromise;
  CiteLensScope = {Zotero, Services, ChromeUtils, Components, IOUtils, PathUtils};
  for (const file of ['core.js','citation-links.js','authors.js','epmetrics.js','localmetrics.js','bibliography.js','style.js','controls.js','i18n.js','themes.js','services.js','abstracts.js','translation.js','model-core.js','models.js','semantic-core.js','semantic-store.js','semantic.js','dock-motion.js','citation-format.js','ui.js','updater.js','network-core.js','network.js','network-view.js','network-ui.js','main.js']) {
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
