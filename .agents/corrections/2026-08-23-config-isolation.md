# DeepBuddy 配置必须与官方 ~/.dsh 隔离

- 日期 / agent：2026-08-23 / claude
- 我原来的做法：DeepBuddy profile、settings、sessions、credentials 全部混用官方
  `~/.dsh`（语言切换、默认模型改动会殃及官方客户端；测试残留污染用户配置）。
- 用户实际要的：发行版配置独立，整理到 `~/.deepbuddy`；后续开发不得再往共享
  `~/.dsh` 写发行版状态。
- 分歧根源：环境假设（把「复用官方实现」延伸成了「复用官方数据目录」）。
- 以后如何避免：DeepBuddy 一律经 `DSH_HOME=~/.deepbuddy` 启动（dsh-home-paths
  原生支持，单根包含 settings/profiles/sessions/credentials/storages）。
  实现为 wave9：发行版启动器脚本设置 DSH_HOME + 首次运行迁移（复制
  credentials/settings，会话可选）；README/DESIGN_INTENT 同步。落地前的过渡期，
  测试不许改 `~/.dsh/settings.yaml` 等共享文档，改了必须还原。
