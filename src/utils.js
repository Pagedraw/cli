module.exports.abort = abort = (message, error_code = 1) => {
    console.error(message);
    process.exit(error_code);
};

const VERBOSE = process.env['VERBOSE'] || false;
module.exports.log = log = (message) => {
    if (VERBOSE)
        console.log(message);
};
