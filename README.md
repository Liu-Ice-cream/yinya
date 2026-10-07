# 音芽 · Yinya

面向零基础用户的音乐积木。基于 BeepBox 音频引擎，组合旋律、和弦、贝斯与鼓点，创作并分享自己的短曲。

当前版本 **v0.1.3**：中文四小节编辑、三段原创起步作品、点击音符即时试听、播放小节自动跟随、循环试听、撤销/重做、本地作品库、分享改编、JSON 备份及 WAV / MP3 导出。

![音芽桌面界面](project-notes/yinya-v0.1.3-desktop.jpg)

## 开始使用

需要 Node.js 和 npm：

```sh
npm ci --ignore-scripts
npm run build-yinya
npm run start-yinya
```

打开 `http://127.0.0.1:9093/yinya/`。Windows 完成依赖安装后，也可以双击根目录的 `启动音芽.cmd`。

测试命令：`npm run test-yinya`。

作品存储在当前浏览器，分享链接携带作品快照；当前服务器仅绑定本机，公开部署后才能跨设备分享。备份及分享使用音芽 v1 格式，目前不直接导入 BeepBox 历史作品。

详细说明见 [音芽使用文档](README-YINYA.md)，功能与验证见 [v0.1.3 记录](project-notes/release-v0.1.3.md)。

## 上游与许可证

上游为 [johnnesky/beepbox](https://github.com/johnnesky/beepbox)，保留完整 Git 历史。BeepBox 代码版权属于 John Nesky 及贡献者，MIT 许可证保留于 [LICENSE.md](LICENSE.md)。音芽增加独立中文界面、品牌标识、原创起步作品和作品管理功能。

MP3 编码使用独立的 LGPL-3.0 组件 @breezystack/lamejs 1.2.7，原样代码、署名及许可见 [第三方组件说明](THIRD_PARTY_NOTICES.md)。

原始文档保留于 [README-BEEPBOX.md](README-BEEPBOX.md)。下面也保留原版的介绍及开发说明。

## BeepBox 原版说明

BeepBox is an online tool for sketching and sharing instrumental melodies.
Try it out [here](https://www.beepbox.co)!

All song data is packaged into the URL at the top of your browser. When you make
changes to the song, the URL is updated to reflect your changes. When you are
satisfied with your song, just copy and paste the URL to save and share your
song!

BeepBox is a passion project, and will always be free to use. If you find it
valuable and have the means, any gratuity via
[PayPal](https://www.paypal.com/cgi-bin/webscr?cmd=_donations&business=QZJTX9GRYEV9N&currency_code=USD)
would be appreciated!

BeepBox is developed by [John Nesky](https://johnnesky.com/). This source code
is available under the [MIT license](LICENSE.md).

## Synthesizer library

You can use BeepBox's synthesizer to play music in your own web app! See
[the npm package](https://www.npmjs.com/package/beepbox) for more details.

## Compiling

The code is written in TypeScript, which requires Node & npm so
[install those first](https://nodejs.org/en/download). To contribute changes,
you'll also need [git](https://github.com/git-guides/install-git). Then to build
this project, open the command line and run:

```
git clone https://github.com/johnnesky/beepbox.git
cd beepbox
npm install
npm run build
```

## Code

The code is divided into several folders.

The [synth/](synth) folder has just the code you need to be able to play BeepBox
songs out loud, and you could use this code in your own projects, like a web
game. After compiling the synth code, open website/synth_example.html to see a
demo using it. To rebuild just the synth code, run:

```
npm run build-synth
```

The [editor/](editor) folder has additional code to display the online song
editor interface. After compiling the editor code, open website/index.html to
see the editor interface. To rebuild just the editor code, run:

```
npm run build-editor
```

The [player/](player) folder has a miniature song player interface for embedding
on other sites. To rebuild just the player code, run:

```
npm run build-player
```

The [website/](website) folder contains index.html files to view the interfaces.
The build process outputs JavaScript files into this folder.

## Dependencies

Most of the dependencies are listed in [package.json](package.json), although
I'd like to note that BeepBox also has an indirect, optional dependency on
[lamejs](https://www.npmjs.com/package/lamejs) via
[jsdelivr](https://www.jsdelivr.com/) for exporting .mp3 files. If the user
attempts to export an .mp3 file, BeepBox will direct the browser to download
that dependency on demand.
