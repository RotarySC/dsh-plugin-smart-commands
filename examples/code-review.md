---
description: 跨模型代码审查，根据运行模型自动调整审查深度
model: deepseek-reasoner, deepseek-chat
---
请审查以下变更范围: $@

<if-model is="deepseek-reasoner">
重点关注深层并发隐患、内存泄漏与算法时间复杂度，给出形式化推导与风险证明。
<else>
重点关注代码规范、变量命名、错误捕获与常见边界缺陷。
</if-model>
