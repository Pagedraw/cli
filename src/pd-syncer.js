var request = require('request');
var pdAPI = require('./api');
var fs = require('fs');
var url = require('url');
var utils = require('./utils');
var _ = require('lodash');

const handleCompileResponse = (callback) => { return (err, resp, body) => {
    if (err || resp.statusCode != 200)
        utils.abort('Error. Compile server did not respond correctly.');

    var json;
    try { json = JSON.parse(body); }
    catch (err) { throw new Error('Pagedraw API returned bad JSON.'); }

    if (_.isEmpty(json.file_path)) {
        console.log('Not syncing doc. file_path not specified');
        return;
    }

    // ... and gets back the compiled code, writing it to the
    // file specified by file_path
    fs.writeFile(json.file_path, json.code, (err) => {
        if (err) return callback(err, json.code, json.file_path);
        console.log(`Doc synced at path ${json.file_path}`);
        callback(null, json.code, json.file_path);
    });
}};

// Triggers on every database doc change
const handleDocChange = (doc) => {
    const requiredFields = ['file_path', 'export_lang', 'blocks'];
    for (var field of requiredFields) {
        if (_.isEmpty(doc[field])) {
            console.log(`Doc not synced. No ${field} field present.`);
            return;
        }
    }

    // Sends the doc to the compile server...
    pdAPI.compileFromDoc(doc, handleCompileResponse((err) => {
        if (err && err.code == 'ENOENT')
            utils.abort(`Failed to create file at ${file_path}. Are you trying to write to a directory that does not exist?`);

        if (err) utils.abort(err.message);
    }));
};

// Watches a doc in Pagedraw and syncs it to the correct file path specified by the doc
module.exports.syncPagedrawDoc = syncPagedrawDoc = (doc) => {
    pdAPI.watchDoc(doc.docserver_id, handleDocChange);
};

module.exports.pullPagedrawDoc = pullPagedrawDoc = (doc, callback) => {
    pdAPI.compileFromPageId(doc.id, handleCompileResponse(callback));
};

