import * as cloud from "yandex-cloud";
import * as core from "@actions/core";
import * as streamBuffers from "stream-buffers";

import { Function, FunctionService } from "yandex-cloud/api/serverless/functions/v1";

import Long from "long";
import { Operation } from "yandex-cloud/api/operation";
import archiver from "archiver";

type ActionInputs = {
    functionName: string,
    folderId: string,
    token: string,
    runtime: string,
    entrypoint: string,
    memory: string,
    source: string,
    executionTimeout: string,
    environment: string
};

async function run() {
    core.setCommandEcho(true);

    try {
        let inputs: ActionInputs = {
            functionName: core.getInput("function_name", { required: true }),
            folderId: core.getInput("folder_id", { required: true }),
            token: core.getInput("token", { required: true }),
            runtime: core.getInput("runtime", { required: true }),
            entrypoint: core.getInput("entrypoint", { required: true }),
            memory: core.getInput("memory", { required: false }),
            source: core.getInput("source", { required: false }),
            executionTimeout: core.getInput("execution_timeout", { required: false }),
            environment: core.getInput("environment", { required: false })
        };

        core.info("Parsed inputs");

        const fileContents = await zipDirectory(inputs.source);

        core.info("Archive inmemory buffer created");

        if (!fileContents)
            throw Error("buffer error");

        core.info(`Buffer size: ${Buffer.byteLength(fileContents)}b`);

        // IAM token
        // Initialize SDK with your token
        const session = new cloud.Session({ oauthToken: inputs.token });

        core.info("Session created with token");

        // Create function
        const functionService = new FunctionService(session);
        core.info("Function service created");

        const functionObject = await getOrCreateFunction(functionService, inputs);

        await createFunctionVersion(functionService, functionObject, fileContents, inputs);

        core.setOutput("time", new Date().toTimeString());
    }
    catch (error) {
        core.setFailed(error.message);
    }
}

async function getFunctions(functionService: FunctionService, inputs: ActionInputs) {
    core.startGroup("Get functions");

    try {
        let functionListResponse = await functionService.list({
            folderId: inputs.folderId,
            pageSize: undefined,
            filter: inputs.functionName
        });

        if (!functionListResponse.functions)
            throw Error(`Functions get error (undefined response)`);

        const functions = functionListResponse.functions;

        if (functions.length > 1)
            throw Error(`Multiple functions found by name ${inputs.functionName}`);

        return functions;
    }
    finally {
        core.endGroup();
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

async function getOrCreateFunction(functionService: FunctionService, inputs: ActionInputs) {
    // Check if Function exist
    const functions = await getFunctions(functionService, inputs);
    if (functions.length == 1)
        return functions[0];

    core.startGroup("Get or Create function");
    try {
        core.info(`Function ${inputs.folderId}/${inputs.functionName}`);

        // Create new function
        let operation = await functionService.create({
            folderId: inputs.folderId,
            name: inputs.functionName
        });

        core.info("Operation complete");

        handleOperationError(operation);

        const functionsResult = await getFunctions(functionService, inputs);
        if (functionsResult.length == 1) {
            let result = functionsResult[0];
            core.info(`Function found: ${result.id}, ${result.name}`);

            return result;
        }
    }
    finally {
        core.endGroup();
    }
}

async function createFunctionVersion(functionService: FunctionService, targetFunction: Function, fileContents: Buffer, inputs: ActionInputs) {
    core.startGroup("Create function version");
    try {
        core.info(`Function ${inputs.folderId}/${inputs.functionName}`);

        //convert variables
        let memory = Number.parseFloat(inputs.memory);
        core.info(`Parsed memory ${memory}`);

        let executionTimeout = Number.parseFloat(inputs.executionTimeout);
        core.info(`Parsed timeout ${executionTimeout}`);

        // Create new version
        let operation = await functionService.createVersion({
            functionId: targetFunction.id,
            runtime: inputs.runtime,
            entrypoint: inputs.entrypoint,
            resources: {
                memory: memory ? Long.fromNumber(memory * 1024 * 1024) : undefined,
            },
            environment: parseEnvironmentVariables(inputs.environment),
            content: fileContents,
            executionTimeout: { seconds: Long.fromNumber(executionTimeout) }
        });

        core.info("Operation complete");

        handleOperationError(operation);
    }
    finally {
        core.endGroup();
    }
}

async function zipDirectory(source: string) {
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
            .directory(source, false)
            .finalize();

        core.info("Archive finalized");

        outputStreamBuffer.end();
        let buffer = outputStreamBuffer.getContents();
        core.info("Buffer is set");

        return buffer;
    }
    finally {
        core.endGroup();
    }
}

function parseEnvironmentVariables(env: string): { [s: string]: string } {
    core.info(`Environment string: ${env}`);

    let envObject = {};
    var kvs = env.split(",");
    kvs.forEach(kv => {
        let res = kv.split("=");
        let key = res[0];
        let value = res[1];
        envObject[key] = value;
    });

    core.info(`EnvObject: ${JSON.stringify(envObject)}`)
    return envObject;
}

run();