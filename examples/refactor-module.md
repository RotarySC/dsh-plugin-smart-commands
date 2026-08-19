---
description: 深度重构指定的业务模块，自动继承当前对话上下文，并裁剪安全工具权限
model: deepseek-reasoner
subagent: true
context: fork
tools:
  allow: ["read", "write", "edit", "grep", "glob", "lsp"]
skills: ["codebase-design"]
---
请仔细审查当前模块的架构设计，重构目标代码并确保单测通过：
目标范围: $1
重点关注: $@
