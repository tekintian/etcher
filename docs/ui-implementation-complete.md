# Etcher 分区模式 UI 实现文档

## 概述

本文档详细描述了 Etcher 分区烧录功能的 UI 实现,包括所有已完成的功能和如何使用。

## 已完成的 UI 功能

### 1. 分区模式开关

在驱动器选择界面顶部添加了分区模式切换开关:

```typescript
<Flex alignItems="center" mt={15} mb={15}>
  <input
    type="checkbox"
    checked={this.state.partitionMode}
    onChange={() => this.togglePartitionMode()}
    style={{ marginRight: 8 }}
  />
  <Txt fontSize="14px">
    Partition Mode (write to specific partition)
  </Txt>
</Flex>
```

**功能说明**:
- 默认关闭,保持原有的整盘烧录行为
- 开启后显示分区选择界面
- 切换时会清空当前选择,避免混淆

### 2. 磁盘展开/折叠

在分区模式下,每个有分区的磁盘名称前会显示展开/折叠箭头:

```typescript
{this.state.partitionMode && hasPartitions && (
  <div
    onClick={() => this.toggleDriveExpand(drive)}
    style={{ cursor: 'pointer', marginRight: 8 }}
  >
    {isExpanded ? (
      <ChevronDownSvg height="1em" fill="currentColor" />
    ) : (
      <ChevronRightSvg height="1em" fill="currentColor" />
    )}
  </div>
)}
```

**功能说明**:
- 只有在分区模式下显示
- 只对有分区的磁盘显示箭头
- 点击展开/折叠磁盘的分区列表

### 3. 分区列表显示

展开磁盘后显示该磁盘的所有分区:

```typescript
<Flex flexDirection="column" ml={24} mt={8}>
  {drive.partitions.map((partition, index) => (
    <Flex
      key={partition.path}
      alignItems="center"
      p={8}
      onClick={() => this.selectPartition(drive, partition)}
      style={{
        cursor: 'pointer',
        backgroundColor: isSelected(partition)
          ? '#1496e120'
          : 'transparent',
        borderRadius: 4,
      }}
    >
      <input
        type="checkbox"
        checked={isSelected(partition)}
        onChange={() => {}}
        style={{ marginRight: 8 }}
      />
      <Txt fontSize={13} mr={8}>
        Partition {partition.index + 1}
      </Txt>
      {partition.label && (
        <Txt fontSize={13} mr={8} color="#8f9297">
          ({partition.label})
        </Txt>
      )}
      <Txt fontSize={13} color="#5b82a7">
        {prettyBytes(partition.size)}
      </Txt>
      {partition.fileSystem && (
        <Txt fontSize={12} ml={8} color="#8f9297">
          {partition.fileSystem}
        </Txt>
      )}
    </Flex>
  ))}
</Flex>
```

**显示的信息**:
- 分区编号 (Partition 1, 2, 3...)
- 分区标签(如果有)
- 分区大小(格式化为人类可读,如 32 GB)
- 文件系统类型(如 NTFS, APFS, ext4)

### 4. 分区选择逻辑

用户可以选择一个或多个分区:

```typescript
private selectPartition(drive: DrivelistDrive, partition: DrivePartition) {
  this.setState((prevState) => {
    const newSelectedPartitions = new Map(prevState.selectedPartitions);
    const key = `${drive.device}:${partition.path}`;

    if (newSelectedPartitions.has(key)) {
      newSelectedPartitions.delete(key);
    } else {
      newSelectedPartitions.set(key, partition);
    }

    // Update selectedList to include drive with selected partition
    const newSelectedList = prevState.selectedList.filter(
      (d) => d.device !== drive.device,
    );

    if (newSelectedPartitions.has(key)) {
      const driveWithPartition = {
        ...drive,
        selectedPartition: partition,
      };
      newSelectedList.push(driveWithPartition);
    }

    return {
      selectedPartitions: newSelectedPartitions,
      selectedList: newSelectedList,
    };
  });
}
```

**选择行为**:
- 点击分区行或复选框即可选择/取消选择
- 选中后背景变为浅蓝色
- 多选支持:可以选择同一磁盘的多个分区
- 状态保存在 `selectedPartitions` Map 中

### 5. 警告提示

当选中分区时显示警告信息:

