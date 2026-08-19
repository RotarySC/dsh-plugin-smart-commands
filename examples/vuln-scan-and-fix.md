---
description: 先由安全专家扫描漏洞，再由修复专家并行修复，最后汇总验证
chain:
  - name: security_scan
    agent: scout
    model: deepseek-chat
    task: "全面扫描项目中与 $1 相关的安全漏洞与边界问题"
    as: "vulnerabilities"
  - name: parallel_fixes
    parallel:
      - agent: backend_fixer
        task: "根据漏洞清单修复后端 API 缺陷: {outputs.vulnerabilities}"
      - agent: test_writer
        task: "为暴露的漏洞编写针对性回归测试用例: {outputs.vulnerabilities}"
    concurrency: 2
    worktree: true
  - name: final_verification
    agent: reviewer
    model: deepseek-reasoner
    task: "汇总评估所有修复方案，输出最终补丁报告。\n前序综合产出:\n{previous}"
---
