const run               = require('./').run;
const archiver          = require('archiver');
const fs                = require('fs');
const {Session}         = require('yandex-cloud');
const {CloudService}    = require('yandex-cloud/api/resourcemanager/v1');
const {FunctionService} = require('yandex-cloud/api/serverless/functions/v1');

const FUNCTION_ID = process.env.FUNCTION_ID;
const RUNTIME     = process.env.RUNTIME;
const ENTRYPOINT  = process.env.ENTRYPOINT;
const SOURCE_DIR  = process.env.SOURCE_DIR

/**
 * @param {String} source
 * @param {String} out
 * @returns {Promise}
 */
function zipDirectory(source, out) {
  const archive = archiver('zip', { zlib: { level: 9 }});
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


const file = new zipDirectory(SOURCE_DIR, 'output.zip');
const fileContents = fs.createReadStream('output.zip');

run(async (session, cloudId, folderId) => {
  const functionService = new FunctionService(session);
  
  let operation = await functionService.createFunctionVersion({
  	functionId: FUNCTION_ID,
    runtime: RUNTIME,
    entrypoint: ENTRYPOINT,
    resources: {
      memory: 256 * 1024 * 1024,
    },
    content: fileContents
  });
  operation.on('status', op => {
    console.log(`Operation ${op.id} still running (spent ${op.timeSpent()} ms)`);
  });
  operation = await operation.completion(session);
  const func = operation.getResponse();
//  console.log(`Instance ${func.id} created, ${operation.timeSpent()}ms spent.`);
});