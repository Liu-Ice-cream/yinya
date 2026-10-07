# 音芽 · Yinya

[![Yinya CI](https://github.com/Liu-Ice-cream/yinya/actions/workflows/yinya-ci.yml/badge.svg)](https://github.com/Liu-Ice-cream/yinya/actions/workflows/yinya-ci.yml)

让旋律发芽。音芽是面向零基础用户的音乐积木：点亮格子，组合旋律、和弦、贝斯与鼓点，留下自己的一段音乐。

当前版本 **v0.1.3 · 早期体验版**，基于 [BeepBox](https://github.com/johnnesky/beepbox) 合成器开发独立中文创作界面。

![音芽播放与编辑界面](project-notes/yinya-v0.1.3-desktop.jpg)

## 可以做什么

- 从「晴日发芽」「月下散步」「像素出发」三个原创起点或空白开始。
- 编辑四层音乐积木，调整速度、音量、旋律音色与声部开关，撤销和重做。
- 点击音符即时试听，循环播放完整四小节，自动跟随当前播放小节；手动查看后可一键恢复跟随。
- 在当前浏览器保存作品，通过链接分享快照并继续改编，导入/导出 JSON 备份。
- 在浏览器本地导出 WAV 或 MP3，MP3 为 44.1 kHz、192 kbps 立体声。

## 本地体验

需要 **Node.js 24** 和 npm。在项目目录执行：

```sh
npm ci --ignore-scripts
npm run build-yinya
npm run start-yinya
```

打开 <http://127.0.0.1:9093/yinya/>。Windows 完成安装后，也可双击 `启动音芽.cmd`。当前尚未提供公开在线演示，静态网站部署方法见 [部署说明](docs/DEPLOYMENT.md)。

## 当前范围

音乐长度固定为 **四小节**；旋律和贝斯使用 C 大调五声音阶，适合短循环创作。120 BPM 下完整音乐为 8 秒。小节长度扩展已列入 [后续方向](docs/ROADMAP.md)。

作品仅保存在当前设备、当前浏览器、当前网站地址下，无账号和云端同步。清理网站数据可能丢失作品，建议下载 JSON 备份。本机分享地址只能在本机使用；部署到可访问的网站后才能跨设备打开链接。当前使用音芽 v1 作品格式，不直接导入 BeepBox 历史链接或 JSON。

## 开发与反馈

```sh
npm run test-yinya
npm run package-yinya
```

自动测试覆盖作品数据、实际合成器、点击试听、播放跟随和独立 MP3 解码。GitHub Actions 在 Linux 与 Windows 上构建和测试，主分支检查通过后提供 `yinya-site` 静态网站包。

- [详细使用说明](README-YINYA.md)
- [版本变化](CHANGELOG.md)
- [贡献与问题反馈](CONTRIBUTING.md)
- [部署说明](docs/DEPLOYMENT.md)

## 来源与许可证

音芽保留 BeepBox 的完整 Git 历史及原作者署名。BeepBox 和音芽代码采用 [MIT 许可证](LICENSE.md)。MP3 编码器 **@breezystack/lamejs 1.2.7** 作为独立、原样的 LGPL-3.0 模块分发，其许可和源码入口见 [第三方组件说明](THIRD_PARTY_NOTICES.md)。原创起步作品使用合成声音，不包含外部歌曲或录音采样。

上游教程保留于 [README-BEEPBOX.md](README-BEEPBOX.md)。
