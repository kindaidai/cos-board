# CoS ボード

CoS の台帳・報告と Herdr の状態を読み、今どのタスクが何を待っているかを表示するローカルのボードです。

Node.js 24 以上が必要です。依存パッケージやビルドはなく、`npm install` は不要です。

## 起動

ふだんは裏で起動します。CoS を立ち上げる `cos-up` もこれを呼ぶので、`cos-up` を使っていれば手で起動する必要はありません。

```sh
bin/cos-board-up          # 裏で起動する。もう動いていれば何もしない
bin/cos-board-up --stop   # 裏で起動したボードを止める
```

- `/api/board` がボードの応答を返せば起動済みとみなし、二重に起動しません
- ログと pid は `~/.local/state/cos-board/`（`board.log` と `board.pid`）に置きます。`COS_BOARD_STATE_DIR` で変えられます
- ポートは `COS_BOARD_PORT`（既定 `4270`）で変えます。そのほかの引数は `bin/cos-board-up -- --cos-root ...` のように `--` の後ろに書きます
- ポートを別のものが使っていると起動に失敗し、ログの末尾を表示します
- `--stop` で止められるのは `bin/cos-board-up` で起動したボードだけです。`npm start` で起動したものは、その端末で止めてください

端末の前面で動かすときは次のとおりです。

```sh
npm start
```

表示された `http://127.0.0.1:4270` をブラウザで開いてください。待ち受けは `127.0.0.1` だけです。ポートが使用中なら理由を表示して終了し、別ポートには自動移動しません。

```sh
npm start -- --port 4271 --cos-root ~/develop/.cos --herdr /path/to/herdr
```

| 引数 | 既定値 | 意味 |
| --- | --- | --- |
| `--port` | `4270` | 待ち受けポート。`0` ならOSが空きポートを割り当てる |
| `--cos-root` | `~/develop/.cos` | 台帳とタスクのディレクトリ |
| `--herdr` | `herdr` | Herdr CLI の実行ファイル。通常は PATH から探す |
| `--skill-path` | `~/.claude/skills/chief-of-staff/SKILL.md` | 判定表の更新を検出する読み取り専用の参照先 |

| 列 | 意味 |
| --- | --- |
| あなたの番 | ユーザーの判断・入力待ち。台帳外でも blocked のセッションはここに表示 |
| 作業中 | 主担当か同じ workspace の担当が作業中 |
| 外部待ち | レビュー・CIなどを待つ報告がある |
| 完了 | 完了の条件を満たすタスク、または workspace 消失後の片付け待ち |
| 迷子 | 台帳の記録に一致する主担当が見つからない |
| 台帳に無いセッション | 台帳・state.md が参照していない workspace |

下書きは上部に別表示します。要確認は状態を維持したまま列の先頭に寄せます。取得失敗は「なし」と区別して表示します。最新の報告は全依頼を通じた最後の状態報告ですが、状態判定に使うのは現在の依頼の報告だけです。

表示中は取得完了から3秒後に次の取得を開始します。別タブに移ると止まり、戻ると再取得します。5秒で応答しなければ最後の表示を薄く残して接続失敗を知らせ、引き続き再試行します。時刻の解釈・表示は日本時間です。

台帳・state.md・report.log・lead・cos.state は読み取り専用で、変更しません。symlinkや通常ファイルでない対象は開きません。Herdrへの操作はカードを押した際の `workspace focus <id>` だけです。IDの形式と現在の一覧を確認してから実行します。workspaceの記録が食い違うカードは開けません。

Herdr の `workspace list` と `agent list` は並列に呼び、それぞれ2秒で打ち切ります。同時の取得要求は共有し、取得完了から1秒間は結果を再利用します。Herdrが使える端末の環境で起動してください。利用できない場合も台帳の状態とエラーを表示します。

判定表の参照元は `~/.claude/skills/chief-of-staff/SKILL.md` の「1. 同期する」、2026-11-27 15:17 更新です。`## 1. 同期する` の見出し先頭から次の `## ` 見出し直前まで（末尾の空行・改行を含む）のUTF-8に対する節SHA-256は `345f941c34f404f40eb9e43031e9e6a7c62d9994ccd4f04492a38759f678b799` です。HTTP取得ごとに確認し、変更または読み取り失敗があれば画面上部に警告します。本文はファイルの更新情報が変わったときだけ読み直します。

**SKILL.md が変わったら判定表と突き合わせ直してください。** 判定とテストを更新したうえで、以下のコマンドの出力を `src/contract.js` の `SYNC_SECTION_SHA256` とこのREADMEへ転記します。SKILL.mdには書き込みません。

```sh
node --input-type=module -e 'import {readFileSync} from "node:fs"; import {homedir} from "node:os"; import {hashSyncSection} from "./src/parse/skill-section.js"; console.log(hashSyncSection(readFileSync(homedir()+"/.claude/skills/chief-of-staff/SKILL.md", "utf8")).value);'
```

同じ入力に対する状態判定を合わせています。CoSが行う送達の更新・画面を読む調査・台帳の更新は行いません。

テストは実物の CoS や Herdr を使いません。

```sh
npm test
```

フィクスチャだけで画面を確認できます。ここでのfocusは偽物のCLIにだけ届きます。

```sh
npm start -- --port 0 --cos-root test/fixtures/cos --herdr test/fixtures/fake-herdr.js --skill-path test/fixtures/chief-of-staff.md
```

表示されたURLの `/api/board` でJSONを確認できます。偽物のCLIは `FAKE_HERDR_FAIL=all` で失敗、`FAKE_HERDR_DELAY=2500` でタイムアウトを再現できます。

手動確認: 明暗・狭い画面での横スクロール、文字選択中はfocusしないこと、非表示からの復帰、サーバー停止後の接続失敗表示と再起動後の復帰を確認してください。
