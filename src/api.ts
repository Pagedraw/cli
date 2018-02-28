/// <reference> node.d.ts
import * as open from "open";
import * as request from "request";
import * as srs from "secure-random-string";
import * as url from "url";
import * as _l from "lodash";
import * as firebase from "firebase";
import { ErrorResult, CliInfo } from "./utils";
import { ISingleCredentialStore, ICredentialData } from "./credentials";

export class PagedrawAPI {
    constructor(
        private readonly metaserverURL: string,
        private readonly apiURL: string,
        private readonly compileServerEndpoint: string,
        private readonly docserverURL: string,
        private readonly auth: ISingleCredentialStore) {
        firebase.initializeApp({
            databaseURL: docserverURL
        });
    }

    public onceCLIInfo(callback: (e: ErrorResult | null, i?: CliInfo) => void) {
        // We do a regular GET as opposed to a Firebase one because
        // the FB once doesn't recognize a timeout i.e. when the user has no internet
        request.get(url.resolve(this.docserverURL, 'cli_info.json'), (err, resp, body) => {
            return err ?
                callback(err as ErrorResult) :
                callback(null, JSON.parse(body) as CliInfo);
        });
    }

    public watchCLIInfo(callback) {
        const ref = firebase.database().ref(`cli_info`);
        const watch_id = ref.on('value',
            (info) => callback(info && info.val()),
            (error) =>
            {
                throw error;
            });
        return () => ref.off('value', watch_id);
    }

    /**
     * Watches a doc on Firebase and calls callback on any change
     * @param docserver_id
     * @param callback
     */
    public watchDoc(docserver_id: string, callback: () => void) {
        const ref = firebase.database().ref(`pages/${docserver_id}`);
        const watch_id = ref.on('value', (page) => {
            callback();
        }, (error) => {throw error; });
        return () => { ref.off('value', watch_id);}
    }

    public pagedrawAPIAuthenticate(callback: (e: Error | ICredentialData, email?: string) => void) {
        // generate a random local token
        const local_token = srs({ length: 32 });

        // Open browser passing it the local token, asking user to authenticate
        // Upon authentication, server will associate an auth_token to our local_token
        const signin_url = url.resolve(this.apiURL, `authenticate/${local_token}`);
        open(signin_url);

        console.log('Your browser has been open to visit:');
        console.log('    ' + signin_url);
        console.log('Waiting for authentication...');

        // Poll metaserver for the auth_token associated with local_token
        this.watchPage(url.resolve(this.apiURL, `get_auth_token/${local_token}`),
            (body) => {
                callback(this.auth.persist(String(body.id), body.auth_token), body.email);
            },
            () => { callback(new Error('Authentication timed out.')); });
    }

    public getApp(app_name, callback) {
        request.get(this.authedApiRequest(`apps/${app_name}`), callback);
    }

    public compileFromDocserverId(docserver_id: string, callback: (e: Error | null, json?: any) => void) {
    const request_data = {client: 'cli', user_info: {id: this.auth.credentials.id}};
    request.post({ uri: url.resolve(this.compileServerEndpoint, docserver_id), json: true, body: request_data}, (err, resp, body) => {
            if (err) {
                callback(err);
            }

            callback(null, body);
        });
    }

    //
    // Private
    //

    watchPage(uri, callback: (json: any) => void, failure: () => void)
    {
        const poll = (max, interval) =>
        {
            return () =>
            {
                request.get(uri, (err, resp, body) =>
                {
                    if (resp && resp.statusCode == 200)
                    {
                        return callback(JSON.parse(body));
                    }

                    if (max <= 0)
                    {
                        return failure();
                    }

                    setTimeout(poll(max - 1, interval), interval);
                });
            }
        };
        poll(30, 500)();
    }

    authedApiRequest(endpoint)
    {
        return url.resolve(this.apiURL, endpoint)
            + `?id=${this.auth.credentials.id}&auth_token=${this.auth.credentials.auth_token}`;
    }

    authedPostRequest(endpoint, data, callback) {
        const dataWithAuth = _l.extend({}, data, {id: this.auth.credentials.id, auth_token: this.auth.credentials.auth_token});
        request.post({ uri: url.resolve(this.apiURL, endpoint), json: true, body: dataWithAuth}, callback);
    }

    /* BI Analytics */
    public trackPagedrawLogin(callback?) {
        this.authedPostRequest('ran_pagedraw_login', {}, callback);
    }

    public trackPagedrawPull(app, docs, callback?) {
        this.authedPostRequest('ran_pagedraw_pull', {app: app, docs: docs}, callback);
    }

    public trackPagedrawSync(app, docs, callback?) {
        this.authedPostRequest('ran_pagedraw_sync', {app: app, docs: docs}, callback);
    }
}
