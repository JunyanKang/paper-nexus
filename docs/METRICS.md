# JCR / JIF 指标格式

CSV 的精确列名：

```
issn,journal,metricYear,jif,category,quartile,source
```

- `issn`：合法 ISSN，含校验位。印刷版、电子版可在引号内用分号分隔。
- `journal`：完整期刊名。优先按 ISSN 匹配；缺少 ISSN 的文献只允许完整期刊名唯一匹配。
- `metricYear`：**指标统计年**，不是论文发表年，也不是下载年份。
- `jif`：非负数；空值表示 JIF 未提供，不能写 0 代替缺失。
- `category` 与 `quartile`：JCR 学科与 Q1–Q4。一个期刊多学科可占多行，JIF、年份、来源必须一致。
- `source`：准确描述合法数据来源和版本。导入器不能认证用户填写的来源标签。

JSON 支持数组或 `{ "journals": [...] }`。每个对象使用 `issn`, `journal`, `metricYear`, `jif`, `source`, `categories`，后者为 `{ "name": "学科名称", "quartile": "Q1" }` 的数组。无可用分区可使用空数组。

导入是整体校验后再替换：任意一行 ISSN、年份、分区或来源缺失／冲突均拒绝整批，不会覆盖原数据。CSV 支持带引号的逗号、双引号和 UTF-8 BOM。单文件最多 20 MB / 50,000 行。

书籍、章节、预印本与学位论文不自动套用期刊指标；同一 ISSN 同年存在冲突数据时拒绝导入；历史指标不会伪装成当年数据。设置指定年份后没有对应数据，显示「该年指标未提供」，不会偷偷回退另一年。

**没有附带真实 JCR 数据或“示例影响因子”。** 测试使用的虚构指标只存在于测试代码中，并且来源明确标记为 SYNTHETIC QA DATA。
