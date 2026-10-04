# 已安装插件的本地指标兼容

本文为开发者兼容说明；界面不向普通用户显示插件名称或内部回退顺序。

Paper Nexus 延续 CiteLens 0.3.1 的本地兼容：默认读取已启用的 Green Frog 与 Ethereal Style 的本地指标。没有共享密钥、凭据复制或新增云端请求。

## 来源和优先级

1. 用户明确导入的 CSV／JSON 保持最高优先级。
2. Green Frog：从同一期刊 Zotero 条目的 Extra 读取 `影响因子`、`JCR分区`、`SSCI`、`5年影响因子`、`JCI` 与 `中科院分区升级版`。ISSN/eISSN 优先，否则完整刊名严格匹配。只读，不改写原字段，不执行批量更新。
3. Ethereal Style：读取当前 Zotero 数据目录 `zoterostyle.json` 的期刊 `rank` 缓存；支持 `sciif`、`sci`、`ssci`、`sciif5`、`jci`、`sciUp`。匹配缓存刊名，检查已有 `rankQuery` 的来源及名称；可用 EasyPubMed 的唯一期刊身份桥接缩写。
4. 已下载的 EasyPubMed 离线表补充没有命中的期刊。

Extra 没有写入者标记，因此内部记录为「Green Frog 兼容字段 · Zotero Extra」，界面统一为「本地文献指标」，不会声称每个这样的字段一定由 Green Frog 写入。读取期刊缓存不依赖 Ethereal Style 的 Pro 功能。

## 年份与冲突

Green Frog 与 Ethereal Style 的现有格式通常没有指标年份。条目的发表年、修改日期和缓存文件时间都不能用作指标年，界面显示「年份未标注」。明确选择年度后，年份不明的值自动跳过，继续查找有该年度的来源。

同刊多条 Extra 记录的指标不一致时，适配层返回冲突，不任意挑一条。不同提供方数值不同时遵循内部优先级，保留各自数据但不在普通界面展示来源面板。不会拼接不同来源的 IF 和分区来伪装成同一套数据。主卡显示同年最佳 JCR 分区，提示保留各学科结果。

主卡仅显示 IF 和最佳 JCR 分区；JCI、五年 IF、中科院分区如有数据则保留在提示中。来源没有学科类别时标明未提供，不自行命名或从最佳分区推断全部学科。

## 刷新与关闭

兼容查找缓存约一分钟，Zotero 条目变动会清除该查询缓存。设置可「刷新指标」或关闭此功能。来源插件未启用或缓存缺失时，直接用后续来源；如需新的在线值，请先在原插件中更新，然后重新读取。Paper Nexus 不调用会改写条目的私有更新入口，也不读取密钥。

## 实际核查与验证范围

2026-10-04 读取了本机安装包 Green Frog 0.22.2、Ethereal Style 6.0.86 的存储实现与清单。正常用户的 Style 缓存含 380 条期刊 rank，其中 371 条具有可读取的 JCR/IF，370 条同时提供 JCI；仅本地读取并检查字段结构，没有改动其文献库、插件设置或缓存。

隔离 Zotero 使用真实数据库条目和相同 JSON 格式，验证了优先级、只读访问、缓存变动、年份缺失、冲突及禁用回退。测试未启动正常资料库中的两个插件，也未验证它们未来版本的内部存储格式。适配器为独立实现，没有复制其执行代码。

[Green Frog 仓库](https://github.com/redleafnew/zotero-updateifsE) · [Ethereal Style 仓库](https://github.com/MuiseDestiny/zotero-style)
