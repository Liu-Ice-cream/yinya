# 贡献与反馈

欢迎通过仓库的 [Issues](https://github.com/Liu-Ice-cream/yinya/issues) 提交问题或建议，也欢迎提交 Pull Request。音芽目前是早期体验版，优先打磨四小节的创作、试听、保存与导出流程。

## 报告问题

请说明浏览器及版本、操作系统、复现步骤、预期行为与实际结果。音频问题请补充速度、声部、音色及导出格式。截图和可复现的 `.yinya.json` 备份会有帮助，请先移除不想公开的作品名称或内容。

涉及凭据或隐私的问题不要附在公开 Issue 中，可以在本地复现后提供不含私人信息的最小示例。

## 开发流程

需要 Node.js 24 和 npm。在项目目录执行：

```sh
npm ci --ignore-scripts
npm run check-privacy
npm run test-yinya
npm run package-yinya
npm run start-yinya
```

打开 <http://127.0.0.1:9093/yinya/> 查看改动。修改界面或声音后重新构建并刷新页面；网站包生成在 `build/yinya-site/`。

提交时说明具体问题、修改后的行为和验证结果。涉及音频、作品兼容或播放状态的改动，应补充有意义的测试；界面调整请验证桌面和窄屏操作。涉及作品数据时保留既有 v1 草稿、分享链接与备份兼容，或明确迁移方案。

## 代码与许可证

提交使用 GitHub 提供的 `users.noreply.github.com` 隐藏邮箱。提交前运行隐私检查，避免将凭据、本机目录或个人记录加入仓库；检查只输出文件及问题类别，不打印匹配的敏感内容。

主要开发入口为 `yinya/` 与 `website/yinya/`。`synth/`、`editor/`、`player/` 保留上游代码，音芽构建复用其中的合成器和音频渲染器。

保留 BeepBox 的版权、MIT 声明与源码来源。`website/yinya/vendor/lamejs.js` 是独立的 LGPL-3.0 编码器原样副本，当前测试校验其与锁定依赖一致；修改第三方组件时同步核对许可、源码分发及相关测试，详见 [第三方组件说明](THIRD_PARTY_NOTICES.md)。
