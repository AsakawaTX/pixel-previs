# pixel-previs 像素镜头预演

一个给 AI 智能体用的 skill：用文字描述镜头，或者丢一段视频，生成统一风格的像素预演视频，拿去当 AI 视频生成的分镜和运镜参考。

## 能做什么

- **文字 → 预演**：内置 49 个常用分镜和运镜，也能自由组合机位、运镜、多人走位、多镜头拼接，人物可以走、跑、挥手、指、跳等，还有道具和手持物。
- **视频 → 复刻**：自动切镜头、测量运镜，拼出关键帧图，再用同样的像素风格复刻出来。

## 环境

Node.js 18+ 和 ffmpeg，没有其它依赖。

## 用法

```bash
node render.js --list                          # 看全部预设
node render.js --preset Y15 -o orbit.mp4       # 渲染一个预设
node render.js examples/dialogue-scene.json -o scene.mp4
node analyze.js my_clip.mp4 --out ana/         # 分析一段视频
```

把整个文件夹放进你的智能体的 skills 目录即可，详细说明见 [SKILL.md](SKILL.md)。

## 小提示

预演视频只用来参考镜头和走位。拿去给视频模型时，记得在提示词里写清楚"不参考参考视频的画风和环境"，并禁止像素风、方块、体素，否则模型可能把像素树之类的东西也照搬过去。

## 协议

[MIT](LICENSE)
