<!-- 请保持本文件中的开发者标识、仓库 URL、命令、路径、版本号以及钱包地址
     与各翻译版 README 逐字节完全一致。 -->

<p align="center">
  <img src="docs/assets/row-template-banner.png" alt="Row-Template" width="900">
</p>

<p align="center">
  为 <a href="https://github.com/MHSanaei/3x-ui">3X-UI</a> 面板打造的精致、自包含的订阅页面 —— 十五种设计，每种都是一个 HTML 文件，完全白标（white-label），订阅者打开的页面不会向任何第三方发出请求。
</p>

<p align="center">
  <a href="README.md">English</a> | <a href="README.fa.md">فارسی</a> | <a href="README.ar.md">العربية</a> | <a href="README.ru.md">Русский</a> | <strong>简体中文</strong>
</p>

<p align="center">
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/github/license/frank0live/Row-Template"></a>
  <a href="https://github.com/frank0live/Row-Template/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/frank0live/Row-Template?sort=semver"></a>
  <img alt="Panel" src="https://img.shields.io/badge/panel-3X--UI%20%E2%89%A5%203.6.0-informational">
  <img alt="Platform" src="https://img.shields.io/badge/platform-Linux-lightgrey">
  <a href="https://iitzseridev.github.io/Row-Template/"><img alt="Documentation" src="https://img.shields.io/badge/docs-GitHub%20Pages-blue"></a>
</p>

<p align="center">
  <a href="#安装">安装</a> ·
  <a href="#设计">设计</a> ·
  <a href="https://iitzseridev.github.io/Row-Template/">文档</a> ·
  <a href="CHANGELOG.md">更新日志</a> ·
  <a href="https://github.com/frank0live/Row-Template/releases">发布</a>
</p>

---

## 这是什么

3X-UI 可以向订阅者展示自定义页面来代替内置页面。Row-Template 就是这样一个页面：订阅者打开订阅链接，就能看到自己的套餐、用量和到期日期，以及一键把订阅添加到所用应用的方式。

每种设计都以一个自包含的 HTML 文件提供，所有样式、脚本、字体和二维码生成器都已内联其中。一条命令即可把它安装到面板旁边、让面板指向它，并为你提供 `row-template` 管理器，用于品牌设置、更新和回滚。

## 为什么选择 Row-Template？

- **隐私优先。** 订阅者打开的页面不会向任何第三方发出请求。二维码在页面内生成，你的品牌信息以文本形式注入 —— 从不执行，也从不发送到任何地方。
- **真正的白标。** 你的服务名称、你的支持链接、你的徽标。所呈现的页面上没有任何内容标明 Row-Template。
- **十五种设计，每种一个文件。** 选择适合你服务的外观。所有设计共享相同的功能、语言和安全检查。
- **为你的订阅者而设计。** 实时显示用量和到期时间，一键导入常用应用，以及可搜索的单独配置列表，便于手动添加单个服务器。
- **运维安全。** 经校验和验证的发布、原子化激活以及一条命令即可回滚。它从不修补 3X-UI：它唯一会修改的面板设置是订阅页面目录（`subThemeDir`）。

## 设计

Row-Template 1.2.0 提供十五种设计，默认设计为 Row。

