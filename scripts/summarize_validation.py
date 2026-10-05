"""Publish only native runs tied to the current addon bytes; retain historical evidence separately."""
from pathlib import Path
import json,hashlib,re
root=Path(__file__).resolve().parents[1];version=json.loads((root/'package.json').read_text())['version'];results=root/'test-results'
h=hashlib.sha256()
for p in sorted((root/'addon').rglob('*')):
 if p.is_file():h.update(p.relative_to(root/'addon').as_posix().encode());h.update(p.read_bytes())
source=h.hexdigest()
names=['native-integration','streamlined-ui','single-quartile','responsive-gecko','ui-behavior','selection-race','automatic-authors','hover-first-paint','local-network','network-interaction','network-layout','citation-verification','native-updater','lifecycle','production-package','continuous-cards','adaptive-layout','abstract-preview','pubmed-pmc']
ledger=[json.loads(line) for line in (results/'native-ledger.jsonl').read_text().splitlines() if line.strip()]
latest={r['run']:r for r in ledger if r['sourceSHA256']==source and r['release']==version and r['passed']}
runs={}
for name in names:
 assert name in latest, f'Rerun {name} on current addon bytes'
 r=latest[name];assert all(c['ok'] for c in r['checks']);runs[name]={k:r[k] for k in ['passed','completedAt','checks']}
tapPath=results/f'unit-{version}.tap';assert tapPath.stat().st_mtime>=max(p.stat().st_mtime for p in (root/'addon').rglob('*') if p.is_file()),'Unit report predates addon edits'
tap=tapPath.read_text();count=int(re.search(r'^# tests (\d+)$',tap,re.M)[1]);assert int(re.search(r'^# fail (\d+)$',tap,re.M)[1])==0
citation=json.loads((results/'citation-verification.json').read_text());pubmed=json.loads((results/'pubmed-pmc.json').read_text());adaptive=json.loads((results/'adaptive-layout.json').read_text())
doc={'date':'2026-10-05','release':version,'sourceSHA256':source,'platform':'macOS Apple Silicon','zotero':json.loads((results/'ready.json').read_text())['version'],'unitTests':count,'native':runs,'citationPapers':citation['papers'],'reviewedCitationExamples':citation['examples'],'liveAbstracts':pubmed['live'],'liveNCBIUsedAPIKey':pubmed.get('apiKeyUsed',False),'resizing':adaptive['sizes'],'xpiSHA256':hashlib.sha256((root/'dist'/f'paper-nexus-{version}.xpi').read_bytes()).hexdigest(),'limits':['No whole-corpus gold-standard precision or recall measurement','No official JCR value-by-value validation','No Windows or Linux runtime certification','Same-name signatures are not disambiguated people','Existing fulltext indexes only; no automatic OCR or semantic search','Public abstract availability is provider-dependent; credential routing tests use a synthetic key; live authentication mode is recorded separately']}
if 'public-update' in latest:
 r=json.loads((results/'public-update.json').read_text());assert r.get('passed') and r['to']==version
 doc['publicUpdate']={k:r[k] for k in ['passed','from','to','automatic','manual','hashVerified']};runs['public-update']={k:latest['public-update'][k] for k in ['passed','completedAt','checks']}
(root/'docs/validation-summary.json').write_text(json.dumps(doc,ensure_ascii=False,indent=2)+'\n')
rows='\n'.join(f'| {name} | {len(r["checks"])} | 通过 |' for name,r in runs.items());total=sum(len(r['checks']) for r in runs.values())
update='本版公开更新传输验证待发布后执行；原生更新逻辑和最终 XPI 安装已在本轮验证。'
if doc.get('publicUpdate'):update=f'已从真实正式版 0.4.0，分别通过 Zotero 后台自动更新和设置按钮手动更新到公开 {version}。两次安装均核对 SHA512，保留清单和设置；本轮未使用改版本号的 QA 种子。'
text=f'''# Paper Nexus {version} 验证记录

2026-10-05 · macOS Apple Silicon · Zotero {doc['zotero']}。写入和安装均使用隔离资料库。

**{count} 项纯逻辑／服务测试；{len(runs)} 套原生测试、{total} 项检查通过。** 每套记录与本版插件文件摘要绑定，拒绝将历史结果重标为当前版。测试通过不代表所有 PDF 或网络环境均无错误。

| 测试套件 | 检查数 | 状态 |
|---|---:|---|
{rows}

## 新交互与真实摘要

连续引用共用圆角外框，无卡间空隙或翻页。逐项验证菜单归属、键盘跨条目、长组滚动；1000×720 → 640×480 → 360×320 → 1000×720 的同一原生阅读区实时缩放验证面板宽度、字号、56% 高度上限和按钮可达。

题名无重复 tooltip；摘要左右贴边且不盖住卡片，窄窗内联。真实原生引用浮窗验证指针进入摘要、卡片重绘保留摘要、Esc、PDF 子文档点击、移除清理和迟到响应隔离。截图联查还修正了章节粘连、段间空白和期刊实体转义。

直接 PubMed 验证 PMID 26658507（Balaratnasingam 2015）和 23555005（Ou 2013）；直接 PMC 验证 PMC3598659。本轮现场获取使用用户提供的 NCBI key；密钥只临时进入隔离测试偏好设置，结束后恢复原值并删除临时文件。密钥的本机存储、POST 定向发送、移除和不进入公共状态另外使用合成 key 自动测试；用户密钥不进入测试源码或发布包。PubMed 结构化摘要、作者及标识符，PMC 文章头部摘要均有实际返回；嵌套参考文献 DOI 不得覆盖文章 DOI。

并行来源、独立于作者队列、12 秒总预算、缓存／请求去重、失败重试、身份冲突过滤有自动化验证。没有将数据库返回摘要称为人工全文阅读或生成式研究结论。

## 原有功能回归

重新运行三篇真实 PDF 的集成和引用回归：Bringmann 2018（36 页）、Ou 2013（12 页，10.1371/journal.pone.0059247）、Alexander 2023（20 页，10.1038/s41467-023-37408-w）。包含 24 组重点引文以及原生标记遍历；这不是人工全文金标准的准确率／召回率。

清单、保存去重、作者顺序、指标紧凑显示、本地网络、全文索引片段、设置、主题、候选过滤、卸载和生产 XPI 安装本轮重新回归。历史五轮角色模拟见 [设计评审](QUALITY-REVIEW.md)；旧版结果独立保留于 [0.4.0 验证记录](VALIDATION-0.4.0.md)。

## 安装与更新

{update}

XPI SHA256：`{doc['xpiSHA256']}`。完整检查条目和当前源码摘要见 [机器可读记录](validation-summary.json)。

## 边界

Windows、Linux、其他 Zotero 版本、EPUB／网页阅读器未实机认证。摘要取决于数据库收录、身份匹配和网络；本轮未逐刊向 Clarivate 核验指标。旧版对第三方本地指标存储格式的检查仍是历史兼容性证据。作者不作共同一作或通讯推断，本地网络不作作者同名消歧，全文索引未包含 OCR 或语义搜索。
'''
(root/'docs/VALIDATION.md').write_text(text);print(f'{count} unit tests; {len(runs)} native suites; {total} checks')
