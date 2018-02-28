import * as _l from "lodash";
import * as program from "commander";
import { PagedrawAPI } from "./api";
import * as pdConfig from "./config";
import * as url from "url";
import { ErrorResult, abort, log, CliInfo } from "./utils";
import { LocalAuthPersistence } from "./credentials";
import { PagedrawSyncer } from "./pd-syncer";
import * as clear from 'cli-clear';

main();
function main()
{
    require('dotenv').config();
    const pkgJson = require('../package.json');

    const METASERVER = process.env['PAGEDRAW_METASERVER'] || 'https://pagedraw.io/';
    const API_VERSION = 'v1';
    const CLI_API_BASE = url.resolve(METASERVER, `api/${API_VERSION}/cli/`);
    const COMPILESERVER = process.env['PAGEDRAW_COMPILESERVER'] || 'https://happy-unicorns.herokuapp.com';
    const COMPILE_ENDPOINT = url.resolve(COMPILESERVER, 'v1/compile/');
    const netrc_entry = process.env['NETRC_ENTRY'] || 'pagedraw.io';
    // We currently assume the DOCSERVER is a firebase server
    const DOCSERVER = process.env['PAGEDRAW_DOCSERVER'] || 'https://pagedraw.firebaseio.com/';
    /*
    console.log(`
        METASERVER:   ${METASERVER}
        CLI_API_BASE: ${CLI_API_BASE}
        DOCSERVER:    ${DOCSERVER}
    `);
    //*/

    const pdAPI = new PagedrawAPI(METASERVER, CLI_API_BASE, COMPILE_ENDPOINT, DOCSERVER, new LocalAuthPersistence(netrc_entry));
    const pdSyncer = new PagedrawSyncer(pdAPI);

    const checkPackageInfo = (info: CliInfo) =>
    {
        if (_l.isEmpty(info))
        {
            return abort('Unable to fetch CLI info from server. Please report this error.');
        }
        if (info.version != pkgJson.version || info.name != pkgJson.name)
        {
            return abort(`Your Pagedraw CLI is out of date. Please run\n\tnpm install -g ${info.name}@${info.version}`);
        }
    };

    /**
     * Ensure CLI is up-to-date or ENVIRONMENT is "development"
     * @param continuation Code to run if CLI is up-to-date or ENVIRONMENT is "development"
     */
    const enforceClientUpToDate = (continuation: () => void) =>
    {
        // For development we don't wanna be constrained by a version forced by the API
        if (process.env['ENVIRONMENT'] == 'development')
        {
            return continuation();
        }

        // But in prod we ensure the CLI package version and name are up to date
        // before proceeding
        log('Getting CLI package info');
        pdAPI.onceCLIInfo((err, info) =>
        {
            if (err && err.code == 'ENOTFOUND')
            {
                return abort('Unable to verify that the Pagedraw CLI is up to date. Are you connected to the internet?');
            }

            if (err || info === undefined)
            {
                throw err;
            }

            checkPackageInfo(info);

            return continuation();
        });
    };

    program
        .version(pkgJson.version, "-v, --version")
        .usage('<command>');

    program
        .command('login')
        .description('Authenticate to gain access to the Pagedraw API.')
        .action(function (env, options)
        {
            enforceClientUpToDate(() =>
            {
                console.log('Logging into Pagedraw');
                pdAPI.pagedrawAPIAuthenticate((errOrCredentials, email) =>
                {
                    if (errOrCredentials instanceof Error)
                    {
                        return abort(errOrCredentials.message);
                    }
                    console.log(`Authentication successful. You are now logged in as ${email}. ` +
                    `If this is the wrong account, login to your correct gmail account by running \'pagedraw login\` again.`);

                    pdAPI.trackPagedrawLogin();
                });
            });
        });

    program
        .command('pull [docs_to_fetch...]')
        .description('Compile remote Pagedraw docs and pulls them into your local file system, in the path specified by the doc\'s file_path.')
        .action(function (docs_to_fetch)
        {
            enforceClientUpToDate(() =>
            {
                pdConfig.findPagedrawConfig((errOrDir, pd_config) =>
                {
                    if (errOrDir instanceof Error)
                    {
                        return abort(errOrDir.message);
                    }

                    // Change our CWD into the same as the pagedraw config file
                    process.chdir(errOrDir);

                    let app = pd_config && pd_config.app;
                    if (app == null)
                    {
                        return abort('pagedraw.json must contain an "app" field.');
                    }

                    // Read all docs to be synced from the config file and pull changes from all of them
                    pdAPI.getApp(app, (err, resp, body) =>
                    {
                        if (err)
                        {
                            return abort('Unable to fetch data from the Pagedraw API. Are you connected to the internet?');
                        }

                        if (resp.statusCode == 404)
                        {
                            return abort(`Unable to fetch data from Pagedraw API. Are you sure you have access to the app ${app}? Try running pagedraw login`);
                        }

                        var appData;
                        try
                        {
                            appData = JSON.parse(body);
                        }
                        catch (err)
                        {
                            throw new Error('Pagedraw API returned bad JSON.');
                        }

                        console.log(`Pulling docs from app ${appData.name}...\n`);
                        const docs = appData.pages.filter((doc) =>
                            _l.isEmpty(docs_to_fetch) || docs_to_fetch.includes(doc.id.toString()) || docs_to_fetch.includes(doc.url));

                        pdAPI.trackPagedrawPull(appData, docs);

                        const managed_folders = (pd_config && pd_config.managed_folders) ? pd_config.managed_folders : [];
                        if (!_l.isArray(managed_folders) || _l.some(managed_folders, (f) => !_l.isString(f))) {
                            return abort('pagedraw.json managed_folders must be an array of strings.');
                        }

                        docs.forEach((doc) => pdSyncer.pullPagedrawDoc(doc, [doc], managed_folders));
                    });
                });
            });
        });

    program
        .command('sync [docs_to_fetch...]')
        .description('Compile remote Pagedraw docs and continuously sync them into your local file system, in the path specified by each doc\'s file_path.')
        .action(function (docs_to_fetch) {
            enforceClientUpToDate(() => {
                // listen to changes in the CLI info, aborting if the version
                // changes while we are syncing
                // FIXME: Right now this is done only in sync. Maybe we should do it across
                // the board and make sure every action unsubscribes or explicitly exits
                // after it's done
                if (process.env['ENVIRONMENT'] !=  'development') {
                    pdAPI.watchCLIInfo(checkPackageInfo);
                }

                pdConfig.findPagedrawConfig((errOrDir, pd_config) => {
                    if (errOrDir instanceof Error) {
                        return abort(errOrDir.message);
                    }

                    // Change our CWD into the same as the pagedraw config file
                    process.chdir(errOrDir);

                    var app = pd_config && pd_config.app;
                    if (_l.isEmpty(app)) {
                        return abort('pagedraw.json must contain an "app" field.');
                    }

                    // Read all docs to be synced from the config file and pull changes from all of them
                    pdAPI.getApp(app, (err, resp, body) =>
                    {
                        if (resp.statusCode == 404)
                        {
                            return abort(`Unable to fetch data from Pagedraw API. Are you sure you have access to the app ${app}? Try running pagedraw login`);
                        }

                        if (err || resp.statusCode != 200)
                        {
                            return abort('Unable to fetch data from the Pagedraw API. Are you connected to the internet?');
                        }

                        var appData;
                        try
                        {
                            appData = JSON.parse(body);
                        }
                        catch (err)
                        {
                            throw new Error('Pagedraw API returned bad JSON.');
                        }

                        clear();
                        console.log(`Syncing docs from app ${appData.name}.\nHit Ctrl + C to exit...`);
                        const docs = appData.pages.filter((doc) =>
                            _l.isEmpty(docs_to_fetch) || docs_to_fetch.includes(doc.id.toString()) || docs_to_fetch.includes(doc.url));

                        pdAPI.trackPagedrawSync(appData, docs);

                        const managed_folders = (pd_config && pd_config.managed_folders) ? pd_config.managed_folders : [];
                        if (!_l.isArray(managed_folders) || _l.some(managed_folders, (f) => !_l.isString(f))) {
                            return abort('pagedraw.json managed_folders must be an array of strings.');
                        }

                        docs.forEach((doc) => pdSyncer.syncPagedrawDoc(doc, [doc], managed_folders));
                    });
                });
            });
        });

    program
        .command('*', '', { noHelp: true })
        .action(function ()
        {
            program.outputHelp();
        });

    log('Pagedraw CLI starting');

    program.parse(process.argv);

    // If user doesn't pass any arguments after the program name, just show help
    if (process.argv.length <= 2)
    {
        program.help();
    }
}
