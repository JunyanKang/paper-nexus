# 开发与测试

Node.js 22 和 Python 3 的标准库即可运行构建与纯逻辑测试。

```sh
npm test
npm run build
```

原生测试要求 macOS 的 Zotero 桌面版和三篇真实 PDF。PDF 不随源码分发：在自备目录提供 `bringmann-2018.pdf`、`ou-2013.pdf`、`alexander-2023.pdf`。论文身份见 [验证记录](VALIDATION.md)。

```sh
python3 scripts/qa.py --fixtures /absolute/path/to/test-pdfs
python3 scripts/run_native.py native-integration.js native-corpus.js
python3 scripts/run_native.py native-abstract.js native-pubmed.js native-continuous-cards.js native-adaptive-layout.js native-streamline.js native-metric-card.js native-responsive.js native-ui.js native-selection-race.js native-authors.js native-hover-paint.js native-network.js native-network-interaction.js native-network-layout.js native-citation-verification.js native-updater.js native-lifecycle.js native-package.js
```

QA 工具只使用仓库内的 `qa-profile`／`qa-library`，不指向日常资料库。测试桥接只存在于临时 QA XPI，不包含在生产 XPI。`run_native.py` 必须串行执行。结束时先将 `test-results/command.js` 写为 `return {passed:true,ready:true};`，再关闭使用该隔离 profile 的 Zotero；不要关闭其他 Zotero 进程。

原生脚本包含联网的 PubMed／PMC、Crossref／Europe PMC 查询、受控故障、保存和删除临时条目，以及生产 XPI 安装，均限于隔离库。Linux CI 运行纯逻辑与构建，不能代替桌面实机验证。

`native-review-capture.js` 读取 `test-results/review-round.txt` 中的轮次标识，截取真实页面；`native-citation-verification.js` 含 24 组逐项核对数据。合成压力／故障案例与真实论文案例分别记录。

发布使用 `scripts/build.py` 的可重复 XPI 和 SHA512 更新元数据；`scripts/package_release.py` 仅打包经审阅的 Git 索引，排除资料库、PDF、日志和私有调研缓存。

`native-migration.js` 与 `build_update_seed.py` 保留为 0.4.0 以前的历史迁移工具，不用于本版验证。当前公开更新测试需要未改动的正式 `dist/paper-nexus-0.4.0.xpi`；发布后运行 `python3 scripts/run_native.py native-public-update.js`，检查自动和手动更新到当前正式 XPI、安装文件 SHA512 及状态保留。脚本仅允许隔离 profile。

`run_native.py` 为每次成功执行记录插件源码摘要、版本、完成时间和检查条目。`summarize_validation.py` 只接受当前插件字节对应的完整套件，不复用上一版本结果。修改插件后需要重跑受影响检查，并在发布阶段完成全套回归。

发布后的公开资产可用 `python3 scripts/verify_public_release.py` 独立下载：核对每个资产 SHA256、更新清单 SHA512、XPI 全部文件，以及源码 ZIP 与经审阅 Git 索引的一致性。该步骤需要 GitHub CLI。
