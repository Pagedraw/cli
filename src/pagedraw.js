#!/usr/bin/env node

var program = require('commander');
var pdSyncer = require('./pd-syncer');
var pdAPI = require('./api');
var pdConfig = require('./config');
var utils = require('./utils');
var _ = require('lodash');

var pkgJson = require('../package.json')

program
  .version(pkgJson.version)
  .usage('<command>');

program
  .command('login')
  .description('Authenticate to gain access to the Pagedraw API.')
  .action(function(env, options) {
    console.log('Logging into Pagedraw');
    pdAPI.pagedrawAPIAuthenticate((err, credentials) => {
        if (err)
            utils.abort(err.message);
        console.log('Authentication successful.');
    });
  });

program
    .command('pull')
    .description('Compile remote Pagedraw docs and pulls them into your local file system, in the path specified by the doc\'s file_path.')
    .action(function(env, options) {
        pdConfig.findPagedrawConfig((err, dir, pd_config) => {
            if (err)
                utils.abort(err.message);

            // Change our CWD into the same as the pagedraw config file
            process.chdir(dir);

            if (_.isEmpty(pd_config.app))
                utils.abort('pagedraw.json must contain an "app" field.');

            // Read all docs to be synced from the config file and pull changes from all of them
            pdAPI.getApp(pd_config.app, (err, resp, body) => {
                if (resp.statusCode == 404)
                    utils.abort(`Unable to fetch data from Pagedraw API. Are you sure you have access to the app ${pd_config.app}? Try running pagedraw login`);

                if (err || resp.statusCode != 200)
                    utils.abort('Unable to fetch data from the Pagedraw API. Are you connected to the internet?');

                var app;
                try { app = JSON.parse(body); }
                catch (err) { throw new Error('Pagedraw API returned bad JSON.'); }

                console.log(`Pulling docs from app ${app.name}`);
                let docs = app.pages;
                docs.forEach((doc) => {
                    console.log(`Pulling doc ${doc.url}`);
                    pdSyncer.pullPagedrawDoc(doc, (err, code, file_path) => {
                        if (err && err.code == 'ENOENT')
                            utils.abort(`Failed to create file at ${file_path}. Are you trying to write to a directory that does not exist?`);

                        if (err) utils.abort(err.message);

                        // all docs pulled and written to disk
                        console.log('All done')
                    });
                });
            });
        });
    });

program
    .command('sync')
    .description('Compile remote Pagedraw docs and continuously sync them into your local file system, in the path specified by each doc\'s file_path.')
    .action(function(env, options) {
        pdConfig.findPagedrawConfig((err, dir, pd_config) => {
            if (err)
                utils.abort(err.message);

            // Change our CWD into the same as the pagedraw config file
            process.chdir(dir);

            if (_.isEmpty(pd_config.app))
                utils.abort('pagedraw.json must contain an "app" field.');

            // Read all docs to be synced from the config file and pull changes from all of them
            pdAPI.getApp(pd_config.app, (err, resp, body) => {
                if (resp.statusCode == 404)
                    utils.abort(`Unable to fetch data from Pagedraw API. Are you sure you have access to the app ${pd_config.app}? Try running pagedraw login`);

                if (err || resp.statusCode != 200)
                    utils.abort('Unable to fetch data from the Pagedraw API. Are you connected to the internet?');

                var app;
                try { app = JSON.parse(body); }
                catch (err) { throw new Error('Pagedraw API returned bad JSON.'); }

                console.log(`Pulling docs from app ${app.name}`);
                let docs = app.pages;
                docs.forEach((doc) => {
                    console.log(`Starting to sync doc ${doc.url}`);
                    pdSyncer.syncPagedrawDoc(doc);
                });
            });
        });
    });

program
    .command('*', '', {noHelp: true})
    .action(function(){
        program.outputHelp();
    });

// If user doesn't pass any arguments after the program name, just show help
if (process.argv.length <= 2)
    program.help();

const checkPackageInfo = (info) => {
    if (info.version != pkgJson.version || info.name != pkgJson.name)
        utils.abort(`Your Pagedraw CLI is out of date. Please run\n\tnpm install -g ${info.name}@${info.version}`);
};

if (process.env['ENVIRONMNET'] == 'development') {
    // For development we don't wanna be constrained by a version forced by the API
    program.parse(process.argv);
} else {
    // But in prod we ensure the CLI package version and name are up to date
    // before proceeding...
    pdAPI.onceCLIInfo((err, info) => {
        if (err && err.code == 'ENOTFOUND')
            utils.abort('Unable to verify that the Pagedraw CLI is up to date. Are you connected to the internet?');
        if (err)
            throw err;

        checkPackageInfo(info);

        // ... and we also listen to changes in the CLI info, aborting if the version
        // changes while we are in the middle of command
        pdAPI.watchCLIInfo(checkPackageInfo);

        // Start the Pagedraw CLI
        program.parse(process.argv);
    });
}

