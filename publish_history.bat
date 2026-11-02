@echo off
rem 탐지 이력(docs/data)을 GitHub 에 올려 사이트를 갱신한다.
cd /d "%~dp0"
git add docs
git commit -m "Update detection history" || (echo 변경 사항이 없습니다. & pause & exit /b)
git push
pause
