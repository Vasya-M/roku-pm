## how to add to project
1. in `package.json` add `"roku-pm": "^1.0.4"` to `"devDependencies"`
2. in `bsconfig.json` add `"roku-pm"` to `"plugins"` array, example  
```
{   
    ...
    "plugins": ["@rokucommunity/bslint", "roku-pm"],
    ...
}
```

## how to setup/modify config for `roku-pm`
1. in `bsconfig.json` add `"roku-pm"` to config, example  


```
{   
    ...
    "plugins": ["@rokucommunity/bslint", "roku-pm"],
    "roku-pm": {
        "logFuncLocation": false
    },
    ...
}
```

config values:
| Property | Type | default | Description |
| -------- | ------- | ------  |  ------  |
| functionLogTemplate  | string | '?">> ${name}() ${location}"' | template or code that will be inserted after each function declaration, there are two placeholders: `${name}` - is function name, and `${location}` - is location where function is declared
| logAnonFunc | boolean | true | if true, then will add logs for anonymous functions 
| logFuncLocation | boolean | true | if true, then will add function location to log for common functions
| logAnonFuncLocation | boolean | true | if true, then will add function location to log for anonymous functions
| logReturn | boolean | false | if true, then will add logs before each return or before function body end
| logIfBlock | boolean | false | if true, then will add logs for each body of if/else blocks
| addImports    | string[] | [] | will add those list of scripts location (strings) to xml as `<script/>`, example: `"addFiles": ["pkg:/source/someFile.brs"]`
| addFiles    | {uri: string, file: string}[] | [] | will create files at specified locations, example: `"addFiles": [{uri:"pkg:/source/someFile.brs", "file": "sub helloWorld \n ?\"hello world\" \n end sub"}]`
| files    | string[] | ["**/*"] | list of files/directories(glob pattern) that should be processed, or ignored if use negative `!`, example `"files": ["include/this/**/*", "!ignore/this/**/*"]`

