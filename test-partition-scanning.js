#!/usr/bin/env node

/**
 * Quick test script for partition scanning functionality
 *
 * Usage:
 *   node test-partition-scanning.js [device]
 *
 * Examples:
 *   node test-partition-scanning.js               # List all available drives
 *   node test-partition-scanning.js /dev/sda       # Get partitions for /dev/sda (Linux)
 *   node test-partition-scanning.js \\.\PhysicalDrive1 # Get partitions (Windows)
 */

const { platform } = require('process');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

async function listAllDrives() {
	console.log('📦 Listing all available drives...\n');

	if (platform === 'win32') {
		const { stdout } = await execAsync('wmic diskdrive get deviceid,model,size');
		console.log('Windows Drives:');
		console.log(stdout);
	} else if (platform === 'darwin') {
		const { stdout } = await execAsync('diskutil list');
		console.log('macOS Drives:');
		console.log(stdout);
	} else if (platform === 'linux') {
		const { stdout } = await execAsync('lsblk -d -o NAME,SIZE,MODEL');
		console.log('Linux Drives:');
		console.log(stdout);
	}
}

async function getPartitions(device) {
	console.log(`\n🔍 Getting partitions for: ${device}\n`);

	try {
		if (platform === 'win32') {
			// Extract disk number
			const diskNumber = device.match(/PhysicalDrive(\d+)/)?.[1];
			if (!diskNumber) {
				console.error('❌ Invalid device format for Windows');
				return;
			}

			console.log('🪟 Using diskpart to list partitions...');
			const script = `select disk ${diskNumber}\nlist partition`;
			const { stdout } = await execAsync(`echo "${script}" | diskpart /s -`);

			console.log('\n📋 Partitions found:');
			console.log(stdout);

			// Additional detail for first partition
			const detailScript = `select disk ${diskNumber}\nselect partition 1\ndetail partition`;
			try {
				const { stdout: detailOut } = await execAsync(
					`echo "${detailScript}" | diskpart /s -`,
				);
				console.log('\n📊 Partition 1 Details:');
				console.log(detailOut);
			} catch (err) {
				console.log('\n⚠️  Could not get partition details');
			}

		} else if (platform === 'darwin') {
			console.log('🪟 Using diskutil to list partitions...');
			const { stdout } = await execAsync(`diskutil list ${device}`);

			console.log('\n📋 Partitions found:');
			console.log(stdout);

		} else if (platform === 'linux') {
			console.log('🪟 Using lsblk to list partitions...');
			const { stdout } = await execAsync(
				`lsblk -p -b -n -o NAME,SIZE,TYPE,FSTYPE,LABEL,MOUNTPOINT ${device}`,
			);

			console.log('\n📋 Partitions found:');
			console.log(stdout);

			// Try to get more details using fdisk
			try {
				const { stdout: fdiskOut } = await execAsync(`sudo fdisk -l ${device}`);
				console.log('\n📊 fdisk details:');
				console.log(fdiskOut);
			} catch (err) {
				console.log('\n⚠️  Could not run fdisk (may need sudo)');
			}
		}

		console.log('\n✅ Partition scan completed!\n');

	} catch (error) {
		console.error('❌ Error scanning partitions:', error.message);
		process.exit(1);
	}
}

// Main
async function main() {
	const args = process.argv.slice(2);

	if (args.length === 0) {
		// List all drives
		await listAllDrives();
		console.log('\n💡 To scan a specific device, run:');
		console.log(`   node ${process.argv[1]} <device-path>`);
		console.log('');
		console.log('Examples:');
		if (platform === 'win32') {
			console.log(`   node ${process.argv[1]} \\\\.\\PhysicalDrive1`);
		} else if (platform === 'darwin') {
			console.log(`   node ${process.argv[1]} /dev/disk0`);
		} else {
			console.log(`   node ${process.argv[1]} /dev/sda`);
		}

	} else if (args.length === 1) {
		// Get partitions for specific device
		await getPartitions(args[0]);

	} else {
		console.error('❌ Too many arguments!');
		console.log('Usage: node test-partition-scanning.js [device]');
		process.exit(1);
	}
}

// Run
main().catch((error) => {
	console.error('❌ Fatal error:', error);
	process.exit(1);
});
