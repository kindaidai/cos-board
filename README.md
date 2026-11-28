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
| `--terminal-app` | 起動した端末のアプリ | 開いたあとに前面に出すアプリの bundle ID。`none` で前面に出さない |

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

### 開いたあとにターミナルのアプリを前面に出す

「開く」と「pane を開く」が成功したら、Herdr が動いているターミナルのアプリを `open -b <bundle ID>` で前面に出し、そのまま入力できるようにします（macOS だけ）。`open` はアプリを起動・前面化するだけなので、アクセシビリティや自動操作の許可は要りません。

前面に出すアプリは次の順で決めます。

1. `--terminal-app <bundle ID>`
2. 環境変数 `COS_BOARD_TERMINAL_APP`
3. ボードを起動した端末のアプリ。macOS がアプリから起動したプロセスに渡す `__CFBundleIdentifier` を使います。Herdr の中で `cos-up` や `bin/cos-board-up` を実行していれば、Herdr を表示しているアプリ（iTerm2 なら `com.googlecode.iterm2`）になります

Herdr と別のアプリからボードを起動するときは 1 か 2 で指定してください（例: `com.apple.Terminal`、`com.mitchellh.ghostty`）。`none` を指定すると前面に出しません。bundle ID は `osascript -e 'id of app "Terminal"'` で調べられます。前面に出せなくても Herdr の中では移れているので、画面には成功として返し、理由はログに残します。起動時のログに、前面に出すアプリを 1 行表示します。

閉じたことを CoS には知らせません。CoS が自分で workspace の消失に気付きます。ボードは CoS のディレクトリに書き込みません。

Herdr の `workspace list` と `agent list` は並列に呼び、それぞれ2秒で打ち切ります。同時の取得要求は共有し、取得完了から1秒間は結果を再利用します。Herdrが使える端末の環境で起動してください。利用できない場合も台帳の状態とエラーを表示します。

判定表の参照元は `~/.claude/skills/chief-of-staff/SKILL.md` の「1. 同期する」、2026-11-28 13:14 更新です。`## 1. 同期する` の見出し先頭から次の `## ` 見出し直前まで（末尾の空行・改行を含む）のUTF-8に対する節SHA-256は `02644635386e4084614c86034fa2b05b43bbd1dd477e1d39243a57fdde7bae02` です。HTTP取得ごとに確認し、変更または読み取り失敗があれば画面上部に警告します。本文はファイルの更新情報が変わったときだけ読み直します。

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

## あなたの番と問いの表示

警告の下の「あなたの番」には、未回答の問い、`blocked` の許可の確認、
台帳の次の一手が「ユーザー:」「あなた:」（全角コロンも可）の作業、
全依頼を通じた最新の状態報告が `need-user` の作業を、待ちはじめの古い順に並べます。
一覧の題の下には問いと選択肢を表示し、推奨の選択肢を強調します。カードの問いの枠でも同じ選択肢を確認できます。
`## 問い` がない ask は冒頭の本文段落を問いとして表示します。
次の一手・報告・台帳の「あなた待ち」は1タスクにつき最大1行です。
既存の問いを参照する文面は重ねて出しません。回答は CoS の画面で行ってください。
台帳に無いセッションの確認は、その pane で直接答えます。

問いは `tasks/<ID>/ask/` 直下の数字1〜4桁の `.md` だけを対象にします。
新しい番号から30件、各64KBまで、回答確認用の `brief.md` は1MBまで読みます。
省略・容量超過・読み取り失敗はカードに理由を表示します。
`brief.md` 全文と `state.md` の依頼の「中身」にある
`ask/1 への答え`、`ask/1.md への答え`、`ask/1・ask/2 への答え` を回答済みの印とします。
見出しまたは行頭（箇条書きとかぎ括弧を除く）だけを数え、文章途中の言及は数えません。
どちらも読めない場合は全件を未回答に倒します。問いの待ちはじめはファイルの更新時刻です。

規則11は、既存の規則0〜10gの結果が作業中・外部待ちで未回答の問いがあるとき、
カードを「あなたの番」に移します。要確認とバッジは保持し、
下書き・完了・迷子の列は動かしません。これはボード独自の規則です。
台帳の状態と異なれば「台帳は 作業中」などのバッジを表示します。

Herdr の `agent list` に `blocked` がある場合だけ、
`herdr agent read <pane_id> --source visible --lines 40 --format text` を自動で実行します。
ボタンを押さなくても読み取りが増えます。1回につき最大8件、各1.5秒までで、
サーバーの1秒キャッシュを共有します。IDを検査し、上限超過や失敗も一覧に残します。
確認文・最後の連番選択肢・直前8行を取り出し、画面は末尾40行、各300字までです。
許可の待ち時間は、同じ pane と `state_change_seq` をボードが最初に観測してからの下限で、
プロセス再起動でリセットされます。

「全文」「画面」は更新の外側にあるダイアログで開きます。
表示内容は開いた時点の写しです。待ちが解消しても閉じずにその旨を表示します。
問いを含むサンプルは次で起動できます（元の fixture とは別です）。

```sh
FAKE_HERDR_SET=turns npm start -- --port 0 --cos-root test/fixtures/cos-turns --herdr test/fixtures/fake-herdr.js --skill-path test/fixtures/chief-of-staff.md
```
