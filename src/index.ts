import * as core from "@actions/core";
import * as streamBuffers from "stream-buffers";

import { FunctionService } from "yandex-cloud/api/serverless/functions/v1";
import Long from "long";
import { Session } from "yandex-cloud";
import archiver from "archiver";

async function run() {
    try {
        const inputFunctionId = core.getInput("function_id", { required: true });
        const inputToken = core.getInput("token", { required: true });
        const inputRuntime = core.getInput("runtime", { required: true });
        const inputEntrypoint = core.getInput("entrypoint", { required: true });
        const inputMemory = core.getInput("memory", { required: false });
        const inputSource = core.getInput("source", { required: false });
        const inputExecutionTimeout = core.getInput("execution_timeout", { required: false });
        const inputEnvironment = core.getInput("environment", { required: false });

        core.info("Parsed inputs");

        const fileContents = await zipDirectory(inputSource);

        core.info("Archive inmemory buffer created");

        // IAM token
        // Initialize SDK with your token
        const session = new Session({ iamToken: inputToken });

        core.info("Session created with token");

        // Create function
        const functionService = new FunctionService(session);

        core.info("Function service created");

        // Check if FunctionId exist
        //let exist = functionService.get({ functionId: inputFunctionId });

        //conver variables
        let memory = Number.parseFloat(inputMemory);
        core.info(`Parsed memory ${memory}`);

        let executionTimeout = Number.parseFloat(inputExecutionTimeout);
        core.info(`Parsed timeout ${executionTimeout}`);

        // Create new version
        let operation = await functionService.createVersion({
            functionId: inputFunctionId,
            runtime: inputRuntime,
            entrypoint: inputEntrypoint,
            resources: {
                memory: memory ? Long.fromNumber(memory * 1024 * 1024) : undefined,
            },
            environment: parseEnvironmentVariables(inputEnvironment),
            content: fileContents,
            executionTimeout: { seconds: Long.fromNumber(executionTimeout) }
        });

        core.info(`Operation complete ${inputFunctionId}, ${inputRuntime}, ${inputEntrypoint}`);

        if (operation.error)
            throw Error(`${operation.error.code}: ${operation.error.message}`);

        core.info(`Operation success ${operation.response.value}`);

        core.setOutput("time", new Date().toTimeString());
    }
    catch (error) {
        core.error(`Operation error ${error.message}`);
        core.setFailed(error.message);
    }
}

function zipDirectory(source: string) {
    let outputStreamBuffer = new streamBuffers.WritableStreamBuffer({
        initialSize: (1000 * 1024),   // start at 1000 kilobytes.
        incrementAmount: (1000 * 1024) // grow by 1000 kilobytes each time buffer overflows.
    });

    const archive = archiver("zip", { zlib: { level: 9 } });

    archive.pipe(outputStreamBuffer);

    return new Promise<Buffer>((resolve, reject) => {
        archive
            .directory(source, false)
            .finalize()
            .then(() => {
                outputStreamBuffer.end(() => {
                    let buffer = outputStreamBuffer.getContents();
                    if (buffer == false)
                        reject("buffer is false");

                    resolve(buffer as Buffer);
                });
            })
            .catch(err => {
                reject(err);
            });
    });
}

function parseEnvironmentVariables(env: string): { [s: string]: string } {
    core.debug(`Environment string: ${env}`);

    return {};
}

run();