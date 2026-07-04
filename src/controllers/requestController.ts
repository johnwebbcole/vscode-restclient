import { ExtensionContext, Range, TextDocument, Uri, ViewColumn, window, workspace } from 'vscode';
import Logger from '../logger';
import { ResponseHeaders } from '../models/base';
import { IRestClientSettings, RequestSettings, RestClientSettings } from '../models/configurationSettings';
import { HistoricalHttpRequest, HttpRequest } from '../models/httpRequest';
import { RequestMetadata } from '../models/requestMetadata';
import { RequestParserFactory } from '../models/requestParserFactory';
import { HttpClient } from '../utils/httpClient';
import { RequestState, RequestStatusEntry } from '../utils/requestStatusBarEntry';
import { RequestVariableCache } from "../utils/requestVariableCache";
import { Selector } from '../utils/selector';
import { UserDataManager } from '../utils/userDataManager';
import { getCurrentTextDocument } from '../utils/workspaceUtility';
import { HttpResponseTextDocumentView } from '../views/httpResponseTextDocumentView';
import { HttpResponseWebview } from '../views/httpResponseWebview';

// Identifies a request without depending on cursor position or an existing
// active editor selection, so a request can be targeted from an automation
// script that only knows a file path and a '# @name' value.
export interface RequestTarget {
    uri?: string;
    name?: string;
}

export interface ResponseBodySummary {
    name: string;
    statusCode: number;
    statusMessage: string;
    httpVersion: string;
    headers: ResponseHeaders;
    contentType: string | undefined;
    bodyLength: number;
    body: string;
}

export class RequestController {
    private _requestStatusEntry: RequestStatusEntry;
    private _httpClient: HttpClient;
    private _webview: HttpResponseWebview;
    private _textDocumentView: HttpResponseTextDocumentView;
    private _lastRequestSettingTuple: [HttpRequest, IRestClientSettings];
    private _lastDocument?: TextDocument;
    private _lastPendingRequest?: HttpRequest;

    public constructor(context: ExtensionContext) {
        this._requestStatusEntry = new RequestStatusEntry();
        this._httpClient = new HttpClient();
        this._webview = new HttpResponseWebview(context);
        this._webview.onDidCloseAllWebviewPanels(() => this._requestStatusEntry.update({ state: RequestState.Closed }));
        this._textDocumentView = new HttpResponseTextDocumentView();
    }

    public async run(range?: Range, target?: RequestTarget) {
        let editor = window.activeTextEditor;
        let document = getCurrentTextDocument();

        // Allow automation to target a file directly instead of depending on
        // whatever happens to be the active editor.
        if (target?.uri) {
            document = await workspace.openTextDocument(Uri.parse(target.uri));
            editor = await window.showTextDocument(document, { preserveFocus: false, preview: false });
        }

        if (!editor || !document) {
            return;
        }

        let requestRange = range ?? null;
        if (target?.name) {
            requestRange = Selector.getRequestRangeByName(document, target.name);
            if (!requestRange) {
                window.showErrorMessage(`No request named '${target.name}' found in ${document.fileName}.`);
                return;
            }
        }

        const selectedRequest = await Selector.getRequest(editor, requestRange);
        if (!selectedRequest) {
            return;
        }

        const { text, metadatas } = selectedRequest;
        const name = metadatas.get(RequestMetadata.Name);

        if (metadatas.has(RequestMetadata.Note)) {
            const note = name ? `Are you sure you want to send the request "${name}"?` : 'Are you sure you want to send this request?';
            const userConfirmed = await window.showWarningMessage(note, 'Yes', 'No');
            if (userConfirmed !== 'Yes') {
                return;
            }
        }

        const requestSettings = new RequestSettings(metadatas);
        const settings: IRestClientSettings = new RestClientSettings(requestSettings);

        // parse http request
        const httpRequest = await RequestParserFactory.createRequestParser(text, settings).parseHttpRequest(name);

        await this.runCore(httpRequest, settings, document);
    }

