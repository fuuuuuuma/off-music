# キャラクター素材

- offscreen-logo.png / play-pay.png：2026-10-25に本人がゲームでの使用・アニメーションを指定して提供した画像。
- offscreen-sprites.png：内蔵Imagegenでplay-pay.pngの4キャラクターを背景透過したアトラス。元画像は保持。ゲームではSVGのviewBoxで各キャラクターを表示し、CSSと演奏状態でアニメーションする。
- ソースコードMITの対象に画像の再利用権は含めない。

## 使用したプロンプト

Use case: background-extraction. Asset type: transparent game character sprite atlas. Input image 1 is the edit target: a user-owned PLAY & PAY illustration with a black-haired cartoon boy in white shirt and blue jeans, an orange letter O with a camera, an orange letter F with a laptop, and an orange letter F with a red megaphone. Extract these EXACT FOUR characters, preserve their identities, facial features, clothing, colors, bold black outlines and white sticker outlines, poses and props. Remove the entire city, road, title, header, all lettering outside the characters, shadows, and all backgrounds. Arrange as a clean 2-by-2 sprite atlas on a truly transparent square canvas. Exactly four equal cells: top-left boy, top-right O with camera, bottom-left F with laptop, bottom-right F with megaphone. Center each whole character in its cell with generous transparent margins, feet and hands fully inside its cell, consistent visual height. Do not add names, labels, frames, shadows, extra characters, text, or panels. The requested change is background removal and atlas arrangement only, keep the characters faithfully the same.
