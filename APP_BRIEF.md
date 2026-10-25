# OFF MUSIC 4 — 現行仕様

- 白いLiquid Glassと豪華な起動演出、提供OFFSCREENキャラクター、オリジナル起動音/BGM/クリア演出。
- スマホ横画面・スクロールなし。12分割の透視レーンと可変幅タップ/曲線スライド/フリック/同時押し/強調ノーツ。常時スコア/コンボ/ライフ/5判定/FAST/LATE/ms/FLICK。
- 発音時刻を丸めず、音声出力時計へ同期。BPMに応じ4拍の表示範囲、再生倍率に追従。流速は別設定。
- 3帯域アタック検出とmusic-tempoによるテンポ推定。拍の細分から強い発音を選音し、難易度密度を調整。
- 収録曲Play & Pay。Googleの追加は権利確認のうえ全ログインユーザーへ音源と正規解析を自動公開。端末のみも選択可能。既存限定グループは維持。
- 人気（完了累計）/新着/おすすめ（未プレイ・レベル・新鮮さ・露出のルール式）。WebSocket更新。
- 曲別/総合ユーザー順位。標準1倍速のみ。v3譜面は旧版の順位と別集計。
- EASY/NORMAL/HARD、Lv.5 EXPERT、Lv.8 MASTER。Lv.2/3/5/8の外見特典と音楽好き/選曲家/コンボメーカー等。
- 3人以上の順位で初表彰台25XP・初1位60XP、各本人1回。通常プレイ20〜80XP・曲追加30XP。
- QAモードは音源/記録/XP/人気を保存しない。本人の修正依頼ごとにテスト後リセット、提供曲を保持。復元可能。
- 検証は歌詞付き音源。BPM推定の半分/倍問題は練習用テンポ候補で補完。物理端末遅延は12タップ校正。
- React/TypeScript/Vite/Canvas/Web Audio/IndexedDB、Cloudflare Workers/D1/R2/DO/Workers AI、Google認証のみ。
- Pull to Refresh、Toast、Bottom Sheet、Swipe Action/取り消し、Autocomplete。
- GitHubとCloudflare公開。新規課金・他社ゲーム素材・譜面の転用なし。

理由と使い方はREADME、計画はV4_PLAN/REFERENCE_SEKAI、検証結果はAPP_STATUS。

- 指のdown/move/up/cancelを記録して共通エンジンで再判定。PCはA/S/D/J/K/L、Shift+キーがフリック。ロングは追従・終端判定あり。AP/FC・回復不可の失敗状態・成績別演出。
