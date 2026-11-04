import * as core from "@actions/core";
import { function as fn } from "@yandex-cloud/nodejs-sdk/serverless-functions-v1";
import { logEntry } from "@yandex-cloud/nodejs-sdk/logging-v1";

import { IAuthInputs } from "./auth";

const MB = 1024 * 1024;
const GB = 1024 * MB;

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

export function readInputs(): IActionInputs {
    return {
        functionId: required("function_id"),
        runtime: required("runtime"),
        entrypoint: required("entrypoint"),
        description: input("description"),

        token: input("token"),
        iamToken: input("iam_token"),
        serviceAccountKey: input("service_account_key"),
        oidcServiceAccountId: input("oidc_service_account_id"),
        oidcAudience: input("oidc_audience"),

        source: input("source") || ".",
        include: splitList(input("include")),
        exclude: splitList(input("exclude")),
        bucket: input("bucket"),
        accessKeyId: input("accessKeyId"),
        secretAccessKey: input("secretAccessKey"),

        memoryBytes: number("memory", 128, 8192, 128) * MB,
        executionTimeoutSeconds: number("execution_timeout", 1, 3600, 5),
        environment: parseEnvironment(input("environment")),
        serviceAccount: input("service_account"),
        tags: splitList(input("tags")),
        secrets: splitList(input("secrets"), /[\n;]/).map(parseSecret),
        logOptions: parseLogOptions(input("log_group_id"), input("log_min_level"), input("log_disabled")),
        networkId: input("network_id"),
        concurrency: number("concurrency", 1, 16, 0),
        tmpfsSizeBytes: number("tmpfs_size", 0, 8192, 0) * MB,
        mounts: splitList(input("mounts"), /[\n;]/).map(parseMount),
        metadataOptions: parseMetadataOptions(input("metadata_options")),
    };
}

function input(name: string): string {
    return core.getInput(name).trim();
}

function required(name: string): string {
    const value = input(name);
    if (!value) {
        throw new Error(`Required input "${name}" is missing or empty`);
    }
    return value;
}

/** Parses an optional numeric input; empty means `fallback`, out-of-range values are rejected. */
function number(name: string, min: number, max: number, fallback: number): number {
    const raw = input(name);
    if (!raw) {
        return fallback;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
        throw new Error(`Invalid ${name}: "${raw}" (expected a number between ${min} and ${max})`);
    }
    return parsed;
}

/** Splits a list input on `separator` (comma by default), trimming and dropping empty entries. */
export function splitList(value: string, separator: string | RegExp = ","): string[] {
    return value.split(separator).map(s => s.trim()).filter(Boolean);
}

/** `KEY=value,KEY2=value2`. Entries without `=` or with an empty key are skipped with a warning. */
export function parseEnvironment(value: string): Record<string, string> {
    const env: Record<string, string> = {};
    for (const entry of splitList(value)) {
        const eq = entry.indexOf("=");
        const key = eq > 0 ? entry.slice(0, eq).trim() : "";
        if (!key) {
            core.warning(`Skipping invalid environment entry "${entry}" (expected KEY=value)`);
            continue;
        }
        env[key] = entry.slice(eq + 1).trim();
    }
    return env;
}

/** `ENV_VAR=<secret_id>/<version_id>/<key>` */
export function parseSecret(entry: string): fn.Secret {
    const match = /^([^=\s]+)\s*=\s*([^/\s]+)\/([^/\s]+)\/(\S+)$/.exec(entry);
    if (!match) {
        throw new Error(`Invalid secrets entry "${entry}" (expected ENV_VAR=<secret_id>/<version_id>/<key>)`);
    }
    const [, environmentVariable, id, versionId, key] = match;
    return fn.Secret.fromPartial({ environmentVariable, id, versionId, key });
}

/**
 * Object Storage: `name=<mount>,bucket=<bucket>[,prefix=<prefix>][,mode=ro|rw]`
 * Ephemeral disk: `name=<mount>,disk_size=<GB>`
 */
