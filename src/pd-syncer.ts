import * as _l from "lodash";
import * as fs from "fs";
import * as url from "url";
import * as path from "path";
import * as filendir from "filendir";
import * as utils from "./utils";
import { PagedrawAPI } from "./api";
import * as clc from "cli-color";

const doc_link = (id) => `https://pagedraw.io/pages/${id}`;

export class PagedrawSyncer
{
    constructor(private readonly pdAPI: PagedrawAPI) { }

    /**
    * Watches a doc in Pagedraw and syncs it to the correct file path specified by the doc
    * @param doc
    */
    public syncPagedrawDoc(doc: { docserver_id: string, url: string }, docsAllowedToTouch: any[], managed_folders: string[]) {
        this.pdAPI.watchDoc(doc.docserver_id, () => {
            this.pullPagedrawDoc(doc, docsAllowedToTouch, managed_folders);
            console.log(''); // skip line
        });
    }

    public pullPagedrawDoc(doc: { docserver_id: string, url: string }, docsAllowedToTouch: any[], managed_folders: string[]) {
        this.pdAPI.compileFromDocserverId(doc.docserver_id, this.handleCompileResponse(doc, docsAllowedToTouch, managed_folders));
    }

    /*
     * removeFilesOwnedByDocs removes files in managed_folders, owned by docs
     * and not in the blacklist.
     * blacklist contains normalized absolute filepaths.
     */
    public removeFilesOwnedByDocs(docs: any[], managed_folders: string[], blacklist: string[], callback: (any) => any) {
        const promises = managed_folders.map((folder) => new Promise((accept, reject) => {
            fs.readdir(folder, (err, files) => {
                if (err) {
                    return accept(err);
                }

                const removingPromises = files.map((filename) => new Promise((accept, reject) => {
                    const filepath = path.resolve(folder, filename);
                    if (blacklist.includes(filepath)) {
                        return accept();
                    }

                    this.readPagedrawnFileHeader(filepath, (err, page_id) => {
                        if (err) {
                            return accept();
                        }

                        if (_l.find(docs, (doc) => doc.id == page_id)) {
                            fs.unlink(filepath, () => {
                                accept();
                            });
                            return;
                        }

                        return accept();
                    });
                }));

                Promise.all(removingPromises).then(accept);
            });
        }));

        Promise.all(promises).then(callback);
    }

    handleCompileResponse(doc: { url: string }, docsAllowedToTouch: any[], managed_folders: string[]) {
        utils.assert(() => docsAllowedToTouch.includes(doc));

        return (err, results) => {
            if (err) {
                console.error(clc.red(`[${doc.url}] Error compiling doc. ${err.message}`));
                return;
            }

            if (_l.isEmpty(results)) {
                console.log(clc.yellow(`[${doc.url}] No components to pull. Please ensure this doc has components marked "Should pull/sync from CLI" in the editor.`));
                return;
            }

            const resultsByPath = _l.groupBy(results, 'filePath');
            const willSync = _l.compact(_l.map(resultsByPath, (repeated_results, filePath) => {
                if (_l.isUndefined(filePath)) {
                    console.error(clc.red(`[${doc.url}] ${repeated_results.length} components returned path undefined. Please contact the Pagedraw team if this problem persists.`));
                    return;
                }

                if (repeated_results.length > 1) {
                    console.log(clc.yellow(`[${doc.url}] has multiple components trying to write to the same path: ${filePath}. Only syncing one of them...`));
                }

                const result: any = repeated_results[0];

                if (_l.isEmpty(filePath)) {
                    console.log(clc.yellow(`[${doc.url}] has component ${result.label} which wasn't synced because it has no specified file path.`));
                    return null;
                }

                // Return silently if component was not marked as shouldSync
                if (!result.shouldSync) {
                    return null;
                }

                if (!_l.isEmpty(result.warnings)) {
                    result.warnings.forEach((warning) => console.log(clc.yellow(`[${doc.url}] ${result.filePath}: ${warning.message}`)));
                }

                if (!_l.isEmpty(result.errors)) {
                    result.errors.forEach((error) => console.error(clc.red(`[${doc.url}] ${result.filePath}: ${error.message}`)));
                    return null;
                }

                return result;
            }));

            const blacklist = _l.map(willSync, (r) => path.resolve(r.filePath)); // don't remove the ones we are about to write to
            this.removeFilesOwnedByDocs([doc], managed_folders, blacklist, () => {
                _l.forEach(willSync, (result) => {
                    this.checkFilePathWriteable(result.filePath, docsAllowedToTouch, (err) => {
                        if (err && err.code == 'FOUND-PAGEDRAWN') {
                            console.log(clc.yellow(`[${doc.url}] ${result.filePath}: Pagedraw doc ${err.doc_id} (${doc_link(err.doc_id)}) already has a component in this path. Not overwriting.`));
                            return;
                        }

                        if (err && err.code == 'NON-PAGEDRAWN') {
                            console.error(clc.red(`[${doc.url}] ${result.filePath}: Found non-Pagedraw file in this path. Not overwriting.`));
                            return;
                        }

                        if (err) {
                            return utils.abort(err.message);
                        }

                        filendir.writeFile(result.filePath, result.contents, (err) => {
                            if (err && err.code == 'ENOENT') {
                                console.error(clc.red(`[${doc.url}] Failed to create file at ${result.filePath}. Are you trying to write to a directory that does not exist?`));
                                return;
                            }

                            if (err) {
                                return utils.abort(err.message);
                            }
                            console.log(clc.green(`[${doc.url}] Synced at path ${result.filePath}`));
                        });

                    });
                });

            });
        };
    }

    checkFilePathWriteable(filepath: string, docsAllowedToTouch: any[], callback: (e: any | null) => any) {
        this.readPagedrawnFileHeader(filepath, (err, page_id) => {
            /* File doesn't exist yet, so it's writeable! */
            if (err && err.code == 'ENOENT') {
                return callback(null);
            }

            if (err) {
                return callback(err);
            }

            if (_l.find(docsAllowedToTouch, (doc) => doc.id == page_id)) {
                return callback(null);
            } else {
                return callback({code: 'FOUND-PAGEDRAWN', doc_id: page_id});
            }
        });
    }

    readPagedrawnFileHeader(filepath: string, callback: (e: any | null, page_id?: string) => any) {
        /* FIXME: Stream file instead */
        fs.readFile(filepath, "utf8", (err, data) => {
            if (err) {
                return callback(err);
            }

            const match = data.match(/Generated by https:\/\/pagedraw.io\/pages\/(\d+)/);
            if (match == null) {
                return callback({code: 'NON-PAGEDRAWN'});
            }

            return callback(null, match[1]);
        });
    }
}
