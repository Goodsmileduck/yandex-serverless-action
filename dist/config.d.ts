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
/** Splits a list input on `separator` (comma by default), trimming and dropping empty entries. */
export declare function splitList(value: string, separator?: string | RegExp): string[];
/** `KEY=value,KEY2=value2`. Entries without `=` or with an empty key are skipped with a warning. */
export declare function parseEnvironment(value: string): Record<string, string>;
/** `ENV_VAR=<secret_id>/<version_id>/<key>` */
export declare function parseSecret(entry: string): fn.Secret;
/**
 * Object Storage: `name=<mount>,bucket=<bucket>[,prefix=<prefix>][,mode=ro|rw]`
 * Ephemeral disk: `name=<mount>,disk_size=<GB>`
 */
export declare function parseMount(entry: string): fn.Mount;
/** `gce_http_endpoint=enabled|disabled,aws_v1_http_endpoint=enabled|disabled` */
export declare function parseMetadataOptions(value: string): fn.MetadataOptions | undefined;
export declare function parseLogOptions(logGroupId: string, minLevel: string, disabled: string): fn.LogOptions | undefined;
