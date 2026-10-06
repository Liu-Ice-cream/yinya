# 音芽第三方组件

## BeepBox

Copyright © John Nesky and contributors. MIT 许可证见 [LICENSE.md](LICENSE.md)。上游：https://github.com/johnnesky/beepbox。

## MP3 编码器

音芽使用 LAME 的 JavaScript 移植版 **@breezystack/lamejs 1.2.7**（LGPL-3.0），由 LAME、lamejs 及其分支的贡献者维护。项目保留包内的原始声明与代码中的署名：

- [包内原始许可说明](website/yinya/notices/lamejs-LICENSE.txt)
- [GNU LGPL v3 与所引用的 GPL v3](website/yinya/notices/LGPL-3.0-only.txt)
- [GNU GPL v3](website/yinya/notices/GPL-3.0-only.txt)
- [LAME 官网](https://lame.sourceforge.net/)
- [lamejs 上游](https://github.com/zhuker/lamejs)
- [当前分支源码](https://github.com/gideonstele/lamejs/tree/1fb0ef5fa177413107e2e107d054a9b994e3f79c)
- [精确 npm 发行包](https://www.npmjs.com/package/@breezystack/lamejs/v/1.2.7)

`website/yinya/vendor/lamejs.js` 是该版本 `dist/lamejs.js` 的原样副本，无修改；它以独立 ES 模块分发，不内联到音芽界面或 Worker 的构建产物。运行时仅在 MP3 导出时由 Worker 导入，不使用 CDN 或远程编码服务。

如需修改或替换编码器，可直接替换这个文件，保留 `Mp3Encoder` 的接口；界面及适配器源代码位于 `yinya/`，构建方法见 README-YINYA.md。允许按相关许可证修改此组件并为调试这些修改进行逆向分析。此组件不提供保证，完整条款见上述许可证。

音芽自己的代码及上游 BeepBox 继续按各自 MIT 声明提供；此文件不将 MP3 编码器重新授权为 MIT。
