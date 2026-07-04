import * as fs from 'fs-extra';
import * as path from 'path';
import { ConfigurationTarget, env, Uri, window, workspace } from 'vscode';
import * as Constants from '../common/constants';
import { EnvironmentController } from './environmentController';
import { IRestClientSettings, RequestSettings, RestClientSettings, SystemSettings } from '../models/configurationSettings';
import { HttpRequest } from '../models/httpRequest';
import {
    PostmanCollection,
    PostmanEnvironment,
    PostmanVariable
} from '../models/postmanCollection';
import { RequestMetadata } from '../models/requestMetadata';
import { RequestParserFactory } from '../models/requestParserFactory';
import { SelectedRequest } from '../models/SelectedRequest';
import {
    buildCollectionFromHttpRequests,
    buildPostmanEnvironment,
    collectionToHttpFileContent,
    environmentToVariableMap,
    isPostmanCollection,
    isPostmanEnvironment
} from '../utils/postmanConverter';
import { Selector } from '../utils/selector';
import { getCurrentTextDocument } from '../utils/workspaceUtility';

export class PostmanController {
    public async exportRequestAsPostman() {
        const editor = window.activeTextEditor;
        const document = getCurrentTextDocument();
        if (!editor || !document) {
            return;
        }

        const block = Selector.getRequestBlockAt(document, editor.selection.active.line);
        if (!block) {
            window.showErrorMessage('No request found at the cursor position.');
            return;
        }

        const request = await this.parseHttpRequest(block);
        const variables = this.getFileVariables(document.getText());
        const collection = buildCollectionFromHttpRequests(
            request.name ?? path.basename(document.fileName),
            [{ name: request.name ?? 'Request', request }],
            variables
        );

        await env.clipboard.writeText(JSON.stringify(collection, null, 2));
        window.showInformationMessage('Postman collection copied to clipboard.');
    }

    public async exportFileAsPostman(uri?: Uri) {
        const document = uri ? await workspace.openTextDocument(uri) : getCurrentTextDocument();
        if (!document) {
            window.showErrorMessage('No .http file to export.');
            return;
        }

        const blocks = Selector.getAllRequestBlocks(document);
        if (blocks.length === 0) {
            window.showErrorMessage('No requests found in this file.');
            return;
        }

        const requests = await Promise.all(blocks.map(block => this.parseHttpRequest(block)));
        const variables = this.getFileVariables(document.getText());
        const baseName = path.basename(document.fileName, path.extname(document.fileName));
        const collection = buildCollectionFromHttpRequests(
            baseName,
            requests.map((request, index) => ({ name: request.name ?? `Request ${index + 1}`, request })),
            variables
        );

        const defaultUri = Uri.file(path.join(path.dirname(document.fileName), `${baseName}.postman_collection.json`));
        const saveUri = await window.showSaveDialog({
            defaultUri,
            filters: { 'Postman Collection': ['json'] }
        });
        if (!saveUri) {
            return;
        }

        await fs.writeFile(saveUri.fsPath, JSON.stringify(collection, null, 2), 'utf8');
        window.showInformationMessage(`Postman collection exported to ${path.basename(saveUri.fsPath)}.`);

        await this.maybeExportEnvironment(document.fileName);
    }

    public async importPostmanCollection(uri?: Uri) {
        const sourceUri = uri ?? (await window.showOpenDialog({
            canSelectMany: false,
            openLabel: 'Import',
            filters: { 'Postman files': ['json'] }
        }))?.[0];

        if (!sourceUri) {
            return;
        }

        let json: any;
        try {
            const content = await fs.readFile(sourceUri.fsPath, 'utf8');
            json = JSON.parse(content);
        } catch (error) {
            window.showErrorMessage(`Unable to read or parse "${path.basename(sourceUri.fsPath)}": ${error.message}`);
            return;
        }

        if (isPostmanCollection(json)) {
            await this.importCollection(json);
        } else if (isPostmanEnvironment(json)) {
            await this.importEnvironment(json);
        } else {
            window.showErrorMessage(`"${path.basename(sourceUri.fsPath)}" is not a recognized Postman Collection or Environment file.`);
        }
    }

    private async importCollection(collection: PostmanCollection) {
        const httpContent = collectionToHttpFileContent(collection);
        const newFile = await workspace.openTextDocument({ content: httpContent, language: 'http' });
        window.showTextDocument(newFile);
    }

    private async importEnvironment(postmanEnvironment: PostmanEnvironment) {
        const environmentName = await window.showInputBox({
            prompt: 'Environment name',
            value: postmanEnvironment.name
        });
        if (!environmentName) {
            return;
        }

        const target = await window.showQuickPick(
            [
                { label: 'Global', description: 'Available in every workspace', target: ConfigurationTarget.Global },
                { label: 'Workspace', description: 'Available only in this workspace', target: ConfigurationTarget.Workspace }
            ],
            { placeHolder: 'Where should this environment be saved?' }
        );
        if (!target) {
            return;
        }

        const configuration = workspace.getConfiguration('rest-client');
        const existingEnvironments = configuration.get<{ [name: string]: { [key: string]: string } }>('environmentVariables') ?? {};
        const updatedEnvironments = {
            ...existingEnvironments,
            [environmentName]: environmentToVariableMap(postmanEnvironment)
        };

        await configuration.update('environmentVariables', updatedEnvironments, target.target);
        window.showInformationMessage(`Environment "${environmentName}" saved. Use "Switch Environment" to activate it.`);
    }

    private async maybeExportEnvironment(sourceFileName: string) {
        const includeEnvironment = await window.showQuickPick(
            ['No', 'Yes'],
            { placeHolder: 'Also export the current REST Client environment as a Postman Environment file?' }
        );
        if (includeEnvironment !== 'Yes') {
            return;
        }

        const { name: environmentName } = await EnvironmentController.getCurrentEnvironment();
        if (environmentName === Constants.NoEnvironmentSelectedName) {
            window.showInformationMessage('No REST Client environment is currently active.');
            return;
        }

        const allEnvironments = SystemSettings.Instance.environmentVariables;
        const variables = {
            ...(allEnvironments[EnvironmentController.sharedEnvironmentName] ?? {}),
            ...(allEnvironments[environmentName] ?? {})
        };
        const postmanEnvironment = buildPostmanEnvironment(environmentName, variables);

        const defaultUri = Uri.file(path.join(path.dirname(sourceFileName), `${environmentName}.postman_environment.json`));
        const saveUri = await window.showSaveDialog({
            defaultUri,
            filters: { 'Postman Environment': ['json'] }
        });
        if (!saveUri) {
            return;
        }

        await fs.writeFile(saveUri.fsPath, JSON.stringify(postmanEnvironment, null, 2), 'utf8');
        window.showInformationMessage(`Postman environment exported to ${path.basename(saveUri.fsPath)}.`);
    }

    private async parseHttpRequest(selectedRequest: SelectedRequest): Promise<HttpRequest> {
        const requestSettings = new RequestSettings(selectedRequest.metadatas);
        const settings: IRestClientSettings = new RestClientSettings(requestSettings);
        const name = selectedRequest.metadatas.get(RequestMetadata.Name);
        return RequestParserFactory.createRequestParser(selectedRequest.text, settings).parseHttpRequest(name);
    }

    private getFileVariables(documentText: string): PostmanVariable[] {
        const variables: PostmanVariable[] = [];
        for (const line of documentText.split(Constants.LineSplitterRegex)) {
            const matched = line.match(Constants.FileVariableDefinitionRegex);
            if (matched) {
                variables.push({ key: matched[1], value: matched[2], type: 'string' });
            }
        }
        return variables;
    }
}
