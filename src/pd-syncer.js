var pdAPI = require('./api');
var fs = require('fs');
var url = require('url');
var utils = require('./utils');
var _ = require('lodash');

const handleCompileResponse = (doc) => { return (err, json) => {
    if (err) {
        console.error(`[${doc.url}] Error compiling doc. ${err.message}`);
        return;
    }

    if (_.isEmpty(json.file_path)) {
        console.warn(`[${doc.url}] Not syncing. file_path not specified.`);
        return;
    }

    // ... and gets back the compiled code, writing it to the
    // file specified by file_path
    fs.writeFile(json.file_path, json.code, (err) => {
        if (err && err.code == 'ENOENT') {
            console.error(`[${doc.url}] Failed to create file at ${json.file_path}. Are you trying to write to a directory that does not exist?`);
            return;
        }

        if (err) utils.abort(err.message);
        console.log(`[${doc.url}] Synced at path ${json.file_path}`);
    });
}};

// Triggers on every database doc change
const handleDocChange = (metaserverDoc) => { return (firebaseDoc) => {
    if (_.isEmpty(firebaseDoc)) {
        console.error(`[${metaserverDoc.url}] Not syncing. Unable to fetch doc from server.`);
        return;
    }

    const requiredFields = ['file_path', 'export_lang', 'blocks'];
    for (var field of requiredFields) {
        if (_.isEmpty(firebaseDoc[field])) {
            console.warn(`[${metaserverDoc.url}] Not syncing. No ${field} field present.`);
            return;
        }
    }

    // Sends the doc to the compile server...
    pdAPI.compileFromDoc(firebaseDoc, handleCompileResponse(metaserverDoc));
}};

// Watches a doc in Pagedraw and syncs it to the correct file path specified by the doc
module.exports.syncPagedrawDoc = syncPagedrawDoc = (doc) => {
    if (doc.docserver != 'firebase' || _.isEmpty(doc.docserver_id)) {
        console.error(`[${doc.url}] Not syncing. Not a Firebase doc.`);
        return;
    }

    pdAPI.watchDoc(doc.docserver_id, handleDocChange(doc));
};

module.exports.pullPagedrawDoc = pullPagedrawDoc = (doc) => {
    pdAPI.compileFromPageId(doc.id, handleCompileResponse(doc));
};

