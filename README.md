# OFF MUSIC

白いLiquid Glass UIの音楽ゲーム。曲を取り込み、丸は低音、菱形は高音で演奏します。

**[アプリを開く](https://off-music.pinpon-fuuma.workers.dev)**

初期収録：**MAKE SOMETHING. / OFFSKU**。提供者によるゲーム同梱・公開の許可を確認済みです。独自のノーツ・打音・グラフィック・譜面を使います。

## 使い方

1. 曲を選び、4つの難易度から選択してプレイ。
2. 右から流れる音符がHITラインに来たら、丸は左の低音パッド、菱形は右の高音パッドをタップ。
3. PCでは `F / J` が低音、`D / K` が高音。スペースで一時停止。
4. 「曲を追加」からMP3/M4A/WAV/MP4等を取り込み。最大50MB・10分。ブラウザがデコードできるコーデックに対応します。
5. Googleログイン後は成績・設定の同期とWorkers AIアレンジが使えます。

起動時は無音。曲はプレイ開始後にだけ流れます。手動補正、0.75/1/1.25倍速、音量、振動、動きを減らす設定に対応します。

音源と譜面はIndexedDBに保存され、サーバーへ送信しません。別の端末では同じ音源を取り込み直してください。ブラウザのデータ消去で端末の音源は消えるので、元ファイルは保管してください。

## 技術選定

| 技術 | 選定理由 |
| --- | --- |
| React・TypeScript | 曲、解析、演奏、結果、シートの状態を型付きで接続するため。 |
| Vite | SSRを使わず静的配信し、ブラウザ向けWorkerを分割するため。 |
| CSS・Motion | ガラスの質感と出現・退場・UIアニメーションを作り、OSの動きを減らす設定も尊重するため。 |
| DM Sans・Noto Sans JP | 英数字の太いタイトルと日本語UIの読みやすさを揃えるため。読み込めない場合はシステム書体を使います。 |
| Canvas 2D | 毎フレームのノーツをReactから分離し、スマホで滑らかに描画するため。 |
| Web Audio API | 音声の出力時計とノーツを同期し、打音、音量、速度を制御するため。 |
| Web Worker・FFT | 周波数の変化から立ち上がり、BPM、低域・高域を端末で解析するため。 |
| IndexedDB・idb | 音源Blob・譜面・成績をリロード後も端末に保持するため。 |
| Hono・Zod | 軽いCloudflare APIと、入力の長さ・数値範囲・集計の検証のため。 |
| Workers Static Assets | 静的な画面と初期音声を無料・無制限の静的配信へ載せるため。 |
| Cloudflare D1 | 本人の成績、設定、セッション、AI利用量をSQLiteで保存するため。 |
| Workers AI | 曲の数値特徴から区間ごとの密度とアクセントを生成するため。タイミングの精密処理は端末の音響解析が担当。 |
| Google Identity Services・jose | Googleだけのログインと、署名・iss・aud・exp・nonceのサーバー検証のため。 |
| Lucide | 一貫したSVGアイコンのため。 |
| Vitest・SQLite | 判定、解析、譜面、認証、ユーザー分離、予算、失敗経路を試験するため。 |

R2は使いません。個人音源を端末内に置くことで保管料金と公開アップロードの管理を減らします。Google基本プロフィール以外のAPI権限は求めません。

## 無料枠と上限

- 静的配信は無料・無制限。APIはWorkers Freeの100,000要求/日とCPU 10ms/要求が目安。
- D1のFree枠：読取500万行/日、書込10万行/日、ストレージ合計5GB。クラウド成績は本人ごとに最新300件を保持。
- Workers AIはアカウント全体で10,000 neurons/日の無料枠。本アプリでは**1人5回/日、全体30回/日**、入力を数値だけ、出力を240トークンに制限。生成失敗も回数に含みます。
- Llama 3.1 8B FP8 fastの公式単価では本アプリ単体の最大利用は無料枠より十分小さくなる見込みです。既存アプリと共有するアカウント全体の残量やPaidプランの超過課金を保証するものではありません。新規有料プランの契約は行いません。
- AIが使えない場合も、端末で生成した元の譜面でプレイできます。

料金・制限は2026-10-25確認。[Cloudflare料金](https://developers.cloudflare.com/workers/platform/pricing/)、[Workers AI料金](https://developers.cloudflare.com/workers-ai/platform/pricing/)。

## 開発

Node.js 24以上を推奨。

```sh
npm ci
npm run build
npm run db:local
npm run preview
```

`http://localhost:8797` が本番と同じ静的配信＋API。開発のホットリロードには別ターミナルで `npm run dev`（`http://localhost:5190`）。

```sh
npm test
npm run build
```

## 自分のCloudflareへ配置する場合

1. `wrangler.jsonc` のアカウントIDとアプリ名を自分のものに変更。
2. `npx wrangler login` → `npx wrangler d1 create off-music`。返るD1 IDを設定。
3. Google Cloudの専用プロジェクトでOAuthウェブクライアントを作成し、配信URLを許可済みJavaScriptオリジンへ追加。開発用は `http://localhost:8797` と `http://localhost:5190`。
4. `GOOGLE_CLIENT_ID` と `APP_ORIGIN` を設定。クライアントIDは公開値です。クライアントシークレットは使用しません。
5. `npm run db:remote` → `npm run deploy`。

他人のアカウントID・OAuthクライアント・音源をそのまま使わず、ご自身のものに差し替えてください。

## 調査・検証

参考作品の内部ソース・使用エンジン・判定幅は確認できません。公式に確認できた操作と、自作の設計は [REFERENCE_NOTES.md](REFERENCE_NOTES.md) に分けて記載しています。

設計と合格条件は [APP_BRIEF.md](APP_BRIEF.md)、工程は [APP_PLAN.md](APP_PLAN.md)、実際の確認結果と制限は [APP_STATUS.md](APP_STATUS.md) を参照してください。

コードはMIT。初期音源はこのライセンスの対象外です。[音源の権利](public/music/RIGHTS.md)。
