import * as fs from 'fs';
import * as path from 'path';

export async function pathExists(target: string): Promise<boolean> {
    try {
        await fs.promises.access(target);
        return true;
    } catch {
        return false;
    }
}

export async function ensureFile(filePath: string): Promise<void> {
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    try {
        await fs.promises.writeFile(filePath, '', { flag: 'wx' });
    } catch (error: any) {
        if (error.code !== 'EEXIST') {
            throw error;
        }
    }
}
