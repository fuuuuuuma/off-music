# v1の制作工程（履歴）

現行v2の計画は [V2_PLAN.md](V2_PLAN.md)、仕様は [APP_BRIEF.md](APP_BRIEF.md) を参照。以下は初回公開時の記録。

# 実装計画

1. 一次資料を調査し、観察と自作の設計を区別する。
2. Web Workerの音響解析、決定的な譜面生成、Web Audioの演奏時計と独自判定を実装する。
3. 曲ライブラリ・難易度・演奏・結果・設定の一本の経路を接続する。
4. 指定の6つのUI操作、無音起動演出、白Glassのレスポンシブ画面を仕上げる。
5. Googleのみの認証、D1による本人の記録、Workers AIによる数値からの譜面アレンジを接続する。
6. 型検査/核となる単体試験/ローカルAPIとD1/実ブラウザの通し操作/独立レビューで検証する。
7. GitHubへ公開、Cloudflareへデプロイし、公開URLで同じ経路を確認する。

## 技術と採用理由

| 技術 | 理由 |
| --- | --- |
| React + TypeScript | 演奏・シート・結果・非同期解析の状態を型付きで管理する。HTML主体のVite構成でSSRのCPUを使わない。 |
| Vite | 素早いローカル起動、静的な最適化ビルド、Workerの分割ができる。 |
| CSS + Motion | Glassの屈折感はCSS、出現/退場/ジェスチャーはMotion。reduced-motionにも対応する。 |
| Canvas 2D | 毎フレームのノーツ描画でReact再描画を避ける。解像度を制限しモバイルGPU負荷を抑える。 |
| Web Audio API | ブラウザの音声時計、音量/再生速度、打音合成、解析用デコードを一つにする。 |
| Web Worker + FFT | 音の立ち上がり・低域/高域・BPMを端末で算出する。無料CPU枠と音源のプライバシーを守る。 |
| IndexedDB（idb） | 大きな音源Blobと譜面を非同期に保存し、リロード後も使う。localStorageは設定の小さな初期値のみ。 |
| Hono + Zod | 小さいWorker API、入力の型/長さ/範囲の検証。 |
| Cloudflare Workers Static Assets | 静的配信は無料・無制限、APIだけWorkersを起動する。初期曲は25MiB未満の静的音声。 |
| D1 | セッション・本人の成績・AI予算をSQLiteで管理。複雑なファイルサーバーを不要にする。 |
| Workers AI Llama 3.1 8B FP8 fast | 短い数値の区間データから密度とアクセントを提案。入力・出力を制限し、演奏の精密タイミングは音響解析側が担う。 |
| Google Identity Services + jose | ログイン手段をGoogleのみにする。Google署名/iss/aud/exp/nonceをサーバー検証し、HttpOnly Cookieのランダムセッションを使う。 |
| Lucide | 一貫した小型SVGアイコン。 |
| Vitest | 譜面の決定性・判定・入力境界・アクセス制御を検証する。 |

R2は採用しない。曲を端末へ保存する要件なら、公開アップロードや保管料金・権利管理の複雑さが不要。課金プランへの変更もしない。