<table>
  <tr>
    <td align="center"><img src="docs/public/previews/row-mobile.webp" width="150" alt="Row"><br><sub>Row</sub></td>
    <td align="center"><img src="docs/public/previews/editorial-mobile.webp" width="150" alt="Editorial"><br><sub>Editorial</sub></td>
    <td align="center"><img src="docs/public/previews/canvas-mobile.webp" width="150" alt="Canvas"><br><sub>Canvas</sub></td>
    <td align="center"><img src="docs/public/previews/prism-mobile.webp" width="150" alt="Prism"><br><sub>Prism</sub></td>
    <td align="center"><img src="docs/public/previews/terminal-mobile.webp" width="150" alt="Terminal"><br><sub>Terminal</sub></td>
  </tr>
  <tr>
    <td align="center"><img src="docs/public/previews/pulse-mobile.webp" width="150" alt="Pulse"><br><sub>Pulse</sub></td>
    <td align="center"><img src="docs/public/previews/brutal-mobile.webp" width="150" alt="Brutal"><br><sub>Brutal</sub></td>
    <td align="center"><img src="docs/public/previews/arcade-mobile.webp" width="150" alt="Arcade"><br><sub>Arcade</sub></td>
    <td align="center"><img src="docs/public/previews/sketch-mobile.webp" width="150" alt="Sketch"><br><sub>Sketch</sub></td>
    <td align="center"><img src="docs/public/previews/signature-mobile.webp" width="150" alt="Signature"><br><sub>Signature</sub></td>
  </tr>
  <tr>
    <td align="center"><img src="docs/public/previews/saffron-mobile.webp" width="150" alt="Saffron"><br><sub>Saffron</sub></td>
    <td align="center"><img src="docs/public/previews/pulsenova-mobile.webp" width="150" alt="Pulse Nova"><br><sub>Pulse Nova</sub></td>
    <td align="center"><img src="docs/public/previews/prismnova-mobile.webp" width="150" alt="Prism Nova"><br><sub>Prism Nova</sub></td>
    <td align="center"><img src="docs/public/previews/terminalnova-mobile.webp" width="150" alt="Terminal Nova"><br><sub>Terminal Nova</sub></td>
    <td align="center"><img src="docs/public/previews/arcadenova-mobile.webp" width="150" alt="Arcade Nova"><br><sub>Arcade Nova</sub></td>
  </tr>
</table>

<sub>预览图使用项目自带的示例数据渲染。每种设计的桌面端和移动端预览见<a href="https://iitzseridev.github.io/Row-Template/templates/">模板画廊</a>。</sub>

可以在全新的交互式安装时选择设计，在脚本安装时设置 `RT_TEMPLATE`，或之后在管理器中更改（**Reconfigure branding → Template**）。更新会保留你的选择。

## 功能特性

**面向你的订阅者**

- **实时状态。** 套餐状态、已用和剩余流量以及到期时间，在页面可见期间从你的面板刷新。
- **一键导入**常用应用，按平台分组：Android 上的 v2rayNG、Happ 和 sing-box；iOS 上的 Streisand、V2Box 和 Shadowrocket；Windows 上的 Clash Verge Rev、Mihomo Party 和 v2rayN；macOS 上的 Clash Verge Rev、Streisand 和 V2Box。
- **复制与二维码。** 复制订阅链接，或扫描在页面内生成的二维码。
- **配置浏览器。** 每个服务器单独一行，带有国家旗帜或首字母徽章（monogram）以及协议标签（VLESS、VMess、Trojan、Shadowsocks、Hysteria/Hysteria2、WireGuard、AmneziaWG、Telegram MTProto），每个配置都可查看二维码和复制，长列表支持搜索。
- **五种语言** —— 英语、波斯语、阿拉伯语、俄语和中文 —— 支持从右到左的布局，并可选择 System / Light / Dark 主题。

**面向你**

- **白标品牌。** 服务名称、支持链接和徽标，均为可选，以数据形式存储并以文本形式注入。
- **一个管理器搞定一切。** 交互式菜单和直接命令，用于品牌设置、更新、验证、回滚和卸载。
- **稳定通道更新。** 每次运行 `row-template update` 都会安装经过校验的最新稳定版本——因此它也是快速修复安装的方法。

**隐私与安全**

- 所呈现的页面**不向第三方发出任何请求**：没有 CDN，没有外部二维码或地理定位服务，没有遥测。实时状态来自你自己的面板。
- 每次下载发布版本都**强制进行 SHA-256 校验**，且没有跳过的选项。
- **原子化激活。** 新页面在替换当前页面之前先生成并通过验证，因此失败的步骤绝不会让损坏的页面上线。
- **谨慎的面板检测。** 如果 Row-Template 找到的面板数据库不是有效的 SQLite 数据库，它会拒绝使用，而不是去猜测另一个数据库。

