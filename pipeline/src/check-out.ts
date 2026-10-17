// File-count guard for the built site (PLAN v2 §2): Workers static assets allow 20,000 files per version.
import { assertFileCount } from './write-json.ts'

const dir = process.argv[2] ?? 'web/out'
const n = assertFileCount(dir)
console.log(`file-count guard: ${n} files under ${dir}`)
