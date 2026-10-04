# EasyPubMedicine 的 JCR / JIF 数据来源

核查日期：2026-10-04。核查基于 CiteLens 0.3.1，Paper Nexus 0.4.0 沿用相同离线表接口；下述数据规模是当时快照。

## 核查依据

- [Chrome 商店](https://chromewebstore.google.com/detail/easypubmedicine/nkpdpmomjhifdobiopmgfjjffacldfje)：EasyPubMedicine，0.1.24，2026-07-19 更新，提供 JCR/IF/CAS 和历年指标。
- [作者仓库](https://github.com/naivenaive/EasyPubMed)，[MIT 许可](https://github.com/naivenaive/EasyPubMed/blob/master/LICENSE)，[使用说明](https://github.com/naivenaive/EasyPubMed/blob/master/EasyPubMed%20User%20Manual.md)。
- 固定提交 `90762673f9919f984dfd5d59c0f46ec09aba2226` 中的 `EasyPubMedicine_0.1.24.zip`，不是第三方打包站。

## 实际实现

公开仓库主要提供文档及构建后的 ZIP。ZIP 的 `dist/js/background.js` 和内容脚本用 `chrome.runtime.getURL` 读取 `dist/data/ifqbt.json`、`jcr_cas_ifqb.json`、`5year.json`。这条指标路径是本地查表，无需查询服务器密钥；不能因此推断扩展所有其他功能都离线。

| 文件 | 实际内容 | 原始规模 |
|---|---|---:|
| `5year.json` | ISSN/eISSN、刊名、jcrYear、JIF、全部学科及分区 | 22,495 个期刊键，103,255 条年度记录 |
| `ifqbt.json` | PubMed 缩写、完整刊名、ISSN、简化 JIF/JCR/CAS | 12,338 行 |
| `pubmed_abb_data.json` | PubMed 刊名、缩写、纸质/电子 ISSN | 35,859 行 |
| `jcr_cas_ifqb.json` | 另一份简化期刊指标列表 | 21,269 行 |

Paper Nexus 采用 `5year.json` 作为 JCR/JIF 的单一来源，另外两份表仅建立经过 ISSN 连接的名称映射。没有混用简化表的最佳分区去覆盖多学科结果，也没有把 CAS 分区当作 JCR。无有效 ISSN 或无有效年度记录的期刊跳过。

## 年份和科学含义

商店写“2026 JCR”，数据表的最新 `jcrYear` 是 2025，历史覆盖 2021–2025。Paper Nexus 原样保留指标年。示例中 Science 的 2025 值为 47.3，Progress in Retinal and Eye Research 为 16.2；这只是实际读取到的第三方表值，未逐刊向 Clarivate 核实。

每个学科的 Q1–Q4 均保留；N/A 标为未提供，<0.1 原样显示。历年 JIF 是各年的 JIF，不是五年影响因子。期刊层面指标不构成单篇文献的质量判断。

## 使用和分发边界

作者仓库标注 MIT，文档说明数据由 PubMed、JCR 和中科院表合并，并提示可能存在匹配错误。软件许可不能自动证明对所有第三方指标拥有再许可权。Paper Nexus 发行包不捆绑这套数据，用户主动从作者公开包下载或导入后本地使用；没有复制执行其扩展代码，也不提供共享密钥。

当前按钮固定到上述已核查版本；重新下载不代表自动获得未来版本。ZIP 路径仅读取白名单 JSON，不解压或执行脚本。下载失败、格式异常保留旧表；原始 PDF、文献库和正在查询的期刊不上传。
