# 三国·破阵 Sanguo Blades

浏览器里的 2.5D 横版无双动作肉鸽游戏，三国题材。

- 武将：赵云、关羽、张飞，各有五连斩、破阵重技、闪避、跳跃和无双奥义
- 两幕九关：黄巾之乱（Boss 张角）、虎牢关（Boss 吕布）
- 每关后三选一锦囊、军营整备、演武场永久天赋、本地存档
- 键鼠与触屏操作；音效全部由 WebAudio 实时合成

## 操作

WASD 移动 · J 斩击 · K 破阵 · L / Shift 闪避 · 空格 跳跃 · Q 无双 · Esc 暂停

## 开发

需要 Node 22。

```bash
npm install
npm run dev        # 本地开发
npm test           # vitest（含整局无头模拟）
npm run typecheck
npm run build      # 输出到 dist/，可部署到任意静态托管
```

设计文档见 [docs/DESIGN.md](docs/DESIGN.md)。美术资源为 AI 生成。
