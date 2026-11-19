# 8 球台球 · 微信小游戏版

基于 [henshmi/Classic-Pool-Game](https://github.com/henshmi/Classic-Pool-Game)（MIT 许可证）改造的微信小游戏工程：已移除全部浏览器 DOM 依赖、界面汉化、接入微信广告，新增**好友联机对战**与**标准 8 球外观（实心/花色 + 球号）**。

## 〇、本地浏览器预览（不用装开发者工具）

工程自带一套 `wx` API 模拟层，游戏代码**一行不改**就能在桌面浏览器里跑，用来快速看画面和调手感：

```bash
# 在工程上级目录（含 serve.js 的那层）
node serve.js                 # 预览页 http://localhost:5180/
cd pool-server && node index.js   # 可选：联机服务 ws://127.0.0.1:3010/pool
```

- 打开 http://localhost:5180/ 即可玩；鼠标模拟手指：**按住拖动瞄准 → 拉远蓄力 → 松手击球**
- 测联机：开两个浏览器标签页，都用「好友对战」，一个创建房间、另一个输码加入
- 预览层会把 `SERVER_URL`（wss://wandou.dongpouu.top/pool）自动重写成 `ws://本机:3010/pool`，所以本地联机不用改代码
- 自动化验收：`node verify-preview.js`（渲染/点击/击球 11 项）、`node test-preview-online.js`（双端联机 12 项）

> 预览层只用于调试，不参与小游戏打包：`web-preview/`、`serve.js`、`verify-preview.js` 都在工程目录**之外**，上传时不会被带上。

## 一、导入微信开发者工具（三步）

1. **下载安装**：https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html
   选「稳定版 Stable Build」，Windows 64 位。
2. **导入项目**：
   - 打开开发者工具 → 点「+」或「导入项目」
   - **目录**：选择 `classic-pool-minigame` 这个文件夹（注意：不要选它的上级目录）
   - **AppID**：还没有小游戏 AppID 时点「测试号」（写 `touristappid` 也可以）；有自己的小游戏就填自己的 AppID
   - 项目名称随便填，确定即可
3. **编译运行**：点工具栏「编译」，模拟器里就能直接玩。

> 模拟器是**横屏**的，看不到画面请点模拟器上方切换设备为 iPhone / 横屏机型。
> 真机预览：点「预览」→ 手机微信扫码 → 打开即可试玩（体验版需要 AppID，测试号只能用模拟器）。

**联机功能本地调试**（不想部署服务器时）：
1. 本机跑房间服务：`cd pool-server && npm install && npm start`
2. 打开 `src/Global.js`，把 `SERVER_URL` 临时改成 `ws://127.0.0.1:3010/pool`
3. 开发者工具右上角「详情 → 本地设置」勾选 **「不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书」**
4. 编译后点「好友对战 → 创建房间」，用另一个模拟器窗口/真机加入同房间码

## 二、好友联机对战

### 玩法
主菜单 → **好友对战** → 创建房间拿到 4 位房间码 → 点「分享给好友」（或让对方手动输码加入）→ 双方进入同一棋面 → 轮流击球。

### 架构（`pool-server/`）
```
客户端 A ─┐                                   ┌─ 复用 classic-pool-minigame/src 物理代码
          ├─ wss://域名/pool ─ Caddy ─ Node 房间服务 ─┤  （同一份 Ball/GameWorld/GamePolicy）
客户端 B ─┘                                   └─ 房间快照 / 回合 / 计分
```
- **服务器权威**：客户端只上行「角度 + 力度」，服务器用同一份物理代码算出结果（一杆约 2ms），再下发完整快照；客户端以快照为准校正
- **客户端预测**：本地下杆立刻按同参数播放，收到快照时若球已停下就对齐（实测偏差 0.00px），无延迟感
- **服务端校验**：轮次、力度越界（>75）、重复 seq、白球摆放位置非法都会被拒绝
- **断线容错**：对手掉线会提示并回到菜单；房间保活 2 分钟

### 协议
| 方向 | 消息 |
|---|---|
| C→S | `create` / `join{code}` / `shot{seq,angle,power}` / `ballInHand{x,y}` / `rematch` / `leave` |
| S→C | `room{code,seat}` / `start{seat,snapshot}` / `shotStart{by,angle,power}` / `shotResult{by,seq,snapshot}` / `state{snapshot}` / `opponentLeft` / `error` |

### 线上部署（示例）

**地址：`wss://<你的域名>/pool`**（`src/Global.js` 的 `SERVER_URL` 要指向它，并加到小游戏后台的 socket 合法域名）

| 项 | 值 |
|---|---|
| 服务器 | `<你的服务器 IP>`（Ubuntu 24.04 / Node 18.19） |
| 代码目录 | `/opt/pool-server`（含 `classic-pool-minigame/src` 物理源码副本） |
| 进程 | systemd 服务 `pool-server`，`Restart=always`，用户 `www-data` |
| 监听 | `127.0.0.1:3010`，**不对公网暴露**，只经 Caddy 反代 |
| 反代 | `/etc/caddy/Caddyfile` 里 `handle /pool* → reverse_proxy 127.0.0.1:3010` |
| 日志 | `journalctl -u pool-server -f` |
| 健康检查 | `curl -s http://127.0.0.1:3010/health` → `{"ok":true,...}` |

常用操作：
```bash
systemctl status pool-server     # 状态
systemctl restart pool-server    # 重启
journalctl -u pool-server -n 50  # 最近日志
```

改完客户端物理/规则代码后同步上线（`sim.js` 与客户端共用同一份源码，必须一起更新）：
```bash
bash deploy/deploy.sh            # 本地执行：同步 index.js/sim.js/src 并重启服务
node deploy/verify-deploy.js     # 线上端到端验收（10 项：建房→加入→开球→击球）
```

本地开发（不开线上）：
```bash
cd pool-server && npm install && node index.js   # ws://127.0.0.1:3010/pool
```

### 上线前必须做的一步
小游戏后台 → **开发管理 → 开发设置 → 服务器域名 → socket 合法域名**，添加：
```
wss://wandou.dongpouu.top
```
域名需已备案、证书有效；未配置的话真机上 `wx.connectSocket` 会直接失败。

## 三、标准 8 球外观

- 用 Canvas 程序化绘制，不再依赖球的贴图（`src/Canvas2D.js` 的 `drawPoolBall`）
- **1-7 实心球**：黄/蓝/红/紫/橙/绿/栗，**9-15 花色球**：白底 + 同色横带，**8 号黑球**，母球纯白
- 球面中间白圈 + 球号，比分下方显示「实心 1-7 / 花色 9-15」组别
- 规则分组沿用原版两色逻辑：`Color.yellow` 组 = 实心球，`Color.red` 组 = 花色球，判定代码未改

## 四、AI 难度与性能

| 难度 | `TRAIN_ITER` | 位置 | 说明 |
|---|---|---|---|
| 简单 | 30 | 后手 | 试打 30 次取最优 |
| 普通 | 50 | 后手 | |
| 困难 | 100 | 后手 | |
| 大师 | 300 | **先手** | 另加 8 秒时间上限，跑不满时用当前最优解 |

AI 是**蒙特卡洛爬山搜索**：每杆对当前局面做快照 → 反复随机/局部微调「角度 + 力度」→ 真实模拟到球全停 → 按「进球 +2000/黑8 +10000/犯规 −3000/把球打散」评分 → 保留最高分方案，复位球局后按最优参数真打。

**卡顿已修复**：原版用 `while` 同步跑完全部迭代，大师档会冻结主线程数秒；现改为 `requestAnimationFrame` 分帧执行（每帧最多 40ms）。训练期间**不重绘、不换画面**，屏幕停在 AI 思考前的那一帧，只在台面顶部浮一条「电脑 · 大师 思考中…」胶囊，出杆后画面无缝接回。实测主线程最长阻塞 73ms，训练总耗时约 1.5 秒。

## 五、广告接入（`src/system/Ad.js`）

| 广告类型 | 展示时机 | API |
|---|---|---|
| Banner | 主菜单 / 暂停菜单底部，进入对局自动隐藏 | `wx.createBannerAd` |
| 插屏 | 一盘结束（黑球落袋结算），内置 60s 最小间隔 | `wx.createInterstitialAd` |
| 激励视频 | 暂停菜单「看广告重新开局」，完整观看才发奖 | `wx.createRewardedVideoAd` |

**上线前 3 步**：小游戏后台开通流量主 → 创建三类广告位 → 把 `AdConfig` 里的 `adunit-请替换...` 换成真实 ID。
未替换时广告模块自动空转，不影响游戏运行。

## 六、触屏操作

| 操作 | 说明 |
|---|---|
| 瞄准 | 按住屏幕拖动，球杆指向手指方向 |
| 蓄力 | 拖得离白球越远力度越大（底部显示百分比） |
| 击球 | 松手；拖动距离过小视为误触自动取消 |
| 菜单 | 右上角「菜单」按钮（暂停 / 重开 / 切换模式） |

> 「菜单」按钮的位置不是写死的：运行时读 `wx.getMenuButtonBoundingClientRect()`，
> 换算到设计坐标后**整体让到系统胶囊（… / ✕）左侧**，同时避开右上袋口，
> 避免被胶囊盖住半截、也避免挡住进袋视线。没有胶囊的环境（浏览器预览、测试桩）沿默认位置。
| 自由球 | 犯规后拖动白球到合法位置松手（详见下） |

### 自由球（犯规摆球）

犯规后白球自动回到开球点附近（若被占就就近找空位），外圈显示提示环：

- **绿色光圈**：当前位置可以放
- **红色光圈 / 底部红字**：压着别的球、贴边或落在袋口，松手会**回弹**到最近一次合法位置
- 拖出桌面也不会飞出去，白球会被夹在台面以内
- 摆放期间球杆被隐藏且不能出杆，摆好后自动恢复

## 七、对局 HUD 与玩家区分

台面上不放玩家信息卡片，全部收进**底部一条信息栏**，视线留给球桌：

- **底部信息栏**：左、右各一个**昵称芯片**，中间是状态胶囊
  - 左侧芯片 = 玩家 1（蓝 `#4AA3FF`），右侧芯片 = 玩家 2（橙 `#FF9F43`）
  - **轮到谁出杆，谁的芯片就用主色描边高亮**，对方芯片压暗，一眼看出该谁打
  - 芯片宽度按名字长度自适应，10 个字也完整显示（超出则缩字号，不截断）
- **状态胶囊**：随文字自适应，直接说「在干什么」，不再重复名字：
  `力度 42% · 实心 1-7 · 本盘 2/7` / `击球中…` / `等待对方出杆…` / `自由球：拖动白球到台面空位，松手放置`
- **AI 思考时**：中间胶囊留空（两侧昵称仍在），只在台面顶部浮一条「电脑 · 大师 思考中…」，画面不切换
- **已落袋球**：顶部木框左右两侧按玩家分组、按球号紧凑排列，一眼看出还剩哪些球
- **昵称**（本地缓存，两个槽位）：
  | 槽位 | 存储键 | 用途 |
  |---|---|---|
  | 我 | `playerNickname` | 本机玩家，联机时发给房间服务 |
  | 玩家 2 | `playerNickname2` | 同机双人对战的右方玩家 |
  - 主菜单「我的昵称：xxx」打开面板，面板顶部两个页签**「我的昵称 / 玩家 2 昵称」**可切换编辑
  - 输入走自绘面板 + `wx.showKeyboard`（实时回显、`确定/取消` 可点）；键盘不可用时自动降级 `wx.showModal`
  - 默认「球友 + 4 位随机数」并立刻落盘，**杀进程重进名字不变**
  - 长度按**字符**截断到 10（`Array.from` 按码点切），emoji 不会被劈成半个乱码；换行/制表/连续空格自动规整
- **联机**：建房/加入时把昵称发给房间服务，开局由服务器统一下发双方昵称，两端看到的名字一致
- **人机**：显示为「电脑 · 简单/普通/困难/大师」

> 浏览器预览层同步实现了 `wx.showKeyboard`（页面底部的真实 input），所以本地预览也能真正改昵称，不需要绕过输入。

## 八、工程结构

```
classic-pool-minigame/
├── game.js                 # 入口：加载资源分包 → require 模块 → Game.start()
├── game.json               # 横屏 + pkgAssets 资源分包
├── project.config.json     # compileType: game
├── LICENSE.txt             # 原 MIT 许可证（务必保留）
├── src/
│   ├── Canvas2D.js         # 画布缩放居中 + drawPoolBall（花色球号绘制）
│   ├── Game.js             # 主循环 / 开局 / 联机开局 / 服务器快照套用
│   ├── GameWorld.js        # 物理核心 + 自由球状态机 + 底部提示
│   ├── GamePolicy.js       # 规则判定 / 计分 / 组别 / 已落袋球栏
│   ├── Global.js           # 全局常量（含 SERVER_URL、NET_ON、NET_SEAT）
│   ├── game_objects/
│   │   ├── Ball.js         # 球体物理 + 花色球号渲染
│   │   ├── Player.js       # 玩家数据（昵称 / 专属配色 / 比分）
│   │   └── Stick.js        # 瞄准蓄力 + 联机击球上行
│   ├── menu/               # 中文按钮 / 主菜单 / 难度菜单
│   ├── net/
│   │   ├── Net.js          # WebSocket 封装、协议收发、快照校正
│   │   └── Lobby.js        # 好友对战大厅（创建/输码加入/等待）
│   ├── AI/                 # 人机对战（分帧训练）
│   └── system/             # 广告 / 音频 / 颜色 / 昵称（Nick.js / NickPanel.js）/ 诊断（Diagnostics.js）
└── pkgAssets/              # 资源分包（约 14MB，总包上限 30M）
    └── assets/{sprites,sounds}
```

服务器与测试脚本在工作目录下（不在小游戏包内）：
```
pool-server/          # 房间服务：index.js（房间/协议）sim.js（无头物理适配）
deploy/               # 线上部署产物：Caddyfile、pool-server.service、deploy.sh、verify-deploy.js
test-smoke.js         # 单机全链路冒烟测试（11 项）
test-freeball.js      # 自由球专项：跟手/夹边/非法回弹/放置（19 项）
test-ai.js            # AI 分帧训练不卡顿验证（5 项）
test-net.js           # 房间服务协议测试（17 项）
test-online.js        # 客户端联机链路测试（18 项）
verify-preview.js     # 浏览器预览验收（21 项，含胶囊避让 / HUD / 昵称缓存 / 自由球视觉）
shots-ai-thinking.js  # AI 思考态验收：不切画面 / 只浮顶部提示（7 项，出截图）
test-preview-online.js# 两个浏览器标签页联机验收（15 项，含昵称同步）
```

## 八点五、启动自检与易踩的坑

- **新增全局模块必须在 `game.js` 的 require 列表里注册**。`Diagnostics.js`（`Diag`）和 `NickPanel.js` 都通过 `GameGlobal` 暴露，漏加载时 `Game.start()` 第一行 `Diag.init()` 会直接 `ReferenceError`，表现为**编译通过但白屏/黑屏、完全不能玩**。判断方法：IDE console 里搜 `Diag is not defined`。
- **主循环只能从 `Game.startMainLoop()` 启动**。它每次发新令牌，旧循环下一帧自动退出；watchdog 重启时不会出现两条 rAF 并行（并行会让物理 dt 叠加、球速翻倍）。
- **开局 5 秒说明页期间 `Game._pendingStart = true`**，watchdog 会跳过停摆判定，避免说明页被中途打断。
- **诊断层**：`Diag` 把异常和帧率画在屏幕左上角，**默认关闭**（不做环境判断，开发/体验/正式版一致，避免「本机看得见、上线看不见」）。排查时用 `wx.setStorageSync("diag_on", 1)` 打开、`wx.setStorageSync("diag_off", 1)` 关闭（后者优先）。日志走 `console.warn`（不是 `error`），避免被验收/监控误判为崩溃；同一条日志 5 秒内只记一条，非致命信息 8 秒后自动消失。注意 `Diag.tick()` 不受 `show` 影响，仍每帧更新帧时间戳，watchdog 的重启能力不受开关影响。
- **watchdog 不要反复重启**：rAF 被系统暂停（IDE 窗口失焦、手机锁屏、切后台）时 `setInterval` 仍在跑，容易被误判成「循环死了」。现在监听 `wx.onHide/onShow` 做前后台标记、连续重启做 4 秒递增退避、最多重启 3 次，避免恢复瞬间堆出多条并行 rAF 循环（那会让 `DELTA` 叠加、球速翻倍）。
- **触摸无响应排查顺序**：① IDE console 有无异常 ② `Diag` 面板是否出现「触点 …」（有=事件到达，看坐标换算；无=事件没进游戏层）③ 检查 `Canvas2D._winW/_winH` 与 `wx.getSystemInfoSync()` 是否一致。

## 九、商用合规

- **代码**：MIT，可闭源商用，但必须保留 `LICENSE.txt` 的版权声明（© 2018 Chen Shmilovich，游戏内已保留署名）
- **背景音乐**：Bossa Antigua - Kevin MacLeod，**CC BY 3.0**，商用需署名（主菜单已加，请勿删除）
- **上架前提**：小游戏账号个人主体即可（不能内购、只能广告变现）；企业主体可内购
- 上架前建议替换美术素材并改名，规避相似性风险
