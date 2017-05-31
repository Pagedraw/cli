var request = require('request');
var firebase = require('firebase');
var pdAPI = require('./api');
var fs = require('fs');
var url = require('url');
var _ = require('lodash');

const METASERVER = process.env['PAGEDRAW_METASERVER'] || 'https://pagedraw.io/';
const COMPILE_ENDPOINT = url.resolve(METASERVER, 'api/v1/cli/compile');
const DOCSERVER = process.env['PAGEDRAW_DOCSERVER'] || 'https://pagedraw.firebaseio.com/';

firebase.initializeApp({
    databaseURL: DOCSERVER
});


// Watches a doc on Firebase and calls callback on any change
const watchDoc = (docserver_id, callback) => {
    const ref = firebase.database().ref(`pages/${docserver_id}`);
    const watch_id = ref.on('value', (page) => {
        callback(JSON.parse(page.val()));
    });
    const unsubscribe_fn = () => { ref.off('value', watch_id) };
    return unsubscribe_fn;
};

const handleCompileResponse = (callback) => { return (err, resp, body) => {
    if (err) {
        console.error('Error. Compile server did not respond correctly.');
        throw err;
    }
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
    //console.log(COMPILE_ENDPOINT)
    const handler = handleCompileResponse((err) => { if (err) utils.abort(err); });
    request.get({uri: COMPILE_ENDPOINT, json: {pd_doc: doc}}, handler);
};

// Watches a doc in Pagedraw and syncs it to the correct file path specified by the doc
module.exports.syncPagedrawDoc = syncPagedrawDoc = (doc) => {
    watchDoc(doc.docserver_id, handleDocChange);
};

module.exports.pullPagedrawDoc = pullPagedrawDoc = (doc, callback) => {
    pdAPI.compileFromPageId(doc.id, handleCompileResponse(callback));
};
