'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as path from 'node:path';
import {
    commands,
    ExtensionContext,
    FileType,
    languages,
    lm,
    McpServerDefinition,
    McpStdioServerDefinition,
    Range,
    TextDocument,
    Uri,
    window,
    workspace,
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
import { isCommandAvailable, resolveUserMcpConfigPath } from './utils/mcpAutoSetup';
import { createMcpStdioServerConfig, InvalidMcpConfigError, isServerConfigured, McpStdioServerConfig, upsertMcpServerConfig } from './utils/mcpRegistration';
import { UserDataManager } from './utils/userDataManager';

const MCP_SERVER_NAME = 'rest-client';
const MCP_PROVIDER_ID = 'restclient-mcp.bundled-mcp-server';
const REGISTER_MCP_SERVER_COMMAND = 'rest-client.register-mcp-server';
const MCP_SERVER_STATUS_COMMAND = 'rest-client.mcp-server-status';
const MCP_AUTO_SETUP_DONE_KEY = 'rest-client.mcpAutoSetupDone';
// Best-effort only: used (if present) to focus VS Code's dedicated MCP config UI after we've
// already written the file ourselves. Never required for registration to succeed.
const MCP_OPEN_USER_CONFIG_COMMAND = 'mcp.openUserConfiguration';

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
    context.subscriptions.push(commands.registerCommand(REGISTER_MCP_SERVER_COMMAND, () => runMcpRegistration(context, true)));
    context.subscriptions.push(commands.registerCommand(MCP_SERVER_STATUS_COMMAND, () => showMcpRegistrationStatus(context)));


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

    // Fire-and-forget: register the bundled MCP server automatically so users don't have to run
    // the command manually. Silent unless something needs the user's attention (see runMcpRegistration).
    void runMcpRegistration(context, false);
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

function getBundledServerScriptPath(context: ExtensionContext): Uri {
    return Uri.file(path.join(context.extensionPath, 'dist', 'mcp-server.mjs'));
}

function buildServerConfig(context: ExtensionContext): McpStdioServerConfig {
    return createMcpStdioServerConfig(
        process.execPath,
        getBundledServerScriptPath(context).fsPath,
        context.extensionPath
    );
}

async function readUtf8IfExists(uri: Uri): Promise<string | undefined> {
    try {
        const data = await workspace.fs.readFile(uri);
        return Buffer.from(data).toString('utf8');
    } catch (error) {
        if (isFileNotFound(error)) {
            return undefined;
        }

        throw error;
    }
}

function isFileNotFound(error: unknown): boolean {
    if (error && typeof error === 'object' && 'code' in error && (error as { code?: unknown }).code === 'FileNotFound') {
        return true;
    }

    const message = error instanceof Error ? error.message : String(error);
    return message.includes('FileNotFound');
}

/**
 * The outcome of attempting to register the server at a single target (workspace or user).
 * `error: 'invalid-json'` is only reachable after the interactive recovery flow declines to fix
 * the file, since the auto/silent path always tries recovery for the user first.
 */
type McpTargetResult =
    | { kind: 'success'; status: McpConfigUpsertStatusLike; uri: Uri }
    | { kind: 'skipped'; reason: string }
    | { kind: 'error'; message: string; uri?: Uri };

type McpConfigUpsertStatusLike = 'added' | 'updated' | 'unchanged';

async function selectWorkspaceFolder(interactive: boolean): Promise<WorkspaceFolder | undefined> {
    const folders = workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
        return undefined;
    }

    if (folders.length === 1 || !interactive) {
        return folders[0];
    }

    const selected = await window.showWorkspaceFolderPick({
        placeHolder: 'Select the workspace folder where .vscode/mcp.json should be updated',
    });
    return selected ?? folders[0];
}

function resolveWorkspaceMcpConfigUri(folder: WorkspaceFolder): Uri {
    return Uri.joinPath(folder.uri, '.vscode', 'mcp.json');
}

/**
 * Derives the user-profile mcp.json location from `ExtensionContext.globalStorageUri` (a stable,
 * documented API) instead of a hardcoded per-OS path or the `mcp.openUserConfiguration` command.
 * Confirms the parent "User" directory actually exists before trusting the guess, so we can fall
 * back to "undeterminable" rather than writing to a bogus location in an unusual environment.
 */
