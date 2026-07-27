# RVパーク・温泉マップ PSEO運用手順

`data/spots.json` の地点データから、日英の事実情報ページを生成・検証するための手順書です。

## 構成

- `scripts/generate_pages.py`: 日英詳細、索引、sitemap、robotsを一括生成
- `scripts/validate_generated_pages.py`: 件数、SEO要素、JSON-LD、内部リンク、除外項目、OSM帰属を検証
- `templates/detail_ja.html` / `templates/detail_en.html`: 日英詳細テンプレート
- `templates/index_ja.html` / `templates/index_en.html`: 日英索引テンプレート
- `items/<slug>/index.html` / `en/items/<slug>/index.html`: 生成物

## URLとデータ方針

- 日本語: `/items/<id-name>/`
- 英語: `/en/items/<id-name>/`

地点IDをslugに含め、同名地点があっても一意にする。公開できる項目は施設名、種別、都道府県、緯度・経度、検証可能なウェブサイトURLに限定する。

次は静的ページ、meta、OGP、JSON-LD、索引へ出力しない。

- `rating` / `rating_count`
- `phone`
- `large_parking` / `parking_capacity` / `parking_area_m2`
- 営業時間、料金、利用条件、車中泊可否などの変動情報
- 外部サイトの紹介文や画像

## 英語データの扱いと将来の再処理

現時点では英語版アプリと英語施設名フィールドがない。英語ページは施設名を原表記のまま、種別と既存都道府県だけ英語化し、「地図アプリは日本語UI」と明示して日本語地図へリンクする。

後日英語化する際は、実装前に次を報告・確認してから再生成する。

1. `/en/index.html` または同等の英語アプリが追加されたか
2. `name_en`、`pref_en` 等の英語フィールドと充足率
3. 英語ページの「Japanese UI」注記を削除できる状態か
4. 英語詳細ページの地図リンクを `/en/?id=<id>` へ切り替えるか
5. 既存slugとURLを維持したまま本文・metadata・JSON-LDだけ更新できるか

英語化を検出しても、自動で翻訳を推測しない。データ内容を報告し、オーナー確認後にテンプレートと生成スクリプトを更新する。

## 構造化データ

全地点に安全な `Place` を使用し、`geo: GeoCoordinates` と施設種別の `additionalProperty` を設定する。都道府県が存在する場合だけ `PostalAddress.addressRegion`、ウェブサイトが検証可能な場合だけ `sameAs` を追加する。全ページに `WebPage`、`WebSite`、`BreadcrumbList` を併記する。

## データ出所

詳細・索引の全ページに `© OpenStreetMap contributors` とODbLリンクを掲載する。情報がデータ提供時点のものであること、営業状況や利用可否は訪問前に確認すべきことを日英で明記する。

## AdSenseとService Worker

既存の `config.js` と `ads.js` を読み込み、本番ホストだけで既存publisher IDを使う条件を維持する。生成ページはService Workerの事前キャッシュ対象に追加しない。

## 更新・検証

```sh
python3 scripts/generate_pages.py
python3 scripts/validate_generated_pages.py
node --check js/app.js
git diff --check
```

生成物は手編集しない。同じ入力から2回生成し、ハッシュが一致することを確認する。

## 公開前チェック

- [ ] 日英それぞれ7,091ページ
- [ ] title、description、canonical、相互hreflangが一意
- [ ] JSON-LDが事実情報のみを含む
- [ ] 評価、電話、駐車場推定値を出力していない
- [ ] 英語ページに日本語UI注記がある
- [ ] OSM帰属・ODbLリンクが全ページにある
- [ ] sitemapが14,188 URLで重複なし
- [ ] `?id=` で該当マーカーが開く
- [ ] モバイル幅とデスクトップ幅で代表ページを目視確認
- [ ] git push前にオーナー承認を得る
