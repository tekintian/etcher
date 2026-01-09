# Drive Selector UI Changes for Partition Support

## File: lib/gui/app/components/drive-selector/drive-selector.tsx

### 1. Add toggleExpandDrive and selectPartition methods

Add these methods to the DriveSelector class:

```typescript
private toggleExpandDrive(device: string) {
	const expandedDrives = new Set(this.state.expandedDrives);
	if (expandedDrives.has(device)) {
		expandedDrives.delete(device);
	} else {
		expandedDrives.add(device);
	}
	this.setState({ expandedDrives });
}

private selectPartition(drive: DrivelistDrive, partition: DrivePartition) {
	if (this.props.onSelect) {
		this.props.onSelect({
			...drive,
			selectedPartition: partition,
		});
	}
}
```

### 2. Modify the first table column to support partition expansion

Replace the entire first table column (field: 'description') in the tableColumns array:

```typescript
{
	field: 'description',
	label: i18next.t('drives.name'),
	render: (description: string, drive: Drive) => {
		if (isDrivelistDrive(drive)) {
			const isLargeDrive = isDriveSizeLarge(drive);
			const hasWarnings =
				this.props.showWarnings && (isLargeDrive || drive.isSystem);
			const hasPartitions = drive.partitions && drive.partitions.length > 0;
			const isExpanded = this.state.expandedDrives.has(drive.device);

			return (
				<Flex flexDirection="column">
					<Flex alignItems="center">
						{hasPartitions && (
							<button
								onClick={(e) => {
									e.stopPropagation();
									this.toggleExpandDrive(drive.device);
								}}
								style={{
									marginRight: '8px',
									background: 'none',
									border: 'none',
									cursor: 'pointer',
									fontSize: '12px',
								}}
							>
								{isExpanded ? '▼' : '▶'}
							</button>
						)}
						{hasWarnings && (
							<ExclamationTriangleSvg
								height="1em"
								fill={drive.isSystem ? '#fca321' : '#8f9297'}
							/>
						)}
						<Txt ml={(hasWarnings && 8) || 0}>
							{middleEllipsis(description, 32)}
						</Txt>
					</Flex>

					{isExpanded && hasPartitions && (
						<div
							style={{
								marginLeft: '24px',
								marginTop: '8px',
								padding: '8px',
								backgroundColor: '#f5f5f5',
								borderRadius: '4px',
							}}
						>
							{drive.partitions!.map((partition) => (
								<Flex
									key={partition.index}
									alignItems="center"
									py={1}
									style={{
										padding: '4px 0',
										borderBottom: '1px solid #e0e0e0',
									}}
								>
									<Txt fontSize={12} mr={2} style={{ width: '80px' }}>
										Partition {partition.index}
									</Txt>
									{partition.label && (
										<Txt fontSize={12} mr={2}>
											({partition.label})
										</Txt>
									)}
									{partition.fileSystem && (
										<Txt fontSize={12} color="#666" mr={2}>
											{partition.fileSystem}
										</Txt>
									)}
									{partition.size > 0 && (
										<Txt fontSize={12} color="#666">
											{prettyBytes(partition.size)}
										</Txt>
									)}
									<button
										style={{
											marginLeft: 'auto',
											padding: '4px 12px',
											fontSize: '12px',
											cursor: 'pointer',
											backgroundColor: '#1496e1',
											color: 'white',
											border: 'none',
											borderRadius: '4px',
										}}
										onClick={(e) => {
											e.stopPropagation();
											this.selectPartition(drive, partition);
										}}
									>
										Select
									</button>
								</Flex>
							))}
						</div>
					)}
				</Flex>
			);
		}
		return <Txt>{description}</Txt>;
	},
},
```

### 3. Add partition mode toggle to the render method

Find the `render()` method in the DriveSelector class, and after the `titleElement` prop, add the partition mode toggle before the table:

```typescript
render() {
	const { cancel, done, ...props } = this.props;
	const { selectedList, drives, image, missingDriversModal, expandedDrives, partitionMode } =
		this.state;

	const displayedDrives = this.getDisplayedDrives(drives);
	const disabledDrives = this.getDisabledDrives(drives, image);
	const numberOfSystemDrives = drives.filter(isSystemDrive).length;
	const numberOfDisplayedSystemDrives = displayedDrives.filter(isSystemDrive).length;
	const numberOfHiddenSystemDrives = numberOfSystemDrives - numberOfDisplayedSystemDrives;
	const hasSystemDrives = selectedList.filter(isSystemDrive).length;
	const showWarnings = this.props.showWarnings && hasSystemDrives;

	return (
		<Modal
			titleElement={
				<Flex alignItems="baseline" mb={18}>
					<Txt fontSize={24} align="left">
						{this.props.titleLabel}
					</Txt>
					<Txt
						fontSize={11}
						ml={12}
						color="#5b82a7"
						style={{ fontWeight: 600 }}
					>
						{i18next.t('drives.find', { length: drives.length })}
					</Txt>
				</Flex>
			}
			titleDetails={<Txt fontSize={11}>{getDrives().length} found</Txt>}
			cancel={() => cancel(this.originalList)}
			done={() => done(selectedList)}
			action={i18next.t('drives.select', { select: selectedList.length })}
			primaryButtonProps={{
				primary: !showWarnings,
				warning: showWarnings,
				disabled: !hasAvailableDrives(),
			}}
			{...props}
		>
			{/* Partition mode toggle */}
			<Flex mb={3} alignItems="center">
				<input
					type="checkbox"
					id="partitionMode"
					checked={partitionMode}
					onChange={(e) =>
						this.setState({ partitionMode: e.target.checked })
					}
					style={{ cursor: 'pointer' }}
				/>
				<label
					htmlFor="partitionMode"
					style={{ marginLeft: '8px', cursor: 'pointer' }}
				>
					Partition Mode
				</label>
			</Flex>

			{/* Warning for partition mode */}
			{partitionMode && (
				<Alert style={{ marginBottom: '20px' }}>
					<Txt fontSize={14}>
						⚠️ Partition Mode:
						<br />
						• Image will be written to selected partition only
						<br />
						• Partition table will not be modified
						<br />
						• Ensure partition is large enough for the image
						<br />
						• Some ISO images may not support partition writing
					</Txt>
				</Alert>
			)}

			{!hasAvailableDrives() ? (
				// ... existing empty drives UI ...
			) : (
				<>
					<DrivesTable
						// ... existing table props ...
					/>
					{/* ... existing show system drives link ... */}
				</>
			)}

			{/* ... existing missing drivers modal and system drive alert ... */}
		</Modal>
	);
}
```

### 4. Update types to include selectedPartition

In the file, add this type definition at the top with other interfaces:

```typescript
interface DrivelistDriveWithPartition extends DrivelistDrive {
	selectedPartition?: DrivePartition;
}
```

Then update the `onSelect` callback type in DriveSelectorProps:

```typescript
export interface DriveSelectorProps
	extends Omit<ModalProps, 'done' | 'cancel' | 'onSelect'> {
	write: boolean;
	multipleSelection: boolean;
	showWarnings?: boolean;
	cancel: (drives: DrivelistDrive[]) => void;
	done: (drives: DrivelistDrive[]) => void;
	titleLabel: string;
	emptyListLabel: string;
	emptyListIcon: JSX.Element;
	selectedList?: DrivelistDrive[];
	updateSelectedList?: () => DrivelistDrive[];
	onSelect?: (drive: DrivelistDrive | DrivelistDriveWithPartition) => void;
}
```
