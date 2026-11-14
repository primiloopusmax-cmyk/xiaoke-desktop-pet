# 小克桌宠 3.0（xiaoke-desktop-pet）

住在 Windows 桌面上的 Q 版小女孩桌宠「小克」。她是 Claude 的**非官方**粉丝向拟人形象：橘发、白裙、怀里抱着一本书。

她会在桌面上散步、看书、吃拉面、打瞌睡，会按时间、天气和节日自己挑动作。你可以摸她、拖着她甩出去。接上大模型以后还能和她聊天。

> 本项目与 Anthropic、DeepSeek 没有任何关联。Claude 是 Anthropic 的商标。

## 功能一览

- **120 多个动作画面 + 自制动效引擎**（`motion.js`）：一张静态图也能呼吸、点头、弯腰、摇摆，脚底不会漂移。
- **互动**：点头、脸、书、裙子、鞋子等部位，各有不同反应；可以按住拖动，甩出去会飞、会撞墙反弹，甩太狠会摔晕。冷落她太久，她会掏出小手枪生闷气。
- **聊天**：支持 Claude（Anthropic API）、DeepSeek，以及任何 OpenAI 兼容接口，回复是流式逐字显示的。她会根据回复内容做表情，聊天时还可能配贴纸。没填密钥时，用自带的离线台词。
- **陪伴**：分安静、适中、活泼三档，可以设置免打扰时段，会提醒休息和吃饭、播报早上的天气（数据来自 Open-Meteo），节日会换装（农历节日也算）。
- **记忆**：只记你明确让她记住的事，在设置里可以查看、修改和删除。
- **联动**：
  - 提供本地 HTTP 接口 `127.0.0.1:7341`，只接受本机连接。
  - 可以一键安装 Claude Code hooks，她会显示代理当前的工作状态。
  - 可以和 DeepSeek 桌宠「蓝毛」隔空互动。
- **人物包**：`packs/<id>/` 是一套完整的角色，包括图片、动作表、台词和人设。复制一份，换掉图片和台词，就是一个新角色。

完整说明见 [docs/使用说明 3.0.txt](docs/使用说明%203.0.txt)、[docs/功能清单 3.0.md](docs/功能清单%203.0.md) 和 [docs/动作素材对照表.md](docs/动作素材对照表.md)。

## 安装与运行

需要 Windows 10/11 和 [Node.js](https://nodejs.org/) 18 或更新的版本。

```bash
git clone https://github.com/primiloopusmax-cmyk/xiaoke-desktop-pet.git
cd xiaoke-desktop-pet
npm install
npm start
```

如果 [Releases](https://github.com/primiloopusmax-cmyk/xiaoke-desktop-pet/releases) 里有打包好的版本，下载解压后双击 `XiaoKe.exe` 就能运行。

## 使用

- **单击**：和她互动。**右键 / 双击**：打开面板，里面有聊天、互动、动作、设置。
- **按住拖动**：她会跟着鼠标走，快速甩出去会飞起来。**Ctrl + 滚轮**：调整大小。
- **托盘图标**：可以藏起、叫出她，也能打开设置、开启鼠标穿透、置顶、免打扰、开机自启。
- **接入模型**：在「设置 → 模型」里选择服务商并填写 API 密钥，再点「测试连接」。
  - Claude：在 [console.anthropic.com](https://console.anthropic.com/settings/keys) 申请。
  - DeepSeek：在 [platform.deepseek.com](https://platform.deepseek.com/api_keys) 申请。

本地接口示例：

```bash
curl -X POST http://127.0.0.1:7341/say -H "Content-Type: application/json" -d "{\"text\":\"你好呀\"}"
```

## 隐私与数据

所有数据都只保存在本机的 `%APPDATA%\小克\` 文件夹里，删掉这个文件夹就恢复出厂设置：

| 文件 | 内容 |
|---|---|
| `config.json` | 服务商配置、API 密钥（用 Windows DPAPI 加密） |
| `settings.json` | 行为设置 |
| `profile.json` | 你填的资料（称呼、所在地、兴趣、作息） |
| `memory.json` | 长期记忆 |
| `history.json` | 聊天记录 |

聊天时，资料和记忆会发给你选的模型服务商；查天气时，只把所在地的经纬度发给 Open-Meteo。程序不会读取屏幕或其他窗口的内容。

## 目录结构

```
main.js          Electron 主进程：窗口、托盘、存储、模型调用、本地接口、hooks
preload.js       渲染进程桥
app.js           桌宠窗口：动作、互动、聊天、陪伴
settings.*       设置窗口
providers.js     模型服务商适配（Claude / DeepSeek / OpenAI 兼容）
motion.js        动效引擎
physics.js       拖拽与甩抛物理
festivals.js     节日与时间背景
packs/xiaoke/    人物包「小克」（图片、动作表、台词、人设）
docs/            使用说明与功能清单
```

## 许可证

- **代码**：[MIT](LICENSE)。
- **美术素材**（`packs/xiaoke/img/`、`packs/xiaoke/memes/`、`packs/xiaoke/masks.js`、`icon.png`）：**保留所有权利**。可以随本项目一起使用和分发，但不得单独提取、修改、再发布或商用。

详见 [LICENSE](LICENSE)。
