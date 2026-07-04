import { HttpRequest } from '../../src/models/httpRequest';
import { PostmanCollection } from '../../src/models/postmanCollection';
import {
    buildCollectionFromHttpRequests,
    buildPostmanEnvironment,
    collectionToHttpFileContent,
    environmentToVariableMap,
    isPostmanCollection,
    isPostmanEnvironment
} from '../../src/utils/postmanConverter';

describe('postmanConverter', () => {
    describe('http -> Postman collection', () => {
        it('maps method, headers, url and a JSON body', () => {
            const request = new HttpRequest(
                'POST',
                'https://api.example.com/users?active=true',
                { 'Content-Type': 'application/json', 'X-Token': '{{token}}' },
                '{"name":"Alice"}',
                '{"name":"Alice"}'
            );

            const collection = buildCollectionFromHttpRequests('My File', [{ name: 'Create User', request }]);

            expect(collection.info.name).toBe('My File');
            expect(collection.item).toHaveLength(1);

            const item = collection.item[0];
            expect(item.name).toBe('Create User');
            expect(item.request?.method).toBe('POST');
            expect(item.request?.header).toContainEqual({ key: 'Content-Type', value: 'application/json' });
            expect(item.request?.header).toContainEqual({ key: 'X-Token', value: '{{token}}' });
            expect(item.request?.body).toEqual({ mode: 'raw', raw: '{"name":"Alice"}', options: { raw: { language: 'json' } } });

            const url = item.request!.url as any;
            expect(url.raw).toBe('https://api.example.com/users?active=true');
            expect(url.protocol).toBe('https');
            expect(url.host).toEqual(['api', 'example', 'com']);
            expect(url.path).toEqual(['users']);
            expect(url.query).toEqual([{ key: 'active', value: 'true' }]);
        });

        it('breaks a templated base url into a single host segment plus path, so Postman can populate the address bar', () => {
            const request = new HttpRequest('GET', '{{baseUrl}}/users', {});
            const collection = buildCollectionFromHttpRequests('col', [{ name: 'Get Users', request }]);

            const url = collection.item[0].request!.url as any;
            expect(url).toEqual({ raw: '{{baseUrl}}/users', host: ['{{baseUrl}}'], path: ['users'] });
        });

        it('breaks a templated base url with query params into host/path/query', () => {
            const request = new HttpRequest('GET', '{{baseUrl}}/products/types?limit={{limit}}', {});
            const collection = buildCollectionFromHttpRequests('col', [{ name: 'Get Types', request }]);

            const url = collection.item[0].request!.url as any;
            expect(url).toEqual({
                raw: '{{baseUrl}}/products/types?limit={{limit}}',
                host: ['{{baseUrl}}'],
                path: ['products', 'types'],
                query: [{ key: 'limit', value: '{{limit}}' }]
            });
        });

        it('attaches a test script to the source request that populates a {{name.response...}} reference used elsewhere', () => {
            const alertsActive = new HttpRequest('GET', '{{baseUrl}}/alerts/active', {}, undefined, undefined, 'alerts_active');
            const alertsSingle = new HttpRequest(
                'GET',
                '{{baseUrl}}/alerts/{{alerts_active.response.body.$.features[0].properties.id}}',
                {},
                undefined,
                undefined,
                'alerts_single'
            );

            const collection = buildCollectionFromHttpRequests('col', [
                { name: 'alerts_active', request: alertsActive },
                { name: 'alerts_single', request: alertsSingle }
            ]);

            const sourceItem = collection.item.find(i => i.name === 'alerts_active')!;
            const targetItem = collection.item.find(i => i.name === 'alerts_single')!;

            expect(targetItem.event).toBeUndefined();
            expect(sourceItem.event).toHaveLength(1);
            expect(sourceItem.event![0].listen).toBe('test');

            const script = sourceItem.event![0].script.exec.join('\n');
            expect(script).toContain('pm.response.json()');
            expect(script).toContain("_.get(__body, \"features[0].properties.id\")");
            expect(script).toContain('pm.collectionVariables.set("alerts_active.response.body.$.features[0].properties.id"');
        });

        it('emits a TODO comment instead of a script for JSONPath syntax that cannot be auto-translated', () => {
            const productsQuery = new HttpRequest('GET', '{{baseUrl}}/products', {}, undefined, undefined, 'products_query');
            const product = new HttpRequest(
                'GET',
                '{{baseUrl}}/products/{{products_query.response.body.$.`@graph[0].id}}',
                {},
                undefined,
                undefined,
                'product'
            );

            const collection = buildCollectionFromHttpRequests('col', [
                { name: 'products_query', request: productsQuery },
                { name: 'product', request: product }
            ]);

            const sourceItem = collection.item.find(i => i.name === 'products_query')!;
            const script = sourceItem.event![0].script.exec.join('\n');
            expect(script).toContain('TODO');
            expect(script).not.toContain('pm.collectionVariables.set("products_query.response.body');
        });

        it('populates a response-header reference via pm.response.headers.get', () => {
            const login = new HttpRequest('POST', '{{baseUrl}}/login', {}, undefined, undefined, 'login');
            const next = new HttpRequest(
                'GET',
                '{{baseUrl}}/me',
                { Authorization: 'Bearer {{login.response.headers.X-Auth-Token}}' },
                undefined,
                undefined,
                'me'
            );

            const collection = buildCollectionFromHttpRequests('col', [
                { name: 'login', request: login },
                { name: 'me', request: next }
            ]);

            const sourceItem = collection.item.find(i => i.name === 'login')!;
            const script = sourceItem.event![0].script.exec.join('\n');
            expect(script).toContain('pm.response.headers.get("X-Auth-Token")');
            expect(script).toContain('pm.collectionVariables.set("login.response.headers.X-Auth-Token"');
        });

        it('maps form-urlencoded bodies', () => {
            const request = new HttpRequest(
                'POST',
                'https://api.example.com/login',
                { 'Content-Type': 'application/x-www-form-urlencoded' },
                'user=alice&pass=secret',
                'user=alice&pass=secret'
            );
            const collection = buildCollectionFromHttpRequests('col', [{ name: 'Login', request }]);

            expect(collection.item[0].request?.body).toEqual({
                mode: 'urlencoded',
                urlencoded: [{ key: 'user', value: 'alice' }, { key: 'pass', value: 'secret' }]
            });
        });

        it('includes file variables as collection variables', () => {
            const request = new HttpRequest('GET', '{{baseUrl}}/ping', {});
            const collection = buildCollectionFromHttpRequests('col', [{ name: 'Ping', request }], [{ key: 'baseUrl', value: 'https://api.example.com' }]);

            expect(collection.variable).toEqual([{ key: 'baseUrl', value: 'https://api.example.com' }]);
        });
    });

    describe('Postman collection -> http', () => {
        function buildCollection(overrides: Partial<PostmanCollection> = {}): PostmanCollection {
            return {
                info: { name: 'Test Collection', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
                item: [],
                ...overrides
            };
        }

        it('emits a ### block with @name, method/url, headers and a raw JSON body', () => {
            const collection = buildCollection({
                item: [{
                    name: 'Create User',
                    request: {
                        method: 'POST',
                        url: { raw: 'https://api.example.com/users' },
                        header: [{ key: 'Content-Type', value: 'application/json' }],
                        body: { mode: 'raw', raw: '{"name":"Alice"}', options: { raw: { language: 'json' } } }
                    }
                }]
            });

            const content = collectionToHttpFileContent(collection);

            expect(content).toContain('### Create User');
            expect(content).toContain('# @name Create User');
            expect(content).toContain('POST https://api.example.com/users');
            expect(content).toContain('Content-Type: application/json');
            expect(content).toContain('{"name":"Alice"}');
        });

        it('flattens nested folders using "Folder / Request" names', () => {
            const collection = buildCollection({
                item: [{
                    name: 'Users',
                    item: [{
                        name: 'Get All',
                        request: { method: 'GET', url: { raw: 'https://api.example.com/users' } }
                    }]
                }]
            });

            const content = collectionToHttpFileContent(collection);
            expect(content).toContain('### Users / Get All');
            expect(content).toContain('# @name Users / Get All');
        });

        it('maps bearer auth to an Authorization header', () => {
            const collection = buildCollection({
                item: [{
                    name: 'Secured',
                    request: {
                        method: 'GET',
                        url: { raw: 'https://api.example.com/secure' },
                        auth: { type: 'bearer', bearer: [{ key: 'token', value: 'abc123' }] }
                    }
                }]
            });

            const content = collectionToHttpFileContent(collection);
            expect(content).toContain('Authorization: Bearer abc123');
        });

        it('maps basic auth to a base64-encoded Authorization header', () => {
            const collection = buildCollection({
                item: [{
                    name: 'Secured',
                    request: {
                        method: 'GET',
                        url: { raw: 'https://api.example.com/secure' },
                        auth: { type: 'basic', basic: [{ key: 'username', value: 'alice' }, { key: 'password', value: 'secret' }] }
                    }
                }]
            });

            const content = collectionToHttpFileContent(collection);
            expect(content).toContain(`Authorization: Basic ${Buffer.from('alice:secret').toString('base64')}`);
        });

        it('emits a TODO comment for unsupported auth types', () => {
            const collection = buildCollection({
                item: [{
                    name: 'Secured',
                    request: {
                        method: 'GET',
                        url: { raw: 'https://api.example.com/secure' },
                        auth: { type: 'oauth2' }
                    }
                }]
            });

            const content = collectionToHttpFileContent(collection);
            expect(content).toContain("# TODO: auth type 'oauth2' is not supported");
        });

        it('maps urlencoded body mode back to a key=value body with matching Content-Type', () => {
            const collection = buildCollection({
                item: [{
                    name: 'Login',
                    request: {
                        method: 'POST',
                        url: { raw: 'https://api.example.com/login' },
                        body: { mode: 'urlencoded', urlencoded: [{ key: 'user', value: 'alice' }, { key: 'pass', value: 'secret' }] }
                    }
                }]
            });

            const content = collectionToHttpFileContent(collection);
            expect(content).toContain('Content-Type: application/x-www-form-urlencoded');
            expect(content).toContain('user=alice&pass=secret');
        });

        it('maps graphql body mode to a JSON body with the X-Request-Type header', () => {
            const collection = buildCollection({
                item: [{
                    name: 'Query',
                    request: {
                        method: 'POST',
                        url: { raw: 'https://api.example.com/graphql' },
                        body: { mode: 'graphql', graphql: { query: 'query { me { id } }', variables: '{}' } }
                    }
                }]
            });

            const content = collectionToHttpFileContent(collection);
            expect(content).toContain('X-Request-Type: GraphQL');
            expect(content).toContain('"query": "query { me { id } }"');
        });

        it('emits collection-level variables as @key = value file variables', () => {
            const collection = buildCollection({ variable: [{ key: 'baseUrl', value: 'https://api.example.com' }] });
            const content = collectionToHttpFileContent(collection);
            expect(content.split('\n')[0]).toBe('@baseUrl = https://api.example.com');
        });
    });

    describe('shape detection', () => {
        it('identifies a Postman collection', () => {
            expect(isPostmanCollection({ info: { name: 'x', schema: 'y' }, item: [] })).toBe(true);
            expect(isPostmanCollection({ name: 'env', values: [] })).toBe(false);
        });

        it('identifies a Postman environment', () => {
            expect(isPostmanEnvironment({ name: 'env', values: [] })).toBe(true);
            expect(isPostmanEnvironment({ info: { name: 'x', schema: 'y' }, item: [] })).toBe(false);
        });
    });

    describe('environment conversion', () => {
        it('round-trips enabled variables through a variable map', () => {
            const env = buildPostmanEnvironment('Dev', { baseUrl: 'https://api.example.com', token: 'abc' });
            expect(environmentToVariableMap(env)).toEqual({ baseUrl: 'https://api.example.com', token: 'abc' });
        });

        it('skips disabled variables when reading an environment', () => {
            const map = environmentToVariableMap({
                name: 'Dev',
                values: [{ key: 'baseUrl', value: 'https://api.example.com', enabled: true }, { key: 'old', value: 'x', enabled: false }]
            });
            expect(map).toEqual({ baseUrl: 'https://api.example.com' });
        });
    });
});
