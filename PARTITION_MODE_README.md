# Etcher 分区烧录功能

## 功能概述

此功能为 Etcher 添加了**分区级烧录**能力,允许用户将镜像文件烧录到指定的磁盘分区,而不是整个磁盘。

### 为什么需要这个功能?

1. **多系统U盘**: 在同一个U盘上安装多个操作系统(Windows + macOS + Linux)
2. **数据保留**: 烧录到特定分区时,不影响其他分区的数据
3. **灵活性**: 更精细地控制数据写入位置

### 使用场景

```
64GB U盘示例:
├── 分区1: Windows 10 (20GB)      ← 用 Etcher 烧录 Windows ISO
├── 分区2: macOS Big Sur (20GB)    ← 用 Etcher 烧录 macOS 镜像
└── 分区3: 数据存储 (24GB)      ← 保留不变
```

## 实现状态

### ✅ 已完成

- [x] **分区类型定义** (`lib/shared/drive-constraints.ts`)
  - `DrivePartition` 接口
  - 扩展 `DrivelistDrive` 包含 `partitions` 字段

- [x] **分区扫描器** (`lib/util/partition-scanner.ts`)
  - Windows: 使用 `diskpart`
  - macOS: 使用 `diskutil`
  - Linux: 使用 `lsblk`

- [x] **扫描器集成** (`lib/util/scanner.ts`)
  - 自动获取驱动器分区信息
  - 将分区附加到驱动器对象

- [x] **写入逻辑** (`lib/util/child-writer.ts`)
  - 支持 `partitionMode` 参数
  - 使用分区路径创建 `BlockDevice`
  - 分区模式下禁用 direct I/O

- [x] **分区选择界面** (`lib/gui/app/components/drive-selector/drive-selector.tsx`)
  - 分区展开/折叠功能
  - 分区列表显示(分区号、标签、大小、文件系统)
  - 分区选择复选框
  - 分区模式开关
  - 警告提示

- [x] **参数传递** (`lib/gui/app/modules/image-writer.ts`)
  - 自动检测是否为分区模式
  - 将 `partitionMode` 传递给写入器

## 快速开始

### 1. 测试分区扫描

```bash
# 列出所有磁盘
node test-partition-scanning.js

# 扫描特定磁盘的分区
node test-partition-scanning.js /dev/sda        # Linux
node test-partition-scanning.js /dev/disk0      # macOS
node test-partition-scanning.js \\.\PhysicalDrive1  # Windows
```

### 2. 编译项目

```bash
npm run compile
```

### 3. 运行应用

```bash
npm start
```

### 4. 使用分区模式

1. 启动 Etcher
2. 选择镜像文件 (Windows ISO, macOS DMG, etc.)
3. 点击"选择目标"
4. 勾选"Partition Mode" (分区模式)
5. 展开目标磁盘(点击磁盘名称前的箭头)
6. 点击选择目标分区(可多选)
7. 点击"Flash!"
8. 确认警告提示后开始烧录

## 技术文档

详细的技术实现文档:

- **完整实现指南**: `docs/partition-writing-implementation-guide.md`
- **UI修改说明**: `docs/drive-selector-partition-ui-changes.md`
- **实现总结**: `docs/partition-writing-implementation-summary.md`

## 文件结构

```
lib/
├── shared/
│   └── drive-constraints.ts          ✅ 已修改(添加 DrivePartition)
├── util/
│   ├── partition-scanner.ts           ✅ 新建(分区检测)
│   ├── scanner.ts                   ✅ 已修改(集成分区扫描)
│   ├── child-writer.ts              ✅ 已修改(支持分区写入)
│   └── types/
│       └── types.d.ts               ✅ 已修改(添加 partitionMode)
└── gui/
    └── app/
        ├── components/
        │   └── drive-selector/
        │       └── drive-selector.tsx  ✅ 已修改(分区选择UI)
        └── modules/
            └── image-writer.ts          ✅ 已修改(参数传递)

docs/
├── partition-writing-implementation-guide.md
├── drive-selector-partition-ui-changes.md
└── partition-writing-implementation-summary.md

test-partition-scanning.js  # 测试脚本
```

## 开发指南

### 调试分区扫描

```typescript
// 启用详细日志
DEBUG=* node test-partition-scanning.js /dev/sda

// 查看扫描器日志
tail -f ~/.config/etcher/logs/*.log
```

### 运行测试

```bash
# 单元测试
npm test

# WDIO 测试
npm run wdio

# 手动测试分区扫描
node test-partition-scanning.js
```

## 常见问题

### Q: 为什么要分区烧录而不是整盘烧录?

A: 分区烧录允许:
- 多系统共存于同一设备
- 保留其他分区的数据
- 更灵活的存储管理

### Q: 能烧录 macOS 镜像吗?

A: 可以,但需要注意:
- macOS 镜像通常是 .dmg 或 .app 格式
- 可能需要转换或准备
- 建议使用 APFS/HFS+ 文件系统

### Q: 会破坏其他分区吗?

A: 不会。分区模式只写入到选定分区的数据区域,不影响:
- 分区表
- 其他分区
- 其他分区的数据

### Q: 如何实现多系统引导?

A: 需要引导管理器:
- **Clover**: 传统 macOS 引导
- **OpenCore**: 现代 macOS 引导(推荐)
- **GRUB**: Linux/Windows
- **Ventoy**: 简单的多系统方案

### Q: Windows 上如何测试?

A:
```powershell
# 以管理员身份运行 PowerShell
node test-partition-scanning.js

# 查看特定磁盘
node test-partition-scanning.js \\.\PhysicalDrive1
```

## 已知问题

### 1. Windows 分区大小不完整
- **问题**: diskpart 只返回分区编号,不返回详细大小
- **影响**: Windows 上无法显示分区大小
- **解决**: 需要执行额外的 diskpart 命令

### 2. macOS 分区大小解析
- **问题**: diskutil 输出格式复杂,需要改进正则
- **影响**: macOS 上分区大小可能不准确
- **解决**: 增强正则表达式或使用更可靠的解析

### 3. 分区大小显示可能不完整
- **问题**: 部分平台(特别是Windows)的分区大小检测可能不完整
- **影响**: UI上显示的分区大小可能为0或默认值
- **解决**: 需要改进分区扫描命令

### 4. 需要添加国际化
- **问题**: 当前分区模式的文本是硬编码的英文
- **影响**: 非英语用户无法看到本地化的提示
- **解决**: 需要在 `lib/gui/app/i18n/` 添加翻译

## 贡献指南

如果你想帮助完善此功能,欢迎:

### 优先任务
1. 添加国际化支持
2. 完善分区大小检测(特别是Windows)
3. 添加单元测试
4. 测试不同平台的功能
5. 实际测试多系统U盘创建流程

### 代码规范
- 遵循项目的 TypeScript 规范
- 遵循项目的代码风格
- 添加适当的注释和文档

### 提交流程
1. Fork 本仓库
2. 创建新分支: `feature/partition-mode`
3. 提交你的更改
4. 推送到你的 fork
5. 创建 Pull Request

## 许可证

本功能遵循 Etcher 的 Apache License 2.0 许可证。

---

**注意**: 此功能仍处于开发阶段,生产环境使用前请充分测试!
