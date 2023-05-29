import { CompilerPlugin, ProgramBuilder, ExpressionStatement,isAAMemberExpression,isAssignmentStatement, isCallExpression,isExpressionStatement, FunctionExpression,XmlFile, Program, BeforeFileTranspileEvent, isNamespaceStatement, isFunctionStatement, isFunctionType, isBrsFile, WalkMode, createVisitor, Parser, TokenKind, Body, NewExpression, ParseMode, isXmlFile, Position, CallExpression, isBlock } from 'brighterscript';
import { SGScript } from 'brighterscript/dist/parser/SGTypes';
import * as micromatch from 'micromatch';

// plugin factory
export class RokuPmPlugin implements CompilerPlugin {

    public name = 'roku-pm';
    public config;
    
    private isCustomFuncLogDefined = false;

    beforeProgramCreate(builder: ProgramBuilder) {
        let userConfigOverride = builder.options["roku-pm"] || {};
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
                let fileName = event.file.pkgPath
                let isMatch = micromatch.match(fileName, filesToProcess).length > 0 && micromatch.not(fileName, filesToIgnore).length === 0;
                if (!isMatch) { continue }

                let funcDeclLine = func.range.start.line + 1;
                let funcLocation = `${fileName}:${funcDeclLine}`;
                let funcName = func.functionStatement?.getName(ParseMode.BrighterScript);
                if (funcName == undefined) {
                    if (this.config.logAnonFunc != true) { continue }
                    funcName = this.getAnonFuncName(func)
                }

                let needAdLocation = (this.config.logFuncLocation || (funcName === undefined && this.config.logAnonFuncLocation));
                if ( !this.isCustomFuncLogDefined && needAdLocation) {
                    funcLocation = "at " + funcLocation;
                }

                let insertIndex = 0
                if (funcName.toLowerCase() === "new"){ insertIndex = this.findSuperPlace(func) + 1; }
                
                let funcLogData = {name: funcName, location: funcLocation}
                let statements = this.getStatementsFromCode(this.processStringTemplate(this.config.functionLogTemplate, funcLogData))
                event.editor.arraySplice(func.body.statements, insertIndex, 0, ...statements)

                let visitorCallbacks = {};
                
                if (this.config.logReturn) {
                    // add manually log to end of function body
                    event.editor.arrayPush(func.body.statements, ...this.getReturnLogStatements(funcLogData))
                    visitorCallbacks["ReturnStatement"] = (statement,parent, owner, key) => {
                        event.editor.arraySplice(owner, key, 0, ...this.getReturnLogStatements(funcLogData))
                   }
                }

                if (this.config.logIfBlock) {
                    visitorCallbacks["IfStatement"] = (statement,parent, owner, key) => {
                        let blockData = {fileName: fileName};
                        blockData["line"] = statement.thenBranch.range.start.line;
                        blockData["blockType"] = "if";
                        
                        event.editor.arraySplice(statement.thenBranch.statements, 0, 0, ...this.getBlockLogStatements(blockData))
                        
                        if (isBlock(statement.elseBranch)){
                            blockData["line"] = statement.elseBranch.range.start.line;
                            blockData["blockType"] = "else";

                            event.editor.arraySplice(statement.elseBranch?.statements, 0, 0, ...this.getBlockLogStatements(blockData))
                        }
                   }
                }

                Object.keys(visitorCallbacks).length && func.body.walk(createVisitor(visitorCallbacks), {
                    walkMode: WalkMode.visitStatements
                });
            }
        }
    }


    private findSuperPlace(func){
        for (let index = 0; index < func.body.statements.length; index++) {
            const element = func.body.statements[index];
            if (isExpressionStatement(element)) {
                let child:CallExpression = element.findChild(isCallExpression)
                let name = child?.callee["name"]?.text
                if (name.toLowerCase() === "super"){
                    return index;
                }
            }
        }
        return 0;
    }
    private getAnonFuncName(func){
        let parent = func.parent
        let subName = ""
        if (isAAMemberExpression(parent)) {
            subName = parent.keyToken.text.replaceAll('"',"")
        } else if (isAssignmentStatement(parent)){
            subName = parent.name.text
        }

        return `${subName}::anon`
    }
    private getReturnLogStatements(data){
        return this.getStatementsFromCode(this.processStringTemplate(this.config.returnLogTemplate, data))
    }
    private getBlockLogStatements(data){
        return this.getStatementsFromCode(this.processStringTemplate(this.config.blockLogTemplate, data))
    }
    private getStatementsFromCode(code){
        let parser = new Parser();
        parser.parse(code)
        return parser.ast.statements
    }
    private getDefaultConfig() {
        let config = {
            "functionLogTemplate": '?">> ${name}() ${location}"',
            "returnLogTemplate": '?"<< ${name}() ${location}"',
            "blockLogTemplate": '?" > ${blockType} block at line ${line}"', 
            "logReturn": false,
            "logIfBlock": false,
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