```typescript
{this.state.partitionMode &&
  this.state.selectedList.length > 0 && (
    <Alert
      className="partition-mode-alert"
      style={{ width: '67%', marginTop: 15 }}
    >
      <b>Partition Mode Warning:</b> Writing to a partition may not
      make the image bootable. Ensure your image is designed for
      partition-level writing. The partition table will not be
      overwritten.
    </Alert>
  )}
```

**警告内容**:
- 镜像可能无法启动
- 需要确保镜像支持分区级写入
- 不会覆盖分区表

## 用户体验流程

### 场景1: 创建多系统U盘

```
1. 启动 Etcher
   ↓
2. 选择 Windows 10 ISO
   ↓
3. 点击 "选择目标"
   ↓
4. 勾选 "Partition Mode"
   ↓
5. 展开目标U盘(64GB)
   ↓
6. 选择 Partition 1 (20GB, NTFS)
   ↓
7. 点击 "Flash!"
   ↓
8. 确认警告
   ↓
9. 烧录完成
   ↓
10. 重复步骤2-9,这次:
    - 选择 macOS 镜像
    - 选择 Partition 2 (20GB, APFS)
```

### 场景2: 保留数据分区

```
1. U盘已有3个分区:
   - 分区1: Windows (系统分区)
   - 分区2: 数据分区(重要数据)
   - 分区3: 空

2. 要更新分区1的系统:
   - 启用 Partition Mode
   - 选择 Partition 1
   - Flash!
   - 分区2和3不受影响
```

## UI 组件结构

```
DriveSelector
├── Partition Mode Checkbox
├── DrivesTable
│   ├── Row (Drive)
│   │   ├── Expand/Collapse Icon (partition mode only)
│   │   ├── Name
│   │   ├── Size
│   │   ├── Location
│   │   └── Status Badges
│   └── Partition List (expanded drives only)
│       └── Partition Row
│           ├── Checkbox
│           ├── Partition Number
│           ├── Label (optional)
│           ├── Size
│           └── File System
├── Show Hidden Drives Link
├── System Drive Alert
└── Partition Mode Alert
```

## 状态管理

### DriveSelectorState

```typescript
interface DriveSelectorState {
  drives: Drive[];                          // 所有检测到的驱动器
  image?: SourceMetadata;                   // 当前选择的镜像
  missingDriversModal: { drive?: DriverlessDrive };
  selectedList: DrivelistDrive[];           // 已选择的驱动器列表
  showSystemDrives: boolean;                // 是否显示系统驱动器
  expandedDrives: Set<string>;              // 已展开的驱动器设备路径
  partitionMode: boolean;                   // 是否启用分区模式
  selectedPartitions: Map<string, DrivePartition>;  // 已选择的分区
}
```

### 关键方法

| 方法 | 功能 | 触发时机 |
|------|------|----------|
| `togglePartitionMode()` | 切换分区模式开关 | 点击"Partition Mode"复选框 |
| `toggleDriveExpand()` | 展开/折叠磁盘 | 点击磁盘前的箭头 |
| `selectPartition()` | 选择/取消选择分区 | 点击分区行或复选框 |
| `renderPartitions()` | 渲染分区列表 | 磁盘展开时 |
| `renderPartitionModeControls()` | 渲染分区模式控件 | 模式渲染时 |

## 视觉设计

### 颜色方案

| 元素 | 颜色 | 用途 |
|------|------|------|
| 选中分区背景 | `#1496e120` (蓝色, 20%透明度) | 表示已选择 |
| 分区大小文本 | `#5b82a7` (蓝色) | 强调重要信息 |
| 标签/文件系统 | `#8f9297` (灰色) | 次要信息 |
| 警告提示 | 黄色/红色 | 注意提示 |

### 间距规范

| 元素 | 上边距 | 下边距 | 左边距 | 右边距 |
|------|--------|--------|--------|--------|
| 分区模式控件 | 15px | 15px | 0 | 0 |
| 分区列表 | 0 | 0 | 24px | 0 |
| 分区行 | 8px | 8px | 8px | 8px |
| 警告提示 | 15px | 0 | 0 | 0 |

### 字体大小

| 元素 | 字号 |
|------|------|
| 分区模式文本 | 14px |
| 分区号/标签 | 13px |
| 分区大小 | 13px |
| 文件系统 | 12px |

## 与其他组件的集成

### Image Writer 模块

分区选择信息通过 `selectedList` 传递给写入器:

