# 幸福驿站转念训练

一个移动端优先的转念训练工具。用户可以从生活、家庭、亲子、情感、事业、工作、社交等经典场景进入，先看见自己的第一念，再换一个有事实、有边界、能说出口的正向理解。

## 本地运行

```bash
npm install
npm run dev
```

打开 Vite 输出的本地地址，常用入口：

- `/join`：入班与无班级码体验入口
- `/scenes`：12 个转念场景
- `/commenting`：独立点评工具入口

## 验证

```bash
npm run lint
npm run typecheck
npm test -- --maxWorkers=1
npm run build
```

## GitHub Pages

仓库名为 `zhuannian-training` 时，GitHub Pages 构建使用：

```bash
npm run build:pages
```
