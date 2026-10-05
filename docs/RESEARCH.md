# 实现调研与采用决策

本次调研读取了下列项目的实际文档或源码。借鉴交互和架构策略；未复制 AGPL 或无许可证项目的代码。

| 项目与阅读材料 | 采用的策略 | 本产品的实现与边界 |
|---|---|---|
| [Zotero PDF worker](https://github.com/zotero/pdf-worker/blob/master/src/pdf/structure/citation-refs.js)、[citation parsing](https://github.com/zotero/pdf-worker/blob/master/src/pdf/structure/citations.js) | 正文位置、编号、作者年份是不同证据；有歧义不强制绑定；区分正文与图表数字 | `citation-links.js` 从真实正文重新对应文末列表。原生跳转不是匹配结论；连续年份、a/b、两位作者和编号区间逐项对应 |
| [Zotero Fulltext](https://github.com/zotero/zotero/blob/main/chrome/content/zotero/xpcom/fulltext.js) | 复用已有附件文本缓存、条目标识和索引 | 全文搜索只读现有本地缓存，展示命中片段，缺索引时明确显示；不重新下载全文或自动 OCR |
| [ResearchRabbit guide](https://www.researchrabbit.ai/articles/guide-to-using-researchrabbit) | 从种子论文继续发现相关工作 | 改为任务入口和可执行阅读动作，不复制其远程推荐服务 |
| [Local Citation Network 源码](https://github.com/LocalCitationNetwork/LocalCitationNetwork.github.io/blob/master/index.js)（GPL-3.0） | 区分引用与被引，保留缺失记录，防止将服务覆盖误当完整引用 | 独立实现本地引用和共同参考，保留未匹配／歧义；不复制 GPL 代码 |
| [biblionetwork coupling](https://github.com/agoutsmedt/biblionetwork/blob/main/R/biblio_coupling.R) | 共同参考文献可作为可解释的文献联系 | 使用引用集合交集，提供具体共同文献；不将交集分数当作科学支持度 |
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

## 0.4.4：界面分类与全局主题

参考同作者 Paper Voice 的统一面板、直接标签与语义主题机制。Paper Nexus 保留轻量阅读与大范围本地网络两种任务尺度，以暂存／恢复替代可见窗口层层叠加；设置在 0.4.6 归为常规、外观两类；常规页数据在上、翻译在下。十套配色与纹理独立打包，映射旧版偏好，并对每个已打开文档注册系统主题变化与卸载清理。

文献清单使用行内详情，保存流程去除冗余群组入口和二次原文折叠。主题覆盖清单、卡片、摘要、菜单、保存、设置、网络及等待／错误／选中状态；原生 Zotero 对话框保留系统样式。具体操作与覆盖范围见 [界面与主题](INTERFACE.md)。

## 0.4.6：本地网络、交互与 CSL

采用网络优先的工作区：按作者／主题组织本地文献，搜索定位、聚焦邻域，点击“扩展引文”后才加入库外参考。布局、聚类、去重和引用匹配由工作线程执行，读取库与 PDF 文本按时间片让出主线程，右侧关系按 16 条逐批建立。

| 成熟实现与来源 | 借鉴策略 | 本工具的落地 |
|---|---|---|
| [Sigma.js 标签网格](https://github.com/jacomyal/sigma.js/blob/main/packages/sigma/src/core/labels.ts) | 标签按屏幕密度选择，优先级稳定 | 独立实现屏幕网格避让，搜索与选中优先，文字无底框 |
| [Sigma.js camera](https://github.com/jacomyal/sigma.js/blob/main/packages/sigma/src/core/camera.ts) | 逐帧相机与有限时长过渡 | 游标锚定缩放、相机目标插值、搜索聚焦动画 |
| [Cytoscape.js 性能建议](https://js.cytoscape.org/#performance) | 视图操作时减少复杂边与标签 | 移动时降低绘制负担，稳定后恢复细节；主题样式与邻接关系缓存 |
| [Cytoscape.js 布局](https://js.cytoscape.org/#layouts) | 布局计算与视觉过渡分离 | 后台布局、节点位置渐变、拖拽后有限收敛；不持续漂移 |
| [Local Citation Network](https://github.com/LocalCitationNetwork/LocalCitationNetwork.github.io) | 明确引用方向、保留来源与缺失边界 | 引用边含来源页，未知不强行匹配；未复制 GPL 源码 |
| [官方 CSL 样式仓库](https://github.com/citation-style-language/styles) 与 [Zotero 样式说明](https://www.zotero.org/support/styles) | 格式定义与处理器分离 | Zotero 原有 citeproc-js 引擎，已安装 CSL 优先，其余按需下载／缓存；未复制 Zotero 的 AGPL 实现 |

主题聚类独立实现词项提取、题目加权、TF-IDF、余弦相似度和种子分组，倒排索引减少无关组比较。它是离线词项线索，不具备嵌入模型的同义词或跨语言能力。

官方 CSL 仓库已调整部分格式标识：PNAS 使用 `pnas`；NLM 提供 citation-sequence 与 name-year，Vancouver/NLM 为依赖格式。实现检查文件声明 ID，递归解析依赖并限制深度；网络失败不静默改用其他模板。CSL 文件自身遵循各自声明的许可，不将其重新标为产品 MIT 代码。

Paper Voice 的 MIT 主题、翻译交互与可逆面板动画作为同作者产品家族基础，保留来源说明。Logo 用实际 Paper Voice 角色作为风格参考，最终采用用户选择的放大镜版本。见 [设计说明](DESIGN.md)。
