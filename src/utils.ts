import * as clc from "cli-color";

const VERBOSE = process.env['VERBOSE'] || false;

export function abort(message: string, error_code = 1)
{
    console.error(clc.red(message));
    return process.exit(error_code);
}

export function log(message: string)
{
    if (VERBOSE)
    {
        console.log('<log> ' + message);
    }
}

export function assert(fn: () => boolean) {
    if (!fn()) {
        abort('Assertion failed');
    }
}

export interface PagedrawConfig
{
    app: String;
    managed_folders?: string[];
}

export interface ErrorResult
{
    code: string;
}

export interface CliInfo
{
    version: string;
    name: string;
}
