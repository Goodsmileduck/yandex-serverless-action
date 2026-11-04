import * as core from "@actions/core";

import { once } from "events";
import { readFile, stat } from "fs/promises";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Session, waitForOperation } from "@yandex-cloud/nodejs-sdk";
import { functionService } from "@yandex-cloud/nodejs-sdk/serverless-functions-v1";

import { ZipArchive } from "archiver";
import { resolveIamToken } from "./auth";
import { IActionInputs, readInputs } from "./config";

async function run() {
    core.setCommandEcho(true);

    try {
        const inputs = readInputs();
        core.info("Function inputs set");

        const content = await buildPackage(inputs);
        core.info(`Package size: ${content.length}b`);

        const iamToken = await resolveIamToken(inputs);
        const session = new Session({ iamToken });

        const objectName = inputs.bucket ? await uploadToBucket(inputs, content, iamToken) : undefined;

        const versionId = await createFunctionVersion(session, inputs, objectName ? undefined : content, objectName);

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

        // Consume the archive while it is being written: buffering it in an unread
        // stream stalls archiver on large sources and truncated the zip (issue #37).
        const chunks: Buffer[] = [];
        archive.on("data", (chunk: Buffer) => chunks.push(chunk));
        const ended = once(archive, "end");

        await archive.glob(include, { cwd: inputs.source, dot: true, ignore: inputs.exclude }).finalize();
        await ended;

        if (archive.pointer() <= 22) {
            throw new Error(`No files matched in "${inputs.source}" with the given include/exclude patterns`);
        }
        return Buffer.concat(chunks);
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

    if (inputs.accessKeyId || inputs.secretAccessKey) {
        if (!inputs.accessKeyId || !inputs.secretAccessKey) {
            throw new Error("Set both accessKeyId and secretAccessKey, or neither to upload with the IAM token");
        }
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
        body: new Uint8Array(content),
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

async function createFunctionVersion(session: Session, inputs: IActionInputs, content: Buffer | undefined, objectName: string | undefined): Promise<string> {
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
        core.info(`Runtime ${request.runtime}, memory ${request.resources!.memory / 1024 / 1024}MB, ` +
            `timeout ${inputs.executionTimeoutSeconds}s, ${Object.keys(request.environment).length} env vars, ` +
            `${request.secrets.length} secrets, ${request.mounts.length} mounts, tags ${JSON.stringify(request.tag)}`);

        const operation = await waitForOperation(await client.createVersion(request), session);
        if (operation.error) {
            const { code, message, details } = operation.error;
            throw new Error(`${code}: ${message}${details.length ? ` (${details.join(", ")})` : ""}`);
        }

        const versionId = functionService.CreateFunctionVersionMetadata.decode(operation.metadata!.value).functionVersionId;
        core.info(`Created version ${versionId}`);
        return versionId;
    }
    finally {
        core.endGroup();
    }
}

run();
