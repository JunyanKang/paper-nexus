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
python3 scripts/run_native.py native-streamline.js native-metric-card.js native-responsive.js native-ui.js native-selection-race.js native-authors.js native-hover-paint.js native-network.js native-network-interaction.js native-network-layout.js native-citation-verification.js native-updater.js native-lifecycle.js native-package.js
```

QA 工具只使用仓库内的 `qa-profile`／`qa-library`，不指向日常资料库。测试桥接只存在于临时 QA XPI，不包含在生产 XPI。`run_native.py` 必须串行执行。结束时先将 `test-results/command.js` 写为 `return {passed:true,ready:true};`，再关闭使用该隔离 profile 的 Zotero；不要关闭其他 Zotero 进程。

原生脚本包含联网的 Crossref／Europe PMC 查询、受控故障、保存和删除临时条目，以及生产 XPI 安装，均限于隔离库。Linux CI 运行纯逻辑与构建，不能代替桌面实机验证。

`native-review-capture.js` 读取 `test-results/review-round.txt` 中的轮次标识，截取真实页面；`native-citation-verification.js` 含 24 组逐项核对数据。合成压力／故障案例与真实论文案例分别记录。

发布使用 `scripts/build.py` 的可重复 XPI 和 SHA512 更新元数据；`scripts/package_release.py` 仅打包经审阅的 Git 索引，排除资料库、PDF、日志和私有调研缓存。

`native-migration.js` 为维护者的旧版迁移验证，需要另外提供真实 `dist/cite-lens-0.3.3.xpi`；旧包不作为当前发行资产分发。公开更新测试使用专门生成的 0.3.99 QA 种子，不能作为用户版本安装。

维护者在发布后运行 `python3 scripts/build_update_seed.py` 和 `python3 scripts/run_native.py native-public-update.js`。种子只修改版本、名称并暴露测试作用域，目标 XPI 必须来自 GitHub 公开更新地址；检查两种更新方式、已安装文件 SHA512 和状态保留。该脚本仅允许隔离 profile。
