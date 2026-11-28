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
| 完了 | 閉じる前の片付けの依頼まで終わったタスク、または workspace 消失後の片付け待ち |
| 迷子 | 台帳の記録に一致する主担当が見つからない |
| 台帳に無いセッション | 台帳・state.md が参照していない workspace |

下書きは上部に別表示します。要確認は状態を維持したまま列の先頭に寄せます。取得失敗は「なし」と区別して表示します。最新の報告は全依頼を通じた最後の状態報告ですが、状態判定に使うのは現在の依頼の報告だけです。

`done` の報告で完了列に出すのは、現在の依頼が片付けの依頼のときだけです。片付けの依頼かどうかは、state.md の依頼の表で、その行の「中身」が `閉じる前の片付け` で始まるかで見分けます。作業の依頼の `done` は、CoS が片付けの依頼を送るまで作業中の列に置きます。

表示中は取得完了から3秒後に次の取得を開始します。別タブに移ると止まり、戻ると再取得します。5秒で応答しなければ最後の表示を薄く残して接続失敗を知らせ、引き続き再試行します。時刻の解釈・表示は日本時間です。

台帳・state.md・report.log・lead・cos.state は読み取り専用で、変更しません。symlinkや通常ファイルでない対象は開きません。

Herdr への操作は次の 3 つだけで、いずれもユーザーがカードやボタンを押したときに限ります。

- **開く**（`workspace focus <id>`）: カードを押したとき。IDの形式と現在の一覧を確認してから実行します。workspaceの記録が食い違うカードは開けません
- **pane を開く**（`agent focus <pane_id>`）: セッションの行を押したとき。pane ID の形式と、今の `agent list` でその workspace に居ることを確認してから実行します。見つからなければ開かず、workspace を開く動作にも切り替えません
- **閉じる**（`workspace close <id>`）: 台帳の状態が「完了」で、記録どおりの workspace が残っているタスクのカードにだけボタンを出します。「閉じる」を押すと「閉じる（確定）」と「やめる」に変わり、確定を押したときだけ実行します。実行の直前に台帳と Herdr の一覧を読み直し、条件を満たさなければ閉じません（409）。台帳に無いセッションや、完了以外のカードには出しません

セッションの行には名前・役割・リポジトリ・端末タイトル・状態を表示します。「主担当」は state.md の名前と pane に一致する担当、「隣の担当」は名前が `<タスク ID>-` で始まり、続きが 1 文字以上ある pane（主担当を除く）です。台帳に無いセッションには役割のラベルを付けません。リポジトリは cwd の末尾のディレクトリ名で、git は見ていません。cwd 全文は行のツールチップで読めます。行の「あなた待ち」は Herdr の `blocked` だけを指し、報告の `need-user` は含みません。報告によってカードが「あなたの番」にあっても、行に「あなた待ち」が付くとは限りません。

閉じたことを CoS には知らせません。CoS が自分で workspace の消失に気付きます。ボードは CoS のディレクトリに書き込みません。

Herdr の `workspace list` と `agent list` は並列に呼び、それぞれ2秒で打ち切ります。同時の取得要求は共有し、取得完了から1秒間は結果を再利用します。Herdrが使える端末の環境で起動してください。利用できない場合も台帳の状態とエラーを表示します。

判定表の参照元は `~/.claude/skills/chief-of-staff/SKILL.md` の「1. 同期する」、2026-11-27 16:56 更新です。`## 1. 同期する` の見出し先頭から次の `## ` 見出し直前まで（末尾の空行・改行を含む）のUTF-8に対する節SHA-256は `74bdcf49b79ba30181209f6c4049a16e7afca20dde81c82eeed05bc40b8658ec` です。HTTP取得ごとに確認し、変更または読み取り失敗があれば画面上部に警告します。本文はファイルの更新情報が変わったときだけ読み直します。

**SKILL.md が変わったら判定表と突き合わせ直してください。** 判定とテストを更新したうえで、以下のコマンドの出力を `src/contract.js` の `SYNC_SECTION_SHA256` とこのREADMEへ転記します。SKILL.mdには書き込みません。

```sh
node --input-type=module -e 'import {readFileSync} from "node:fs"; import {homedir} from "node:os"; import {hashSyncSection} from "./src/parse/skill-section.js"; console.log(hashSyncSection(readFileSync(homedir()+"/.claude/skills/chief-of-staff/SKILL.md", "utf8")).value);'
```

同じ入力に対する状態判定を合わせています。CoSが行う送達の更新・画面を読む調査・台帳の更新は行いません。

テストは実物の CoS や Herdr を使いません。

```sh
npm test
```

フィクスチャだけで画面を確認できます。ここでのfocusとcloseは偽物のCLIにだけ届きます。

```sh
npm start -- --port 0 --cos-root test/fixtures/cos --herdr test/fixtures/fake-herdr.js --skill-path test/fixtures/chief-of-staff.md
```

表示されたURLの `/api/board` でJSONを確認できます。偽物のCLIは `FAKE_HERDR_FAIL=all` で失敗、`FAKE_HERDR_DELAY=2500` でタイムアウトを再現できます。

blocked の行を確認するときは次のように起動します。

```sh
FAKE_HERDR_AGENTS="$(node -e 'const j=JSON.parse(require("fs").readFileSync("test/fixtures/agents.json","utf8"));j.result.agents[3].agent_status="blocked";console.log(JSON.stringify(j))')" npm start -- --port 0 --cos-root test/fixtures/cos --herdr test/fixtures/fake-herdr.js --skill-path test/fixtures/chief-of-staff.md
```

手動確認: 明暗・狭い画面での横スクロール、文字選択中はfocusしないこと、非表示からの復帰、サーバー停止後の接続失敗表示と再起動後の復帰を確認してください。pane の行を押すとその pane を開く要求になり、blocked の行が明暗どちらでも読めることも確認します。Tab で pane の行や「場所 N を開く」に移り Enter を押して、送信中・成功後・3 秒後の再描画でもフォーカスがそのボタンに残ることを確認してください。`FAKE_HERDR_FOCUS_FAIL=1` を付けて起動したときも、失敗の表示のあとにフォーカスが残ることを確かめます。フィクスチャでは実物の pane へは移動しません。
