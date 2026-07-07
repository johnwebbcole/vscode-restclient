'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as path from 'node:path';
import {
    commands,
    ExtensionContext,
    languages,
    lm,
    McpServerDefinition,
    McpStdioServerDefinition,
    Range,
    TextDocument,
    Uri,
    window,
    workspace,
    WorkspaceEdit,
    WorkspaceFolder,
} from 'vscode';
import { CodeSnippetController } from './controllers/codeSnippetController';
import { EnvironmentController } from './controllers/environmentController';
import { HistoryController } from './controllers/historyController';
import { PostmanController } from './controllers/postmanController';
import { RequestController, RequestTarget } from './controllers/requestController';
import { SwaggerController } from './controllers/swaggerController';
import Logger from './logger';
import { CustomVariableDiagnosticsProvider } from "./providers/customVariableDiagnosticsProvider";
import { RequestBodyDocumentLinkProvider } from './providers/documentLinkProvider';
import { EnvironmentOrFileVariableHoverProvider } from './providers/environmentOrFileVariableHoverProvider';
import { FileVariableDefinitionProvider } from './providers/fileVariableDefinitionProvider';
import { FileVariableReferenceProvider } from './providers/fileVariableReferenceProvider';
import { FileVariableReferencesCodeLensProvider } from './providers/fileVariableReferencesCodeLensProvider';
import { HttpCodeLensProvider } from './providers/httpCodeLensProvider';
import { HttpCompletionItemProvider } from './providers/httpCompletionItemProvider';
import { HttpDocumentSymbolProvider } from './providers/httpDocumentSymbolProvider';
import { MarkdownCodeLensProvider } from './providers/markdownCodeLensProvider';
import { RequestVariableCompletionItemProvider } from "./providers/requestVariableCompletionItemProvider";
import { RequestVariableDefinitionProvider } from './providers/requestVariableDefinitionProvider';
import { RequestVariableHoverProvider } from './providers/requestVariableHoverProvider';
import { AadTokenCache } from './utils/aadTokenCache';
import { ConfigurationDependentRegistration } from './utils/dependentRegistration';
import { createMcpStdioServerConfig, upsertMcpServerConfig } from './utils/mcpRegistration';
import { UserDataManager } from './utils/userDataManager';

const MCP_SERVER_NAME = 'rest-client';
const MCP_PROVIDER_ID = 'restclient-mcp.bundled-mcp-server';
const REGISTER_MCP_SERVER_COMMAND = 'rest-client.register-mcp-server';
const MCP_GUIDANCE_KEY = 'rest-client.mcpGuidanceShown';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export async function activate(context: ExtensionContext) {
    await UserDataManager.initialize();

    registerBundledMcpServerProvider(context);

    const requestController = new RequestController(context);
    const historyController = new HistoryController();
    const codeSnippetController = new CodeSnippetController(context);
    const environmentController = await EnvironmentController.create();
    const swaggerController = new SwaggerController(context);
    const postmanController = new PostmanController();
    context.subscriptions.push(requestController);
    context.subscriptions.push(historyController);
    context.subscriptions.push(codeSnippetController);
    context.subscriptions.push(environmentController);
    context.subscriptions.push(commands.registerCommand('rest-client.request', ((document: TextDocument, range: Range, target?: RequestTarget) => requestController.run(range, target))));
    context.subscriptions.push(commands.registerCommand('rest-client.rerun-last-request', () => requestController.rerun()));
    context.subscriptions.push(commands.registerCommand('rest-client.get-response-body', (target: RequestTarget) => requestController.getResponseBody(target)));
    context.subscriptions.push(commands.registerCommand('rest-client.cancel-request', () => requestController.cancel()));
    context.subscriptions.push(commands.registerCommand('rest-client.history', () => historyController.save()));
    context.subscriptions.push(commands.registerCommand('rest-client.clear-history', () => historyController.clear()));
    context.subscriptions.push(commands.registerCommand('rest-client.generate-codesnippet', () => codeSnippetController.run()));
    context.subscriptions.push(commands.registerCommand('rest-client.copy-request-as-curl', () => codeSnippetController.copyAsCurl()));
    context.subscriptions.push(commands.registerCommand('rest-client.switch-environment', () => environmentController.switchEnvironment()));
    context.subscriptions.push(commands.registerCommand('rest-client.clear-aad-token-cache', () => AadTokenCache.clear()));
    context.subscriptions.push(commands.registerCommand('rest-client.clear-cookies', () => requestController.clearCookies()));
    context.subscriptions.push(commands.registerCommand('rest-client._openDocumentLink', args => {
        workspace.openTextDocument(Uri.parse(args.path)).then(window.showTextDocument, error => {
            window.showErrorMessage(error.message);
        });
    }));
    context.subscriptions.push(commands.registerCommand('rest-client.import-swagger', async () => swaggerController.import()));
    context.subscriptions.push(commands.registerCommand('rest-client.export-request-as-postman', () => postmanController.exportRequestAsPostman()));
    context.subscriptions.push(commands.registerCommand('rest-client.export-file-as-postman', (uri?: Uri) => postmanController.exportFileAsPostman(uri)));
    context.subscriptions.push(commands.registerCommand('rest-client.import-postman-collection', (uri?: Uri) => postmanController.importPostmanCollection(uri)));
    context.subscriptions.push(commands.registerCommand(REGISTER_MCP_SERVER_COMMAND, () => registerWorkspaceMcpServer(context)));


    const documentSelector = [
        { language: 'http', scheme: '*' }
    ];

    const mdDocumentSelector = [
        { language: 'markdown', scheme: '*' }
    ];

    context.subscriptions.push(languages.registerCompletionItemProvider(documentSelector, new HttpCompletionItemProvider()));
    context.subscriptions.push(languages.registerCompletionItemProvider(documentSelector, new RequestVariableCompletionItemProvider(), '.'));
    context.subscriptions.push(languages.registerHoverProvider(documentSelector, new EnvironmentOrFileVariableHoverProvider()));
    context.subscriptions.push(languages.registerHoverProvider(documentSelector, new RequestVariableHoverProvider()));
    context.subscriptions.push(
        new ConfigurationDependentRegistration(
            () => languages.registerCodeLensProvider(documentSelector, new HttpCodeLensProvider()),
            s => s.enableSendRequestCodeLens));
    context.subscriptions.push(
        new ConfigurationDependentRegistration(
            () => languages.registerCodeLensProvider(documentSelector, new FileVariableReferencesCodeLensProvider()),
            s => s.enableCustomVariableReferencesCodeLens));
    context.subscriptions.push(
        new ConfigurationDependentRegistration(
            () => languages.registerCodeLensProvider(mdDocumentSelector, new MarkdownCodeLensProvider()),
            s => s.enableSendRequestCodeLens));
    context.subscriptions.push(languages.registerDocumentLinkProvider(documentSelector, new RequestBodyDocumentLinkProvider()));
    context.subscriptions.push(languages.registerDefinitionProvider(documentSelector, new FileVariableDefinitionProvider()));
    context.subscriptions.push(languages.registerDefinitionProvider(documentSelector, new RequestVariableDefinitionProvider()));
    context.subscriptions.push(languages.registerReferenceProvider(documentSelector, new FileVariableReferenceProvider()));
    context.subscriptions.push(languages.registerDocumentSymbolProvider(documentSelector, new HttpDocumentSymbolProvider()));

    const diagnosticsProvider = new CustomVariableDiagnosticsProvider();
    context.subscriptions.push(diagnosticsProvider);

    void showMcpServerGuidance(context);
}

