import * as core from "@actions/core";

import { PassThrough, Stream } from "stream";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Session, cloudApi, serviceClients, waitForOperation } from "@yandex-cloud/nodejs-sdk";

import archiver from "archiver";

/**
 * Input validation utilities
 */
function validateNumericInput(value: string, name: string, min?: number, max?: number): number {
    if (!value || value.trim() === '') {
        return 0; // Return default for empty values
    }
    
    const parsed = Number.parseFloat(value.trim());
    if (Number.isNaN(parsed)) {
        throw new Error(`Invalid ${name}: "${value}" is not a valid number`);
    }
    
    if (min !== undefined && parsed < min) {
        throw new Error(`Invalid ${name}: ${parsed} is below minimum value of ${min}`);
    }
    
    if (max !== undefined && parsed > max) {
        throw new Error(`Invalid ${name}: ${parsed} exceeds maximum value of ${max}`);
    }
    
    return parsed;
}

function sanitizeInput(value: string): string {
    return value?.trim() || '';
}

function validateRequiredInput(value: string, name: string): string {
    const sanitized = sanitizeInput(value);
    if (!sanitized) {
        throw new Error(`Required input "${name}" is missing or empty`);
    }
    return sanitized;
}

/**
 * Typed input parameters
 */
interface IActionInputs {
    functionId: string;
    token: string;
    accessKeyId: string;
    secretAccessKey: string;
    runtime: string;
    entrypoint: string;
    memory: string;
    source: string;
    sourceIgnore: string;
    executionTimeout: string;
    environment: string;
    serviceAccount: string;
    bucket: string;
    description: string;
};

async function run() {
    core.setCommandEcho(true);

    try {
        const inputs: IActionInputs = {
            functionId: validateRequiredInput(core.getInput("function_id", { required: true }), "function_id"),
            token: validateRequiredInput(core.getInput("token", { required: true }), "token"),
            accessKeyId: sanitizeInput(core.getInput("accessKeyId", { required: false })),
            secretAccessKey: sanitizeInput(core.getInput("secretAccessKey", { required: false })),
            runtime: validateRequiredInput(core.getInput("runtime", { required: true }), "runtime"),
            entrypoint: validateRequiredInput(core.getInput("entrypoint", { required: true }), "entrypoint"),
            memory: sanitizeInput(core.getInput("memory", { required: false })) || "128",
            source: sanitizeInput(core.getInput("source", { required: false })) || ".",
            sourceIgnore: sanitizeInput(core.getInput("exclude", { required: false })),
            executionTimeout: sanitizeInput(core.getInput("execution_timeout", { required: false })) || "5",
            environment: sanitizeInput(core.getInput("environment", { required: false })),
            serviceAccount: sanitizeInput(core.getInput("service_account", { required: false })),
            bucket: sanitizeInput(core.getInput("bucket", { required: false })),
            description: sanitizeInput(core.getInput("description", { required: false })),
        };

        core.info("Function inputs set");

        const fileContents = await zipDirectory(inputs);

        core.info(`Buffer size: ${Buffer.byteLength(fileContents)}b`);

        // OAuth token
        // Initialize SDK with your token
        const session = new Session({ oauthToken: inputs.token });

        await tryStoreObjectInBucket(inputs, fileContents);

        const functionObject = await getFunctionById(session, inputs);

        await createFunctionVersion(session, functionObject, fileContents, inputs);

        core.setOutput("time", new Date().toTimeString());
    }
    catch (error) {
        core.setFailed(error instanceof Error ? error.message : String(error));
    }
}

async function tryStoreObjectInBucket(inputs: IActionInputs, fileContents: Buffer) {
    if (!inputs.bucket)
        return;

    if (!inputs.accessKeyId || !inputs.secretAccessKey) {
        throw new Error("Missing ACCESS_KEY_ID or SECRET_ACCESS_KEY when bucket is specified");
    }

    // setting object name
    const bucketObjectName = constructBucketObjectName(inputs);
    core.info(`Upload to bucket: "${inputs.bucket}/${bucketObjectName}"`);

    // create AWS client
    const client = new S3Client({
        region: "ru-central1",
        signingRegion: "ru-central1",
        endpoint: "https://storage.yandexcloud.net",
        forcePathStyle: true,
        credentials: {
            accessKeyId: inputs.accessKeyId,
            secretAccessKey: inputs.secretAccessKey
        },
    });

    // create PUT Object command
    const cmd = new PutObjectCommand({
        Key: bucketObjectName,
        Bucket: inputs.bucket,
        Body: fileContents
    });

    await client.send(cmd);
}

function handleOperationError(operation: cloudApi.operation.operation.Operation) {
    if (operation.error) {
        const details = operation.error?.details;
        if (details)
            throw new Error(`${operation.error.code}: ${operation.error.message} (${details.join(", ")})`);

        throw new Error(`${operation.error.code}: ${operation.error.message}`);
    }
}

async function getFunctionById(session: Session, inputs: IActionInputs): Promise<cloudApi.serverless.functions_function.Function> {
    const functionService = session.client(serviceClients.FunctionServiceClient);
    const { serverless: { functions_function_service: { GetFunctionRequest } } } = cloudApi;

    core.startGroup(`Get function by ID: "${inputs.functionId}"`);

    try {
        // Check if Function exist
        const foundFunction = await functionService.get(GetFunctionRequest.fromPartial({ functionId: inputs.functionId }));

        if (foundFunction) {
            core.info(`Function found: "${foundFunction.id} (${foundFunction.name})"`);

            return foundFunction;
        }

        throw new Error(`Failed to find function with ID: ${inputs.functionId}`);
    }
    finally {
        core.endGroup();
    }
}

