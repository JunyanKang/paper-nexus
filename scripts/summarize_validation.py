"""Publish compact current-run evidence, without private paths or raw QA libraries."""
from pathlib import Path
import json,hashlib,re
root=Path(__file__).resolve().parents[1];version=json.loads((root/'package.json').read_text())['version']
names=['native-integration','streamlined-ui','single-quartile','responsive-gecko','ui-behavior','selection-race','automatic-authors','hover-first-paint','local-network','network-interaction','network-layout','citation-verification','native-updater','manual-migration','lifecycle','production-package']
runs={}
for name in names:
 report=json.loads((root/'test-results'/f'{name}.json').read_text());assert report.get('passed') is True,(name,report.get('error'))
 runs[name]={'passed':True,'checks':[{'name':x['name'],'ok':x['ok']} for x in report.get('checks',[])]}
tap=(root/'test-results'/f'unit-{version}.tap').read_text();count=int(re.search(r'^# tests (\d+)$',tap,re.M)[1]);assert int(re.search(r'^# fail (\d+)$',tap,re.M)[1])==0
citation=json.loads((root/'test-results/citation-verification.json').read_text())
doc={'date':'2026-10-05','release':version,'platform':'macOS Apple Silicon','zotero':json.loads((root/'test-results/ready.json').read_text())['version'],'unitTests':count,'native':runs,'citationPapers':citation['papers'],'reviewedCitationExamples':citation['examples'],'xpiSHA256':hashlib.sha256((root/'dist'/f'paper-nexus-{version}.xpi').read_bytes()).hexdigest(),'limits':['No whole-corpus gold-standard precision or recall measurement','No official JCR value-by-value validation','No Windows or Linux runtime certification','Same-name signatures are not disambiguated people','Existing fulltext indexes only; no automatic OCR or semantic search']}
update=root/'test-results/public-update.json'
if update.exists():
 r=json.loads(update.read_text());assert r.get('passed');doc['publicUpdate']={k:r[k] for k in ['passed','from','to','automatic','manual','hashVerified']}
 runs['public-update']={'passed':True,'checks':[{'name':x['name'],'ok':x['ok']} for x in r['checks']]}
(root/'docs/validation-summary.json').write_text(json.dumps(doc,ensure_ascii=False,indent=2)+'\n')
rows='\n'.join(f'| {name} | {len(r["checks"])} | 通过 |' for name,r in runs.items());total=sum(len(r['checks']) for r in runs.values())
update_note='公开更新验证尚未执行。'
if doc.get('publicUpdate'):
 update_note='发布后从公开 GitHub 地址实测通过：Zotero 后台自动更新、设置按钮手动发现与安装、两次安装后的 XPI 与公开 SHA512 一致、设置和阅读清单保留，以及更新后 Logo 加载。测试使用 0.3.99 QA 种子，目标为未修改的正式 0.4.0 XPI。'
text=f'''# Paper Nexus {version} 验证记录

日期：2026-10-05。环境：{doc['platform']}，Zotero {doc['zotero']}。所有写入及安装测试均在隔离资料库执行。

纯逻辑／服务测试 **{count} 项通过**；原生测试 **{len(runs)} 套、{total} 项检查通过**。结果只表示下述范围通过，不承诺所有 PDF 无错误。

| 测试套件 | 检查数 | 状态 |
|---|---:|---|
{rows}

## 真实文献

- Bringmann et al. 2018，36 页，*The primate fovea: Structure, function and development*。
- Ou et al. 2013，12 页，*Vax1/2 Genes Counteract Mitf-Induced Respecification of the Retinal Pigment Epithelium*；DOI 10.1371/journal.pone.0059247。
- Alexander et al. 2023，20 页，*A-MYB and BRDT-dependent RNA Polymerase II pause release orchestrates transcriptional regulation in mammalian meiosis*；DOI 10.1038/s41467-023-37408-w。

24 组重点引文对照作者、年份和编号；遍历三篇论文的原生引文标记进行回归，包含原生误认的作者提及。故标记数不是唯一真实引文数，也不是人工全文标注的精确率或召回率。具体重点条目和自动检查结果见 [机器可读记录](validation-summary.json)。

验证了连续年份、同年作者区别、编号区间、多篇、部分未匹配、错误原生目标、原文页眉 DOI 污染、缓存过滤、全部候选淘汰不弹窗。损坏的字形、无法唯一确定的作者年份、跨页截断仍可能留为未匹配。

## UI 和网络

完成 [五轮代码＋截图角色模拟评审](QUALITY-REVIEW.md)。实际检查主卡、菜单、保存、主面板、设置与展开项、候选、网络列表／图、窄窗和深色状态。360 px 设置与高字号，420／620 px 网络布局有原生渲染检查。模拟角色不等于真人访谈。

本地网络对真实 QA 库验证了引用边、来源附件和页码、同名署名、文献夹范围、全文片段、取消与过期结果、打开行为、过滤器保持、键盘缩放；纯逻辑包含 10,000 节点索引回归。

## 安装与更新

最终 XPI 实际安装并激活；保留旧 ID、清单、外观、作者缓存与设置。自动／手动检查和安装由 Zotero 原生 AddonManager 管理。公开更新的传输验证在发布后单独记录，使用带新更新地址的明确标注 QA 旧版本种子；它不是曾经发布过的正式旧版。原 CiteLens 0.3.3 需一次手动安装迁移。

{update_note}

XPI SHA256：`{doc['xpiSHA256']}`。

## 尚未验证的范围

Windows、Linux、Zotero 7/8/9、EPUB／网页阅读器未实机认证。期刊表未逐刊向 Clarivate 官方复核；旧版对本地指标插件存储格式的检查是历史兼容性证据，本轮不冒充真实用户插件联调。全文索引缺失时不执行 OCR；作者不进行通讯／共同一作推断；题名行内格式处理不是完整 MathML 排版。
'''
(root/'docs/VALIDATION.md').write_text(text)
print(f'{count} unit tests; {len(runs)} native suites; {total} checks')
