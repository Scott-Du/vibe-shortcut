# Vibe Shortcut

## About / 项目定位

Vibe Shortcut is a Windows floating shortcut panel built for AI-assisted workflows.

Vibe Shortcut 是一个为 AI 协作工作流设计的 Windows 悬浮快捷键工具。

It is for developers and creators who already use ChatGPT, Codex, Cursor, Claude, or similar AI tools heavily, and are moving from “typing everything” to “voice input + a few confirmation actions”. In touch-screen, tablet, remote desktop, standing desk, or commuting scenarios, keyboard and mouse are not always convenient, but actions like starting voice input, sending a prompt, inserting a line break, or deleting text are still very frequent.

它适合已经大量使用 ChatGPT、Codex、Cursor、Claude 等 AI 工具，并开始把工作方式从“长时间敲键盘”转向“语音输入 + 少量确认操作”的程序员和创作者。尤其是在触屏设备、平板、远程桌面、站立办公或通勤场景下，键盘鼠标不总是顺手，但唤起语音输入、发送指令、换行、删除修改这些动作又非常高频。

Vibe Shortcut solves this specific problem by turning the most common AI workflow shortcuts into large, thumb-friendly buttons fixed at the edge of your screen. It is not a voice recognition engine or a complex automation platform. It is a lightweight on-screen shortcut pad for voice input, sending, and deletion.

Vibe Shortcut 解决的就是这个问题：把 AI 协作中最常用的几个快捷键，变成固定在屏幕角落、拇指可以直接点到的悬浮按钮。它不是语音识别引擎，也不是复杂的自动化工具，而是一个轻量的“屏幕快捷键盘”。

## Features / 功能特性

- Frosted-glass floating panel that stays on top.
- Large round buttons designed for touch-screen use.
- Configurable shortcuts, built-in icons, and custom button images.
- Voice mode switcher for tools such as WeChat Input Method and 闪电说.
- Send button: short press sends `Enter`; long press or right click sends `Ctrl+Enter`.
- Delete button: short press sends `Backspace`; long press repeats deletion; right click deletes to the beginning of the current input.
- Windows system tray menu with settings and startup options.
- Optional auto-start on Windows login.
- Windows installer and portable build support.

- 磨砂半透明玻璃悬浮面板，支持置顶显示。
- 大号圆形按钮，适合触屏和拇指点击。
- 每个按钮都可以配置快捷键、图标或图片。
- 支持微信输入法、闪电说等语音输入快捷键切换。
- 发送按钮：短按发送 `Enter`，长按或右键发送 `Ctrl+Enter`。
- 删除按钮：短按发送 `Backspace`，长按连续删除，右键删除到当前输入光标前。
- 系统托盘菜单提供设置入口和开机自启动选项。
- 支持 Windows 安装包和便携版打包。

## Who Is It For? / 适合谁

- AI-assisted programmers who use voice input while coding or prompting.
- Creators who write with AI and frequently switch between speaking, sending, and editing.
- Touch-screen, tablet, or remote desktop users who want fewer keyboard and mouse interruptions.
- Developers in mainland China who use AI tools together with local voice input tools.

- 重度使用 AI 编程、AI 写作、AI 对话工具的人。
- 想用语音输入提高效率，但又不想频繁切回键盘鼠标的人。
- 使用触屏、平板、远程桌面、站立办公或移动办公场景的人。
- 把 ChatGPT/Codex/各类 AI 工具与微信输入法、闪电说等语音输入工具组合使用的中国大陆用户。

## Requirements / 环境要求

- Windows 10/11
- Node.js 20+ recommended
- npm

## Development / 本地开发

```bash
npm install
npm run dev
```

## Build / 构建

Build the renderer and run the packaged preview:

```bash
npm run build
npm start
```

Build a Windows portable executable:

```bash
npm run package:win
```

Build a Windows installer:

```bash
npm run package:installer
```

Artifacts are written to `release/`.

构建产物会输出到 `release/` 目录。

## Default Shortcuts / 默认快捷键

| Button / 按钮 | Action / 动作 | Default / 默认 |
| --- | --- | --- |
| Voice / 语音 | Active voice input mode / 当前语音模式 | 闪电说: `Ctrl+I`; 微信输入法: `Ctrl+Win+Shift` |
| Send / 发送 | Send or line break / 发送或换行 | `Enter`; long press/right click: `Ctrl+Enter` |
| Delete / 删除 | Delete text / 删除文本 | `Backspace`; long press repeats; right click deletes to cursor start |

All shortcuts can be changed from the settings window.

所有快捷键都可以在设置窗口中修改。

## Notes / 说明

- The app sends keyboard shortcuts to the current focused window. Keep the target editor or chat box focused before pressing a floating button.
- `Win` key combinations are supported through the native Windows input path.
- Third-party product names and icons are used only to identify user-configurable shortcut presets. Trademarks belong to their respective owners.
- Current implementation focuses on Windows. macOS/Linux support is not planned for the initial version.

- 本工具会把快捷键发送到当前焦点窗口。使用前请确保目标编辑器或聊天输入框处于焦点状态。
- `Win` 组合键通过 Windows 原生输入路径发送。
- 第三方产品名称和图标仅用于标识可配置的快捷键预设，相关商标归各自权利人所有。
- 当前版本聚焦 Windows，首版暂不计划支持 macOS/Linux。

## License / 开源协议

MIT License.

