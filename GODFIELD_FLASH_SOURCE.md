# GODFIELD Flash版からの移植物

デフォルト神器画像は、次のリポジトリに収録されているFlash版クライアント素材を移植しています。

- 移植元: https://github.com/Igoorx/godfield-flash
- 参照コミット: `fcc83740a3d3cd9968e6e5cd2b7ed781f53abe80`
- 移植元パス: `client-files/static.godfield.net/images/card/`
- 配置先: `frontend/public/godfield-flash/cards/`

画像は317ファイルを元の分類とファイル名を保ったまま収録しています。現行の神器名とFlash版の内部画像名が異なるものは、神器種別・性能・元データ上の並びを使って対応付けています。対応表は `scripts/godfieldFlashImages.mjs` です。

画像素材の移植は、本リポジトリおよび素材の作者であるユーザー本人から、この開発セッションで明示された許可に基づきます。

効果音は同じ参照コミットの `client-files/static.godfield.net/sounds/` から、MP3全46ファイルを `frontend/public/godfield-flash/sounds/` へ移植しています。一覧は `shared/flashSounds.json` です。

移植元の `server-src/` は GNU Affero General Public License v3.0 です。ゲーム挙動の移植では同コードをそのまま収録せず、挙動を参照して本リポジトリのNode.js実装へ適合させます。
