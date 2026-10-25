CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT NOT NULL, picture TEXT, created_at INTEGER NOT NULL);
CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at INTEGER NOT NULL);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE TABLE results (id TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users(id), song_id TEXT NOT NULL, data TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(user_id,id));
CREATE INDEX results_user_time ON results(user_id,created_at DESC);
CREATE TABLE preferences (user_id TEXT PRIMARY KEY REFERENCES users(id), data TEXT NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE usage (scope TEXT NOT NULL, day TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(scope,day));
CREATE INDEX usage_day ON usage(day);
