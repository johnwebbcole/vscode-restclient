export interface PostmanVariable {
    key: string;
    value: string;
    type?: string;
    disabled?: boolean;
}

export interface PostmanHeader {
    key: string;
    value: string;
    disabled?: boolean;
}

export interface PostmanUrlQueryParam {
    key: string;
    value: string;
    disabled?: boolean;
}

export interface PostmanUrl {
    raw: string;
    protocol?: string;
    host?: string[];
    path?: string[];
    query?: PostmanUrlQueryParam[];
}

export interface PostmanBodyRawOptions {
    raw?: {
        language: string;
    };
}

export interface PostmanFormParam {
    key: string;
    value?: string;
    type: 'text' | 'file';
    src?: string;
    disabled?: boolean;
}

export interface PostmanBody {
    mode?: 'raw' | 'urlencoded' | 'formdata' | 'graphql' | 'file';
    raw?: string;
    options?: PostmanBodyRawOptions;
    urlencoded?: PostmanUrlQueryParam[];
    formdata?: PostmanFormParam[];
    graphql?: {
        query: string;
        variables?: string;
    };
}

export interface PostmanAuthParam {
    key: string;
    value: string;
    type?: string;
}

export interface PostmanAuth {
    type: string;
    bearer?: PostmanAuthParam[];
    basic?: PostmanAuthParam[];
    apikey?: PostmanAuthParam[];
}

export interface PostmanRequest {
    method: string;
    header?: PostmanHeader[];
    body?: PostmanBody;
    url: PostmanUrl | string;
    auth?: PostmanAuth;
}

export interface PostmanScript {
    type?: string;
    exec: string[];
}

export interface PostmanEvent {
    listen: 'test' | 'prerequest';
    script: PostmanScript;
}

export interface PostmanItem {
    name: string;
    request?: PostmanRequest;
    item?: PostmanItem[];
    event?: PostmanEvent[];
}

export interface PostmanCollectionInfo {
    name: string;
    schema: string;
    _postman_id?: string;
}

export interface PostmanCollection {
    info: PostmanCollectionInfo;
    item: PostmanItem[];
    variable?: PostmanVariable[];
}

export interface PostmanEnvironmentValue {
    key: string;
    value: string;
    enabled?: boolean;
    type?: string;
}

export interface PostmanEnvironment {
    id?: string;
    name: string;
    values: PostmanEnvironmentValue[];
    _postman_variable_scope?: string;
}

export const PostmanSchemaV21 = 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json';
