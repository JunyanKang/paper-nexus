<p align="center"><img src="docs/images/hero.png" width="960" alt="Paper Nexus · Read a paper. Discover the connections."></p>

<h1 align="center">Follow a citation. Discover a network.</h1>

<p align="center"><a href="README.md">简体中文</a> · <b>English</b></p>
<p align="center">Understand a reference, compare its abstract, and save what matters—all inside Zotero.<br>Then follow authors, topics and citations to your next paper.</p>
<p align="center"><b>Citation hover cards · Bilingual abstracts · Local multicentre networks</b></p>
<p align="center"><a href="#download-and-install">Download</a> · <a href="docs/GUIDE.md">Illustrated guide</a> · <a href="https://github.com/JunyanKang/paper-nexus/issues">Feedback</a></p>

<p align="center"><img src="docs/images/topics.png" width="960" alt="Paper Nexus topic network showing multiple research communities"></p>

## Who does this sentence cite?

Hover over a numbered, superscript or author–year citation. Its reference appears beside the text. Multiple references form a continuous stack, ready to compare without paging through cards.

**Title, authors, year, journal, and available IF and Q metrics** stay together. Open the DOI from the title, or jump to an existing Zotero item and see which collection contains it.

<p align="center"><img src="docs/images/hover.png" width="540" alt="Two references from one citation, displayed as connected silver-themed cards"></p>

## Read the abstract before opening another paper

Hover over a title to open its abstract beside the card. Switch between **original, translated and bilingual** views. Sentence pairs and subtle background colours make it easy to check a term against the source.

Move or resize the window, or dock it on any side of the card. Keep it nearby as you read; click elsewhere in the PDF to close it.

<p align="center"><img src="docs/images/translation.png" width="500" alt="Sentence-paired bilingual abstract using the same silver theme"></p>

Choose **Tencent, Microsoft, Google**, or your own **language-model API**. PubMed/PMC abstract lookup works without an API key. [Reading and translation →](docs/GUIDE.md#读摘要与译文)

## Turn your library into a map you can explore

Find the authors working across your collection, the subjects it covers, and the papers that connect them.

| What you want to explore | Where to start |
|---|---|
| Authors and their papers | Switch to **Authors** |
| Research subjects across a collection | Switch to **Topics**, using local titles and abstracts |
| A particular paper or author | Search and locate it in the graph |
| A paper's immediate connections | Select its node, then focus its neighbourhood |
| References beyond your library | Choose **Expand references** |

**No paper is assigned as the centre.** Multiple communities arrange themselves around their relationships. Each pair of nodes shares one line; its width reflects distinct relationship signals. Select a node to inspect those connections. The overview shows research topics or authors; select a topic to reveal its papers. Pan with two fingers, pinch to zoom, or drag a node to reposition it.

<p align="center"><img src="docs/images/network.png" width="960" alt="Author cooperation network with shared papers and direct collaborators"></p>

**Topics and authors offer two distinct views.** Topic nodes organize research content from titles and abstracts; select one to reveal its papers. Author nodes bring together papers across years and connect through coauthored work. Expanded references follow the same rules, with existing local papers merged into the network.

Adding, editing or deleting Zotero items updates the graph in the background. Unchanged work is reused, progress stays in the corner, and the existing network remains available. Open a local item or PDF from its details, or save an external reference. [Explore the network →](docs/NETWORK.md)

### One XPI, with the local model included

**The complete package is approximately 22.5 MB and includes the semantic model, tokenizer and runtime.** Install it to build a network from your own Zotero library. No separate model download, API key or training step is required.

Titles alone can participate; available abstracts add context. On first opening a library or collection, Paper Nexus builds a local semantic index with visible progress. Subsequent updates reuse cached work. Each person's network comes from their own papers; the package contains no other user's bibliography or precomputed network.

For more concise topic names, enable **Language model · API** under **General → Topic analysis**. Your selected model names the groups formed locally. Translation and topic naming can share a provider key while using separate models. Default local topic analysis works offline; abstract lookup and online translation use their respective services when requested.

## Keep the useful connections

**Read later** keeps a lead close at hand. **Save** chooses an existing or new collection; papers already in your library open directly.

**Locate citations** takes you back to the argument. Hover over the location icon and count, then choose an occurrence from a compact list.

<p align="center"><img src="docs/images/citation-locations.png" width="500" alt="Compact citation-location menu, with the current occurrence distinguished"></p>

**Copy references** in your preferred style. Choose from **33 CSL style entries**, including APA, AMA, MLA, NLM, Vancouver, Nature, Science, Cell, PNAS, NEJM, JAMA, eLife, PLOS, Development and IOVS.

## Comfortable from the first click

Two settings pages keep things simple: **General** for data and translation, with updates at the bottom; **Appearance** for themes, fonts, sizes and interface language.

Ten themes, custom backgrounds and adjustable transparency carry through cards, abstracts, menus and the network. Paper Nexus and [Paper Voice](https://github.com/JunyanKang/paper-voice) belong to the same family: one follows connections; the other reads papers aloud.

<p align="center"><img src="docs/images/settings-general.png" width="324" alt="General settings with update controls at the bottom"> <img src="docs/images/settings.png" width="324" alt="Appearance settings"></p>

## Download and install

For **Zotero 10.0.5–10.0.x**. Free and open source; no separate Python or Node.js installation.

The current version is **0.4.8**, with the local semantic model included. New users can download the complete XPI; existing users can upgrade from the plugin settings.

**[Download the complete 0.4.8 XPI →](https://github.com/JunyanKang/paper-nexus/releases/tag/v0.4.8)**

1. Obtain the complete **paper-nexus-VERSION.xpi**; public versions are listed under release assets. No source ZIP or separate model is needed.
2. In Zotero, choose **Tools → Plugins → gear menu → Install Plugin From File**.
3. Open a PDF and hover over a citation, or click the paper-and-magnifier toolbar icon.

Existing users can check for updates at the bottom of **Settings → General**, or enable automatic updates. Preferences and reading lists stay with you.

[Illustrated guide](docs/GUIDE.md) · [Installation](docs/INSTALL.md) · [FAQ](docs/FAQ.md) · [Privacy](docs/PRIVACY.md) · [What's new](CHANGELOG.md)

Created by [Junyan Kang](https://github.com/JunyanKang) · [MIT License](LICENSE) · [Contributing](CONTRIBUTING.md)
