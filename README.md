# NULE

株式会社仲山商事向けの運送業務管理システム。配車管理・請求書発行・単価管理・ドライバー給与計算を1つのDBで扱う。

- 本番: https://nule-seven.vercel.app
- mainブランチにpushすると自動でVercelにデプロイされる

## 技術スタック

- Next.js 16（App Router） / React 19 / TypeScript
- Tailwind CSS v4
- Supabase（Postgres）— サーバー側は `service_role` キーで直接アクセス
- 認証は自前実装のCookieセッション（Supabase Auth / NextAuthは不使用）
- Anthropic Claude API（日報OCR・単価表のAI取込）
- Vercelでホスティング

## セットアップ

```bash
git clone git@github.com:ananaanantsukasa0322-cmyk/nule.git
cd nule
npm install
cp .env.example .env.local
```

`.env.local` に実際の値を入れる。値はSupabaseダッシュボード（Project Settings > API）とAnthropic Consoleから取得する。値は管理者に直接確認すること（Slack等に平文で貼らない）。

```bash
npm run dev
```

[http://localhost:3000](http://localhost:3000) で起動する。

## 開発フロー

- `main` が本番相当（push即デプロイ）。作業は作業ブランチを切ってPull Requestにする
  ```bash
  git checkout -b feature/何かの変更
  # 変更 → commit
  git push -u origin feature/何かの変更
  ```
  GitHub上でPRを作成してレビュー後にmainへマージする
- デプロイ前チェック（commitする前に必ず）
  ```bash
  npx tsc --noEmit
  npx next build
  ```

## 知っておくべきこと

- **`app/api/dispatch-tool/route.ts` だけ特殊**: 配車管理画面（`/dispatch`）はReactページではなく、このAPIルートがHTML・CSS・JSをまるごと1つの巨大な文字列として返し、それをiframeで埋め込んでいる。普通のJSXとして編集できないので、文字列置換で正確に書き換える必要がある。
- DBのマイグレーション履歴は `supabase/migrations/` に初期スキーマしか残っていない。実テーブルはその後ダッシュボード上で直接変更されており、スキーマの正は常に実DB側。スキーマ変更が必要な場合はSupabase SQL Editorで実行し、わかる範囲でこのREADMEかコミットメッセージに残すこと。
- 配車実績（`schedules`）は常に**下ろし日（unload_date）基準**で集計・請求する。
- Supabase/PostgRESTは件数・並び順指定なしのクエリを黙って1000件に切り詰める。全件取得が必要な箇所は `lib/supabase-paginate.ts` の `fetchAllRows()` を使うこと。