async function createFunctionVersion(session: Session, targetFunction: cloudApi.serverless.functions_function.Function, fileContents: Buffer, inputs: IActionInputs) {
    const functionService = session.client(serviceClients.FunctionServiceClient);
    const { serverless: { functions_function: { Package }, functions_function_service: { CreateFunctionVersionRequest } } } = cloudApi;

    core.startGroup("Create function version");

    try {
        core.info(`Function ${inputs.functionId}`);

        // Convert and validate variables
        const memory = validateNumericInput(inputs.memory, "memory", 128, 4096); // 128MB to 4GB
        core.info(`Parsed memory: "${memory}MB"`);

        const executionTimeout = validateNumericInput(inputs.executionTimeout, "execution_timeout", 1, 900); // 1s to 15min
        core.info(`Parsed timeout: "${executionTimeout}s"`);

        const request = CreateFunctionVersionRequest.fromPartial({
            functionId: targetFunction.id,
            runtime: inputs.runtime,
            entrypoint: inputs.entrypoint,
            resources: {
                memory: memory > 0 ? memory * 1024 * 1024 : 128 * 1024 * 1024, // Default to 128MB
            },
            serviceAccountId: inputs.serviceAccount,
            description: inputs.description,
            environment: parseEnvironmentVariables(inputs.environment),
            executionTimeout: { seconds: executionTimeout }
        });

        // get from bucket if supplied
        if (inputs.bucket) {
            core.info(`From bucket: "${inputs.bucket}"`);

            request.package = Package.fromPartial({
                bucketName: inputs.bucket,
                objectName: constructBucketObjectName(inputs)
            });
        }
        else
            request.content = fileContents;

        // Create new version
        const operation = await functionService.createVersion(request);
        const result = await waitForOperation(operation, session);
        core.info("Operation complete");

        handleOperationError(result);
    }
    finally {
        core.endGroup();
    }
}

/**
 * Generates object name
 * @param inputs parameters
 * @returns object name
 */
function constructBucketObjectName(inputs: IActionInputs): string {
    const { GITHUB_SHA } = process.env;

    // check SHA present
    if (!GITHUB_SHA) {
        throw new Error("Missing GITHUB_SHA environment variable");
    }

    return `${inputs.functionId}/${GITHUB_SHA}.zip`;
}

/**
 * Allows to zip input contents
 * @param inputs parameters
 */
async function zipDirectory(inputs: IActionInputs): Promise<Buffer> {
    core.startGroup("ZipDirectory");

    try {
        const bufferStream = new PassThrough();

        const archive = archiver("zip", { zlib: { level: 9 } });
        core.info("Archive initialize");

        archive.pipe(bufferStream);

        await archive
            .glob("**", {
                cwd: inputs.source,
                dot: true,
                ignore: parseIgnoreGlobPatterns(inputs.sourceIgnore)
            })
            .finalize();

        core.info("Archive finalized");

        bufferStream.end();
        const buffer = await streamToBuffer(bufferStream);

        if (!buffer)
            throw new Error("Failed to initialize buffer from stream");

        core.info("Buffer object created");

        return buffer;
    }
    finally {
        core.endGroup();
    }
}

function parseIgnoreGlobPatterns(ignoreString: string): string[] {
    if (!ignoreString || ignoreString.trim() === '') {
        return [];
    }
    
    const result: string[] = [];
    const patterns = ignoreString.split(",");

    patterns.forEach(pattern => {
        const trimmed = pattern.trim();
        // only non-empty patterns after trimming
        if (trimmed.length > 0) {
            result.push(trimmed);
        }
    });

    core.info(`Source ignore patterns: "${JSON.stringify(result)}"`);
    return result;
}

function streamToBuffer(stream: Stream): Promise<Buffer> {
    const chunks: Uint8Array[] = [];

    return new Promise((resolve, reject) => {
        stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        stream.on("error", (err) => reject(err));
        stream.on("end", () => resolve(Buffer.concat(chunks)));
    });
}

function parseEnvironmentVariables(env: string): { [s: string]: string; } {
    if (!env || env.trim() === '') {
        return {};
    }
    
    core.info(`Environment string provided: ${env.length} characters`);

    const envObject: { [s: string]: string; } = {};
    const kvs = env.split(",");
    
    kvs.forEach((kv, index) => {
        const trimmed = kv.trim();
        if (!trimmed) return; // Skip empty entries
        
        const eqIndex = trimmed.indexOf("=");
        if (eqIndex === -1) {
            core.warning(`Skipping invalid environment variable at index ${index}: "${trimmed}" (missing =)`);
            return;
        }
        
        const key = trimmed.substring(0, eqIndex).trim();
        const value = trimmed.substring(eqIndex + 1).trim();
        
        if (!key) {
            core.warning(`Skipping environment variable with empty key at index ${index}`);
            return;
        }
        
        envObject[key] = value;
    });

    core.info(`Parsed ${Object.keys(envObject).length} environment variables`);
    return envObject;
}

run();
