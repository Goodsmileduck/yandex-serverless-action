import * as cloud from "yandex-cloud";
import * as core from "@actions/core";
import * as streamBuffers from "stream-buffers";

import { CreateFunctionVersionRequest, Function, FunctionService } from "yandex-cloud/api/serverless/functions/v1";
import { StorageObject, StorageService } from "yandex-cloud/lib/storage/v1beta";

import Long from "long";
import { Operation } from "yandex-cloud/api/operation";
import archiver from "archiver";

type ActionInputs = {
    functionId: string,
    token: string,
    runtime: string,
    entrypoint: string,
    memory: string,
    source: string,
    sourceIgnore: string,
    executionTimeout: string,
    environment: string,
    serviceAccount: string,
    bucket: string,
    description: string
};

/**
 * Generated Object name
 */
var bucketObjectName: string;

async function run() {
    core.setCommandEcho(true);

    try {
        let inputs: ActionInputs = {
            functionId: core.getInput("function_id", { required: true }),
            token: core.getInput("token", { required: true }),
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
        const session = new cloud.Session({ oauthToken: inputs.token });
        const functionService = new FunctionService(session);

        if (inputs.bucket) {
            const { GITHUB_SHA } = process.env;

            if (!GITHUB_SHA) {
                core.setFailed("Missing GITHUB_SHA");
                return;
            }

            //setting object name
            bucketObjectName = `${inputs.functionId}/${GITHUB_SHA}.zip`;
            core.info(`Upload to bucket: "${inputs.bucket}/${bucketObjectName}"`);

            const storageService = new StorageService(session);

            let storageObject = StorageObject.fromBuffer(inputs.bucket, bucketObjectName, fileContents);
            await storageService.putObject(storageObject);
        }

        const functionObject = await getFunctionById(functionService, inputs);

        await createFunctionVersion(functionService, functionObject, fileContents, inputs);

        core.setOutput("time", new Date().toTimeString());
    }
    catch (error) {
        core.setFailed(error.message);
    }
}

function handleOperationError(operation: Operation) {
    if (operation.error) {
        let details = operation.error?.details;
        if (details)
            throw Error(`${operation.error.code}: ${operation.error.message} (${details.join(", ")})`);

        throw Error(`${operation.error.code}: ${operation.error.message}`);
    }
}

async function getFunctionById(functionService: FunctionService, inputs: ActionInputs) {
    core.startGroup(`Get function by ID: "${inputs.functionId}"`);

    try {
        // Check if Function exist
        const foundFunction = await functionService.get({ functionId: inputs.functionId });

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

async function createFunctionVersion(functionService: FunctionService, targetFunction: Function, fileContents: Buffer, inputs: ActionInputs) {
    core.startGroup("Create function version");
    try {
        core.info(`Function ${inputs.functionId}`);

        //convert variables
        let memory = Number.parseFloat(inputs.memory);
        core.info(`Parsed memory: "${memory}"`);

        let executionTimeout = Number.parseFloat(inputs.executionTimeout);
        core.info(`Parsed timeout: "${executionTimeout}"`);

        let request: CreateFunctionVersionRequest = {
            functionId: targetFunction.id,
            runtime: inputs.runtime,
            entrypoint: inputs.entrypoint,
            resources: {
                memory: memory ? Long.fromNumber(memory * 1024 * 1024) : undefined,
            },
            serviceAccountId: inputs.serviceAccount,
            description: inputs.description,
            environment: parseEnvironmentVariables(inputs.environment),
            executionTimeout: { seconds: Long.fromNumber(executionTimeout) }
        };

        //get from bucket if supplied
        if (inputs.bucket) {
            core.info(`From bucket: "${inputs.bucket}"`);

            request.package = {
                bucketName: inputs.bucket,
                objectName: bucketObjectName
            };
        }
        else
            request.content = fileContents;

        // Create new version
        let operation = await functionService.createVersion(request);

        core.info("Operation complete");

        handleOperationError(operation);
    }
    finally {
        core.endGroup();
    }
}

async function zipDirectory(inputs: ActionInputs) {
    core.startGroup("ZipDirectory");

    try {
        let outputStreamBuffer = new streamBuffers.WritableStreamBuffer({
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
        let buffer = outputStreamBuffer.getContents();
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
    var result: string[] = [];
    var patterns = ignoreString.split(",");

    patterns.forEach(pattern => {
        //only not empty patterns
        if (pattern?.length > 0)
            result.push(pattern);
    });

    core.info(`Source ignore pattern: "${JSON.stringify(result)}"`);
    return result;
}

function parseEnvironmentVariables(env: string): { [s: string]: string } {
    core.info(`Environment string: "${env}"`);

    let envObject = {};
    var kvs = env.split(",");
    kvs.forEach(kv => {
        let res = kv.split("=");
        let key = res[0];
        let value = res[1];
        envObject[key] = value;
    });

    core.info(`EnvObject: "${JSON.stringify(envObject)}"`);
    return envObject;
}

run();