import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classifyPaths, parseFrontmatter, skillDirName } from '../src/skills.ts'
import { loadSeedAgents } from '../src/agents.ts'

test('classifyPaths finds SKILL.md files and Claude Code plugin manifests', () => {
  const { skills, plugins } = classifyPaths([
    'README.md',
    'skills/pdf/SKILL.md',
    '.claude/skills/review/SKILL.md',
    'SKILL.md',
    'docs/skill.md',
    'node_modules/x/skills/y/SKILL.md',
    'plugins/web/.claude-plugin/plugin.json',
    '.claude-plugin/plugin.json',
    '.claude-plugin/marketplace.json',
    'skills/pdf/SKILL.md.bak',
  ])
  assert.deepEqual(skills, ['skills/pdf/SKILL.md', '.claude/skills/review/SKILL.md', 'SKILL.md', 'docs/skill.md'])
  assert.deepEqual(plugins, ['plugins/web/.claude-plugin/plugin.json', '.claude-plugin/plugin.json'])
})

test('parseFrontmatter reads plain, quoted and folded values', () => {
  assert.deepEqual(parseFrontmatter('---\nname: pdf\ndescription: Extract text from PDFs\n---\n# PDF'), { name: 'pdf', description: 'Extract text from PDFs' })
  assert.deepEqual(parseFrontmatter('---\nname: "web-design"\ndescription: \'Build pages\'\n---\n'), { name: 'web-design', description: 'Build pages' })
  assert.deepEqual(parseFrontmatter('---\nname: x\ndescription: >\n  Line one\n  line two\nlicense: MIT\n---\n'), { name: 'x', description: 'Line one line two' })
  assert.deepEqual(parseFrontmatter('# No frontmatter'), { name: null, description: null })
})

test('skillDirName falls back to the folder, or the repo for a root SKILL.md', () => {
  assert.equal(skillDirName('skills/pdf/SKILL.md', 'repo'), 'pdf')
  assert.equal(skillDirName('SKILL.md', 'repo'), 'repo')
})

test('seed agent list is well formed', () => {
  const seeds = loadSeedAgents()
  assert.ok(seeds.length >= 10)
  for (const s of seeds) assert.match(s, /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/)
  assert.equal(new Set(seeds.map((s) => s.toLowerCase())).size, seeds.length)
})
