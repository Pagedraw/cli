#!/usr/bin/env node

var program = require('commander');
var syncPagedrawDoc = require('./file-syncer');
var pdAPI = require('./api');
var pdConfig = require('./config');
var utils = require('./utils');
var _ = require('lodash');

program
  .version('0.0.1')
  .usage('<command>');

program
  .command('login')
  .description('Authenticate to gain access to the Pagedraw API.')
  .action(function(env, options) {
	console.log('Logging into Pagedraw');
	pdAPI.pagedrawAPIAuthenticate((err, credentials) => {
	    if (err)
	        utils.abort(err.message);
	    console.log('Authentication succesfull.');
	});
  });

program
	.command('sync')
	.description('Continuosly sync remote Pagedraw docs with your git repository.')
	.action(function(env, options) {
		console.log('Starting Pagedraw sync server.');
        pdConfig.findPagedrawConfig((err, dir, pd_config) => {
            if (err)
                utils.abort(err.message);

            // Change our CWD into the same as the pagedraw config file
            process.chdir(dir);

            if (_.isEmpty(pd_config.app))
                utils.abort('pagedraw.json must contain an "app" field.');

            // Read all docs to be synced from the config file and watches changes on all of them
            pdAPI.getApp(pd_config.app, (err, resp, body) => {
                if (err || resp.statusCode != 200)
                    utils.abort('Unable to fetch data from Pagedraw API');

                let app = JSON.parse(body)[0];
                console.log(`Syncing docs from app ${app.name}`);

                let docs = app.pages;
                docs.forEach((doc) => {
                    console.log(`Syncing doc ${doc.url}`);
                    syncPagedrawDoc(doc.docserver_id);
                });
            });
        });
	});

program
	.command('*', '', {noHelp: true})
	.action(function(){
		program.outputHelp();
	});

program.parse(process.argv);

if (program.args.length === 0)
	program.help();