async function resolveUserMcpConfigUri(context: ExtensionContext): Promise<Uri | undefined> {
    const candidate = Uri.file(resolveUserMcpConfigPath(context.globalStorageUri.fsPath));
    const userDir = Uri.joinPath(candidate, '..');

    try {
        const stat = await workspace.fs.stat(userDir);
        return (stat.type & FileType.Directory) !== 0 ? candidate : undefined;
    } catch {
        return undefined;
    }
}

/**
 * Reads, upserts, and (if changed) writes the MCP config at `uri`. Creates the parent directory
 * first since `.vscode/mcp.json` commonly doesn't exist yet. Set `resetContent` to bypass reading
 * the current file (used by the invalid-JSON "back up & reset" recovery path).
 */
async function upsertMcpConfigAtUri(
    uri: Uri,
    serverConfig: McpStdioServerConfig,
    resetContent = false
): Promise<McpConfigUpsertStatusLike> {
    const currentContent = resetContent ? undefined : await readUtf8IfExists(uri);
    const result = upsertMcpServerConfig(currentContent, MCP_SERVER_NAME, serverConfig);

    if (result.status !== 'unchanged') {
        await workspace.fs.createDirectory(Uri.joinPath(uri, '..'));
        await workspace.fs.writeFile(uri, Buffer.from(result.content, 'utf8'));
    }

    return result.status;
}

async function setupMcpTarget(
    label: string,
    uri: Uri | undefined,
    skipReason: string | undefined,
    serverConfig: McpStdioServerConfig,
    interactive: boolean
): Promise<McpTargetResult> {
    if (!uri) {
        return { kind: 'skipped', reason: skipReason ?? `${label} target is unavailable.` };
    }

    try {
        const status = await upsertMcpConfigAtUri(uri, serverConfig);
        return { kind: 'success', status, uri };
    } catch (error) {
        if (error instanceof InvalidMcpConfigError) {
            return offerInvalidJsonRecovery(label, uri, serverConfig, interactive);
        }

        Logger.error(`Failed to register Rest Client MCP server in ${label.toLowerCase()} mcp.json.`, error);
        return { kind: 'error', message: error instanceof Error ? error.message : String(error), uri };
    }
}

async function offerInvalidJsonRecovery(
    label: string,
    uri: Uri,
    serverConfig: McpStdioServerConfig,
    interactive: boolean
): Promise<McpTargetResult> {
    const prompt = `Rest Client MCP could not update ${uri.fsPath} because it contains invalid JSON.`;
    const showPrompt = interactive ? window.showErrorMessage : window.showWarningMessage;

    const choice = await showPrompt(prompt, 'Back Up && Reset', 'Open File');

    if (choice === 'Open File') {
        const document = await workspace.openTextDocument(uri);
        await window.showTextDocument(document);
        return { kind: 'error', message: 'contains invalid JSON; left unchanged for manual editing', uri };
    }

    if (choice === 'Back Up && Reset') {
        try {
            const original = await readUtf8IfExists(uri);
            if (original !== undefined) {
                const backupUri = uri.with({ path: `${uri.path}.bak-${Date.now()}` });
                await workspace.fs.writeFile(backupUri, Buffer.from(original, 'utf8'));
            }

            const status = await upsertMcpConfigAtUri(uri, serverConfig, true);
            return { kind: 'success', status, uri };
        } catch (error) {
            Logger.error(`Failed to back up and reset ${label.toLowerCase()} mcp.json.`, error);
            return { kind: 'error', message: `backup/reset failed: ${error instanceof Error ? error.message : String(error)}`, uri };
        }
    }

    return { kind: 'error', message: 'contains invalid JSON; left unchanged', uri };
}

/**
 * Registers the bundled MCP server at both the workspace and user targets using the same
 * resilient upsert logic, whether triggered silently on activation or explicitly via the
 * "Register MCP Server" command. Never depends on `mcp.openUserConfiguration` to succeed.
 */
async function runMcpRegistration(context: ExtensionContext, interactive: boolean): Promise<void> {
    const serverConfig = buildServerConfig(context);

    const folder = await selectWorkspaceFolder(interactive);
    const workspaceResult = await setupMcpTarget(
        'Workspace',
        folder ? resolveWorkspaceMcpConfigUri(folder) : undefined,
        'no workspace folder is open',
        serverConfig,
        interactive
    );

    const userUri = await resolveUserMcpConfigUri(context);
    const userResult = await setupMcpTarget(
        'User profile',
        userUri,
        'could not reliably locate the user profile mcp.json in this environment',
        serverConfig,
        interactive
    );

    await reportMcpRegistrationOutcome(context, workspaceResult, userResult, interactive);
}

