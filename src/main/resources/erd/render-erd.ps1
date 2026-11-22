Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap(1700, 1150)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = 'AntiAlias'
$g.TextRenderingHint = 'AntiAliasGridFit'
$g.Clear([System.Drawing.ColorTranslator]::FromHtml('#f4f7fb'))
$ink = [System.Drawing.Brushes]::DarkSlateGray
$font = New-Object System.Drawing.Font('Consolas', 17)
$small = New-Object System.Drawing.Font('Segoe UI', 16)
$heading = New-Object System.Drawing.Font('Segoe UI', 23, ([System.Drawing.FontStyle]::Bold))
$title = New-Object System.Drawing.Font('Segoe UI', 34, ([System.Drawing.FontStyle]::Bold))
$pen = New-Object System.Drawing.Pen([System.Drawing.ColorTranslator]::FromHtml('#61748c'), 3)
function Box($x, $y, $name, $rows) {
    $h = 72 + $rows.Count * 34
    $g.FillRectangle([System.Drawing.Brushes]::White, $x, $y, 620, $h)
    $g.DrawRectangle($pen, $x, $y, 620, $h)
    $headerBrush = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#173957'))
    $g.FillRectangle($headerBrush, $x, $y, 620, 60)
    $g.DrawString($name, $heading, [System.Drawing.Brushes]::White, ($x+20), ($y+10))
    for ($i=0; $i -lt $rows.Count; $i++) { $g.DrawString($rows[$i], $font, $ink, ($x+18), ($y+70+$i*34)) }
    $headerBrush.Dispose()
}
function Edge($points, $left, $right) {
    for ($i=0; $i -lt $points.Count-1; $i++) {
        $g.DrawLine($pen, [int]$points[$i][0], [int]$points[$i][1], [int]$points[$i+1][0], [int]$points[$i+1][1])
    }
    $a=$points[0]; $b=$points[-1]
    $first = $points[1]; $last = $points[-2]
    $ax = [int]$a[0]+8; $ay = [int]$a[1]-30
    if ($first[0] -lt $a[0]) { $ax = [int]$a[0]-40 }
    if ($first[1] -gt $a[1]) { $ay = [int]$a[1]+8 }
    $bx = [int]$b[0]-65; $by = [int]$b[1]-30
    if ($last[0] -gt $b[0]) { $bx = [int]$b[0]+8 }
    $g.DrawString($left, $small, $ink, $ax, $ay)
    $g.DrawString($right, $small, $ink, $bx, $by)
}
$g.DrawString('NATJANG / ENTITY RELATIONSHIP DIAGRAM', $title, $ink, 70, 35)
$g.DrawString('Current persistence model | 2 entities | 2026-11-19', $small, $ink, 74, 105)
Box 70 180 'users / User' @('PK id : CHAR(36)', 'created_at : datetime', 'last_seen_at : datetime')
Box 970 180 'pages / Page' @('PK id : CHAR(36)', 'FK user_id : CHAR(36)', 'title : varchar(200)', '? content : LONGTEXT [editor JSON]', '? summary : LONGTEXT', '? summary_updated_at : datetime', '? summary_language : varchar(20)', '? summary_source_hash : varchar(64)', 'version : bigint [@Version]', 'created_at : datetime', 'updated_at : datetime')
Edge @(@(690,285),@(970,285)) '1' '0..*'
$g.DrawString('PAGE CONTENT / JSON SNAPSHOT', $heading, $ink, 70, 720)
$g.DrawString('segments: original text, input language and timestamps', $small, $ink, 70, 780)
$g.DrawString('translations: cached translations keyed by text and language', $small, $ink, 70, 820)
$g.DrawString('explanations: selected terms, context and selection marks', $small, $ink, 70, 860)
$g.DrawString('inputLanguage / userLanguage: editor language settings', $small, $ink, 70, 900)
$g.DrawString('PK = primary key    FK = foreign key    ? = nullable    1 / 0..* = one to zero or more', $small, $ink, 70, 1000)
$g.DrawString('JSON arrays are not separate tables. Existing legacy tables are not dropped automatically.', $small, $ink, 70, 1040)
$g.DrawString('Based on JPA mappings with Spring naming defaults; live database not inspected.', $small, $ink, 70, 1080)
$bmp.Save((Join-Path $PSScriptRoot 'natjang-erd.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose(); $pen.Dispose(); $font.Dispose(); $small.Dispose(); $heading.Dispose(); $title.Dispose()

