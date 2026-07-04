import * as crypto from 'crypto';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import * as fs from 'fs';
import { EOL, tmpdir } from 'os';
import * as path from 'path';
import { QuickPickItem, window, workspace } from 'vscode';
import { HistoricalHttpRequest } from '../models/httpRequest';
import { trace } from "../utils/decorator";
import { ensureFile } from '../utils/fsUtility';
import { formatHeaders } from '../utils/misc';
import { UserDataManager } from '../utils/userDataManager';

dayjs.extend(relativeTime);

export class HistoryController {
    public constructor() {
    }

    @trace('History')
    public async save() {
        const requests = await UserDataManager.getRequestHistory();
        if (requests.length === 0) {
            window.showInformationMessage("No request history items are found!");
            return;
        }

        const itemPickList = requests.map(request => {
            const item: QuickPickItem & { rawRequest: HistoricalHttpRequest } = {
                label: `${request.method.toUpperCase()} ${request.url}`,
                rawRequest: request
            };
            if (typeof request.body === 'string' && request.body.length > 0) {
                item.description = `${request.body.length} body bytes`;
            }
            if (request.startTime) {
                item.detail = `${dayjs().to(request.startTime)}`;
            }
            return item;
        });

        const item = await window.showQuickPick(itemPickList, { placeHolder: "" });
        if (!item) {
            return;
        }
        const path = await this.createRequestInTempFile(item.rawRequest);
        const document = await workspace.openTextDocument(path);
        await window.showTextDocument(document);
    }

    @trace('Clear History')
    public async clear() {
        const btn = await window.showInformationMessage(
            'Do you really want to clear request history?',
            { title: 'Yes' },
            { title: 'No' });
        if (btn?.title === 'Yes') {
            await UserDataManager.clearRequestHistory();
            window.showInformationMessage('Request history has been cleared');
        }
    }

    private async createRequestInTempFile(request: HistoricalHttpRequest): Promise<string> {
        const file = await this.createTempFile();
        let output = `${request.method.toUpperCase()} ${request.url}${EOL}`;
        output += formatHeaders(request.headers);
        if (request.body) {
            output += `${EOL}${request.body}`;
        }
        await fs.promises.writeFile(file, output);
        return file;
    }

    private async createTempFile(): Promise<string> {
        const file = path.join(tmpdir(), `vscode-restclient-${crypto.randomUUID()}.http`);
        await ensureFile(file);
        return file;
    }

    public dispose() {
    }
}