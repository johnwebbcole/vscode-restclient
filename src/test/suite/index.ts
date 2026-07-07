import Mocha from 'mocha';
import * as path from 'path';

export function run(): Promise<void> {
    const mocha = new Mocha({
        ui: 'tdd',
        timeout: 15000
    });

    mocha.addFile(path.resolve(__dirname, './extension.test.js'));

    return new Promise((resolve, reject) => {
        mocha.run(failures => {
            if (failures > 0) {
                reject(new Error(`${failures} tests failed.`));
            } else {
                resolve();
            }
        });
    });
}