const MCP_STATUS_VERBS: Record<McpConfigUpsertStatusLike, string> = {
    unchanged: 'already registered',
    added: 'registered',
    updated: 'updated',
};

function describeSuccess(result: Extract<McpTargetResult, { kind: 'success' }>): string {
    return `${MCP_STATUS_VERBS[result.status]} at ${result.uri.fsPath}`;
}

function describeNonSuccess(result: McpTargetResult): string {
    if (result.kind === 'skipped') {
        return result.reason;
    }
    if (result.kind === 'error') {
        return result.message;
    }
    return describeSuccess(result);
}

async function reportMcpRegistrationOutcome(
    context: ExtensionContext,
    workspaceResult: McpTargetResult,
    userResult: McpTargetResult,
    interactive: boolean
): Promise<void> {
    const hasError = workspaceResult.kind === 'error' || userResult.kind === 'error';
    const alreadyNotified = context.globalState.get<boolean>(MCP_AUTO_SETUP_DONE_KEY, false);

    // Stay quiet on routine, unchanged startups once the user has already seen a summary once.
    if (!interactive && alreadyNotified && !hasError) {
        return;
    }

    await context.globalState.update(MCP_AUTO_SETUP_DONE_KEY, true);

    if (workspaceResult.kind === 'success' && userResult.kind === 'success') {
        // Don't await the button click: the registration work is already done, and a command
        // invocation shouldn't hang on a notification nobody may ever dismiss.
        void window.showInformationMessage(
            `Rest Client MCP server ${describeSuccess(workspaceResult)} (workspace) and ${describeSuccess(userResult)} (user profile). Run "MCP: List Servers" to start/trust it if needed.`,
            'Open Workspace Config'
        ).then(action => {
            if (action === 'Open Workspace Config') {
                void openMcpConfig(workspaceResult.uri);
            }
        });
        return;
    }

    if (workspaceResult.kind === 'success') {
        window.showInformationMessage(
            `Rest Client MCP server ${describeSuccess(workspaceResult)}. User profile registration was skipped: ${describeNonSuccess(userResult)}.`
        );
        return;
    }

    if (userResult.kind === 'success') {
        window.showInformationMessage(
            `Rest Client MCP server ${describeSuccess(userResult)}. Workspace registration was skipped: ${describeNonSuccess(workspaceResult)}.`
        );
        return;
    }

    // Both targets failed or were skipped - only surface this as an error if there's actually
    // something actionable to fix; a workspace-less window with no user target is expected, not a failure.
    if (!hasError) {
        return;
    }

    window.showErrorMessage(
        `Rest Client MCP registration could not complete automatically. Workspace: ${describeNonSuccess(workspaceResult)}. User profile: ${describeNonSuccess(userResult)}. Run "Rest Client MCP: Register MCP Server" from the Command Palette to retry.`
    );
}

async function openMcpConfig(uri: Uri): Promise<void> {
    if (await isCommandAvailable(MCP_OPEN_USER_CONFIG_COMMAND, () => commands.getCommands(true))) {
        try {
            await commands.executeCommand(MCP_OPEN_USER_CONFIG_COMMAND);
            return;
        } catch (error) {
            Logger.warn(`"${MCP_OPEN_USER_CONFIG_COMMAND}" command failed; falling back to opening the file directly.`, error);
        }
    }

    const document = await workspace.openTextDocument(uri);
    await window.showTextDocument(document);
}

async function showMcpRegistrationStatus(context: ExtensionContext): Promise<void> {
    const folder = await selectWorkspaceFolder(false);
    const parts: string[] = [];

    if (folder) {
        const uri = resolveWorkspaceMcpConfigUri(folder);
        const registered = isServerConfigured(await readUtf8IfExists(uri), MCP_SERVER_NAME);
        parts.push(`Workspace: ${registered ? 'registered' : 'not registered'} (${uri.fsPath})`);
    } else {
        parts.push('Workspace: no folder open');
    }

    const userUri = await resolveUserMcpConfigUri(context);
    if (userUri) {
        const registered = isServerConfigured(await readUtf8IfExists(userUri), MCP_SERVER_NAME);
        parts.push(`User profile: ${registered ? 'registered' : 'not registered'} (${userUri.fsPath})`);
    } else {
        parts.push('User profile: could not be determined in this environment');
    }

    window.showInformationMessage(`Rest Client MCP status — ${parts.join(' | ')}. Run "MCP: List Servers" to check start/trust state.`);
}
