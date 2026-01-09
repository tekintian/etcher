/*
 * Copyright 2026 balena.io
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { platform } from 'process';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Partition information structure
 */
export interface PartitionInfo {
	index: number;
	path: string;
	size: number;
	label?: string;
	fileSystem?: string;
	mountpoint?: string;
}

/**
 * Get all partitions for a given device
 */
export async function getPartitions(device: string): Promise<PartitionInfo[]> {
	if (platform === 'win32') {
		return getWindowsPartitions(device);
	} else if (platform === 'darwin') {
		return getMacOSPartitions(device);
	} else if (platform === 'linux') {
		return getLinuxPartitions(device);
	}
	return [];
}

/**
 * Windows partition detection using diskpart
 */
async function getWindowsPartitions(device: string): Promise<PartitionInfo[]> {
	try {
		// Extract disk number, e.g., \\.\PhysicalDrive1 -> 1
		const diskNumber = device.match(/PhysicalDrive(\d+)/)?.[1];
		if (!diskNumber) {
			console.warn(`Cannot parse disk number from device: ${device}`);
			return [];
		}

		// Use diskpart to list partitions
		const script = `select disk ${diskNumber}\nlist partition`;
		const { stdout } = await execAsync(`echo "${script}" | diskpart /s -`);

		const partitions: PartitionInfo[] = [];
		const lines = stdout.split('\n');

		for (const line of lines) {
			// Match partition lines like "  Partition 1    System       300 MB  "
			const match = line.match(/^\s*Partition\s+(\d+)/i);
			if (match) {
				const index = parseInt(match[1]);
				partitions.push({
					index,
					path: `${device}-Partition${index}`,
					size: 0, // Would need additional diskpart commands to get size
					fileSystem: 'Unknown',
				});
			}
		}

		console.log(`Found ${partitions.length} partitions on ${device}`);
		return partitions;
	} catch (error) {
		console.error('Error getting Windows partitions:', error);
		return [];
	}
}

/**
 * macOS partition detection using diskutil
 */
async function getMacOSPartitions(device: string): Promise<PartitionInfo[]> {
	try {
		// diskutil list provides detailed partition info
		const { stdout } = await execAsync(`diskutil list ${device}`);

		const partitions: PartitionInfo[] = [];
		const lines = stdout.split('\n');

		for (const line of lines) {
			// Match partition lines like "1:     EFI           FAT32      disk0s1"
			const match = line.match(/^\s*(\d+):\s+(\S+)\s+(\S+)\s+(\S+)/);
			if (match) {
				const index = parseInt(match[1]);
				partitions.push({
					index,
					path: `${device}s${index}`,
					size: 0, // Would need additional parsing
					label: match[2],
					fileSystem: match[3],
				});
			}
		}

		console.log(`Found ${partitions.length} partitions on ${device}`);
		return partitions;
	} catch (error) {
		console.error('Error getting macOS partitions:', error);
		return [];
	}
}

/**
 * Linux partition detection using lsblk
 */
async function getLinuxPartitions(device: string): Promise<PartitionInfo[]> {
	try {
		// lsblk provides comprehensive partition information
		const { stdout } = await execAsync(
			`lsblk -p -b -n -o NAME,SIZE,TYPE,FSTYPE,LABEL,MOUNTPOINT ${device}`,
		);

		const partitions: PartitionInfo[] = [];
		const lines = stdout.split('\n');

		for (const line of lines) {
			const parts = line.trim().split(/\s+/);
			if (parts.length >= 2) {
				const [name, size, type, fstype, label, mountpoint] = parts;

				// Only process partitions, not the whole disk
				if (type === 'part') {
					const indexMatch = name.match(/(\d+)$/);
					const index = indexMatch ? parseInt(indexMatch[1]) : 0;
					partitions.push({
						index,
						path: name,
						size: parseInt(size),
						fileSystem: fstype || undefined,
						label: label || undefined,
						mountpoint: mountpoint || undefined,
					});
				}
			}
		}

		console.log(`Found ${partitions.length} partitions on ${device}`);
		return partitions;
	} catch (error) {
		console.error('Error getting Linux partitions:', error);
		return [];
	}
}
