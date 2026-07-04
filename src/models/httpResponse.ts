import { getContentType } from '../utils/misc';
import { ResponseHeaders } from './base';
import { HttpRequest } from "./httpRequest";

type TimingPhases = {
    wait?: number;
    dns?: number;
    tcp?: number;
    tls?: number;
    request?: number;
    firstByte?: number;
    download?: number;
    total?: number;
};

export class HttpResponse {
    public constructor(
        public statusCode: number,
        public statusMessage: string,
        public httpVersion: string,
        public headers: ResponseHeaders,
        public body: string,
        public bodySizeInBytes: number,
        public headersSizeInBytes: number,
        public bodyBuffer: Buffer,
        public timingPhases: TimingPhases,
        public request: HttpRequest) {
    }

    public get contentType(): string | undefined {
        return getContentType(this.headers);
    }
}