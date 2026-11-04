import { function as fn } from "@yandex-cloud/nodejs-sdk/serverless-functions-v1";
import { IAuthInputs } from "./auth";
export interface IActionInputs extends IAuthInputs {
    functionId: string;
    runtime: string;
    entrypoint: string;
    description: string;
    source: string;
    include: string[];
    exclude: string[];
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
    memoryBytes: number;
    executionTimeoutSeconds: number;
    environment: Record<string, string>;
    serviceAccount: string;
    tags: string[];
    secrets: fn.Secret[];
    logOptions: fn.LogOptions | undefined;
    networkId: string;
    concurrency: number;
    tmpfsSizeBytes: number;
    mounts: fn.Mount[];
    metadataOptions: fn.MetadataOptions | undefined;
}
export declare function readInputs(): IActionInputs;