// this method is called when your extension is deactivated
export function deactivate() {
    return;
}

function registerBundledMcpServerProvider(context: ExtensionContext): void {
    context.subscriptions.push(
        lm.registerMcpServerDefinitionProvider(MCP_PROVIDER_ID, {
            provideMcpServerDefinitions: () => {
                const server = getBundledMcpServerDefinition(context);
                return server ? [server] : [];
            },
            resolveMcpServerDefinition: server => resolveBundledMcpServerDefinition(context, server),
        })
    );
}

function getBundledMcpServerDefinition(context: ExtensionContext): McpStdioServerDefinition | undefined {
    const serverScript = getBundledServerScriptPath(context);

    try {
        const config = createMcpStdioServerConfig(process.execPath, serverScript.fsPath, context.extensionPath);
        return new McpStdioServerDefinition(MCP_SERVER_NAME, config.command, config.args, {}, context.extension.packageJSON.version);
    } catch (error) {
        Logger.error('Failed to create Rest Client MCP server definition.', error);
        return undefined;
    }
}

async function resolveBundledMcpServerDefinition(
    context: ExtensionContext,
    server: McpServerDefinition
): Promise<McpServerDefinition | undefined> {
    if (!(server instanceof McpStdioServerDefinition) || server.label !== MCP_SERVER_NAME) {
        return server;
    }

    const serverScript = getBundledServerScriptPath(context);

    try {
        await workspace.fs.stat(serverScript);
    } catch (error) {
        const message = 'Rest Client MCP server could not start because the bundled server script is missing. Reinstall the extension and run "Rest Client MCP: Register MCP Server".';
        Logger.error(message, error);
        void window.showErrorMessage(message);
        throw new Error(message);
    }

    server.command = process.execPath;
    server.args = [serverScript.fsPath];
    server.cwd = Uri.file(context.extensionPath);
    server.version = context.extension.packageJSON.version;
    return server;
}

async function showMcpServerGuidance(context: ExtensionContext): Promise<void> {
    if (context.globalState.get<boolean>(MCP_GUIDANCE_KEY)) {
        return;
    }

    await context.globalState.update(MCP_GUIDANCE_KEY, true);

    const action = await window.showInformationMessage(
        'Rest Client MCP server is available in Chat tools after install. If it does not appear, run "Rest Client MCP: Register MCP Server" from the Command Palette.',
        'Register Now'
    );

    if (action === 'Register Now') {
        await registerWorkspaceMcpServer(context);
    }
}

