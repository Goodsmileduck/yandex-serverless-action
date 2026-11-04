import * as core from "@actions/core";

import { readFile, stat } from "fs/promises";
import { buffer } from "stream/consumers";
import { Session, waitForOperation } from "@yandex-cloud/nodejs-sdk";
import { operation as op } from "@yandex-cloud/nodejs-sdk/operation";
import { functionService } from "@yandex-cloud/nodejs-sdk/serverless-functions-v1";

import { ZipArchive } from "archiver";
import { resolveIamToken } from "./auth";
import { IActionInputs, readInputs } from "./config";

async function run() {
    core.setCommandEcho(true);

    try {
        const inputs = readInputs();
        core.info("Function inputs set");

        const [content, iamToken] = await Promise.all([buildPackage(inputs), resolveIamToken(inputs)]);
        core.info(`Package size: ${content.length}b`);

        const session = new Session({ iamToken });
        const objectName = inputs.bucket ? await uploadToBucket(inputs, content, iamToken) : undefined;
        const versionId = await createFunctionVersion(session, inputs, content, objectName);

        core.setOutput("version_id", versionId);
        core.setOutput("time", new Date().toTimeString());
    }
    catch (error) {
        core.setFailed(error instanceof Error ? error.message : String(error));
    }
}

/** Uses `source` as-is when it is a .zip file, otherwise zips the directory. */
async function buildPackage(inputs: IActionInputs): Promise<Buffer> {
    if (inputs.source.toLowerCase().endsWith(".zip") && (await stat(inputs.source)).isFile()) {
        core.info(`Using prebuilt archive "${inputs.source}" (include/exclude are ignored)`);
        return readFile(inputs.source);
    }
    return zipDirectory(inputs);
}

async function zipDirectory(inputs: IActionInputs): Promise<Buffer> {
    core.startGroup("ZipDirectory");

    try {
        const include = inputs.include.length ? inputs.include : ["**"];
        core.info(`Include patterns: ${JSON.stringify(include)}, exclude patterns: ${JSON.stringify(inputs.exclude)}`);

        const archive = new ZipArchive({ zlib: { level: 9 } });
        let entries = 0;
        archive.on("entry", () => entries++);
        archive.on("warning", (err: Error) => core.warning(`Archive: ${err.message}`));

        // Read the archive while it is being written; leaving it unread stalls archiver
        // on large sources and truncated the zip (issue #37).
        const content = buffer(archive);
        await archive.glob(include, { cwd: inputs.source, dot: true, ignore: inputs.exclude }).finalize();

        if (entries === 0) {
            throw new Error(`No files matched in "${inputs.source}" with the given include/exclude patterns`);
        }
        return await content;
    }
    finally {
        core.endGroup();
    }
}

/** Uploads the package to `bucket` and returns the object name. */
async function uploadToBucket(inputs: IActionInputs, content: Buffer, iamToken: string): Promise<string> {
    const { GITHUB_SHA } = process.env;
    if (!GITHUB_SHA) {
        throw new Error("Missing GITHUB_SHA environment variable");
    }
    const objectName = `${inputs.functionId}/${GITHUB_SHA}.zip`;
    core.info(`Upload to bucket: "${inputs.bucket}/${objectName}"`);

    if (inputs.accessKeyId) {
        // Loaded only for the static-key path; the IAM-token path needs no S3 SDK.
        const { PutObjectCommand, S3Client } = await import("@aws-sdk/client-s3");
        const client = new S3Client({
            region: "ru-central1",
            endpoint: "https://storage.yandexcloud.net",
            forcePathStyle: true,
            credentials: { accessKeyId: inputs.accessKeyId, secretAccessKey: inputs.secretAccessKey },
        });
        await client.send(new PutObjectCommand({ Bucket: inputs.bucket, Key: objectName, Body: content }));
        return objectName;
    }

    // Object Storage accepts IAM tokens directly; no static keys needed.
    const response = await fetch(`https://storage.yandexcloud.net/${inputs.bucket}/${objectName}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${iamToken}`, "Content-Type": "application/zip" },
        body: content as Uint8Array<ArrayBuffer>,
    });
    if (!response.ok) {
        const detail = (await response.text()).slice(0, 500);
        throw new Error(
            `Upload to bucket "${inputs.bucket}" failed (HTTP ${response.status}): ${detail}. ` +
            "The service account needs storage.uploader on the bucket."
        );
    }
    return objectName;
}

async function createFunctionVersion(session: Session, inputs: IActionInputs, content: Buffer, objectName: string | undefined): Promise<string> {
    const client = session.client(functionService.FunctionServiceClient);

    core.startGroup(`Create function version for "${inputs.functionId}"`);
    try {
        const request = functionService.CreateFunctionVersionRequest.fromPartial({
            functionId: inputs.functionId,
            runtime: inputs.runtime,
            entrypoint: inputs.entrypoint,
            description: inputs.description,
            resources: { memory: inputs.memoryBytes },
            executionTimeout: { seconds: inputs.executionTimeoutSeconds },
            serviceAccountId: inputs.serviceAccount,
            environment: inputs.environment,
            tag: inputs.tags,
            secrets: inputs.secrets,
            concurrency: inputs.concurrency,
            tmpfsSize: inputs.tmpfsSizeBytes,
            mounts: inputs.mounts,
        });
        if (inputs.logOptions) request.logOptions = inputs.logOptions;
        if (inputs.metadataOptions) request.metadataOptions = inputs.metadataOptions;
        if (inputs.networkId) request.connectivity = { networkId: inputs.networkId, subnetId: [] };
        if (objectName) request.package = { bucketName: inputs.bucket, objectName, sha256: "" };
        else request.content = content;
        core.info(`Runtime ${inputs.runtime}, memory ${inputs.memoryBytes / 1024 / 1024}MB, ` +
            `timeout ${inputs.executionTimeoutSeconds}s, ${Object.keys(inputs.environment).length} env vars, ` +
            `${inputs.secrets.length} secrets, ${inputs.mounts.length} mounts, tags ${JSON.stringify(inputs.tags)}`);

        // waitForOperation rejects with the failed Operation itself, not an Error.
        const operation = await waitForOperation(await client.createVersion(request), session).catch((failed: unknown) => {
            if (failed instanceof Error) throw failed;
            const error = (failed as op.Operation).error;
            throw new Error(`Create version failed: ${error?.code}: ${error?.message ?? JSON.stringify(failed)}`);
        });

        const versionId = functionService.CreateFunctionVersionMetadata.decode(operation.metadata!.value).functionVersionId;
        core.info(`Created version ${versionId}`);
        return versionId;
    }
    finally {
        core.endGroup();
    }
}

run();