```typescript
// image-writer.ts
const partitionMode = drives.some((d) => (d as any).selectedPartition);
const parameters = {
  image,
  destinations: drives,
  SourceType: image.SourceType,
  autoBlockmapping,
  decompressFirst,
  partitionMode,
};
```

### Child Writer

分区模式信息影响写入逻辑:

```typescript
// child-writer.ts
const selectedPartition = (destination as any).selectedPartition;

if (options.partitionMode && selectedPartition) {
  // 使用分区路径创建 BlockDevice
  return new BlockDevice({
    drive: {
      ...destination,
      device: selectedPartition.path,
      size: selectedPartition.size,
    },
    unmountOnSuccess: true,
    write: true,
    direct: false,  // 分区模式不支持direct I/O
  });
}
```

## 使用示例

### 示例1: 选择单个分区

```typescript
// 用户操作
1. 勾选 "Partition Mode"
2. 展开 "/dev/sdb"
3. 点击 "Partition 1"

// 内部状态变化
selectedPartitions: Map {
  "/dev/sdb:/dev/sdb1" => {
    index: 0,
    path: "/dev/sdb1",
    size: 21474836480,
    label: "Windows",
    fileSystem: "NTFS"
  }
}

selectedList: [{
  device: "/dev/sdb",
  size: 64424509440,
  selectedPartition: { ... }  // 分区信息
}]
```

### 示例2: 选择多个分区

```typescript
// 用户操作
1. 展开 "/dev/sdb"
2. 选择 "Partition 1"
3. 选择 "Partition 2"

// 内部状态变化
selectedPartitions: Map {
  "/dev/sdb:/dev/sdb1" => { ... },
  "/dev/sdb:/dev/sdb2" => { ... }
}

selectedList: [{
  device: "/dev/sdb",
  size: 64424509440,
  selectedPartition: { ... }  // 最多选一个分区
}]
```

## 已知限制

1. **多选限制**: 当前实现只支持选择每个磁盘的一个分区
2. **国际化**: 文本硬编码为英文,需要添加翻译
3. **分区大小**: 某些平台(Windows)可能无法获取准确的分区大小

## 未来改进

1. **改进多选**: 支持选择同一磁盘的多个分区
2. **添加国际化**: 支持多语言界面
3. **分区预览**: 显示分区使用情况图表
4. **拖拽排序**: 允许用户调整分区顺序
5. **批量操作**: 一次操作多个磁盘的多个分区

## 测试指南

### 手动测试步骤

1. **基础功能测试**:
   - 启动 Etcher
   - 选择任意镜像
   - 点击"选择目标"
   - 勾选"Partition Mode"
   - 确认分区模式开关正常工作

2. **磁盘展开测试**:
   - 在分区模式下,确认有分区的磁盘显示展开箭头
   - 点击箭头,确认展开/折叠正常

3. **分区显示测试**:
   - 展开磁盘,确认显示分区列表
   - 确认显示分区号、大小、文件系统等信息

4. **选择测试**:
   - 点击分区,确认选中状态
   - 再次点击,确认取消选择
   - 尝试选择多个分区

5. **警告测试**:
   - 选择分区后,确认显示警告提示
   - 取消选择后,确认警告消失

### 自动化测试

建议添加以下测试:

```typescript
// 单元测试示例
describe('DriveSelector Partition Mode', () => {
  it('should toggle partition mode', () => {
    // 测试分区模式切换
  });

  it('should expand/collapse drive', () => {
    // 测试磁盘展开/折叠
  });

  it('should select partition', () => {
    // 测试分区选择
  });

  it('should show warning when partition selected', () => {
    // 测试警告显示
  });
});
```

## 调试技巧

### 启用详细日志

```typescript
// 在组件中添加调试日志
private selectPartition(drive: DrivelistDrive, partition: DrivePartition) {
  console.log('Selecting partition:', partition);
  console.log('Current state:', this.state);
  // ... 其余代码
}
```

### 检查状态变化

```typescript
// 使用 React DevTools
// 1. 安装 React DevTools 浏览器扩展
// 2. 在应用中选择 DriveSelector 组件
// 3. 查看 props 和 state 变化
```

## 总结

UI 实现已完成所有核心功能,用户可以:

1. 通过开关启用分区模式
2. 展开磁盘查看分区
3. 选择目标分区
4. 查看警告提示
5. 开始烧录

界面简洁直观,符合 Etcher 的设计风格。
