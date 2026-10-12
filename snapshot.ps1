# سكربت حفظ نسخة احتياطية قبل أي تغيير
# الاستخدام: .\snapshot.ps1 -Comment "وصف التغيير"
param([string]$Comment = "نسخة يدوية")
$date = Get-Date -Format "yyyy-MM-dd_HH-mm"
$safe = ($Comment -replace '[\\/:*?"<>| ]','-').Substring(0, [Math]::Min(40, $Comment.Length))
$dir = "snapshots/${date}_${safe}"
New-Item -ItemType Directory -Force -Path $dir | Out-Null
Copy-Item "index.html" -Destination "$dir/" -ErrorAction SilentlyContinue
Copy-Item "quiz.html" -Destination "$dir/" -ErrorAction SilentlyContinue
Copy-Item "book.html" -Destination "$dir/" -ErrorAction SilentlyContinue
Copy-Item "SNAPSHOTS.md" -Destination "$dir/" -ErrorAction SilentlyContinue
$stamp = Get-Date -Format "yyyy-MM-dd HH:mm"
$entry = "`r`n## $stamp — $Comment`r`n- مجلد الاسترجاع: ``$dir/```r`n"
Add-Content "SNAPSHOTS.md" $entry
git add index.html quiz.html book.html SNAPSHOTS.md snapshot.ps1 2>$null
git commit -m "snapshot ${stamp}: ${Comment}" 2>&1 | Write-Output
Write-Output "Saved snapshot: $dir"
