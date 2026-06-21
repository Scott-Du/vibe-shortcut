# Vibe Shortcut

**Vibe Shortcut** is a small Windows floating shortcut panel for AI-assisted workflows. It gives you a frosted-glass touch panel with configurable buttons for voice input, send/enter, and deletion actions.

**Vibe Shortcut** 是一个面向 Windows 的桌面悬浮快捷键小工具。它在屏幕角落放置一组磨砂玻璃风格的触控按钮，用来快速触发语音输入、发送/回车、删除等高频动作。

This project is especially useful for developers in mainland China who use AI coding/chat tools together with local voice input tools such as WeChat Input Method or 闪电说.

本项目主要面向中国大陆的 AI 协作程序员，尤其适合把 ChatGPT/Codex/各类 AI 编程工具与微信输入法、闪电说等语音输入工具组合使用的场景。

## Features / 功能特性

- Frosted-glass floating panel that stays on top.
- Configurable round buttons with built-in icons or custom images.
- Voice mode switcher: long press or right click the voice button to switch between WeChat Input Method and 闪电说.
- Send button: short press sends `Enter`; long press or right click sends `Ctrl+Enter`.
- Delete button: short press sends `Backspace`; long press repeats deletion; right click deletes to the beginning of the current input.
- Windows system tray menu with settings and startup options.
- Optional auto-start on Windows login.
- Windows installer and portable build support.

- 磨砂半透明玻璃悬浮面板，支持置顶显示。
- 圆形按钮可配置快捷键、内置图标或自定义图片。
- 语音模式切换：长按或右键语音按钮，可在微信输入法和闪电说之间切换。
- 发送按钮：短按发送 `Enter`，长按或右键发送 `Ctrl+Enter`。
- 删除按钮：短按发送 `Backspace`，长按连续删除，右键删除到当前输入光标前。
- 系统托盘菜单提供设置入口和开机自启动选项。
- 支持 Windows 安装包和便携版打包。

## Screenshot / 截图

The app is designed as a compact transparent floating widget. Screenshots will be added after the first public release assets are prepared.

应用本体是一个紧凑的透明悬浮控件。公开发布截图会在首个 Release 资源整理后补充。

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

