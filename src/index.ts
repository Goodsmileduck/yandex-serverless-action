import * as core from "@actions/core";
import * as streamBuffers from "stream-buffers";

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Session, cloudApi, serviceClients } from "@yandex-cloud/nodejs-sdk";

import archiver from "archiver";

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

/**
 * Generated Object name
 */
let bucketObjectName: string;

async function run() {
    core.setCommandEcho(true);

    try {
        const inputs: IActionInputs = {
            functionId: core.getInput("function_id", { required: true }),
            token: core.getInput("token", { required: true }),
            accessKeyId: core.getInput("ACCESS_KEY_ID", { required: false }),
            secretAccessKey: core.getInput("SECRET_ACCESS_KEY", { required: false }),
            runtime: core.getInput("runtime", { required: true }),
            entrypoint: core.getInput("entrypoint", { required: true }),
            memory: core.getInput("memory", { required: false }),
            source: core.getInput("source", { required: false }),
            sourceIgnore: core.getInput("exclude", { required: false }),
            executionTimeout: core.getInput("execution_timeout", { required: false }),
            environment: core.getInput("environment", { required: false }),
            serviceAccount: core.getInput("service_account", { required: false }),
            bucket: core.getInput("bucket", { required: false }),
            description: core.getInput("description", { required: false }),
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
        core.setFailed(error.message);
    }
}

async function tryStoreObjectInBucket(inputs: IActionInputs, fileContents: Buffer) {
    if (!inputs.bucket)
        return;

    const { GITHUB_SHA } = process.env;

    if (!GITHUB_SHA) {
        core.setFailed("Missing GITHUB_SHA");
        return;
    }

    if (!inputs.accessKeyId || !inputs.secretAccessKey) {
        core.setFailed("Missing ACCESS_KEY_ID or SECRET_ACCESS_KEY");
        return;
    }

    // setting object name
    const bucketObjectName = `${inputs.functionId}/${GITHUB_SHA}.zip`;
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
            throw Error(`${operation.error.code}: ${operation.error.message} (${details.join(", ")})`);

        throw Error(`${operation.error.code}: ${operation.error.message}`);
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

        throw Error("Failed to find Function by id");
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

        //convert variables
        const memory = Number.parseFloat(inputs.memory);
        core.info(`Parsed memory: "${memory}"`);

        const executionTimeout = Number.parseFloat(inputs.executionTimeout);
        core.info(`Parsed timeout: "${executionTimeout}"`);

        const request = CreateFunctionVersionRequest.fromPartial({
            functionId: targetFunction.id,
            runtime: inputs.runtime,
            entrypoint: inputs.entrypoint,
            resources: {
                memory: memory ? memory * 1024 * 1024 : undefined,
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
                objectName: bucketObjectName
            });
        }
        else
            request.content = fileContents;

        // Create new version
        const operation = await functionService.createVersion(request);

        core.info("Operation complete");

        handleOperationError(operation);
    }
    finally {
        core.endGroup();
    }
}

async function zipDirectory(inputs: IActionInputs) {
    core.startGroup("ZipDirectory");

    try {
        const outputStreamBuffer = new streamBuffers.WritableStreamBuffer({
            initialSize: (1000 * 1024),   // start at 1000 kilobytes.
            incrementAmount: (1000 * 1024) // grow by 1000 kilobytes each time buffer overflows.
        });

        const archive = archiver("zip", { zlib: { level: 9 } });
        core.info("Archive initialize");

        archive.pipe(outputStreamBuffer);

        await archive
            .glob("**", {
                cwd: inputs.source,
                dot: true,
                ignore: parseIgnoreGlobPatterns(inputs.sourceIgnore)
            })
            .finalize();

        core.info("Archive finalized");

        outputStreamBuffer.end();
        const buffer = outputStreamBuffer.getContents();
        core.info("Buffer object created");

        if (!buffer)
            throw Error("Failed to initialize Buffer");

        return buffer;
    }
    finally {
        core.endGroup();
    }
}

function parseIgnoreGlobPatterns(ignoreString: string): string[] {
    const result: string[] = [];
    const patterns = ignoreString.split(",");

    patterns.forEach(pattern => {
        //only not empty patterns
        if (pattern?.length > 0)
            result.push(pattern);
    });

    core.info(`Source ignore pattern: "${JSON.stringify(result)}"`);
    return result;
}

function parseEnvironmentVariables(env: string): { [s: string]: string; } {
    core.info(`Environment string: "${env}"`);

    const envObject = {};
    const kvs = env.split(",");
    kvs.forEach(kv => {
        const eqIndex = kv.indexOf('=');
        const key = kv.substr(0, eqIndex);
        const value = kv.substr(eqIndex + 1);
        envObject[key] = value;
    });

    core.info(`EnvObject: "${JSON.stringify(envObject)}"`);
    return envObject;
}

run();
