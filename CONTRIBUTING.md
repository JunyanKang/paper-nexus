# 开发与贡献

使用说明见 [首页](README.md)、[安装指南](docs/INSTALL.md) 和 [使用指南](docs/GUIDE.md)。

## 提交问题与改进

请描述 Zotero 版本、复现步骤和预期结果，附允许公开的截图或示例。贡献代码时说明解决的用户问题，并运行相关回归测试。请勿提交个人文献库、PDF 或凭据。

## 本地构建

使用 Node.js 22 和 Python 3，无需安装 npm 依赖。

```sh
npm test
python3 scripts/check_syntax.py
npm run build
```

生成的 XPI 位于 `dist/`。模型包按 [模型来源与构建说明](docs/LOCAL-MODELS.md) 独立构建。安装器构建使用 macOS 的 Swift 工具链或 Windows 的 .NET Framework 编译器，详见 [持续集成配置](.github/workflows/build.yml)。

macOS 构建前，在构建环境中运行 `python3 -m pip install -r installers/macos/requirements.txt`。DMG 的中英文背景由原生字体生成，同时包含普通和 Retina 分辨率；这些构建依赖不会安装到用户电脑。

## 公开文件范围

公开仓库保留产品源码、许可证、用户文档及其配图、构建脚本、持续集成和可独立运行的回归测试。开发日志、训练实验、内部评审、临时截图、桌面测试驱动及运行结果保留在本地。

新增公开文件需列入 `scripts/public-files.json`。提交前暂存经审查的文件，再运行：

```sh
python3 scripts/audit_release.py
```

此检查核对文件清单、内部文件类型、凭据模式和文档链接。XPI 仅包含清单中的插件运行文件；发布页只提供 macOS 与 Windows 安装器。

实现参考：[引文匹配](docs/MATCHING.md)、[期刊指标](docs/METRICS.md)、[模型目录](docs/MODELS.md)。
