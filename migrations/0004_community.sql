ALTER TABLE groups ADD COLUMN is_community INTEGER NOT NULL DEFAULT 0;
INSERT OR IGNORE INTO users(id,name,created_at) VALUES('system:off-music','OFF MUSIC',0);
INSERT INTO groups(id,name,owner_id,invite_code,created_at,is_community) VALUES('00000000-0000-4000-8000-000000000001','みんなの曲','system:off-music','community-no-invite',0,1);
INSERT OR IGNORE INTO members(id,group_id,user_id,display_name,joined_at) SELECT lower(hex(randomblob(16))),'00000000-0000-4000-8000-000000000001',id,'Player '||substr(lower(hex(randomblob(4))),1,6),CAST(strftime('%s','now') AS INTEGER)*1000 FROM users WHERE id NOT LIKE 'system:%';
CREATE TABLE leaderboard_v3 (group_id TEXT NOT NULL,song_id TEXT NOT NULL,difficulty TEXT NOT NULL,user_id TEXT NOT NULL,chart_version TEXT NOT NULL,score INTEGER NOT NULL,accuracy REAL NOT NULL,max_combo INTEGER NOT NULL,result_id TEXT NOT NULL,updated_at INTEGER NOT NULL,PRIMARY KEY(group_id,song_id,difficulty,user_id,chart_version));
CREATE INDEX leaderboard_v3_song ON leaderboard_v3(group_id,song_id,difficulty,chart_version,score DESC);
CREATE INDEX plays_discovery ON plays(group_id,song_id,finished_at,user_id);
CREATE TABLE reset_backups(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,created_at INTEGER NOT NULL,data TEXT NOT NULL);
CREATE TABLE reset_backup_items(reset_id TEXT NOT NULL REFERENCES reset_backups(id),table_name TEXT NOT NULL,row_id TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(reset_id,table_name,row_id));
