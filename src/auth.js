var open = require('open');
var netrc = require('netrc');
var request = require('request');
var srs = require('secure-random-string');
var url = require('url');
var _ = require('lodash');

const PAGEDRAW_HOST = 'http://localhost:4000/'
const OAUTH_URL = url.resolve(PAGEDRAW_HOST, 'users/auth/google_oauth2');
const TOKEN_SIGN_IN_URL = url.resolve(PAGEDRAW_HOST, 'users/sign_in' );
const netrc_entry = 'pagedraw.io';

var cachedCredentials = undefined;
module.exports.credentials = credentials = () => {
    if (_.isEmpty(cachedCredentials))
        cachedCredentials = getCredentials();

    if (_.isEmpty(cachedCredentials.email) || _.isEmpty(cachedCredentials.auth_token))
        throw new Error('Unable to ensure Pagedraw credentials exist');
    return cachedCredentials;
};

const getCredentials = () => {
    var netrcCreds = netrc()[netrc_entry];
    return { email: netrcCreds.login, auth_token: netrcCreds.password };
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

module.exports.pagedrawAPIAuthenticate = () => {
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

    }, () => { console.log('Authentication timed out.'); });
};


