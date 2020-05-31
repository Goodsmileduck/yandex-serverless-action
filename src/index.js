const core = require('@actions/core');
const github = require('@actions/github');
const archiver = require('archiver');
const fs = require('fs');
const { Session } = require('yandex-cloud');
const { CloudService } = require('yandex-cloud/api/resourcemanager/v1');
const { FunctionService } = require('yandex-cloud/api/serverless/functions/v1');
const { AccessBindingAction } = require('yandex-cloud/api/access');

const inputFunctionId = core.getInput('function_id', { required: true });
const inputToken = core.getInput('iam_token', { required: true });
const inputRuntime = core.getInput('runtime', { required: true });
const inputEntrypoint = core.getInput('entrypoint', { required: true });
const inputMemory = core.getInput('memory', { required: false });
const inputSource = core.getInput('source', { required: false });
const inputEnvironment = core.getInput('environment', { required: false });



function zipDirectory(source, out) {
    const archive = archiver('zip', { zlib: { level: 9 } });
    const stream = fs.createWriteStream(out);

    return new Promise((resolve, reject) => {
        archive
            .directory(source, false)
            .on('error', err => reject(err))
            .pipe(stream)
            ;

        stream.on('close', () => resolve());
        archive.finalize();
    });
}


const file = new zipDirectory(inputSource, 'output.zip');
const fileContents = fs.createReadStream('output.zip');


async function run() {
    try {
        // IAM token
        // Initialize SDK with your token
        const session = new Session({ iamToken: inputToken });

        // Create service client
        //const cloudService = new CloudService(session);
        // Issue request (returns Promise)
        //let response = await cloudService.list({});

        // Create function
        const functionService = new FunctionService(session);

        // Check if FunctionId exist
        //let exist = functionService.get({ functionId: inputFunctionId });


        // Create new version
        let operation = await functionService.createFunctionVersion({
            functionId: inputFunctionId,
            runtime: inputRuntime,
            entrypoint: inputEntrypoint,
            resources: {
                memory: inputMemory * 1024 * 1024,
            },
            environment: inputEnvironment,
            content: fileContents
        });

        operation.on('status', op => {
            console.log(`Operation ${op.id} still running (spent ${op.timeSpent()} ms)`);
        });

        operation = await operation.completion(session);
        const func = operation.getResponse();
        core.debug(`Instance ${func.id} created, ${operation.timeSpent()}ms spent.`);

        core.debug((new Date()).toTimeString())

        core.setOutput('time', new Date().toTimeString());
    }
    catch (error) {
        core.setFailed(error.message);
    }
}


run()