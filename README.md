# Aテック 帳票作成 PWA

スマホで見積書・納品書・請求書を作成・PDF出力するWebアプリ。

## 特徴
- スマホ完結（PWA、ホーム画面追加可、オフライン動作）
- 見積書 / 納品書 / 請求書 の3形式
- 電子印自動押印・インボイス登録番号・振込先自動挿入
- 取引先マスタ / 品名マスタ
- 発行履歴の一覧と再読込
- localStorage保存（端末内）+ JSONバックアップ
- サーバー不要・月額0円・データ送信なし

## デプロイ手順（GitHub Pages）

1. GitHubで新規リポジトリ `atech-quote` を作成（Public）
2. このフォルダ内のファイルをすべてアップロード
3. Settings → Pages → Source = `main` ブランチ / root を選択
4. 数十秒後に `https://<your-id>.github.io/atech-quote/` で公開

## ファイル構成

```
atech-quote/
├── index.html         # 画面
├── app.js             # ロジック
├── style.css          # スタイル
├── manifest.json      # PWA設定
├── service-worker.js  # オフライン対応
├── stamp_anzai.png    # 安西電子印
├── icon-192.png       # アプリアイコン
├── icon-512.png       # アプリアイコン
├── README.md          # このファイル
├── MANUAL.md          # 利用マニュアル（安西さん向け）
└── make_icons.py      # アイコン生成（再生成用）
```

## 既定値

- 会社名：Aテック
- 住所：福岡県鞍手郡小竹町勝野4053-1
- TEL：090-4485-0184
- 担当：安西
- 登録番号：T5810248089393
- 振込先：福岡銀行 黒崎支店 普通預金 2879217（安西 賢一郎）

これらは「⚙ 設定」から変更可能。

## ライセンス
内部利用のため非公開（GitHubではPublicでも実害なし。データはユーザー端末内にのみ保存）。
