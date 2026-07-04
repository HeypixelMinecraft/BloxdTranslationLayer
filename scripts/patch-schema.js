const fs = require('fs');
const path = require('path');

const schemaPath = path.resolve(__dirname, '..', 'node_modules', '@colyseus', 'schema', 'build', 'cjs', 'index.js');
if (!fs.existsSync(schemaPath)) {
  console.log('[patch-schema] @colyseus/schema CJS build not found - skipping');
  process.exit(0);
}

let code = fs.readFileSync(schemaPath, 'utf8');

// v3+ already handles refId errors gracefully (logs + skips, no throw)
if (code.includes('skipCurrentStructure')) {
  console.log('[patch-schema] v3+ Decoder detected - native skipCurrentStructure present, no patch needed');
  process.exit(0);
}

// v2: check if already patched (peekRefId = our custom skip)
if (code.includes('peekRefId')) {
  console.log('[patch-schema] Already patched - skipping');
  process.exit(0);
}

// v2: check if refId throw still exists
if (!code.includes('refId" not found')) {
  console.log('[patch-schema] refId error not found - no patch needed');
  process.exit(0);
}

// Patch v2: replace throw with skip logic
const regex = /if\s*\(\s*!nextRef\s*\)\s*\{[\s\S]*?throw new Error\("refId" not found: "\.concat\(refId\)\);/;
const match = code.match(regex);
if (!match) {
  console.log('[patch-schema] Found "refId not found" but pattern mismatch - please update patch-schema.js');
  process.exit(0);
}

const skipCode = `                if (!nextRef) {
                    // Gracefully skip unknown structures (continue from next known refId)
                    while (it.offset < totalBytes) {
                        if (bytes[it.offset] === SWITCH_TO_STRUCTURE) {
                            var peekIt = { offset: it.offset + 1 };
                            var peekRefId = number(bytes, peekIt);
                            if ($root.refs.has(peekRefId)) { break; }
                        }
                        it.offset++;
                    }
                    continue;
                }`;

code = code.replace(regex, skipCode);
fs.writeFileSync(schemaPath, code, 'utf8');
console.log('[patch-schema] v2 patched successfully');
