# OFF MUSIC v2

2026-10-25、本人の実プレイ後の改修依頼。以前の無音起動・2入力・個人記録だけの仕様を、この依頼で更新する。

## 完成する経路

起動演出→最初のタップで音を有効化→Googleログインの利点/ゲスト選択→横画面→音源に合う低/中/高3種類の譜面→常時スコア・コンボ・早い/遅い判定→成績に応じたクリア演出→XP/レベル/称号/テーマ解放→招待グループ内の曲別/総合ランキングが他の画面でも即更新。

## 実装順

1. 音響解析・時計・打音を改修。既知のパーカッション信号で時刻誤差を数値化し、Play & Payを全曲再解析。音源の立ち上がりをグリッドへ移動しない。出力遅延、イベントの時刻、校正を分離する。
2. 低・中・高の3入力、早い/遅い/ms、コンボ/フィーバー、添付キャラクター、豪華な起動とクリア演出。横画面の固定グリッドでスクロールを防ぐ。
3. グループ、招待、音源共有、XP/称号/報酬。本人の明示操作でグループ内へ共有し、私有音源は従来どおり端末だけ。
4. D1に正規譜面の演奏チケットとリプレイを検証して保存。ランキングは通常譜面・1倍速。AI/調整/速度変更は練習扱い。単純な自己申告スコアはランキングへ入れない。
5. Durable ObjectsのWebSocket Hibernationでグループ内へ更新イベントを配信。曲・難易度別の自己ベストと総合順位を表示。メール/Google識別IDをグループへ公開しない。
6. 実ブラウザで複数画面・共有/非メンバー拒否・横画面寸法・校正・3種類・保存/重複送信・演奏完了を検証後、GitHubとCloudflareを更新する。

## 設計上の前提

- グループは招待コード制。メンバーは表示名を選ぶ。作成者が招待URLをコピーし、本人が配布する。
- XPと称号は遊びと選曲を続けた記録。利益は見た目のテーマ解放など、課金やランキング上の優遇を生じない。
- Webの自動音声再生制限を尊重し、最初のタップでサウンドを有効化する。
- Bluetoothなど機器の遅延を完全に消せるとはしない。校正と実測できた誤差を示す。
- Sunoは既存契約・既存クレジット内でのみ作曲を試す。追加契約や購入は行わない。利用・ダウンロード条件を確認してから同梱する。
- 添付キャラクターは本人の提供素材として使用。他社ゲームのロゴ/音声/キャラクター/譜面は流用しない。

## 調査

- [MDN output timestamp](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/getOutputTimestamp)：音が実際に出る時刻とperformance時計を対応づける。
- [MDN output latency](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/outputLatency)：出力装置の遅延。即時に鳴らした打音にもこの遅延がある。
- [Essentia onset detection](https://essentia.upf.edu/reference/std_OnsetDetection.html)：HFC、spectral flux、complex等で得意な音が違う。単一のBPMだけで正確な配置は決まらない。
- [Essentia beat detection](https://essentia.upf.edu/tutorial_rhythm_beatdetection.html)：テンポと各拍の時刻を区別し、曲全体から推定する。
- [公式の上達サポート](https://dondafulfestival-20th.taiko-ch.net/mode/play.php)：難易度・停止・速度変更で練習する体験を参照。独自の判定幅と演出を設計する。
- [Cloudflare WebSocket Hibernation](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)：待機中の常時CPU利用を避けながら更新を配信する。
- [Sunoの有料契約と利用権](https://help.suno.com/en/articles/9601665)、[ダウンロードの条件](https://help.suno.com/en/articles/13876865)：現行条件と既存アカウントの状態を確認する。

## 実装・検証完了

- 3msアタック検出、音声時計、入力イベント時刻、12タップ補正、速度の実時間判定。
- 3パッド、横向き停止、4サイズの画面内配置、フォーカス時のスクロール防止。
- 添付キャラクター、起動音/BGM/調律打音、FEVER/コンボ/早遅ms、フルコンボ/レベルアップ演出。
- XP/称号/バッジ/テーマ、Google/ゲストの利点と選択、招待グループ、R2限定共有。
- D1で打鍵の再判定、通常速度の標準譜面だけを曲/総合順位へ、DOで別画面へ更新通知。
- 実Workers AIの密度変更、実R2共有/再生、Suno/PlayPay全編、49試験と本番型検査/ビルド。

数値・証跡・実機未確認の範囲はAPP_STATUS.md。
