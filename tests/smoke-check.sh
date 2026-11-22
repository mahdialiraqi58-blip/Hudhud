#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
node --check "$ROOT/web/classrooms.js"
node --check "$ROOT/web/role-dashboard.js"
node --check "$ROOT/functions/index.js"
node -e "const fs=require('fs'); const p='$ROOT/index.html'; const s=fs.readFileSync(p,'utf8'); const m=[...s.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/gi)]; for (const x of m) if(x[1].trim()) new Function(x[1]); console.log('Inline scripts: syntax OK ('+m.length+')')"
node -e "const r=require('$ROOT/database/database.rules.json'); if(r.rules.memberships['$'+'studentId']['.read']===undefined) throw Error('Missing membership index read rule'); if(r.rules['.read']!==false||r.rules['.write']!==false) throw Error('Root must remain closed'); console.log('RTDB rules structure: OK')"
echo 'Smoke checks passed. This does not emulate Firebase authorization or network behavior.'