## 支持的面板

| 面板 | 状态 | 说明 |
| ----- | ------ | ----- |
| [3X-UI](https://github.com/MHSanaei/3x-ui) (MHSanaei) | ✅ 已支持 | 需要 **>= 3.6.0** 版本 |
| [PasarGuard](https://github.com/PasarGuard/panel) | 🔬 研究中 | 不受支持；没有安装途径 |
| [Rebecca](https://github.com/rebeccapanel/Rebecca) | 🔬 研究中 | 不受支持；没有安装途径 |

3X-UI 是唯一受支持的面板。PasarGuard 和 Rebecca 使用不同的模板引擎（Jinja2 和 pongo2）；每种设计都会为它们构建页面外壳并打包进发布版本以供研究，但安装程序不会部署它，也没有针对它们的安装说明。研究结果见[兼容性](https://iitzseridev.github.io/Row-Template/compatibility/)。

## 架构

```mermaid
flowchart TB
  subgraph build ["Build and release"]
    direction LR
    SRC["src/<br/>runtime, styles, locales,<br/>15 design layouts"] --> BUILD["tools/build.mjs"]
    BUILD --> ART["One self-contained<br/>HTML file per design"]
    ART --> REL["tools/make-release.sh<br/>tarball + SHA256SUMS"]
  end
  subgraph host ["Your 3X-UI server"]
    direction LR
    INST["install.sh / row-template<br/>verify checksum, stage, validate,<br/>back up, activate"] --> DIR["/etc/3x-ui/<br/>sub_templates/row-template"]
    DIR -- "subThemeDir" --> XUI["3X-UI renders the page<br/>with the subscriber's data"]
  end
  build -- "GitHub Releases" --> host
  host -- "serves the page" --> BROWSER["Subscriber's browser"]
  BROWSER -. "live status: ?format=info" .-> host
```

- **每种设计一个文件。** `tools/build.mjs` 将共享的运行时代码、翻译、字体和二维码生成器内联到设计的布局中，并拒绝缺少任何运行时所需钩子（hook）的布局。随后 `tools/verify.mjs` 会拒绝任何加载远程资源或包含禁用结构的文件。
- **由面板负责渲染。** 页面是一个模板：3X-UI 在提供页面时填入订阅者的数据，之后页面再从同一面板刷新状态。
- **安装程序从不修改 3X-UI。** 它只写入自己的目录，并修改一项面板设置 `subThemeDir`，使其指向该目录。

| 路径 | 内容 |
| ---- | ---------------- |
| `src/` | 页面的运行时代码、样式和翻译；每种设计位于 `src/templates/<id>/` |
| `template/index.html` | 构建好的 Row 页面，已提交到仓库 |
| `tools/` | 构建、验证、发布以及 Go 编写的 fixture 渲染器 |
| `installer/` | `install.sh`、`row-template` 命令及其管理库 |
| `tests/` | 测试套件 |
| `docs/` | 文档站点；设计记录位于 [`docs/design/`](docs/design/README.md) |

## 安装

> **推荐操作系统：Ubuntu 24.04 LTS (x86_64)。** 其他较新的 Linux 发行版或许也能运行，但未经过同等程度的验证覆盖。

**环境要求：** 运行 3X-UI **>= 3.6.0** 的服务器、该服务器的 root 权限，以及 `curl`、`tar` 和 `sha256sum`（几乎所有 Linux 系统都自带）。自动激活还需要 `sqlite3`。

在托管 3X-UI 面板的服务器上以 **root** 身份运行：

```bash
bash <(curl -fsSL https://github.com/frank0live/Row-Template/releases/latest/download/install.sh)
```

安装程序会：

1. 从 GitHub 下载最新的稳定版本。
2. 校验其 SHA-256 校验和（强制 —— 无法绕过）。
3. 安全地解压并安装到 `/etc/3x-ui/sub_templates/row-template`。
4. 全新安装时显示设计选择器（按 Enter 保留 Row）。
5. 提示你设置品牌信息（服务名称、支持链接、徽标 —— 均为可选）。
6. 生成并验证页面，然后在可能的情况下在面板中激活它。

如需不经选择器直接选定设计（例如在脚本中）：

```bash
RT_TEMPLATE=editorial bash <(curl -fsSL https://github.com/frank0live/Row-Template/releases/latest/download/install.sh)
```

如果你不希望直接从网络通过管道执行，可以从 [Releases 页面](https://github.com/frank0live/Row-Template/releases/latest)将四个发布文件（`install.sh`、`manifest.txt`、`SHA256SUMS` 和 `row-template-<version>.tar.gz`）下载到同一个文件夹，按照 [PROVENANCE.md](PROVENANCE.md) 中的说明自行校验校验和，然后让安装程序使用该文件夹：

```bash
RT_RELEASE_DIR=/root/row-template-release bash /root/row-template-release/install.sh
```

### 激活

Row-Template 安装在一个由面板作为订阅页面提供的目录中：

```
/etc/3x-ui/sub_templates/row-template
```

- **自动：** 当 `sqlite3` 可用时，Row-Template 会替你完成设置。它会短暂停止面板服务、写入设置、重新启动服务并核对该值。交互式安装会先显示当前设置并征求你的同意。
- **手动：** 否则，请打开 **Panel Settings → Subscription → Profile → Sub Theme Directory** 并准确输入：

  ```
  /etc/3x-ui/sub_templates/row-template
  ```

## 使用

在终端中不带参数运行管理器以打开交互式菜单：

```bash
row-template
```

或直接使用命令：

| 命令 | 作用 |
| ------- | ------------ |
| `row-template config` | 更改服务名称、支持链接或徽标，然后重新生成页面 |
| `row-template update` | 下载、校验并激活最新的稳定版本（强制校验校验和） |
| `row-template rollback` | 恢复到之前的版本（`--auto` 或 `--to <backup>`） |
| `row-template verify` | 检查安装、面板连接和当前页面（只读） |
| `row-template version` | 显示已安装版本、最低支持版本以及检测到的 3X-UI 版本 |
| `row-template uninstall` | 移除 Row-Template 并让面板恢复其内置页面 |
| `row-template help` | 显示用法 |

会修改系统的命令（`config`、`update`、`rollback`、`uninstall`）必须以 root 身份运行。

- **品牌信息**以数据形式存储，从不执行，并以文本形式注入页面。将某个字段留空即可得到无品牌的页面。支持链接只接受浏览器应当打开的协议，例如 `https://…`、`tg://…` 或 `mailto:…`。
- **更新**来自公共稳定通道。`row-template update` 总是应用最新的稳定版本，即使你已安装的就是该版本；管理器中的 **Update** 会先比较版本，并在做出任何更改前询问。如果无法访问发布源，则不会做任何更改，你的安装也绝不会因此被视为已损坏。
- **回滚**会从经过验证的备份中恢复之前的版本。系统会先为当前版本创建快照（snapshot），因此失败的回滚也可以恢复，且你的品牌配置会被保留。
- **卸载**会移除 Row-Template 的文件。只有当面板的 `subThemeDir` 指向 Row-Template 时才会将其清除，使面板恢复内置页面；你的入站（inbound）、客户端和证书都不会受到影响。

[文档](https://iitzseridev.github.io/Row-Template/)更详细地介绍了配置、品牌设置和故障排查。

## 开发

页面由 `src/` 中可读的源代码构建而成。你需要 Node.js 22 或更高版本，运行测试还需要 Go 1.22 或更高版本。

```bash
npm run build          # regenerate template/index.html from src/
npm run verify         # check the built page against the safety gates
npm test               # render the fixture pages, then run every test suite
npm run fixtures:all   # render every design's fixture pages on their own
npm run lint:sh        # ShellCheck every shell script
npm run preview        # preview the fixture pages at http://127.0.0.1:8787
```

构建是确定性的 —— 相同的源代码总会生成逐字节一致的 `template/index.html`。文档站点是 `docs/` 中的独立工作区；参见 [docs/README.md](docs/README.md)。

## 测试

- **`npm test`** 先用 Go 渲染器生成所有设计的 fixture 页面，然后运行各测试套件：页面脚本、构建、每种设计的最终文件、发布包内容以及安装程序 —— 其发布的 shell 库会在真实的 `bash` 中针对临时 fixture 运行。
- **`npm run verify`** 按照安全关卡检查构建好的页面，包括：完整的文档、所有构建标记均已替换、所有内容均已内联、没有远程引用、没有禁用结构、翻译完整，以及源代码中没有不可见字符。
- **`npm run lint:sh`** 遇到任何 ShellCheck 错误即失败；`npm run lint:sh -- -S warning` 会显示完整报告。
- **Docs 工作流**会在每个修改文档站点的 pull request 中构建该站点。

## 路线图

这是方向，而非承诺：

- **Row-Template 1.2.0** —— 上文介绍的十五种设计和设计选择器。
- **PasarGuard 和 Rebecca** —— 研究中。两者的页面外壳均已构建；实时状态需要对运行时代码做一处小改动或使用反向代理（reverse proxy），这一决定已推迟。参见[兼容性](https://iitzseridev.github.io/Row-Template/compatibility/)。
- **在多个面板上安装** —— 安装程序的基础设施（面板接口、事务引擎、3X-UI 适配器和新的备份格式）已经就绪，但尚未被任何命令使用。
- **自定义模板** —— 关于添加你自己设计的提案：[`docs/design/CUSTOM-TEMPLATES-PROPOSAL.md`](docs/design/CUSTOM-TEMPLATES-PROPOSAL.md)。

## 参与贡献

非常欢迎问题反馈、翻译和文档修正。在提交 pull request 之前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)，并遵守[行为准则](CODE_OF_CONDUCT.md)。

**问题反馈：** 请在 <https://github.com/frank0live/Row-Template/issues> 提交 issue。请附上你的 Row-Template 版本（`row-template version`）、3X-UI 版本、操作系统及其版本、CPU 架构、`row-template verify` 的输出，以及清晰的复现步骤。

> **请勿包含机密信息。** 切勿粘贴订阅 URL、`subId` 值、客户端 UUID、面板用户名或密码、Cookie、令牌、面板的 `webBasePath`、TLS 密钥或真实的服务器地址。分享日志前请先对其做脱敏处理。

## 安全

发现了漏洞？请私下报告——参见 [SECURITY.md](SECURITY.md)。请勿为安全问题创建公开的 issue。[PROVENANCE.md](PROVENANCE.md) 说明了发布版本是如何构建的以及如何验证它们。

## 支持本项目

Row-Template 是免费且开源的。如果它为你节省了时间，欢迎支持它的开发：

- **USDT（BEP20 / BNB Smart Chain）：**

  ```
  0x2606551375987cec71F5fC033968B638A7a4bae4
  ```

- **TRON：**

  ```
  TYD5RFfiYrcETzWNSkAhfwgmRu1wQBbs6W
  ```

- **NOWPayments：** <https://nowpayments.io/donation/iitzfrank0live>

谢谢。

## 许可证

基于 [MIT License](LICENSE) 发布。随附的二维码生成器（`src/vendor/uqr`）依据其自身的 MIT 许可证包含在内，内嵌的 Vazirmatn 字体子集则依据 SIL Open Font License（`src/fonts/OFL.txt`）提供。

## 开发者

由 **frank0live** 构建和维护 —— <https://github.com/frank0live/Row-Template>
