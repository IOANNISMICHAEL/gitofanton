-- Git of Anton schema. Keep indexes minimal: each index adds a row write per insert.
CREATE TABLE repos (
  id INTEGER PRIMARY KEY,            -- GitHub numeric repo id (databaseId)
  node_id TEXT NOT NULL,             -- GraphQL global id, used for batched star snapshots
  full_name TEXT NOT NULL,
  description TEXT, language TEXT, topics TEXT,   -- topics: JSON array
  license TEXT, homepage TEXT, avatar_url TEXT,
  stars INTEGER, forks INTEGER,
  created_at TEXT, pushed_at TEXT,
  is_fork INTEGER, is_archived INTEGER,
  category TEXT, readme_excerpt TEXT,
  flag_reason TEXT,
  enriched_at TEXT
);
CREATE INDEX repos_full_name ON repos(full_name);
CREATE TABLE daily_stats (
  repo_id INTEGER NOT NULL, day TEXT NOT NULL,      -- 'YYYY-MM-DD' UTC
  stars INTEGER, forks INTEGER, pushes INTEGER, issues INTEGER,
  PRIMARY KEY (repo_id, day)
) WITHOUT ROWID;
CREATE TABLE hn_mentions (
  hn_id INTEGER PRIMARY KEY, repo_full_name TEXT, title TEXT,
  points INTEGER, comments INTEGER, created_at TEXT
);
CREATE INDEX hn_repo ON hn_mentions(repo_full_name);
