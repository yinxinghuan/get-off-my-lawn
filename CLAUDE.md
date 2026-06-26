# Mini Game — Dev Guidelines

> 复制本文件到新游戏项目根目录，Claude Code 会在每次会话开始时自动读取。

---

## Tech Stack

当前项目使用 React + TypeScript + Less + Vite，但技术选型不做强制，新游戏可根据需要选择合适的框架和语言。

---

## Project Structure（当前 React 项目参考）

以下为当前 React 游戏的目录结构，供参考，不作为强制模板：

```
src/
  <GameName>/
    <GameName>.tsx        # 主组件
    <GameName>.less
    index.ts              # 导出主组件
    types.ts              # TypeScript 类型
    hooks/
      use<GameName>.ts    # 游戏逻辑
    components/           # 子组件
    i18n/
      index.ts            # 轻量 i18n
    utils/
      sounds.ts           # 音效工具
    img/                  # 图片资源
```

---

## Component Conventions

- CSS 命名：BEM + 游戏前缀，如 `.fb-bird__img`、`.wam-hole__pit`
- 所有 `@keyframes` 加游戏前缀，避免冲突，如 `@keyframes fb-bird-flap`
- 图片资源：`draggable={false}`，`pointer-events: none`

---

## Input Handling

- **只用 `onPointerDown`**，不要同时注册 `onMouseDown + onTouchStart`（移动端会触发两次）
- 交互元素加：
  ```css
  -webkit-tap-highlight-color: transparent;
  user-select: none;
  touch-action: none;
  ```

---

## Game Loop

- 游戏逻辑与渲染分离
- 高频物理量用 `requestAnimationFrame` 驱动，避免不必要的重渲染
- 只在需要触发重渲染的值上更新状态（得分、倒计时、游戏阶段）

---

## i18n 规范

轻量自定义，不引入外部库，支持 **zh / en** 双语。

```ts
// i18n/index.ts 模板
function detectLocale(): 'zh' | 'en' {
  const override = localStorage.getItem('game_locale');
  if (override === 'en' || override === 'zh') return override;
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

export function t(key: string, vars?: { n?: number | string }): string
```

- 所有用户可见文字走 `t()`，不内联硬编码
- 测试切换语言：`localStorage.setItem('game_locale', 'en')` 后刷新

---

## Game UX Standards

- **开始缓冲期**：游戏开始后 ≥ 1.5s 内不判定死亡/扣分，给玩家反应时间
- **打击反馈**：命中时显示浮动分数（+N）+ 角色台词气泡，CSS 动画上飘消失
- **连击**：combo ≥ 2 时显示连击数
- **最高分**：`localStorage` 持久化，游戏结束界面显示
- **结束界面**：最终得分 + 历史最高 + 再来一次 + 返回首页

---

## Screen States

游戏维护三个互斥状态：开始页、游戏中、结束页。

---

## Game Meta

每个游戏项目根目录必须有 `meta.json`，包含游戏标题和封面图路径：

```json
{
  "title": "游戏标题",
  "cover_url": "/封面图相对路径.png"
}
```

- `cover_url` 使用相对于项目根的路径，以 `/` 开头
- 封面图建议放在 `public/` 目录下（如 `/poster.png`）
- 这是发布流程的必须步骤，新游戏上线前必须创建

---

## Build & Git

- 每次提交前必须 `npm run build` 通过
- 每个功能/修复单独提交，message 描述清晰
- 提交后 `git push`

---

## ComfyUI — 可用 Workflows

> Workflow 文件目录：`/Users/yin/ComfyUI/user/default/workflows/`
> 生成脚本：`games-template/generate_posters.py`（调用 ComfyUI REST API，支持批量生成）

| 文件名 | 模型 | 用途 |
|--------|------|------|
| `flux2_klein_workflow.json` | Flux2 Klein 4B + Qwen3 | **文生图，4步快速，文字准确，首选** |
| `flux2_klein_lora_workflow.json` | Flux2 Klein + LoRA 支持 | 文生图 + 风格 LoRA |
| `flux2_klein_edit_workflow.json` | Flux2 Klein | 图片编辑（img2img） |
| `flux_workflow.json` | Flux1 Dev (GGUF Q4) + T5+CLIP-L | 文生图，高质量 |
| `sd35_workflow.json` | SD 3.5 Medium + TripleCLIP | 文生图，文字准确，速度较慢 |
| `sd35_LoRA_workflow.json` | SD 3.5 Medium + LoRA | 文生图 + 风格 LoRA |
| `juggernaut_xl_workflow.json` | JuggernautXL Ragnarok | 文生图，写实人像 |
| `sdxl_lora_workflow.json` | JuggernautXL + LoRA | 文生图 + 像素画等风格 LoRA |
| `A_mix_Illustrious.json` | A-Mix Illustrious | 文生图，动漫风格 |
| `upscale_esrgan_workflow.json` | RealESRGAN x4 | 图片 4x 超分辨率放大 |
| `upscale_ultimate_workflow.json` | JuggernautXL + 4xUltrasharp | 终极放大（含重绘细节） |
| `wan21_t2v_1_3B_mac.json` | Wan 2.1 T2V 1.3B | **文生视频**（Mac 优化版） |

**Flux2 Klein API 接入要点（已验证可用）：**
```python
# 关键节点组合（workflow 节点类型）：
UNETLoader(flux-2-klein-4b.safetensors, default)
CLIPLoader(qwen_3_4b.safetensors, flux2)        # type 必须为 "flux2"
VAELoader(flux2-vae.safetensors)
EmptyFlux2LatentImage(1024, 1024)               # 专用节点，非 EmptyLatentImage
Flux2Scheduler(steps=4, width=1024, height=1024) # 只需 4 步！
CFGGuider(cfg=1.0) + ConditioningZeroOut         # 无负向提示词
SamplerCustomAdvanced + KSamplerSelect(euler)
```

---

## Common Pitfalls（踩过的坑）

| 问题 | 原因 | 解决 |
|------|------|------|
| 点击一次跳多次 | `onMouseDown + onTouchStart` 双触发 | 改用 `onPointerDown` |
| 修改 hook 后游戏行为没变 | Vite HMR 不热更新自定义 hook | 停止并重启 preview server |
| 英文界面布局撑开 | 文字比中文长，`white-space: nowrap` | 改为 `white-space: normal; word-break: break-word` |
| 角色与洞口视觉脱离 | `translateY` 值过小（弹出太高） | 调整 `--active` 状态的 translateY，whack 动画起始帧同步修改 |
| 碰撞判定过早 | 游戏一开始就检测碰撞 | 加 grace period，期间跳过碰撞检测 |