async function registerWorkspaceMcpServer(context: ExtensionContext): Promise<void> {
    const target = await selectMcpRegistrationTarget();
    if (!target) {
        return;
    }

    const bundledServer = createMcpStdioServerConfig(
        process.execPath,
        getBundledServerScriptPath(context).fsPath,
        context.extensionPath
    );

    if (target === 'user') {
        await registerUserMcpServer(bundledServer);
        return;
    }

    const selectedFolder = await selectWorkspaceFolder();
    if (!selectedFolder) {
        window.showWarningMessage('Rest Client MCP registration needs an open workspace folder. Open a folder and run "Rest Client MCP: Register MCP Server" again.');
        return;
    }

    const mcpConfigUri = Uri.joinPath(selectedFolder.uri, '.vscode', 'mcp.json');

    try {
        const currentContent = await readUtf8IfExists(mcpConfigUri);
        const result = upsertMcpServerConfig(currentContent, MCP_SERVER_NAME, bundledServer);

        if (result.status !== 'unchanged') {
            await workspace.fs.writeFile(mcpConfigUri, Buffer.from(result.content, 'utf8'));
        }

        if (result.status === 'unchanged') {
            window.showInformationMessage('Rest Client MCP server is already registered in workspace .vscode/mcp.json. If tools are still missing, run "MCP: List Servers" and start or trust the server.');
            return;
        }

        const action = await window.showInformationMessage(
            'Rest Client MCP server registration updated in workspace .vscode/mcp.json. Run "MCP: List Servers" to start/trust it if needed.',
            'Open Config'
        );

        if (action === 'Open Config') {
            const document = await workspace.openTextDocument(mcpConfigUri);
            await window.showTextDocument(document);
        }
    } catch (error) {
        Logger.error('Failed to register Rest Client MCP server in workspace mcp.json.', error);
        window.showErrorMessage(`Rest Client MCP registration failed: ${error instanceof Error ? error.message : String(error)}. Check the REST output channel and MCP server logs for details.`);
    }
}

async function registerUserMcpServer(serverConfig: ReturnType<typeof createMcpStdioServerConfig>): Promise<void> {
    try {
        await commands.executeCommand('mcp.openUserConfiguration');
        const activeEditor = window.activeTextEditor;
        if (!activeEditor || path.basename(activeEditor.document.uri.fsPath).toLowerCase() !== 'mcp.json') {
            window.showWarningMessage('Could not locate the user mcp.json editor. Run "MCP: Open User Configuration", then rerun "Rest Client MCP: Register MCP Server".');
            return;
        }

        const currentContent = activeEditor.document.getText();
        const result = upsertMcpServerConfig(currentContent, MCP_SERVER_NAME, serverConfig);

        if (result.status === 'unchanged') {
            window.showInformationMessage('Rest Client MCP server is already registered in user mcp.json. If tools are still missing, run "MCP: List Servers" and start or trust the server.');
            return;
        }

        const edit = new WorkspaceEdit();
        const fullRange = new Range(
            activeEditor.document.positionAt(0),
            activeEditor.document.positionAt(currentContent.length)
        );
        edit.replace(activeEditor.document.uri, fullRange, result.content);
        await workspace.applyEdit(edit);
        await activeEditor.document.save();

        window.showInformationMessage('Rest Client MCP server registration updated in user mcp.json. Run "MCP: List Servers" to start/trust it if needed.');
    } catch (error) {
        Logger.error('Failed to register Rest Client MCP server in user mcp.json.', error);
        window.showErrorMessage(`Rest Client MCP user registration failed: ${error instanceof Error ? error.message : String(error)}. Run "MCP: Open User Configuration" and verify your MCP setup.`);
    }
}

async function selectMcpRegistrationTarget(): Promise<'workspace' | 'user' | undefined> {
    const options: Array<{ label: string; target: 'workspace' | 'user' }> = [
        { label: 'Workspace (.vscode/mcp.json)', target: 'workspace' },
        { label: 'User profile (global mcp.json)', target: 'user' },
    ];

    const selected = await window.showQuickPick(options, {
        placeHolder: 'Choose where to register Rest Client MCP server',
    });

    return selected?.target;
}

async function selectWorkspaceFolder(): Promise<WorkspaceFolder | undefined> {
    if (!workspace.workspaceFolders || workspace.workspaceFolders.length === 0) {
        return undefined;
    }

    if (workspace.workspaceFolders.length === 1) {
        return workspace.workspaceFolders[0];
    }

    const selected = await window.showWorkspaceFolderPick({
        placeHolder: 'Select the workspace folder where .vscode/mcp.json should be updated',
    });
    return selected;
}

function getBundledServerScriptPath(context: ExtensionContext): Uri {
    return Uri.file(path.join(context.extensionPath, 'mcp-server', 'src', 'index.js'));
}

async function readUtf8IfExists(uri: Uri): Promise<string | undefined> {
    try {
        const data = await workspace.fs.readFile(uri);
        return Buffer.from(data).toString('utf8');
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes('FileNotFound')) {
            return undefined;
        }

        throw error;
    }
}
