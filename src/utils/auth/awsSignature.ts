import aws4 = require('aws4');

type BeforeRequestHook = (options: any) => Promise<any>;

export function awsSignature(authorization: string): BeforeRequestHook {
    const [ , accessKeyId, secretAccessKey ] = authorization.split(/\s+/);
    const credentials = {
        accessKeyId,
        secretAccessKey,
        sessionToken: /token:(\S*)/.exec(authorization)?.[1]
    };
    const awsScope = {
        region: /region:(\S*)/.exec(authorization)?.[1],
        service: /service:(\S*)/.exec(authorization)?.[1]
    };

    return async options => {
        const result = aws4.sign({...options, ...awsScope}, credentials);
        return result;
    };
}