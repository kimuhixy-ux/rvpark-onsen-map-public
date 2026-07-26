# rvpark-onsen-map (public)

全国のRVパーク（車中泊施設）・オートキャンプ場・温泉・道の駅・うどん店（香川県）を1枚の地図にプロットするPWA。サーバー不要の静的アプリ。

URL: https://kimuhixy.com/rvpark-onsen-map/ （https://rvpark-onsen-map-public.pages.dev/ でも同一内容を公開）

## このリポジトリについて

このリポジトリは公開用の静的ビルド成果物のみを含む。データ収集・地図アプリ本体の開発は非公開の別リポジトリで行い、そこから寺院データ等の非公開情報を除いた静的ファイル一式をこちらへ反映している。

## 使い方（iPhoneでホーム画面に追加）

1. 上記URLをSafariで開く
2. 共有ボタン（□に↑）をタップ
3. 「ホーム画面に追加」を選択

## 主な機能

- Leaflet.js + OpenStreetMapタイルによる地図表示
- RVパーク・オートキャンプ場・温泉・道の駅・うどん店（香川県）を色分けしたマーカー、クラスタリング対応
- 種別トグル・評価フィルタ・施設名検索
- 現在地ボタン
- オフライン対応（Service Worker）

地図データ © OpenStreetMap contributors