export function parseMount(entry: string): fn.Mount {
    const fields = parseKeyValues(entry, ["name", "bucket", "prefix", "mode", "disk_size"], "mounts");
    if (!fields.name) {
        throw new Error(`Invalid mounts entry "${entry}": name is required`);
    }
    if (Boolean(fields.bucket) === Boolean(fields.disk_size)) {
        throw new Error(`Invalid mounts entry "${entry}": set exactly one of bucket or disk_size`);
    }

    const modes: Record<string, fn.Mount_Mode> = { ro: fn.Mount_Mode.READ_ONLY, rw: fn.Mount_Mode.READ_WRITE };
    const mode = modes[fields.mode || "rw"];
    if (mode === undefined) {
        throw new Error(`Invalid mounts entry "${entry}": mode must be ro or rw`);
    }

    if (fields.bucket) {
        return fn.Mount.fromPartial({
            name: fields.name,
            mode,
            objectStorage: { bucketId: fields.bucket, prefix: fields.prefix || "" },
        });
    }

    const sizeGb = Number(fields.disk_size);
    if (!Number.isInteger(sizeGb) || sizeGb <= 0) {
        throw new Error(`Invalid mounts entry "${entry}": disk_size must be a whole number of GB`);
    }
    return fn.Mount.fromPartial({ name: fields.name, mode, ephemeralDiskSpec: { size: sizeGb * GB } });
}

/** `gce_http_endpoint=enabled|disabled,aws_v1_http_endpoint=enabled|disabled` */
export function parseMetadataOptions(value: string): fn.MetadataOptions | undefined {
    if (!value) {
        return undefined;
    }
    const fields = parseKeyValues(value, ["gce_http_endpoint", "aws_v1_http_endpoint"], "metadata_options");
    const option = (name: string, raw = ""): fn.MetadataOption => {
        const options: Record<string, fn.MetadataOption> = {
            "": fn.MetadataOption.METADATA_OPTION_UNSPECIFIED,
            enabled: fn.MetadataOption.ENABLED,
            disabled: fn.MetadataOption.DISABLED,
        };
        const parsed = options[raw.toLowerCase()];
        if (parsed === undefined) {
            throw new Error(`Invalid metadata_options: ${name} must be enabled or disabled`);
        }
        return parsed;
    };
    return fn.MetadataOptions.fromPartial({
        gceHttpEndpoint: option("gce_http_endpoint", fields.gce_http_endpoint),
        awsV1HttpEndpoint: option("aws_v1_http_endpoint", fields.aws_v1_http_endpoint),
    });
}

export function parseLogOptions(logGroupId: string, minLevel: string, disabled: string): fn.LogOptions | undefined {
    if (!logGroupId && !minLevel && !disabled) {
        return undefined;
    }

    let level = logEntry.LogLevel_Level.LEVEL_UNSPECIFIED;
    if (minLevel) {
        level = logEntry.logLevel_LevelFromJSON(minLevel.toUpperCase());
        if (level === logEntry.LogLevel_Level.UNRECOGNIZED || level === logEntry.LogLevel_Level.LEVEL_UNSPECIFIED) {
            throw new Error(`Invalid log_min_level "${minLevel}" (expected TRACE, DEBUG, INFO, WARN, ERROR or FATAL)`);
        }
    }

    return fn.LogOptions.fromPartial({
        disabled: disabled ? core.getBooleanInput("log_disabled") : false,
        logGroupId: logGroupId || undefined,
        minLevel: level,
    });
}

function parseKeyValues(entry: string, allowed: string[], inputName: string): Record<string, string> {
    const fields: Record<string, string> = {};
    for (const pair of splitList(entry)) {
        const eq = pair.indexOf("=");
        const key = eq > 0 ? pair.slice(0, eq).trim() : pair;
        if (!allowed.includes(key)) {
            throw new Error(`Invalid ${inputName} entry "${entry}": unknown key "${key}" (allowed: ${allowed.join(", ")})`);
        }
        fields[key] = pair.slice(eq + 1).trim();
    }
    return fields;
}
