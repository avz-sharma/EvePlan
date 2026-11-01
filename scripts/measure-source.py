"""Inventory authored source size, decision counts, documentation and exact clones."""

import ast
from collections import defaultdict
import json
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
files = [*root.glob('backend/app/**/*.py'), *root.glob('frontend/src/**/*.ts'), *root.glob('frontend/src/**/*.tsx')]
files = [p for p in files if not p.name.endswith('.d.ts') and '__tests__' not in p.parts and '.test.' not in p.name]
report = {'files': [], 'functions': [], 'missing_docs': []}
windows = defaultdict(list)
total = 0
for path in sorted(files):
    source = path.read_text(encoding='utf-8-sig')
    relative = path.relative_to(root).as_posix()
    lines = source.splitlines()
    report['files'].append({'file': relative, 'lines': len(lines)})
    meaningful = [(i+1, line.strip()) for i, line in enumerate(lines) if line.strip() and not line.lstrip().startswith(('#', '//', '*', 'import ', 'from '))]
    total += len(meaningful)
    for i in range(len(meaningful)-7):
        chunk = meaningful[i:i+8]
        text = '\n'.join(line for _, line in chunk)
        if len(text) >= 200:
            windows[text].append((relative, tuple(n for n, _ in chunk)))
    if path.suffix != '.py':
        continue
    tree = ast.parse(source)
    if not ast.get_docstring(tree):
        report['missing_docs'].append(relative + ':module')
    for node in ast.walk(tree):
        if isinstance(node, (ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)) and not node.name.startswith('_') and not ast.get_docstring(node):
            report['missing_docs'].append(f'{relative}:{node.lineno}:{node.name}')
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        def complexity(n):
            score = isinstance(n, (ast.If, ast.IfExp, ast.For, ast.AsyncFor, ast.While, ast.ExceptHandler, ast.comprehension))
            if isinstance(n, ast.BoolOp):
                score += len(n.values)-1
            return int(score) + sum(complexity(child) for child in ast.iter_child_nodes(n) if not isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda)))
        def nesting(n, depth=0):
            next_depth = depth + int(isinstance(n, (ast.If, ast.For, ast.AsyncFor, ast.While, ast.Try, ast.With, ast.AsyncWith)))
            return max([next_depth, *[nesting(c, next_depth) for c in ast.iter_child_nodes(n)]])
        report['functions'].append({'file': relative, 'name': node.name, 'line': node.lineno, 'lines': node.end_lineno-node.lineno+1, 'complexity': 1+complexity(node), 'nesting': nesting(node)})
duplicates = [group for group in windows.values() if len(group)>1]
duplicated = {(p, n) for group in duplicates for p, nums in group for n in nums}
report['duplication'] = {'method': 'exact normalized eight nonblank-line windows, minimum 200 characters, excluding comments/imports', 'duplicated_lines': len(duplicated), 'source_lines': total, 'percent': round(100*len(duplicated)/total, 2), 'groups': duplicates}
(root / f'docs/measurements/{sys.argv[1]}-source.json').write_text(json.dumps(report, indent=2))
print('Oversized files:', [f for f in report['files'] if f['lines']>300])
print('Complex functions:', sorted([f for f in report['functions'] if f['complexity']>10 or f['lines']>40 or f['nesting']>3], key=lambda f: -f['complexity']))
print('Missing Python docs:', len(report['missing_docs']))
print('Duplication:', {k:v for k,v in report['duplication'].items() if k!='groups'})
