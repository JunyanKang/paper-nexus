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
