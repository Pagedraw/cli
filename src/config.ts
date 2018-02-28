import * as fs from "fs";
import * as path from "path";
import * as findup from "findup";
import { PagedrawConfig } from "./utils";

export function findPagedrawConfig(callback: (errorOrDir: Error | string, config?: PagedrawConfig) => void)
{
    return findup(process.cwd(), 'pagedraw.json', function (err, dir)
    {
        if (err)
        {
            return callback(new Error('Unable to find pagedraw.json in ancestor directories.'));
        }

        // Reads config files from pagedraw.json
        var config: PagedrawConfig;
        try
        {
            config = JSON.parse(fs.readFileSync(path.join(dir, 'pagedraw.json'), 'utf8'));
        }
        catch (err)
        {
            return callback(new Error('Error reading pagedraw.json. Is the file formatted correctly?'));
        }

        return callback(dir, config);
    });
}
