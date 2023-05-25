import { CompilerPlugin, ProgramBuilder, ExpressionStatement,isAAMemberExpression,isAssignmentStatement, isCallExpression,isExpressionStatement, FunctionExpression,XmlFile, Program, BeforeFileTranspileEvent, isNamespaceStatement, isFunctionStatement, isFunctionType, isBrsFile, WalkMode, createVisitor, Parser, TokenKind, Body, NewExpression, ParseMode, isXmlFile, Position, CallExpression } from 'brighterscript';
import { SGScript } from 'brighterscript/dist/parser/SGTypes';
import * as micromatch from 'micromatch';

// plugin factory
export class RokuPmPlugin implements CompilerPlugin {

    public name = 'roku-pm';
    public config;
    
    private isCustomFuncLogDefined = false;

    beforeProgramCreate(builder: ProgramBuilder) {
        let userConfigOverride = builder.options["roku-pm"] || {};
        // console.log("user defined config is " + JSON.stringify(userConfigOverride))
        this.config = Object.assign(this.getDefaultConfig(), userConfigOverride)
        this.isCustomFuncLogDefined = this.config.functionLogTemplate != this.getDefaultConfig().functionLogTemplate
    }

    beforeProgramTranspile(program, entries, editor) {
        let filesToCreate = this.config.addFiles;
        filesToCreate.forEach(fileObj => {
            program.setFile(fileObj.uri, fileObj.file);
        });
    }

    // transform AST before transpilation
    beforeFileTranspile(event: BeforeFileTranspileEvent) {
        if (isXmlFile(event.file)) {
            let scripts = []
            this.config.addImports.forEach(scriptUri => {
                let script = new SGScript()
                script.uri = scriptUri
                scripts.push(script)
            });

            if (scripts.length > 0) {
                if (event.file.ast.component?.scripts) {
                    event.editor.arrayPush(event.file.ast.component?.scripts, ...scripts)
                }
            }

        }

        if (isBrsFile(event.file)) {
            let filesToProcess = this.config.files.filter(pattern => !pattern.startsWith('!'));
            let filesToIgnore = this.config.files.filter(pattern => pattern.startsWith('!'));

            for (const func of event.file.parser.references.functionExpressions) {
                let filename = event.file.pkgPath
                let isMatch = micromatch.match(filename, filesToProcess).length > 0 && micromatch.not(filename, filesToIgnore).length === 0;
                if (!isMatch) { continue }

                let funcName = func.functionStatement?.getName(ParseMode.BrighterScript);
                let funcDeclLine = func.range.start.line + 1;
                let funcLocation = `${filename}:${funcDeclLine}`;
                if (funcName == undefined) {
                    if (this.config.logAnonFunc != true) { continue }
                    let parent = func.parent
                    let subName = ""
                    console.log("annon func name "+parent?.constructor.name)
                    if (isAAMemberExpression(parent)) {
                        subName = parent.keyToken.text.replaceAll('"',"")
                    } else if (isAssignmentStatement(parent)){
                        subName = parent.name.text
                    }

                    funcName = `${subName}::anon`
                }

                let needAdLocation = (this.config.logFuncLocation || (funcName === undefined && this.config.logAnonFuncLocation));
                if ( !this.isCustomFuncLogDefined && needAdLocation) {
                    funcLocation = "at " + funcLocation;
                }

                let parser = new Parser()
                parser.parse(this.processStringTemplate(this.config.functionLogTemplate, {name: funcName, location: funcLocation}))

                let insertIndex = 0
                if (funcName.toLowerCase() === "new"){
                    for (let index = 0; index < func.body.statements.length; index++) {
                        const element = func.body.statements[index];
                        if (isExpressionStatement(element)) {
                            let child:CallExpression = element.findChild(isCallExpression)
                            let name = child?.callee["name"]?.text
                            if (name.toLowerCase() === "super"){
                                insertIndex = index+1
                                break;
                            }
                        }
                    }
                }
                event.editor.arraySplice(func.body.statements, insertIndex, 0, ...parser.ast.statements)
            }
        }
    }

    private getDefaultConfig() {
        let config = {
            "functionLogTemplate": '?">> ${name}() ${location}"',
            "logAnonFunc": true,
            "logFuncLocation": true,
            "logAnonFuncLocation": true,
            "addImports": [], // example: ["pkg:/source/someFile.brs"]
            "addFiles": [], // example: [{uri:"pkg:/source/someFile.brs", "file": "sub helloWorld \n ?\"hello world\" \n end sub"}]
            "files": ["**/*.*"] // to ignore some files/folders, add '!' to glob pattern "!some/folder/**"
        };
        return config;
    }
    private processStringTemplate = (str, obj) => str.replace(/\${(.*?)}/g, (x, g) => obj[g]);
}

export default () => {
    return new RokuPmPlugin();
};