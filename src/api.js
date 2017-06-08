var open = require('open');
var netrc = require('netrc');
var request = require('request');
var srs = require('secure-random-string');
var url = require('url');
var utils = require('./utils');
var _ = require('lodash');
var firebase = require('firebase');

const METASERVER = process.env['PAGEDRAW_METASERVER'] || 'https://pagedraw.io/';
const API_VERSION = 'v1'
const CLI_API_BASE = url.resolve(METASERVER, `api/${API_VERSION}/cli/`);
const netrc_entry = 'pagedraw.io';

// We currently assume the DOCSERVER is a firebase server
const DOCSERVER = process.env['PAGEDRAW_DOCSERVER'] || 'https://pagedraw.firebaseio.com/';
firebase.initializeApp({
    databaseURL: DOCSERVER
});

module.exports.onceCLIInfo = onceCLIInfo = (callback) => {
    // We do a regular GET as opposed to a Firebase once because
    // the FB once doesn't recognize a timeout i.e. when the user has no internet
    request.get(url.resolve(DOCSERVER, 'cli_info.json'), (err, resp, body) => {
        if (err) callback(err);
        callback(null, JSON.parse(body));
    });
};

module.exports.watchCLIInfo = watchCLIInfo = (callback) => {
    const ref = firebase.database().ref(`cli_info`);
    const watch_id = ref.on('value', (info) => {
        callback(info.val());
    }, (error) => {
        throw error;
    });
    const unsubscribe_fn = () => { ref.off('value', watch_id) };
    return unsubscribe_fn;
};

// Watches a doc on Firebase and calls callback on any change
module.exports.watchDoc = watchDoc = (docserver_id, callback) => {
    const ref = firebase.database().ref(`pages/${docserver_id}`);
    const watch_id = ref.on('value', (page) => {
        callback(JSON.parse(page.val()));
    });
    const unsubscribe_fn = () => { ref.off('value', watch_id) };
    return unsubscribe_fn;
};

var cachedCredentials = undefined;
const credentials = () => {
    if (_.isEmpty(cachedCredentials)) {
        var netrcCreds = netrc()[netrc_entry];
        if (_.isEmpty(netrcCreds) || _.isEmpty(netrcCreds.login) || _.isEmpty(netrcCreds.password))
            utils.abort('User is not authenticated to access the Pagedraw API. Please run pagedraw login');

        cachedCredentials = { email: netrcCreds.login, auth_token: netrcCreds.password };
    }

    return cachedCredentials;
};

const watchPage = (uri, callback, failure) => {
    const poll = (max, interval) => { return () => {
        request.get(uri, (err, resp, body) => {
            if (resp && resp.statusCode == 200)
                return callback(JSON.parse(body));

            if (max <= 0)
                return failure();
            setTimeout(poll(max-1, interval), interval);
        });
    }};
    poll(30, 500)();
};

module.exports.pagedrawAPIAuthenticate = (callback) => {
    // generate a random local token
    const local_token = srs({length: 32});

    // Open browser passing it the local token, asking user to authenticate
    // Upon authentication, server will associate an auth_token to our local_token
    const signin_url = url.resolve(CLI_API_BASE, `authenticate/${local_token}`);
    open(signin_url);

    console.log('Your browser has been open to visit:');
    console.log('    ' + signin_url);
    console.log('Waiting for authentication...');

    // Poll metaserver for the auth_token associated with local_token
    const get_auth_token_url = url.resolve(CLI_API_BASE, `get_auth_token/${local_token}`);
    watchPage(get_auth_token_url, (body) => {
        // Write the auth_token to ~/.netrc
        var myNetrc = netrc();
        myNetrc[netrc_entry] = { login: body.email, password: body.auth_token };
        netrc.save(myNetrc);

        callback(null, credentials());

    }, () => { callback(new Error('Authentication timed out.')); });
};

const authedGet = (endpoint) => {
    return endpoint + `?email=${credentials().email}&auth_token=${credentials().auth_token}`;
}

module.exports.getApp = getApp = (app_name, callback) => {
    request.get(authedGet(url.resolve(CLI_API_BASE, `apps/${app_name}`)), callback);
};

module.exports.compileFromPageId = compileFromPageId = (page_id, callback) => {
    request.get(authedGet(url.resolve(CLI_API_BASE, `compile_from_page_id/${page_id}`)), (err, resp, body) => {
        if (err) callback(err);

        var json
        try { json = JSON.parse(body); }
        catch (err) { return callback(new Error('Pagedraw API returned bad JSON.')); }
        callback(null, json);
    });
};

module.exports.compileFromDoc = compileFromDoc = (doc, callback) => {
    const compile_endpoint = authedGet(url.resolve(CLI_API_BASE, 'compile_from_doc'));
    request.get({uri: compile_endpoint, json: {pd_doc: doc}}, (err, resp, body) => {
        if (err) callback(err);
        // Because of request.get json:, body is already a JSON object
        callback(null, body);
    });
};
