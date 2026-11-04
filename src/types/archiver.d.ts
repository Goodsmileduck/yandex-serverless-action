// archiver 8 ships no type declarations; this covers the subset used by the action.
declare module "archiver" {
    import { Transform } from "stream";

    interface ArchiverOptions {
        zlib?: { level?: number };
    }

    interface GlobOptions {
        cwd?: string;
        dot?: boolean;
        ignore?: string[];
    }

    class Archiver extends Transform {
        glob(pattern: string, options?: GlobOptions): this;
        finalize(): Promise<void>;
    }

    export class ZipArchive extends Archiver {
        constructor(options?: ArchiverOptions);
    }
}
