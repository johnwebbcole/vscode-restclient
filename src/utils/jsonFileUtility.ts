import * as fs from 'fs';
import { ensureFile } from './fsUtility';

export class JsonFileUtility {
    public static async serializeToFile<T>(path: string, data: T): Promise<void> {
        await ensureFile(path);
        await fs.promises.writeFile(path, JSON.stringify(data));
    }

    public static async deserializeFromFile<T>(path: string): Promise<T | undefined>;
    public static async deserializeFromFile<T>(path: string, defaultValue: T): Promise<T>;
    public static async deserializeFromFile<T>(path: string, defaultValue?: T): Promise<T | undefined> {
        try {
            return JSON.parse(await fs.promises.readFile(path, 'utf8'));
        } catch {
            return defaultValue;
        }
    }
}
