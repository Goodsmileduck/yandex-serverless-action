import * as archiver from "archiver";
import * as core from "@actions/core";
import * as fs from "fs";

import BufferListStream from "bl";
import { FunctionService } from "yandex-cloud/api/serverless/functions/v1";
import Long from "long";
import { Session } from "yandex-cloud";

function zipDirectory(source: string, out: fs.PathLike) {
    let buf: Buffer;

    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.pipe(
        new BufferListStream((err, data) => {
            buf = data;
        })
    );

    return new Promise<Buffer>((resolve, reject) => {
        archive
            .directory(source, false)
            .finalize()
            .then(() => {
                console.log("finalized", buf);
                resolve(buf);
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

async function run() {
    try {
        const inputFunctionId = core.getInput("function_id", { required: true });
        const inputToken = core.getInput("iam_token", { required: true });
        const inputRuntime = core.getInput("runtime", { required: true });
        const inputEntrypoint = core.getInput("entrypoint", { required: true });
        const inputMemory = core.getInput("memory", { required: false });
        const inputSource = core.getInput("source", { required: false });
        const inputExecutionTimeout = core.getInput("execution_timeout", { required: false });
        const inputEnvironment = core.getInput("environment", { required: false });

        const fileContents = await zipDirectory(inputSource, "output.zip");

        // IAM token
        // Initialize SDK with your token
        const session = new Session({ iamToken: inputToken });

        // Create function
        const functionService = new FunctionService(session);

        // Check if FunctionId exist
        //let exist = functionService.get({ functionId: inputFunctionId });

        //conver variables
        let memory = inputMemory ? Number.parseFloat(inputMemory) : undefined;
        let executionTimeout = inputExecutionTimeout ? Number.parseFloat(inputExecutionTimeout) : 60;

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

        if (operation.error)
            throw Error(`${operation.error.code}: ${operation.error.message}`);

        core.setOutput("time", new Date().toTimeString());
    }
    catch (error) {
        core.setFailed(error.message);
    }
}

run();