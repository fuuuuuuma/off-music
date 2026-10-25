# OFF MUSIC 3 — 2026-10-25 改修

本人の依頼：BPMと流速・音の同期、他人の追加曲も自動生成、ログインユーザー全員の公開曲、新着/人気/おすすめ、レベルによる鬼/テーマ/ステータスの解放。検証は歌詞付き。本人アカウントの演奏・追加曲をリセットし、以後QAは記録を汚さない。

1. 4拍ぶんの見える範囲をBPMで計算。曲速度と流速の相殺を除去。流速倍率は再生速度と独立、判定線到着は音声時計のnote.timeで固定。
2. 発音候補を拍/裏拍のまとまりで選び、早い弱音が本来の強拍を押し出さないようにする。音源中の時刻自体は動かさない。
3. Googleログイン全員の「みんなの曲」領域。投稿者が公開権を確認→端末DSP→音源/譜面を自動公開。他人はメタ情報を受信し、選曲時に同じ正規譜面を取得する。既存の限定曲を公開へ移さない。
4. プレイ完了数と新着を記録し、おすすめは未プレイ/レベル/新鮮さ/少ない露出を考慮。QAやリトライで回数を増やさない。
5. Lv.1から3難易度、Lv.5で鬼。Lv.2/3/5/8の見た目、音楽好き等のステータス、3人以上の順位で一度だけボーナスXP。APIでも解放を検証。
6. QAモードは音源/スコア/XPを保存しない。既存本人データはバックアップ後、対象本人だけをリセット。元のPlay & Payは保持。今後の改修後も検証用データを残さない。
7. 歌詞付きの複数速度/複数曲、2ユーザーの自動公開と共通譜面、解放前後、人気/おすすめ、再読込と失敗を検証。GitHub/Cloudflare更新。

調査：MDN AudioBufferSourceNode.playbackRate/getOutputTimestamp、Essentia multi-feature beat tracking/TempoTapDegara。BPM・発音時刻・表示速度・入力補正を分け、物理端末の未測定遅延とソフトウェアの検証値を混同しない。

実装・検証：全7工程を実施。64試験、歌詞付き別2曲とPlay & Pay 1.25倍の全編再生、D1 0004/0005とv3公開、本人データの復元可能リセット。詳細はAPP_STATUS。

公式資料：
- https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/getOutputTimestamp
- https://developer.mozilla.org/en-US/docs/Web/API/AudioBufferSourceNode/playbackRate
- https://essentia.upf.edu/reference/std_BeatTrackerMultiFeature.html
- https://essentia.upf.edu/reference/std_TempoTapDegara.html
- https://github.com/killercrush/music-tempo （MIT、BeatRoot/spectral fluxの軽量JS実装を採用）

Essentiaの説明は調査上の参考であり、そのコードやモデルを組み込んだとは主張しない。
