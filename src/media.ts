// Public videos are replaced in place. Give browsers a new URL when their bytes change.
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
const urls = new Map<string,string>();
export function mediaUrl(path: string) {
  if (!urls.has(path)) {
    const bytes = readFileSync("public" + path);
    urls.set(path, path + "?v=" + createHash("sha256").update(bytes).digest("hex").slice(0,12));
  }
  return urls.get(path)!;
}
