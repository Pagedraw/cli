module.exports.abort = abort = (message, error_code = 1) => {
    console.error(message);
    process.exit(error_code);
}
