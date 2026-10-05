# 实现调研与采用决策

本次调研读取了下列项目的实际文档或源码。借鉴交互和架构策略；未复制 AGPL 或无许可证项目的代码。

| 项目与阅读材料 | 采用的策略 | 本产品的实现与边界 |
|---|---|---|
| [Zotero PDF worker](https://github.com/zotero/pdf-worker/blob/master/src/pdf/structure/citation-refs.js)、[citation parsing](https://github.com/zotero/pdf-worker/blob/master/src/pdf/structure/citations.js) | 正文位置、编号、作者年份是不同证据；有歧义不强制绑定；区分正文与图表数字 | `citation-links.js` 从真实正文重新对应文末列表。原生跳转不是匹配结论；连续年份、a/b、两位作者和编号区间逐项对应 |
| [Zotero Fulltext](https://github.com/zotero/zotero/blob/main/chrome/content/zotero/xpcom/fulltext.js) | 复用已有附件文本缓存、条目标识和索引 | 全文搜索只读现有本地缓存，展示命中片段，缺索引时明确显示；不重新下载全文或自动 OCR |
| [Obsidian Graph view](https://github.com/obsidianmd/obsidian-help/blob/master/en/Plugins/Graph%20view.md) | 局部图、过滤、焦点、平移缩放、方向 | 默认关联列表，用户打开局部图；仅显示当前论文与至多 12 个邻居；完整关联保留在列表，不把图当科研结论 |
| [Cytoscape.js](https://github.com/cytoscape/cytoscape.js)、[performance](https://github.com/cytoscape/cytoscape.js/blob/master/documentation/md/performance.md)（MIT） | 限制可见节点、索引查找、批处理、避免持续布局动画 | 当前小型局部图采用原生 SVG，未引入此依赖；批量加载每 80 条让出主线程，同名作者通过倒排索引查找 |
| [Better Notes link utilities](https://github.com/windingwind/zotero-better-notes/blob/master/src/utils/link.ts)（AGPL-3.0） | 稳定 library/key 链接、来源位置、递归访问去重 | 独立实现 `libraryID:itemKey` 标识，保留附件和参考文献页；不复制其代码 |
| [Inciteful Zotero](https://github.com/inciteful-xyz/inciteful-zotero-plugin)（AGPL-3.0） | 从当前文献进入关系探索，图与阅读行为衔接 | 作为流程对照；其远程 Inciteful 服务不等同本地库聚合，本产品不使用其后端 |
| [Paper Voice](https://github.com/JunyanKang/paper-voice) | Zotero 原生 AddonManager 更新，发布资产哈希，读取器资源访问 | 自动／手动更新交给宿主验证和安装；图标通过带版本的资源路径加载 |
| [Crossref REST API](https://github.com/CrossRef/rest-api-doc) | DOI 查询与书目检索分开，出版日期来源可不同 | 先检查标题、作者和年份冲突再排序；±1 年仅允许人工选择，远超范围直接过滤；缓存也重新过过滤规则 |

另评估了 `rmhorne/Zotero-Graph-Atlas`（MIT，但调研时 README 信息不足），以及 `JIE-98/zotero_graph`（调研时未见许可证）。未把二者当成可直接移植的成熟实现。

## 决策原则

- 引文检索、元数据补充、库内重复判断、网络边是四个不同判断，不能互相借用“已确认”标签。
- 年份差异不能单独证明一定是不同论文，但超过一年不应出现在普通更新候选中；可能的特殊再版保留原文，用户可独立整理。
- 同名作者不等于同一人，更不代表合作关系已经消歧；缩写署名不生成作者边。
- 引用关系只表示文末引用，不推断支持、反对、因果或主题相似。
- JCR/IF 是期刊年度指标，不是文章质量分数。各来源不在主界面堆砌；年份和多学科信息保留在提示中。

## 0.4.1：摘要与自适应连续面板

- [NCBI E-utilities 使用限制与 API key](https://eutilities.github.io/site/API_Key/usageandkey/)：无 key 每秒最多 3 次，默认 key 每秒最多 10 次。实现采用间隔 380／120 ms，并以 POST 传 key。
- [Biopython Entrez](https://github.com/biopython/biopython/blob/master/Bio/Entrez/__init__.py)：参考集中限流与暂时性错误处理思想；没有引入 Python 运行依赖。浮窗有 12 秒总预算，不做阻塞式长时间重试。
- [PubMed EFetch](https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=26658507&retmode=xml) 和 [PMC EFetch](https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pmc&id=3598659&retmode=xml)：实测 XML 中的结构化摘要、作者、文章级 DOI／PMID／PMCID。解析只读文章头部，排除参考文献列表中的标识符。
- Zotero Reader 的引用浮窗包含 `.inner`／`.reference-row`，PDF 在子 iframe；摘要保留在引用卡 DOM 下，用原生 Popover 进入顶层显示，避免被滚动容器裁切。外部点击需覆盖 PDF 子文档，卸载与卡片移除时清理。
- CSS 容器查询处理窄卡头部，视口单位调整字号与宽高，ResizeObserver 在异步内容和缩放后校正位置。摘要只在左右可用宽度至少 220 px 时侧置，否则内联；不浮盖引用卡。

## 0.4.3：上标、摘要检索与翻译

- 对照真实 Nature Communications 14:1753（2023）PDF 的字形坐标与原生引用分词，修正 `RPB1²⁶ → 6` 截断；另核验 `PRDM9⁶⁰`、`Bowtie2⁷⁹` 和 `ggplot2⁹²` 的未识别链接。使用完整小号上标组作为编号，补偿同页已确认引用的字体缩放模式；不修改 Zotero 的 PDF 文本层。
- PubMed 标题逐词查询中，单独的 `during[Title]` 会因未索引停用词而返回零结果。实测 PMID 33208928；采用完整标题后回退有效关键词，Europe PMC 也支持无 DOI 的标题查询，仍检验作者、年份与题名。不把空检索结果当作数据库肯定没有摘要。
- [Paper Voice translation](https://github.com/JunyanKang/paper-voice/blob/main/addon/translation.js)、[LLM](https://github.com/JunyanKang/paper-voice/blob/main/addon/llm.js)（MIT）：适配其免费引擎、模型服务配置、加密凭据、流式解析与科学术语保护。实现为本插件自己的模块，不依赖 Paper Voice 安装；保留版权说明。只翻译当前摘要，过时结果隔离、失败保留原文、显式引擎选择。
- [Translate for Zotero](https://github.com/windingwind/zotero-pdf-translate) 的公开 `api.translate` 接口仅作为已安装插件的可选通道，不复制其实现。免费网页接口不保证长期稳定；大模型协议采用 OpenAI Chat Completions／Anthropic Messages，密钥不经过 Zotero HTTP 调试日志。
