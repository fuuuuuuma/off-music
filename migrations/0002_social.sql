CREATE TABLE groups (id TEXT PRIMARY KEY, name TEXT NOT NULL, owner_id TEXT NOT NULL REFERENCES users(id), invite_code TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL);
CREATE TABLE members (id TEXT NOT NULL UNIQUE, group_id TEXT NOT NULL REFERENCES groups(id), user_id TEXT NOT NULL REFERENCES users(id), display_name TEXT NOT NULL, joined_at INTEGER NOT NULL, PRIMARY KEY(group_id,user_id));
CREATE INDEX members_user ON members(user_id,group_id);
CREATE TABLE group_songs (id TEXT PRIMARY KEY, group_id TEXT NOT NULL REFERENCES groups(id), creator_id TEXT NOT NULL REFERENCES users(id), title TEXT NOT NULL, artist TEXT NOT NULL, duration REAL NOT NULL, bpm REAL NOT NULL, analysis TEXT NOT NULL, content_hash TEXT NOT NULL, size INTEGER NOT NULL, media_key TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'uploading', created_at INTEGER NOT NULL, UNIQUE(group_id,content_hash));
CREATE INDEX group_songs_group ON group_songs(group_id,status,created_at);
CREATE TABLE progress (user_id TEXT PRIMARY KEY REFERENCES users(id), xp INTEGER NOT NULL DEFAULT 0, plays INTEGER NOT NULL DEFAULT 0, uploads INTEGER NOT NULL DEFAULT 0, max_combo INTEGER NOT NULL DEFAULT 0);
CREATE TABLE progress_events (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), kind TEXT NOT NULL, reference TEXT NOT NULL, xp INTEGER NOT NULL, max_combo INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, UNIQUE(user_id,kind,reference));
CREATE INDEX progress_events_daily ON progress_events(user_id,kind,created_at);
CREATE TRIGGER award_progress AFTER INSERT ON progress_events BEGIN
 INSERT INTO progress(user_id,xp,plays,uploads,max_combo) VALUES(NEW.user_id,NEW.xp,CASE WHEN NEW.kind='play' THEN 1 ELSE 0 END,CASE WHEN NEW.kind='upload' THEN 1 ELSE 0 END,NEW.max_combo)
 ON CONFLICT(user_id) DO UPDATE SET xp=xp+excluded.xp,plays=plays+excluded.plays,uploads=uploads+excluded.uploads,max_combo=MAX(max_combo,excluded.max_combo);
END;
CREATE TABLE plays (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), group_id TEXT, song_id TEXT NOT NULL, title TEXT NOT NULL, difficulty TEXT NOT NULL, duration REAL NOT NULL, speed REAL NOT NULL, chart_version TEXT NOT NULL, notes TEXT NOT NULL, ranked INTEGER NOT NULL, started_at INTEGER NOT NULL, finished_at INTEGER, result TEXT);
CREATE INDEX plays_user_time ON plays(user_id,started_at);
CREATE TABLE leaderboard (group_id TEXT NOT NULL, song_id TEXT NOT NULL, difficulty TEXT NOT NULL, user_id TEXT NOT NULL, score INTEGER NOT NULL, accuracy REAL NOT NULL, max_combo INTEGER NOT NULL, result_id TEXT NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY(group_id,song_id,difficulty,user_id));
CREATE INDEX leaderboard_song ON leaderboard(group_id,song_id,difficulty,score DESC);
UPDATE results SET song_id='play-pay', data=json_set(data,'$.songId','play-pay','$.title','Play & Pay') WHERE song_id='make-something';
