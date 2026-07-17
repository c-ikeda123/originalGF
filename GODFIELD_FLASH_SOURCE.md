# GODFIELD画像・効果音の参照元

## 現行版の基礎神器画像

基礎神器のうち、取引・武器・防具・指輪・防御雑貨・雑貨・奇跡の237種は、現行版公式Webクライアントの教典で名前と対応している画像を収録しています。

- 参照元: https://godfield.net/
- 取得日: 2026-07-18
- 参照先パス: `https://godfield.net/images/items/`
- 配置先: `frontend/public/godfield-current/images/items/`
- ID対応表: `scripts/godfieldCurrentImages.mjs`
- 再取得: `node scripts/download_current_card_images.mjs`

現行版の神器リストと旧Flash版の画像順は一致しないため、並び順ではなく神器IDごとに対応させています。守護神10種は名前と画像の対応が正しいFlash版画像を継続使用します。

## Flash版素材

戦闘UI、守護神、効果音などは次のFlash版クライアントから移植しています。

- 移植元: https://github.com/Igoorx/godfield-flash
- 参照コミット: `fcc83740a3d3cd9968e6e5cd2b7ed781f53abe80`
- 移植元パス: `client-files/static.godfield.net/`
- 画像配置先: `frontend/public/godfield-flash/`
- 旧画像対応表: `scripts/godfieldFlashImages.mjs`
- 効果音一覧: `shared/flashSounds.json`

参照先の `server-src/` は GNU Affero General Public License v3.0 です。ゲーム挙動は参照の上、本リポジトリのNode.js実装に適合させています。
