-- Agent toolbox (PLAN v2 §4): skills, MCP servers, agents, plugins.
-- Keep indexes minimal: each index adds a row write per insert (free tier: 100k rows written/day).
CREATE TABLE tools (
  id INTEGER PRIMARY KEY,
  type TEXT NOT NULL,                   -- skill | mcp | agent | plugin
  slug TEXT NOT NULL UNIQUE,            -- type-prefixed stable key, e.g. mcp/io.github.owner/server
  name TEXT NOT NULL,                   -- registry / skill name
  title TEXT, description TEXT,
  repo_url TEXT,                        -- source repository URL as declared
  repo_id INTEGER,                      -- repos.id once the GitHub repo is resolved
  repo_checked_at TEXT,                 -- last GitHub lookup of repo_url (re-checked weekly while unresolved)
  path TEXT,                            -- SKILL.md path inside the repo (skills)
  version TEXT,
  package TEXT, package_registry TEXT,  -- npm | pypi | ...
  remote INTEGER,                       -- MCP: offers a hosted (remote) endpoint
  website TEXT,
  agents TEXT,                          -- JSON array: agents it declares support for
  status TEXT,                          -- active | deprecated
  category TEXT,
  first_seen TEXT, source_updated_at TEXT,
  content_hash TEXT,                    -- fingerprint of the source record: unchanged → no write
  flag_reason TEXT
);
CREATE TABLE tool_downloads (
  tool_id INTEGER NOT NULL, week TEXT NOT NULL,  -- week = Monday, YYYY-MM-DD (UTC)
  downloads INTEGER,
  PRIMARY KEY (tool_id, week)
) WITHOUT ROWID;
