// archiver 8 ships no type declarations; this covers the subset used by the action.
declare module "archiver" {
    import { Transform } from "stream";

    export class ZipArchive extends Transform {
        constructor(options?: { zlib?: { level?: number } });
        glob(pattern: string | string[], options?: { cwd?: string; dot?: boolean; ignore?: string[] }): this;
        finalize(): Promise<void>;
        pointer(): number;
    }
}
