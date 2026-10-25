# 調査（2026-10-25）

## 観察したこと

公式の[演奏ゲーム紹介](https://dondafulfestival-20th.taiko-ch.net/mode/play.php)で、曲に合わせて和太鼓を演奏し、4つの難易度、複数の操作方式、停止と速度変更を伴う練習機能があることを確認した。[公式FAQ](https://dondafulfestival-20th.taiko-ch.net/qa/faq.php)も参照。アーケード版howtoはメンテナンスへ転送され、マニュアルPDFは取得できなかった。内部のソースコード・エンジン・実際の判定幅は公開資料から確認していない。

## 独自に設計すること

一般的な音楽ゲームとして、曲の時刻とノーツの目標時刻の差から入力を判定し、コンボ・精度・スコアに集計する。音声の時計を正として、毎フレームの画面位置を目標時刻から計算する。これは自作実装の設計で、既存ゲームの内部実装を説明したものではない。

音響解析は、PCM→周波数別の正の差分（spectral flux）→局所ピーク→周期自己相関→BPM/拍の位相→難易度別の音符という流れ。どんな曲にも正確な譜面を保証する方式ではないため、BPMとタイミングの補正を用意する。AIは少数の区間係数のみ生成し、音符の正確な時刻を任せない。

画面・打音・文字・ノーツは新規制作。丸い低音と菱形の高音、白いガラス、橙と紫、抽象リングを用い、キャラクター、和風装飾、ロゴ、既存譜面を複製しない。

## 一次資料

- [Web Audio output timestamp](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/getOutputTimestamp)：音の出力位置とperformance時計の対応。
- [Web Audio output latency](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/outputLatency)：出力遅延と互換性。
- [Cloudflare Static Assets料金](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/)：静的配信は無料・無制限、APIはWorkers枠。
- [Workers制限](https://developers.cloudflare.com/workers/platform/limits/)：Free 100,000 API要求/日、10ms CPU、アセット1ファイル25MiB。
- [Workers AI料金](https://developers.cloudflare.com/workers-ai/platform/pricing/)：アカウント全体で10,000 neurons/日の無料枠。Paidアカウントでは超過分が課金され得るので、本アプリにも小さい利用上限を設ける。既存サービスと共有する枠の完全保証ではない。
- [D1料金](https://developers.cloudflare.com/d1/platform/pricing/)：Free 読取500万行/日、書込10万行/日、5GB合計。
- [Google ID token検証](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token)：署名、発行者、対象client ID、有効期限、subによる識別。
- [Googleセットアップ](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid)：専用OAuthクライアントと許可済みオリジンが必要。
