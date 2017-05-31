var request = require('request');
var pdAuth = require('./auth');
var url = require('url');

const PAGEDRAW_HOST = 'http://localhost:4000/';

const authedGet = (endpoint) => {
    var credentials = pdAuth.credentials();
    return endpoint + `?email=${credentials.email}&auth_token=${credentials.auth_token}`
}

module.exports.getApp = getApp = (app_id, callback) => {
    const endpoint = url.resolve(PAGEDRAW_HOST, `apps/${app_id}.json`);
    request.get(authedGet(endpoint), callback);
};