    // Returns the last cached response for a named request as plain data, so
    // it can be read back by automation without a response webview ever
    // needing to exist or hold focus (unlike save-response-body/copy-response-body,
    // which act on the currently focused preview panel).
    public async getResponseBody(target: RequestTarget): Promise<ResponseBodySummary> {
        if (!target?.name) {
            throw new Error("getResponseBody requires a request 'name' (the '# @name' value) to look up a cached response.");
        }

        const document = target.uri
            ? await workspace.openTextDocument(Uri.parse(target.uri))
            : getCurrentTextDocument();
        if (!document) {
            throw new Error("No target document. Pass { uri } explicitly, or run this command while an .http file is the active editor.");
        }

        const response = RequestVariableCache.get(document, target.name);
        if (!response) {
            throw new Error(`No cached response for request '${target.name}' in ${document.fileName}. Run 'rest-client.request' with that name first.`);
        }

        return {
            name: target.name,
            statusCode: response.statusCode,
            statusMessage: response.statusMessage,
            httpVersion: response.httpVersion,
            headers: response.headers,
            contentType: response.contentType,
            bodyLength: response.bodySizeInBytes,
            body: response.body,
        };
    }

    public async rerun() {
        if (!this._lastRequestSettingTuple) {
            return;
        }

        const [request, settings] = this._lastRequestSettingTuple;

        // TODO: recover from last request settings
        await this.runCore(request, settings, this._lastDocument);
    }

    public async cancel() {
        this._lastPendingRequest?.cancel();

        this._requestStatusEntry.update({ state: RequestState.Cancelled });
    }
    public async clearCookies() {
        try {
            await this._httpClient.clearCookies();
        } catch (error) {
            window.showErrorMessage(`Error clearing cookies:${error?.message}`);
        }
    }

    private async runCore(httpRequest: HttpRequest, settings: IRestClientSettings, document?: TextDocument) {
        // clear status bar
        this._requestStatusEntry.update({ state: RequestState.Pending });

        // set last request and last pending request
        this._lastPendingRequest = httpRequest;
        this._lastRequestSettingTuple = [httpRequest, settings];
        this._lastDocument = document ?? this._lastDocument;

        // set http request
        try {
            const response = await this._httpClient.send(httpRequest, settings);

            // check cancel
            if (httpRequest.isCancelled) {
                return;
            }

            this._requestStatusEntry.update({ state: RequestState.Received, response });

            if (httpRequest.name && document) {
                RequestVariableCache.add(document, httpRequest.name, response);
            }

            try {
                const activeColumn = window.activeTextEditor!.viewColumn;
                const previewColumn = settings.previewColumn === ViewColumn.Active
                    ? activeColumn
                    : ((activeColumn as number) + 1) as ViewColumn;
                if (settings.previewResponseInUntitledDocument) {
                    this._textDocumentView.render(response, previewColumn);
                } else if (previewColumn) {
                    this._webview.render(response, previewColumn);
                }
            } catch (reason) {
                Logger.error('Unable to preview response:', reason);
                window.showErrorMessage(reason);
            }

            // persist to history json file
            await UserDataManager.addToRequestHistory(HistoricalHttpRequest.convertFromHttpRequest(httpRequest));
        } catch (error) {
            // check cancel
            if (httpRequest.isCancelled) {
                return;
            }

            if (error.code === 'ETIMEDOUT') {
                error.message = `Request timed out. Double-check your network connection and/or raise the timeout duration (currently set to ${settings.timeoutInMilliseconds}ms) as needed: 'rest-client.timeoutinmilliseconds'. Details: ${error}.`;
            } else if (error.code === 'ECONNREFUSED') {
                error.message = `The connection was rejected. Either the requested service isn’t running on the requested server/port, the proxy settings in vscode are misconfigured, or a firewall is blocking requests. Details: ${error}.`;
            } else if (error.code === 'ENETUNREACH') {
                error.message = `You don't seem to be connected to a network. Details: ${error}`;
            }
            this._requestStatusEntry.update({ state: RequestState.Error });
            Logger.error('Failed to send request:', error);
            window.showErrorMessage(error.message);
        } finally {
            if (this._lastPendingRequest === httpRequest) {
                this._lastPendingRequest = undefined;
            }
        }
    }

    public dispose() {
        this._requestStatusEntry.dispose();
        this._webview.dispose();
    }
}