var fs = require('fs');
var path = require('path');
var findup = require('findup');

module.exports.findPagedrawConfig = findPagedrawConfig = (callback) => {
    findup(process.cwd(), 'pagedraw.json', function(err, dir) {
        if (err)
            return callback(new Error('Unable to find pagedraw.json in ancestor directories.'));

        // Reads config files from pagedraw.json
        var config;
        try {
            config = JSON.parse(fs.readFileSync(path.join(dir, 'pagedraw.json'), 'utf8'));
        } catch (err) {
            return callback(new Error('Error reading pagedraw.json. Is the file formatted correctly?'));
        }

        return callback(null, dir, config);
    });
};
