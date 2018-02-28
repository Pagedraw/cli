/// <reference> node.d.ts
import * as netrc from "netrc";
import * as _l from "lodash";
import { abort } from "./utils";

export interface ICredentialData
{
    id: string;
    auth_token: string;
}

/**
 * Store and retrieve a single set of credentials
 */
export interface ISingleCredentialStore
{
    /**
     * The stored credential values
     */
    readonly credentials: ICredentialData;

    /**
     * The key for these credentials
     */
    readonly key: string;

    /**
     * Store new credential data in this storage, overwriting any existing credentials
     */
    persist(id: String, pass: string): ICredentialData;
}

/**
 * Store and retrieve credentials from a single entry in the local .netrc file
 */
export class LocalAuthPersistence implements ISingleCredentialStore
{
    private cachedCredentials: ICredentialData | null = null;
    private readonly netrc_entry: string;

    constructor(entryKey: string)
    {
        this.netrc_entry = entryKey;
    }

    public get key(): string
    {
        return this.netrc_entry;
    }

    public get credentials()
    {
        if (this.cachedCredentials == null)
        {
            var netrcCreds: { login: string, password: string } = netrc()[this.netrc_entry];
            if (_l.isEmpty(netrcCreds) || _l.isEmpty(netrcCreds.login) || _l.isEmpty(netrcCreds.password))
            {
                return abort('User is not authenticated to access the Pagedraw API. Please run pagedraw login');
            }
            this.cachedCredentials = { id: netrcCreds.login, auth_token: netrcCreds.password };
        }
        return this.cachedCredentials;
    }

    /**
     * Write the auth_token to ~/.netrc
     */
    public persist(id: String, pass: string)
    {
        var myNetrc = netrc();
        myNetrc[this.netrc_entry] = { login: id, password: pass };
        netrc.save(myNetrc);

        // clear and reload the cached credentials
        this.cachedCredentials = null;
        return this.credentials;
    }
}
