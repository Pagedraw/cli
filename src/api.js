var open = require('open');
var netrc = require('netrc');
var request = require('request');
var srs = require('secure-random-string');
var url = require('url');
var utils = require('./utils');
var _ = require('lodash');

const METASERVER = process.env['PAGEDRAW_METASERVER'] || 'https://pagedraw.io/';
const OAUTH_URL = url.resolve(METASERVER, 'users/auth/google_oauth2');
const TOKEN_SIGN_IN_URL = url.resolve(METASERVER, 'users/sign_in' );
const netrc_entry = 'pagedraw.io';

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
    open(`${OAUTH_URL}?local_token=${local_token}`);

    console.log('Waiting for user to authenticate...');

    // Poll metaserver for the auth_token associated with local_token
    watchPage(`${TOKEN_SIGN_IN_URL}?local_token=${local_token}`, (body) => {
        // Write the auth_token to ~/.netrc
        var myNetrc = netrc();
        myNetrc[netrc_entry] = { login: body.email, password: body.auth_token };
        netrc.save(myNetrc);

        console.log('Authentication succesful.');
        callback(null, credentials());

    }, () => { callback(new Error('Authentication timed out.')); });
};

const authedGet = (endpoint) => {
    return endpoint + `?email=${credentials().email}&auth_token=${credentials().auth_token}`;
}

module.exports.getApp = getApp = (app_id, callback) => {
    const endpoint = url.resolve(METASERVER, `apps/${app_id}.json`);
    request.get(authedGet(endpoint), callback);
};
