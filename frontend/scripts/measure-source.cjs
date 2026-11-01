const ts = require('typescript');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const files = fs.readdirSync(path.join(root, 'frontend/src'), {recursive:true}).filter(p=>/\.(ts|tsx)$/.test(p) && !/(__tests__|\.test\.|\.d\.ts$)/.test(p));
const result = {functions:[], missing_docs:[], suppressions:[]};
for (const file of files) {
  const text = fs.readFileSync(path.join(root, 'frontend/src', file),'utf8');
  const tree = ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true);
  function visit(node) {
    if (ts.isFunctionLike(node) && node.body) {
      let complexity = 1, nesting = 0;
      function count(n, depth=0) {
        if (n !== node && ts.isFunctionLike(n)) return;
        const branch = ts.isIfStatement(n)||ts.isForStatement(n)||ts.isForOfStatement(n)||ts.isWhileStatement(n)||ts.isCatchClause(n)||ts.isConditionalExpression(n)||ts.isCaseClause(n);
        const binary = ts.isBinaryExpression(n)&&[ts.SyntaxKind.BarBarToken,ts.SyntaxKind.AmpersandAmpersandToken,ts.SyntaxKind.QuestionQuestionToken].includes(n.operatorToken.kind);
        complexity += Number(branch||binary);
        nesting = Math.max(nesting,depth+Number(branch));
        ts.forEachChild(n,c=>count(c,depth+Number(branch)));
      }
      count(node);
      const line = tree.getLineAndCharacterOfPosition(node.getStart()).line+1;
      const lines = tree.getLineAndCharacterOfPosition(node.end).line+2-line;
      result.functions.push({file:'frontend/src/'+file.replaceAll('\\','/'),name:node.name?.getText(tree)||node.parent.name?.getText(tree)||'<callback>',line,lines,complexity,nesting});
    }
    if ((ts.isFunctionDeclaration(node)||ts.isVariableStatement(node)) && node.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword) && !node.jsDoc?.length) result.missing_docs.push({file,line:tree.getLineAndCharacterOfPosition(node.getStart()).line+1,name:node.name?.getText(tree)||node.declarationList?.declarations.map(d=>d.name.getText(tree)).join(',')});
    ts.forEachChild(node,visit);
  }
  visit(tree);
}
fs.writeFileSync(path.join(root,`docs/measurements/${process.argv[2]}-frontend-source.json`),JSON.stringify(result,null,2));
console.log(JSON.stringify({complex:result.functions.filter(f=>f.complexity>10||f.lines>40||f.nesting>3).sort((a,b)=>b.complexity-a.complexity),missing_docs:result.missing_docs.length},null,2));
