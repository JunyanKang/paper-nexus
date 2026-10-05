# 设计说明：阅读、追踪、关联

[返回首页](../README.md)

## 产品问题

文献网络不应要求用户先理解节点和边才能工作。研究生要找到下一篇值得读的论文，PI 要知道文献之间的联系依据，教授要浏览一个方向的研究脉络。以作者／主题网络作为核心，搜索定位、节点详情与聚焦邻域承接这些任务。

参考文献、库内引用、共同参考、作者关联与主题聚类拥有不同证据语义，不合成一个神秘分数。主界面不铺陈内部来源品牌或调试状态；只有会影响用户判断的范围、摘要覆盖与歧义保留在相应位置。

## 与 Paper Voice 同族的 Logo

<img src="../addon/assets/nexus.png" width="240" alt="Paper Nexus 最终纸张放大镜角色" />

最初抽象字母／桥梁方案在独立识别上尚可，但与 Paper Voice 的具象纸张角色不一致，未采用。重新探索三个同族方向：

| 方向 | 立意 | 评价与修正 |
|---|---|---|
| 引文侦察：纸张与放大镜 | 查找精确对应的参考文献 | 检索与关联同时可读；用户最终选择此方向，保留放大镜与镜内链环 |
| 文献连接：纸张与双链环 | 一篇论文连接另一篇论文 | 关联语义最直接；初版链环过大，修改为右下角局部配件 |
| 证据向导：书签与连接卡片 | 组织研究线索、保留出处 | 家族感好，但小卡片和围巾增加视觉负担，不保留 |

最终采用用户选择的放大镜版：暖白纸张角色持青绿放大镜，镜内链环表达追踪文献关联，暖金细节与 Paper Voice 统一。耳机专属于 Paper Voice，放大镜专属于 Paper Nexus。它们应被看作同系列伙伴，而非完全相同的功能图标。

## 可复用生成提示词

生成以 Paper Voice 的实际图标作家族风格参考。下列提示词约束材质与语义，不要求模型猜测产品功能。

> Use case: logo-brand / identity-preserve. Asset: Paper Nexus Zotero plugin mascot, a sibling of the supplied Paper Voice mascot. Preserve the family: warm ivory paper, deep petrol-teal accessories, muted brushed-gold fittings, softly rounded physical forms, upper-left studio light, tactile 3D material, friendly black eyes and an understated smile. Paper Voice means listening; Paper Nexus means following citations between papers. Create a concrete, legible paper character, not an abstract N, molecular graph or AI sparkle. Use two offset paper sheets with a small folded corner, cream arms and short feet. Hold a petrol-teal magnifying glass at the right side, with a restrained brushed-gold inner rim and a clear interlocking-chain emblem inside its pale lens. Leave the whole smiling face and feet visible. Keep the paper thin, the silhouette concrete, and the lens emblem simple. Strong silhouette at 24, 32 and 48 pixels. Center the complete character with eight percent transparent margin. No headphones, large open book, scarf, extra tools, words, letters, background tile or ground shadow. Clean transparent alpha edges.

评价顺序是功能可辨认、家族一致、小尺寸轮廓、明暗主题适应、配件是否遮挡主体。生成图不是功能界面截图；文档中的产品截图来自实际 Zotero 页面。
