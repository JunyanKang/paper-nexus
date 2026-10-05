<p align="center"><img src="addon/assets/nexus.png" width="112" alt="Paper Nexus" /></p>
<h1 align="center">Paper Nexus</h1>
<p align="center">从一处引文，读到它背后的文献与关联。</p>

Zotero 的引文阅读与本地文献网络插件。悬停查看、保存到指定文献夹、搜索本地全文，并沿有依据的关系继续阅读。

**0.4.2** · [下载插件](https://github.com/JunyanKang/paper-nexus/releases/latest) · [使用指南](docs/GUIDE.md) · [验证记录](docs/VALIDATION.md) · [五轮设计评审](docs/QUALITY-REVIEW.md)

## 阅读时，只显示需要的信息

![引文卡片](docs/images/hover.png)

- 正文引文重新对应文末列表：作者、年份、同年后缀、连续年份及编号区间逐项检查。原生跳转目标不作为准确性的保证。
- 多篇引用连续展示，共用圆角外框，条目之间用细线连接；无需翻页。作者一行显示，超过六位时保留前三位与后三位。
- 悬停题名展开真实摘要，自动靠左或靠右贴边，保留文献卡片；窄窗口在条目下方展开。
- 浮窗宽度、字号与留白随阅读区域调整，高度最多占 56%，较长内容在面板内滚动，统一隐藏滚动条。
- 期刊／书籍、出版商、IF、Q 分区和 DOI；已有记录显示具体文献库与完整文献夹路径。
- 保存／打开、稍后读和四项菜单放在右上角。后台查询不会主动弹出候选；明显不符的题名、作者、年份或 DOI 在进入候选窗口前剔除。

![题名旁的摘要](docs/images/abstract.png)

## 本地文献，沿证据关联

![本地文献网络](docs/images/network.png)

从工具菜单或Paper Nexus 面板进入文献网络。按 Library／Collection 筛选、搜索书目信息或已有的本地全文索引，查看命中片段，打开原文。

引用关系、Zotero 已有相关条目、同名署名分别显示。引用依据能打开文末来源页；局部关系图支持跟随、返回、拖动、平移和缩放。完整结果在列表中，图按需展开。

**边界：** 同名署名不等于已消歧作者；局部引用网络来自已读取的 PDF 参考文献，不代表全库已完整解析。全文检索为已有索引的字面检索，尚不包含 OCR 或语义检索。[功能与边界](docs/NETWORK.md)

## 安装与更新

1. 在 [Releases](https://github.com/JunyanKang/paper-nexus/releases/latest) 下载 `paper-nexus-0.4.2.xpi`。
2. Zotero → 工具 → 插件 → 齿轮 → 从文件安装插件，选择该文件。
3. 打开带文字层的 PDF，点击工具栏的连接节点图标，或从工具菜单进入 **Paper Nexus**。

无需 Python、Node、API key 或额外模型。清单支持 Zotero **10.0.5–10.0.x**；实机验证为 macOS 上的 Zotero 10.0.6 beta，其他平台未实机认证。

设置底部可以手动检查并安装更新，检查结果固定显示在按钮下方，超时可重试或打开发布页；“更多设置”中可切换自动更新。自动更新同时受 Zotero 全局开关控制，下载与哈希校验由 Zotero 完成。

**从 CiteLens 0.3.3 升级：** 旧版没有有效的公开更新地址，需手动安装一次本版。沿用原插件 ID，保留设置、阅读清单和缓存，之后使用公开更新通道。

## 指标与隐私

优先使用用户自备指标和已安装插件可读取的本地指标，缺失时使用可选离线表。主界面不堆砌来源品牌。期刊指标按年份匹配，多学科显示同年最佳分区，并在提示中列出全部学科。JCI 如可用仅放在提示中；不伪造缺失数据，不附带受限 JCR 数据表。

本地网络不上传书目或全文。题名悬停按需向 PubMed／PMC、Europe PMC 或 Crossref 查询当前条目的标识符或书目信息，优先读取本地摘要；整体等待最多 12 秒，可重试。设置 → 更多设置可填写可选的 NCBI E-utilities API key，不填写也能查询。密钥只存 Zotero 本机偏好设置，只发送到 NCBI；不随阅读清单或导出文件保存。开启作者查询／文献信息更新时，也会向 Crossref／Europe PMC 查询当前条目；指标下载和插件更新分别请求其公开服务。[指标说明](docs/METRICS.md)

## 开发与证据

`npm test` 执行纯逻辑与服务测试，`npm run build` 生成 XPI 和 `updates.json`。原生测试必须在隔离资料库运行，见 [测试指南](docs/TESTING.md)。

[实现调研](docs/RESEARCH.md) · [匹配规则](docs/MATCHING.md) · [Logo 设计提示词](docs/BRAND.md) · [MIT License](LICENSE)
