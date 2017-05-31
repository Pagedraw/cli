var request = require('request');
var firebase = require('firebase');
var fs = require('fs');
var url = require('url');
var _ = require('lodash');

const COMPILE_SERVER = process.env['PAGEDRAW_COMPILE_SERVER'] || 'http://happy-unicorns.herokuapp.com';
const COMPILE_ENDPOINT = url.resolve(COMPILE_SERVER, 'v1/compile');
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

// Triggers on every database doc change
const handleDocChange = (doc) => {
    const requiredFields = ['file_path', 'export_lang', 'blocks'];
    for (var field of requiredFields) {
        if (_.isEmpty(doc[field])) {
            console.log(`Not syncing. Doc changed but no ${field} present.`);
            return;
        }
    }

    // Sends the firebase doc to the compile server...
    request.post({uri: COMPILE_ENDPOINT, json: {pd_doc: doc}}, (err, resp, body) => {
        if (err) {
            console.log('Sync error. Compile server did not respond correctly.');
            throw err;
        }

        // ... and gets back the compiled code, writing it to the
        // file specified by doc.file_path
        const code = JSON.parse(body.body).code;
        fs.writeFile(doc.file_path, code, (err) => {
            if (err) throw err;
            console.log(`Doc synced at path ${doc.file_path}`);
        });
    });
};

// Watches a doc in Pagedraw and syncs it to the correct file path specified by the doc
module.exports = syncPagedrawDoc = (docserver_id) => {
    watchDoc(docserver_id, handleDocChange);
};
