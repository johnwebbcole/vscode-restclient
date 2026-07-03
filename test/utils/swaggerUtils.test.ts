import { SwaggerUtils } from '../../src/utils/swaggerUtils';

describe('SwaggerUtils.getExampleObjectFromSchema', () => {
    const utils = new SwaggerUtils();

    it('returns undefined for a missing schema', () => {
        expect(utils.getExampleObjectFromSchema({}, undefined)).toBeUndefined();
    });

    it('returns schema.example for a primitive type', () => {
        const result = utils.getExampleObjectFromSchema({}, { type: 'string', example: 'hello' });

        expect(result).toBe('hello');
    });

    it('returns schema.type when no example is provided', () => {
        const result = utils.getExampleObjectFromSchema({}, { type: 'integer' });

        expect(result).toBe('integer');
    });

    it('returns an empty object for an object schema with no properties', () => {
        const result = utils.getExampleObjectFromSchema({}, { type: 'object', properties: {} });

        expect(result).toStrictEqual({});
    });

    it('returns undefined when schema has neither example nor type', () => {
        const result = utils.getExampleObjectFromSchema({}, {});

        expect(result).toBeUndefined();
    });

    it('builds an object from schema properties', () => {
        const schema = {
            type: 'object',
            properties: {
                id: { type: 'integer', example: 1 },
                name: { type: 'string', example: 'Alice' }
            }
        };

        const result = utils.getExampleObjectFromSchema({}, schema);

        expect(result).toStrictEqual({ id: 1, name: 'Alice' });
    });

    it('builds an array from schema items', () => {
        const schema = {
            type: 'array',
            items: { type: 'string', example: 'item' }
        };

        const result = utils.getExampleObjectFromSchema({}, schema);

        expect(result).toStrictEqual(['item']);
    });

    it('returns the first anyOf alternative when the object schema includes anyOf', () => {
        const schema = {
            type: 'object',
            properties: { id: { type: 'integer', example: 1 } },
            anyOf: [{ type: 'string', example: 'alternative' }]
        };

        const result = utils.getExampleObjectFromSchema({}, schema);

        expect(result).toBe('alternative');
    });

    it('resolves a $ref to a component schema', () => {
        const components = {
            schemas: {
                User: {
                    type: 'object',
                    properties: {
                        id: { type: 'integer', example: 99 }
                    }
                }
            }
        };
        const schema = { $ref: '#/components/schemas/User' };

        const result = utils.getExampleObjectFromSchema(components, schema);

        expect(result).toStrictEqual({ id: 99 });
    });
});

describe('SwaggerUtils.generateOperationBlock', () => {
    const utils = new SwaggerUtils();

    it('generates a GET block without a request body', () => {
        const result = utils.generateOperationBlock(
            'get',
            'https://api.example.com',
            '/users',
            { summary: 'List users' },
            {}
        );

        expect(result).toBe(
            '\n#GET - List users\nGET https://api.example.com/users HTTP/1.1\n\n###'
        );
    });

    it('generates a block with no summary', () => {
        const result = utils.generateOperationBlock('get', 'https://api.example.com', '/health', {}, {});

        expect(result).toBe('\n#GET \nGET https://api.example.com/health HTTP/1.1\n\n###');
    });

    it('generates a POST block with a JSON request body', () => {
        const details = {
            summary: 'Create user',
            requestBody: {
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            properties: {
                                name: { type: 'string', example: 'Alice' }
                            }
                        }
                    }
                }
            }
        };

        const result = utils.generateOperationBlock('post', 'https://api.example.com', '/users', details, {});

        const expectedBody = JSON.stringify({ name: 'Alice' }, null, 2);
        expect(result).toBe(
            `\n#POST - Create user\nPOST https://api.example.com/users HTTP/1.1\nContent-Type: application/json\n${expectedBody}\n\n\n###`
        );
    });
});

describe('SwaggerUtils.generateRestClientOutput', () => {
    it('generates output for a full OpenAPI structure', () => {
        const utils = new SwaggerUtils();
        const openApi = {
            info: { title: 'My API' },
            servers: [{ url: 'https://api.example.com' }],
            paths: {
                '/users': {
                    get: { summary: 'List users' }
                }
            },
            components: {}
        };

        const result = utils.generateRestClientOutput(openApi);

        expect(result).toContain('### My API\n');
        expect(result).toContain('GET https://api.example.com/users HTTP/1.1\n');
    });
});

describe('SwaggerUtils.parseOpenApiYaml', () => {
    it('parses valid OpenAPI YAML and returns REST client output', () => {
        const utils = new SwaggerUtils();
        const yaml = `
info:
  title: Test API
servers:
  - url: https://api.test.com
paths:
  /ping:
    get:
      summary: Ping
components: {}
`;

        const result = utils.parseOpenApiYaml(yaml);

        expect(result).toContain('### Test API\n');
        expect(result).toContain('GET https://api.test.com/ping HTTP/1.1\n');
    });

    it('throws when YAML is invalid', () => {
        const utils = new SwaggerUtils();

        expect(() => utils.parseOpenApiYaml('{')).toThrow();
    });
});
