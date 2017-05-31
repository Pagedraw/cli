#!/usr/bin/env node

var program = require('commander');
var fs = require('fs');
var syncPagedrawDoc = require('./file-syncer');
var pdAuth = require('./auth');
var pdAPI = require('./api');
var _ = require('lodash');

program
  .version('0.0.1')
  .usage('<command>');

program
  .command('login')
  .description('Authenticate to gain access to the Pagedraw API.')
  .action(function(env, options) {
	console.log('Logging into Pagedraw');
	pdAuth.pagedrawAPILogin();
  });

program
	.command('sync')
	.description('Continuosly sync remote Pagedraw docs with your git repository.')
	.action(function(env, options) {
		// Reads config files from pagedraw.json
		const pd_config = JSON.parse(fs.readFileSync('pagedraw.json', 'utf8'));

		console.log('Starting Pagedraw dev server. Syncing all docs in app specified by pagedraw.json');

		if (_.isEmpty(pd_config.app)) {
			console.log('pagedraw.json must contain an "app" field');
			process.exit(1);
		}

		// Read all docs to be synced from the config file and watches changes on all of them
		pdAPI.getApp(pd_config.app, (err, resp, body) => {
			if (err || resp.statusCode != 200) {
				console.log('Unable to fetch data from Pagedraw API');
				process.exit(1);
			}

			let app = JSON.parse(body)[0];
			console.log(`Syncing docs from app ${app.name}`);

			let docs = app.pages;
			docs.forEach((doc) => {
				console.log(`Syncing doc ${doc.url}`);
				syncPagedrawDoc(doc.docserver_id);
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
