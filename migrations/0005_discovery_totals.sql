CREATE TABLE song_activity(group_id TEXT NOT NULL,song_id TEXT NOT NULL,user_id TEXT NOT NULL,plays INTEGER NOT NULL DEFAULT 0,last_played_at INTEGER NOT NULL,PRIMARY KEY(group_id,song_id,user_id));
INSERT INTO song_activity SELECT group_id,song_id,user_id,COUNT(*),MAX(finished_at) FROM plays WHERE group_id IS NOT NULL AND finished_at IS NOT NULL GROUP BY group_id,song_id,user_id;
CREATE TRIGGER song_activity_finish AFTER UPDATE OF finished_at ON plays WHEN OLD.finished_at IS NULL AND NEW.finished_at IS NOT NULL AND NEW.group_id IS NOT NULL BEGIN
INSERT INTO song_activity(group_id,song_id,user_id,plays,last_played_at) VALUES(NEW.group_id,NEW.song_id,NEW.user_id,1,NEW.finished_at) ON CONFLICT(group_id,song_id,user_id) DO UPDATE SET plays=plays+1,last_played_at=MAX(last_played_at,excluded.last_played_at);
END;
